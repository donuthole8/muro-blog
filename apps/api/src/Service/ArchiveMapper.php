<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\ArchivedPostDetail;
use App\Dto\ArchivedPostSummary;
use App\Dto\TagSummary;
use App\Dto\TagWithCount;
use App\Entity\ArchivedPost;
use App\Entity\Tag;

/**
 * 旧ブログ記事（アーカイブ）とタグを API のレスポンス DTO に変換する。
 *
 * 日時は常に ISO 8601 文字列にして返す。
 * フロント側は openapi-typescript が生成した型で string として受け取る。
 */
final class ArchiveMapper
{
    public function toSummary(ArchivedPost $post): ArchivedPostSummary
    {
        return new ArchivedPostSummary(
            id: (int) $post->getId(),
            slug: $post->getSlug(),
            title: $post->getTitle(),
            emoji: $post->getEmoji(),
            excerpt: $post->getExcerpt(),
            publishedAt: $this->formatDate($post->getPublishedAt()),
            tags: $this->toTagSummaries($post),
        );
    }

    public function toDetail(ArchivedPost $post): ArchivedPostDetail
    {
        return new ArchivedPostDetail(
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
    private function toTagSummaries(ArchivedPost $post): array
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
