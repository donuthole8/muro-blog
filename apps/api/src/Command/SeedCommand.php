<?php

declare(strict_types=1);

namespace App\Command;

use App\Dto\PostInput;
use App\Entity\Tag;
use App\Repository\PostRepository;
use App\Repository\TagRepository;
use App\Service\PostWriter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/** 開発用のサンプル記事を投入する。 */
#[AsCommand(name: 'app:seed', description: '開発用のサンプル記事とタグを投入する')]
final class SeedCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PostWriter $writer,
        private readonly PostRepository $posts,
        private readonly TagRepository $tags,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $tagDefs = [
            ['PHP', 'php'],
            ['Symfony', 'symfony'],
            ['TypeScript', 'typescript'],
            ['TanStack', 'tanstack'],
        ];

        foreach ($tagDefs as [$name, $slug]) {
            if (null === $this->tags->findOneBySlug($slug)) {
                $this->em->persist((new Tag())->setName($name)->setSlug($slug));
            }
        }
        $this->em->flush();
        $io->text(sprintf('タグ %d 件を確認', count($tagDefs)));

        $postDefs = [
            [
                'title' => 'ブログを Symfony と TanStack Start で作り直した',
                'slug' => 'rebuild-blog-with-symfony-and-tanstack',
                'emoji' => '🛠️',
                'tags' => ['php', 'symfony', 'tanstack'],
                'publish' => true,
                'body' => <<<'MD'
                    ## なぜ作り直したか

                    記事を **DB で管理**したかったのが一番の理由です。

                    - 閲覧数やいいねをアプリ側で自由に扱える
                    - 下書き状態を持てる
                    - 全文検索を後から足せる

                    ```php
                    $post->publish();
                    ```

                    OpenAPI を挟むことで、バックエンドとフロントエンドの型が繋がります。
                    MD,
            ],
            [
                'title' => 'OpenAPI で PHP と TypeScript の型を繋ぐ',
                'slug' => 'bridge-php-and-typescript-with-openapi',
                'emoji' => '🔗',
                'tags' => ['php', 'typescript'],
                'publish' => true,
                'body' => <<<'MD'
                    NelmioApiDocBundle が吐いた spec を `openapi-typescript` に通すと、
                    そのまま TypeScript の型になります。

                    | ツール | 役割 |
                    | --- | --- |
                    | NelmioApiDocBundle | spec を生成 |
                    | openapi-typescript | 型を生成 |
                    | openapi-fetch | 型付きクライアント |
                    MD,
            ],
            [
                'title' => '下書きのままの記事',
                'slug' => 'draft-post',
                'emoji' => '📝',
                'tags' => ['typescript'],
                'publish' => false,
                'body' => "これは下書きです。公開 API には出てきません。\n",
            ],
        ];

        $created = 0;
        foreach ($postDefs as $def) {
            if (null !== $this->posts->findOneBy(['slug' => $def['slug']])) {
                continue;
            }

            $postInput = new PostInput();
            $postInput->title = $def['title'];
            $postInput->slug = $def['slug'];
            $postInput->emoji = $def['emoji'];
            $postInput->bodyMd = $def['body'];
            $postInput->tagSlugs = $def['tags'];

            $post = $this->writer->create($postInput);
            if ($def['publish']) {
                $post->publish();
                $this->em->flush();
            }
            ++$created;
        }

        $io->success(sprintf('記事 %d 件を投入しました。', $created));

        return Command::SUCCESS;
    }
}
