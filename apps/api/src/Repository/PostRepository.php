<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Post;
use App\Entity\Tag;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\QueryBuilder;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Bridge\Doctrine\Types\UlidType;
use Symfony\Component\Uid\Ulid;

/**
 * times の投稿。一覧はすべて ULID の降順によるカーソル方式でページングする
 * （オフセット方式は新着が入るたびにページがずれるため使わない）。
 *
 * @extends ServiceEntityRepository<Post>
 */
class PostRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Post::class);
    }

    /**
     * 新着ロビー。全ユーザーの表示中の親投稿。
     *
     * @return array{items: list<Post>, nextCursor: ?string}
     */
    public function findLobbyPage(?Ulid $cursor, int $limit): array
    {
        $qb = $this->visibleParents();

        return $this->page($qb, $cursor, $limit);
    }

    /**
     * 部屋。その人の親投稿。削除・非表示になった親投稿も、
     * 返信が付いていればスレッドへの入口として「削除されました」の形で残す。
     *
     * @return array{items: list<Post>, nextCursor: ?string}
     */
    public function findRoomPage(User $author, ?Ulid $cursor, int $limit): array
    {
        $qb = $this->createQueryBuilder('p')
            ->addSelect('a')
            ->innerJoin('p.author', 'a')
            ->andWhere('p.author = :author')
            ->andWhere('p.parent IS NULL')
            ->andWhere('(p.deletedAt IS NULL AND p.hiddenAt IS NULL) OR p.replyCount > 0')
            ->setParameter('author', $author->getId(), UlidType::NAME);

        return $this->page($qb, $cursor, $limit);
    }

    /**
     * タグ別の新着。
     *
     * @return array{items: list<Post>, nextCursor: ?string}
     */
    public function findTagPage(Tag $tag, ?Ulid $cursor, int $limit): array
    {
        $qb = $this->visibleParents()
            ->andWhere(':tag MEMBER OF p.tags')
            ->setParameter('tag', $tag);

        return $this->page($qb, $cursor, $limit);
    }

    /**
     * スレッドの返信を古い順に。削除済みの返信は出さない。
     *
     * @return list<Post>
     */
    public function findReplies(Post $parent): array
    {
        return $this->createQueryBuilder('p')
            ->addSelect('a')
            ->innerJoin('p.author', 'a')
            ->andWhere('p.parent = :parent')
            ->andWhere('p.deletedAt IS NULL')
            ->setParameter('parent', $parent->getId(), UlidType::NAME)
            ->orderBy('p.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    public function findOneById(Ulid $id): ?Post
    {
        return $this->createQueryBuilder('p')
            ->addSelect('a')
            ->innerJoin('p.author', 'a')
            ->andWhere('p.id = :id')
            ->setParameter('id', $id, UlidType::NAME)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * 管理画面用。削除済み以外の全投稿（非表示・停止ユーザーの投稿を含む）を新しい順に。
     *
     * @return array{items: list<Post>, nextCursor: ?string}
     */
    public function findForModeration(?Ulid $cursor, int $limit, ?User $author = null): array
    {
        $qb = $this->createQueryBuilder('p')
            ->addSelect('a')
            ->innerJoin('p.author', 'a')
            ->andWhere('p.deletedAt IS NULL');

        if (null !== $author) {
            $qb->andWhere('p.author = :author')->setParameter('author', $author->getId(), UlidType::NAME);
        }

        return $this->page($qb, $cursor, $limit);
    }

    /**
     * 退会時に消す対象。
     *
     * @return list<Post>
     */
    public function findAllByAuthor(User $author): array
    {
        return $this->createQueryBuilder('p')
            ->andWhere('p.author = :author')
            ->andWhere('p.deletedAt IS NULL')
            ->setParameter('author', $author->getId(), UlidType::NAME)
            ->getQuery()
            ->getResult();
    }

    /**
     * 一覧に出す投稿のタグをまとめて読み込む（投稿ごとに lazy load すると N+1 になる）。
     *
     * @param list<Post> $posts
     */
    public function preloadTags(array $posts): void
    {
        $parentIds = [];
        foreach ($posts as $post) {
            if (!$post->isReply()) {
                $parentIds[] = $post->getId()->toRfc4122();
            }
        }
        if ([] === $parentIds) {
            return;
        }

        // 同じエンティティを tags 付きで取り直すと、Identity Map 上の既存インスタンスの
        // コレクションが初期化される
        $this->createQueryBuilder('p')
            ->addSelect('t')
            ->leftJoin('p.tags', 't')
            ->andWhere('p.id IN (:ids)')
            ->setParameter('ids', $parentIds)
            ->getQuery()
            ->getResult();
    }

    /**
     * スレッドへの返信を反映する。同時に返信されても数がずれないよう SQL で加算する。
     */
    public function incrementReplyCount(Post $parent, \DateTimeImmutable $at): void
    {
        $this->getEntityManager()->getConnection()->executeStatement(
            'UPDATE posts SET reply_count = reply_count + 1, last_reply_at = :at WHERE id = :id',
            ['at' => $at->format('Y-m-d H:i:s'), 'id' => $parent->getId()->toRfc4122()],
        );
    }

    public function decrementReplyCount(Post $parent): void
    {
        $this->getEntityManager()->getConnection()->executeStatement(
            'UPDATE posts SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = :id',
            ['id' => $parent->getId()->toRfc4122()],
        );
    }

    /**
     * 人気の部屋。過去 24 時間に「他人から」付いたリアクション数と返信数を部屋ごとに足し合わせる。
     * 定期バッチは作らず、エッジで5分キャッシュする前提でその場で集計する。
     *
     * @return list<array{author_id: string, score: int}>
     */
    public function findPopularRoomScores(int $limit): array
    {
        $sql = <<<'SQL'
            SELECT room.author_id, COUNT(*) AS score
            FROM (
                SELECT parent.author_id
                FROM reactions r
                JOIN posts p ON p.id = r.post_id
                JOIN posts parent ON parent.id = COALESCE(p.parent_id, p.id)
                WHERE r.created_at >= :since
                  AND r.user_id <> parent.author_id
                  AND parent.deleted_at IS NULL AND parent.hidden_at IS NULL
                UNION ALL
                SELECT parent.author_id
                FROM posts reply
                JOIN posts parent ON parent.id = reply.parent_id
                WHERE reply.created_at >= :since
                  AND reply.deleted_at IS NULL
                  AND reply.author_id <> parent.author_id
                  AND parent.deleted_at IS NULL AND parent.hidden_at IS NULL
            ) room
            JOIN users u ON u.id = room.author_id
            WHERE u.suspended_at IS NULL AND u.deleted_at IS NULL AND u.handle IS NOT NULL
            GROUP BY room.author_id
            ORDER BY score DESC
            LIMIT :limit
            SQL;

        /** @var list<array{author_id: string, score: int|string}> $rows */
        $rows = $this->getEntityManager()->getConnection()->fetchAllAssociative($sql, [
            'since' => (new \DateTimeImmutable('-24 hours'))->format('Y-m-d H:i:s'),
            'limit' => $limit,
        ]);

        return array_map(
            static fn (array $row): array => ['author_id' => $row['author_id'], 'score' => (int) $row['score']],
            $rows,
        );
    }

    /**
     * 各ユーザーの最新の親投稿日時。人気の部屋・会社・フォロー一覧で使う。
     *
     * @param list<string> $userIds RFC 4122 形式
     *
     * @return array<string, string> userId => 日時文字列
     */
    public function findLatestParentAtByAuthors(array $userIds): array
    {
        if ([] === $userIds) {
            return [];
        }

        $rows = $this->getEntityManager()->getConnection()->fetchAllAssociative(
            'SELECT author_id, MAX(created_at) AS latest FROM posts
             WHERE author_id IN (:ids) AND parent_id IS NULL AND deleted_at IS NULL AND hidden_at IS NULL
             GROUP BY author_id',
            ['ids' => $userIds],
            ['ids' => \Doctrine\DBAL\ArrayParameterType::STRING],
        );

        return array_column($rows, 'latest', 'author_id');
    }

    /**
     * 本文の検索。表示中の親投稿のうち、すべての語を含むもの（大文字小文字は区別しない）。
     * 件数が少ないうちは LIKE の全件走査で足りる。重くなったら pg_trgm の GIN インデックスを足す。
     *
     * @param list<string> $terms
     *
     * @return array{items: list<Post>, nextCursor: ?string}
     */
    public function findSearchPage(array $terms, ?Ulid $cursor, int $limit): array
    {
        $qb = $this->visibleParents();
        foreach ($terms as $i => $term) {
            $qb->andWhere(sprintf('LOWER(p.bodyMarkdown) LIKE :term%d', $i))
                ->setParameter('term'.$i, self::likePattern($term));
        }

        return $this->page($qb, $cursor, $limit);
    }

    /** LIKE の部分一致パターン。% と _ は文字として扱う。 */
    public static function likePattern(string $term): string
    {
        return '%'.addcslashes(mb_strtolower($term), '%_\\').'%';
    }

    /** 表示中の親投稿（ロビー・タグ用）。停止・退会したユーザーの投稿は出さない。 */
    private function visibleParents(): QueryBuilder
    {
        return $this->createQueryBuilder('p')
            ->addSelect('a')
            ->innerJoin('p.author', 'a')
            ->andWhere('p.parent IS NULL')
            ->andWhere('p.deletedAt IS NULL')
            ->andWhere('p.hiddenAt IS NULL')
            ->andWhere('a.suspendedAt IS NULL')
            ->andWhere('a.deletedAt IS NULL');
    }

    /**
     * ID の降順で limit 件を返す。1件多く取り、あふれたら次のカーソルを返す。
     *
     * @return array{items: list<Post>, nextCursor: ?string}
     */
    private function page(QueryBuilder $qb, ?Ulid $cursor, int $limit): array
    {
        if (null !== $cursor) {
            $qb->andWhere('p.id < :cursor')->setParameter('cursor', $cursor, UlidType::NAME);
        }

        /** @var list<Post> $rows */
        $rows = $qb->orderBy('p.id', 'DESC')
            ->setMaxResults($limit + 1)
            ->getQuery()
            ->getResult();

        $hasMore = count($rows) > $limit;
        $items = array_slice($rows, 0, $limit);
        $this->preloadTags($items);

        return [
            'items' => $items,
            'nextCursor' => $hasMore ? (string) $items[array_key_last($items)]->getId() : null,
        ];
    }
}
