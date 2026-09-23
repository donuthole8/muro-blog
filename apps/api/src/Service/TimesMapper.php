<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\AdminPost;
use App\Dto\AdminReport;
use App\Dto\AdminUser;
use App\Dto\Me;
use App\Dto\NotificationItem;
use App\Dto\ReactionCount;
use App\Dto\RoomSummary;
use App\Dto\TagSummary;
use App\Dto\TimesPost;
use App\Dto\UserProfile;
use App\Dto\UserSummary;
use App\Entity\Notification;
use App\Entity\Post;
use App\Entity\Report;
use App\Entity\User;
use App\Repository\ReactionRepository;

/**
 * times のエンティティを API のレスポンス DTO に変換する。
 * 日時は常に ISO 8601 文字列にして返す。
 */
final readonly class TimesMapper
{
    public function __construct(private ReactionRepository $reactions)
    {
    }

    /**
     * 絵文字ごとのリアクション数を1クエリでまとめて引いてから変換する。
     *
     * @param list<Post> $posts
     *
     * @return list<TimesPost>
     */
    public function toPosts(array $posts): array
    {
        $counts = $this->reactions->countByPosts(array_map(
            static fn (Post $post): string => $post->getId()->toRfc4122(),
            array_values(array_filter($posts, static fn (Post $post): bool => $post->isVisible())),
        ));

        return array_map(
            fn (Post $post): TimesPost => $this->toPost($post, $counts[$post->getId()->toRfc4122()] ?? []),
            $posts,
        );
    }

    /**
     * @param list<array{emoji: string, count: int}> $reactionCounts
     */
    public function toPost(Post $post, array $reactionCounts = []): TimesPost
    {
        $state = match (true) {
            $post->isDeleted() => 'deleted',
            !$post->isVisible() => 'hidden',
            default => 'visible',
        };
        $visible = 'visible' === $state;

        $tags = array_map(
            static fn ($tag): TagSummary => new TagSummary(name: $tag->getName(), slug: $tag->getSlug()),
            $visible ? $post->getTags()->toArray() : [],
        );

        return new TimesPost(
            id: (string) $post->getId(),
            parentId: null !== $post->getParent() ? (string) $post->getParent()->getId() : null,
            author: $this->toUserSummary($post->getAuthor()),
            state: $state,
            bodyHtml: $visible ? $post->getBodyHtml() : '',
            imageKey: $visible ? $post->getImageKey() : null,
            replyCount: $post->getReplyCount(),
            reactionCount: $visible ? $post->getReactionCount() : 0,
            reactions: $visible
                ? array_map(static fn (array $r): ReactionCount => new ReactionCount($r['emoji'], $r['count']), $reactionCounts)
                : [],
            tags: array_values($tags),
            lastReplyAt: self::date($post->getLastReplyAt()),
            editedAt: $visible ? self::date($post->getEditedAt()) : null,
            createdAt: (string) self::date($post->getCreatedAt()),
        );
    }

    /** 退会済み（handle なし）のユーザーは null。 */
    public function toUserSummary(User $user): ?UserSummary
    {
        if (null === $user->getHandle() || $user->isDeleted()) {
            return null;
        }

        return new UserSummary(
            handle: $user->getHandle(),
            displayName: $user->getDisplayName(),
            avatarUrl: $user->getAvatarUrl(),
        );
    }

    public function toProfile(User $user, int $followerCount): UserProfile
    {
        return new UserProfile(
            handle: (string) $user->getHandle(),
            displayName: $user->getDisplayName(),
            avatarUrl: $user->getAvatarUrl(),
            bio: $user->isSuspended() ? null : $user->getBio(),
            companyName: $user->isSuspended() ? null : $user->getCompanyName(),
            companySlug: $user->isSuspended() ? null : $user->getCompanySlug(),
            followerCount: $followerCount,
            suspended: $user->isSuspended(),
            createdAt: (string) self::date($user->getCreatedAt()),
        );
    }

    public function toRoom(User $user, ?string $lastPostAt, ?int $count): RoomSummary
    {
        return new RoomSummary(
            user: $this->toUserSummary($user) ?? throw new \LogicException('退会済みユーザーは部屋を持たない'),
            bio: $user->getBio(),
            companyName: $user->getCompanyName(),
            lastPostAt: null !== $lastPostAt ? self::date(new \DateTimeImmutable($lastPostAt)) : null,
            count: $count,
        );
    }

    public function toMe(User $user, int $unreadNotificationCount): Me
    {
        return new Me(
            id: (string) $user->getId(),
            handle: $user->getHandle(),
            displayName: $user->getDisplayName(),
            avatarUrl: $user->getAvatarUrl(),
            bio: $user->getBio(),
            companyName: $user->getCompanyName(),
            companySlug: $user->getCompanySlug(),
            role: $user->getRole()->value,
            unreadNotificationCount: $unreadNotificationCount,
        );
    }

    public function toNotification(Notification $notification): NotificationItem
    {
        $post = $notification->getPost();
        $thread = $post->getParent() ?? $post;

        return new NotificationItem(
            id: (string) $notification->getId(),
            type: $notification->getType()->value,
            actor: $this->toUserSummary($notification->getActor()),
            postId: (string) $post->getId(),
            threadId: (string) $thread->getId(),
            threadHandle: $thread->getAuthor()->getHandle(),
            excerpt: $post->isVisible() ? self::excerpt($post->getBodyHtml()) : '（表示できない投稿です）',
            readAt: self::date($notification->getReadAt()),
            createdAt: (string) self::date($notification->getCreatedAt()),
        );
    }

    public function toAdminUser(User $user): AdminUser
    {
        return new AdminUser(
            id: (string) $user->getId(),
            handle: $user->getHandle(),
            displayName: $user->getDisplayName(),
            avatarUrl: $user->getAvatarUrl(),
            role: $user->getRole()->value,
            suspendedAt: self::date($user->getSuspendedAt()),
            createdAt: (string) self::date($user->getCreatedAt()),
        );
    }

    public function toAdminPost(Post $post): AdminPost
    {
        return new AdminPost(
            id: (string) $post->getId(),
            parentId: null !== $post->getParent() ? (string) $post->getParent()->getId() : null,
            author: $this->toAdminUser($post->getAuthor()),
            bodyMarkdown: $post->getBodyMarkdown(),
            imageKey: $post->getImageKey(),
            hiddenAt: self::date($post->getHiddenAt()),
            createdAt: (string) self::date($post->getCreatedAt()),
        );
    }

    public function toAdminReport(Report $report): AdminReport
    {
        $post = $report->getPost();

        return new AdminReport(
            id: (string) $report->getId(),
            post: $this->toAdminPost($post),
            postState: match (true) {
                $post->isDeleted() => 'deleted',
                !$post->isVisible() => 'hidden',
                default => 'visible',
            },
            reporter: $this->toAdminUser($report->getReporter()),
            reason: $report->getReason()->value,
            detail: $report->getDetail(),
            resolution: $report->getResolution()?->value,
            resolvedAt: self::date($report->getResolvedAt()),
            createdAt: (string) self::date($report->getCreatedAt()),
        );
    }

    /** HTML からタグを落として冒頭だけを返す（通知・OGP の説明文用）。 */
    public static function excerpt(string $html, int $length = 80): string
    {
        $text = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5)) ?? '');

        return mb_strlen($text) > $length ? mb_substr($text, 0, $length).'…' : $text;
    }

    private static function date(?\DateTimeImmutable $date): ?string
    {
        return $date?->format(\DateTimeInterface::ATOM);
    }
}
