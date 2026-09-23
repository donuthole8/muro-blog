<?php

declare(strict_types=1);

namespace App\Service;

use App\Auth\SessionManager;
use App\Entity\User;
use App\Repository\FollowRepository;
use App\Repository\NotificationRepository;
use App\Repository\PostRepository;
use App\Repository\ReactionRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * 退会（データ削除）。
 *
 * - 投稿はすべて論理削除して本文・画像を消す。親投稿の行は残し、他人の返信は
 *   「削除されました」の下にぶら下がったまま残す（他人の書いたものは消さない）
 * - 退会者が他人のスレッドに付けた返信はスレッドから消える（返信数も減る）
 * - 付けたリアクション・フォロー・ブロック・通知・セッションは行ごと消す
 * - 退会者が出した通報は、管理上の記録として残す（通報者は「退会したユーザー」と出る）
 * - ユーザーの行は残すが、Google の ID・handle・プロフィールは消す
 *
 * 仕様の詳細は docs/PLAN.md §11「退会したユーザーの投稿の扱い」を参照。
 *
 * 返り値は R2 から消すべき画像のキー（API からは R2 に触れないので Worker が消す）。
 */
final readonly class AccountDeleter
{
    public function __construct(
        private EntityManagerInterface $em,
        private PostRepository $posts,
        private ReactionRepository $reactions,
        private FollowRepository $follows,
        private NotificationRepository $notifications,
        private TimesPostWriter $writer,
        private SessionManager $sessions,
    ) {
    }

    /** @return list<string> */
    public function delete(User $user): array
    {
        $imageKeys = [];

        $this->em->wrapInTransaction(function () use ($user, &$imageKeys): void {
            foreach ($this->posts->findAllByAuthor($user) as $post) {
                $key = $this->writer->delete($post);
                if (null !== $key) {
                    $imageKeys[] = $key;
                }
            }

            $this->reactions->removeAllByUser($user);
            $this->notifications->deleteAllInvolving($user);
            $this->em->createQuery('DELETE FROM App\Entity\Follow f WHERE f.follower = :u OR f.followee = :u')
                ->setParameter('u', $user->getId(), 'ulid')
                ->execute();
            $this->em->createQuery('DELETE FROM App\Entity\Block b WHERE b.blocker = :u OR b.blocked = :u')
                ->setParameter('u', $user->getId(), 'ulid')
                ->execute();
            $this->sessions->revokeAll($user);

            $user->anonymize();
            $this->em->flush();
        });

        return $imageKeys;
    }
}
