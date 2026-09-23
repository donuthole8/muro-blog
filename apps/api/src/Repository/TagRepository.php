<?php

declare(strict_types=1);

namespace App\Repository;

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
     * 公開記事を1件以上持つタグを、記事数の多い順に返す。
     *
     * @return list<array{tag: Tag, postCount: int}>
     */
    public function findAllWithPublishedCount(): array
    {
        /** @var list<array{0: Tag, postCount: string|int}> $rows */
        $rows = $this->createQueryBuilder('t')
            ->select('t', 'COUNT(p.id) AS postCount')
            ->innerJoin('t.posts', 'p')
            ->andWhere('p.status = :status')
            ->setParameter('status', PostStatus::Published)
            ->groupBy('t.id')
            ->orderBy('postCount', 'DESC')
            ->addOrderBy('t.name', 'ASC')
            ->getQuery()
            ->getResult();

        return array_map(
            static fn (array $row): array => ['tag' => $row[0], 'postCount' => (int) $row['postCount']],
            $rows,
        );
    }

    public function findOneBySlug(string $slug): ?Tag
    {
        return $this->findOneBy(['slug' => $slug]);
    }
}
