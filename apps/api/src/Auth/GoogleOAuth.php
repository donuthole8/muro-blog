<?php

declare(strict_types=1);

namespace App\Auth;

use League\OAuth2\Client\Provider\Google;
use League\OAuth2\Client\Provider\GoogleUser;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Google OAuth（認可コードフロー）。
 *
 * ブラウザは Symfony に直接来ない（Worker が中継する）ので、Symfony 側の
 * リダイレクト用ルートや PHP セッションに state を持つ仕組み（knpuniversity/oauth2-client-bundle）は
 * 噛み合わない。そのため、その土台の league/oauth2-google を直接使い、
 * state の保存と照合は Worker が Cookie で行う。
 *
 * コールバック URL は Worker 側の /auth/callback。Google Cloud Console に登録したものと
 * 一字一句同じ値を GOOGLE_REDIRECT_URI に設定すること。
 */
final class GoogleOAuth
{
    private ?Google $provider = null;

    public function __construct(
        #[Autowire(env: 'default::GOOGLE_CLIENT_ID')]
        private readonly ?string $clientId,
        #[Autowire(env: 'default::GOOGLE_CLIENT_SECRET')]
        private readonly ?string $clientSecret,
        #[Autowire(env: 'default::GOOGLE_REDIRECT_URI')]
        private readonly ?string $redirectUri,
    ) {
    }

    public function isConfigured(): bool
    {
        return '' !== (string) $this->clientId && '' !== (string) $this->clientSecret && '' !== (string) $this->redirectUri;
    }

    /** @return array{url: string, state: string} */
    public function authorizationUrl(): array
    {
        $provider = $this->provider();
        $url = $provider->getAuthorizationUrl([
            'scope' => ['openid', 'profile'],
            'prompt' => 'select_account',
        ]);

        return ['url' => $url, 'state' => $provider->getState()];
    }

    /**
     * 認可コードをトークンに換え、Google アカウントの情報を取る。
     *
     * @return array{sub: string, name: string, avatarUrl: ?string}
     */
    public function exchange(string $code): array
    {
        $provider = $this->provider();
        $token = $provider->getAccessToken('authorization_code', ['code' => $code]);

        /** @var GoogleUser $owner */
        $owner = $provider->getResourceOwner($token);

        return [
            'sub' => (string) $owner->getId(),
            'name' => (string) ($owner->getName() ?: 'ななしさん'),
            'avatarUrl' => $owner->getAvatar(),
        ];
    }

    private function provider(): Google
    {
        if (!$this->isConfigured()) {
            throw new \LogicException('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI が設定されていません。');
        }

        return $this->provider ??= new Google([
            'clientId' => $this->clientId,
            'clientSecret' => $this->clientSecret,
            'redirectUri' => $this->redirectUri,
        ]);
    }
}
