<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\PostInput;
use App\Dto\PostUpdateInput;
use App\Entity\Post;
use App\Entity\Tag;
use App\Entity\User;
use App\Enum\RateLimitedAction;
use App\Exception\InvalidInputException;
use App\Repository\BlockRepository;
use App\Repository\PostRepository;
use App\Repository\TagRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Uid\Ulid;

/**
 * times の投稿の作成・編集・削除。
 *
 * Markdown → HTML の変換をここに集約し、「保存された bodyHtml は必ず bodyMarkdown と
 * 対応している」ことを保証する。カウンタ（reply_count）と通知もここで動かす。
 */
final readonly class TimesPostWriter
{
    /** Worker の画像アップロード（lib/uploads.ts）が作るキーの形。先頭は投稿者の ID。 */
    private const IMAGE_KEY_PATTERN = '/^u_([0-9A-HJKMNP-TV-Z]{26})_[0-9a-f-]{36}\.(?:webp|jpg|png|gif)$/';

    public function __construct(
        private EntityManagerInterface $em,
        private PostRepository $posts,
        private TagRepository $tags,
        private PostBodyRenderer $renderer,
        private Notifier $notifier,
        private LinkCardFiller $linkCards,
        private BlockRepository $blocks,
        private ActionRateLimiter $rateLimiter,
    ) {
    }

    public function create(User $author, PostInput $input): Post
    {
        $this->assertCanPost($author);

        $body = trim($input->bodyMarkdown);
        if ('' === $body && null === $input->imageKey) {
            throw InvalidInputException::field('bodyMarkdown', '本文か画像のどちらかは必要です。');
        }

        $parent = null;
        if (null !== $input->parentId) {
            $parent = $this->posts->findOneById(Ulid::fromString($input->parentId));
            if (null === $parent || $parent->isReply()) {
                // 返信への返信は作らない（スレッドは1階層）
                throw InvalidInputException::field('parentId', '返信先の投稿が見つかりません。');
            }
            if (!$parent->isVisible()) {
                throw InvalidInputException::field('parentId', '削除・非表示になった投稿には返信できません。');
            }
            if ([] !== $input->tagSlugs) {
                throw InvalidInputException::field('tagSlugs', '返信にはタグを付けられません。');
            }
            if ($this->blocks->isBlocking($parent->getAuthor(), $author)) {
                throw new AccessDeniedHttpException('この投稿には返信できません。');
            }
        }

        // 入力の検証を通ったものだけを数える（打ち間違いで枠を減らさない）
        $this->rateLimiter->consume(RateLimitedAction::Post, $author);

        $post = new Post($author, $parent);
        $rendered = $this->renderer->render($body);
        $post->setBody($body, $rendered->html)
            ->setImageKey($this->validImageKey($author, $input->imageKey))
            ->replaceTags($this->resolveTags($input->tagSlugs));

        $this->em->wrapInTransaction(function () use ($post, $parent, $rendered): void {
            $this->em->persist($post);
            $this->notifier->onPostCreated($post, $rendered->mentionedHandles);
            $this->em->flush();

            if (null !== $parent) {
                $this->posts->incrementReplyCount($parent, $post->getCreatedAt());
                $this->em->refresh($parent);
            }
        });

        $this->linkCards->schedule($post);

        return $post;
    }

    public function update(User $editor, Post $post, PostUpdateInput $input): Post
    {
        $this->assertCanPost($editor);
        $this->assertOwner($editor, $post);

        if (!$post->isVisible()) {
            throw new NotFoundHttpException();
        }

        $body = trim($input->bodyMarkdown);
        if ('' === $body && null === $post->getImageKey()) {
            throw InvalidInputException::field('bodyMarkdown', '本文は空にできません。');
        }
        if ($post->isReply() && [] !== $input->tagSlugs) {
            throw InvalidInputException::field('tagSlugs', '返信にはタグを付けられません。');
        }

        // 編集ではメンション通知を飛ばし直さない（編集のたびに通知が飛ぶのを防ぐ）
        $post->setBody($body, $this->renderer->render($body)->html)
            ->replaceTags($this->resolveTags($input->tagSlugs))
            ->markEdited();

        $this->em->flush();
        $this->linkCards->schedule($post);

        return $post;
    }

    /**
     * 論理削除。消えた画像のキーを返す（R2 からの削除は Worker が行う）。
     */
    public function delete(Post $post): ?string
    {
        if ($post->isDeleted()) {
            return null;
        }

        $imageKey = $post->getImageKey();

        $this->em->wrapInTransaction(function () use ($post): void {
            $post->softDelete();
            $this->em->flush();

            if (null !== $post->getParent()) {
                $this->posts->decrementReplyCount($post->getParent());
            }
        });

        return $imageKey;
    }

    public function deleteAsAuthor(User $user, Post $post): ?string
    {
        $this->assertOwner($user, $post);

        return $this->delete($post);
    }

    private function assertCanPost(User $user): void
    {
        if (null === $user->getHandle()) {
            throw new AccessDeniedHttpException('先に handle を決めてください。');
        }
    }

    private function assertOwner(User $user, Post $post): void
    {
        if (!$post->getAuthor()->getId()->equals($user->getId())) {
            throw new AccessDeniedHttpException('自分の投稿しか編集・削除できません。');
        }
    }

    private function validImageKey(User $author, ?string $key): ?string
    {
        if (null === $key || '' === $key) {
            return null;
        }

        // 他人のアップロードを自分の投稿に付けられないよう、キーに埋めた投稿者 ID を照合する
        if (1 !== preg_match(self::IMAGE_KEY_PATTERN, $key, $m) || $m[1] !== (string) $author->getId()) {
            throw InvalidInputException::field('imageKey', '画像の指定が不正です。アップロードし直してください。');
        }

        return $key;
    }

    /**
     * @param list<string> $slugs
     *
     * @return list<Tag>
     */
    private function resolveTags(array $slugs): array
    {
        $slugs = array_values(array_unique($slugs));
        $tags = $this->tags->findBySlugs($slugs);

        if (count($tags) !== count($slugs)) {
            $found = array_map(static fn (Tag $tag): string => $tag->getSlug(), $tags);
            $missing = implode(', ', array_diff($slugs, $found));

            throw InvalidInputException::field('tagSlugs', sprintf('タグ %s は存在しません。', $missing));
        }

        return $tags;
    }
}
