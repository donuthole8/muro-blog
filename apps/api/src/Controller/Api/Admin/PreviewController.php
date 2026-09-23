<?php

declare(strict_types=1);

namespace App\Controller\Api\Admin;

use App\Dto\MarkdownPreview;
use App\Dto\MarkdownPreviewInput;
use App\Service\MarkdownRenderer;
use Nelmio\ApiDocBundle\Attribute\Model;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;

/**
 * 管理画面のライブプレビュー用。
 *
 * ブラウザ側で別の Markdown ライブラリを使うと保存後の表示とズレるため、
 * 保存時と同じ MarkdownRenderer を通した結果を返す。
 */
#[OA\Tag(name: 'admin')]
#[Security(name: 'AdminToken')]
final class PreviewController extends AbstractController
{
    public function __construct(private readonly MarkdownRenderer $markdown)
    {
    }

    #[Route('/api/admin/preview', name: 'api_admin_preview', methods: ['POST'])]
    #[OA\RequestBody(content: new OA\JsonContent(ref: new Model(type: MarkdownPreviewInput::class)))]
    #[OA\Response(
        response: 200,
        description: '保存時と同じ変換結果',
        content: new OA\JsonContent(ref: new Model(type: MarkdownPreview::class)),
    )]
    public function preview(#[MapRequestPayload] MarkdownPreviewInput $input): JsonResponse
    {
        return $this->json(new MarkdownPreview(
            bodyHtml: $this->markdown->toHtml($input->bodyMd),
            excerpt: $this->markdown->toExcerpt($input->bodyMd),
        ));
    }
}
