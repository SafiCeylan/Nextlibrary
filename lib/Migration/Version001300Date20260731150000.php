<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Emoji yerine yüklenebilir simge (görsel/logo).
 *
 * emoji sütunu 16 karakter — bir dosya adı sığmaz, o yüzden ayrı 'icon' sütunu.
 * Dolu ise arayüz emoji yerine görseli çizer; boşaltılırsa emoji geri gelir
 * (emoji hiç silinmez, yalnızca gölgelenir).
 *
 * Saklanan değer yalnızca dosya ADIdır (32 hex + uzantı); dosya appdata'da durur ve
 * /api/media/{cid}/{name} ile servis edilir.
 */
class Version001300Date20260731150000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        foreach (['nextlibrary_collections', 'nextlibrary_pages'] as $table) {
            if (!$schema->hasTable($table)) {
                continue;
            }
            $t = $schema->getTable($table);
            if (!$t->hasColumn('icon')) {
                $t->addColumn('icon', 'string', ['notnull' => false, 'length' => 255, 'default' => '']);
            }
        }

        return $schema;
    }
}
