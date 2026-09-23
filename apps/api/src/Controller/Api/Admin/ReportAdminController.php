<?php

declare(strict_types=1);

namespace App\Controller\Api\Admin;

use App\Controller\Api\ApiController;
use App\Dto\AdminReport;
use App\Dto\AdminReportPage;
use App\Dto\ValidationError;
use App\Enum\ReportResolution;
use App\Http\CacheHeaders;
use App\Http\Cursor;
use App\Repository\ReportRepository;
use App\Service\TimesMapper;
use Doctrine\ORM\EntityManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Model;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;
use Symfony\Component\Uid\Ulid;

/**
 * 通報への対応。投稿を非表示・削除すると、その投稿への未対応の通報は
 * ModerationController 側でまとめて「対応済み」になる。ここでは一覧と却下だけを扱う。
 */
#[OA\Tag(name: 'admin')]
#[Security(name: 'SessionToken')]
#[Route('/api/admin/reports')]
final class ReportAdminController extends ApiController
{
    public function __construct(
        private readonly ReportRepository $reports,
        private readonly TimesMapper $mapper,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('', name: 'api_admin_reports_index', methods: ['GET'])]
    #[OA\Parameter(name: 'status', in: 'query', description: 'open: 未対応（既定） / resolved: 対応済み', schema: new OA\Schema(type: 'string', enum: ['open', 'resolved']))]
    #[OA\Parameter(name: 'cursor', in: 'query', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(response: 200, description: '通報の一覧（新しい順）', content: new OA\JsonContent(ref: new Model(type: AdminReportPage::class)))]
    public function index(#[MapQueryParameter] ?string $status = null, #[MapQueryParameter] ?string $cursor = null): JsonResponse
    {
        ['items' => $items, 'nextCursor' => $next] = $this->reports->findPage('resolved' !== $status, Cursor::parse($cursor), 50);

        return CacheHeaders::private($this->json(new AdminReportPage(
            array_map($this->mapper->toAdminReport(...), $items),
            $next,
            $this->reports->countOpen(),
        )));
    }

    #[Route('/{id}/dismiss', name: 'api_admin_reports_dismiss', requirements: ['id' => Requirement::ULID], methods: ['POST'])]
    #[OA\Response(response: 200, description: '問題なしとして却下した', content: new OA\JsonContent(ref: new Model(type: AdminReport::class)))]
    #[OA\Response(response: 404, description: '通報が存在しない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function dismiss(string $id): JsonResponse
    {
        $report = $this->reports->find(Ulid::fromString($id));
        if (null === $report) {
            return $this->notFound('通報が見つかりません。');
        }

        $report->resolve(ReportResolution::Dismissed);
        $this->em->flush();

        return CacheHeaders::private($this->json($this->mapper->toAdminReport($report)));
    }
}
