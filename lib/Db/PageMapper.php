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

    /** Bir koleksiyonun tüm sayfalarını sil (koleksiyon silinince). */
    public function deleteByCollection(int $collectionId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('collection_id', $qb->createNamedParameter($collectionId, IQueryBuilder::PARAM_INT)));
        $qb->executeStatement();
    }
}
