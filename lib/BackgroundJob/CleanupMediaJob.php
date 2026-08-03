<?php
declare(strict_types=1);

namespace OCA\NextLibrary\BackgroundJob;

use OCA\NextLibrary\Db\CollectionMapper;
use OCA\NextLibrary\Db\PageMapper;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use OCP\Files\IAppData;

/**
 * Yetim medya toplayıcısı (günde bir).
 *
 * Yüklenen görsel/video appdata'da durur, sayfa HTML'i ona ADIYLA referans verir.
 * Referans ortadan kalkınca dosyayı silen kimse yoktu; üç yoldan çöp birikiyordu:
 *   1. Koleksiyon oluşturma modalında simge seçilip vazgeçilmesi → 'media_0' klasörü.
 *   2. Sayfadan görselin silinmesi (HTML'den çıkar, dosya kalır).
 *   3. Sayfanın kalıcı silinmesi (purgePage yalnızca DB satırını siler).
 *
 * ── Güvenlik payı (silmede yanılmamak için) ──
 * • Referans kümesi TÜM sistem için bir kere kurulur, klasör başına değil. Dosya adları
 *   32 hex (çakışma pratikte imkânsız), dolayısıyla "herhangi bir yerde geçiyorsa dokunma"
 *   kuralı güvenlidir ve dosya klasörler arası taşınsa bile korur.
 * • HTML'den referans ÇIKARIRKEN tam URL aranmaz, sadece dosya adı biçimi aranır →
 *   fazla eşleşme olur, eksik eşleşme olmaz. Yanılma yönü hep "silme" tarafındadır.
 * • Çöpteki (deleted_at > 0) koleksiyon ve sayfalar da referans sayılır — geri
 *   yüklenebilirler.
 * • Yalnızca GRACE_SECONDS'tan eski dosyalar silinir: yüklenmiş ama sayfası daha
 *   kaydedilmemiş bir dosya bu pencerede korunur.
 */
class CleanupMediaJob extends TimedJob {

    /** Bu yaştan genç dosyaya dokunulmaz (yükleme ile kayıt arasındaki pencere). */
    private const GRACE_SECONDS = 86400;

    /** upload() tarafından üretilen dosya adı biçimi. */
    private const NAME_RE = '/[a-f0-9]{32}\.(?:png|jpg|gif|webp|mp4|webm|ogg|mov)/';

    private IAppData $appData;
    private CollectionMapper $collections;
    private PageMapper $pages;

    public function __construct(
        ITimeFactory $time,
        IAppData $appData,
        CollectionMapper $collections,
        PageMapper $pages
    ) {
        parent::__construct($time);
        $this->appData = $appData;
        $this->collections = $collections;
        $this->pages = $pages;

        $this->setInterval(24 * 60 * 60);
        $this->setTimeSensitivity(self::TIME_INSENSITIVE);
    }

    protected function run($argument): void {
        $referenced = $this->collectReferencedNames();
        $cutoff = $this->time->getTime() - self::GRACE_SECONDS;

        try {
            $folders = $this->appData->getDirectoryListing();
        } catch (\Throwable $e) {
            return; // appdata henüz yok → temizlenecek bir şey de yok
        }

        foreach ($folders as $folder) {
            if (strpos($folder->getName(), 'media_') !== 0) {
                continue;
            }
            try {
                $files = $folder->getDirectoryListing();
            } catch (\Throwable $e) {
                continue;
            }
            foreach ($files as $file) {
                try {
                    if (isset($referenced[$file->getName()])) {
                        continue;
                    }
                    if ($file->getMTime() > $cutoff) {
                        continue;
                    }
                    $file->delete();
                } catch (\Throwable $e) {
                    // tek bir dosya silinemezse iş durmasın; sonraki turda yine denenir
                }
            }
        }
    }

    /**
     * Sistemdeki her koleksiyon ve sayfanın kullandığı medya adları.
     * HTML bellekte tutulmaz; yalnızca eşleşen adlar biriktirilir.
     *
     * @return array<string,true> ad => true
     */
    private function collectReferencedNames(): array {
        $referenced = [];
        foreach ($this->collections->findAllIncludingDeleted() as $c) {
            $icon = (string)$c->getIcon();
            if ($icon !== '') {
                $referenced[$icon] = true;
            }
            foreach ($this->pages->findAllByCollection((int)$c->getId()) as $p) {
                $pIcon = (string)$p->getIcon();
                if ($pIcon !== '') {
                    $referenced[$pIcon] = true;
                }
                $html = (string)$p->getHtml();
                if ($html !== '' && preg_match_all(self::NAME_RE, $html, $m)) {
                    foreach ($m[0] as $name) {
                        $referenced[$name] = true;
                    }
                }
            }
        }
        return $referenced;
    }
}
