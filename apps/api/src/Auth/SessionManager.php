<?php

declare(strict_types=1);

namespace App\Auth;

use App\Entity\AuthSession;
use App\Entity\User;
use App\Repository\AuthSessionRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * ログインセッションの発行・検証・破棄。
 *
 * トークンは乱数で作り、DB には sha256 だけを残す。
 * Worker は受け取ったトークンを HttpOnly Cookie に入れ、API を呼ぶときに Bearer で渡す。
 */
final readonly class SessionManager
{
    public function __construct(
        private EntityManagerInterface $em,
        private AuthSessionRepository $sessions,
    ) {
    }

    /** @return array{token: string, session: AuthSession} */
    public function issue(User $user): array
    {
        $this->sessions->deleteExpired();

        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $session = new AuthSession($user, self::hash($token));

        $this->em->persist($session);
        $this->em->flush();

        return ['token' => $token, 'session' => $session];
    }

    public function find(string $token): ?AuthSession
    {
        return $this->sessions->findValidByTokenHash(self::hash($token));
    }

    public function revoke(string $token): void
    {
        $this->sessions->deleteByTokenHash(self::hash($token));
    }

    public function revokeAll(User $user): void
    {
        $this->sessions->deleteAllForUser($user);
    }

    private static function hash(string $token): string
    {
        return hash('sha256', $token);
    }
}
