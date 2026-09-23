<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\ReportInput;
use App\Dto\ValidationError;
use App\Entity\Report;
use App\Enum\RateLimitedAction;
use App\Repository\PostRepository;
use App\Repository\ReportRepository;
use App\Service\ActionRateLimiter;
use Doctrine\ORM\EntityManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Model;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Ulid;

/** 投稿の通報。管理者は /api/admin/reports で一覧を見て対応する。 */
#[OA\Tag(name: 'posts')]
#[Security(name: 'SessionToken')]
#[IsGranted('ROLE_USER')]
final class ReportController extends ApiController
{
    public function __construct(
        private readonly PostRepository $posts,
        private readonly ReportRepository $reports,
        private readonly ActionRateLimiter $rateLimiter,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/posts/{id}/report', name: 'api_posts_report', requirements: ['id' => Requirement::ULID], methods: ['POST'])]
    #[OA\RequestBody(content: new OA\JsonContent(ref: new Model(type: ReportInput::class)))]
    #[OA\Response(response: 204, description: '通報した（同じ投稿を通報し直した場合は内容を差し替える）')]
    #[OA\Response(response: 404, description: '投稿が存在しない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    #[OA\Response(response: 422, description: '自分の投稿は通報できない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    #[OA\Response(response: 429, description: '回数の上限に達した', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function report(string $id, #[MapRequestPayload] ReportInput $input): JsonResponse
    {
        $user = $this->activeUser();
        $post = $this->posts->findOneById(Ulid::fromString($id));
        if (null === $post || !$post->isVisible()) {
            return $this->notFound('投稿が見つかりません。');
        }
        if ($post->getAuthor()->getId()->equals($user->getId())) {
            return new JsonResponse(['message' => '自分の投稿は通報できません。', 'errors' => new \stdClass()], 422);
        }

        $detail = trim((string) $input->detail);
        $detail = '' === $detail ? null : $detail;

        $existing = $this->reports->findPair($post, $user);
        if (null !== $existing && $existing->isOpen()) {
            // 未対応のうちに出し直しただけなら枠を使わない
            $existing->resubmit($input->reason, $detail);
        } else {
            $this->rateLimiter->consume(RateLimitedAction::Report, $user);
            null !== $existing
                ? $existing->resubmit($input->reason, $detail)
                : $this->em->persist(new Report($post, $user, $input->reason, $detail));
        }
        $this->em->flush();

        return $this->noContent();
    }
}
