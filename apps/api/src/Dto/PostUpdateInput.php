<?php

declare(strict_types=1);

namespace App\Dto;

use App\Entity\Post;
use OpenApi\Attributes as OA;
use Symfony\Component\Validator\Constraints as Assert;

/** 投稿の編集。画像の差し替えはできない（削除して投稿し直す）。 */
final class PostUpdateInput
{
    #[Assert\Length(max: Post::MAX_BODY_LENGTH, maxMessage: '本文は {{ limit }} 文字までです。')]
    #[OA\Property(description: 'Markdown')]
    public string $bodyMarkdown = '';

    /** @var list<string> */
    #[Assert\Count(max: Post::MAX_TAGS, maxMessage: 'タグは {{ limit }} 個までです。')]
    #[Assert\All([new Assert\Regex('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', message: 'タグの slug が不正です。')])]
    #[OA\Property(type: 'array', items: new OA\Items(type: 'string'))]
    public array $tagSlugs = [];
}
