<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;
use Symfony\Component\Validator\Constraints as Assert;

final class DevLoginInput
{
    #[Assert\NotBlank]
    #[Assert\Length(max: 20)]
    #[OA\Property(description: 'ログインする（なければ作る）ユーザーの handle', example: 'alice')]
    public string $handle = '';
}
