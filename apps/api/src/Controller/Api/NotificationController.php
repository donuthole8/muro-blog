<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\NotificationPage;
use App\Http\CacheHeaders;
use App\Http\Cursor;
use App\Repository\NotificationRepository;
use App\Service\TimesMapper;
use Nelmio\ApiDocBundle\Attribute\Model;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/** アプリ内のベル通知（返信・メンション・リアクション）。 */
#[OA\Tag(name: 'notifications')]
#[Security(name: 'SessionToken')]
#[IsGranted('ROLE_USER')]
#[Route('/api/notifications')]
final class NotificationController extends ApiController
{
    public function __construct(
        private readonly NotificationRepository $notifications,
        private readonly TimesMapper $mapper,
    ) {
    }

    #[Route('', name: 'api_notifications_index', methods: ['GET'])]
    #[OA\Parameter(name: 'cursor', in: 'query', description: '前のページの nextCursor', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(response: 200, description: '新しい順', content: new OA\JsonContent(ref: new Model(type: NotificationPage::class)))]
    public function index(#[MapQueryParameter] ?string $cursor = null): JsonResponse
    {
        $user = $this->currentUser();
        ['items' => $items, 'nextCursor' => $next] = $this->notifications->findPage($user, Cursor::parse($cursor), Cursor::PAGE_SIZE);

        return CacheHeaders::private($this->json(new NotificationPage(
            items: array_map($this->mapper->toNotification(...), $items),
            nextCursor: $next,
            unreadCount: $this->notifications->countUnread($user),
        )));
    }

    #[Route('/read', name: 'api_notifications_read', methods: ['POST'])]
    #[OA\Response(response: 204, description: 'すべて既読にした')]
    public function markAllRead(): JsonResponse
    {
        $this->notifications->markAllRead($this->currentUser());

        return $this->noContent();
    }
}
