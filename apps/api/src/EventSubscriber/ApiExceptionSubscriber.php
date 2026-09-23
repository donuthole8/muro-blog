<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use App\Exception\SlugAlreadyUsedException;
use App\Exception\UnknownTagException;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelEvents;
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
        // Symfony 本体のエラーレンダラより先に処理する
        return [KernelEvents::EXCEPTION => ['onKernelException', 16]];
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

        $status = match (true) {
            $exception instanceof SlugAlreadyUsedException => 409,
            $exception instanceof UnknownTagException => 400,
            $exception instanceof HttpExceptionInterface => $exception->getStatusCode(),
            default => null,
        };

        if (null === $status) {
            return;
        }

        // ValueResolver が投げる 404 には内部クラス名が含まれるため、外には出さない
        $message = 404 === $status
            ? 'リソースが見つかりません。'
            : $exception->getMessage();

        $event->setResponse(new JsonResponse([
            'message' => $message,
            'errors' => new \stdClass(),
        ], $status));
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
