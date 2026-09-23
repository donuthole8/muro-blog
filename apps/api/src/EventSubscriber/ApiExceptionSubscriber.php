<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use App\Exception\InvalidInputException;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\Security\Core\Exception\AccessDeniedException;
use Symfony\Component\Validator\Exception\ValidationFailedException;

/**
 * /api/ 配下の例外を必ず JSON で返す。
 *
 * Symfony の既定は HTML のエラーページなので、
 * これがないとフロントの openapi-fetch が JSON をパースできずに落ちる。
 */
final class ApiExceptionSubscriber implements EventSubscriberInterface
{
    public static function getSubscribedEvents(): array
    {
        // Symfony 本体のエラーレンダラ（-128）より先に、ただし Security の
        // ExceptionListener（1）より後に処理する。先に処理すると、未ログイン時の 401 と
        // 権限不足の 403 への振り分けを Security にさせる前に握りつぶしてしまう。
        return [KernelEvents::EXCEPTION => ['onKernelException', 0]];
    }

    public function onKernelException(ExceptionEvent $event): void
    {
        if (!str_starts_with($event->getRequest()->getPathInfo(), '/api/')) {
            return;
        }

        $exception = $event->getThrowable();

        // MapRequestPayload のバリデーション失敗。フィールド単位のエラーを返す。
        $validationFailure = $this->findValidationFailure($exception);
        if (null !== $validationFailure) {
            $errors = [];
            foreach ($validationFailure->getViolations() as $violation) {
                $errors[$violation->getPropertyPath()] = (string) $violation->getMessage();
            }

            $event->setResponse(new JsonResponse([
                'message' => '入力内容に誤りがあります。',
                'errors' => $errors,
            ], 422));

            return;
        }

        if ($exception instanceof InvalidInputException) {
            $event->setResponse(new JsonResponse([
                'message' => $exception->getMessage(),
                'errors' => $exception->errors,
            ], 422));

            return;
        }

        $status = match (true) {
            $exception instanceof HttpExceptionInterface => $exception->getStatusCode(),
            default => null,
        };

        if (null === $status) {
            return;
        }

        // ValueResolver が投げる 404 には内部クラス名が含まれるため、外には出さない。
        // Security が投げる 403（ROLE_ADMIN がない等）も英語の内部メッセージなので差し替える。
        $message = match (true) {
            404 === $status => 'リソースが見つかりません。',
            $exception->getPrevious() instanceof AccessDeniedException => 'この操作を行う権限がありません。',
            default => $exception->getMessage(),
        };

        // 429 の Retry-After など、HttpException が持つヘッダーはそのまま返す
        $headers = $exception instanceof HttpExceptionInterface ? $exception->getHeaders() : [];

        $event->setResponse(new JsonResponse([
            'message' => $message,
            'errors' => new \stdClass(),
        ], $status, $headers));
    }

    private function findValidationFailure(\Throwable $exception): ?ValidationFailedException
    {
        for ($e = $exception; null !== $e; $e = $e->getPrevious()) {
            if ($e instanceof ValidationFailedException) {
                return $e;
            }
        }

        return null;
    }
}
