<?php

declare(strict_types=1);

namespace App\Exception;

/**
 * 属性のバリデーションでは表せない入力エラー（存在しないタグ、他人の画像など）。
 * ApiExceptionSubscriber がフィールド単位の 422 に変換する。
 */
class InvalidInputException extends \DomainException
{
    /**
     * @param array<string, string> $errors フィールド名 => エラーメッセージ
     */
    public function __construct(public readonly array $errors, string $message = '入力内容に誤りがあります。')
    {
        parent::__construct($message);
    }

    public static function field(string $field, string $message): self
    {
        return new self([$field => $message]);
    }
}
