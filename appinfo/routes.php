<?php
declare(strict_types=1);

return [
    'routes' => [
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],

        // -------- F2 REST API --------
        // Tüm durumu (koleksiyon+sayfa+üye+okundu) tek çağrıda döndürür
        ['name' => 'api#state', 'url' => '/api/state', 'verb' => 'GET'],
        // localStorage → sunucu tek-seferlik içe aktarma (sunucu boşsa)
        ['name' => 'api#import', 'url' => '/api/import', 'verb' => 'POST'],
        // Üye seçici için gerçek NC kullanıcı/grup araması
        ['name' => 'api#searchPrincipals', 'url' => '/api/principals', 'verb' => 'GET'],
        // Medya: görsel yükleme + servis (appdata dosya deposu)
        ['name' => 'api#upload', 'url' => '/api/upload', 'verb' => 'POST'],
        ['name' => 'api#media', 'url' => '/api/media/{cid}/{name}', 'verb' => 'GET'],

        ['name' => 'api#createCollection', 'url' => '/api/collections', 'verb' => 'POST'],
        ['name' => 'api#updateCollection', 'url' => '/api/collections/{id}', 'verb' => 'PUT'],
        ['name' => 'api#deleteCollection', 'url' => '/api/collections/{id}', 'verb' => 'DELETE'],
        ['name' => 'api#setMembers', 'url' => '/api/collections/{id}/members', 'verb' => 'PUT'],

        ['name' => 'api#createPage', 'url' => '/api/collections/{id}/pages', 'verb' => 'POST'],
        ['name' => 'api#updatePage', 'url' => '/api/pages/{id}', 'verb' => 'PUT'],
        ['name' => 'api#deletePage', 'url' => '/api/pages/{id}', 'verb' => 'DELETE'],

        ['name' => 'api#markRead', 'url' => '/api/pages/{id}/read', 'verb' => 'POST'],
        ['name' => 'api#unmarkRead', 'url' => '/api/pages/{id}/read', 'verb' => 'DELETE'],

        // -------- Çöp Kutusu API --------
        ['name' => 'api#trash', 'url' => '/api/trash', 'verb' => 'GET'],
        ['name' => 'api#restoreCollection', 'url' => '/api/collections/{id}/restore', 'verb' => 'POST'],
        ['name' => 'api#restorePage', 'url' => '/api/pages/{id}/restore', 'verb' => 'POST'],
        ['name' => 'api#purgeCollection', 'url' => '/api/collections/{id}/purge', 'verb' => 'DELETE'],
        ['name' => 'api#purgePage', 'url' => '/api/pages/{id}/purge', 'verb' => 'DELETE'],
    ],
];
