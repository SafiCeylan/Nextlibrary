<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Settings;

use OCA\NextLibrary\AppInfo\Application;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IL10N;
use OCP\Settings\ISettings;
use OCP\Util;

/**
 * Yönetim → Bilgi Kartları: editör listesi.
 *
 * Listeyi yalnızca gerçek NC yöneticileri görebilir/değiştirebilir. Sayfa uygulamanın
 * kendi arayüzünden ayrıdır: `css/style.css`'in tamamı `#kesif-app` altında kapsanmış
 * olduğu için buraya uygulanmaz — bu yüzden ayrı ve küçük bir `css/admin.css` var.
 */
class AdminSettings implements ISettings {

    private IL10N $l10n;

    public function __construct(IL10N $l10n) {
        $this->l10n = $l10n;
    }

    public function getForm(): TemplateResponse {
        Util::addStyle(Application::APP_ID, 'admin');
        Util::addScript(Application::APP_ID, 'admin');

        return new TemplateResponse(Application::APP_ID, 'admin', ['l' => $this->l10n]);
    }

    public function getSection(): string {
        return Application::APP_ID;
    }

    public function getPriority(): int {
        return 50;
    }
}
