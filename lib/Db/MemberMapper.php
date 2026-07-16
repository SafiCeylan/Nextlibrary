<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @extends QBMapper<Member>
 */
class MemberMapper extends QBMapper {

    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'nextlibrary_members', Member::class);
    }

    /** @return Member[] */
    public function findByCollection(int $collectionId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('collection_id', $qb->createNamedParameter($collectionId, IQueryBuilder::PARAM_INT)));
        return $this->findEntities($qb);
    }

    /**
     * Verilen principal kümesinin (kullanıcı uid + grup id'leri) üye olduğu koleksiyon id'leri.
     * @param string[] $principals
     * @return int[]
     */
    public function findCollectionIdsForPrincipals(array $principals): array {
        if (empty($principals)) {
            return [];
        }
        $qb = $this->db->getQueryBuilder();
        $qb->selectDistinct('collection_id')->from($this->getTableName())
            ->where($qb->expr()->in('principal', $qb->createNamedParameter($principals, IQueryBuilder::PARAM_STR_ARRAY)));
        $ids = [];
        $result = $qb->executeQuery();
        while ($row = $result->fetch()) {
            $ids[] = (int)$row['collection_id'];
        }
        $result->closeCursor();
        return $ids;
    }

    /** Bir koleksiyonun tüm üyeliklerini sil. */
    public function deleteByCollection(int $collectionId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('collection_id', $qb->createNamedParameter($collectionId, IQueryBuilder::PARAM_INT)));
        $qb->executeStatement();
    }
}
