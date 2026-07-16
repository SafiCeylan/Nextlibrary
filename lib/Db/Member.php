<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

/**
 * @method int getCollectionId()
 * @method void setCollectionId(int $collectionId)
 * @method string getPrincipal()
 * @method void setPrincipal(string $principal)
 * @method string getType()
 * @method void setType(string $type)
 * @method string getRole()
 * @method void setRole(string $role)
 */
class Member extends Entity implements JsonSerializable {
    protected $collectionId;
    protected $principal;
    protected $type;
    protected $role;

    public function __construct() {
        $this->addType('collectionId', 'integer');
    }

    public function jsonSerialize(): array {
        return [
            'id' => (int)$this->id,
            'collectionId' => (int)$this->collectionId,
            'principal' => $this->principal,
            'type' => $this->type,
            'role' => $this->role ?: 'editor',
        ];
    }
}
