<?php

declare(strict_types=1);

namespace App\Security;

use App\Auth\SessionManager;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAuthenticationException;
use Symfony\Component\Security\Http\AccessToken\AccessTokenHandlerInterface;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;

/**
 * Authorization: Bearer のセッショントークンからログインユーザーを引く。
 */
final readonly class SessionTokenHandler implements AccessTokenHandlerInterface
{
    public function __construct(private SessionManager $sessions)
    {
    }

    public function getUserBadgeFrom(string $accessToken): UserBadge
    {
        $session = $this->sessions->find($accessToken);

        if (null === $session) {
            throw new CustomUserMessageAuthenticationException('ログインの有効期限が切れました。もう一度ログインしてください。');
        }

        $user = $session->getUser();

        return new UserBadge($user->getUserIdentifier(), static fn () => $user);
    }
}
