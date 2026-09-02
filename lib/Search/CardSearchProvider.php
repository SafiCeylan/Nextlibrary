<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Search;

use OCA\NextLibrary\AppInfo\Application;
use OCA\NextLibrary\Db\CollectionMapper;
use OCA\NextLibrary\Db\MemberMapper;
use OCA\NextLibrary\Db\Page;
use OCA\NextLibrary\Db\PageMapper;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\Search\IProvider;
use OCP\Search\ISearchQuery;
use OCP\Search\SearchResult;
use OCP\Search\SearchResultEntry;

/**
 * Kartları Nextcloud'un üst arama kutusuna bağlar.
 *
 * Uygulamanın kendi araması yalnızca TARAYICIYA YÜKLENMİŞ kartlarda çalışır; bu
 * sağlayıcı sorguyu veritabanına indirir, yani kullanıcı uygulamayı hiç açmadan da
 * kartını bulabilir.
 *
 * Yetki: arama, kullanıcının okuyabildiği koleksiyonlarla SINIRLI. Küme burada
 * ApiController::state() ile aynı şekilde kuruluyor (public + sahip + üyelik) —
 * özel bir koleksiyon, üyesi olmayan birinin arama sonucunda görünmez.
 * ⚠️ Editörlük okuma yetkisi VERMEZ: uygulamadaki kuralla aynı, editör de üyesi
 * olmadığı özel koleksiyonu aramada göremez.
 */
class CardSearchProvider implements IProvider {

    /** Gövdeden üretilen özetin uzunluğu. */
    private const SNIPPET_LEN = 120;

    private PageMapper $pages;
    private CollectionMapper $collections;
    private MemberMapper $members;
    private IGroupManager $groupManager;
    private IURLGenerator $url;
    private IL10N $l;

    public function __construct(
        PageMapper $pages,
        CollectionMapper $collections,
        MemberMapper $members,
        IGroupManager $groupManager,
        IURLGenerator $url,
        IL10N $l
    ) {
        $this->pages = $pages;
        $this->collections = $collections;
        $this->members = $members;
        $this->groupManager = $groupManager;
        $this->url = $url;
        $this->l = $l;
    }

    public function getId(): string {
        return Application::APP_ID;
    }

    public function getName(): string {
        return $this->l->t('Knowledge Cards');
    }

    /**
     * Kullanıcı zaten uygulamanın içindeyse kart sonuçları en üste çıkar; başka bir
     * uygulamadayken diğer sonuçların arasına normal sırada girer.
     */
    public function getOrder(string $route, array $routeParameters): int {
        return strpos($route, Application::APP_ID . '.') === 0 ? -1 : 55;
    }

    public function search(IUser $user, ISearchQuery $query): SearchResult {
        $readable = $this->readableCollections($user);
        if (empty($readable)) {
            return SearchResult::complete($this->getName(), []);
        }

        $limit = $query->getLimit();
        $cursor = (int)($query->getCursor() ?? 0);

        // Bir fazlasını iste: "daha var mı" sorusu ekstra bir COUNT sorgusu açmadan
        // cevaplanır (paginated yanıtı complete'ten ayırmak için gerekiyor).
        $rows = $this->pages->search($query->getTerm(), array_keys($readable), $limit + 1, $cursor);
        $hasMore = count($rows) > $limit;
        if ($hasMore) {
            array_pop($rows);
        }

        $entries = [];
        foreach ($rows as $p) {
            $entries[] = new SearchResultEntry(
                '',
                $p->getTitle() !== '' ? (string)$p->getTitle() : $this->l->t('Untitled'),
                $this->subline($p, $readable),
                $this->cardUrl((int)$p->getId()),
                $this->url->imagePath(Application::APP_ID, 'app-dark.svg')
            );
        }

        return $hasMore
            ? SearchResult::paginated($this->getName(), $entries, $cursor + $limit)
            : SearchResult::complete($this->getName(), $entries);
    }

    /**
     * Kullanıcının okuyabildiği koleksiyonlar: id => ad.
     * @return array<int,string>
     */
    private function readableCollections(IUser $user): array {
        $principals = array_merge([$user->getUID()], $this->groupManager->getUserGroupIds($user));
        $memberIds = $this->members->findCollectionIdsForPrincipals($principals);
        $out = [];
        foreach ($this->collections->findReadable($user->getUID(), $memberIds) as $c) {
            $out[(int)$c->getId()] = (string)$c->getName();
        }
        return $out;
    }

    /**
     * Sonucun altındaki açıklama: koleksiyon adı + gövdeden kısa bir özet.
     * Gövde HTML olduğu için etiketler ayıklanır; aksi halde kullanıcı sonuçta
     * "&lt;div class=..." görürdü.
     */
    private function subline(Page $p, array $readable): string {
        $coll = $readable[(int)$p->getCollectionId()] ?? '';
        $text = trim(preg_replace('/\s+/u', ' ', strip_tags((string)$p->getHtml())));
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if ($text === '') {
            return $coll;
        }
        if (mb_strlen($text) > self::SNIPPET_LEN) {
            $text = mb_substr($text, 0, self::SNIPPET_LEN) . '…';
        }
        return $coll === '' ? $text : $coll . ' · ' . $text;
    }

    /**
     * Karta doğrudan giden bağlantı. Uygulamanın kendi rotası tek bir sayfadır;
     * hangi kartın açılacağı `#card=<id>` ile taşınır (js/app.js: readHash).
     * Hash kullanılıyor çünkü sunucuya ek bir rota gerektirmez ve NC'nin kendi
     * yönlendirmesine dokunmaz.
     */
    private function cardUrl(int $pageId): string {
        return $this->url->linkToRouteAbsolute(Application::APP_ID . '.page.index') . '#card=' . $pageId;
    }
}
