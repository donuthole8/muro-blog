<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\NotificationType;
use App\Repository\NotificationRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UlidType;
use Symfony\Component\Uid\Ulid;

/** アプリ内のベル通知。 */
#[ORM\Entity(repositoryClass: NotificationRepository::class)]
#[ORM\Table(name: 'notifications')]
#[ORM\Index(name: 'idx_notifications_user', columns: ['user_id', 'id'])]
#[ORM\Index(name: 'idx_notifications_unread', columns: ['user_id'], options: ['where' => '(read_at IS NULL)'])]
class Notification
{
    #[ORM\Id]
    #[ORM\Column(type: UlidType::NAME)]
    private Ulid $id;

    /** 通知を受け取る人 */
    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column(length: 16, enumType: NotificationType::class)]
    private NotificationType $type;

    /** 通知のきっかけを作った人 */
    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $actor;

    /** 通知の対象の投稿。フォロー通知のように投稿を伴わないものは null。 */
    #[ORM\ManyToOne(targetEntity: Post::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?Post $post;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $readAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(User $user, NotificationType $type, User $actor, ?Post $post)
    {
        $this->id = new Ulid();
        $this->user = $user;
        $this->type = $type;
        $this->actor = $actor;
        $this->post = $post;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Ulid
    {
        return $this->id;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getType(): NotificationType
    {
        return $this->type;
    }

    public function getActor(): User
    {
        return $this->actor;
    }

    public function getPost(): ?Post
    {
        return $this->post;
    }

    public function getReadAt(): ?\DateTimeImmutable
    {
        return $this->readAt;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
