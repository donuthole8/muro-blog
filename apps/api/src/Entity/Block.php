<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\BlockRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * ブロック。blocked は blocker の投稿に返信・リアクションできず、
 * blocker には blocked からの通知が届かない。blocker の画面では blocked の投稿を折りたたむ。
 */
#[ORM\Entity(repositoryClass: BlockRepository::class)]
#[ORM\Table(name: 'blocks')]
#[ORM\UniqueConstraint(name: 'uniq_blocks_pair', columns: ['blocker_id', 'blocked_id'])]
class Block
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'bigint')]
    private ?string $id = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $blocker;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $blocked;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(User $blocker, User $blocked)
    {
        $this->blocker = $blocker;
        $this->blocked = $blocked;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getBlocker(): User
    {
        return $this->blocker;
    }

    public function getBlocked(): User
    {
        return $this->blocked;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
