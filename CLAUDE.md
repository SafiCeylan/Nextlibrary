# 📚 CLAUDE.MD — Knowledge Cards (nextlibrary) | Proje Hafıza ve Geliştirme Kılavuzu

> Her oturumun başında bu dosyayı oku. Geliştirme bitince güncelle.
> Kullanıcıya görünen dokümantasyon `README.md` ve `CHANGELOG.md`'dir — bu dosya
> **geliştirme bağlamıdır**, oraya taşınmaz.

---

## 📌 Projenin Kimliği

| | |
|---|---|
| **App id** | `nextlibrary` (namespace: `OCA\NextLibrary`) |
| **Görünen ad** | Knowledge Cards — TR: *Bilgi Kartları* |
| **Sürüm** | 1.7.0 (4 Ağu 2026) |
| **Geliştirici** | Mehmet Safi Ceylan (SafiCeylan / memoc) |
| **Repo** | `github.com/SafiCeylan/Nextlibrary` |
| **Proje yolu** | `C:\Users\memoc\OneDrive\Desktop\agents\nextcloud-app\nextlibrary` |
| **Hedef** | Nextcloud 28–34, PHP 8.0–8.4 |
| **Lisans** | AGPL v3 |
| **Dağıtım** | Nextcloud App Store (imzalı tar.gz) + Docker tam-yığın paket |

### ⚠️ Klasör uyarısı
Uygulama **16 Tem 2026'da** `collectivemap/` → `nextlibrary/` olarak yeniden adlandırıldı
(App Store için). `nextcloud-app/collectivemap/` klasörü **boştur** (yalnızca eski bir
`.claude/` kalıntısı var). Yanlışlıkla orada çalışma — tüm kod `nextlibrary/` altında.
Eski iç kod adları hâlâ görünür: CSS/DOM kökü `#kesif-app`, localStorage öneki `kx_`.
**Bunlar kasıtlı bırakıldı; değiştirmek mevcut kullanıcıların yerel durumunu bozar.**

---

## 🏗️ Mimari (Genel Bakış)

Framework yok. **Vanilla JS tek dosya + PHP AppFramework.** Build adımı, npm, derleme yok —
dosyalar olduğu gibi sunucuya kopyalanır.

```
Tarayıcı
  └─ templates/main.php     → statik iskelet (#kesif-app), tüm metinler $l->t() ile
       └─ js/app.js         → TÜM istemci mantığı (~1950 satır, tek IIFE)
            │  fetch(API_BASE + ...)
            ▼
  lib/Controller/ApiController.php   → tek REST controller (yetki + doğrulama + JSON)
       ├─ Service/HtmlSanitizer.php  → her yazımda sunucu tarafı HTML temizliği
       ├─ Db/*Mapper.php             → QBMapper (collections / pages / members / reads)
       └─ IAppData                   → medya dosyaları (DB'de değil, appdata'da)
            ▼
  MariaDB/PostgreSQL/SQLite  (4 tablo)
```

**Tasarım kararı:** durum tek uçtan (`GET /api/state`) gelir; istemci sunucu modelini
kendi şekline çevirir (`mapColl`) ve **tüm id'leri string tutar** — render kodunun
tamamı string id varsayar, sayıya çevirme.

---

## 📁 Dosya Yapısı ve Sorumlulukları

```
nextlibrary/
├── appinfo/
│   ├── info.xml              # Store metadata, sürüm, bağımlılıklar, navigasyon.
│   └── routes.php            # 18 rota. Tek controller: api# + page#.
├── lib/
│   ├── AppInfo/Application.php      # Boş bootstrap (DI otomatik).
│   ├── Controller/
│   │   ├── PageController.php       # index(): şablon + CSP (medya/iframe izinleri).
│   │   └── ApiController.php        # ⭐ Projenin sunucu kalbi (~1100 satır).
│   ├── Db/                          # 4 Entity + 4 QBMapper. Mantık yok, sorgu var.
│   │   └── PageMapper::subtree()    # static — alt ağaç (BFS, döngü korumalı).
│   ├── Settings/                    # Yönetim → Bilgi Kartları (editör listesi).
│   │   ├── AdminSection.php         # Kenar çubuğu bölümü (simge + ad).
│   │   └── AdminSettings.php        # Formu döndürür; admin.php + admin.js/css yükler.
│   ├── Service/PermissionService.php # ⭐ Yazma yetkisinin TEK karar noktası.
│   ├── Service/HtmlSanitizer.php    # ⚠️ js/app.js sanitize() ile PARİTE ŞART.
│   ├── BackgroundJob/
│   │   └── CleanupMediaJob.php      # Günlük yetim medya toplayıcısı (info.xml'de kayıtlı).
│   └── Migration/                   # 4 adım — aşağıdaki şema geçmişine bak.
├── js/app.js                 # ⭐ İstemcinin tamamı. Tek IIFE, boot() içinde.
├── js/admin.js               # Ayar sayfası (editör seçici). app.js'ten BAĞIMSIZ.
├── css/style.css             # Tamamı #kesif-app altında kapsanmış (37 KB).
├── css/admin.css             # Yalnızca ayar sayfası — style.css oraya ULAŞMAZ.
├── templates/main.php        # Statik iskelet + i18n.
├── templates/admin.php       # Ayar formu iskeleti (#nextlibrary-admin).
├── l10n/tr.js + tr.json      # Türkçe. Kaynak dil İngilizce (ayrı dosya yok).
├── img/app.svg               # Navigasyon simgesi — BEYAZ (uygulama menüsünün koyu zemini).
├── img/app-dark.svg          # ⚠️ Aynı simgenin SİYAHI — ayarlar kenar çubuğu AÇIK zeminli.
│                             #    İkisini karıştırma: 1.7.0'da beyaz olan ayarlarda kayboldu.
├── docker/                   # Tam-yığın dağıtım (NC 30 + MariaDB + app gömülü).
├── tests/run.php             # Bağımlılıksız test koşucusu. Release'e GİRMEZ.
├── dev.html                  # NC dışında çalışan test koşumu. Release'e GİRMEZ.
├── screenshots/              # Store görselleri. Release'e GİRMEZ.
└── ../release.ps1            # ⭐ Paketle + imzala + doğrula (bir üst klasörde).
```

