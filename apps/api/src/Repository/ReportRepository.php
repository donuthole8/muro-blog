<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Post;
use App\Entity\Report;
use App\Entity\User;
use App\Enum\ReportResolution;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Bridge\Doctrine\Types\UlidType;
use Symfony\Component\Uid\Ulid;

/**
 * @extends ServiceEntityRepository<Report>
 */
class ReportRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Report::class);
    }

    public function findPair(Post $post, User $reporter): ?Report
    {
        return $this->createQueryBuilder('r')
            ->andWhere('r.post = :post')
            ->andWhere('r.reporter = :reporter')
            ->setParameter('post', $post->getId(), UlidType::NAME)
            ->setParameter('reporter', $reporter->getId(), UlidType::NAME)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * 通報一覧（新しい順）。$open が true なら未対応だけ。
     *
     * @return array{items: list<Report>, nextCursor: ?string}
     */
    public function findPage(bool $open, ?Ulid $cursor, int $limit): array
    {
        $qb = $this->createQueryBuilder('r')
            ->addSelect('p', 'author', 'reporter')
            ->innerJoin('r.post', 'p')
            ->innerJoin('p.author', 'author')
            ->innerJoin('r.reporter', 'reporter')
            ->orderBy('r.id', 'DESC')
            ->setMaxResults($limit + 1);

        $open ? $qb->andWhere('r.resolvedAt IS NULL') : $qb->andWhere('r.resolvedAt IS NOT NULL');

        if (null !== $cursor) {
            $qb->andWhere('r.id < :cursor')->setParameter('cursor', $cursor, UlidType::NAME);
        }

        /** @var list<Report> $rows */
        $rows = $qb->getQuery()->getResult();
        $hasMore = count($rows) > $limit;
        $items = array_slice($rows, 0, $limit);

        return [
            'items' => $items,
            'nextCursor' => $hasMore ? (string) $items[array_key_last($items)]->getId() : null,
        ];
    }

    public function countOpen(): int
    {
        return (int) $this->createQueryBuilder('r')
            ->select('COUNT(r.id)')
            ->andWhere('r.resolvedAt IS NULL')
            ->getQuery()
            ->getSingleScalarResult();
    }

    /** 投稿への未対応の通報をまとめて対応済みにする（非表示・削除したとき）。 */
    public function resolveAllForPost(Post $post, ReportResolution $resolution): void
    {
        $this->createQueryBuilder('r')
            ->update()
            ->set('r.resolution', ':resolution')
            ->set('r.resolvedAt', ':now')
            ->andWhere('r.post = :post')
            ->andWhere('r.resolvedAt IS NULL')
            ->setParameter('resolution', $resolution->value)
            ->setParameter('now', new \DateTimeImmutable())
            ->setParameter('post', $post->getId(), UlidType::NAME)
            ->getQuery()
            ->execute();
    }
}
