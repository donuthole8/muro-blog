<?php

declare(strict_types=1);

namespace App\Service;

use App\Auth\HandlePolicy;
use App\Repository\UserRepository;
use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\ExternalLink\ExternalLinkExtension;
use League\CommonMark\Extension\GithubFlavoredMarkdownExtension;
use League\CommonMark\Extension\Mention\MentionExtension;
use League\CommonMark\MarkdownConverter;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * times の投稿の Markdown を HTML に変換する。
 *
 * 誰でも投稿できるので、アーカイブ記事用の MarkdownRenderer とは違い
 * 生 HTML は通さない（html_input: strip）。フロントはこの HTML をそのまま挿入する。
 *
 * リンクカードの取得（外部への通信）は投稿のレスポンスを遅らせないよう、
 * ここでは行わず LinkCardFiller が後から埋める。
 */
final class PostBodyRenderer
{
    private readonly MarkdownConverter $converter;

    public function __construct(
        private readonly MentionLinker $mentions,
        private readonly LinkCardEmbedder $linkCards,
        private readonly UserRepository $users,
        #[Autowire(env: 'default::SITE_HOST')]
        ?string $siteHost = null,
    ) {
        $environment = new Environment([
            'html_input' => 'strip',
            'allow_unsafe_links' => false,
            'max_nesting_level' => 20,
            'external_link' => [
                'internal_hosts' => array_filter([$siteHost]),
                'open_in_new_window' => true,
                'nofollow' => 'external',
                'noopener' => 'external',
                'noreferrer' => 'external',
            ],
            'mentions' => [
                'handle' => [
                    'prefix' => '@',
                    'pattern' => HandlePolicy::PATTERN_PARTIAL,
                    'generator' => $this->mentions,
                ],
            ],
        ]);
        $environment->addExtension(new CommonMarkCoreExtension());
        $environment->addExtension(new GithubFlavoredMarkdownExtension());
        $environment->addExtension(new ExternalLinkExtension());
        $environment->addExtension(new MentionExtension());

        $this->converter = new MarkdownConverter($environment);
    }

    public function render(string $markdown): RenderedBody
    {
        // 実在するユーザーだけをリンクにするため、候補の handle を先にまとめて引く
        preg_match_all('/(?<![\w@])@('.HandlePolicy::PATTERN_PARTIAL.')/i', $markdown, $m);
        $candidates = array_values(array_unique(array_map('strtolower', $m[1])));
        $known = array_map(
            static fn ($user): string => (string) $user->getHandle(),
            $this->users->findActiveByHandles(array_slice($candidates, 0, 20)),
        );

        $this->mentions->reset($known);
        $html = $this->converter->convert($markdown)->getContent();

        return new RenderedBody($html, $this->mentions->linkedHandles());
    }

    /** 変換済みの HTML にリンクカードを埋める。外部に通信するので投稿のレスポンス後に呼ぶ。 */
    public function withLinkCards(string $html): string
    {
        return $this->linkCards->hasBareLink($html) ? $this->linkCards->embed($html) : $html;
    }

    public function needsLinkCards(string $html): bool
    {
        return $this->linkCards->hasBareLink($html);
    }
}
