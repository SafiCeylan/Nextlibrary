<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @extends QBMapper<Page>
 */
class PageMapper extends QBMapper {

    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'nextlibrary_pages', Page::class);
    }

    public function find(int $id): Page {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->eq('deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)));
        return $this->findEntity($qb);
    }

    public function findWithDeleted(int $id): Page {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
        return $this->findEntity($qb);
    }

    /** @return Page[] */
    public function findByCollection(int $collectionId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('collection_id', $qb->createNamedParameter($collectionId, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->eq('deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
            ->orderBy('sort', 'ASC')->addOrderBy('id', 'ASC');
        return $this->findEntities($qb);
    }

    /**
     * Birden çok koleksiyonun aktif sayfaları — TEK sorguda (N+1 yerine).
     * `state()` sıcak yolu için: her koleksiyona ayrı `findByCollection` açmak yerine.
     * Sıralama `collection_id, sort, id` → çağıran koleksiyona göre gruplayınca her
     * koleksiyonun sayfa sırası `findByCollection` ile birebir aynı kalır.
     * @param int[] $collectionIds
     * @return Page[]
     */
    public function findByCollections(array $collectionIds): array {
        if (empty($collectionIds)) {
            return [];
        }
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->in('collection_id', $qb->createNamedParameter($collectionIds, IQueryBuilder::PARAM_INT_ARRAY)))
            ->andWhere($qb->expr()->eq('deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
            ->orderBy('collection_id', 'ASC')->addOrderBy('sort', 'ASC')->addOrderBy('id', 'ASC');
        return $this->findEntities($qb);
    }

    /**
     * Nextcloud'un birleşik aramasından gelen sorgu: başlık VEYA gövdede geçen kartlar.
     * Çağıran, kullanıcının okuyabildiği koleksiyon id'lerini verir — bu metot yetki
     * KONTROL ETMEZ, yalnızca verilen kümede arar. Boş küme (okunabilir koleksiyon yok)
     * sorguyu hiç açmadan boş döner, aksi halde `IN ()` üretilirdi.
     *
     * Bölümler (`kind = folder`) dışarıda: okunacak gövdeleri yok, arama sonucunda
     * boş bir kart gibi görünürlerdi.
     *
     * Terim `escapeLikeParameter` ile kaçırılıyor: kullanıcı `%` veya `_` yazarsa bunlar
     * joker olarak yorumlanıp tüm kartları döndürürdü.
     *
     * @param int[] $collectionIds
     * @return Page[]
     */
    public function search(string $term, array $collectionIds, int $limit, int $offset): array {
        $term = trim($term);
        if ($term === '' || empty($collectionIds)) {
            return [];
        }
        $like = '%' . $this->db->escapeLikeParameter($term) . '%';
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->in('collection_id', $qb->createNamedParameter($collectionIds, IQueryBuilder::PARAM_INT_ARRAY)))
            ->andWhere($qb->expr()->eq('deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->neq('kind', $qb->createNamedParameter('folder')))
            ->andWhere($qb->expr()->orX(
                $qb->expr()->iLike('title', $qb->createNamedParameter($like)),
                $qb->expr()->iLike('html', $qb->createNamedParameter($like))
            ))
            // En son güncellenen önce: aramada güncel kart eskisinden daha çok aranır.
            ->orderBy('updated_at', 'DESC')->addOrderBy('id', 'DESC')
            ->setMaxResults($limit)->setFirstResult($offset);
        return $this->findEntities($qb);
    }

    /** @return Page[] */
    public function findDeletedPages(int $collectionId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('collection_id', $qb->createNamedParameter($collectionId, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->gt('deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
            ->orderBy('deleted_at', 'DESC');
        return $this->findEntities($qb);
    }

    /**
     * Birden çok koleksiyonun çöpteki sayfaları — TEK sorguda.
     * Çöp kutusu ekranı eskiden koleksiyon başına ayrı sorgu açıyordu (N+1);
     * çok koleksiyonlu sunucuda ekran açılışı buna takılıyordu.
     * @param int[] $collectionIds
     * @return Page[]
     */
    public function findDeletedByCollections(array $collectionIds): array {
        if (empty($collectionIds)) {
            return [];
        }
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->in('collection_id', $qb->createNamedParameter($collectionIds, IQueryBuilder::PARAM_INT_ARRAY)))
            ->andWhere($qb->expr()->gt('deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
            ->orderBy('deleted_at', 'DESC');
        return $this->findEntities($qb);
    }

    /**
     * Belirli bir tarihten sonra silinen sayfaları bulur.
     * @param int[] $collectionIds
     * @return Page[]
     */
    public function findDeletedSince(array $collectionIds, int $since): array {
        if (empty($collectionIds)) {
            return [];
        }
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->in('collection_id', $qb->createNamedParameter($collectionIds, IQueryBuilder::PARAM_INT_ARRAY)))
            ->andWhere($qb->expr()->gt('deleted_at', $qb->createNamedParameter($since, IQueryBuilder::PARAM_INT)));
        return $this->findEntities($qb);
    }

    /**
     * Bir koleksiyonun TÜM sayfaları (silinmişler dahil). Alt ağaç hesaplarında
     * gerekir: silinmiş bir dalın çocukları da bulunabilmeli.
     * @return Page[]
     */
    public function findAllByCollection(int $collectionId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('collection_id', $qb->createNamedParameter($collectionId, IQueryBuilder::PARAM_INT)))
            ->orderBy('sort', 'ASC')->addOrderBy('id', 'ASC');
        return $this->findEntities($qb);
    }

    /**
     * $rootId ve altındaki tüm torunlar (genişlik-öncelikli). Döngüye karşı korumalı:
     * bir id ikinci kez işlenmez.
     * @param Page[] $all Koleksiyonun tüm sayfaları (findAllByCollection çıktısı)
     * @return Page[] Kök dahil
     */
    public static function subtree(array $all, int $rootId): array {
        $byParent = [];
        foreach ($all as $p) {
            $byParent[(int)$p->getParentId()][] = $p;
        }
        $out = [];
        $seen = [];
        $queue = [$rootId];
        while (!empty($queue)) {
            $id = (int)array_shift($queue);
            if (isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            foreach ($all as $p) {
                if ((int)$p->getId() === $id) {
                    $out[] = $p;
                    break;
                }
            }
            foreach ($byParent[$id] ?? [] as $child) {
                $queue[] = (int)$child->getId();
            }
        }
        return $out;
    }

    /** Bir koleksiyonun tüm sayfalarını sil (koleksiyon silinince). */
    public function deleteByCollection(int $collectionId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('collection_id', $qb->createNamedParameter($collectionId, IQueryBuilder::PARAM_INT)));
        $qb->executeStatement();
    }
}
