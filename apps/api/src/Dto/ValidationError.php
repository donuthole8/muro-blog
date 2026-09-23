<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

final readonly class ValidationError
{
    /**
     * @param array<string, string> $errors フィールド名 => エラーメッセージ
     */
    public function __construct(
        #[OA\Property(example: '入力内容に誤りがあります。')]
        public string $message,
        #[OA\Property(
            type: 'object',
            additionalProperties: new OA\AdditionalProperties(type: 'string'),
            example: ['slug' => 'slug は必須です。'],
        )]
        public array $errors,
    ) {
    }
}
