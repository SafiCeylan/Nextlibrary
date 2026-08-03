<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Kart türü: 'page' (yazı sayfası) | 'folder' (bölüm — yalnızca alt kartları gruplar).
 *
 * Varsayılan 'page' → mevcut tüm kartlar bugünkü davranışını korur.
 * Bölümün de html sütunu vardır ama arayüz onu göstermez/düzenlemez; türü sonradan
 * sayfaya çevirirsek yazı kaybolmadan geri gelir.
 */
class Version001200Date20260731120000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('nextlibrary_pages')) {
            return null;
        }
        $t = $schema->getTable('nextlibrary_pages');

        if (!$t->hasColumn('kind')) {
            $t->addColumn('kind', 'string', ['notnull' => true, 'length' => 16, 'default' => 'page']);
        }

        return $schema;
    }
}
