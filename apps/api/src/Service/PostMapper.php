<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\PostAdminDetail;
use App\Dto\PostAdminSummary;
use App\Dto\PostDetail;
use App\Dto\PostSummary;
use App\Dto\TagSummary;
use App\Dto\TagWithCount;
use App\Entity\Post;
use App\Entity\Tag;

/**
 * エンティティを API のレスポンス DTO に変換する。
 *
 * 日時は常に ISO 8601 文字列にして返す。
 * フロント側は openapi-typescript が生成した型で string として受け取る。
 */
final class PostMapper
{
    public function toSummary(Post $post): PostSummary
    {
        return new PostSummary(
            id: (int) $post->getId(),
            slug: $post->getSlug(),
            title: $post->getTitle(),
            emoji: $post->getEmoji(),
            excerpt: $post->getExcerpt(),
            publishedAt: $this->formatDate($post->getPublishedAt()),
            tags: $this->toTagSummaries($post),
        );
    }

    public function toDetail(Post $post): PostDetail
    {
        return new PostDetail(
            id: (int) $post->getId(),
            slug: $post->getSlug(),
            title: $post->getTitle(),
            emoji: $post->getEmoji(),
            excerpt: $post->getExcerpt(),
            bodyHtml: $post->getBodyHtml(),
            publishedAt: $this->formatDate($post->getPublishedAt()),
            updatedAt: (string) $this->formatDate($post->getUpdatedAt()),
            tags: $this->toTagSummaries($post),
        );
    }

    public function toAdminSummary(Post $post): PostAdminSummary
    {
        return new PostAdminSummary(
            id: (int) $post->getId(),
            slug: $post->getSlug(),
            title: $post->getTitle(),
            emoji: $post->getEmoji(),
            status: $post->getStatus()->value,
            publishedAt: $this->formatDate($post->getPublishedAt()),
            updatedAt: (string) $this->formatDate($post->getUpdatedAt()),
            tags: $this->toTagSummaries($post),
        );
    }

    public function toAdminDetail(Post $post): PostAdminDetail
    {
        return new PostAdminDetail(
            id: (int) $post->getId(),
            slug: $post->getSlug(),
            title: $post->getTitle(),
            emoji: $post->getEmoji(),
            bodyMd: $post->getBodyMd(),
            excerpt: $post->getExcerpt(),
            status: $post->getStatus()->value,
            publishedAt: $this->formatDate($post->getPublishedAt()),
            createdAt: (string) $this->formatDate($post->getCreatedAt()),
            updatedAt: (string) $this->formatDate($post->getUpdatedAt()),
            tags: $this->toTagSummaries($post),
        );
    }

    public function toTagSummary(Tag $tag): TagSummary
    {
        return new TagSummary(name: $tag->getName(), slug: $tag->getSlug());
    }

    /**
     * @param array{tag: Tag, postCount: int} $row
     */
    public function toTagWithCount(array $row): TagWithCount
    {
        return new TagWithCount(
            name: $row['tag']->getName(),
            slug: $row['tag']->getSlug(),
            postCount: $row['postCount'],
        );
    }

    /**
     * @return list<TagSummary>
     */
    private function toTagSummaries(Post $post): array
    {
        $tags = array_map($this->toTagSummary(...), $post->getTags()->toArray());
        usort($tags, static fn (TagSummary $a, TagSummary $b): int => strcmp($a->name, $b->name));

        return array_values($tags);
    }

    private function formatDate(?\DateTimeImmutable $date): ?string
    {
        return $date?->format(\DateTimeInterface::ATOM);
    }
}
