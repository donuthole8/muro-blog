<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\UserRole;
use App\Repository\UserRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UlidType;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Uid\Ulid;

/**
 * times の持ち主。1ユーザー1部屋。
 *
 * 登録は Google OAuth のみでパスワードは持たない。
 * handle は初回ログイン後に本人が決めるため、それまでは null。
 */
#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: 'users')]
#[ORM\Index(name: 'idx_users_company', columns: ['company_slug'])]
class User implements UserInterface
{
    #[ORM\Id]
    #[ORM\Column(type: UlidType::NAME)]
    private Ulid $id;

    /** Google アカウントの不変 ID。退会すると null にしてログインできなくする。 */
    #[ORM\Column(length: 255, unique: true, nullable: true)]
    private ?string $googleSub;

    #[ORM\Column(length: 32, unique: true, nullable: true)]
    private ?string $handle = null;

    #[ORM\Column(length: 50)]
    private string $displayName;

    #[ORM\Column(length: 1024, nullable: true)]
    private ?string $avatarUrl = null;

    #[ORM\Column(length: 300, nullable: true)]
    private ?string $bio = null;

    /** 自己申告の所属。未認証。 */
    #[ORM\Column(length: 100, nullable: true)]
    private ?string $companyName = null;

    /** companyName を正規化したもの。/org/:slug の突き合わせに使う。 */
    #[ORM\Column(length: 100, nullable: true)]
    private ?string $companySlug = null;

    #[ORM\Column(length: 16, enumType: UserRole::class)]
    private UserRole $role = UserRole::User;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $suspendedAt = null;

    /** 退会日時。個人情報は消し、行だけを残す（他人のスレッドの整合性のため）。 */
    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $deletedAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(string $googleSub, string $displayName)
    {
        $this->id = new Ulid();
        $this->googleSub = $googleSub;
        $this->displayName = $displayName;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Ulid
    {
        return $this->id;
    }

    public function getUserIdentifier(): string
    {
        return (string) $this->id;
    }

    public function getRoles(): array
    {
        return UserRole::Admin === $this->role ? ['ROLE_USER', 'ROLE_ADMIN'] : ['ROLE_USER'];
    }

    public function eraseCredentials(): void
    {
    }

    public function getGoogleSub(): ?string
    {
        return $this->googleSub;
    }

    public function getHandle(): ?string
    {
        return $this->handle;
    }

    public function setHandle(string $handle): static
    {
        $this->handle = $handle;

        return $this;
    }

    public function getDisplayName(): string
    {
        return $this->displayName;
    }

    public function setDisplayName(string $displayName): static
    {
        $this->displayName = $displayName;

        return $this;
    }

    public function getAvatarUrl(): ?string
    {
        return $this->avatarUrl;
    }

    public function setAvatarUrl(?string $avatarUrl): static
    {
        $this->avatarUrl = $avatarUrl;

        return $this;
    }

    public function getBio(): ?string
    {
        return $this->bio;
    }

    public function setBio(?string $bio): static
    {
        $this->bio = $bio;

        return $this;
    }

    public function getCompanyName(): ?string
    {
        return $this->companyName;
    }

    public function getCompanySlug(): ?string
    {
        return $this->companySlug;
    }

    public function setCompany(?string $name, ?string $slug): static
    {
        $this->companyName = $name;
        $this->companySlug = $slug;

        return $this;
    }

    public function getRole(): UserRole
    {
        return $this->role;
    }

    public function setRole(UserRole $role): static
    {
        $this->role = $role;

        return $this;
    }

    public function isAdmin(): bool
    {
        return UserRole::Admin === $this->role;
    }

    public function getSuspendedAt(): ?\DateTimeImmutable
    {
        return $this->suspendedAt;
    }

    public function isSuspended(): bool
    {
        return null !== $this->suspendedAt;
    }

    public function suspend(): static
    {
        $this->suspendedAt ??= new \DateTimeImmutable();

        return $this;
    }

    public function unsuspend(): static
    {
        $this->suspendedAt = null;

        return $this;
    }

    public function isDeleted(): bool
    {
        return null !== $this->deletedAt;
    }

    /**
     * 退会処理。ログイン手段と個人情報を消す。
     * handle も解放するので、同じ handle を別の人が取れるようになる。
     */
    public function anonymize(): static
    {
        $this->googleSub = null;
        $this->handle = null;
        $this->displayName = '退会したユーザー';
        $this->avatarUrl = null;
        $this->bio = null;
        $this->companyName = null;
        $this->companySlug = null;
        $this->deletedAt = new \DateTimeImmutable();

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    /** 部屋を持てる状態か（handle 決定済みで、停止・退会していない）。 */
    public function isActive(): bool
    {
        return null !== $this->handle && !$this->isSuspended() && !$this->isDeleted();
    }
}
