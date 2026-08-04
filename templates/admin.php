<?php
/**
 * NextLibrary — Yönetim → Bilgi Kartları ayar formu.
 *
 * Uygulamanın kendi stilleri #kesif-app altında kapsanmıştır, buraya ULAŞMAZ:
 * bu sayfanın görünümü css/admin.css'ten gelir ve NC'nin kendi ayar sayfası
 * sınıflarına (.section, .settings-hint) yaslanır.
 *
 * @var \OCP\IL10N $l
 */
?>
<div id="nextlibrary-admin" class="section">
  <h2><?php p($l->t('Knowledge Cards')); ?></h2>

  <p class="settings-hint">
    <?php p($l->t('Nextcloud administrators can always write here. Add accounts or groups below to give them the same rights inside Knowledge Cards: creating, editing and deleting collections and pages, uploading media, and managing members.')); ?>
  </p>
  <p class="settings-hint nlib-warn">
    ⚠️ <?php p($l->t('Only Nextcloud administrators can change this list. Editors cannot add or remove editors.')); ?>
  </p>

  <div class="nlib-box">
    <div class="nlib-search">
      <span aria-hidden="true">🔍</span>
      <input type="text" id="nlibSearch" autocomplete="off"
             placeholder="<?php p($l->t('Search accounts and groups')); ?>" />
    </div>

    <div class="nlib-chips" id="nlibChips"></div>

    <div class="nlib-cols">
      <div>
        <div class="nlib-sec"><?php p($l->t('Accounts')); ?></div>
        <div id="nlibUsers" class="nlib-list"></div>
      </div>
      <div>
        <div class="nlib-sec"><?php p($l->t('Groups')); ?></div>
        <div id="nlibGroups" class="nlib-list"></div>
      </div>
    </div>

    <div class="nlib-foot">
      <button type="button" class="primary" id="nlibSave"><?php p($l->t('Save editors')); ?></button>
      <span class="nlib-status" id="nlibStatus" role="status" aria-live="polite"></span>
    </div>
  </div>
</div>