---

## 🗄️ Veri Modeli

### Tablolar

| Tablo | Alanlar | Not |
|-------|---------|-----|
| `nextlibrary_collections` | id, owner_uid, emoji, **icon**, name, visibility, created_at, updated_at, **deleted_at** | `visibility`: `public` \| `private` |
| `nextlibrary_pages` | id, collection_id, **parent_id**, **kind**, emoji, **icon**, title, html, sort, created_at, updated_at, **deleted_at** | `kind`: `page` \| `folder` |
| `nextlibrary_members` | id, collection_id, principal, type, role | uniq(collection_id, principal, type) |
| `nextlibrary_reads` | id, user_uid, page_id, read_at | uniq(user_uid, page_id) |

**Zaman damgaları milisaniyedir** (`(int)round(microtime(true)*1000)`), saniye değil.
**Silme her zaman yumuşaktır:** `deleted_at > 0` = çöp kutusunda. Kalıcı silme yalnızca
`purge*` uçlarında.

### Şema geçmişi (migration'lar)

| Sürüm | Dosya | Değişiklik |
|-------|-------|------------|
| 1.0.0 | `Version001000Date20260716000000` | 4 tablo. `html` = MEDIUMTEXT (16 MB) — TEXT'in 64 KB tavanı zengin sayfalara yetmiyor. |
| 1.1.0 | `Version001100Date20260731000000` | `pages.parent_id` (0 = kök) + `(collection_id, parent_id)` index. |
| 1.2.0 | `Version001200Date20260731120000` | `pages.kind` (`page`/`folder`). |
| 1.3.0 | `Version001300Date20260731150000` | `collections.icon` + `pages.icon` (yüklenmiş simge dosya adı). |

> **⚠️ Kural:** Index ve primary key adları **30 karakterin altında** olmalı. Doctrine ad
> vermezsen tablo adından türetir ve bu tablo adlarında taşar. Bu yüzden hepsi `nlib_*`.

### Ağaç yapısı
- `parent_id = 0` → koleksiyonun kökü. Aksi halde aynı koleksiyondaki bir kartın id'si.
- **Parent her zaman aynı `collection_id`'de olmalı** — `createPage` bunu doğrular
  (`parent_other_collection`), yoksa başka koleksiyonun ağacına dal eklenebilirdi.
- `sort` yalnızca **kardeşler arasında** anlamlıdır; sıralama her seviyede ayrı yapılır.
- Derinlik sınırı yok. Bozuk veri döngü yaratırsa hem PHP (`subtree` → `$seen`) hem JS
  (`guard > 200`) kilitlenmeye karşı korumalı.

---

## 🔌 REST API

Taban: `/apps/nextlibrary/api`. Tümü oturum + `requesttoken` ister.

**Yetki sütunu:** `yazar` = admin **veya** editör (`perms->canWrite`). `NC admin` = yalnızca
gerçek yönetici (uçta `#[NoAdminRequired]` yok).

| Metot | Yol | Yetki | Not |
|-------|-----|-------|-----|
| GET | `/state` | okuyucu | `?since=<ms>` → delta. `since` yoksa tam durum. |
| POST | `/import` | **yazar** | Yalnızca sunucu tamamen boşsa çalışır. |
| GET | `/principals?q=` | okuyucu | Üye seçici için NC kullanıcı/grup araması (60/dk). |
| POST | `/upload` | **yazar** | Görsel/video → appdata. `collectionId=0` → simge. |
| GET | `/media/{cid}/{name}` | koleksiyonu okuyabilen | 30 gün cache (ad immutable). |
| POST/PUT/DELETE | `/collections[/{id}]` | **yazar** | |
| PUT | `/collections/{id}/members` | **yazar** | Üye listesini tamamen değiştirir. |
| POST | `/collections/{id}/pages` | **yazar** | `parentId` opsiyonel. |
| PUT/DELETE | `/pages/{id}` | **yazar** | PUT'ta iyimser kilitleme (aşağıda). |
| POST/DELETE | `/pages/{id}/read` | **her oturum** | Okundu işareti kullanıcıya özel. |
| GET | `/trash` | okuyucu | |
| POST | `/collections/{id}/restore`, `/pages/{id}/restore` | **yazar** | |
| DELETE | `/collections/{id}/purge`, `/pages/{id}/purge` | **yazar** | Kalıcı. |
| GET/PUT | `/editors` | 🔒 **NC admin** | Editör listesi. Ayar sayfası buraya konuşur. |

