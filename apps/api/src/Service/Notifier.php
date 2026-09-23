<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Notification;
use App\Entity\Post;
use App\Entity\User;
use App\Enum\NotificationType;
use App\Repository\BlockRepository;
use App\Repository\NotificationRepository;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * アプリ内通知（ベル）を作る。自分の行動で自分に通知は飛ばさない。
 * 呼び出し側の flush でまとめて保存される。
 */
final readonly class Notifier
{
    public function __construct(
        private EntityManagerInterface $em,
        private NotificationRepository $notifications,
        private UserRepository $users,
        private BlockRepository $blocks,
    ) {
    }

    /**
     * 投稿の作成時。返信なら親投稿の持ち主へ、本文の @handle へはメンションとして。
     * 親投稿の持ち主がメンションもされていたら、通知は返信の1件にまとめる。
     * 投稿者をブロックしている人には通知しない。
     *
     * @param list<string> $mentionedHandles
     */
    public function onPostCreated(Post $post, array $mentionedHandles): void
    {
        $actor = $post->getAuthor();
        $parent = $post->getParent();
        $replyTo = null !== $parent && $parent->isVisible() ? $parent->getAuthor() : null;
        $mentioned = $this->users->findActiveByHandles($mentionedHandles);

        // ブロックしている人は「通知済み」扱いにして飛ばす
        $candidates = null !== $replyTo ? [$replyTo, ...$mentioned] : $mentioned;
        $notified = [(string) $actor->getId() => true, ...$this->blocks->findBlockersAmong($candidates, $actor)];

        if (null !== $replyTo) {
            $this->push($replyTo, NotificationType::Reply, $actor, $post, $notified);
        }

        foreach ($mentioned as $user) {
            $this->push($user, NotificationType::Mention, $actor, $post, $notified);
        }
    }

    public function onReactionAdded(Post $post, User $actor): void
    {
        $owner = $post->getAuthor();
        if ($owner->getId()->equals($actor->getId()) || $this->blocks->isBlocking($owner, $actor)) {
            return;
        }

        $notification = new Notification($owner, NotificationType::Reaction, $actor, $post);
        if ($this->notifications->hasUnreadDuplicate($notification)) {
            return;
        }

        $this->em->persist($notification);
    }

    /**
     * 部屋がフォローされたとき。付け外しを繰り返しても通知は1回だけ。
     * ブロック中の相手はそもそもフォローできない（BlockController がフォローを外し、
     * FollowController が弾く）ので、ここでは見ない。
     */
    public function onFollowed(User $followee, User $follower): void
    {
        if (!$followee->isActive() || $this->notifications->hasFollowNotification($followee, $follower)) {
            return;
        }

        $this->em->persist(new Notification($followee, NotificationType::Follow, $follower, null));
    }

    /** @param array<string, true> $notified 通知済みのユーザー ID（重複防止） */
    private function push(User $to, NotificationType $type, User $actor, Post $post, array &$notified): void
    {
        $key = (string) $to->getId();
        if (isset($notified[$key]) || !$to->isActive()) {
            return;
        }

        $notified[$key] = true;
        $this->em->persist(new Notification($to, $type, $actor, $post));
    }
}
