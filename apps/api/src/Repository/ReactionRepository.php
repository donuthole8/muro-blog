<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Post;
use App\Entity\Reaction;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\Persistence\ManagerRegistry;

/**
 * リアクションの追加・削除は同時押しに耐えるよう、SQL で直接行い
 * 実際に行が増減したときだけ posts.reaction_count を動かす。
 *
 * @extends ServiceEntityRepository<Reaction>
 */
class ReactionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Reaction::class);
    }

    /** @return bool 新しく付いたなら true（既に付いていたなら false） */
    public function add(Post $post, User $user, string $emoji): bool
    {
        $conn = $this->getEntityManager()->getConnection();

        return $conn->transactional(static function () use ($conn, $post, $user, $emoji): bool {
            $inserted = $conn->executeStatement(
                'INSERT INTO reactions (post_id, user_id, emoji, created_at) VALUES (:post, :user, :emoji, :now)
                 ON CONFLICT (post_id, user_id, emoji) DO NOTHING',
                [
                    'post' => $post->getId()->toRfc4122(),
                    'user' => $user->getId()->toRfc4122(),
                    'emoji' => $emoji,
                    'now' => (new \DateTimeImmutable())->format('Y-m-d H:i:s'),
                ],
            );

            if ($inserted > 0) {
                $conn->executeStatement(
                    'UPDATE posts SET reaction_count = reaction_count + 1 WHERE id = :id',
                    ['id' => $post->getId()->toRfc4122()],
                );
            }

            return $inserted > 0;
        });
    }

    /** @return bool 実際に外れたなら true */
    public function remove(Post $post, User $user, string $emoji): bool
    {
        $conn = $this->getEntityManager()->getConnection();

        return $conn->transactional(static function () use ($conn, $post, $user, $emoji): bool {
            $deleted = $conn->executeStatement(
                'DELETE FROM reactions WHERE post_id = :post AND user_id = :user AND emoji = :emoji',
                [
                    'post' => $post->getId()->toRfc4122(),
                    'user' => $user->getId()->toRfc4122(),
                    'emoji' => $emoji,
                ],
            );

            if ($deleted > 0) {
                $conn->executeStatement(
                    'UPDATE posts SET reaction_count = GREATEST(reaction_count - :n, 0) WHERE id = :id',
                    ['n' => $deleted, 'id' => $post->getId()->toRfc4122()],
                );
            }

            return $deleted > 0;
        });
    }

    /**
     * 投稿ごと・絵文字ごとの件数。最初に付いた順に並べる（Slack と同じ）。
     *
     * @param list<string> $postIds RFC 4122 形式
     *
     * @return array<string, list<array{emoji: string, count: int}>>
     */
    public function countByPosts(array $postIds): array
    {
        if ([] === $postIds) {
            return [];
        }

        $rows = $this->getEntityManager()->getConnection()->fetchAllAssociative(
            'SELECT post_id, emoji, COUNT(*) AS n, MIN(id) AS first_id FROM reactions
             WHERE post_id IN (:ids) GROUP BY post_id, emoji ORDER BY post_id, first_id',
            ['ids' => $postIds],
            ['ids' => ArrayParameterType::STRING],
        );

        $result = [];
        foreach ($rows as $row) {
            $result[$row['post_id']][] = ['emoji' => $row['emoji'], 'count' => (int) $row['n']];
        }

        return $result;
    }

    /**
     * 閲覧者自身が付けた絵文字。
     *
     * @param list<string> $postIds RFC 4122 形式
     *
     * @return array<string, list<string>> postId => 絵文字の一覧
     */
    public function findEmojisByUser(User $user, array $postIds): array
    {
        if ([] === $postIds) {
            return [];
        }

        $rows = $this->getEntityManager()->getConnection()->fetchAllAssociative(
            'SELECT post_id, emoji FROM reactions WHERE user_id = :user AND post_id IN (:ids) ORDER BY id',
            ['user' => $user->getId()->toRfc4122(), 'ids' => $postIds],
            ['ids' => ArrayParameterType::STRING],
        );

        $result = [];
        foreach ($rows as $row) {
            $result[$row['post_id']][] = $row['emoji'];
        }

        return $result;
    }

    /** 退会時。付けたリアクションを外し、相手の投稿のカウンタも戻す。 */
    public function removeAllByUser(User $user): void
    {
        $conn = $this->getEntityManager()->getConnection();
        $conn->transactional(static function () use ($conn, $user): void {
            $conn->executeStatement(
                'UPDATE posts p SET reaction_count = GREATEST(p.reaction_count - r.n, 0)
                 FROM (SELECT post_id, COUNT(*) AS n FROM reactions WHERE user_id = :user GROUP BY post_id) r
                 WHERE p.id = r.post_id',
                ['user' => $user->getId()->toRfc4122()],
            );
            $conn->executeStatement('DELETE FROM reactions WHERE user_id = :user', ['user' => $user->getId()->toRfc4122()]);
        });
    }
}
