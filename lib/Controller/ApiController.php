<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Controller;

use OCA\NextLibrary\AppInfo\Application;
use OCA\NextLibrary\Db\Collection;
use OCA\NextLibrary\Db\CollectionMapper;
use OCA\NextLibrary\Db\Member;
use OCA\NextLibrary\Db\MemberMapper;
use OCA\NextLibrary\Db\Page;
use OCA\NextLibrary\Db\PageMapper;
use OCA\NextLibrary\Db\ReadState;
use OCA\NextLibrary\Db\ReadStateMapper;
use OCA\NextLibrary\Service\HtmlSanitizer;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\IAppData;
use OCP\Files\NotFoundException;
use OCP\Files\SimpleFS\ISimpleFolder;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IUserManager;
use OCP\IUserSession;

class ApiController extends Controller {

    private CollectionMapper $collections;
    private PageMapper $pages;
    private MemberMapper $members;
    private ReadStateMapper $reads;
    private IUserSession $userSession;
    private IGroupManager $groupManager;
    private IUserManager $userManager;
    private IAppData $appData;
    private HtmlSanitizer $sanitizer;

    public function __construct(
        IRequest $request,
        CollectionMapper $collections,
        PageMapper $pages,
        MemberMapper $members,
        ReadStateMapper $reads,
        IUserSession $userSession,
        IGroupManager $groupManager,
        IUserManager $userManager,
        IAppData $appData,
        HtmlSanitizer $sanitizer
    ) {
        parent::__construct(Application::APP_ID, $request);
        $this->collections = $collections;
        $this->pages = $pages;
        $this->members = $members;
        $this->reads = $reads;
        $this->userSession = $userSession;
        $this->groupManager = $groupManager;
        $this->userManager = $userManager;
        $this->appData = $appData;
        $this->sanitizer = $sanitizer;
    }

    // -------- Yardımcılar --------

    private function uid(): string {
        $u = $this->userSession->getUser();
        return $u ? $u->getUID() : '';
    }

    private function displayName(): string {
        $u = $this->userSession->getUser();
        return $u ? $u->getDisplayName() : '';
    }

    /** Kullanıcının kendi uid'i + üye olduğu grup id'leri (üyelik eşleşmesi için). */
    private function principals(): array {
        $u = $this->userSession->getUser();
        if ($u === null) {
            return [];
        }
        $groups = $this->groupManager->getUserGroupIds($u);
        return array_merge([$u->getUID()], $groups);
    }

    private function now(): int {
        return (int)round(microtime(true) * 1000);
    }

    /**
     * Sayfa yazımlarında koleksiyonun updated_at damgasını tazeler.
     * state(since) delta'sı bir koleksiyonun sayfalarını yalnızca koleksiyonun kendi
     * updated_at'i since'den büyükse gönderir. Damga tazelenmezse sayfa ekleme/düzenleme
     * ve özellikle GERİ YÜKLEME diğer istemcilere hiç ulaşmaz (silme, ayrı 'deleted'
     * listesiyle gittiği için ulaşır → silinir ama geri gelmez asimetrisi).
     */
    private function touchCollection(int $cid): void {
        try {
            $c = $this->collections->findWithDeleted($cid);
        } catch (DoesNotExistException $e) {
            return;
        }
        $c->setUpdatedAt($this->now());
        $this->collections->update($c);
    }

    /** Düzenleme yetkisi: Yalnızca Nextcloud yöneticileri (admin) düzenleyebilir. */
    private function canEdit(Collection $c): bool {
        $uid = $this->uid();
        if ($uid === '') {
            return false;
        }
        return $this->groupManager->isAdmin($uid);
    }

    /** Okuma yetkisi: herkese açık VEYA sahip VEYA herhangi bir rolde üye. */
    private function canRead(Collection $c): bool {
        if (($c->getVisibility() ?: 'public') === 'public') {
            return true;
        }
        $uid = $this->uid();
        if ($uid === '') {
            return false;
        }
        if ($c->getOwnerUid() === $uid) {
            return true;
        }
        $principals = $this->principals();
        foreach ($this->members->findByCollection((int)$c->getId()) as $m) {
            if (in_array($m->getPrincipal(), $principals, true)) {
                return true;
            }
        }
        return false;
    }

