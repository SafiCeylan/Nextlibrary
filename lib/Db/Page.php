<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

/**
 * @method int getCollectionId()
 * @method void setCollectionId(int $collectionId)
 * @method int getParentId()
 * @method void setParentId(int $parentId)
 * @method string|null getKind()
 * @method void setKind(?string $kind)
 * @method string|null getIcon()
 * @method void setIcon(?string $icon)
 * @method string|null getEmoji()
 * @method void setEmoji(?string $emoji)
 * @method string|null getTitle()
 * @method void setTitle(?string $title)
 * @method string|null getHtml()
 * @method void setHtml(?string $html)
 * @method int getSort()
 * @method void setSort(int $sort)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 * @method int getDeletedAt()
 * @method void setDeletedAt(int $deletedAt)
 */
class Page extends Entity implements JsonSerializable {
    protected $collectionId;
    /** 0 = koleksiyonun kökü; aksi halde üst sayfanın id'si (aynı koleksiyon içinde). */
    protected $parentId;
    /** 'page' = yazı sayfası, 'folder' = bölüm (yalnızca alt kartları gruplar). */
    protected $kind;
    /** Yüklenmiş simge dosyasının adı; boşsa emoji kullanılır. */
    protected $icon;
    protected $emoji;
    protected $title;
    protected $html;
    protected $sort;
    protected $createdAt;
    protected $updatedAt;
    protected $deletedAt;

    public function __construct() {
        $this->addType('collectionId', 'integer');
        $this->addType('parentId', 'integer');
        $this->addType('sort', 'integer');
        $this->addType('createdAt', 'integer');
        $this->addType('updatedAt', 'integer');
        $this->addType('deletedAt', 'integer');
    }

    public function jsonSerialize(): array {
        return [
            'id' => (int)$this->id,
            'collectionId' => (int)$this->collectionId,
            'parentId' => (int)$this->parentId,
            'kind' => $this->kind ?: 'page',
            'emoji' => $this->emoji,
            'icon' => $this->icon ?: '',
            'title' => $this->title,
            'html' => $this->html,
            'sort' => (int)$this->sort,
            'createdAt' => (int)$this->createdAt,
            'updatedAt' => (int)$this->updatedAt,
            'deletedAt' => (int)$this->deletedAt,
        ];
    }
}
