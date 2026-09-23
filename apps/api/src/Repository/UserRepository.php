<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Bridge\Doctrine\Types\UlidType;
use Symfony\Component\Uid\Ulid;

/**
 * @extends ServiceEntityRepository<User>
 */
class UserRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, User::class);
    }

    public function findOneByHandle(string $handle): ?User
    {
        return $this->findOneBy(['handle' => strtolower($handle)]);
    }

    /** 部屋として表示できるユーザー（停止中も含む。停止中の表示は画面側で出し分ける）。 */
    public function findRoomOwner(string $handle): ?User
    {
        $user = $this->findOneByHandle($handle);

        return null !== $user && !$user->isDeleted() ? $user : null;
    }

    public function findOneByGoogleSub(string $sub): ?User
    {
        return $this->findOneBy(['googleSub' => $sub]);
    }

    /**
     * @param list<string> $handles
     *
     * @return list<User>
     */
    public function findActiveByHandles(array $handles): array
    {
        if ([] === $handles) {
            return [];
        }

        return $this->createQueryBuilder('u')
            ->andWhere('u.handle IN (:handles)')
            ->andWhere('u.suspendedAt IS NULL')
            ->andWhere('u.deletedAt IS NULL')
            ->setParameter('handles', $handles)
            ->getQuery()
            ->getResult();
    }

    /**
     * @param list<string> $ids RFC 4122 形式
     *
     * @return array<string, User> RFC 4122 形式の ID => User
     */
    public function findByIdsIndexed(array $ids): array
    {
        if ([] === $ids) {
            return [];
        }

        $users = $this->createQueryBuilder('u')
            ->andWhere('u.id IN (:ids)')
            ->setParameter('ids', $ids)
            ->getQuery()
            ->getResult();

        $indexed = [];
        foreach ($users as $user) {
            $indexed[$user->getId()->toRfc4122()] = $user;
        }

        return $indexed;
    }

    /**
     * 同じ会社を自己申告している人。
     *
     * @return list<User>
     */
    public function findByCompanySlug(string $slug, int $limit): array
    {
        return $this->createQueryBuilder('u')
            ->andWhere('u.companySlug = :slug')
            ->andWhere('u.handle IS NOT NULL')
            ->andWhere('u.suspendedAt IS NULL')
            ->andWhere('u.deletedAt IS NULL')
            ->setParameter('slug', $slug)
            ->orderBy('u.id', 'ASC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * 管理画面のユーザー検索。handle か表示名の部分一致。
     *
     * @return list<User>
     */
    public function searchForAdmin(?string $query, int $limit): array
    {
        $qb = $this->createQueryBuilder('u')
            ->andWhere('u.deletedAt IS NULL')
            ->orderBy('u.id', 'DESC')
            ->setMaxResults($limit);

        if (null !== $query && '' !== trim($query)) {
            $qb->andWhere('LOWER(u.handle) LIKE :q OR LOWER(u.displayName) LIKE :q')
                ->setParameter('q', '%'.addcslashes(mb_strtolower(trim($query)), '%_\\').'%');
        }

        return $qb->getQuery()->getResult();
    }

    public function findOneByUlid(Ulid $id): ?User
    {
        return $this->createQueryBuilder('u')
            ->andWhere('u.id = :id')
            ->setParameter('id', $id, UlidType::NAME)
            ->getQuery()
            ->getOneOrNullResult();
    }
}