**Rate limit** `#[UserRateLimit]` ile: yazma 20–60/dk, sayfa güncelleme 300/dk
(editör debounce'lu yazarken tetiklenir), import 5/dk.

---

## 🧹 Medya Yaşam Döngüsü

Dosya **DB'de değil appdata'da** durur; sayfa HTML'i ona **adıyla** referans verir
(`/api/media/<cid>/<32hex>.<uzantı>`). Yükleme `media_<cid>` klasörüne yazar; koleksiyon
henüz yokken seçilen simgeler ortak `media_0` klasörüne düşer (1.4.2 fallback'i onları
bulur).

Silen kimse yoktu → `lib/BackgroundJob/CleanupMediaJob.php` (günde bir, `info.xml`'de kayıtlı).
**Silme yönünde asla yanılmaması için kurulan üç emniyet:**
1. Referans kümesi **tüm sistem için tek sefer** kurulur (klasör başına değil) — adlar 32 hex,
   çakışma yok; dosya klasör değiştirse bile korunur.
2. HTML'de tam URL değil **ad biçimi** aranır → fazla eşleşir, eksik eşleşmez.
3. **Çöpteki** koleksiyon/sayfalar da referans sayılır (geri yüklenebilirler) ve yalnızca
   **24 saatten eski** dosyalar silinir (yüklenip henüz kaydedilmemiş dosya korunur).

`purgeCollection` klasörü zaten komple siler; `purgePage` medyaya dokunmaz — onu bu iş toplar.

## 🔐 Yetki Modeli — DİKKAT

Karar **tek yerde**: `lib/Service/PermissionService.php`. Controller'da hiçbir yerde
`isAdmin()` çağrısı **kalmadı** — hepsi `perms->canWrite($uid)`'den geçiyor.

```php
canWrite(uid) = isAdmin(uid)  VEYA  uid editör listesinde  VEYA  grubu editör listesinde
```

**Editör = uygulama içinde yönetici.** (4 Ağu 2026, kullanıcı kararı: *"admin belli
kullanıcılara yetki verecek"* + *"admin gibi tam yetki"*.) Koleksiyon açar/siler, kalıcı
siler, üye ve görünürlük yönetir, medya yükler. Fark yalnızca NC'nin kendi yönetim
panelinde.

### İki kapı ayrı — bilerek

| | Kim yapabilir |
|---|---|
| Uygulama içinde yazmak | admin **+ editörler** |
| **Editör listesini değiştirmek** | **yalnızca gerçek NC admin** |

`ApiController::getEditors/setEditors` uçlarında `#[NoAdminRequired]` **YOK** — AppFramework
onları admin'e kilitler. **Bu attribute'u ekleme:** editör kendi listesini düzenleyebilseydi
kendini kalıcılaştırır, yönetici geri alamazdı.

### Depolama
`IConfig` app-value, iki anahtar: `editor_users`, `editor_groups` (JSON dizi).
`IAppConfig` **kullanılamaz** — NC 29+; uygulama 28'i de destekliyor.
Kaydederken var olmayan hesap/gruplar elenir, liste `MAX_ENTRIES=200`'de kesilir,
bozuk JSON boş listeye düşer (asla "herkes editör" değil).

### Hâlâ geçerli: `members.role` bir şey YAPMAZ
`editor`/`reader` DB'de duruyor ama **hiçbir yetkiyi etkilemiyor**. Üyelik yalnızca
`visibility=private` koleksiyonlarda **okuma** erişimi verir. Yetki uygulama geneli olduğu
için arayüzdeki rol düğmesi 1.6.0'da kaldırıldı ve **geri konmadı** — koymak yine var
olmayan bir ayrım vaat etmek olur. Koleksiyon bazlı yetki isteniyorsa `canEdit(Collection $c)`
imzası bunun için duruyor (parametre kullanılmıyor ama yerinde).

Okuma (`canRead`): `visibility=public` **VEYA** sahip **VEYA** herhangi bir rolde üye
(kullanıcı uid'i ya da üye olduğu grup id'si eşleşirse). **Editörlük okuma yetkisi vermez:**
üyesi olmadığı özel bir koleksiyon editörün `state()` yanıtında **görünmez**.

> ⚠️ Ama listede görünmemek yazmayı engellemiyor: yazma uçları yalnızca `canEdit()`'e bakar,
> `canRead()`'e **bakmaz**. Yani id'sini bilen bir editör, göremediği özel bir koleksiyona
> yazabilir. Bu 1.7.0'ın getirdiği bir açık **değil** — adminler için baştan beri böyleydi
> ve "editör = admin" kararının doğal sonucu. Kapatılacaksa yazma uçlarına `canRead()`
> kontrolü eklenmeli; bu **adminlerin** davranışını da değiştirir, kullanıcıya sor.

**İstemci tarafı:** `state.canCreate` + `collection.canEdit` sunucudan gelir. Bu bayraklar
gelmezse istemci `false` varsayar → yazma düğmeleri gizlenir. 1.0.7'de düzeltilen hata
tam olarak buydu: düğmeler herkese gösteriliyor, tıklayan 403 alıyordu.

---

## 🔄 Senkron Mimarisi — projenin en kırılgan yeri

20 saniyede bir `syncTick()` → `loadState()` → `GET /state?since=<lastSyncAt>`.

### Sunucu tarafı sözleşmesi

1. **`touchCollection($cid)` çağrılmazsa değişiklik hiç yayılmaz.**
   Delta, bir koleksiyonun sayfalarını yalnızca **koleksiyonun kendi `updated_at`'i**
   `since`'den büyükse gönderir. Sayfa yazan her uç (`createPage`, `updatePage`,
   `deletePage`, `restorePage`) bu yüzden `touchCollection()` çağırır.
   > Silme ayrı `deleted` listesiyle gittiği için damgasız da ulaşır → damga unutulursa
   > **"silinir ama geri gelmez"** asimetrisi oluşur. Bu bilinerek yazıldı, bozma.

2. **`syncAt` daima sunucu saatinden verilir.** İstemci saatiyle karşılaştırılırsa saat
   kayması yüzünden delta'lar atlanır veya tekrarlanır.

3. `since > 0` yanıtına `deleted: {collections:[], pages:[]}` eklenir.

### İstemci tarafı sözleşmesi

- **`colls` boşken delta çekilmez** (`loadState`: `forceFull || colls.length === 0` → `since=0`).
  Aksi halde sayfa yenilendiğinde ekran boş kalır ve veriler silinmiş görünür.
- `applySyncState()` **değişiklik oldu mu** döndürür. Değişiklik yoksa render edilmez —
  `#viewer` baştan yazılırsa okuma pozisyonu başa sarar, giriş animasyonu tekrar oynar.
- `syncPaused()` — yoklamanın zarar vereceği anlar, hepsi ayrı sebeple:
  `editing` (re-render contenteditable'ı siler), `saveInFlight`/`savePendingPage`/
  `isConflictOpen` (bayat veriyle kullanıcıyı kendisiyle çakıştırma), açık modal,
  `document.hidden`.

### İyimser kilitleme (optimistic locking)

`PUT /pages/{id}` gövdesinde `lastUpdatedAt` gider. Sunucudaki `updated_at` daha büyükse
**409 + `serverPage`** döner; istemci "sunucu sürümünü yükle / benimkini üzerine yaz"
modalını açar (`force: true` ile ikinci deneme).

- **Kayıtlar sıraya alınır** (`saveInFlight` / `savePendingPage`). Alınmazsa aynı sayfa için
  iki kayıt aynı anda uçar, ikincisi bayat `lastUpdatedAt` yollar ve kullanıcı
  **kendisiyle** çakışır.
- Çakışma modalı `ROOT`'a (`#kesif-app`) eklenir, `document.body`'ye **değil** —
  CSS'in tamamı `#kesif-app` altında kapsandığı için body'ye eklenen modal tamamen stilsiz kalır.
- `mapColl` içinde `updatedAt` alanı düşerse çakışma kontrolü **sessizce devre dışı kalır**.

---

## 🛡️ Güvenlik

| Katman | Nerede | Not |
|--------|--------|-----|
| **Çift HTML sanitizasyonu** | `js/app.js: sanitize()` + `lib/Service/HtmlSanitizer.php` | İstemci baypas edilip API'ye doğrudan POST atılabilir → sunucu tarafı şart. **İki liste birebir aynı kalmalı** (etiket, öznitelik, URL şeması, iframe kuralı) — `tests/run.php` bunu kilitler. `STRIKE` listede: tarayıcının `strikeThrough` çıktısı `<s>` değil `<strike>`. |
| **iframe beyaz listesi** | `EMBED_RE` | Yalnızca youtube-nocookie / youtube / player.vimeo `/embed/` yolları. `referrerpolicy=strict-origin-when-cross-origin` zorlanır (NC'nin `no-referrer`'ı YouTube Error 153 üretiyordu). |
| **MIME doğrulama** | `ApiController::upload()` | Tarayıcının bildirdiği tür **sahtelenebilir** → `finfo` ile içerikten tespit edilir. `application/ogg` da kabul (libmagic ogg'a böyle diyor). |
| **Yol geçişi** | `media()` regex + `normIcon()` | Yalnızca `^[a-f0-9]{32}\.(png\|jpg\|gif\|webp\|mp4\|webm\|ogg\|mov)$`. `icon` alanı bu yüzden asla yol/URL taşıyamaz. |
| **Medya erişim denetimi** | `media()` | Dosya koleksiyona bağlı klasörde (`media_<cid>`); servis öncesi `canRead()`. |
| **Boyut sınırı** | 50 MB (`MEDIA_MAX_BYTES`) | **Frontend'deki kontrolle aynı olmalı** (görsel 15 MB, video 50 MB). Dosya yüklemesinde boyut önce diskten (`filesize`) bakılır — 50 MB belleğe boşuna alınmaz. |
| **CSP** | `PageController` | img/media `*`, frame yalnızca YouTube/Vimeo. `script/style/connect/font` için `'self'` **eklenmez** — NC zaten gönderiyor. |
| **Rate limit** | `#[UserRateLimit]` | |

> **Attribute kullan, annotation kullanma.** `#[NoAdminRequired]`, `#[NoCSRFRequired]`,
> `#[UserRateLimit]`. Docblock (`@NoAdminRequired`) hâlâ çalışıyor ama deprecated.

---

## 🖥️ İstemci Mimarisi (`js/app.js`)

Tek IIFE → `boot()`. Kabaca bölümler (satır numaraları yaklaşık):

| Satır | Bölüm |
|-------|-------|
| 1–130 | `LS` (localStorage `kx_*`), `el()`, `api()`, `apiErr()`, `seed()`, kullanıcı tespiti |
| 132–176 | Kart ağacı yardımcıları: `childrenOf`, `dfsPages`, `pathOf`, `subtreeCounts` |
| 178–295 | `mapColl` / `applyState` / `applySyncState` / `loadState` |
| 296–385 | İyimser kilitleme, çakışma modalı, kayıt kuyruğu |
| 387–460 | Tema, okundu, `sanitize()`, video gömme |
| 461–675 | Editör medyası: görsel/video yükleme, küçültme, NC dosya seçici, drag-drop |
| 677–920 | Ağaç render, çöp kutusu |
| 924–1260 | Yönlendirme (`openPage`/`openCollection`/`goBack`), viewer, kapak ekranları |
| 1261–1425 | Zengin metin araç çubuğu (`execCmd`, satır-içi sınıflar, hizalama, renk) |
| 1427–1520 | Sağ panel (bulunduğun klasör), kart ekleme |
| 1562–1740 | Yeni koleksiyon modalı (ağaç kurucu) |
| 1744–1860 | Üye seçici, emoji/simge seçici |
| 1862–1948 | Tema, kalıcı görünüm durumu, başlatma, `syncTick` |

### Bilinmesi gerekenler

- **`el(id)` = `ROOT.querySelector('#'+id)`** — `document.getElementById` **değil**.
  NC'nin kendi `#content`, `#app-navigation` gibi id'leriyle çakışmaması için.
- **Tüm CSS `#kesif-app` altında.** DOM'a bir şey eklerken ROOT'un içine ekle.
- **Yerel yazma yok.** `const save = () => {}` — kalıcılık tamamen sunucuda.
  localStorage yalnızca **görünüm durumu** taşır (açık koleksiyon, açık sayfa, tema,
  `previewAsVisitor`, `lastSyncAt`, `seeded`).
- **Kullanıcı değişimi koruması:** aynı tarayıcıda başka NC hesabıyla girilirse
  (`lastUser` farklıysa) açık koleksiyon/sayfa durumu sıfırlanır.
- **Ağaç yalnızca açık dalları çizer** (1.3.0 performans). 780 kartlık koleksiyonda
  tüm satırları basıp her tıklamada yeniden kurmak ~3 kat yavaştı.
- **`subtreeCounts(coll)` tek geçişte** tüm kartların alt sayısını verir. Kart başına
  `dfsPages` çağırmak kareli maliyet çıkarıyordu.
- **`readablePages()` bölümleri (`kind==='folder'`) dışlar.** Bölümün okunacak metni yok
  ve okundu işaretlenemiyor; sayaçta durursa ilerleme asla %100 olamaz (1.4.3 hatası).
- **`t()`/`n()` fallback'i var** — `dev.html`'de NC global'leri yok, çağrı boot'u öldürürdü.
- **Tarih/saat `LOCALE`** = `OC.getLanguage()`, sabit locale değil.

---

## 🌍 Yerelleştirme

Kaynak dil **İngilizce** (kodda birebir metin). Türkçe `l10n/tr.js` + `l10n/tr.json`.

**Yeni kullanıcıya görünen metin eklerken:**
1. Kodda `t('nextlibrary', 'English text')` (JS) veya `$l->t('English text')` (PHP).
2. Aynı İngilizce anahtarı **hem** `l10n/tr.js` **hem** `l10n/tr.json` içine ekle.
3. Çoğul için `n('nextlibrary', 'one %n', '%n items', count)`.

`info.xml`'de `<navigation><name>` için `lang` özniteliği **kullanılamaz** (XSD reddediyor)
— navigasyon adı l10n üzerinden çevrilir.

---

## 🛠️ Geliştirme

### Test
```bash
php tests/run.php
```
Composer/PHPUnit **yok** — yalnızca `ext-dom`.

> ℹ️ **PHP bu makinede PATH'te değil ama KURULU** (4 Ağu 2026'da doğrulandı):
> `C:\Users\memoc\OneDrive\Desktop\Projeler\php\php.exe` — `ext-dom` içeriyor, 60 testi
> koşturuyor. Yani `php tests/run.php` yerine tam yolla çağır:
> `& "C:\Users\memoc\OneDrive\Desktop\Projeler\php\php.exe" tests/run.php`
>
> Docker'a **gerek yok**; yedek yol olarak dursun (Docker Desktop kapalıysa ~1-2 dk açılır):
> `docker run --rm -v "%CD%:/app" -w /app php:8.3-cli php tests/run.php`
> Git Bash'ten yol dönüşümünü kapat (`MSYS_NO_PATHCONV=1`) ve mutlak Windows yolu ver.

Üç şey ölçülür: (1) `HtmlSanitizer` davranışı, (2) **PHP ↔ JS beyaz liste paritesi** —
`SAFE/DROP/ALLOW/IFRAME_ATTR` listeleri `js/app.js` karşılıklarıyla karşılaştırılır,
(3) `PermissionService`'in **saf** karar fonksiyonları (`isListedEditor`, `normalizeIds`).
Parite testi, CLAUDE.md'de yazılı "parite şart" kuralını yoruma bırakmayıp makineye bağlar.
**Sanitizer'ın iki tarafından birini değiştirirsen bu test kırmızıya döner — istenen budur.**

> `PermissionService` NC olmadan yüklenebiliyor çünkü OCP tip imzaları ancak **nesne
> üretilirken** çözülür. `canWrite()` bu saf fonksiyona DELEGE eder — mantığın ikinci bir
> kopyasını yazarsan test edilen kod ile çalışan kod sessizce ayrışır.

### dev.html (NC olmadan)
`t()`/`n()` ve REST API'yi taklit eder, arayüzü tarayıcıda açar.
`.claude/launch.json` hazır: `python -m http.server 8777` → `http://localhost:8777/dev.html`.
Release'e **girmez**.

### Docker (gerçek Nextcloud ile)
```bash
cd docker && cp .env.example .env    # şifreleri değiştir
docker compose up -d --build         # → http://localhost:8080
```
`nextcloud:30-apache` üstüne app gömülür; `before-starting` hook'u sürümü karşılaştırıp
gerekirse `occ upgrade` çalıştırır. Detay: `docker/KURULUM.md`.

### Elle kurulum
Klasörü NC'nin `apps/` dizinine **`nextlibrary`** adıyla kopyala →
```bash
sudo -u www-data php occ app:enable nextlibrary
```

---

## 📦 Release Akışı

```powershell
..\release.ps1 -Version 1.6.0     # info.xml'i günceller, paketler, imzalar, DOĞRULAR
```

Script sırayla: `info.xml` sürümünü yazar → `tar.gz` üretir (`.claude`, `dev.html`,
`screenshots`, `docker`, `.git` hariç) → `~/.nextcloud/certificates/nextlibrary.key` ile
SHA-512 imzalar → sertifikayla doğrular → base64 imzayı ekrana basar
(App Store formuna yapıştırılır).

**Store beklentisi:** arşivde tek üst klasör ve adı app id ile aynı (`nextlibrary/`).

**Sürüm çıkarken kontrol listesi:**
1. `CHANGELOG.md`'ye bölüm ekle (Keep a Changelog + SemVer).
2. Şema değiştiyse yeni migration — **var olanı düzenleme**, kurulu sunucularda tekrar çalışmaz.
3. `info.xml` `<dependencies>` hâlâ doğru mu (NC/PHP aralığı).
4. `release.ps1` → "Verified OK" görmeden yayınlama.
5. Git'e commit + tag.

---

## ⚠️ Bilinen Sorunlar / Tutarsızlıklar

3 Ağu 2026'da bir tur temizlik yapıldı; aşağıdakiler **kalanlar**.

1. **`state()` ucu N+1 sorgu üretiyor.** `collectionToArray()` koleksiyon başına ayrı
   `findByCollection` + `findByCollection(members)` + üye sayısı kadar `IUserManager::get`
   çağırıyor. Çöp kutusundaki aynı sorun düzeltildi (`findDeletedByCollections`), ama
   `state()` sıcak yol ve düzeltmesi daha büyük: sayfa/üye toplu çekilip PHP tarafında
   gruplanmalı, principal adları da tek turda çözülmeli.
2. **Test kapsamı dar.** `tests/run.php` yalnızca NC'ye bağımlı olmayanı test eder
   (sanitizer + parite + `PermissionService`'in saf kısmı). Controller/Mapper testleri
   gerçek NC geliştirme kurulumu ister; yazılmadı. **JS tarafı hiç test edilmiyor** —
   `sanitize()` DOM'a bağlı olduğu için bağımlılıksız koşturulamıyor. Editör tarafında
   test edilmeyen kısım: `canWrite()`'ın `isAdmin` dalı ve uçların admin kilidi
   (`#[NoAdminRequired]` yokluğu) — ikisi de NC gerektiriyor, **elle doğrulanmalı**.
3. **`media_0` erişim denetimi zayıf.** Koleksiyon oluşturulmadan yüklenen simgeler
   **giriş yapmış herkese** servis edilir (`media()` içinde `cid=0` dalı). Ad tahmin
   edilemez (32 hex) ve içerik yalnızca simge — kabul edilmiş bir ödünleşme, ama gerçek
   bir yetki kontrolü değil.
4. **Sunucudaki cron modu `ajax`.** Sistem crontab'ında `cron.php` yok, systemd timer yok →
   arka plan işleri ancak biri sayfa açınca tetiklenir. Medya toplayıcısı için sorun değil
   (günlük iş, aceleye gerek yok) ama **kimse girmezse hiç çalışmaz.** Gerçek cron'a
   geçmek tüm Nextcloud'u ilgilendiren bir sistem kararı — kendi başına değiştirme.
5. **`<background-jobs>` ve `<settings>` yalnızca sürüm ARTINCA kaydolur.** `occ upgrade`
   kayıt eden yolu ancak `info.xml` sürümü `installed_version`'dan büyükse koşar. Yeni bir
   arka plan işi ya da ayar sayfası eklerken sürümü bumplamayı unutursan sunucuda hiç
   oluşmaz ve deploy sessizce yarım kalır. (3 Ağu'da 1.5.0 → 1.6.0, 4 Ağu'da ayar sayfası
   için 1.6.0 → 1.7.0 tam olarak bu yüzden yapıldı.)
6. **Editör listesi `IConfig` app-value'da.** `IConfig::getAppValue/setAppValue` NC 29'da
   **deprecated** — ama `IAppConfig` NC 29+ ve uygulama NC 28'i de destekliyor, yani şu an
   28-34 aralığında çalışan tek yol bu. NC 28 desteği düşerse `IAppConfig`'e geç
   (`PermissionService` dışında hiçbir yeri ilgilendirmiyor).
7. **Yazma uçları `canRead()` kontrol etmiyor.** id'sini bilen bir yazar (admin veya editör)
   `state()`'te göremediği özel bir koleksiyona yazabilir. Adminler için baştan beri böyle;
   detay ve kapatma maliyeti için "Yetki Modeli" bölümündeki uyarıya bak.
8. **⛔ ASLA "yalnızca değişen dosyaları" kopyalayarak deploy etme — HER ZAMAN tam
   release tar'ını aç.** 11 Ağu 2026'da uygulama komple 500 veriyordu. Sebep: sunucuda
   kurulu olan **1.0.6**'ydı ve üzerine yalnızca 1.7.0/1.7.1'de *değişen* dosyalar
   kopyalanmıştı. Migration'lar (1.1.0–1.3.0) yeni olduğu için DB'ye `parent_id` kolonu
   eklenmişti, ama `lib/Db/Page.php` 1.0.6'da kalmıştı → `Entity::fromRow()` `setParentId()`
   arayıp `BadFunctionCallException: parentId is not a valid attribute` fırlatıyordu.
   Sayfa okuyan HER uç (`/api/state` dahil) patlıyordu. `installed_version` 1.7.1 yazdığı
   için `occ upgrade` de "zaten güncel" deyip geçiyordu — **sürüm numarası dosyaların
   gerçekten yerinde olduğunu KANITLAMAZ.**
   Teşhis yöntemi (tekrar lazım olursa): sunucudaki dosyaların md5'ini `nextcloud-app/`
   altındaki release tar'larıyla karşılaştır; hangi dosyanın hangi sürümden kaldığı
   böyle çıkıyor.
9. **⚠️ Sunucuyu silmeden önce sunucudaki kodu İNDİR.** Aynı olayda "Kart Şablonları"
   özelliği yalnızca sunucuda yaşıyordu (`js/app.js`, `css/style.css`, `templates/main.php`
   — repoda ve hiçbir release'te yoktu). Temiz kurulum onu silecekti. Geliştirme zaman
   zaman doğrudan sunucuda yapılıyor → `apps/nextlibrary`'yi wipe etmeden önce `scp -r` ile
   indir ve en yakın release ile diff'le. **Bu iki kez üst üste yaşandı** (1.7.2 ve 1.8.0):
   sunucuda yapılan iş hep ESKİ app.js üzerine yazılıyor, olduğu gibi alınırsa iç içe
   kartlar / bölümler / `openPages` geri gider. Doğru yol: sunucudaki sürümü en yakın
   release ile diff'leyip YALNIZCA yeni işi güncel tabana taşımak.
10. **Şablon HTML'i sanitizer'dan geçmek ZORUNDA.** Şablon gövdeleri sayfa içeriği olarak
   kaydediliyor, yani `HtmlSanitizer`'dan geçiyor: `style=` ALLOW listesinde YOK (satır içi
   renk/hizalama siliniyor) ve `BUTTON` DROP listesinde (içeriğiyle birlikte yok oluyor).
   Sonuç sinsi: kart yazılırken doğru görünüyor, KAYDEDİLİNCE bozuluyor. Görsellik hep
   sınıfla verilmeli, tıklanabilir şey `<span>` + delege dinleyici olmalı. Yeni şablon
   eklerken etiket/sınıf kaybını ölç (şablonları JSON'a çıkarıp `HtmlSanitizer::clean()`
   öncesi/sonrası etiket ve sınıf sayımlarını karşılaştıran kısa bir betik yeter).

---

## 🗺️ Sürüm Geçmişi (özet)

| Sürüm | Tarih | Öne çıkan |
|-------|-------|-----------|
| 1.0.0 | 16 Tem 2026 | İlk store sürümü. Koleksiyon/sayfa, okuma takibi, roller, çöp kutusu, iyimser kilitleme, EN/TR. |
| 1.0.2 | 17 Tem | Beyaz nav simgesi, 20 sn arka plan delta senkronu. |
| 1.0.5–1.0.6 | 20 Tem | NC 34 + PHP 8.4 desteği. |
| 1.0.7 | 30 Tem | 403/401/429 gerçek hata mesajları; yazma düğmeleri yetkisize gizlendi; attribute'lara geçiş. |
| 1.0.8 | 31 Tem | Eksik `#viewer` yeniden kurulur; kayıt hatası ↔ çizim hatası ayrıldı. |
| 1.1.0 | 31 Tem | **İç içe kartlar** (`parent_id`), sınırsız derinlik. |
| 1.2.0 | 31 Tem | **Sayfa / Bölüm** ayrımı (`kind`). |
| 1.3.0 | 31 Tem | **Yüklenen simge** (`icon`); sağ panel = bulunduğun klasör; ağaç ~3× hızlandı. |
| 1.4.0–1.4.3 | 31 Tem | Çöpte toplu silme; kırmızı silme butonları; ＋ menüsü; okuma navigasyonu klasörde kalır; bölümler sayaçtan çıktı. |
| 1.5.0 | 31 Tem | **NC dosya bağlama** (`/f/<fileid>` — kalıcı, yetkiye saygılı). |
| 1.6.0 | 3 Ağu | **Yetim medya toplayıcısı**; rol düğmesi kaldırıldı; çöp kutusu tek sorgu; kimlik fallback'i; `tests/run.php`. Sunucuda canlı (44 test yeşil, iş 3 yetim sildi, referanslıyı korudu). |
| 1.7.0 | 4 Ağu | **Editör yetkisi**: yönetici, Yönetim → Bilgi Kartları'ndan hesap/grup atar; editör uygulama içinde admin kadar yetkili. Listeyi yalnızca gerçek NC admin değiştirir. |
| 1.7.1 | 4 Ağu | Ayarlar kenar çubuğundaki simge beyaz olduğu için görünmüyordu → `img/app-dark.svg`. |
| 1.7.2 | 11 Ağu | **Kart Şablonları** (sağ rayda sekme, 5 hazır iskelet). Sunucuda yaşayan sürüm repoya taşındı + yetki/CSS/l10n düzeltmeleri. Aynı gün sunucudaki karışık kurulum (1.0.6 + 1.7.x) temizlendi. |
| 1.8.0 | 11 Ağu | **8 şablon + kategori filtresi + canlı önizleme** (mini çekmece & tam ekran modal), çalışan Kopyala. Yine sunucuda geliştirilmişti, yine eski taban üzerineydi → doğru tabana taşındı. Şablon HTML'i `style=`/`<button>` kullanmıyor (sanitizer siliyordu). |

---

## 💡 Claude ile Çalışma Notları

**Her oturum başında:** bu dosyayı oku, `git status` çek (repo 1.0.4'te takılı — durumu
karıştırma), `CHANGELOG.md`'nin en üstüne bak.

**Kod değiştirirken:**
- Mevcut dosyayı önce oku; değişikliği minimal tut.
- Kod yorumları **neden** yazılmış olduğunu anlatır (Türkçe). Bir davranışı değiştirmeden
  önce üstündeki yorumu oku — çoğu bir hatanın izidir.
- `sanitize()` değiştirdiysen `HtmlSanitizer.php`'yi de değiştir (ve tersi) → `php tests/run.php`.
- PHP dokunduysan `php tests/run.php`, JS dokunduysan en az `node --check js/app.js`
  (ayar sayfasına dokunduysan `js/admin.js` de).
- **Yetki kuralına dokunuyorsan** yalnızca `PermissionService`'i değiştir; controller'a
  `isAdmin()` geri getirme — kural tek yerde kalmalı.
- Şema değiştiysen **yeni** migration ekle, index adını 30 karakterin altında tut.
- Kullanıcıya görünen metin eklediysen `l10n/tr.js` + `tr.json`.
- Bitince: `CHANGELOG.md` + bu dosya güncellenir.

**Elle test senaryoları:**
```
Yeni koleksiyon → sayfa ekle → yaz → yenile        (kalıcılık)
İki tarayıcı, aynı sayfayı düzenle                  (409 çakışma modalı)
Bir tarayıcıda sayfa ekle, diğerinde 20 sn bekle    (delta senkronu)
Sayfa sil → çöp kutusu → geri yükle                 (alt ağaç birlikte)
Admin olmayan hesapla gir                           (düğmeler gizli, 403 yok)
Özel koleksiyon + üye olmayan hesap                 (görünmemeli)
Görsel yükle → sağ tık kaydet                       (appdata'dan servis)
Bölüm oluştur → ilerleme %100 olabiliyor mu         (1.4.3 regresyonu)

── 1.7.0 editör yetkisi ──
Yönetim → Bilgi Kartları açılıyor mu                (ayar kaydı sürüm artışına bağlı)
Hesabı editör yap → o hesapla gir                   (yazma düğmeleri GÖRÜNMELİ)
Editör hesabıyla Yönetim → Bilgi Kartları           (sayfa açılmamalı / 403)
Editörü listeden çıkar → tekrar gir                 (düğmeler tekrar gizlenmeli)
Grubu editör yap, üyesiyle gir                      (grup üzerinden de yetki)
Editör hesabıyla koleksiyon SİL                     ("admin gibi tam yetki" kararı)
Silinmiş bir hesabı listeye yazmayı dene            (kaydedince elenmeli)

── 1.8.0 şablon kategorileri & önizleme ──
Filtre çipleri şablon listesini süzüyor mu          (9 çip / 8 şablon)
Şablon başlığına tıkla                              (mini önizleme açılır, ikincisi öncekini kapatır)
"Canlı Önizleme" → modal                            (içerik dolu; "Bu Şablonu Kullan" kart oluşturur)
Önizlemedeki görsel yer tutucusuna tıkla            (HİÇBİR ŞEY olmamalı — dosya seçici açılmamalı)
Tasarım şablonu oluştur → KAYDET → yenile           (palet renkleri kalmalı; griye dönerse sanitizer yedi)
Kod bloğunda "Kopyala"                              (panoya kopyalar, "Kopyalandı" bildirimi)

── 1.7.2 kart şablonları ──
Sağ rayda iki sekme görünüyor mu                    (Kart Şablonları / İlgili Kartlar)
Koleksiyon AÇMADAN şablona tıkla                    ("Önce bir koleksiyon aç", kart oluşmaz)
Koleksiyon açıp şablona tıkla                       (kart düzenleme modunda açılır, içerik dolu)
Bir BÖLÜM içindeyken şablona tıkla                  (kart o bölümün altına düşmeli, köke değil)
Renkli kutular (Problem / Çözüm) renkli mi          (kx-callout CSS'i — düz metinse CSS düşmüş)
Yer tutucuya DÜZENLEME modunda tıkla                (dosya seçici açılır, görsel yer tutucunun YERİNE geçer)
Yer tutucuya OKUMA modunda tıkla                    (hiçbir şey olmamalı, imleç de değişmemeli)
Yazma yetkisi OLMAYAN hesapla gir                   (şablon sekmesi hiç görünmemeli)
Rol düğmesiyle Ziyaretçi'ye geç                     (şablon sekmesi kaybolur, Editör'e dönünce gelir)
```

---

*4 Ağustos 2026 — v1.7.0: editör yetkisi. Kullanıcı kararı: yetki **uygulama geneli**
(koleksiyon bazlı değil) ve editör **admin kadar yetkili**. `PermissionService` yazıldı,
controller'daki tüm `isAdmin()` çağrıları oradan geçirildi, Yönetim → Bilgi Kartları ayar
sayfası eklendi (`Settings/` + `admin.php/js/css`), 16 yeni test (toplam 60 yeşil).*

*6 Ağustos 2026 — **1.7.1 canlı sunucuda**: `occ config:app:get nextlibrary
installed_version` → `1.7.1`, `app:list` → enabled. Yerelde **2 commit push edilmemiş**
(`main`, `origin/main`'in 2 ilerisinde); App Store'a yükleme durumu ayrı — paketler
`nextcloud-app/nextlibrary-release-1.7.0/1.7.1.tar.gz` + `.sig` olarak hazır.*

*11 Ağustos 2026 — v1.7.2: **Kart Şablonları** + sunucu kurtarma. Uygulama 500 veriyordu;
sebep sunucudaki karışık kurulumdu (1.0.6 gövde + 1.7.x migration'ları → `Page` entity'si
`parent_id` kolonunu tanımıyordu, bkz. Tuzaklar #8). Sunucuda yaşayan Kart Şablonları
özelliği (repoda yoktu) indirilip 1.7.1 koduna taşındı; taşırken düzeltilenler: iç içe kart
uyumu (`kind`/`parentId` gönderiliyor), yetkisiz kullanıcıya sekme+yer tutucu gizleme,
eksik `.kx-callout` CSS'i, koleksiyon seçili değilken `colls[0]`'a yazma, İngilizce kaynak
metin + `l10n`. Ayrıca sekme durumu (`railTab`) ayrı tutuldu — yetki state ile geldiği için
panel yanlış sekmede kalıyordu. Sunucuya **tam temiz** kurulum yapıldı (önce mevcut app
klasörünün tar yedeği alındı), 1.7.2 enabled, 60 test yeşil,
`/api/state` 401, log temiz. **Yerel commit'lenmedi** — 9 dosya değişik durumda.*

*11 Ağustos 2026 (aynı gün, ikinci tur) — v1.8.0: Kullanıcı şablon UI'ını **yine sunucuda**
geliştirdi (kategori filtresi, mini + tam ekran önizleme, 8 şablon) ve yine ESKİ app.js
üzerine yazmıştı (1885 satır; benim 1.7.2'm 2165). Olduğu gibi alınsa `parentId`(30 yer),
`kind`, `openPages`, `scopeViewToUser` ve çöp kutusunun yarısı geri giderdi. Sunucudaki
sürüm 1.0.6-tabanlı öncekiyle diff'lenip **yalnızca yeni iş** (+366/−83) 1.7.2 tabanına
taşındı. Taşırken bulunan ve düzeltilen ölümcül kusur: şablon HTML'i 9 yerde `style=` ve
bir `<button>` kullanıyordu — ikisi de sanitizer'da siliniyor, yani kart KAYDEDİLİNCE
palet griye dönüp kopyala düğmesi yok oluyordu (bkz. Tuzaklar #10). Sınıflara taşındı,
8 şablonun 8'i de sanitizer'dan kayıpsız geçtiği ölçülerek doğrulandı. Ayrıca önizleme
içindeki yer tutucular yükleme tetikliyordu → dinleyici `#kx-body` ile kapsandı; Kopyala
gerçekten çalışır hale getirildi (delege + pano API'si, güvensiz bağlamda seçim yedeği).
60 test yeşil.*

*Son güncelleme: 3 Ağustos 2026 — v1.5.0 kodu üzerinden oluşturuldu; aynı gün bir tur
sorun giderme yapıldı (medya çöp toplayıcısı, rol düğmesinin kaldırılması, çöp kutusu
sorgusu, kimlik fallback'i, `tests/run.php`, deponun 1.0.4'ten güncellenmesi).*
