<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Block;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Bridge\Doctrine\Types\UlidType;
use Symfony\Component\Uid\Ulid;

/**
 * @extends ServiceEntityRepository<Block>
 */
class BlockRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Block::class);
    }

    public function findPair(User $blocker, User $blocked): ?Block
    {
        return $this->createQueryBuilder('b')
            ->andWhere('b.blocker = :blocker')
            ->andWhere('b.blocked = :blocked')
            ->setParameter('blocker', $blocker->getId(), UlidType::NAME)
            ->setParameter('blocked', $blocked->getId(), UlidType::NAME)
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function isBlocking(User $blocker, User $blocked): bool
    {
        return null !== $this->findPair($blocker, $blocked);
    }

    /** @return list<Block> 新しい順 */
    public function findByBlocker(User $blocker): array
    {
        return $this->createQueryBuilder('b')
            ->addSelect('u')
            ->innerJoin('b.blocked', 'u')
            ->andWhere('b.blocker = :blocker')
            ->andWhere('u.deletedAt IS NULL')
            ->setParameter('blocker', $blocker->getId(), UlidType::NAME)
            ->orderBy('b.id', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * $blocker がブロックしている handle の一覧（viewer-state で投稿を折りたたむ用）。
     *
     * @return list<string>
     */
    public function findBlockedHandles(User $blocker): array
    {
        /** @var list<string> */
        return $this->createQueryBuilder('b')
            ->select('u.handle')
            ->innerJoin('b.blocked', 'u')
            ->andWhere('b.blocker = :blocker')
            ->andWhere('u.handle IS NOT NULL')
            ->setParameter('blocker', $blocker->getId(), UlidType::NAME)
            ->getQuery()
            ->getSingleColumnResult();
    }

    /**
     * $candidates のうち、$blocked をブロックしている人の ID（通知の抑止用）。
     *
     * @param list<User> $candidates
     *
     * @return array<string, true> ULID 文字列 => true
     */
    public function findBlockersAmong(array $candidates, User $blocked): array
    {
        if ([] === $candidates) {
            return [];
        }

        $rows = $this->createQueryBuilder('b')
            ->select('IDENTITY(b.blocker) AS blocker_id')
            ->andWhere('b.blocked = :blocked')
            ->andWhere('b.blocker IN (:candidates)')
            ->setParameter('blocked', $blocked->getId(), UlidType::NAME)
            ->setParameter('candidates', array_map(static fn (User $u): string => $u->getId()->toRfc4122(), $candidates))
            ->getQuery()
            ->getSingleColumnResult();

        $ids = [];
        foreach ($rows as $rfc) {
            $ids[(string) Ulid::fromString($rfc)] = true;
        }

        return $ids;
    }
}
