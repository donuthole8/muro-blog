<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\ArchivedPost;
use App\Entity\Tag;
use App\Enum\PostStatus;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Tag>
 */
class TagRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Tag::class);
    }

    /**
     * アーカイブ記事を1件以上持つタグを、記事数の多い順に返す。
     *
     * @return list<array{tag: Tag, postCount: int}>
     */
    public function findAllWithArchivedCount(): array
    {
        /** @var list<array{0: Tag, postCount: string|int}> $rows */
        $rows = $this->createQueryBuilder('t')
            ->select('t', 'COUNT(p.id) AS postCount')
            ->innerJoin(ArchivedPost::class, 'p', 'WITH', 't MEMBER OF p.tags')
            ->andWhere('p.status = :status')
            ->setParameter('status', PostStatus::Published)
            ->groupBy('t.id')
            ->orderBy('postCount', 'DESC')
            ->addOrderBy('t.name', 'ASC')
            ->getQuery()
            ->getResult();

        return $this->withCounts($rows);
    }

    /**
     * 全タグを、表示中の親投稿が多い順に返す（投稿0件のタグも含む）。
     * 投稿画面のタグ選択と /tags の一覧で使う。
     *
     * @return list<array{tag: Tag, postCount: int}>
     */
    public function findAllWithPostCount(): array
    {
        $conn = $this->getEntityManager()->getConnection();

        /** @var list<array{id: int, post_count: int}> $counts */
        $counts = $conn->fetchAllAssociative(<<<'SQL'
            SELECT pt.tag_id AS id, COUNT(*) AS post_count
            FROM post_tags pt
            JOIN posts p ON p.id = pt.post_id
            WHERE p.deleted_at IS NULL AND p.hidden_at IS NULL
            GROUP BY pt.tag_id
            SQL);
        $countById = array_column($counts, 'post_count', 'id');

        $rows = array_map(
            static fn (Tag $tag): array => ['tag' => $tag, 'postCount' => (int) ($countById[$tag->getId()] ?? 0)],
            $this->findBy([], ['name' => 'ASC']),
        );
        usort($rows, static fn (array $a, array $b): int => $b['postCount'] <=> $a['postCount']);

        return $rows;
    }

    public function findOneBySlug(string $slug): ?Tag
    {
        return $this->findOneBy(['slug' => $slug]);
    }

    /**
     * @param list<string> $slugs
     *
     * @return list<Tag>
     */
    public function findBySlugs(array $slugs): array
    {
        if ([] === $slugs) {
            return [];
        }

        return $this->findBy(['slug' => $slugs]);
    }

    /**
     * @param list<array{0: Tag, postCount: string|int}> $rows
     *
     * @return list<array{tag: Tag, postCount: int}>
     */
    private function withCounts(array $rows): array
    {
        return array_map(
            static fn (array $row): array => ['tag' => $row[0], 'postCount' => (int) $row['postCount']],
            $rows,
        );
    }
}
