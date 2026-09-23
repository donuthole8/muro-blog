<?php

declare(strict_types=1);

namespace App\Auth;

/**
 * handle（部屋の URL /@handle になる）に使える文字と予約語。
 *
 * 英小文字・数字・アンダースコアの 3〜20 文字。大文字小文字を区別すると
 * なりすまし（@Alice と @alice）が起きるので、小文字に正規化して保存する。
 */
final class HandlePolicy
{
    /** 区切り文字なしの正規表現（MentionExtension の pattern にもそのまま使う） */
    public const PATTERN_PARTIAL = '[a-zA-Z0-9_]{3,20}(?![a-zA-Z0-9_])';

    private const PATTERN = '/^[a-z0-9_]{3,20}$/';

    /**
     * 運営を装える名前、サービスの URL と紛らわしい名前は取らせない。
     * 部屋の URL は /@handle なので実際のパスとは衝突しないが、
     * 「公式っぽさ」で誤認させないために広めに押さえておく。
     * web のルート名（/search, /og など今後増やすものを含む）もここに足す。
     * 比較は normalize() 後の小文字で行う。
     */
    private const RESERVED = [
        'about', 'abuse', 'account', 'admin', 'administrator', 'anonymous', 'api', 'app', 'archive',
        'auth', 'block', 'blocks', 'blog', 'callback', 'config', 'contact', 'dashboard', 'deleted',
        'dev', 'explore', 'feed', 'following', 'help', 'home', 'info', 'legal', 'lobby', 'login',
        'logout', 'mail', 'me', 'mod', 'moderation', 'moderator', 'mute', 'mutes', 'new', 'news',
        'notifications', 'null', 'official', 'og', 'org', 'orgs', 'owner', 'posts', 'privacy',
        'report', 'reports', 'rooms', 'root', 'rss', 'search', 'security', 'settings', 'signin',
        'signup', 'staff', 'static', 'status', 'support', 'system', 'tags', 'team', 'terms',
        'teatimes', 'times', 'undefined', 'uploads', 'user', 'users', 'welcome', 'www',
    ];

    /** @return string|null エラーメッセージ（問題なければ null） */
    public static function violation(string $handle): ?string
    {
        if (1 !== preg_match(self::PATTERN, $handle)) {
            return 'handle は英小文字・数字・アンダースコアの 3〜20 文字で指定してください。';
        }

        if (in_array($handle, self::RESERVED, true) || str_starts_with($handle, 'admin') || str_starts_with($handle, 'official')) {
            return 'この handle は予約されているため使えません。';
        }

        return null;
    }

    public static function normalize(string $handle): string
    {
        return strtolower(ltrim(trim($handle), '@'));
    }
}
