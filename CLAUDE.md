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
| **Sürüm** | 1.11.0 (2 Eyl 2026) |
| **Canlı durum** | Sunucuya (172.16.10.185) **1.9.2 deploy edildi** (14 Ağu 2026, kullanıcı; #1 N+1 + #14 i18n). GitHub'da `v1.9.2` release'i + imzalı paket yayında, kod 1 Eyl 2026'da commit'lendi ve tag doğru commit'e taşındı. 🔴 **App Store'da hâlâ 1.0.3** — tek kalan adım (bkz. Bilinen Sorunlar #12). |
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
       └─ js/app.js         → TÜM istemci mantığı (~2640 satır, tek IIFE)
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
│   └── routes.php            # 23 rota (22 × api# + 1 × page#).
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
│   ├── Search/CardSearchProvider.php # NC birleşik araması. Okunabilir koleksiyonlarla sınırlı.
│   ├── Service/PermissionService.php # ⭐ Yazma yetkisinin TEK karar noktası.
│   ├── Service/HtmlSanitizer.php    # ⚠️ js/app.js sanitize() ile PARİTE ŞART.
│   ├── BackgroundJob/
│   │   └── CleanupMediaJob.php      # Günlük yetim medya toplayıcısı (info.xml'de kayıtlı).
│   └── Migration/                   # 4 adım — aşağıdaki şema geçmişine bak.
├── js/app.js                 # ⭐ İstemcinin tamamı. Tek IIFE, boot() içinde.
├── js/admin.js               # Ayar sayfası (editör seçici). app.js'ten BAĞIMSIZ.
├── css/style.css             # Tamamı #kesif-app altında kapsanmış (51 KB).
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
| GET | `/collections/{id}/report` | **yazar** | Okuma raporu. Kimin ne okuduğu kişisel veri → okuyucuya kapalı. |
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

## 🔗 Derin Bağlantı + NC Birleşik Arama (1.11.0)

**Önce bilinmesi gereken:** 1.11.0'a kadar uygulamada derin bağlantı YOKTU. Açık kart
yalnızca `localStorage`'da tutuluyordu; bir karta bağlantı verip paylaşmak mümkün değildi
ve bu yüzden **arama sonucu döndürülemiyordu** (tıklanacak adres yok). Arama sağlayıcısının
ön koşulu buydu.

**Biçim:** `#card=<pageId>` / `#coll=<collId>` (js/app.js: `syncHash`, `readHash`,
`applyHashTarget`).

| Karar | Neden |
|-------|-------|
| Query değil **hash** | Sunucuya istek atmaz, yeni rota gerektirmez, NC'nin kendi yönlendirmesine dokunmaz. |
| `pushState` değil **`replaceState`** | Ağaçta gezerken kart açmak çok sık; pushState olsaydı tarayıcının geri düğmesi onlarca ara adımda takılırdı. |
| Hash, localStorage'ı **EZER** | Biri sana bağlantı yolladıysa açılması gereken senin son baktığın kart değil, bağlantıdaki karttır. |
| Hedef bulunamazsa **sessizce** normal açılış | "Bulunamadı" demek, yetkisi olmayana kartın VAR olduğunu söylemek olurdu. |

`hashchange` de dinleniyor: uygulama açıkken gelen bir bağlantı sayfayı yeniden yüklemez.
Kendi yazdığımız hash de bu olayı tetiklediği için hedef zaten açıksa hiçbir şey yapılmaz —
yoksa her gezinme kendini bir kez daha çizerdi.

### `lib/Search/CardSearchProvider.php`

`Application::register()` içinde `registerSearchProvider` ile kaydedilir — **`info.xml`'e
bir şey eklenmez**, yani sürüm artışına bağlı DEĞİL (arka plan işleri ve ayar sayfasının
aksine, bkz. Bilinen Sorunlar #5).

- **Yetki:** arama, `state()` ile aynı şekilde kurulan okunabilir koleksiyon kümesiyle
  sınırlı (public + sahip + üyelik). ⚠️ **Editörlük okuma yetkisi vermez** — editör de
  üyesi olmadığı özel koleksiyonun kartlarını aramada göremez. Uygulama içindeki kuralla
  aynı.
- `PageMapper::search()` yetki KONTROL ETMEZ; okunabilir id kümesini çağıran verir.
  Küme boşsa sorgu hiç açılmaz (yoksa `IN ()` üretilirdi).
- Terim `escapeLikeParameter` ile kaçırılır: kullanıcı `%` yazarsa tüm kartlar dönerdi.
- Bölümler (`kind='folder'`) elenir — okunacak gövdeleri yok.
- Simge **`app-dark.svg`** (siyah): arama açılır listesi açık zeminli. `app.svg` beyazdır
  ve orada kaybolur — 1.7.0'da ayarlar kenar çubuğunda yaşanan hatanın aynısı.

## 📊 Okuma Raporu (1.11.0)

`GET /api/collections/{id}/report` — **yazar yetkisi** (`canEdit`). Kimin ne okuduğu
kişisel veri; koleksiyonu okuyabilen herkese açılmaz.

Veri 1.0.0'dan beri `nextlibrary_reads` tablosunda duruyordu ama yalnızca kullanıcının
KENDİ ilerlemesi gösteriliyordu. Yeni olan tek şey onu raporlamak.

**İki ayrı liste, çünkü iki ayrı soru var:**
- `readers` — en az bir kart okumuş herkes. **Her zaman** cevaplanabilir.
- `pending` — okuması beklenip hiç okumamış olanlar. **Yalnızca hedef kitle bilinirse**
  (`audienceKnown`). Özel koleksiyonda kitle üye listesidir ve **gruplar açılır**
  (`expectedAudience`, `MAX_AUDIENCE=500`'de kesilir). Herkese açık koleksiyonda kitle
  "sunucudaki herkes"tir → `audienceKnown=false` ve istemci o bölümü hiç göstermez.
  Uydurma bir "okumayanlar" listesi üretmek yanıltıcı olurdu.

⚠️ Bölümler (`kind='folder'`) sayılmaz: okunacak gövdeleri yok ve okundu işaretlenemiyorlar
— sayaca girerlerse ilerleme asla %100 olamaz (1.4.3 hatası).

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

Dosya `/* -------- Başlık -------- */` yorumlarıyla bölünmüş — aşağıdaki tablo bayatlarsa
`grep -n "^/\* -\{6,\}" js/app.js` güncelini verir. (1.11.0 itibarıyla 2989 satır.)

| Satır | Bölüm |
|-------|-------|
| 1–26 | `ROOT`, `LS` (localStorage `kx_*`), `el()`, `t()`/`n()`, sabitler |
| 27–68 | Sunucu API (F2: kalıcı depolama) |
| 69–104 | Seed content for an empty instance |
| 105–139 | Kullanıcı kimliği (gerçek NC kullanıcısı, yoksa dev fallback) |
| 140–149 | Rol / yetki (yetki sunucuda hesaplanır, coll.canEdit) |
| 150–195 | Kart ağacı (iç içe kartlar) |
| 196–404 | Sunucu ↔ model dönüşümü + yükleme |
| 405–418 | Tema (NC temasıyla senkron, kullanıcı seçimi öncelikli) |
| 419–433 | Okundu takibi (kullanıcı-bazlı, sunucuda) |
| 434–467 | Güvenlik: HTML sanitizasyonu + URL doğrulama |
| 468–501 | Medya: video gömme + görsel yükleme/küçültme |
| 502–536 | Görsel yuvaları |
| 537–655 | Kırpma / konumlandırma ekranı |
| 656–816 | Nextcloud dosyasını bağlantı olarak ekle |
| 817–832 | Bağlam menüsü (⋯) |
| 833–1063 | Sol ağaç |
| 1064–1363 | Orta: okuma / editör |
| 1364–1380 | Ana ekran (Akademi) |
| 1381–1581 | Önceki / sonraki ders |
| 1582–2221 | Hazır Kart Şablonları (8 Farklı Tarz & Canlı Önizleme) |
| 2222–2257 | Sağ panel: BULUNDUĞUN KLASÖR |
| 2258–2275 | Sayfa altı "Buradan devam et" |
| 2276–2352 | Sayfa/koleksiyon işlemleri (bağlam menüsü) |
| **2353–2414** | **Okuma raporu** — 1.11.0 |
| 2415–2650 | Yeni koleksiyon + üye ekle |
| 2651–2711 | Emoji |
| 2712–2732 | Arama |
| 2733–2743 | Tema anahtarı (kaydırmalı: sol=açık, sağ=koyu) |
| 2744–2748 | Mobil menü |
| 2749–2759 | Rol önizleme |
| 2760–2765 | Yardımcı |
| **2766–2806** | **Derin bağlantı (#card= / #coll=)** — 1.11.0 |
| 2807–2846 | Başlat |
| 2847–2951 | Kırpma ekranı etkileşimleri (statik markup → bir kez bağlanır) |
| 2952–2990 | Delta senkronu: periyodik yoklama |

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

### Görsel yuvaları ve kırpma (1.9.0)

- Yer tutucunun **sınıfı yuvayı belirler** (`IMG_SLOTS`): `kx-img-avatar` → 400×400 **yuvarlak**,
  `kx-img-sm` → 800×500 (mockup ızgarası), diğer hepsi → 1400×788 (banner/serbest).
- Yer tutucu `<img>` ile değiştirilirken **yuvanın sınıfı görsele taşınır**
  (`img.className = pendingFigCls || slotOf(ph).cls`). Taşınmazsa yuvarlak profil fotoğrafı
  kocaman bir kareye döner — 1.9.0'ın düzelttiği hata tam olarak buydu.
- **Kırpma markup'ta değil PİKSELDE saklanır.** `style=` sanitizer'da silindiği için konum/ölçek
  bilgisi HTML'de tutulamaz. `cropOutput()` seçilen alanı yuva çözünürlüğünde canvas'a çizip
  JPEG (0.85) döndürür; yan fayda: yüklenen dosya yalnızca yuva kadar büyük olur.
- **"Tüm görsel" yalnızca yuvarlak OLMAYAN yuvalarda görünür** (`cropModes` gizlenir) — daire
  zaten kırpar. Seçilirse oran zorlanmaz; sınıf `pendingFigCls`'te bekletilir (yükleme async).
- `activePlaceholder` tıklama ile yükleme arasında tutulur (seçim kayboluyor). Kullanıcı bu arada
  sayfa değiştirip düğüm koptuysa normal imleç akışına (`insertAtSaved`) düşülür.
- `alt`, yer tutucunun kendi metninden gelir (`slotAlt`); boş `alt=""` ekran okuyucuya hiçbir şey
  söylemiyordu.
- `cropCanvas` yoksa (dev.html, eski şablon) sessizce eski akışa (`downscaleImage`) düşer.

### Kart şablonları (1.7.2 → 1.8.0)

- `CARD_TEMPLATES` (8 şablon) + `CARD_CATEGORIES` (9 filtre çipi). Sağ rayda iki sekme;
  seçili sekme **`railTab`'da, state'ten AYRI** tutulur — yetki sunucudan sonradan geldiği için
  panel yanlış sekmeye atlıyordu.
- **Şablon HTML'i sanitizer'dan geçmek ZORUNDA:** `style=` ALLOW listesinde yok, `<button>` DROP
  listesinde. Görsellik sınıfla verilir, tıklanabilir şey `<span>` + delege dinleyicidir
  (bkz. Bilinen Sorunlar #10).
- Önizleme (mini çekmece + tam ekran modal) gerçek bir sayfa **değil** → yer tutucu dinleyicisi
  `#kx-body` ile kapsanmalı, yoksa önizlemedeki yer tutucu dosya seçici açar.
- Yazma yetkisi olmayan hesapta sekme de yer tutucu da gizlenir.

---

## 🌍 Yerelleştirme

Kaynak dil **İngilizce** (kodda birebir metin). Türkçe `l10n/tr.js` + `l10n/tr.json`.

**Yeni kullanıcıya görünen metin eklerken:**
1. Kodda `t('nextlibrary', 'English text')` (JS) veya `$l->t('English text')` (PHP).
2. Aynı İngilizce anahtarı **hem** `l10n/tr.js` **hem** `l10n/tr.json` içine ekle.
3. Çoğul için `n('nextlibrary', 'one %n', '%n items', count)`.

> ⚠️ **Kart şablonları bu kuralın DIŞINDA kaldı** (1.8.0 sunucudan taşınırken): `CARD_TEMPLATES`
> içindeki `title`/`desc`/`badge`, `CARD_CATEGORIES` etiketleri ve 8 şablonun gövde HTML'i
> **sabit Türkçe** — `t()` çağrısı yok. İngilizce arayüzde şablon paneli Türkçe görünür.
> (bkz. Bilinen Sorunlar #14.)

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
> `C:\Users\memoc\OneDrive\Desktop\Projeler\php\php.exe` — `ext-dom` içeriyor, 69 testi
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
0. ⚠️ **ÖNCE commit'le, SONRA paketle.** `release.ps1` çalışma ağacından paketler; commit'lemeden
   çalıştırırsan yayınlanan paket git'te olmayan kod taşır ve tag bir önceki commit'e düşer
   (14 Ağu 2026'da tam olarak bu oldu — bkz. Bilinen Sorunlar #13b).
1. `CHANGELOG.md`'ye bölüm ekle (Keep a Changelog + SemVer).
2. Şema değiştiyse yeni migration — **var olanı düzenleme**, kurulu sunucularda tekrar çalışmaz.
3. `info.xml` `<dependencies>` hâlâ doğru mu (NC/PHP aralığı).
4. `release.ps1` → "Verified OK" görmeden yayınlama.
5. Git'e commit + **tag** (`v1.7.2` ve `v1.9.0` bu adım atlandığı için hiç oluşmadı).
6. GitHub release aç ve `tar.gz`'yi ekle — **mağaza dosya değil indirme LİNKİ ister**, link
   oraya bakar. ⚠️ Mağazada canlı olan sürümün GitHub release'i **SİLİNMEMELİ**, indirme
   linki kırılır.
7. Mağazaya yükle: link + `.sig` içeriği (base64). "Nightly" kutusu stabil sürümde **boş**.
   Mağaza durumunu API'ye curl atarak doğrulama — 429 riski, bkz. Bilinen Sorunlar #12.

---

## ⚠️ Bilinen Sorunlar / Tutarsızlıklar

3 Ağu 2026'da bir tur temizlik yapıldı; aşağıdakiler **kalanlar**.

1. **✅ ÇÖZÜLDÜ (14 Ağu 2026): `state()` ucu N+1 sorgu üretiyordu.** Yeni toplu yol:
   `PageMapper::findByCollections` + `MemberMapper::findByCollections` (ikisi de tek `IN`
   sorgusu) ve `ApiController::collectionsToArray()` — sayfa/üye PHP'de koleksiyona göre
   gruplanıyor, principal adları benzersizleştirilip her biri BİR kez çözülüyor (üye+sahip).
   `state()` ve `trash()` artık bunu kullanıyor; tek-koleksiyon uçları eski
   `collectionToArray`'de kaldı (orada N+1 yok). Sayfa sırası `collection_id, sort, id`
   ile korunuyor. ⚠️ Sunucuda ölç: çok koleksiyonlu hesapta `state()` süresi düşmeli.
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
11. **Şablon içeriğinde GERÇEK kişisel veri olmaz.** Şablonlar herkese açık uygulamayla
   dağıtılıyor; içine yazılan bir ad/e-posta/telefon her kurulumda herkese görünür.
   1.9.0'a kadar profil ve toplantı şablonlarında gerçek bir ad, e-posta, telefon ve şehir
   duruyordu (sunucuda geliştirilirken doldurulmuş, taşınırken fark edilmemişti). Yer
   tutucular nötr olmalı: "İsim Soyisim", `ad.soyad@example.com` (example.com ayrılmış
   alan adıdır), `+90 5XX XXX XX XX`, "Şehir, Ülke", "Katılımcı 1". Yeni şablon eklerken
   `grep -niE "safi|ceylan|@(gmail|hotmail|outlook)|\+90 5[0-9]{2} "` ile kontrol et.
   ⚠️ `appinfo/info.xml`'deki yazar/depo bilgisi bunun DIŞINDA — orası uygulamanın künyesi.
12. **App Store'daki sürüm ÇOK ESKİ.** Son doğrulanan yayın **1.0.3** (17 Tem 2026); 1.0.4'ten
   1.9.1'e kadar hiçbir şey mağazaya gitmedi. Sunucuya deploy bunu **düzeltmez** — mentör ve
   dışarıdaki kullanıcılar mağazadan kuruyor, yani onlarda iç içe kart, şablon, editör yetkisi
   ve medya toplayıcısı **yok**. ⚠️ Durumu `apps.nextcloud.com`'a istek atarak doğrulama:
   17 Tem'de arka arkaya curl yüzünden IP bazlı **429** yenildi ve kullanıcının tarayıcısı da
   kilitlendi. Otorite app sayfasıdır, API değil — kullanıcının ekranından bak.
   Ayrıca açık kalmış bir izin sorusu var: uygulama staj kapsamında yazıldı ama mağazaya
   **kişisel GitHub hesabından** çıkıyor (sertifika da o hesaba bağlı) — yetkiliye sorulacaktı,
   cevap gelmedi.
13. **Sürüm numarası ↔ kod eşleşmesi — iki ayrı olay, ikisi de aynı sebepten.**
   (a) `nextlibrary-release-1.8.1.tar.gz` ile `1.9.1.tar.gz` `CHANGELOG.md` ve `info.xml`
   dışında **birebir aynı** (13 Ağu'da açılıp diff'lendi); 1.8.1 ölü bir pakettir — repo,
   `v1.9.1` tag'i, GitHub release'i ve sunucu **1.9.1** diyor, CHANGELOG'da 1.8.1 bölümü yok.
   Mağazaya **asla** yüklenmemeli.
   (b) ✅ **ÇÖZÜLDÜ (1 Eyl 2026):** Uzaktaki `v1.9.2` tag'i `f832476`'yı gösteriyordu — o commit
   **1.9.1 kodu**, N+1 ve i18n düzeltmeleri onda yoktu. 14 Ağu'da paket üretilip GitHub'a
   yayınlanmış ama kod commit'lenmemiş, tag de bir önceki commit'e atılmıştı. Kod commit'lendi
   (`7f364f6`, `a9bcf67`, `5d0ff6e`) ve tag `5d0ff6e`'ye force-update edildi.
   > **Ders (her iki olayda da aynı):** paketi üretmek, kodu commit'lemek ve tag atmak
   > ayrı adımlar ve **sırası kayarsa tag yalan söyler.** `release.ps1` çalıştırmadan ÖNCE
   > commit'le. Şüphede kalırsan tag'e güvenme, paketi aç ve içine bak:
   > `tar -xzf nextlibrary-release-X.tar.gz && grep -c <yeni-fonksiyon-adı> .../js/app.js`
   > — bu yöntem 1 Eyl'de paketin aslında DOĞRU olduğunu, yanlış olanın tag olduğunu gösterdi.

   (c) **1.10.0 numarası yakıldı (2 Eyl 2026).** Üç özellik 1.10.0 olarak paketlenip
   imzalandı, `v1.10.0` tag'i atıldı — sonra kullanıcı App Store'da 1.10.0'ın **zaten
   dolu** olduğunu bildirdi. Aynı kod 1.11.0'a çekildi.
   > **Ders:** mağazadaki sürüm, repodaki/sunucudaki sürümden BAĞIMSIZ ilerleyebiliyor
   > ve buradan görülemiyor (#12: API'ye curl atma, 429 riski). **Paketlemeden ÖNCE
   > mağaza sayfasına bak** — sürüm numarası mağazada bir kez yandığında geri alınamaz.

   **Eksik sanılan tag'ler yanlış alarmdı:** `v1.7.2` ve `v1.9.0` gerçekten yok ama iş kayıp
   değil — geçmiş sıkıştırılmış: `fc0adde` (v1.8.0) hem 1.7.2 hem 1.8.0'ı, `f832476` (v1.9.1)
   hem 1.9.0 hem 1.9.1'i içeriyor. Geriye dönük tag atma; sonraki işi de içeren bir commit'i
   işaretlemiş olursun.
14. **✅ ÇÖZÜLDÜ (14 Ağu 2026): Kart şablonları i18n dışındaydı.** Panel metinleri
   (`CARD_CATEGORIES` etiketleri + `CARD_TEMPLATES`'in `title`/`desc`/`badge`) artık `t()`
   ile çevriliyor; 26 İngilizce anahtar `l10n/tr.js` + `tr.json`'a eklendi (kaynak dil
   İngilizce). **Gövde HTML'i** için farklı bir yol seçildi: `t()` string-eşlemesi zengin
   HTML'de kırılgan — kod şablonunun JSON gövdesi `{..}` içerir ve `t()`'nin `{yer tutucu}`
   ikamesine takılır, tek boşluk farkı çeviriyi sessizce düşürür. Bu yüzden gövdeler
   `tmplBody(en, tr)` ile **dile göre seçiliyor** (İngilizce kaynak kodda, Türkçe ikinci
   argümanda). ⚠️ Bilinçli takas: yeni bir dil eklenirse gövdeler İngilizceye düşer
   (panel yine tam çevrilir). **Sınıf adları iki dilde de birebir aynı** — sadece görünen
   metin değişti. `badge: 'Dev / API'` iki dilde aynı olduğu için literal bırakıldı.

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
| 1.9.0 | 11 Ağu | **Görsel konumlandırma ekranı** (sürükle/yakınlaştır, daire maskesi) + yuva biçiminin görsele taşınması (yuvarlak profil artık kare çıkmıyor) + yuvaya göre çerçeve. |
| ~~1.10.0~~ | — | ⚠️ **ATLANDI.** Paketlendi ve imzalandı ama GitHub release'i açılmadı; kullanıcı App Store'da 1.10.0'ın zaten dolu olduğunu bildirdi (2 Eyl). Aynı kod 1.11.0 olarak çıktı. Mağaza sürüm düşürmeye izin vermediği için numara yakıldı. |
| **1.11.0** | 2 Eyl | **NC birleşik araması** (`lib/Search/`) + **derin bağlantı** (`#card=`, ön koşuluydu) + **editörde tablo** (sanitizer izin veriyordu, araç çubuğu eksikti) + **okuma raporu** (veri 1.0.0'dan beri vardı, gösterilmiyordu). 69 test. |
| **1.9.1** | 11 Ağu | Şablonlardaki **gerçek kişisel bilgiler** (ad, e-posta, telefon, şehir) nötr yer tutuculara çevrildi — yayınlanan uygulamada herkese görünüyordu. **Sunucuda kurulu olan sürüm bu.** |
| **1.9.2** | 14 Ağu | **Bakım:** `state()`/`trash()` N+1'siz toplu sorguya geçti; kart şablonu paneli i18n'lendi (26 anahtar, gövdeler `tmplBody(en,tr)`). Paket 14 Ağu'da yayınlandı, **kod 1 Eyl'de commit'lendi** (bkz. Bilinen Sorunlar #13b). |
| ~~1.8.1~~ | 11 Ağu | ⚠️ Ayrı bir sürüm DEĞİL: 1.9.1 ile **aynı kodun ikinci paketi** (yalnızca `info.xml` + `CHANGELOG` farklı). CHANGELOG'da karşılığı, git'te tag'i yok. bkz. Bilinen Sorunlar #13. |

---

## 💡 Claude ile Çalışma Notları

**Her oturum başında:** bu dosyayı oku, `git status` çek, `CHANGELOG.md`'nin en üstüne bak.
Sunucudaki sürümü **notlardan varsayma, ölç**:
`ssh -i ~/.ssh/nextcloud_server.pem root@172.16.10.185 'sudo -u apache php /var/www/html/nextcloud/occ config:app:get nextlibrary installed_version'`

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

── 1.11.0 arama / bağlantı / tablo / rapor ──
NC üst arama kutusuna kart adı yaz               (sonuç çıkmalı, altında koleksiyon adı + özet)
Sonuca tıkla                                     (o kart açılmalı, uygulama açıksa yeniden yüklemeden)
Özel koleksiyona ÜYE OLMAYAN hesapla ara         (o kartlar SONUÇTA ÇIKMAMALI)
Editör ama üye değil, aynı aramayı yap           (yine çıkmamalı — editörlük okuma vermez)
Bir kart aç, adres çubuğuna bak                  (#card=<id> görünmeli)
O adresi kopyala, gizli sekmede aç               (aynı kart açılmalı)
Silinmiş bir kartın adresini aç                  (sessizce ana ekran; hata mesajı OLMAMALI)
Ağaçta 10 kart gez, tarayıcı geri düğmesi        (uygulamadan çıkmalı — ara adımlarda takılmamalı)
Editörde ▦ → 3×3                                 (başlık satırlı tablo, altına yazılabilir boş paragraf)
Tabloyu doldur → KAYDET → yenile                 (tablo kalmalı; kaybolduysa sanitizer yedi)
Koleksiyon ⋯ → Okuma raporu                      (okuyanlar + ilerleme çubuğu)
ÖZEL koleksiyonda rapor                          ("Henüz başlamayanlar" bölümü GÖRÜNMELİ)
HERKESE AÇIK koleksiyonda rapor                  ("Henüz başlamayanlar" GÖRÜNMEMELİ, açıklama çıkmalı)
Grupla paylaşılmış özel koleksiyonda rapor       (grup üyeleri de "başlamayanlar"da sayılmalı)
Yazma yetkisi OLMAYAN hesapla koleksiyon ⋯       (menü hiç açılmamalı → rapor da erişilemez)

── 1.9.0 görsel konumlandırma ──
Profil şablonu → yuvarlak yuvaya foto ekle          (YUVARLAK kalmalı, kare çıkarsa sınıf düşmüş)
Kırpma ekranında sürükle                            (görünen bölge değişmeli)
Yakınlaştır kaydırıcısı                             (merkez sabit kalmalı, köşeye kaçmamalı)
Tasarım şablonu (mockup) → "Tüm görsel"             (oran korunur, kırpılmaz)
Yuvarlak yuvada "Tüm görsel" düğmesi                (görünmemeli — daire zaten kırpar)
Kırp → KAYDET → sayfayı yenile                      (biçim kalmalı; kaybolursa sanitizer sınıfı yedi)
İptal et, sonra başka yer tutucuya tıkla            (görsel doğru yere gitmeli, öncekine değil)

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

*11 Ağustos 2026 (üçüncü tur) — v1.9.0 + v1.9.1: şablon yer tutucusuna konan fotoğraf
yuvanın biçimini kaybediyordu (yuvarlak profil kocaman bir kare çıkıyordu) → yuva biçimi
görsele taşındı ve **kırpma/konumlandırma ekranı** eklendi (sürükle, yakınlaştır, daire
maskesi, yuvarlak olmayan yuvalarda "Tüm görsel"). Kırpma **piksele** işleniyor, markup'a
değil — `style=` sanitizer'da siliniyor. 1.9.1 ise şablonlardaki gerçek ad/e-posta/telefon/
şehir bilgisini nötr yer tutuculara çevirdi (yayınlanan uygulamada herkese görünüyordu).*

*13 Ağustos 2026 — **durum tespiti + bu dosyanın güncellenmesi.** Kod değişmedi; ölçülenler:
sunucuda (172.16.10.185) `installed_version` = **1.9.1**, `app:list` → enabled; repo temiz ve
`origin/main` ile eşit; `tests/run.php` → **60 test yeşil**; `node --check` app.js/admin.js
temiz. Bu dosyada güncellenenler: künye 1.7.0 → 1.9.1, app.js satır haritası gerçek bölüm
yorumlarına göre yeniden yazıldı (~1950 → 2635 satır), **görsel yuvaları + kırpma** ve **kart
şablonları** bölümleri eklendi, sürüm tablosu kronolojik sıraya alındı, rota sayısı 18 → 22,
CSS 37 → 51 KB. Yeni bulgular Bilinen Sorunlar'a girdi: **#12** mağazadaki sürüm hâlâ 1.0.3
(dışarıdaki herkes 1.0.x kullanıyor) + cevapsız izin sorusu, **#13** `1.8.1` ve `1.9.1`
tarball'ları aynı kod (açılıp diff'lendi) → mağazaya yükleme öncesi biri seçilmeli, **#14**
kart şablonlarının metinleri `t()` dışında kaldı (İngilizce arayüzde Türkçe görünür).*

*14 Ağustos 2026 — **iki bakım işi.** (1) **`state()` N+1 düzeltildi** (Bilinen Sorun #1):
`PageMapper::findByCollections` + `MemberMapper::findByCollections` toplu sorguları ve
`ApiController::collectionsToArray()` yardımcısı eklendi; principal adları benzersizleştirilip
tek turda çözülüyor. `state()` ve `trash()` toplu yola geçti; tek-koleksiyon uçları eski
`collectionToArray`'de kaldı. (2) **Kart şablonları i18n'lendi** (Bilinen Sorun #14): panel
metinleri (kategori + title/desc/badge) `t()`'ye alındı, 26 anahtar `tr.js`/`tr.json`'a
yazıldı; gövde HTML'i `tmplBody(en, tr)` ile dile göre seçiliyor (t()'nin `{..}`/boşluk
kırılganlığı yüzünden), sınıf adları korundu. `node --check` app.js/tr.js + JSON.parse
tr.json temiz; PHP lokalde yok → `tests/run.php` sunucuda koşturulmalı. **Sürüm bump
YAPILMADI** — #13 (1.8.1/1.9.1 karışıklığı) çözülmeden mağaza sürümü artırmak riskli;
bir sonraki release'de bumplanacak.*

*1 Eylül 2026 — **yayın borcu kapatıldı, kod yazılmadı.** 14 Ağu'dan kalan 8 dosya (N+1 + i18n)
üç commit hâlinde git'e girdi ve push edildi; CHANGELOG'a 1.9.2 bölümü yazıldı. Ölçülenler:
`tests/run.php` **60 test yeşil**, `node --check` app.js/admin.js/tr.js temiz, yayınlanmış
`nextlibrary-release-1.9.2.tar.gz` GitHub'daki asset ile **sha256 birebir aynı** ve imza
**Verified OK** (sertifika 2036'ya geçerli). Ayrıca 8 kart şablonunun **16 gövdesi** (EN+TR)
gerçek `HtmlSanitizer::clean()`'den geçirilip etiket/sınıf sayımları karşılaştırıldı →
**16/16 kayıpsız**, EN ve TR sayımları eşit (Bilinen Sorunlar #10 tuzağına düşülmemiş).
Bulunan ve düzeltilen kusur: uzaktaki `v1.9.2` tag'i 1.9.1 kodunu gösteriyordu → doğru commit'e
taşındı (#13b). **Kalan tek iş: App Store'a yükleme** — paket ve imza hazır, link
`releases/download/v1.9.2/nextlibrary-release-1.9.2.tar.gz`.*

*1 Eylül 2026 (ikinci tur) — **v1.11.0: üç özellik.**
(1) **NC birleşik araması** (`lib/Search/CardSearchProvider.php` + `PageMapper::search`).
Yolda çıkan ön koşul: uygulamada **derin bağlantı hiç yoktu** — açık kart yalnızca
localStorage'daydı, yani arama sonucunun gösterebileceği bir adres bulunmuyordu. Önce
`#card=`/`#coll=` kuruldu (bkz. "Derin Bağlantı" bölümü); yan fayda olarak kart bağlantısı
artık paylaşılabilir.
(2) **Editörde tablo** — sanitizer TABLE/THEAD/TBODY/TR/TH/TD'ye baştan beri izin veriyordu
ve şablonlar tablo kullanıyordu; eksik olan tek şey araç çubuğu düğmesiydi. Yani tablo
görülebiliyor ama oluşturulamıyordu.
(3) **Okuma raporu** — veri `nextlibrary_reads`'te 1.0.0'dan beri duruyordu, yalnızca
kullanıcının kendi ilerlemesi gösteriliyordu.

Ölçülenler: **69 test yeşil** (60 → +9; yeni testler `tableHTML`'in ürettiği HER etiketi
`js/app.js`'ten okuyup SAFE listesiyle karşılaştırıyor — biri sanitizer'ın atacağı bir
etiket eklerse kırmızıya döner, #10 tuzağına karşı), `php -l` altı dosya temiz,
`node --check` temiz, `l10n` **296 anahtar iki dosyada da parite tam** (13 yeni).

⚠️ **Elle doğrulanması gerekenler** (NC olmadan koşturulamaz): arama sonucunun özel
koleksiyonu sızdırmaması, raporun 403'ü, hash gezinmesi. Senaryolar "Elle test" bölümünde.

⚠️ **Kapatılmayan, bilinen i18n kaçakları** (bu sürümün kapsamı dışında bırakıldı):
editör araç çubuğunda 9 sabit Türkçe `title` (`Geri al`, `Vurgu rengi`, `Madde listesi`,
`Hizalama`, `Bilgi notu`, `Paragraf stili`, `Yinele`, `Emoji`, `Video`), 5 sabit Türkçe
bildirim (`Kaydedildi`, `Bir ad gir`, `En az bir sayfa eklemelisiniz`, `Sayfa silindi`,
`Koleksiyon silindi`), `🔒 Salt okunur` rozeti, ağaçtaki `title="Eylemler"` ve
`ins('<blockquote>ℹ️ Bilgi notu…</blockquote>')`. #14 ile aynı sınıf hata, başka yerde.*

*Son güncelleme: 1 Eylül 2026 — v1.11.0 (arama + derin bağlantı + tablo + okuma raporu).
Sıradaki: App Store yüklemesi — mağazada hâlâ 1.0.3 (#12).*
