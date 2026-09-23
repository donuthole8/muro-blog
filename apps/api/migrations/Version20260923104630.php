<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * フォロー通知（投稿を伴わない通知）のため、notifications.post_id を NULL 可にする。
 */
final class Version20260923104630 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'notifications.post_id を NULL 可にする（フォロー通知）';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE notifications ALTER post_id DROP NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql("DELETE FROM notifications WHERE type = 'follow'");
        $this->addSql('ALTER TABLE notifications ALTER post_id SET NOT NULL');
    }
}
