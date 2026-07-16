<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Controller;

use OCA\NextLibrary\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IL10N;
use OCP\IRequest;
use OCP\Util;

class PageController extends Controller {

    private IL10N $l10n;

    public function __construct(IRequest $request, IL10N $l10n) {
        parent::__construct(Application::APP_ID, $request);
        $this->l10n = $l10n;
    }

    /**
     * Rendered inside the Nextcloud frame (top bar and app menu are kept).
     * CSS/JS load through Nextcloud, so the script nonce is added automatically.
     *
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function index(): TemplateResponse {
        Util::addStyle(Application::APP_ID, 'style');
        Util::addScript(Application::APP_ID, 'app');

        $response = new TemplateResponse(Application::APP_ID, 'main', ['l' => $this->l10n]);

        // Kullanıcının eklediği medyaya izin: görsel (<img>, data:), video (<video>) ve
        // yalnızca güvenilir gömme kaynakları (YouTube / Vimeo <iframe>).
        $csp = new ContentSecurityPolicy();
        $csp->addAllowedImageDomain('*');
        $csp->addAllowedMediaDomain('*');
        $csp->addAllowedFrameDomain('https://www.youtube-nocookie.com');
        $csp->addAllowedFrameDomain('https://www.youtube.com');
        $csp->addAllowedFrameDomain('https://player.vimeo.com');
        $response->setContentSecurityPolicy($csp);

        return $response;
    }
}
