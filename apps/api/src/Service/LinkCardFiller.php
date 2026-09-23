<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Post;
use App\Repository\PostRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpKernel\Event\TerminateEvent;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\Uid\Ulid;

/**
 * 投稿に貼られた裸 URL のリンクカードを、レスポンスを返した後で埋める。
 *
 * 他人のサーバーへの通信（最大数秒）を投稿の待ち時間に含めないため、
 * PostWriter は変換だけ行ってここに ID を積み、kernel.terminate
 * （FrankenPHP / PHP-FPM ではレスポンス送信後に走る）で処理する。
 *
 * Cloud Run は CPU をリクエスト処理中にしか割り当てない設定が既定なので、
 * レスポンス後の処理は遅くなったり打ち切られたりしうる。その場合は裸リンクのまま残り、
 * 表示はフロントの CSS がカード風にフォールバックする。取りこぼしは
 * `app:posts:fill-link-cards` で後から埋められる。
 */
final class LinkCardFiller
{
    /** @var array<string, Ulid> */
    private array $pending = [];

    public function __construct(
        private readonly PostRepository $posts,
        private readonly PostBodyRenderer $renderer,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function schedule(Post $post): void
    {
        if ($this->renderer->needsLinkCards($post->getBodyHtml())) {
            $this->pending[(string) $post->getId()] = $post->getId();
        }
    }

    #[AsEventListener(event: KernelEvents::TERMINATE)]
    public function onTerminate(TerminateEvent $event): void
    {
        if ([] === $this->pending) {
            return;
        }

        $ids = $this->pending;
        $this->pending = [];

        foreach ($ids as $id) {
            try {
                $post = $this->posts->findOneById($id);
                if (null !== $post && !$post->isDeleted()) {
                    $this->fill($post);
                }
            } catch (\Throwable $e) {
                $this->logger->warning('link card fill failed', ['post' => (string) $id, 'error' => $e->getMessage()]);
            }
        }

        $this->em->flush();
    }

    public function fill(Post $post): bool
    {
        $html = $this->renderer->withLinkCards($post->getBodyHtml());
        if ($html === $post->getBodyHtml()) {
            return false;
        }

        $post->setBodyHtml($html);

        return true;
    }
}
