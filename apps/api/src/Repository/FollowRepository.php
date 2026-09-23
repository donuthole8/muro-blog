<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Follow;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Bridge\Doctrine\Types\UlidType;

/**
 * @extends ServiceEntityRepository<Follow>
 */
class FollowRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Follow::class);
    }

    public function findPair(User $follower, User $followee): ?Follow
    {
        return $this->createQueryBuilder('f')
            ->andWhere('f.follower = :follower')
            ->andWhere('f.followee = :followee')
            ->setParameter('follower', $follower->getId(), UlidType::NAME)
            ->setParameter('followee', $followee->getId(), UlidType::NAME)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * フォロー中の部屋と、それぞれの未読数（最後に部屋を開いた後の親投稿の数）。
     * 未読の多い順 → 最近フォローした順。
     *
     * @return list<array{followee_id: string, unread: int, last_post_at: ?string}>
     */
    public function findFollowingWithUnread(User $follower): array
    {
        $rows = $this->getEntityManager()->getConnection()->fetchAllAssociative(<<<'SQL'
            SELECT f.followee_id,
                   COUNT(p.id) FILTER (WHERE p.created_at > f.last_read_at) AS unread,
                   MAX(p.created_at) AS last_post_at
            FROM follows f
            JOIN users u ON u.id = f.followee_id AND u.deleted_at IS NULL
            LEFT JOIN posts p ON p.author_id = f.followee_id
                AND p.parent_id IS NULL AND p.deleted_at IS NULL AND p.hidden_at IS NULL
            WHERE f.follower_id = :follower
            GROUP BY f.followee_id, f.id
            ORDER BY unread DESC, last_post_at DESC NULLS LAST, f.id DESC
            SQL,
            ['follower' => $follower->getId()->toRfc4122()],
        );

        return array_map(static fn (array $row): array => [
            'followee_id' => $row['followee_id'],
            'unread' => (int) $row['unread'],
            'last_post_at' => $row['last_post_at'],
        ], $rows);
    }

    public function countFollowers(User $followee): int
    {
        return (int) $this->createQueryBuilder('f')
            ->select('COUNT(f.id)')
            ->andWhere('f.followee = :followee')
            ->setParameter('followee', $followee->getId(), UlidType::NAME)
            ->getQuery()
            ->getSingleScalarResult();
    }
}
