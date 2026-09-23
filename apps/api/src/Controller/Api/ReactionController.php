<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\ValidationError;
use App\Enum\RateLimitedAction;
use App\Exception\InvalidInputException;
use App\Repository\BlockRepository;
use App\Repository\PostRepository;
use App\Repository\ReactionRepository;
use App\Service\ActionRateLimiter;
use App\Service\EmojiPolicy;
use App\Service\Notifier;
use Doctrine\ORM\EntityManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Model;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Ulid;

/** 絵文字リアクション。PUT / DELETE とも冪等。 */
#[OA\Tag(name: 'posts')]
#[Security(name: 'SessionToken')]
#[IsGranted('ROLE_USER')]
#[Route('/api/posts/{id}/reactions/{emoji}', requirements: ['id' => Requirement::ULID])]
final class ReactionController extends ApiController
{
    public function __construct(
        private readonly PostRepository $posts,
        private readonly ReactionRepository $reactions,
        private readonly Notifier $notifier,
        private readonly BlockRepository $blocks,
        private readonly ActionRateLimiter $rateLimiter,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('', name: 'api_reactions_put', methods: ['PUT'])]
    #[OA\Parameter(name: 'emoji', in: 'path', required: true, description: '絵文字1つ（URL エンコードする）', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(response: 204, description: 'リアクションを付けた（既に付いていても 204）')]
    #[OA\Response(response: 403, description: '投稿者にブロックされている', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    #[OA\Response(response: 422, description: '絵文字として扱えない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    #[OA\Response(response: 429, description: '回数の上限に達した', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function add(string $id, string $emoji): JsonResponse
    {
        $user = $this->activeUser();
        $post = $this->posts->findOneById(Ulid::fromString($id));
        if (null === $post || !$post->isVisible()) {
            return $this->notFound('投稿が見つかりません。');
        }
        if (!EmojiPolicy::isValid($emoji)) {
            throw InvalidInputException::field('emoji', '絵文字を1つだけ指定してください。');
        }
        if ($this->blocks->isBlocking($post->getAuthor(), $user)) {
            throw new AccessDeniedHttpException('この投稿にはリアクションできません。');
        }

        $this->rateLimiter->consume(RateLimitedAction::Reaction, $user);

        if ($this->reactions->add($post, $user, $emoji)) {
            $this->notifier->onReactionAdded($post, $user);
            $this->em->flush();
        }

        return $this->noContent();
    }

    #[Route('', name: 'api_reactions_delete', methods: ['DELETE'])]
    #[OA\Parameter(name: 'emoji', in: 'path', required: true, description: '絵文字1つ（URL エンコードする）', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(response: 204, description: 'リアクションを外した（付いていなくても 204）')]
    public function remove(string $id, string $emoji): JsonResponse
    {
        $user = $this->activeUser();
        $post = $this->posts->findOneById(Ulid::fromString($id));
        if (null === $post) {
            return $this->notFound('投稿が見つかりません。');
        }

        $this->reactions->remove($post, $user, $emoji);

        return $this->noContent();
    }
}
