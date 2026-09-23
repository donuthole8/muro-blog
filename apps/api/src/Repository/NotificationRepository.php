<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Notification;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Bridge\Doctrine\Types\UlidType;
use Symfony\Component\Uid\Ulid;

/**
 * @extends ServiceEntityRepository<Notification>
 */
class NotificationRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Notification::class);
    }

    /**
     * @return array{items: list<Notification>, nextCursor: ?string}
     */
    public function findPage(User $user, ?Ulid $cursor, int $limit): array
    {
        $qb = $this->createQueryBuilder('n')
            ->addSelect('actor', 'post', 'parent', 'postAuthor', 'parentAuthor')
            ->innerJoin('n.actor', 'actor')
            ->innerJoin('n.post', 'post')
            ->innerJoin('post.author', 'postAuthor')
            ->leftJoin('post.parent', 'parent')
            ->leftJoin('parent.author', 'parentAuthor')
            ->andWhere('n.user = :user')
            ->setParameter('user', $user->getId(), UlidType::NAME)
            ->orderBy('n.id', 'DESC')
            ->setMaxResults($limit + 1);

        if (null !== $cursor) {
            $qb->andWhere('n.id < :cursor')->setParameter('cursor', $cursor, UlidType::NAME);
        }

        /** @var list<Notification> $rows */
        $rows = $qb->getQuery()->getResult();
        $hasMore = count($rows) > $limit;
        $items = array_slice($rows, 0, $limit);

        return [
            'items' => $items,
            'nextCursor' => $hasMore ? (string) $items[array_key_last($items)]->getId() : null,
        ];
    }

    public function countUnread(User $user): int
    {
        return (int) $this->createQueryBuilder('n')
            ->select('COUNT(n.id)')
            ->andWhere('n.user = :user')
            ->andWhere('n.readAt IS NULL')
            ->setParameter('user', $user->getId(), UlidType::NAME)
            ->getQuery()
            ->getSingleScalarResult();
    }

    public function markAllRead(User $user): void
    {
        $this->createQueryBuilder('n')
            ->update()
            ->set('n.readAt', ':now')
            ->andWhere('n.user = :user')
            ->andWhere('n.readAt IS NULL')
            ->setParameter('now', new \DateTimeImmutable())
            ->setParameter('user', $user->getId(), UlidType::NAME)
            ->getQuery()
            ->execute();
    }

    /**
     * 同じ人から同じ投稿への同じ種類の未読通知が既にあるか。
     * リアクションを付け外しするたびに通知が積み上がるのを防ぐ。
     */
    public function hasUnreadDuplicate(Notification $candidate): bool
    {
        return null !== $this->createQueryBuilder('n')
            ->select('n.id')
            ->andWhere('n.user = :user')
            ->andWhere('n.actor = :actor')
            ->andWhere('n.post = :post')
            ->andWhere('n.type = :type')
            ->andWhere('n.readAt IS NULL')
            ->setParameter('user', $candidate->getUser()->getId(), UlidType::NAME)
            ->setParameter('actor', $candidate->getActor()->getId(), UlidType::NAME)
            ->setParameter('post', $candidate->getPost()->getId(), UlidType::NAME)
            ->setParameter('type', $candidate->getType())
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /** 退会時。本人宛ての通知と、本人がきっかけの通知を消す。 */
    public function deleteAllInvolving(User $user): void
    {
        $this->createQueryBuilder('n')
            ->delete()
            ->andWhere('n.user = :user OR n.actor = :user')
            ->setParameter('user', $user->getId(), UlidType::NAME)
            ->getQuery()
            ->execute();
    }
}
