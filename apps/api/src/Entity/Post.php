<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\PostRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UlidType;
use Symfony\Component\Uid\Ulid;

/**
 * times の投稿。parent が null なら部屋に流れる親投稿、そうでなければスレッドの返信。
 *
 * スレッドは1階層に固定する（返信への返信は作らない）。
 * ID は ULID なので、ID の降順がそのまま新しい順になる。ページングもこれを使う。
 */
#[ORM\Entity(repositoryClass: PostRepository::class)]
#[ORM\Table(name: 'posts')]
// 部屋: ある人の親投稿を新しい順に
#[ORM\Index(name: 'idx_posts_room', columns: ['author_id', 'id'], options: ['where' => '(parent_id IS NULL)'])]
// ロビー: 全員の親投稿を新しい順に
#[ORM\Index(name: 'idx_posts_lobby', columns: ['id'], options: ['where' => '(parent_id IS NULL)'])]
// スレッド: 親投稿ごとの返信を古い順に
#[ORM\Index(name: 'idx_posts_thread', columns: ['parent_id', 'id'])]
class Post
{
    public const MAX_BODY_LENGTH = 2000;
    public const MAX_TAGS = 3;

    #[ORM\Id]
    #[ORM\Column(type: UlidType::NAME)]
    private Ulid $id;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $author;

    #[ORM\ManyToOne(targetEntity: self::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?Post $parent;

    #[ORM\Column(type: 'text')]
    private string $bodyMarkdown = '';

    /** 保存時に bodyMarkdown から変換した HTML。表示はこちらだけを使う。 */
    #[ORM\Column(type: 'text')]
    private string $bodyHtml = '';

    /** R2 上の画像のキー。配信は Worker の /uploads/{key} が行う。 */
    #[ORM\Column(length: 128, nullable: true)]
    private ?string $imageKey = null;

    /** 非正規化したカウンタ。一覧表示のたびに COUNT しないため。 */
    #[ORM\Column(options: ['default' => 0])]
    private int $replyCount = 0;

    #[ORM\Column(options: ['default' => 0])]
    private int $reactionCount = 0;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastReplyAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $editedAt = null;

    /** 論理削除。親投稿はスレッドの返信を残すため行を消さない。 */
    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $deletedAt = null;

    /** 管理者による非表示。 */
    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $hiddenAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    /** @var Collection<int, Tag> */
    #[ORM\ManyToMany(targetEntity: Tag::class)]
    #[ORM\JoinTable(name: 'post_tags')]
    private Collection $tags;

    public function __construct(User $author, ?Post $parent = null)
    {
        $this->id = new Ulid();
        $this->author = $author;
        $this->parent = $parent;
        $this->tags = new ArrayCollection();
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Ulid
    {
        return $this->id;
    }

    public function getAuthor(): User
    {
        return $this->author;
    }

    public function getParent(): ?Post
    {
        return $this->parent;
    }

    public function isReply(): bool
    {
        return null !== $this->parent;
    }

    public function getBodyMarkdown(): string
    {
        return $this->bodyMarkdown;
    }

    public function getBodyHtml(): string
    {
        return $this->bodyHtml;
    }

    public function setBody(string $markdown, string $html): static
    {
        $this->bodyMarkdown = $markdown;
        $this->bodyHtml = $html;

        return $this;
    }

    /** 本文を変えずに HTML だけ作り直す（リンクカードを後から埋めるとき）。 */
    public function setBodyHtml(string $html): static
    {
        $this->bodyHtml = $html;

        return $this;
    }

    public function getImageKey(): ?string
    {
        return $this->imageKey;
    }

    public function setImageKey(?string $imageKey): static
    {
        $this->imageKey = $imageKey;

        return $this;
    }

    public function getReplyCount(): int
    {
        return $this->replyCount;
    }

    public function getReactionCount(): int
    {
        return $this->reactionCount;
    }

    public function getLastReplyAt(): ?\DateTimeImmutable
    {
        return $this->lastReplyAt;
    }

    public function getEditedAt(): ?\DateTimeImmutable
    {
        return $this->editedAt;
    }

    public function markEdited(): static
    {
        $this->editedAt = new \DateTimeImmutable();

        return $this;
    }

    public function getDeletedAt(): ?\DateTimeImmutable
    {
        return $this->deletedAt;
    }

    public function isDeleted(): bool
    {
        return null !== $this->deletedAt;
    }

    /**
     * 論理削除。本文と画像は消す（データとしても残さない）。
     * 行を残すのは、親投稿の場合にスレッドの返信をぶら下げたままにするため。
     */
    public function softDelete(): static
    {
        $this->deletedAt ??= new \DateTimeImmutable();
        $this->bodyMarkdown = '';
        $this->bodyHtml = '';
        $this->imageKey = null;
        $this->tags->clear();

        return $this;
    }

    public function getHiddenAt(): ?\DateTimeImmutable
    {
        return $this->hiddenAt;
    }

    public function hide(): static
    {
        $this->hiddenAt ??= new \DateTimeImmutable();

        return $this;
    }

    public function unhide(): static
    {
        $this->hiddenAt = null;

        return $this;
    }

    /** 本文を見せてよいか。削除・非表示・投稿者の停止のいずれかなら見せない。 */
    public function isVisible(): bool
    {
        return null === $this->deletedAt
            && null === $this->hiddenAt
            && !$this->author->isSuspended()
            && !$this->author->isDeleted();
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    /** @return Collection<int, Tag> */
    public function getTags(): Collection
    {
        return $this->tags;
    }

    /** @param list<Tag> $tags */
    public function replaceTags(array $tags): static
    {
        $this->tags->clear();
        foreach ($tags as $tag) {
            $this->tags->add($tag);
        }

        return $this;
    }
}
