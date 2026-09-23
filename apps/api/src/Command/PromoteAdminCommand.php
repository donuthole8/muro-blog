<?php

declare(strict_types=1);

namespace App\Command;

use App\Enum\UserRole;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * 管理者を任命する（X-Admin-Token の共有シークレットを role=admin に置き換えた）。
 * 最初の管理者は画面から作れないので、本人が Google でログインして handle を決めた後に実行する。
 */
#[AsCommand(name: 'app:user:role', description: 'ユーザーを管理者にする（--revoke で一般ユーザーに戻す）')]
final class PromoteAdminCommand extends Command
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly EntityManagerInterface $em,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('handle', InputArgument::REQUIRED, '対象ユーザーの handle')
            ->addOption('revoke', null, InputOption::VALUE_NONE, '管理者権限を外す');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $handle = (string) $input->getArgument('handle');
        $user = $this->users->findOneByHandle($handle);

        if (null === $user) {
            $io->error(sprintf('@%s は見つかりません。先に本人がログインして handle を決める必要があります。', $handle));

            return Command::FAILURE;
        }

        $role = $input->getOption('revoke') ? UserRole::User : UserRole::Admin;
        $user->setRole($role);
        $this->em->flush();

        $io->success(sprintf('@%s を %s にしました。', $handle, $role->value));

        return Command::SUCCESS;
    }
}
