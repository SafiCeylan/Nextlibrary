# 📚 Knowledge Cards (Bilgi Kartları) — Docker Kurulumu

Bu paket, **Nextcloud + MariaDB + Knowledge Cards uygulamasını** tek komutla ayağa kaldırır.
Hiçbir şey elle kurmanız gerekmez.

## Gereksinimler

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose (Docker Desktop yeterli)
- 2 GB+ boş RAM, ~3 GB disk

## Kurulum (3 adım)

```bash
cd docker

# 1) Ayar dosyasını kopyala ve İÇİNDEKİ ŞİFRELERİ DEĞİŞTİR
cp .env.example .env

# 2) Başlat (ilk seferde imaj derlenir, birkaç dakika sürebilir)
docker compose up -d --build

# 3) Tarayıcıda aç
#    http://localhost:8080  →  .env'deki NC_ADMIN_USER / NC_ADMIN_PASSWORD ile gir
```

İlk açılışta Nextcloud kendini otomatik kurar, Knowledge Cards uygulaması **kurulu ve
etkin** gelir. Kurulum bitene kadar (1-2 dk) sayfa hazır olmayabilir; logu izlemek için:

```bash
docker compose logs -f nextcloud
```

## İlk kullanım

1. Sol menüden **Knowledge Cards**'ı aç.
2. **Yeni koleksiyon** oluştur, içine sayfalar ekle.
3. Koleksiyonu sunucuya açık (herkes okur) veya özel (sadece üyeler) yap;
   üyelere **editör** ya da **okuyucu** rolü ver.
4. Okuyucular sayfaları okudukça ilerleme çubukları kendiliğinden dolar.

## Veriler nerede?

| Ne | Docker volume |
|----|----|
| Nextcloud dosyaları + uygulama | `nc_data` |
| Veritabanı (koleksiyonlar, sayfalar, okuma kayıtları) | `db_data` |

**Yedekleme:** iki volume'u yedekleyin.

## Güncelleme

Yeni sürüm dosyalarını aldıktan sonra:

```bash
docker compose build && docker compose up -d
```

Konteyner açılırken gömülü app sürümünü diskteki ile karşılaştırıp gerekirse
kendini günceller (`occ upgrade` otomatik çalışır).

## Sık karşılaşılanlar

- **"Access through untrusted domain"** → `.env`'de `NC_TRUSTED_DOMAINS`'e alan adını ekleyip
  `docker compose up -d` ile yeniden başlatın.
- **Şifreleri sonradan değiştirmek** → DB şifresi ilk kurulumdan sonra `.env`'den değişmez
  (veritabanı içinde saklıdır); NC yönetici şifresi arayüzden değiştirilir.
- **Sıfırdan başlamak** → `docker compose down -v` (⚠️ TÜM verileri siler).

---
*Knowledge Cards — Nextcloud'unuzu okuma takipli küçük bir öğrenme kütüphanesine
dönüştürür. Geliştirici: Mehmet Safi Ceylan.*
