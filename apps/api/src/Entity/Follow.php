<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\FollowRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * 部屋のフォロー。フォローした人の投稿を混ぜたフィードは作らず、
 * 「フォロー中の部屋一覧と未読数」を出すためだけに使う。
 */
#[ORM\Entity(repositoryClass: FollowRepository::class)]
#[ORM\Table(name: 'follows')]
#[ORM\UniqueConstraint(name: 'uniq_follows_pair', columns: ['follower_id', 'followee_id'])]
class Follow
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'bigint')]
    private ?string $id = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $follower;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $followee;

    /** この時刻より後の親投稿を未読として数える。 */
    #[ORM\Column]
    private \DateTimeImmutable $lastReadAt;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(User $follower, User $followee)
    {
        $this->follower = $follower;
        $this->followee = $followee;
        $this->createdAt = new \DateTimeImmutable();
        // フォローした時点までは既読扱いにする（過去の投稿を全部未読にしない）
        $this->lastReadAt = $this->createdAt;
    }

    public function getFollower(): User
    {
        return $this->follower;
    }

    public function getFollowee(): User
    {
        return $this->followee;
    }

    public function getLastReadAt(): \DateTimeImmutable
    {
        return $this->lastReadAt;
    }

    public function markRead(): static
    {
        $this->lastReadAt = new \DateTimeImmutable();

        return $this;
    }
}