    /** principal (uid veya grup id) → görünen ad; çözülemezse principal döner. */
    private function principalLabel(string $principal, string $type): string {
        if ($type === 'group') {
            $g = $this->groupManager->get($principal);
            return $g !== null ? $g->getDisplayName() : $principal;
        }
        $u = $this->userManager->get($principal);
        return $u !== null ? $u->getDisplayName() : $principal;
    }

    private function collectionToArray(Collection $c): array {
        $pages = [];
        foreach ($this->pages->findByCollection((int)$c->getId()) as $p) {
            $pages[] = $p->jsonSerialize();
        }
        $members = [];
        foreach ($this->members->findByCollection((int)$c->getId()) as $m) {
            $members[] = [
                'principal' => $m->getPrincipal(),
                'type' => $m->getType(),
                'role' => $m->getRole() ?: 'editor',
                'label' => $this->principalLabel($m->getPrincipal(), $m->getType()),
            ];
        }
        $data = $c->jsonSerialize();
        $data['pages'] = $pages;
        $data['members'] = $members;
        $data['canEdit'] = $this->canEdit($c);
        $data['ownerName'] = $this->principalLabel($c->getOwnerUid(), 'user');
        return $data;
    }

    private function notFound(): JSONResponse {
        return new JSONResponse(['error' => 'not_found'], Http::STATUS_NOT_FOUND);
    }

    private function forbidden(): JSONResponse {
        return new JSONResponse(['error' => 'forbidden'], Http::STATUS_FORBIDDEN);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function state(): JSONResponse {
        $uid = $this->uid();
        if ($uid === '') {
            return new JSONResponse(['error' => 'unauthenticated'], Http::STATUS_UNAUTHORIZED);
        }
        $since = (int)$this->request->getParam('since', 0);
        $memberIds = $this->members->findCollectionIdsForPrincipals($this->principals());
        
        $collections = [];
        $deletedCollections = [];
        $deletedPages = [];

        $allReadable = $this->collections->findReadable($uid, $memberIds);

        if ($since === 0) {
            foreach ($allReadable as $c) {
                $collections[] = $this->collectionToArray($c);
            }
        } else {
            foreach ($allReadable as $c) {
                if ((int)$c->getUpdatedAt() > $since) {
                    $collections[] = $this->collectionToArray($c);
                }
            }
            foreach ($this->collections->findDeletedSince($uid, $memberIds, $since) as $dc) {
                $deletedCollections[] = (int)$dc->getId();
            }
            $readableIds = array_map(function(Collection $c) { return (int)$c->getId(); }, $allReadable);
            if (!empty($readableIds)) {
                foreach ($this->pages->findDeletedSince($readableIds, $since) as $dp) {
                    $deletedPages[] = (int)$dp->getId();
                }
            }
        }

        $readsMap = [];
        foreach ($this->reads->findByUser($uid) as $r) {
            $rTime = (int)$r->getReadAt();
            if ($since === 0 || $rTime > $since) {
                $readsMap[(string)$r->getPageId()] = $rTime;
            }
        }

        $respData = [
            'me' => ['id' => $uid, 'name' => $this->displayName()],
            'collections' => $collections,
            // syncAt daima sunucu saatinden verilir; istemci saatiyle karşılaştırma yapılırsa
            // saat kayması yüzünden delta'lar atlanabilir veya tekrarlanabilir.
            'syncAt' => $this->now(),
            'reads' => $readsMap,
        ];
        if ($since > 0) {
            $respData['deleted'] = [
                'collections' => $deletedCollections,
                'pages' => $deletedPages,
            ];
        }

        return new JSONResponse($respData);
    }

    // -------- Üye seçici: gerçek NC kullanıcı/grup araması --------

    /**
     * Üye eklerken kullanılan canlı arama. Boş sorgu ilk sayfayı döndürür (picker
     * açılışta boş kalmasın). Sadece giriş yapmış kullanıcılar erişebilir.
     * @NoAdminRequired
     * @UserRateThrottle(limit=60, period=60)
     */
    public function searchPrincipals(): JSONResponse {
        if ($this->uid() === '') {
            return new JSONResponse(['error' => 'unauthenticated'], Http::STATUS_UNAUTHORIZED);
        }
        $q = trim((string)$this->request->getParam('q', ''));
        $limit = 15;

        $users = [];
        foreach ($this->userManager->search($q, $limit) as $u) {
            $users[] = ['id' => $u->getUID(), 'name' => $u->getDisplayName()];
        }

        $groups = [];
        foreach ($this->groupManager->search($q, $limit) as $g) {
            $groups[] = ['id' => $g->getGID(), 'name' => $g->getDisplayName()];
        }

        return new JSONResponse(['users' => $users, 'groups' => $groups]);
    }

    // -------- Medya: NC appdata dosya deposu (base64 gömme yerine) --------

    /** Medya üst sınırı (video dahil). Frontend'deki kontrolle aynı olmalı. */
    private const MEDIA_MAX_BYTES = 50 * 1024 * 1024;

    /** İzin verilen görsel ve video türleri → uzantı eşlemesi. */
    private const MEDIA_TYPES = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/gif' => 'gif',
        'image/webp' => 'webp',
        'video/mp4' => 'mp4',
        'video/webm' => 'webm',
        'video/ogg' => 'ogg',
        // libmagic ogg konteynerine sıklıkla 'application/ogg' der → geçerli dosya reddedilmesin.
        'application/ogg' => 'ogg',
        'video/quicktime' => 'mov',
    ];

