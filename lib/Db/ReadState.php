<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

/**
 * @method string getUserUid()
 * @method void setUserUid(string $userUid)
 * @method int getPageId()
 * @method void setPageId(int $pageId)
 * @method int getReadAt()
 * @method void setReadAt(int $readAt)
 */
class ReadState extends Entity implements JsonSerializable {
    protected $userUid;
    protected $pageId;
    protected $readAt;

    public function __construct() {
        $this->addType('pageId', 'integer');
        $this->addType('readAt', 'integer');
    }

    public function jsonSerialize(): array {
        return [
            'id' => (int)$this->id,
            'pageId' => (int)$this->pageId,
            'readAt' => (int)$this->readAt,
        ];
    }
}
