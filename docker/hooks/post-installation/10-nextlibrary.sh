#!/bin/sh
# Nextcloud ilk kurulumu bittikten hemen sonra çalışır (resmi imaj hook'u).
# Gömülü app'i custom_apps'e kopyalar ve etkinleştirir.
set -eu

echo "==> [nextlibrary] Knowledge Cards kuruluyor…"
mkdir -p /var/www/html/custom_apps
if [ ! -d /var/www/html/custom_apps/nextlibrary ]; then
    cp -a /usr/src/nextlibrary /var/www/html/custom_apps/nextlibrary
fi
php /var/www/html/occ app:enable nextlibrary
echo "==> [nextlibrary] hazır. Sol menüde 'Knowledge Cards' görünecek."
