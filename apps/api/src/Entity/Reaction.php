<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\ReactionRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * 投稿への絵文字リアクション。1人が同じ投稿に同じ絵文字を付けられるのは1回まで。
 * 追加・削除は競合を避けるため ReactionRepository の SQL で直接行う。
 */
#[ORM\Entity(repositoryClass: ReactionRepository::class)]
#[ORM\Table(name: 'reactions')]
#[ORM\UniqueConstraint(name: 'uniq_reactions_post_user_emoji', columns: ['post_id', 'user_id', 'emoji'])]
// 人気の部屋の集計（過去 24h）で使う
#[ORM\Index(name: 'idx_reactions_created', columns: ['created_at'])]
class Reaction
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'bigint')]
    private ?string $id = null;

    #[ORM\ManyToOne(targetEntity: Post::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Post $post;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column(length: 32)]
    private string $emoji;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(Post $post, User $user, string $emoji)
    {
        $this->post = $post;
        $this->user = $user;
        $this->emoji = $emoji;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?string
    {
        return $this->id;
    }

    public function getPost(): Post
    {
        return $this->post;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getEmoji(): string
    {
        return $this->emoji;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
