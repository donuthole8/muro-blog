<?php

declare(strict_types=1);

namespace App\Command;

use App\Repository\ArchivedPostRepository;
use App\Service\MarkdownRenderer;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * アーカイブ記事の bodyHtml を bodyMd から作り直す。
 *
 * MarkdownRenderer の変換ルールを変えたとき（見出し id の追加など）、
 * 既存記事には反映されないため保存し直す必要がある。
 */
#[AsCommand(name: 'app:archive:rerender', description: 'アーカイブ記事の bodyMd から bodyHtml を再生成する')]
final class RerenderPostsCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly ArchivedPostRepository $posts,
        private readonly MarkdownRenderer $markdown,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $posts = $this->posts->findAllForAdmin();
        foreach ($posts as $post) {
            $post->setBodyHtml($this->markdown->toHtml($post->getBodyMd()));
        }
        $this->em->flush();

        $io->success(sprintf('%d 件の記事を再生成しました。', count($posts)));

        return Command::SUCCESS;
    }
}
