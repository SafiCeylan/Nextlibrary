#!/bin/sh
# Her konteyner başlangıcında çalışır (resmi imaj hook'u).
# İmaj yeni sürümle güncellendiyse diskteki (volume) app'i eşitler;
# app hiç yoksa (ör. eski volume) kopyalayıp etkinleştirmeyi dener.
set -u

SRC=/usr/src/nextlibrary
DST=/var/www/html/custom_apps/nextlibrary

[ -d "$SRC" ] || exit 0

if [ ! -d "$DST" ]; then
    echo "==> [nextlibrary] app volume'da yok — kopyalanıyor…"
    mkdir -p /var/www/html/custom_apps
    cp -a "$SRC" "$DST"
    php /var/www/html/occ app:enable nextlibrary || true
    exit 0
fi

sv=$(sed -n 's/.*<version>\(.*\)<\/version>.*/\1/p' "$SRC/appinfo/info.xml" | head -n1)
dv=$(sed -n 's/.*<version>\(.*\)<\/version>.*/\1/p' "$DST/appinfo/info.xml" | head -n1)
if [ -n "$sv" ] && [ "$sv" != "$dv" ]; then
    echo "==> [nextlibrary] app güncelleniyor: ${dv:-?} -> $sv"
    cp -a "$SRC/." "$DST/"
    php /var/www/html/occ upgrade || true
fi
