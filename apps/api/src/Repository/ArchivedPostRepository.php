<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\ArchivedPost;
use App\Enum\PostStatus;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\QueryBuilder;
use Doctrine\ORM\Tools\Pagination\Paginator;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<ArchivedPost>
 */
class ArchivedPostRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, ArchivedPost::class);
    }

    /**
     * 公開済み記事を新しい順に取得する。
     *
     * @return array{items: list<ArchivedPost>, total: int}
     */
    public function findPublished(int $page, int $perPage, ?string $tagSlug = null): array
    {
        $qb = $this->publishedQueryBuilder($tagSlug)
            ->orderBy('p.publishedAt', 'DESC')
            ->addOrderBy('p.id', 'DESC')
            ->setFirstResult(($page - 1) * $perPage)
            ->setMaxResults($perPage);

        // ManyToMany を fetch join すると LIMIT が壊れるため Paginator に任せる
        $paginator = new Paginator($qb->getQuery(), fetchJoinCollection: true);

        return [
            'items' => iterator_to_array($paginator),
            'total' => count($paginator),
        ];
    }

    public function findPublishedBySlug(string $slug): ?ArchivedPost
    {
        return $this->publishedQueryBuilder()
            ->andWhere('p.slug = :slug')
            ->setParameter('slug', $slug)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * 下書きを含む全記事を更新の新しい順で返す（bodyHtml の再生成用）。
     *
     * @return list<ArchivedPost>
     */
    public function findAllForAdmin(?PostStatus $status = null): array
    {
        $qb = $this->createQueryBuilder('p')
            ->leftJoin('p.tags', 't')
            ->addSelect('t')
            ->orderBy('p.updatedAt', 'DESC');

        if (null !== $status) {
            $qb->andWhere('p.status = :status')->setParameter('status', $status);
        }

        return $qb->getQuery()->getResult();
    }


    private function publishedQueryBuilder(?string $tagSlug = null): QueryBuilder
    {
        $qb = $this->createQueryBuilder('p')
            ->andWhere('p.status = :status')
            ->andWhere('p.publishedAt IS NOT NULL')
            ->setParameter('status', PostStatus::Published);

        if (null !== $tagSlug) {
            // 絞り込み用の join は select しない（表示用のタグは別途 lazy load される）
            $qb->innerJoin('p.tags', 'filterTag')
                ->andWhere('filterTag.slug = :tagSlug')
                ->setParameter('tagSlug', $tagSlug);
        }

        return $qb;
    }
}