    /** Koleksiyona ait medya klasörü (appdata: media_<cid>) → erişim koleksiyonla eşleşir. */
    private function collMediaFolder(int $cid): ISimpleFolder {
        $key = 'media_' . $cid;
        try {
            return $this->appData->getFolder($key);
        } catch (NotFoundException $e) {
            return $this->appData->newFolder($key);
        }
    }

    /**
     * Medya yükler: data:URL veya dosya yüklemesini çözer, koleksiyona ait appdata klasörüne yazar.
     * Yalnızca hedef koleksiyonu düzenleyebilenler yükleyebilir (collectionId zorunlu).
     * @NoAdminRequired
     * @UserRateThrottle(limit=30, period=60)
     */
    public function upload(): JSONResponse {
        if ($this->uid() === '') {
            return new JSONResponse(['error' => 'unauthenticated'], Http::STATUS_UNAUTHORIZED);
        }
        // Yetki: hedef koleksiyonu düzenleyebiliyor mu? (collectionId artık zorunlu)
        $collectionId = (int)$this->request->getParam('collectionId', 0);
        if ($collectionId <= 0) {
            return new JSONResponse(['error' => 'collection_required'], Http::STATUS_BAD_REQUEST);
        }
        try {
            $c = $this->collections->find($collectionId);
        } catch (DoesNotExistException $e) {
            return $this->notFound();
        }
        if (!$this->canEdit($c)) {
            return $this->forbidden();
        }

        $data = (string)$this->request->getParam('data', '');
        $fileUpload = $this->request->getUploadedFile('file');

        if ($fileUpload !== null) {
            // PHP'nin yükleme hatasını (boyut aşımı, kısmi yükleme...) sessizce yutma.
            $err = (int)($fileUpload['error'] ?? UPLOAD_ERR_NO_FILE);
            if ($err !== UPLOAD_ERR_OK) {
                $code = ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) ? 'too_large' : 'upload_failed';
                return new JSONResponse(['error' => $code], Http::STATUS_BAD_REQUEST);
            }
            $tmp = (string)($fileUpload['tmp_name'] ?? '');
            if ($tmp === '' || !is_uploaded_file($tmp)) {
                return new JSONResponse(['error' => 'upload_failed'], Http::STATUS_BAD_REQUEST);
            }
            // Boyutu diskten kontrol et — belleğe almadan önce (50MB'lık dosyayı boşuna okumayalım).
            if (filesize($tmp) > self::MEDIA_MAX_BYTES) {
                return new JSONResponse(['error' => 'too_large'], Http::STATUS_BAD_REQUEST);
            }
            // $fileUpload['type'] TARAYICIDAN gelir ve sahtelenebilir → gerçek içerikten tespit et.
            $detected = strtolower((string)(new \finfo(FILEINFO_MIME_TYPE))->file($tmp));
            if (!isset(self::MEDIA_TYPES[$detected])) {
                return new JSONResponse(['error' => 'unsupported_type'], Http::STATUS_BAD_REQUEST);
            }
            $mime = $detected;
            $bin = file_get_contents($tmp);
        } else {
            if (!preg_match('#^data:([a-z0-9/+.-]+);base64,(.+)$#is', $data, $m)) {
                return new JSONResponse(['error' => 'bad_data'], Http::STATUS_BAD_REQUEST);
            }
            $mime = strtolower($m[1]);
            if (!isset(self::MEDIA_TYPES[$mime])) {
                return new JSONResponse(['error' => 'unsupported_type'], Http::STATUS_BAD_REQUEST);
            }
            $bin = base64_decode($m[2], true);
            if ($bin === false || $bin === '') {
                return new JSONResponse(['error' => 'decode_failed'], Http::STATUS_BAD_REQUEST);
            }
            if (strlen($bin) > self::MEDIA_MAX_BYTES) {
                return new JSONResponse(['error' => 'too_large'], Http::STATUS_BAD_REQUEST);
            }
            // data:URL'deki tür etiketi de istemciden gelir → gerçek içerikle doğrula.
            $detected = strtolower((string)(new \finfo(FILEINFO_MIME_TYPE))->buffer($bin));
            if (!isset(self::MEDIA_TYPES[$detected])) {
                return new JSONResponse(['error' => 'unsupported_type'], Http::STATUS_BAD_REQUEST);
            }
            $mime = $detected;
        }

