<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\User;
use App\Enum\RateLimitedAction;
use Psr\Container\ContainerInterface;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;

/**
 * 書き込み系のユーザー単位のレート制限。超えたら 429 と Retry-After を返す。
 *
 * 登録から間もないアカウントには厳しい方の limiter（`<name>_new`）を使う。
 */
final readonly class ActionRateLimiter
{
    /** この期間内に登録したアカウントを「新規」として扱う。 */
    private const NEW_ACCOUNT_PERIOD = '-24 hours';

    public function __construct(
        /** limiter 名 => RateLimiterFactory（config/services.yaml で渡す） */
        private ContainerInterface $limiters,
    ) {
    }

    public function consume(RateLimitedAction $action, User $user): void
    {
        $name = $action->value.($this->isNewAccount($user) ? '_new' : '');

        /** @var RateLimiterFactoryInterface $factory */
        $factory = $this->limiters->get($name);
        $limit = $factory->create((string) $user->getId())->consume();

        if ($limit->isAccepted()) {
            return;
        }

        $retryAfter = max(1, $limit->getRetryAfter()->getTimestamp() - time());

        throw new TooManyRequestsHttpException($retryAfter, sprintf(
            '%sの回数が上限に達しました。%sほど待ってからもう一度お試しください。',
            $action->label(),
            self::humanize($retryAfter),
        ));
    }

    private function isNewAccount(User $user): bool
    {
        return $user->getCreatedAt() > new \DateTimeImmutable(self::NEW_ACCOUNT_PERIOD);
    }

    private static function humanize(int $seconds): string
    {
        return match (true) {
            $seconds < 60 => sprintf('%d 秒', $seconds),
            $seconds < 3600 => sprintf('%d 分', (int) ceil($seconds / 60)),
            default => sprintf('%d 時間', (int) ceil($seconds / 3600)),
        };
    }
}
