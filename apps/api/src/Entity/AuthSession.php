<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\AuthSessionRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * ログインセッション。Worker が Cookie に持つトークンのハッシュだけを保存する
 * （DB が漏れてもそのままセッションを乗っ取れないように）。
 */
#[ORM\Entity(repositoryClass: AuthSessionRepository::class)]
#[ORM\Table(name: 'sessions')]
class AuthSession
{
    public const LIFETIME = '+30 days';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'bigint')]
    private ?string $id = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    /** sha256(token) の16進表記 */
    #[ORM\Column(length: 64, unique: true)]
    private string $tokenHash;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $expiresAt;

    public function __construct(User $user, string $tokenHash)
    {
        $this->user = $user;
        $this->tokenHash = $tokenHash;
        $this->createdAt = new \DateTimeImmutable();
        $this->expiresAt = $this->createdAt->modify(self::LIFETIME);
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getExpiresAt(): \DateTimeImmutable
    {
        return $this->expiresAt;
    }

    public function isExpired(): bool
    {
        return $this->expiresAt <= new \DateTimeImmutable();
    }
}
