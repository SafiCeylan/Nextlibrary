<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Service;

use OCP\IConfig;
use OCP\IGroupManager;
use OCP\IUserManager;

/**
 * Yazma yetkisinin TEK karar noktası.
 *
 * 1.6.0'a kadar kural tek satırdı: "yalnızca NC yöneticisi yazabilir". 1.7.0'dan itibaren
 * yönetici, uygulama ayarlarından belirli kullanıcı ve grupları EDİTÖR olarak işaretler;
 * editör uygulama içinde yöneticiyle AYNI yetkiye sahiptir (koleksiyon açma/silme, üye
 * yönetimi, çöp kutusu dahil).
 *
 * ⚠️ Editör listesinin KENDİSİNİ yalnızca gerçek NC yöneticileri değiştirebilir: ayar
 * sayfası NC tarafından admin'e kilitli ve `getEditors`/`setEditors` uçlarında
 * `#[NoAdminRequired]` YOK. Bu ayrım kasıtlı — editör kendi listesini düzenleyebilseydi
 * kendini ve istediği kişiyi kalıcı yetkilendirir, yönetici de geri alamazdı.
 *
 * Not: `IAppConfig` (NC 29+) kullanılamıyor, uygulama NC 28'i de destekliyor. `IConfig`
 * üzerindeki app-value çağrıları 29'da deprecated ama 28-34 aralığında çalışan tek yol.
 */
class PermissionService {

    /** appconfig anahtarları. Değer: id dizisinin JSON hali. */
    public const KEY_USERS = 'editor_users';
    public const KEY_GROUPS = 'editor_groups';

    /** Liste üst sınırı: appconfig değeri tek satırda tutulur, sınırsız büyümemeli. */
    public const MAX_ENTRIES = 200;

    private const APP_ID = 'nextlibrary';

    private IConfig $config;
    private IGroupManager $groupManager;
    private IUserManager $userManager;

    /**
     * İstek başına bellek. canEdit() koleksiyon BAŞINA çağrılıyor (state() sıcak yolu),
     * her çağrıda grup çözümlemesi yapılırsa koleksiyon sayısı kadar sorgu çıkar.
     * @var array<string,bool>
     */
    private array $writeCache = [];

    public function __construct(IConfig $config, IGroupManager $groupManager, IUserManager $userManager) {
        $this->config = $config;
        $this->groupManager = $groupManager;
        $this->userManager = $userManager;
    }

    // ───────────────────────── saf karar (NC'siz test edilebilir) ─────────────────────────

    /**
     * Kararın saf hali: kimlik ve grupları kayıtlı editör listesiyle eşleşiyor mu?
     *
     * Nextcloud'a bağımlı değil → `tests/run.php` bunu doğrudan koşturur. canWrite() bu
     * fonksiyona DELEGE eder; mantığın ikinci bir kopyası bırakılırsa test edilen kod ile
     * çalışan kod sessizce ayrışır.
     *
     * @param string[] $userGroups   kullanıcının üye olduğu grup id'leri
     * @param string[] $editorUsers  editör olarak işaretli uid'ler
     * @param string[] $editorGroups editör olarak işaretli grup id'leri
     */
    public static function isListedEditor(string $uid, array $userGroups, array $editorUsers, array $editorGroups): bool {
        if ($uid === '') {
            return false;
        }
        if (in_array($uid, $editorUsers, true)) {
            return true;
        }
        foreach ($userGroups as $g) {
            if (in_array($g, $editorGroups, true)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Dışarıdan gelen id dizisini güvenli hale getirir: string'e çevirir, boşları ve
     * tekrarları atar, üst sınırda keser. Kaydetmeden önce her zaman buradan geçilir —
     * appconfig'e ne yazıldığı yetkiyi belirlediği için payload'a güvenilmez.
     *
     * @return string[]
     */
    public static function normalizeIds($raw): array {
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $v) {
            if (is_array($v) || is_object($v) || is_bool($v) || $v === null) {
                continue;
            }
            $s = trim((string)$v);
            if ($s === '' || in_array($s, $out, true)) {
                continue;
            }
            $out[] = $s;
            if (count($out) >= self::MAX_ENTRIES) {
                break;
            }
        }
        return $out;
    }

    // ───────────────────────── yetki ─────────────────────────

    /**
     * Uygulama içinde yazma yetkisi var mı? NC yöneticisi VEYA editör listesinde.
     * Tüm yazma uçları (koleksiyon, sayfa, medya, çöp kutusu) bu kapıdan geçer.
     */
    public function canWrite(string $uid): bool {
        if ($uid === '') {
            return false;
        }
        if (isset($this->writeCache[$uid])) {
            return $this->writeCache[$uid];
        }
        $allowed = $this->groupManager->isAdmin($uid)
            || self::isListedEditor($uid, $this->userGroupIds($uid), $this->getEditorUsers(), $this->getEditorGroups());
        $this->writeCache[$uid] = $allowed;
        return $allowed;
    }

    /** @return string[] */
    private function userGroupIds(string $uid): array {
        $u = $this->userManager->get($uid);
        return $u === null ? [] : $this->groupManager->getUserGroupIds($u);
    }

    // ───────────────────────── editör listesi ─────────────────────────

    /** @return string[] */
    public function getEditorUsers(): array {
        return $this->readList(self::KEY_USERS);
    }

    /** @return string[] */
    public function getEditorGroups(): array {
        return $this->readList(self::KEY_GROUPS);
    }

    /**
     * Editör listesini baştan yazar. Var olmayan kullanıcı/gruplar elenir: yanlış yazılmış
     * bir id zaten kimseye yetki vermez, ayar sayfasında görünüp yetki veriyormuş izlenimi
     * bırakmasın.
     *
     * @param string[] $users
     * @param string[] $groups
     * @return array{users: string[], groups: string[]} gerçekten kaydedilen liste
     */
    public function setEditors(array $users, array $groups): array {
        $users = array_values(array_filter(self::normalizeIds($users), function (string $uid): bool {
            return $this->userManager->userExists($uid);
        }));
        $groups = array_values(array_filter(self::normalizeIds($groups), function (string $gid): bool {
            return $this->groupManager->groupExists($gid);
        }));

        $this->config->setAppValue(self::APP_ID, self::KEY_USERS, json_encode($users));
        $this->config->setAppValue(self::APP_ID, self::KEY_GROUPS, json_encode($groups));
        $this->writeCache = [];

        return ['users' => $users, 'groups' => $groups];
    }

    /**
     * Kayıtlı listeyi okur. Değer bozuksa (elle düzenlenmiş appconfig, yarım yazma) boş
     * liste döner — bozuk JSON'da "herkes editör" gibi bir yoruma asla düşülmez.
     *
     * @return string[]
     */
    private function readList(string $key): array {
        $raw = $this->config->getAppValue(self::APP_ID, $key, '[]');
        $decoded = json_decode($raw, true);
        return self::normalizeIds(is_array($decoded) ? $decoded : []);
    }
}
