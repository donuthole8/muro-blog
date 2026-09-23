<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\PostStatus;
use App\Repository\PostRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: PostRepository::class)]
#[ORM\Table(name: 'posts')]
#[ORM\Index(name: 'idx_posts_published', columns: ['status', 'published_at'])]
#[ORM\HasLifecycleCallbacks]
class Post
{
    /** 絵文字を選ばずに保存したときに入る既定値。 */
    public const DEFAULT_EMOJI = '📝';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 128, unique: true)]
    #[Assert\NotBlank]
    #[Assert\Regex('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', message: 'slug は英小文字・数字・ハイフンのみ使用できます。')]
    private string $slug = '';

    #[ORM\Column(length: 255)]
    #[Assert\NotBlank]
    #[Assert\Length(max: 255)]
    private string $title = '';

    /** 記事のアイキャッチ絵文字。Zenn と同じく1つだけ持つ。 */
    #[ORM\Column(length: 32, nullable: true)]
    #[Assert\Length(max: 8)]
    private ?string $emoji = null;

    /** Markdown 原文。編集時に使う。 */
    #[ORM\Column(type: 'text')]
    #[Assert\NotBlank]
    private string $bodyMd = '';

    /** 保存時に bodyMd から変換した HTML。表示時はこちらだけを使う。 */
    #[ORM\Column(type: 'text')]
    private string $bodyHtml = '';

    /** 一覧・OGP 用の抜粋。未指定なら本文から自動生成する。 */
    #[ORM\Column(length: 255, nullable: true)]
    #[Assert\Length(max: 255)]
    private ?string $excerpt = null;

    #[ORM\Column(length: 16, enumType: PostStatus::class)]
    private PostStatus $status = PostStatus::Draft;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $publishedAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    /** @var Collection<int, Tag> */
    #[ORM\ManyToMany(targetEntity: Tag::class, inversedBy: 'posts')]
    #[ORM\JoinTable(name: 'post_tags')]
    private Collection $tags;

    public function __construct()
    {
        $this->tags = new ArrayCollection();
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = $this->createdAt;
    }

    #[ORM\PreUpdate]
    public function touch(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function isPublished(): bool
    {
        return PostStatus::Published === $this->status;
    }

    /**
     * 公開する。publishedAt は初回公開時にだけ設定し、
     * 再公開でタイムスタンプが動かないようにする。
     */
    public function publish(): static
    {
        $this->status = PostStatus::Published;
        $this->publishedAt ??= new \DateTimeImmutable();

        return $this;
    }

    public function unpublish(): static
    {
        $this->status = PostStatus::Draft;

        return $this;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getSlug(): string
    {
        return $this->slug;
    }

    public function setSlug(string $slug): static
    {
        $this->slug = $slug;

        return $this;
    }

    public function getTitle(): string
    {
        return $this->title;
    }

    public function setTitle(string $title): static
    {
        $this->title = $title;

        return $this;
    }

    public function getEmoji(): ?string
    {
        return $this->emoji;
    }

    public function setEmoji(?string $emoji): static
    {
        $this->emoji = $emoji;

        return $this;
    }

    public function getBodyMd(): string
    {
        return $this->bodyMd;
    }

    public function setBodyMd(string $bodyMd): static
    {
        $this->bodyMd = $bodyMd;

        return $this;
    }

    public function getBodyHtml(): string
    {
        return $this->bodyHtml;
    }

    public function setBodyHtml(string $bodyHtml): static
    {
        $this->bodyHtml = $bodyHtml;

        return $this;
    }

    public function getExcerpt(): ?string
    {
        return $this->excerpt;
    }

    public function setExcerpt(?string $excerpt): static
    {
        $this->excerpt = $excerpt;

        return $this;
    }

    public function getStatus(): PostStatus
    {
        return $this->status;
    }

    public function getPublishedAt(): ?\DateTimeImmutable
    {
        return $this->publishedAt;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    /** @return Collection<int, Tag> */
    public function getTags(): Collection
    {
        return $this->tags;
    }

    public function addTag(Tag $tag): static
    {
        if (!$this->tags->contains($tag)) {
            $this->tags->add($tag);
        }

        return $this;
    }

    public function removeTag(Tag $tag): static
    {
        $this->tags->removeElement($tag);

        return $this;
    }

    public function clearTags(): static
    {
        $this->tags->clear();

        return $this;
    }
}
