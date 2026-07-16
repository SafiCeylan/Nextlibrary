<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Initial schema for NextLibrary: collections / pages / members / read states.
 *
 * Index and primary key names must stay under 30 characters — Doctrine derives a
 * name from the table when none is given, which overflows on these table names.
 */
class Version001000Date20260716000000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('nextlibrary_collections')) {
            $t = $schema->createTable('nextlibrary_collections');
            $t->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true, 'length' => 20]);
            $t->addColumn('owner_uid', 'string', ['notnull' => true, 'length' => 64]);
            $t->addColumn('emoji', 'string', ['notnull' => false, 'length' => 16, 'default' => '📘']);
            $t->addColumn('name', 'string', ['notnull' => true, 'length' => 255]);
            $t->addColumn('visibility', 'string', ['notnull' => true, 'length' => 16, 'default' => 'public']);
            $t->addColumn('created_at', 'bigint', ['notnull' => true, 'default' => 0, 'length' => 20]);
            $t->addColumn('updated_at', 'bigint', ['notnull' => true, 'default' => 0, 'length' => 20]);
            $t->addColumn('deleted_at', 'bigint', ['notnull' => true, 'default' => 0, 'length' => 20]);
            $t->setPrimaryKey(['id'], 'nlib_coll_pk');
            $t->addIndex(['owner_uid'], 'nlib_coll_owner_idx');
        }

        if (!$schema->hasTable('nextlibrary_pages')) {
            $t = $schema->createTable('nextlibrary_pages');
            $t->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true, 'length' => 20]);
            $t->addColumn('collection_id', 'bigint', ['notnull' => true, 'length' => 20]);
            $t->addColumn('emoji', 'string', ['notnull' => false, 'length' => 16, 'default' => '📄']);
            $t->addColumn('title', 'string', ['notnull' => false, 'length' => 255, 'default' => '']);
            // MEDIUMTEXT (~16MB): rich page bodies outgrow TEXT's 64KB ceiling.
            $t->addColumn('html', 'text', ['notnull' => false, 'length' => 16777215]);
            $t->addColumn('sort', 'integer', ['notnull' => true, 'default' => 0]);
            $t->addColumn('created_at', 'bigint', ['notnull' => true, 'default' => 0, 'length' => 20]);
            $t->addColumn('updated_at', 'bigint', ['notnull' => true, 'default' => 0, 'length' => 20]);
            $t->addColumn('deleted_at', 'bigint', ['notnull' => true, 'default' => 0, 'length' => 20]);
            $t->setPrimaryKey(['id'], 'nlib_page_pk');
            $t->addIndex(['collection_id'], 'nlib_pages_coll_idx');
        }

        if (!$schema->hasTable('nextlibrary_members')) {
            $t = $schema->createTable('nextlibrary_members');
            $t->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true, 'length' => 20]);
            $t->addColumn('collection_id', 'bigint', ['notnull' => true, 'length' => 20]);
            $t->addColumn('principal', 'string', ['notnull' => true, 'length' => 64]);
            $t->addColumn('type', 'string', ['notnull' => true, 'length' => 16, 'default' => 'user']);
            $t->addColumn('role', 'string', ['notnull' => true, 'length' => 16, 'default' => 'editor']);
            $t->setPrimaryKey(['id'], 'nlib_mbr_pk');
            $t->addUniqueIndex(['collection_id', 'principal', 'type'], 'nlib_member_uniq_idx');
        }

        if (!$schema->hasTable('nextlibrary_reads')) {
            $t = $schema->createTable('nextlibrary_reads');
            $t->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true, 'length' => 20]);
            $t->addColumn('user_uid', 'string', ['notnull' => true, 'length' => 64]);
            $t->addColumn('page_id', 'bigint', ['notnull' => true, 'length' => 20]);
            $t->addColumn('read_at', 'bigint', ['notnull' => true, 'default' => 0, 'length' => 20]);
            $t->setPrimaryKey(['id'], 'nlib_rd_pk');
            $t->addUniqueIndex(['user_uid', 'page_id'], 'nlib_read_uniq_idx');
        }

        return $schema;
    }
}
