<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * /api/admin/* を共有シークレットで保護する。
 *
 * Phase 1 の想定: 管理画面はローカルからのみ起動する。
 * Phase 2 で Cloudflare Access を前段に置き、Worker からこのヘッダーを付けて呼ぶ。
 */
final readonly class AdminTokenSubscriber implements EventSubscriberInterface
{
    public function __construct(
        #[Autowire(env: 'ADMIN_TOKEN')]
        private string $adminToken,
    ) {
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::REQUEST => ['onKernelRequest', 8]];
    }

    public function onKernelRequest(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        if (!str_starts_with($event->getRequest()->getPathInfo(), '/api/admin')) {
            return;
        }

        // 空のトークンで全通過してしまう事故を防ぐ
        if ('' === $this->adminToken) {
            $event->setResponse(new JsonResponse(
                ['message' => 'ADMIN_TOKEN が設定されていません。'],
                500,
            ));

            return;
        }

        $presented = (string) $event->getRequest()->headers->get('X-Admin-Token', '');

        if (!hash_equals($this->adminToken, $presented)) {
            $event->setResponse(new JsonResponse(['message' => '認証が必要です。'], 401));
        }
    }
}
