<?php

declare(strict_types=1);

namespace App\Command;

use App\Dto\PostInput;
use App\Entity\Follow;
use App\Entity\Tag;
use App\Entity\User;
use App\Repository\ReactionRepository;
use App\Repository\TagRepository;
use App\Repository\UserRepository;
use App\Service\CompanyNormalizer;
use App\Service\Notifier;
use App\Service\TimesPostWriter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * 開発用のサンプルデータ（ユーザー・タグ・投稿・返信・リアクション・フォロー）を投入する。
 * ユーザーは開発用ログイン（DEV_LOGIN_ENABLED=1）の handle でそのままログインできる。
 */
#[AsCommand(name: 'app:seed', description: '開発用のサンプルユーザー・投稿を投入する')]
final class SeedCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly TimesPostWriter $writer,
        private readonly UserRepository $users,
        private readonly TagRepository $tags,
        private readonly ReactionRepository $reactions,
        private readonly Notifier $notifier,
        private readonly CompanyNormalizer $companies,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        if (null !== $this->users->findOneByHandle('alice')) {
            $io->note('既に投入済みです（@alice が存在します）。');

            return Command::SUCCESS;
        }

        foreach ([['PHP', 'php'], ['Symfony', 'symfony'], ['TypeScript', 'typescript'], ['TanStack', 'tanstack'], ['雑談', 'chat']] as [$name, $slug]) {
            if (null === $this->tags->findOneBySlug($slug)) {
                $this->em->persist((new Tag())->setName($name)->setSlug($slug));
            }
        }

        $alice = $this->user('alice', 'Alice', '株式会社サンプル', 'バックエンドをやっています');
        $bob = $this->user('bob', 'Bob', 'サンプル Inc.', 'フロントエンドが好き');
        $carol = $this->user('carol', 'Carol', null, null);
        $this->em->flush();

        $p1 = $this->post($alice, "Symfony の access_token 認証、思ったより素直に書けた\n\n`AccessTokenHandlerInterface` を1つ実装するだけ", ['php', 'symfony']);
        $p2 = $this->post($bob, "TanStack Start のサーバー関数、例外の型が RPC 境界で落ちるのを忘れがち\n\n@alice さんの記事で見たやつ", ['tanstack', 'typescript']);
        $this->post($carol, '今日はもくもく会。コーヒーがおいしい ☕', ['chat']);
        $this->post($alice, "cursor ページングは ULID の降順でやると楽\n\n- 時刻順に並ぶ\n- オフセットがずれない", []);

        $this->post($bob, 'わかる、UserBadge にクロージャを渡すところだけ最初迷った', [], $p1);
        $this->post($carol, 'ドキュメントどこ見ました？', [], $p1);
        $this->post($alice, 'seroval で素の Error になるやつですね', [], $p2);

        $this->reactions->add($p1, $bob, '👍');
        $this->reactions->add($p1, $carol, '👍');
        $this->reactions->add($p1, $carol, '🎉');
        $this->reactions->add($p2, $alice, '👀');
        $this->notifier->onReactionAdded($p1, $bob);

        $this->em->persist(new Follow($bob, $alice));
        $this->em->persist(new Follow($carol, $alice));
        $this->em->flush();

        $io->success('ユーザー3人（alice / bob / carol）と投稿を投入しました。');

        return Command::SUCCESS;
    }

    private function user(string $handle, string $name, ?string $company, ?string $bio): User
    {
        $user = (new User('dev:'.$handle, $name))
            ->setHandle($handle)
            ->setBio($bio)
            ->setCompany($company, null !== $company ? $this->companies->slugify($company) : null);
        $this->em->persist($user);

        return $user;
    }

    /** @param list<string> $tags */
    private function post(User $author, string $body, array $tags, ?\App\Entity\Post $parent = null): \App\Entity\Post
    {
        $input = new PostInput();
        $input->bodyMarkdown = $body;
        $input->tagSlugs = $tags;
        $input->parentId = null !== $parent ? (string) $parent->getId() : null;

        return $this->writer->create($author, $input);
    }
}
