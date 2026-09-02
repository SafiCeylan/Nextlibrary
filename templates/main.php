<?php
/**
 * NextLibrary — template embedded inside the Nextcloud content area.
 * Everything is scoped under #kesif-app so it never clashes with Nextcloud's own UI.
 *
 * @var \OCP\IL10N $l
 */
?>
<div id="kesif-app" data-theme="light">
  <!-- Thin in-app header, sits under Nextcloud's real top bar -->
  <div class="kx-bar">
    <button class="kx-menu" id="menuBtn" title="<?php p($l->t('Menu')); ?>">☰</button>
    <button class="kx-btn kx-back" id="backBtn" title="<?php p($l->t('Back')); ?>" style="display: none;">← <?php p($l->t('Back')); ?></button>
    <div class="kx-title"><span class="logo">📚</span> <?php p($l->t('Knowledge Cards')); ?></div>
    <div class="kx-spacer"></div>
    <div class="top-search">
      <span class="si">🔍</span>
      <input id="kx-search" placeholder="<?php p($l->t('Search pages …')); ?>" autocomplete="off" />
      <div class="results" id="results"></div>
    </div>
    <button class="kx-btn" id="roleBtn" title="<?php p($l->t('Editor ↔ visitor')); ?>">✏️ <?php p($l->t('Editor')); ?></button>
    <button class="kx-switch" id="themeBtn" role="switch" aria-checked="false" title="<?php p($l->t('Light / dark theme')); ?>">
      <span class="kx-switch-ico kx-switch-sun">☀️</span>
      <span class="kx-switch-ico kx-switch-moon">🌙</span>
      <span class="kx-switch-thumb"></span>
    </button>
  </div>

  <div class="layout">
    <div class="nav-ovl" id="navOvl"></div>
    <aside class="sidebar">
      <div class="sb-head"><h2><?php p($l->t('Collections')); ?></h2></div>
      <div class="tree" id="tree"></div>
      <button class="sb-new" id="newCollBtn">＋ <?php p($l->t('New collection')); ?></button>
      <button class="sb-trash-btn" id="trashBtn">🗑️ <?php p($l->t('Trash bin')); ?></button>
    </aside>

    <main class="stage" id="stage"><div id="viewer"></div></main>

    <aside class="rail">
      <!-- Sağ ray iki sekmeli: hazır kart şablonları + ilgili kartlar. Şablon sekmesi
           yalnızca yazma yetkisi olana gösterilir (renderTemplates gizler) — yetkisiz
           kullanıcı tıklasa sunucudan yalnızca 403 dönerdi. -->
      <div class="rail-tabs" id="railTabs">
        <button class="rail-tab active" id="railTabTmpl">📑 <?php p($l->t('Card templates')); ?></button>
        <button class="rail-tab" id="railTabRecs">🔗 <?php p($l->t('Related cards')); ?></button>
      </div>

      <div class="rail-panel active" id="panelTmpl">
        <p class="sub"><?php p($l->t('Pick a template to create a card quickly:')); ?></p>
        <div id="tmplList" class="tmpl-list"></div>
      </div>

      <div class="rail-panel" id="panelRecs">
        <h3><?php p($l->t('Related pages')); ?></h3>
        <p class="sub"><?php p($l->t('Other pages in the same collection.')); ?></p>
        <div id="recs"></div>
      </div>
    </aside>
  </div>

  <div class="emoji-pop" id="emojiPop"></div>
  <div class="kx-pop" id="kxPop"></div>
  <div class="ctx-menu" id="ctxMenu"></div>

  <div class="backdrop" id="mdNew">
    <div class="modal">
      <div class="m-head"><h3><?php p($l->t('New collection')); ?></h3><button class="m-close" data-close="mdNew">✕</button></div>
      <div class="m-body">
        <div class="field"><label><?php p($l->t('Collection name')); ?></label><button class="ep" id="newEmoji">📘</button><input id="newName" placeholder="<?php p($l->t('Enter a collection name …')); ?>" /></div>
        <div class="mvis" id="nVis" style="margin-top: 16px;">
          <span class="mvis-label"><?php p($l->t('Visibility')); ?></span>
          <div class="mvis-opts">
            <button type="button" class="mvis-btn" data-vis="public">🌐 <?php p($l->t('Public')); ?></button>
            <button type="button" class="mvis-btn" data-vis="private">🔒 <?php p($l->t('Private')); ?></button>
          </div>
        </div>
        <div class="mvis-hint" id="nVisHint"></div>
        <div class="msec" style="margin-top: 18px; margin-bottom: 6px;"><?php p($l->t('Page list')); ?></div>
        <div id="newPagesContainer"></div>
        <button class="btn btn-ghost" id="addPageFieldBtn" type="button" style="margin-top: 10px; width: 100%; justify-content: center; border: 1px dashed var(--line); border-radius: 10px;">＋ <?php p($l->t('Add a page')); ?></button>
      </div>
      <div class="m-foot"><button class="btn btn-ghost" data-close="mdNew"><?php p($l->t('Cancel')); ?></button><button class="btn btn-primary" id="toMembers"><?php p($l->t('Add members')); ?></button></div>
    </div>
  </div>

  <div class="backdrop" id="mdMembers">
    <div class="modal">
      <div class="m-head"><h3 id="mdMembersTitle"><?php p($l->t('Add members')); ?></h3><button class="m-close" data-close="mdMembers">✕</button></div>
      <div class="m-body">
        <div class="mvis" id="mVis">
          <span class="mvis-label"><?php p($l->t('Visibility')); ?></span>
          <div class="mvis-opts">
            <button type="button" class="mvis-btn" data-vis="public">🌐 <?php p($l->t('Public')); ?></button>
            <button type="button" class="mvis-btn" data-vis="private">🔒 <?php p($l->t('Private')); ?></button>
          </div>
        </div>
        <div class="mvis-hint" id="mVisHint"></div>
        <div class="msearch">🔍 <input id="mSearch" placeholder="<?php p($l->t('Search accounts, groups, teams')); ?>" autocomplete="off" /></div>
        <div class="mchips" id="mChips"></div>
        <div class="msec"><?php p($l->t('Add account')); ?></div><div id="mAccounts"></div>
        <div class="msec"><?php p($l->t('Add group')); ?></div><div id="mGroups"></div>
      </div>
      <div class="m-foot"><button class="btn btn-ghost" id="membersBack"><?php p($l->t('Back')); ?></button><button class="btn btn-primary" id="createColl"><?php p($l->t('Create without members')); ?></button></div>
    </div>
  </div>

  <!-- Şablon tam ekran önizlemesi. Kapatma düğmeleri ve arka plan tıklaması, uygulamanın
       açılışta bağladığı genel [data-close] / .backdrop kancalarından geliyor. -->
  <div class="backdrop" id="mdTmplPreview">
    <div class="modal modal-lg">
      <div class="m-head">
        <h3 id="mdTmplTitle"></h3>
        <button class="m-close" data-close="mdTmplPreview">✕</button>
      </div>
      <div class="m-body">
        <div class="tmpl-preview-meta" id="mdTmplMeta"></div>
        <div class="tmpl-preview-stage doc" id="mdTmplStage"></div>
      </div>
      <div class="m-foot">
        <button class="btn btn-ghost" data-close="mdTmplPreview"><?php p($l->t('Close')); ?></button>
        <button class="btn btn-primary" id="mdTmplUseBtn">🚀 <?php p($l->t('Use this template')); ?></button>
      </div>
    </div>
  </div>

  <!-- Okuma raporu. İçerik sunucudan geliyor (GET /api/collections/{id}/report) ve
       yalnızca yazma yetkisi olanlara açık — kimin ne okuduğu kişisel veri, o yüzden
       hem uç hem de bu modalı açan ⋯ menüsü yetkiyle korunuyor. -->
  <div class="backdrop" id="mdReport">
    <div class="modal modal-lg">
      <div class="m-head">
        <h3 id="mdReportTitle"><?php p($l->t('Reading report')); ?></h3>
        <button class="m-close" data-close="mdReport">✕</button>
      </div>
      <div class="m-body" id="mdReportBody"></div>
      <div class="m-foot">
        <button class="btn btn-ghost" data-close="mdReport"><?php p($l->t('Close')); ?></button>
      </div>
    </div>
  </div>

  <!-- Görsel kırpma: seçilen fotoğrafın hangi bölümünün görüneceği burada belirlenir.
       Sonuç canvas'ta piksele işlenip öyle yükleniyor — konumu markup'ta saklamak
       mümkün değil, sanitizer `style` özniteliğini siliyor. -->
  <div class="backdrop" id="mdCrop">
    <div class="modal">
      <div class="m-head">
        <h3><?php p($l->t('Position the image')); ?></h3>
        <button class="m-close" data-close="mdCrop">✕</button>
      </div>
      <div class="m-body crop-body">
        <p class="crop-hint" id="cropHint"></p>
        <div class="crop-stage" id="cropStage">
          <canvas id="cropCanvas"></canvas>
          <div class="crop-mask" id="cropMask"></div>
        </div>
        <div class="crop-modes" id="cropModes">
          <button class="crop-mode active" id="cropModeFill"><?php p($l->t('Fill')); ?></button>
          <button class="crop-mode" id="cropModeFit"><?php p($l->t('Whole image')); ?></button>
        </div>
        <div class="crop-tools" id="cropTools">
          <span class="crop-zoomlabel"><?php p($l->t('Zoom')); ?></span>
          <input type="range" id="cropZoom" min="100" max="300" value="100">
        </div>
      </div>
      <div class="m-foot">
        <button class="btn btn-ghost" data-close="mdCrop"><?php p($l->t('Cancel')); ?></button>
        <button class="btn btn-primary" id="cropApply"><?php p($l->t('Add image')); ?></button>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>
</div>
