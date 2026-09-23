<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Entity\User;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/** times の API に共通する処理。 */
abstract class ApiController extends AbstractController
{
    /**
     * 書き込み系の前提。handle を決めていない（部屋を持っていない）人は
     * 投稿・リアクション・フォローができない。
     */
    protected function activeUser(): User
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }
        if (null === $user->getHandle()) {
            throw new AccessDeniedHttpException('先に handle を決めてください。');
        }

        return $user;
    }

    protected function currentUser(): User
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        return $user;
    }

    protected function notFound(string $message = 'リソースが見つかりません。'): JsonResponse
    {
        return new JsonResponse(['message' => $message, 'errors' => new \stdClass()], 404);
    }

    protected function noContent(): JsonResponse
    {
        return new JsonResponse(null, 204);
    }
}
