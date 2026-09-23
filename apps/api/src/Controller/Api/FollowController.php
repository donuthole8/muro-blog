<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\RoomSummary;
use App\Dto\ValidationError;
use App\Entity\Follow;
use App\Http\CacheHeaders;
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
 * 部屋のフォロー。フォロー中の人の投稿を混ぜたフィードは作らない
 * （人ごとに中身が変わってキャッシュできず、Neon を起こし続けるため）。
 * 代わりに「フォロー中の部屋一覧と未読数」だけを出す。
 */
#[OA\Tag(name: 'follows')]
#[Security(name: 'SessionToken')]
#[IsGranted('ROLE_USER')]
final class FollowController extends ApiController
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly FollowRepository $follows,
        private readonly TimesMapper $mapper,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/follows/{handle}', name: 'api_follows_put', requirements: ['handle' => '[A-Za-z0-9_]{1,32}'], methods: ['PUT'])]
    #[OA\Response(response: 204, description: 'フォローした（既にしていても 204）')]
    #[OA\Response(response: 404, description: '部屋が存在しない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function follow(string $handle): JsonResponse
    {
        $me = $this->activeUser();
        $owner = $this->users->findRoomOwner($handle);
        if (null === $owner || $owner->getId()->equals($me->getId())) {
            return $this->notFound('部屋が見つかりません。');
        }

        if (null === $this->follows->findPair($me, $owner)) {
            $this->em->persist(new Follow($me, $owner));
            $this->em->flush();
        }

        return $this->noContent();
    }

    #[Route('/api/follows/{handle}', name: 'api_follows_delete', requirements: ['handle' => '[A-Za-z0-9_]{1,32}'], methods: ['DELETE'])]
    #[OA\Response(response: 204, description: 'フォローを外した')]
    public function unfollow(string $handle): JsonResponse
    {
        $me = $this->currentUser();
        $owner = $this->users->findOneByHandle($handle);
        $follow = null !== $owner ? $this->follows->findPair($me, $owner) : null;

        if (null !== $follow) {
            $this->em->remove($follow);
            $this->em->flush();
        }

        return $this->noContent();
    }

    #[Route('/api/follows/{handle}/read', name: 'api_follows_read', requirements: ['handle' => '[A-Za-z0-9_]{1,32}'], methods: ['POST'])]
    #[OA\Response(response: 204, description: 'その部屋を既読にした（フォローしていなければ何もしない）')]
    public function markRead(string $handle): JsonResponse
    {
        $me = $this->currentUser();
        $owner = $this->users->findOneByHandle($handle);
        $follow = null !== $owner ? $this->follows->findPair($me, $owner) : null;

        if (null !== $follow) {
            $follow->markRead();
            $this->em->flush();
        }

        return $this->noContent();
    }

    #[Route('/api/following', name: 'api_following', methods: ['GET'])]
    #[OA\Response(
        response: 200,
        description: 'フォロー中の部屋と未読数（count）。未読の多い順',
        content: new OA\JsonContent(type: 'array', items: new OA\Items(ref: new Model(type: RoomSummary::class))),
    )]
    public function following(): JsonResponse
    {
        $rows = $this->follows->findFollowingWithUnread($this->currentUser());
        $users = $this->users->findByIdsIndexed(array_column($rows, 'followee_id'));

        $rooms = [];
        foreach ($rows as $row) {
            $user = $users[$row['followee_id']] ?? null;
            if (null !== $user && null !== $user->getHandle() && !$user->isSuspended()) {
                $rooms[] = $this->mapper->toRoom($user, $row['last_post_at'], $row['unread']);
            }
        }

        return CacheHeaders::private($this->json($rooms));
    }
}
