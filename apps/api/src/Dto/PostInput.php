<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;
use Symfony\Component\Validator\Constraints as Assert;

/** 記事の作成・更新で受け取る本体。 */
final class PostInput
{
    #[Assert\NotBlank(message: 'タイトルは必須です。')]
    #[Assert\Length(max: 255)]
    #[OA\Property(example: 'はじめての記事')]
    public string $title = '';

    #[Assert\NotBlank(message: 'slug は必須です。')]
    #[Assert\Length(max: 128)]
    #[Assert\Regex('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', message: 'slug は英小文字・数字・ハイフンのみ使用できます。')]
    #[OA\Property(example: 'hello-world')]
    public string $slug = '';

    /** null なら既定の絵文字が入る。 */
    #[Assert\Length(max: 8, maxMessage: '絵文字は1つだけ指定してください。')]
    #[OA\Property(nullable: true, description: '記事のアイキャッチ絵文字', example: '📝')]
    public ?string $emoji = null;

    #[Assert\NotBlank(message: '本文は必須です。')]
    #[OA\Property(description: 'Markdown 原文', example: "# 見出し\n\n本文。")]
    public string $bodyMd = '';

    /** null なら本文から自動生成する。 */
    #[Assert\Length(max: 255)]
    #[OA\Property(nullable: true, description: '未指定なら本文から自動生成される')]
    public ?string $excerpt = null;

    /**
     * 付与するタグの slug。既存のタグのみ指定できる。
     * 新しいタグは POST /api/admin/tags で先に作成すること
     * （日本語のタグ名から slug を機械的に導出できないため）。
     *
     * @var list<string>
     */
    #[Assert\All([
        new Assert\Regex('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', message: 'タグの slug が不正です。'),
    ])]
    #[OA\Property(type: 'array', items: new OA\Items(type: 'string'), example: ['php', 'symfony'])]
    public array $tagSlugs = [];
}
