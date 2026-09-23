<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\ReportReason;
use App\Enum\ReportResolution;
use App\Repository\ReportRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UlidType;
use Symfony\Component\Uid\Ulid;

/**
 * 投稿の通報。管理者が /admin/reports で見て、非表示にするか却下する。
 * 同じ人が同じ投稿を通報し直した場合は、未対応のものを上書きする（1人1件）。
 */
#[ORM\Entity(repositoryClass: ReportRepository::class)]
#[ORM\Table(name: 'reports')]
#[ORM\UniqueConstraint(name: 'uniq_reports_post_reporter', columns: ['post_id', 'reporter_id'])]
#[ORM\Index(name: 'idx_reports_open', columns: ['id'], options: ['where' => '(resolved_at IS NULL)'])]
class Report
{
    #[ORM\Id]
    #[ORM\Column(type: UlidType::NAME)]
    private Ulid $id;

    #[ORM\ManyToOne(targetEntity: Post::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Post $post;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $reporter;

    #[ORM\Column(length: 16, enumType: ReportReason::class)]
    private ReportReason $reason;

    #[ORM\Column(length: 500, nullable: true)]
    private ?string $detail;

    #[ORM\Column(length: 16, nullable: true, enumType: ReportResolution::class)]
    private ?ReportResolution $resolution = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $resolvedAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(Post $post, User $reporter, ReportReason $reason, ?string $detail)
    {
        $this->id = new Ulid();
        $this->post = $post;
        $this->reporter = $reporter;
        $this->reason = $reason;
        $this->detail = $detail;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Ulid
    {
        return $this->id;
    }

    public function getPost(): Post
    {
        return $this->post;
    }

    public function getReporter(): User
    {
        return $this->reporter;
    }

    public function getReason(): ReportReason
    {
        return $this->reason;
    }

    public function getDetail(): ?string
    {
        return $this->detail;
    }

    public function getResolution(): ?ReportResolution
    {
        return $this->resolution;
    }

    public function getResolvedAt(): ?\DateTimeImmutable
    {
        return $this->resolvedAt;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function isOpen(): bool
    {
        return null === $this->resolvedAt;
    }

    /** 対応済みの通報をもう一度出されたら、未対応に戻して内容を差し替える。 */
    public function resubmit(ReportReason $reason, ?string $detail): static
    {
        $this->reason = $reason;
        $this->detail = $detail;
        $this->resolution = null;
        $this->resolvedAt = null;
        $this->createdAt = new \DateTimeImmutable();

        return $this;
    }

    public function resolve(ReportResolution $resolution): static
    {
        $this->resolution = $resolution;
        $this->resolvedAt = new \DateTimeImmutable();

        return $this;
    }
}
