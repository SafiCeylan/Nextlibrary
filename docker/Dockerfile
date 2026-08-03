# ─────────────────────────────────────────────────────────────────────────────
# Knowledge Cards (nextlibrary) — dağıtılabilir tam-yığın imaj
#
# Resmi Nextcloud imajının üstüne Knowledge Cards uygulamasını gömer.
# İlk açılışta hook'lar app'i custom_apps'e kopyalayıp etkinleştirir.
#
# Build bağlamı proje köküdür (docker-compose.yml: context: ..).
# ─────────────────────────────────────────────────────────────────────────────
FROM nextcloud:30-apache

# App kaynağı imaja gömülür; hook'lar bunu /var/www/html/custom_apps'e kopyalar.
COPY --chown=www-data:www-data appinfo   /usr/src/nextlibrary/appinfo
COPY --chown=www-data:www-data lib       /usr/src/nextlibrary/lib
COPY --chown=www-data:www-data js        /usr/src/nextlibrary/js
COPY --chown=www-data:www-data css       /usr/src/nextlibrary/css
COPY --chown=www-data:www-data l10n      /usr/src/nextlibrary/l10n
COPY --chown=www-data:www-data templates /usr/src/nextlibrary/templates
COPY --chown=www-data:www-data img       /usr/src/nextlibrary/img

# Resmi imajın hook mekanizması: kurulum sonrası + her başlangıçta çalışır.
COPY docker/hooks/post-installation/ /docker-entrypoint-hooks.d/post-installation/
COPY docker/hooks/before-starting/   /docker-entrypoint-hooks.d/before-starting/
RUN chmod +x /docker-entrypoint-hooks.d/post-installation/*.sh \
             /docker-entrypoint-hooks.d/before-starting/*.sh \
    # Windows'ta oluşturulmuş olabilecek CRLF satır sonlarını temizle
    && sed -i 's/\r$//' /docker-entrypoint-hooks.d/post-installation/*.sh \
                        /docker-entrypoint-hooks.d/before-starting/*.sh
