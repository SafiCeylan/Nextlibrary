<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @extends QBMapper<Collection>
 */
class CollectionMapper extends QBMapper {

    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'nextlibrary_collections', Collection::class);
    }

    public function find(int $id): Collection {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->eq('deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)));
        return $this->findEntity($qb);
    }

    public function findWithDeleted(int $id): Collection {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
        return $this->findEntity($qb);
    }

    /** @return Collection[] */
    public function findAll(): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
            ->orderBy('name', 'ASC');
        return $this->findEntities($qb);
    }

    /**
     * Kullanıcının okuyabileceği koleksiyonlar: herkese açık OLANLAR + sahibi olduğu
     * + üye (editör/okuyucu) olduğu. $memberIds = üyelik üzerinden erişilen koleksiyon id'leri.
     * @param int[] $memberIds
     * @return Collection[]
     */
    public function findReadable(string $uid, array $memberIds): array {
        $qb = $this->db->getQueryBuilder();
        $or = $qb->expr()->orX(
            $qb->expr()->eq('visibility', $qb->createNamedParameter('public')),
            $qb->expr()->eq('owner_uid', $qb->createNamedParameter($uid))
        );
        if (!empty($memberIds)) {
            $or->add($qb->expr()->in('id', $qb->createNamedParameter($memberIds, IQueryBuilder::PARAM_INT_ARRAY)));
        }
        $qb->select('*')->from($this->getTableName())
            ->where($or)
            ->andWhere($qb->expr()->eq('deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
            ->orderBy('name', 'ASC');
        return $this->findEntities($qb);
    }

    /**
     * Çöp kutusundaki okunabilir koleksiyonları listeleme.
     * @param int[] $memberIds
     * @return Collection[]
     */
    public function findDeletedReadable(string $uid, array $memberIds): array {
        $qb = $this->db->getQueryBuilder();
        $or = $qb->expr()->orX(
            $qb->expr()->eq('visibility', $qb->createNamedParameter('public')),
            $qb->expr()->eq('owner_uid', $qb->createNamedParameter($uid))
        );
        if (!empty($memberIds)) {
            $or->add($qb->expr()->in('id', $qb->createNamedParameter($memberIds, IQueryBuilder::PARAM_INT_ARRAY)));
        }
        $qb->select('*')->from($this->getTableName())
            ->where($or)
            ->andWhere($qb->expr()->gt('deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
            ->orderBy('deleted_at', 'DESC');
        return $this->findEntities($qb);
    }

    /**
     * Belirli bir tarihten sonra silinen koleksiyonları bulur.
     * @param int[] $memberIds
     * @return Collection[]
     */
    public function findDeletedSince(string $uid, array $memberIds, int $since): array {
        $qb = $this->db->getQueryBuilder();
        $or = $qb->expr()->orX(
            $qb->expr()->eq('visibility', $qb->createNamedParameter('public')),
            $qb->expr()->eq('owner_uid', $qb->createNamedParameter($uid))
        );
        if (!empty($memberIds)) {
            $or->add($qb->expr()->in('id', $qb->createNamedParameter($memberIds, IQueryBuilder::PARAM_INT_ARRAY)));
        }
        $qb->select('*')->from($this->getTableName())
            ->where($or)
            ->andWhere($qb->expr()->gt('deleted_at', $qb->createNamedParameter($since, IQueryBuilder::PARAM_INT)));
        return $this->findEntities($qb);
    }

    /** @return Collection[] */
    public function findByOwner(string $uid): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('owner_uid', $qb->createNamedParameter($uid)))
            ->andWhere($qb->expr()->eq('deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
            ->orderBy('name', 'ASC');
        return $this->findEntities($qb);
    }

    /**
     * Verilen id kümesindeki koleksiyonlar (üyelik üzerinden erişilenler için).
     * @param int[] $ids
     * @return Collection[]
     */
    public function findByIds(array $ids): array {
        if (empty($ids)) {
            return [];
        }
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->in('id', $qb->createNamedParameter($ids, IQueryBuilder::PARAM_INT_ARRAY)))
            ->andWhere($qb->expr()->eq('deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
            ->orderBy('name', 'ASC');
        return $this->findEntities($qb);
    }
}
