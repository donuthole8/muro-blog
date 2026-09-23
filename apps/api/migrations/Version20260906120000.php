<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** 記事にアイキャッチ絵文字を持たせる。 */
final class Version20260906120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '記事に emoji カラムを追加する';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE posts ADD emoji VARCHAR(32) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE posts DROP emoji');
    }
}
