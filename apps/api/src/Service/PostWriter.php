<?php

declare(strict_types=1);

namespace App\Service;

use App\Dto\PostInput;
use App\Entity\Post;
use App\Exception\SlugAlreadyUsedException;
use App\Exception\UnknownTagException;
use App\Repository\PostRepository;
use App\Repository\TagRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * 記事の作成・更新を担う。
 *
 * Markdown → HTML の変換をここに集約し、
 * 「保存された記事の bodyHtml は必ず bodyMd と対応している」ことを保証する。
 */
final class PostWriter
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PostRepository $posts,
        private readonly TagRepository $tags,
        private readonly MarkdownRenderer $markdown,
    ) {
    }

    /**
     * @throws SlugAlreadyUsedException
     * @throws UnknownTagException
     */
    public function create(PostInput $input): Post
    {
        return $this->apply(new Post(), $input);
    }

    /**
     * @throws SlugAlreadyUsedException
     * @throws UnknownTagException
     */
    public function update(Post $post, PostInput $input): Post
    {
        return $this->apply($post, $input);
    }

    /**
     * @throws SlugAlreadyUsedException
     * @throws UnknownTagException
     */
    private function apply(Post $post, PostInput $input): Post
    {
        if ($this->posts->isSlugTaken($input->slug, $post->getId())) {
            throw new SlugAlreadyUsedException($input->slug);
        }

        $post
            ->setTitle($input->title)
            ->setSlug($input->slug)
            ->setEmoji($input->emoji ?: Post::DEFAULT_EMOJI)
            ->setBodyMd($input->bodyMd)
            ->setBodyHtml($this->markdown->toHtml($input->bodyMd))
            ->setExcerpt($input->excerpt ?? $this->markdown->toExcerpt($input->bodyMd));

        $this->syncTags($post, $input->tagSlugs);

        $this->em->persist($post);
        $this->em->flush();

        return $post;
    }

    /**
     * @param list<string> $tagSlugs
     *
     * @throws UnknownTagException
     */
    private function syncTags(Post $post, array $tagSlugs): void
    {
        $post->clearTags();

        foreach (array_unique($tagSlugs) as $slug) {
            $tag = $this->tags->findOneBySlug($slug);
            if (null === $tag) {
                throw new UnknownTagException($slug);
            }
            $post->addTag($tag);
        }
    }
}
