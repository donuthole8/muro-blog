<?php

declare(strict_types=1);

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;

final class OAuthCallbackInput
{
    #[Assert\NotBlank]
    #[Assert\Length(max: 2048)]
    public string $code = '';
}
