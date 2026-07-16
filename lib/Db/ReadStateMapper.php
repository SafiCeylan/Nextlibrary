<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @extends QBMapper<ReadState>
 */
class ReadStateMapper extends QBMapper {

    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'nextlibrary_reads', ReadState::class);
    }

    /** @return ReadState[] */
    public function findByUser(string $uid): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('user_uid', $qb->createNamedParameter($uid)));
        return $this->findEntities($qb);
    }

    /**
     * Kullanıcının belirli sayfalar için okundu kaydı (pageId => readAt).
     * @param int[] $pageIds
     * @return array<int,int>
     */
    public function mapForUserPages(string $uid, array $pageIds): array {
        if (empty($pageIds)) {
            return [];
        }
        $qb = $this->db->getQueryBuilder();
        $qb->select('page_id', 'read_at')->from($this->getTableName())
            ->where($qb->expr()->eq('user_uid', $qb->createNamedParameter($uid)))
            ->andWhere($qb->expr()->in('page_id', $qb->createNamedParameter($pageIds, IQueryBuilder::PARAM_INT_ARRAY)));
        $out = [];
        $result = $qb->executeQuery();
        while ($row = $result->fetch()) {
            $out[(int)$row['page_id']] = (int)$row['read_at'];
        }
        $result->closeCursor();
        return $out;
    }

    public function findOne(string $uid, int $pageId): ?ReadState {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('user_uid', $qb->createNamedParameter($uid)))
            ->andWhere($qb->expr()->eq('page_id', $qb->createNamedParameter($pageId, IQueryBuilder::PARAM_INT)));
        $rows = $this->findEntities($qb);
        return $rows[0] ?? null;
    }

    /** Bir sayfaya ait tüm okundu kayıtlarını sil (sayfa silinince). */
    public function deleteByPage(int $pageId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('page_id', $qb->createNamedParameter($pageId, IQueryBuilder::PARAM_INT)));
        $qb->executeStatement();
    }
}
