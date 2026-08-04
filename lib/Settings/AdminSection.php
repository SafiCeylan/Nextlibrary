<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Settings;

use OCA\NextLibrary\AppInfo\Application;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\Settings\IIconSection;

/**
 * Yönetim ayarlarında uygulamanın kendi bölümü.
 * Bölüm adı l10n'dan gelir; `info.xml` içindeki navigasyon adıyla aynı metni kullanır ki
 * yönetici, kenar çubuğunda uygulamayla aynı adı görsün.
 */
class AdminSection implements IIconSection {

    private IL10N $l10n;
    private IURLGenerator $urlGenerator;

    public function __construct(IL10N $l10n, IURLGenerator $urlGenerator) {
        $this->l10n = $l10n;
        $this->urlGenerator = $urlGenerator;
    }

    public function getID(): string {
        return Application::APP_ID;
    }

    public function getName(): string {
        return $this->l10n->t('Knowledge Cards');
    }

    public function getPriority(): int {
        return 75;
    }

    /**
     * ⚠️ `app.svg` DEĞİL — o BEYAZ çizili ve yalnızca uygulama menüsünün koyu zemini için.
     * Ayarların kenar çubuğu açık zeminli: beyaz simge orada görünmez oluyor, diğer
     * uygulamaların siyah simgeleri arasında sırıtıyordu (1.7.0'da bildirilen hata).
     * Koyu temada NC bu siyah simgeyi kendisi ters çevirir.
     */
    public function getIcon(): string {
        return $this->urlGenerator->imagePath(Application::APP_ID, 'app-dark.svg');
    }
}
