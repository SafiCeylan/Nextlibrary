<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

/**
 * @method string getOwnerUid()
 * @method void setOwnerUid(string $ownerUid)
 * @method string|null getEmoji()
 * @method void setEmoji(?string $emoji)
 * @method string getName()
 * @method void setName(string $name)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 * @method string getVisibility()
 * @method void setVisibility(string $visibility)
 * @method int getDeletedAt()
 * @method void setDeletedAt(int $deletedAt)
 */
class Collection extends Entity implements JsonSerializable {
    protected $ownerUid;
    protected $emoji;
    protected $name;
    protected $createdAt;
    protected $updatedAt;
    protected $visibility;
    protected $deletedAt;

    public function __construct() {
        $this->addType('createdAt', 'integer');
        $this->addType('updatedAt', 'integer');
        $this->addType('deletedAt', 'integer');
    }

    public function jsonSerialize(): array {
        return [
            'id' => (int)$this->id,
            'owner' => $this->ownerUid,
            'emoji' => $this->emoji,
            'name' => $this->name,
            'visibility' => $this->visibility ?: 'public',
            'createdAt' => (int)$this->createdAt,
            'updatedAt' => (int)$this->updatedAt,
            'deletedAt' => (int)$this->deletedAt,
        ];
    }
}
