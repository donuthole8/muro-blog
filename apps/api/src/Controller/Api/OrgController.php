<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\OrgRooms;
use App\Dto\ValidationError;
use App\Entity\User;
use App\Http\CacheHeaders;
use App\Repository\PostRepository;
use App\Repository\UserRepository;
use App\Service\TimesMapper;
use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

/**
 * 会社の人たちの部屋一覧。所属は自己申告で認証していないので、
 * 画面側で「自己申告に基づく一覧です」と明記する。
 */
#[OA\Tag(name: 'discover')]
final class OrgController extends ApiController
{
    private const LIMIT = 100;

    public function __construct(
        private readonly UserRepository $users,
        private readonly PostRepository $posts,
        private readonly TimesMapper $mapper,
    ) {
    }

    #[Route('/api/orgs/{slug}/users', name: 'api_orgs_users', requirements: ['slug' => '[^/]{1,100}'], methods: ['GET'])]
    #[OA\Response(response: 200, description: '同じ会社を自己申告している人の部屋', content: new OA\JsonContent(ref: new Model(type: OrgRooms::class)))]
    #[OA\Response(response: 404, description: '該当する人がいない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function users(string $slug): JsonResponse
    {
        $members = $this->users->findByCompanySlug($slug, self::LIMIT);
        if ([] === $members) {
            return $this->notFound('この会社の部屋はまだありません。');
        }

        $latest = $this->posts->findLatestParentAtByAuthors(
            array_map(static fn (User $user): string => $user->getId()->toRfc4122(), $members),
        );

        $rooms = array_map(
            fn (User $user) => $this->mapper->toRoom($user, $latest[$user->getId()->toRfc4122()] ?? null, null),
            $members,
        );
        // 最近書いている人を上に
        usort($rooms, static fn ($a, $b): int => strcmp((string) $b->lastPostAt, (string) $a->lastPostAt));

        return CacheHeaders::public($this->json(new OrgRooms(
            slug: $slug,
            name: $this->mostCommonName($members),
            rooms: $rooms,
        )), CacheHeaders::AGGREGATE);
    }

    /** @param list<User> $members */
    private function mostCommonName(array $members): string
    {
        $counts = array_count_values(array_map(static fn (User $u): string => (string) $u->getCompanyName(), $members));
        arsort($counts);

        return (string) array_key_first($counts);
    }
}
