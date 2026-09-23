<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Post;
use App\Enum\PostStatus;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\QueryBuilder;
use Doctrine\ORM\Tools\Pagination\Paginator;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Post>
 */
class PostRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Post::class);
    }

    /**
     * 公開済み記事を新しい順に取得する。
     *
     * @return array{items: list<Post>, total: int}
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

    public function findPublishedBySlug(string $slug): ?Post
    {
        return $this->publishedQueryBuilder()
            ->andWhere('p.slug = :slug')
            ->setParameter('slug', $slug)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * 管理画面用。下書きを含む全記事を更新の新しい順で返す。
     *
     * @return list<Post>
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

    public function isSlugTaken(string $slug, ?int $exceptId = null): bool
    {
        $qb = $this->createQueryBuilder('p')
            ->select('COUNT(p.id)')
            ->andWhere('p.slug = :slug')
            ->setParameter('slug', $slug);

        if (null !== $exceptId) {
            $qb->andWhere('p.id != :id')->setParameter('id', $exceptId);
        }

        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
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
