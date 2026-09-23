<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\BlockedUser;
use App\Dto\ValidationError;
use App\Entity\Block;
use App\Http\CacheHeaders;
use App\Repository\BlockRepository;
use App\Repository\FollowRepository;
use App\Repository\UserRepository;
use App\Service\TimesMapper;
use Doctrine\ORM\EntityManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Model;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * ブロック。ブロックした相手は自分の投稿に返信・リアクションできなくなり、
 * 相手からの通知も届かなくなる。相手の投稿は自分の画面で折りたたまれる
 * （公開 API はキャッシュを共有しているので、折りたたみは viewer-state を見て web 側で行う）。
 */
#[OA\Tag(name: 'blocks')]
#[Security(name: 'SessionToken')]
#[IsGranted('ROLE_USER')]
final class BlockController extends ApiController
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly BlockRepository $blocks,
        private readonly FollowRepository $follows,
        private readonly TimesMapper $mapper,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/blocks/{handle}', name: 'api_blocks_put', requirements: ['handle' => '[A-Za-z0-9_]{1,32}'], methods: ['PUT'])]
    #[OA\Response(response: 204, description: 'ブロックした（既にしていても 204）。お互いのフォローは外す')]
    #[OA\Response(response: 404, description: 'ユーザーが存在しない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function block(string $handle): JsonResponse
    {
        $me = $this->activeUser();
        $target = $this->users->findOneByHandle(strtolower($handle));
        if (null === $target || $target->getId()->equals($me->getId())) {
            return $this->notFound('ユーザーが見つかりません。');
        }

        if (!$this->blocks->isBlocking($me, $target)) {
            $this->em->wrapInTransaction(function () use ($me, $target): void {
                $this->em->persist(new Block($me, $target));
                foreach ([[$me, $target], [$target, $me]] as [$follower, $followee]) {
                    $follow = $this->follows->findPair($follower, $followee);
                    if (null !== $follow) {
                        $this->em->remove($follow);
                    }
                }
                $this->em->flush();
            });
        }

        return $this->noContent();
    }

    #[Route('/api/blocks/{handle}', name: 'api_blocks_delete', requirements: ['handle' => '[A-Za-z0-9_]{1,32}'], methods: ['DELETE'])]
    #[OA\Response(response: 204, description: 'ブロックを解除した（していなくても 204）')]
    public function unblock(string $handle): JsonResponse
    {
        $me = $this->currentUser();
        $target = $this->users->findOneByHandle(strtolower($handle));
        $block = null !== $target ? $this->blocks->findPair($me, $target) : null;

        if (null !== $block) {
            $this->em->remove($block);
            $this->em->flush();
        }

        return $this->noContent();
    }

    #[Route('/api/blocks', name: 'api_blocks_index', methods: ['GET'])]
    #[OA\Response(
        response: 200,
        description: 'ブロック中のユーザー（新しい順）',
        content: new OA\JsonContent(type: 'array', items: new OA\Items(ref: new Model(type: BlockedUser::class))),
    )]
    public function index(): JsonResponse
    {
        $items = [];
        foreach ($this->blocks->findByBlocker($this->currentUser()) as $block) {
            $user = $this->mapper->toUserSummary($block->getBlocked());
            if (null !== $user) {
                $items[] = new BlockedUser($user, $block->getCreatedAt()->format(\DateTimeInterface::ATOM));
            }
        }

        return CacheHeaders::private($this->json($items));
    }
}