        if ($bin === false || $bin === '') {
            return new JSONResponse(['error' => 'decode_failed'], Http::STATUS_BAD_REQUEST);
        }
        if (strlen($bin) > self::MEDIA_MAX_BYTES) {
            return new JSONResponse(['error' => 'too_large'], Http::STATUS_BAD_REQUEST);
        }

        $name = bin2hex(random_bytes(16)) . '.' . self::MEDIA_TYPES[$mime];
        try {
            $file = $this->collMediaFolder($collectionId)->newFile($name);
            $file->putContent($bin);
        } catch (\Throwable $e) {
            return new JSONResponse(['error' => 'store_failed'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
        return new JSONResponse(['name' => $name, 'collectionId' => $collectionId]);
    }

    /**
     * Koleksiyona ait görsel veya videoyu servis eder — YALNIZCA koleksiyonu okuyabilenlere.
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function media(int $cid, string $name): DataDisplayResponse {
        // Yol geçişini engelle: yalnızca üretilen ad biçimi (hex.uzantı)
        if (!preg_match('/^[a-f0-9]{32}\.(png|jpg|gif|webp|mp4|webm|ogg|mov)$/', $name, $m)) {
            return new DataDisplayResponse('', Http::STATUS_NOT_FOUND);
        }
        // Erişim: koleksiyonu okuma yetkisi (canRead)
        try {
            $c = $this->collections->find($cid);
        } catch (DoesNotExistException $e) {
            return new DataDisplayResponse('', Http::STATUS_NOT_FOUND);
        }
        if ($this->uid() === '' || !$this->canRead($c)) {
            return new DataDisplayResponse('', Http::STATUS_FORBIDDEN);
        }
        try {
            $file = $this->collMediaFolder($cid)->getFile($name);
            $content = $file->getContent();
        } catch (NotFoundException $e) {
            return new DataDisplayResponse('', Http::STATUS_NOT_FOUND);
        }
        $extMime = [
            'png' => 'image/png', 
            'jpg' => 'image/jpeg', 
            'gif' => 'image/gif', 
            'webp' => 'image/webp',
            'mp4' => 'video/mp4',
            'webm' => 'video/webm',
            'ogg' => 'video/ogg',
            'mov' => 'video/quicktime'
        ];
        $resp = new DataDisplayResponse($content, Http::STATUS_OK, [
            'Content-Type' => $extMime[$m[1]],
        ]);
        $resp->cacheFor(2592000); // 30 gün — ad rastgele/immutable
        return $resp;
    }

    // -------- Import (localStorage → sunucu) --------

    /**
     * Yalnızca sunucu tamamen boşsa içe aktarır (tekrarlı import'u önler).
     * @NoAdminRequired
     * @UserRateThrottle(limit=5, period=60)
     */
    public function import(): JSONResponse {
        $uid = $this->uid();
        if ($uid === '') {
            return new JSONResponse(['error' => 'unauthenticated'], Http::STATUS_UNAUTHORIZED);
        }
        if (!$this->groupManager->isAdmin($uid)) {
            return $this->forbidden();
        }
        // Zaten veri varsa import etme; mevcut durumu döndür
        if (count($this->collections->findAll()) > 0) {
            return $this->state();
        }
        $payload = $this->request->getParam('collections', []);
        if (!is_array($payload)) {
            $payload = [];
        }
        foreach ($payload as $col) {
            if (!is_array($col)) {
                continue;
            }
            $c = new Collection();
            $c->setOwnerUid($uid); // içe aktaran kişi sahip olur
            $c->setEmoji((string)($col['emoji'] ?? '📘'));
            $c->setName((string)($col['name'] ?? 'Koleksiyon'));
            $c->setVisibility($this->normVisibility($col['visibility'] ?? 'public'));
            $c->setCreatedAt($this->now());
            $c->setUpdatedAt($this->now());
            $c = $this->collections->insert($c);
            $cid = (int)$c->getId();

            $this->replaceMembers($cid, $col['members'] ?? []);

            $pages = $col['pages'] ?? [];
            if (is_array($pages)) {
                $sort = 0;
                foreach ($pages as $pg) {
                    if (!is_array($pg)) {
                        continue;
                    }
                    $p = new Page();
                    $p->setCollectionId($cid);
                    $p->setEmoji((string)($pg['emoji'] ?? '📄'));
                    $p->setTitle((string)($pg['title'] ?? ''));
                    $p->setHtml($this->sanitizer->clean((string)($pg['html'] ?? '')));
                    $p->setSort($sort++);
                    $p->setCreatedAt($this->now());
                    $p->setUpdatedAt($this->now());
                    $this->pages->insert($p);
                }
            }
        }
        return $this->state();
    }

    // -------- Koleksiyon yazma --------

    /**
     * @NoAdminRequired
     * @UserRateThrottle(limit=20, period=60)
     */
    public function createCollection(): JSONResponse {
        $uid = $this->uid();
        if ($uid === '') {
            return new JSONResponse(['error' => 'unauthenticated'], Http::STATUS_UNAUTHORIZED);
        }
        if (!$this->groupManager->isAdmin($uid)) {
            return $this->forbidden();
        }
        $name = trim((string)$this->request->getParam('name', ''));
        if ($name === '') {
            return new JSONResponse(['error' => 'name_required'], Http::STATUS_BAD_REQUEST);
        }
        $c = new Collection();
        $c->setOwnerUid($uid);
        $c->setEmoji((string)$this->request->getParam('emoji', '📘'));
        $c->setName($name);
        $c->setVisibility($this->normVisibility($this->request->getParam('visibility', 'public')));
        $c->setCreatedAt($this->now());
        $c->setUpdatedAt($this->now());
        $c = $this->collections->insert($c);
        $cid = (int)$c->getId();

        $this->replaceMembers($cid, $this->request->getParam('members', []));

        $pages = $this->request->getParam('pages', []);
        if (is_array($pages)) {
            $sort = 0;
            foreach ($pages as $pg) {
                if (!is_array($pg)) {
                    continue;
                }
                $p = new Page();
                $p->setCollectionId($cid);
                $p->setEmoji((string)($pg['emoji'] ?? '📄'));
                $p->setTitle((string)($pg['title'] ?? ''));
                $p->setHtml($this->sanitizer->clean((string)($pg['html'] ?? '')));
                $p->setSort($sort++);
                $p->setCreatedAt($this->now());
                $p->setUpdatedAt($this->now());
                $this->pages->insert($p);
            }
        }
        return new JSONResponse($this->collectionToArray($c));
    }

    /**
     * @NoAdminRequired
     * @UserRateThrottle(limit=60, period=60)
     */
    public function updateCollection(int $id): JSONResponse {
        try {
            $c = $this->collections->find($id);
        } catch (DoesNotExistException $e) {
            return $this->notFound();
        }
        if (!$this->canEdit($c)) {
            return $this->forbidden();
        }
        $emoji = $this->request->getParam('emoji', null);
        $name = $this->request->getParam('name', null);
        $visibility = $this->request->getParam('visibility', null);
        if ($emoji !== null) {
            $c->setEmoji((string)$emoji);
        }
        if ($name !== null && trim((string)$name) !== '') {
            $c->setName(trim((string)$name));
        }
        if ($visibility !== null) {
            $c->setVisibility($this->normVisibility($visibility));
        }
        $c->setUpdatedAt($this->now());
        $this->collections->update($c);
        return new JSONResponse($this->collectionToArray($c));
    }

    /**
     * @NoAdminRequired
     * @UserRateThrottle(limit=30, period=60)
     */
    public function deleteCollection(int $id): JSONResponse {
        try {
            $c = $this->collections->find($id);
        } catch (DoesNotExistException $e) {
            return $this->notFound();
        }
        if (!$this->canEdit($c)) {
            return $this->forbidden();
        }
        $now = $this->now();
        $c->setDeletedAt($now);
        $c->setUpdatedAt($now);
        $this->collections->update($c);

        foreach ($this->pages->findByCollection($id) as $p) {
            $p->setDeletedAt($now);
            $p->setUpdatedAt($now);
            $this->pages->update($p);
        }
        return new JSONResponse(['ok' => true]);
    }

    /**
     * @NoAdminRequired
     * @UserRateThrottle(limit=30, period=60)
     */
    public function setMembers(int $id): JSONResponse {
        try {
            $c = $this->collections->find($id);
        } catch (DoesNotExistException $e) {
            return $this->notFound();
        }
        if (!$this->canEdit($c)) {
            return $this->forbidden();
        }
        $this->members->deleteByCollection($id);
        $this->replaceMembers($id, $this->request->getParam('members', []));
        // Üye yönetimi ekranından görünürlük de birlikte gelebilir
        $visibility = $this->request->getParam('visibility', null);
        if ($visibility !== null) {
            $c->setVisibility($this->normVisibility($visibility));
            $c->setUpdatedAt($this->now());
            $this->collections->update($c);
        }
        return new JSONResponse($this->collectionToArray($c));
    }

    private function addMember(int $collectionId, string $principal, string $type, string $role = 'editor'): void {
        $m = new Member();
        $m->setCollectionId($collectionId);
        $m->setPrincipal($principal);
        $m->setType($type === 'group' ? 'group' : 'user');
        $m->setRole($role === 'reader' ? 'reader' : 'editor');
        try {
            $this->members->insert($m);
        } catch (\Throwable $e) {
            // uniq index çakışması (aynı üye) → yoksay
        }
    }

    /** Bir koleksiyonun üye dizisini payload'dan yeniden yaz (rol dahil). */
    private function replaceMembers(int $collectionId, $members): void {
        if (!is_array($members)) {
            return;
        }
        foreach ($members as $mem) {
            $principal = is_array($mem) ? (string)($mem['principal'] ?? '') : (string)$mem;
            $type = is_array($mem) ? (string)($mem['type'] ?? 'user') : 'user';
            $role = is_array($mem) ? (string)($mem['role'] ?? 'editor') : 'editor';
            if ($principal !== '') {
                $this->addMember($collectionId, $principal, $type, $role);
            }
        }
    }

    /** Görünürlük değerini doğrula ('public' | 'private'). */
    private function normVisibility($v): string {
        return ((string)$v === 'private') ? 'private' : 'public';
    }

    // -------- Sayfa yazma --------

    /**
     * @NoAdminRequired
     * @UserRateThrottle(limit=60, period=60)
     */
    public function createPage(int $id): JSONResponse {
        try {
            $c = $this->collections->find($id);
        } catch (DoesNotExistException $e) {
            return $this->notFound();
        }
        if (!$this->canEdit($c)) {
            return $this->forbidden();
        }
        $existing = $this->pages->findByCollection($id);
        $maxSort = 0;
        foreach ($existing as $p) {
            $maxSort = max($maxSort, (int)$p->getSort());
        }
        $p = new Page();
        $p->setCollectionId($id);
        $p->setEmoji((string)$this->request->getParam('emoji', '📄'));
        $p->setTitle((string)$this->request->getParam('title', ''));
        $p->setHtml($this->sanitizer->clean((string)$this->request->getParam('html', '')));
        $p->setSort($maxSort + 1);
        $p->setCreatedAt($this->now());
        $p->setUpdatedAt($this->now());
        $p = $this->pages->insert($p);
        $this->touchCollection($id);
        return new JSONResponse($p->jsonSerialize());
    }

    /**
     * @NoAdminRequired
     * @UserRateThrottle(limit=300, period=60)
     */
    public function updatePage(int $id): JSONResponse {
        try {
            $p = $this->pages->find($id);
            $c = $this->collections->find((int)$p->getCollectionId());
        } catch (DoesNotExistException $e) {
            return $this->notFound();
        }
        if (!$this->canEdit($c)) {
            return $this->forbidden();
        }

        // Çakışma Kontrolü (Optimistic Locking)
        $lastUpdatedAt = $this->request->getParam('lastUpdatedAt', null);
        $force = $this->request->getParam('force', false);
        if ($lastUpdatedAt !== null && !$force) {
            if ((int)$p->getUpdatedAt() > (int)$lastUpdatedAt) {
                return new JSONResponse([
                    'error' => 'conflict',
                    'serverPage' => $p->jsonSerialize()
                ], Http::STATUS_CONFLICT);
            }
        }

        $emoji = $this->request->getParam('emoji', null);
        $title = $this->request->getParam('title', null);
        $html = $this->request->getParam('html', null);
        $sort = $this->request->getParam('sort', null);
        if ($emoji !== null) {
            $p->setEmoji((string)$emoji);
        }
        if ($title !== null) {
            $p->setTitle((string)$title);
        }
        if ($html !== null) {
            $p->setHtml($this->sanitizer->clean((string)$html));
        }
        if ($sort !== null) {
            $p->setSort((int)$sort);
        }
        $p->setUpdatedAt($this->now());
        $this->pages->update($p);
        $this->touchCollection((int)$p->getCollectionId());
        return new JSONResponse($p->jsonSerialize());
    }

    /**
     * @NoAdminRequired
     * @UserRateThrottle(limit=60, period=60)
     */
    public function deletePage(int $id): JSONResponse {
        try {
            $p = $this->pages->find($id);
            $c = $this->collections->find((int)$p->getCollectionId());
        } catch (DoesNotExistException $e) {
            return $this->notFound();
        }
        if (!$this->canEdit($c)) {
            return $this->forbidden();
        }
        $now = $this->now();
        $p->setDeletedAt($now);
        $p->setUpdatedAt($now);
        $this->pages->update($p);
        return new JSONResponse(['ok' => true]);
    }

    // -------- Çöp Kutusu Yönetimi --------

    /**
     * @NoAdminRequired
     */
    public function trash(): JSONResponse {
        $uid = $this->uid();
        if ($uid === '') {
            return new JSONResponse(['error' => 'unauthenticated'], Http::STATUS_UNAUTHORIZED);
        }
        $memberIds = $this->members->findCollectionIdsForPrincipals($this->principals());
        
        $collections = [];
        foreach ($this->collections->findDeletedReadable($uid, $memberIds) as $c) {
            $collections[] = $this->collectionToArray($c);
        }

        $pages = [];
        $readableIds = array_map(function($c) { return (int)$c->getId(); }, $this->collections->findReadable($uid, $memberIds));
        if (!empty($readableIds)) {
            foreach ($readableIds as $cid) {
                foreach ($this->pages->findDeletedPages($cid) as $p) {
                    $pages[] = $p->jsonSerialize();
                }
            }
        }

        return new JSONResponse([
            'collections' => $collections,
            'pages' => $pages
        ]);
    }

    /**
     * @NoAdminRequired
     * @UserRateThrottle(limit=30, period=60)
     */
    public function restoreCollection(int $id): JSONResponse {
        $uid = $this->uid();
        if ($uid === '') {
            return new JSONResponse(['error' => 'unauthenticated'], Http::STATUS_UNAUTHORIZED);
        }
        try {
            $c = $this->collections->findWithDeleted($id);
        } catch (DoesNotExistException $e) {
            return $this->notFound();
        }
        if (!$this->canEdit($c)) {
            return $this->forbidden();
        }

        $now = $this->now();
        $c->setDeletedAt(0);
        $c->setUpdatedAt($now);
        $this->collections->update($c);

        foreach ($this->pages->findDeletedPages($id) as $p) {
            $p->setDeletedAt(0);
            $p->setUpdatedAt($now);
            $this->pages->update($p);
        }

        return new JSONResponse($this->collectionToArray($c));
    }

    /**
     * @NoAdminRequired
     * @UserRateThrottle(limit=60, period=60)
     */
    public function restorePage(int $id): JSONResponse {
        $uid = $this->uid();
        if ($uid === '') {
            return new JSONResponse(['error' => 'unauthenticated'], Http::STATUS_UNAUTHORIZED);
        }
        try {
            $p = $this->pages->findWithDeleted($id);
            $c = $this->collections->findWithDeleted((int)$p->getCollectionId());
        } catch (DoesNotExistException $e) {
            return $this->notFound();
        }
        if (!$this->canEdit($c)) {
            return $this->forbidden();
        }

        $now = $this->now();
        // Eğer bağlı olduğu koleksiyon da silinmişse, koleksiyonu da geri yükle
        if ($c->getDeletedAt() > 0) {
            $c->setDeletedAt(0);
            $c->setUpdatedAt($now);
            $this->collections->update($c);
        }

        $p->setDeletedAt(0);
        $p->setUpdatedAt($now);
        $this->pages->update($p);
        $this->touchCollection((int)$p->getCollectionId());

        return new JSONResponse($p->jsonSerialize());
    }

    /**
     * @NoAdminRequired
     * @UserRateThrottle(limit=20, period=60)
     */
    public function purgeCollection(int $id): JSONResponse {
        try {
            $c = $this->collections->findWithDeleted($id);
        } catch (DoesNotExistException $e) {
            return $this->notFound();
        }
        if (!$this->canEdit($c)) {
            return $this->forbidden();
        }

        // Kalıcı silme işlemleri
        $pages = $this->pages->findDeletedPages($id);
        $activePages = $this->pages->findByCollection($id);
        $allPages = array_merge($pages, $activePages);

        foreach ($allPages as $p) {
            $this->reads->deleteByPage((int)$p->getId());
            $this->pages->delete($p);
        }

        $this->members->deleteByCollection($id);

        try {
            $this->collMediaFolder($id)->delete();
        } catch (\Throwable $e) {
            // yoksay
        }

        $this->collections->delete($c);

        return new JSONResponse(['ok' => true]);
    }

    /**
     * @NoAdminRequired
     * @UserRateThrottle(limit=20, period=60)
     */
    public function purgePage(int $id): JSONResponse {
        try {
            $p = $this->pages->findWithDeleted($id);
            $c = $this->collections->findWithDeleted((int)$p->getCollectionId());
        } catch (DoesNotExistException $e) {
            return $this->notFound();
        }
        if (!$this->canEdit($c)) {
            return $this->forbidden();
        }

        $this->reads->deleteByPage($id);
        $this->pages->delete($p);

        return new JSONResponse(['ok' => true]);
    }

    // -------- Okundu (kullanıcı-bazlı; her giriş yapan işaretleyebilir) --------

    /**
     * @NoAdminRequired
     */
    public function markRead(int $id): JSONResponse {
        $uid = $this->uid();
        if ($uid === '') {
            return new JSONResponse(['error' => 'unauthenticated'], Http::STATUS_UNAUTHORIZED);
        }
        try {
            $this->pages->find($id);
        } catch (DoesNotExistException $e) {
            return $this->notFound();
        }
        $now = $this->now();
        $existing = $this->reads->findOne($uid, $id);
        if ($existing !== null) {
            $existing->setReadAt($now);
            $this->reads->update($existing);
        } else {
            $r = new ReadState();
            $r->setUserUid($uid);
            $r->setPageId($id);
            $r->setReadAt($now);
            try {
                $this->reads->insert($r);
            } catch (\Throwable $e) {
                // yarış durumu / uniq çakışma → yoksay
            }
        }
        return new JSONResponse(['pageId' => $id, 'readAt' => $now]);
    }

    /**
     * @NoAdminRequired
     */
    public function unmarkRead(int $id): JSONResponse {
        $uid = $this->uid();
        if ($uid === '') {
            return new JSONResponse(['error' => 'unauthenticated'], Http::STATUS_UNAUTHORIZED);
        }
        $existing = $this->reads->findOne($uid, $id);
        if ($existing !== null) {
            $this->reads->delete($existing);
        }
        return new JSONResponse(['ok' => true]);
    }
}
