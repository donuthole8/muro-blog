<?php

declare(strict_types=1);

namespace App\Dto;

use App\Entity\Post;
use OpenApi\Attributes as OA;
use Symfony\Component\Validator\Constraints as Assert;

/** 投稿・返信の作成。parentId を付ければ返信になる。 */
final class PostInput
{
    #[Assert\Length(max: Post::MAX_BODY_LENGTH, maxMessage: '本文は {{ limit }} 文字までです。')]
    #[OA\Property(description: 'Markdown', example: "今日は **OpenAPI** の型生成を試した\n\nhttps://example.com")]
    public string $bodyMarkdown = '';

    #[Assert\Ulid(message: '返信先の ID が不正です。')]
    #[OA\Property(nullable: true, description: '返信先の親投稿 ID')]
    public ?string $parentId = null;

    /** Worker が R2 に置いた画像のキー。投稿者本人のアップロードしか指定できない。 */
    #[Assert\Length(max: 128)]
    #[OA\Property(nullable: true, description: 'R2 に置いた画像のキー（1枚まで）')]
    public ?string $imageKey = null;

    /** @var list<string> */
    #[Assert\Count(max: Post::MAX_TAGS, maxMessage: 'タグは {{ limit }} 個までです。')]
    #[Assert\All([new Assert\Regex('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', message: 'タグの slug が不正です。')])]
    #[OA\Property(type: 'array', items: new OA\Items(type: 'string'), description: '既存タグの slug。返信には付けられない', example: ['php'])]
    public array $tagSlugs = [];
}
