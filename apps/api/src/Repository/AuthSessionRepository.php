<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\AuthSession;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Bridge\Doctrine\Types\UlidType;

/**
 * @extends ServiceEntityRepository<AuthSession>
 */
class AuthSessionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AuthSession::class);
    }

    public function findValidByTokenHash(string $tokenHash): ?AuthSession
    {
        return $this->createQueryBuilder('s')
            ->addSelect('u')
            ->innerJoin('s.user', 'u')
            ->andWhere('s.tokenHash = :hash')
            ->andWhere('s.expiresAt > :now')
            ->setParameter('hash', $tokenHash)
            ->setParameter('now', new \DateTimeImmutable())
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function deleteByTokenHash(string $tokenHash): void
    {
        $this->createQueryBuilder('s')
            ->delete()
            ->andWhere('s.tokenHash = :hash')
            ->setParameter('hash', $tokenHash)
            ->getQuery()
            ->execute();
    }

    /** 停止・退会時に全端末からログアウトさせる。 */
    public function deleteAllForUser(User $user): void
    {
        $this->createQueryBuilder('s')
            ->delete()
            ->andWhere('s.user = :user')
            ->setParameter('user', $user->getId(), UlidType::NAME)
            ->getQuery()
            ->execute();
    }

    /** 期限切れのセッションを掃除する。ログインのたびについでに呼ぶ（専用のバッチは作らない）。 */
    public function deleteExpired(): void
    {
        $this->createQueryBuilder('s')
            ->delete()
            ->andWhere('s.expiresAt <= :now')
            ->setParameter('now', new \DateTimeImmutable())
            ->getQuery()
            ->execute();
    }
}
