<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Repository\FollowRepository;
use App\Repository\PostRepository;
use App\Repository\UserRepository;
use App\Service\OgImageRenderer;
use App\Service\TimesMapper;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;
use Symfony\Component\Uid\Ulid;

/**
 * 部屋とスレッドの OGP 画像。web の /og/rooms/:handle.png と /og/threads/:id.png から呼ばれる。
 *
 * 描画は重いので、エッジで1日キャッシュする。投稿を編集したときは web 側が
 * URL に ?v=編集日時 を付けるので、古い画像が出続けることはない。
 */
#[OA\Tag(name: 'og')]
final class OgImageController extends ApiController
{
    private const CACHE_SECONDS = 86400;

    public function __construct(
        private readonly OgImageRenderer $renderer,
        private readonly UserRepository $users,
        private readonly PostRepository $posts,
        private readonly FollowRepository $follows,
    ) {
    }

    #[Route('/api/og/rooms/{handle}.png', name: 'api_og_room', requirements: ['handle' => '[A-Za-z0-9_]{1,32}'], methods: ['GET'])]
    #[OA\Response(response: 200, description: '部屋の共有カード（PNG）', content: new OA\MediaType(mediaType: 'image/png'))]
    public function room(string $handle): Response
    {
        $user = $this->users->findRoomOwner(strtolower($handle));
        if (null === $user || null === $user->getHandle() || !$this->renderer->isAvailable()) {
            return new Response('', 404);
        }

        return $this->png($this->renderer->room(
            $user->getHandle(),
            $user->getDisplayName(),
            $user->getBio(),
            $this->follows->countFollowers($user),
        ));
    }

    #[Route('/api/og/threads/{id}.png', name: 'api_og_thread', requirements: ['id' => Requirement::ULID], methods: ['GET'])]
    #[OA\Response(response: 200, description: 'スレッドの共有カード（PNG）', content: new OA\MediaType(mediaType: 'image/png'))]
    public function thread(string $id): Response
    {
        $post = $this->posts->findOneById(Ulid::fromString($id));
        $author = $post?->getAuthor();
        if (null === $post || $post->isReply() || !$post->isVisible() || null === $author?->getHandle()
            || $author->isSuspended() || !$this->renderer->isAvailable()) {
            return new Response('', 404);
        }

        return $this->png($this->renderer->thread(
            $author->getHandle(),
            $author->getDisplayName(),
            TimesMapper::excerpt($post->getBodyHtml(), 200),
            $post->getReplyCount(),
        ));
    }

    private function png(string $bytes): Response
    {
        return new Response($bytes, 200, [
            'Content-Type' => 'image/png',
            'Cache-Control' => sprintf('public, max-age=%1$d, s-maxage=%1$d', self::CACHE_SECONDS),
        ]);
    }
}
