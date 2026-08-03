<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Sayfalara iç içe yapı: parent_id.
 *
 * 0 = koleksiyonun kökü (mevcut tüm sayfalar böyle kalır → davranış değişmez).
 * Ağaç yalnızca kendi koleksiyonu içinde kurulur; parent her zaman aynı
 * collection_id'ye aittir (kontrol ApiController'da).
 *
 * Index adları 30 karakterin altında olmalı (bkz. ilk migration'daki not).
 */
class Version001100Date20260731000000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('nextlibrary_pages')) {
            return null;
        }
        $t = $schema->getTable('nextlibrary_pages');

        if (!$t->hasColumn('parent_id')) {
            $t->addColumn('parent_id', 'bigint', ['notnull' => true, 'default' => 0, 'length' => 20]);
        }
        if (!$t->hasIndex('nlib_pages_parent_idx')) {
            $t->addIndex(['collection_id', 'parent_id'], 'nlib_pages_parent_idx');
        }

        return $schema;
    }
}
