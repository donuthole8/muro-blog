<?php

declare(strict_types=1);

namespace App\Command;

use App\Entity\Post;
use App\Service\LinkCardFiller;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * レスポンス後に埋めきれなかったリンクカードを埋める（LinkCardFiller 参照）。
 */
#[AsCommand(name: 'app:posts:fill-link-cards', description: '裸 URL のまま残っている投稿のリンクカードを埋める')]
final class FillLinkCardsCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly LinkCardFiller $filler,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('days', null, InputOption::VALUE_REQUIRED, '直近何日分を見るか', '7');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        /** @var list<Post> $posts */
        $posts = $this->em->createQuery(
            'SELECT p FROM App\Entity\Post p WHERE p.deletedAt IS NULL AND p.createdAt >= :since AND p.bodyHtml LIKE :link',
        )
            ->setParameter('since', new \DateTimeImmutable(sprintf('-%d days', (int) $input->getOption('days'))))
            ->setParameter('link', '%<p><a %')
            ->getResult();

        $filled = 0;
        foreach ($posts as $post) {
            if ($this->filler->fill($post)) {
                ++$filled;
            }
        }
        $this->em->flush();

        $io->success(sprintf('%d 件中 %d 件を更新しました。', count($posts), $filled));

        return Command::SUCCESS;
    }
}
