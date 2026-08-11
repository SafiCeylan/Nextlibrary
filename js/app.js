(function(){
function boot(){
const ROOT=document.getElementById('kesif-app');
if(!ROOT)return;
const LS={get:(k,d)=>{try{const v=localStorage.getItem('kx_'+k);return v===null?d:JSON.parse(v)}catch(e){return d}},set:(k,v)=>localStorage.setItem('kx_'+k,JSON.stringify(v))};
const uid=()=>Math.random().toString(36).slice(2,9);
const el=id=>ROOT.querySelector('#'+id);  // NC'nin #content vb. id'leriyle çakışmasın diye kapsamlı arama
const esc=s=>(s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const debounce=(fn,ms)=>{let x;return(...a)=>{clearTimeout(x);x=setTimeout(()=>fn(...a),ms);};};

/* Nextcloud installs global t()/n(). Outside Nextcloud (dev.html) they are missing and
   would kill boot on the first call, so fall back to the untranslated source string. */
const t = (typeof window.t === 'function') ? window.t : function(app, text, vars){
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars) ? vars[k] : m);
};
const n = (typeof window.n === 'function') ? window.n : function(app, sing, plur, count, vars){
  return String(count === 1 ? sing : plur)
    .replace(/%n/g, count)
    .replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars) ? vars[k] : m);
};
/* Dates follow the Nextcloud UI language, not a hardcoded locale. */
const LOCALE = (function(){
  try{ if(window.OC && typeof OC.getLanguage === 'function') return OC.getLanguage(); }catch(e){}
  return navigator.language || 'en';
})();

/* -------- Sunucu API (F2: kalıcı depolama) -------- */
const API_BASE=(window.OC&&OC.generateUrl)?OC.generateUrl('/apps/nextlibrary/api'):'./api';
function reqToken(){ try{ if(window.OC&&OC.requestToken)return OC.requestToken; }catch(e){} const m=document.querySelector('head meta[name=requesttoken]'); return m?m.getAttribute('content'):''; }
function api(method,path,body){
  const h={'requesttoken':reqToken()};
  let reqBody=undefined;
  if(body!==undefined){
    h['Content-Type']='application/json';
    reqBody=JSON.stringify(body);
  } else if(method==='POST'||method==='PUT'){
    h['Content-Type']='application/json';
    reqBody='{}';
  }
  return fetch(API_BASE+path,{method,headers:h,credentials:'same-origin',body:reqBody})
    .then(r=>{
      if(!r.ok) {
        // Read the body once as text, then try to parse it as JSON. Calling
        // r.json() first and falling back to r.text() fails: the first read
        // consumes the stream, so the fallback throws "body stream already read".
        return r.text().then(raw => {
          let errData; try{ errData = JSON.parse(raw); }catch(_){ errData = raw; }
          const err = new Error(r.status);
          err.status = r.status;
          err.data = errData;
          throw err;
        });
      }
      if(r.status===204)return null;
      return r.json().catch(()=>null);
    });
}
// Hatayı sebebine göre söyle: her şeye "bağlantını kontrol et" demek yetki/oturum
// sorunlarını ağ sorunu gibi gösteriyordu (403 → aslında yetki yok).
function apiErr(e){
  try{console.error('[NextLibrary API]',e);}catch(_){}
  const s=e&&e.status;
  if(s===403)      toast(t('nextlibrary','You are not allowed to do this — ask an administrator for editing rights'));
  else if(s===401) toast(t('nextlibrary','Your session has expired — reload the page and sign in again'));
  else if(s===429) toast(t('nextlibrary','Too many requests — wait a moment and try again'));
  else             toast(t('nextlibrary','Could not save to the server — check your connection'));
}

/* -------- Seed content for an empty instance -------- */
function seed(){
  return [
    {
      id:uid(), emoji:'👋', name:t('nextlibrary','Getting started'), owner:me.id, members:[],
      pages:[
        {id:uid(), emoji:'📖', title:t('nextlibrary','Welcome to Knowledge Cards'),
          html:'<p>'+t('nextlibrary','This is a page. Collections group pages together, and every page remembers who has read it and when.')+'</p>'
            +'<h2>'+t('nextlibrary','Three things to try')+'</h2>'
            +'<ul>'
            +'<li>'+t('nextlibrary','Press <b>Edit</b> above to rewrite this page. Headings, lists, colours, images and video embeds are all available.')+'</li>'
            +'<li>'+t('nextlibrary','Mark this page as read. Your progress shows up in the tree on the left.')+'</li>'
            +'<li>'+t('nextlibrary','Create a collection of your own and decide who may read or edit it.')+'</li>'
            +'</ul>'
            +'<blockquote>'+t('nextlibrary','Delete this collection whenever you like — the trash bin keeps it until you empty it.')+'</blockquote>'}
      ]
    }
  ];
}
let colls=[];   // sunucudan loadState() ile doldurulur
// null = "Akademi ana ekranı". curColl/curPage tarayıcıya özel görünüm durumu (server id'leri).
let curColl=LS.get('curColl',null);
let curPage=LS.get('curPage',null);
let openColls=new Set(LS.get('openColls',[]));
let openPages=new Set(LS.get('openPages',[]));   // ağaçta genişletilmiş kartlar (iç içe)
let editing=false;

/* Gerçek NC kullanıcı/grup meta bilgisi (principal id → {name,type}).
   state (üye label'ları) + üye arama sonuçlarından dolar → statik liste yok. */
const PMETA={};
function setPMeta(id,name,type){ if(id)PMETA[id]={name:name||id,type:type||'user'}; }
function pName(id){ return (PMETA[id]&&PMETA[id].name)||id; }
function pType(id){ return (PMETA[id]&&PMETA[id].type)||'user'; }
// principal id'den deterministik avatar rengi (gerçek kullanıcıların sabit rengi yok)
function pColor(id){ let h=0; const s=String(id); for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0; const hue=h%360; return {c:`hsl(${hue} 60% 88%)`,t:`hsl(${hue} 55% 30%)`}; }

/* -------- Kullanıcı kimliği (gerçek NC kullanıcısı, yoksa dev fallback) -------- */
/* NC içinde gerçek kullanıcı; NC dışında (dev.html) açıkça sahte bir kimlik.
   Eskiden her iki durumda da sabit bir kişi adına düşülüyordu: NC İÇİNDE kimlik
   okunamazsa uygulama sessizce YANLIŞ kullanıcı kimliğiyle çalışırdı (okundu kayıtları
   ve "lastUser" sıfırlaması o kimliğe yazılırdı). Artık ayrım net —
   NC var ama kimlik yoksa boş kalır, uyarı basılır ve gerçek kimlik /api/state
   yanıtındaki `me` ile gelir (applyState). */
function detectUser(){
  try{
    if(window.OC&&typeof OC.getCurrentUser==='function'){
      const u=OC.getCurrentUser();
      if(u&&u.uid)return{id:u.uid,name:u.displayName||u.uid};
    }
  }catch(e){}
  if(!window.OC)return{id:'dev',name:'Dev'};   // dev.html — NC yok
  try{console.warn('[NextLibrary] Nextcloud kimliği okunamadı; sunucudan gelen kimlik beklenecek.');}catch(_){}
  return {id:'',name:''};
}
let me=detectUser();
/* Aynı tarayıcıda farklı NC hesabıyla giriş yapılırsa (localStorage paylaşımlı) önceki
   kullanıcının açık koleksiyon/sayfa durumu miras alınmasın → ana ekrandan başlat.
   Kimlik bilinmiyorken (me.id boş) HİÇBİR ŞEY yapmaz: aksi halde 'lastUser' boşa yazılır
   ve kimlik sunucudan gelince her açılışta görünüm durumu yeniden sıfırlanırdı.
   Bu yüzden loadState sonrasında bir kez daha çağrılır. */
function scopeViewToUser(){
  if(!me.id)return;
  const lastUser=LS.get('lastUser',null);
  if(lastUser===me.id)return;
  if(lastUser!==null){ curColl=null; curPage=null; openColls.clear();
    LS.set('curColl',null); LS.set('curPage',null); LS.set('openColls',[]); }
  LS.set('lastUser',me.id);
}
scopeViewToUser();
function userName(id){ if(!id)return''; if(id===me.id)return me.name; return pName(id); }

/* -------- Rol / yetki (yetki sunucuda hesaplanır, coll.canEdit) -------- */
// Koleksiyon açma yetkisi (sunucu: yalnızca NC yöneticileri). state() ile gelir;
// gelmezse false kalır → yetkisiz kullanıcıya 403 üreten düğme gösterilmez.
let canCreate=false;
let previewAsVisitor=LS.get('previewAsVisitor',false);
function canEdit(coll){ if(previewAsVisitor||!coll)return false; return !!coll.canEdit; }

const save=()=>{}; // Kalıcılık artık sunucu API'si ile (apiSave*/pushPage çağrıları). Yerel yazma yok.
const getColl=id=>colls.find(c=>c.id===id);
const findPage=id=>{for(const c of colls){const p=c.pages.find(p=>p.id===id);if(p)return{coll:c,page:p};}return null;};
/* -------- Kart ağacı (iç içe kartlar) --------
   Sayfalar sunucudan düz liste gelir; hiyerarşi parentId ile kurulur ('0' = kök).
   sort değeri KARDEŞLER arasında anlamlıdır, o yüzden sıralama her seviyede ayrı yapılır. */
const childrenOf=(coll,parentId)=>(coll.pages||[])
  .filter(p=>(p.parentId||'0')===String(parentId))
  .sort((a,b)=>(a.sort||0)-(b.sort||0)||String(a.id).localeCompare(String(b.id)));
const hasChildren=(coll,pageId)=>(coll.pages||[]).some(p=>(p.parentId||'0')===String(pageId));
// Ağacı görsel sırayla (derinlik öncelikli) düzleştirir → önceki/sonraki kart bunu izler.
function dfsPages(coll,parentId='0',out=[],guard=0){
  if(guard>200)return out;   // bozuk veri bir döngü oluştursa bile kilitlenme
  childrenOf(coll,parentId).forEach(p=>{ out.push(p); dfsPages(coll,p.id,out,guard+1); });
  return out;
}
// Bir kartın kökten kendisine kadar olan yolu (breadcrumb ve "üst karta dön" için)
function pathOf(coll,page){
  const byId={}; (coll.pages||[]).forEach(p=>byId[p.id]=p);
  const path=[]; let cur=page, guard=0;
  while(cur&&guard++<200){ path.unshift(cur); const pid=cur.parentId||'0'; cur=pid==='0'?null:byId[pid]; }
  return path;
}
// Kart + altındaki her şey (silme onayında "kaç kart gidecek" için)
function subtreeOf(coll,page){ return [page,...dfsPages(coll,page.id)]; }
/* Okuma sayaçlarına yalnızca YAZI SAYFALARI girer.
   Bölümün okunacak metni yok ve "okundu" işaretlenemiyor; sayacın içinde durunca
   ilerleme asla %100 olamıyordu ("2 sayfa · 1/2 okundu" gibi yanıltıcı çıktı). */
const readablePages=coll=>(coll.pages||[]).filter(p=>p.kind!=='folder');
/* Bir koleksiyondaki HER kartın altındaki kart sayısı — tek geçişte.
   Kart başına dfsPages çağırmak koleksiyon büyüdükçe kareli maliyet çıkarıyordu
   (780 kartlık ağaçta kapak ekranı bunu her çizimde yeniden hesaplıyordu). */
function subtreeCounts(coll){
  const kids={};
  (coll.pages||[]).forEach(p=>{ const k=p.parentId||'0'; (kids[k]=kids[k]||[]).push(p.id); });
  const memo={};
  const visit=(id,guard)=>{
    if(memo[id]!==undefined)return memo[id];
    if(guard>200)return 0;
    memo[id]=0;                       // döngüde sonsuza gitmesin
    let n=0;
    (kids[id]||[]).forEach(k=>{ n+=1+visit(k,guard+1); });
    memo[id]=n; return n;
  };
  (coll.pages||[]).forEach(p=>visit(p.id,0));
  return memo;
}
const flatPages=()=>{const a=[];colls.forEach(c=>dfsPages(c).forEach(p=>a.push({c,p})));return a;};

/* -------- Sunucu ↔ model dönüşümü + yükleme -------- */
// Sunucu koleksiyonunu istemci model şekline çevir (id'ler string tutulur → tüm render kodu aynı kalır).
function mapColl(c){
  if(c.owner)setPMeta(c.owner,c.ownerName||c.owner,'user');
  (c.members||[]).forEach(m=>{ if(m&&m.principal!==undefined)setPMeta(m.principal,m.label||m.principal,m.type||'user'); });
  return {
    id:String(c.id), emoji:c.emoji||'📘', icon:c.icon||'', name:c.name||'', owner:c.owner,
    canEdit:!!c.canEdit, visibility:c.visibility||'public',
    members:(c.members||[]).map(m=>(m&&m.principal!==undefined)?{principal:m.principal,role:m.role||'editor'}:{principal:m,role:'editor'}),
    // updatedAt: optimistic locking (PUT /pages/{id} lastUpdatedAt) için şart — düşerse çakışma kontrolü sessizce devre dışı kalır.
    // parentId: '0' = koleksiyonun kökü, aksi halde üst kartın id'si (iç içe kartlar)
    pages:((c.pages)||[]).map(p=>({id:String(p.id),parentId:String(p.parentId||0),kind:p.kind==='folder'?'folder':'page',emoji:p.emoji||'📄',icon:p.icon||'',title:p.title||'',html:p.html||'',sort:p.sort||0,updatedAt:p.updatedAt||0}))
  };
}
function applyState(st){
  if(st&&st.me&&st.me.id){ me={id:st.me.id,name:st.me.name||st.me.id}; }
  if(st&&st.canCreate!==undefined)canCreate=!!st.canCreate;
  colls=((st&&st.collections)||[]).map(mapColl);
  reads={}; const rs=(st&&st.reads)||{}; Object.keys(rs).forEach(k=>{reads[String(k)]=rs[k];});
}
// Dönüş: bu delta gerçekten bir şey değiştirdi mi. Arka plan poll'u buna bakıp
// gereksiz re-render'dan kaçınır (bkz. syncTick).
function applySyncState(st) {
  if (!st) return false;
  let changed = false;
  if (st.me && st.me.id) { me = { id: st.me.id, name: st.me.name || st.me.id }; }
  if (st.canCreate !== undefined) canCreate = !!st.canCreate;

  if (st.deleted) {
    const delColls = new Set((st.deleted.collections || []).map(String));
    const delPages = new Set((st.deleted.pages || []).map(String));
    if (delColls.size > 0) {
      colls = colls.filter(c => !delColls.has(c.id));
      if (curColl && delColls.has(curColl)) { curColl = null; curPage = null; }
      changed = true;
    }
    if (delPages.size > 0) {
      colls.forEach(c => {
        c.pages = c.pages.filter(p => !delPages.has(p.id));
      });
      if (curPage && delPages.has(curPage)) { curPage = null; }
      delPages.forEach(pid => { delete reads[pid]; });
      changed = true;
    }
  }

  if (st.collections && st.collections.length > 0) {
    changed = true;
    st.collections.forEach(sc => {
      const mc = mapColl(sc);
      const idx = colls.findIndex(c => c.id === mc.id);
      if (idx >= 0) {
        const oldColl = colls[idx];
        oldColl.name = mc.name;
        oldColl.emoji = mc.emoji;
        oldColl.visibility = mc.visibility;
        oldColl.members = mc.members;
        oldColl.canEdit = mc.canEdit;

        // Sunucu bir koleksiyonu gönderdiğinde onun TÜM silinmemiş sayfalarını gönderir
        // (kısmi liste değil) → birleştirmek değil, değiştirmek doğrusu. Birleştirme
        // kalıcı silinen sayfaları ekranda bırakıyordu.
        // Tek istisna: kullanıcı o an bir sayfayı düzenliyorsa yazdığı metnin üstüne yazma.
        const editedLocal = (editing && curPage) ? oldColl.pages.find(p => p.id === curPage) : null;
        oldColl.pages = mc.pages.map(mp => (editedLocal && mp.id === editedLocal.id) ? editedLocal : mp);
        oldColl.pages.sort((a, b) => (a.sort || 0) - (b.sort || 0));
      } else {
        colls.push(mc);
      }
    });
  }

  // Sunucu since>0'da yalnızca since'den YENİ okundu kayıtlarını yollar → dolu gelmesi
  // gerçek bir değişiklik demek (örn. kullanıcının başka cihazı sayfayı okundu işaretledi).
  if (st.reads && Object.keys(st.reads).length > 0) {
    Object.keys(st.reads).forEach(k => {
      reads[String(k)] = st.reads[k];
    });
    changed = true;
  }
  return changed;
}
let lastSyncAt = LS.get('lastSyncAt', 0);
// quiet: arka plan poll'u için. Hatayı kullanıcıya toast'lamaz (20sn'de bir uyarı spam'i olurdu)
// ve başarısızlıkta ekranı boşaltmaz — eldeki veri, bayat da olsa, boş ekrandan iyidir.
// Dönüş: {ok, changed} — changed yalnızca delta gerçekten bir şey getirdiyse true.
async function loadState(forceFull = false, quiet = false){
  let st;
  // colls boşken delta çekilirse (örn. sayfa yenileme) sunucu yalnızca "since'den beri değişenleri"
  // döndürür ve ekran boş kalır — veriler silinmiş gibi görünür. Elde temel yokken daima tam yükle.
  const since = (forceFull || colls.length === 0) ? 0 : lastSyncAt;
  const reqTime = Date.now();
  try{ st=await api('GET','/state' + (since > 0 ? '?since=' + since : '')); }
  catch(e){
    if (quiet) { try{ console.error('[NextLibrary sync]', e); }catch(_){} return {ok:false, changed:false}; }
    apiErr(e);
    if (since === 0) applyState({collections:[],reads:{}});
    return {ok:false, changed:false};
  }
  // First run on an empty instance: plant the getting-started collection.
  if(since === 0 && (!st.collections||!st.collections.length) && !LS.get('seeded', false)){
    // Yetkisiz kullanıcıda (403) başarısız olur; bu bir hata değil — boş bir örnek
    // koleksiyon ekleme denemesidir, sessizce geçilir.
    try{ st=await api('POST','/import',{collections:seed()}); }
    catch(e){ if(e&&e.status===403){ try{console.warn('[NextLibrary] seed atlandı (yetki yok)');}catch(_){} } else { apiErr(e); } }
    LS.set('seeded',true);
  }
  let changed;
  if (since === 0) {
    applyState(st);
    changed = true;
  } else {
    changed = applySyncState(st);
  }
  lastSyncAt = st.syncAt || reqTime;
  LS.set('lastSyncAt', lastSyncAt);
  return {ok:true, changed};
}
let isConflictOpen = false;
// Aynı sayfa için iki kayıt AYNI ANDA uçuşta olursa ikincisi bayatlamış lastUpdatedAt yollar
// (birincinin yanıtı daha gelmemiştir) → sunucu 409 döner ve kullanıcı KENDİSİYLE çakışır.
// Bu yüzden kayıtları sıraya alıyoruz: uçuşta varken yenisini başlatma, sonrasına ertele.
let saveInFlight = false;
let savePendingPage = null;
async function sendPageUpdate(page, force = false) {
  if (isConflictOpen) return;
  if (saveInFlight) { savePendingPage = page; return; }
  saveInFlight = true;
  try {
    const res = await api('PUT', '/pages/' + page.id, {
      title: page.title,
      html: page.html,
      emoji: page.emoji,
      lastUpdatedAt: page.updatedAt,
      force: force
    });
    if (res && res.updatedAt) {
      page.updatedAt = res.updatedAt;
    }
  } catch (e) {
    if (e.status === 409) {
      handleConflict(page, e.data && e.data.serverPage);
    } else {
      apiErr(e);
    }
  } finally {
    saveInFlight = false;
    const next = savePendingPage;
    savePendingPage = null;
    // Ertelenen kayıt varsa şimdi gönder (o sırada page.html/title en güncel hâlini taşır).
    if (next && !isConflictOpen) sendPageUpdate(next);
  }
}
function handleConflict(page, serverPage) {
  if (isConflictOpen) return;
  // Sunucu 409'u serverPage'siz dönerse (proxy/hata gövdesi) modal patlamasın.
  if (!serverPage || typeof serverPage !== 'object') {
    toast(t('nextlibrary','This page was updated by someone else — reloading'));
    loadState(true).then(() => { renderViewer(); renderTree(el('kx-search').value); });
    return;
  }
  isConflictOpen = true;
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop show';
  backdrop.id = 'mdConflict';
  backdrop.style.zIndex = '9999';
  backdrop.innerHTML = `
    <div class="modal" style="max-width: 500px;">
      <div class="m-head">
        <h3>⚠️ ${esc(t('nextlibrary','Editing conflict'))}</h3>
      </div>
      <div class="m-body">
        <p>${esc(t('nextlibrary','Another user updated this page while you were editing it.'))}</p>
        <div style="background: var(--bg-soft); border-radius: 8px; padding: 12px; font-size: 13px; color: var(--ink-soft); line-height: 1.4; margin-top: 10px;">
          <b>${esc(t('nextlibrary','Title on the server:'))}</b> ${esc(serverPage.title)}<br/>
          <b>${esc(t('nextlibrary','Saved on the server at:'))}</b> ${new Date(serverPage.updatedAt).toLocaleTimeString()}
        </div>
        <p style="margin-top: 14px;">${esc(t('nextlibrary','How do you want to continue?'))}</p>
      </div>
      <div class="m-foot" style="gap: 10px;">
        <button class="btn btn-ghost" id="conflictDiscard" style="flex: 1;">${esc(t('nextlibrary','Load the server version'))}</button>
        <button class="btn btn-primary" id="conflictOverwrite" style="flex: 1; background: var(--brand-danger, #d9534f);">${esc(t('nextlibrary','Overwrite with my version'))}</button>
      </div>
    </div>
  `;
  // CSS'in tamamı #kesif-app altında izole → body'ye eklenirse modal TAMAMEN STİLSİZ kalır.
  ROOT.appendChild(backdrop);
  backdrop.querySelector('#conflictDiscard').onclick = () => {
    backdrop.remove();
    isConflictOpen = false;
    page.title = serverPage.title;
    page.html = serverPage.html;
    page.updatedAt = serverPage.updatedAt;
    renderViewer();
    renderTree(el('kx-search').value);
    toast(t('nextlibrary','Loaded the server version'));
  };
  backdrop.querySelector('#conflictOverwrite').onclick = async () => {
    backdrop.remove();
    isConflictOpen = false;
    await sendPageUpdate(page, true);
    toast(t('nextlibrary','Your version was saved over the server version'));
  };
}
// Sayfa içeriği kaydı: debounce'lu (editör yazarken) + anlık (flush) sürümler
const saveCurrentPage=debounce(()=>{ const f=findPage(curPage); if(f)sendPageUpdate(f.page); },500);
function flushPage(){ const f=findPage(curPage); if(!f)return Promise.resolve(); return sendPageUpdate(f.page); }
function pushPage(id,fields){ return api('PUT','/pages/'+id,fields).catch(apiErr); }

/* -------- Tema (NC temasıyla senkron, kullanıcı seçimi öncelikli) -------- */
function ncPrefersDark(){
  try{
    const b=document.body;
    if(b.classList.contains('theme--dark')||b.getAttribute('data-theme-dark')!==null)return true;
    const t=(b.getAttribute('data-themes')||'')+' '+(document.documentElement.getAttribute('data-themes')||'');
    if(/dark/i.test(t))return true;
    if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)return true;
  }catch(e){}
  return false;
}
let theme=LS.get('theme',null)|| (ncPrefersDark()?'dark':'light');
ROOT.setAttribute('data-theme',theme);

/* -------- Okundu takibi (kullanıcı-bazlı, sunucuda) -------- */
let reads={};                                 // { pageId: epochMs } — loadState() ile sunucudan dolar
function markRead(id){ if(!id)return; reads[id]=Date.now(); api('POST','/pages/'+id+'/read').then(r=>{ if(r&&r.readAt){reads[id]=r.readAt; updateTreeTimes();} }).catch(apiErr); }
function clearRead(id){ if(!id)return; delete reads[id]; api('DELETE','/pages/'+id+'/read').catch(apiErr); }
function timeAgo(ts){
  if(!ts)return'';
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<45)return t('nextlibrary','just now');
  const m=Math.floor(s/60); if(m<60)return n('nextlibrary','%n minute ago','%n minutes ago',m);
  const h=Math.floor(m/60); if(h<24)return n('nextlibrary','%n hour ago','%n hours ago',h);
  const d=Math.floor(h/24); if(d===1)return t('nextlibrary','yesterday'); if(d<7)return n('nextlibrary','%n day ago','%n days ago',d);
  return new Date(ts).toLocaleDateString(LOCALE,{day:'numeric',month:'short',year:'numeric'});
}
const readFull=ts=>new Date(ts).toLocaleString(LOCALE,{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});

/* -------- Güvenlik: HTML sanitizasyonu + URL doğrulama -------- */
// STRIKE: execCommand('strikeThrough') Chrome'da <strike> üretir (<s> değil) → listede yoksa
// üstü çizili biçim kaydedince sessizce kaybolur. Sunum etiketi, güvenlik riski yok.
const SAFE_TAGS=new Set(['P','BR','B','STRONG','I','EM','U','S','STRIKE','H1','H2','H3','H4','UL','OL','LI','BLOCKQUOTE','A','IMG','SPAN','DIV','CODE','PRE','HR','TABLE','THEAD','TBODY','TR','TD','TH','VIDEO','SOURCE','IFRAME','FIGURE','FIGCAPTION']);
const DROP_TAGS=new Set(['SCRIPT','STYLE','OBJECT','EMBED','LINK','META','FORM','INPUT','BUTTON','TEXTAREA','SELECT','SVG','MATH','BASE']);
const ALLOW_ATTR=new Set(['class','alt','title','target','rel','colspan','rowspan','controls','type','width','height','playsinline','poster']);
const urlOk=v=>/^\s*(https?:|mailto:|\/|#|data:image\/(png|jpe?g|gif|webp|svg\+xml);)/i.test(v||'');
const EMBED_RE=/^https:\/\/((www\.)?youtube-nocookie\.com\/embed\/|(www\.)?youtube\.com\/embed\/|player\.vimeo\.com\/video\/)/i;
const IFRAME_ATTR=new Set(['src','width','height','allow','allowfullscreen','frameborder','loading','title','class','referrerpolicy']);
function safeUrl(u){ u=(u||'').trim(); return urlOk(u)?u:null; }
function sanitize(html){
  const d=document.createElement('div'); d.innerHTML=html||'';
  d.querySelectorAll('*').forEach(node=>{
    const tag=(node.tagName||'').toUpperCase();
    if(DROP_TAGS.has(tag)){ node.remove(); return; }
    if(tag==='IFRAME'){ // yalnızca izinli video gömmeleri (YouTube/Vimeo)
      const src=node.getAttribute('src')||'';
      if(!EMBED_RE.test(src)){ node.remove(); return; }
      [...node.attributes].forEach(a=>{ if(!IFRAME_ATTR.has(a.name.toLowerCase()))node.removeAttribute(a.name); });
      node.setAttribute('allowfullscreen',''); node.setAttribute('loading','lazy');
      node.setAttribute('referrerpolicy','strict-origin-when-cross-origin'); // NC no-referrer'ı ez (YouTube Error 153 fix)
      return;
    }
    if(!SAFE_TAGS.has(tag)){ node.replaceWith(...node.childNodes); return; }
    [...node.attributes].forEach(at=>{
      const n=at.name.toLowerCase();
      if(n==='href'||n==='src'||n==='poster'){ if(!urlOk(at.value))node.removeAttribute(at.name); return; }
      if(!ALLOW_ATTR.has(n))node.removeAttribute(at.name);
    });
    if(tag==='A'){ node.setAttribute('target','_blank'); node.setAttribute('rel','noopener noreferrer'); }
  });
  return d.innerHTML;
}

/* -------- Medya: video gömme + görsel yükleme/küçültme -------- */
function videoEmbedHTML(u){
  u=(u||'').trim(); let m;
  if(m=u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/i))
    return `<iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" width="100%" height="360" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  if(m=u.match(/vimeo\.com\/(?:video\/)?(\d+)/i))
    return `<iframe src="https://player.vimeo.com/video/${m[1]}" width="100%" height="360" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  if(/^https?:\/\/.+\.(mp4|webm|ogg)(\?.*)?$/i.test(u))
    return `<video src="${esc(u)}" controls playsinline width="100%"></video>`;
  return null;
}
// Seçimi koru (dosya diyaloğu/prompt odağı kaybettirir) → sonra o noktaya ekle
let savedRange=null;
function saveSel(){ try{const s=window.getSelection();if(s&&s.rangeCount&&el('kx-body')&&el('kx-body').contains(s.anchorNode))savedRange=s.getRangeAt(0).cloneRange();else savedRange=null;}catch(e){savedRange=null;} }
function insertAtSaved(htmlStr,isMedia){
  const body=el('kx-body'); if(!body)return; body.focus();
  try{ if(savedRange){const s=window.getSelection();s.removeAllRanges();s.addRange(savedRange);} }catch(e){}
  // Medyada: hemen ardına boş bir paragraf da ekle ve imleci oraya taşı. Aksi halde
  // decorateEditMedia video'yu contenteditable=false sarmalayıcıyla değiştirirken
  // (replaceWith) seçim yok olur ve medya en sondaysa altına yazı yazılamaz.
  document.execCommand('insertHTML',false,isMedia?(htmlStr+'<p id="kx-caret-tmp"><br></p>'):htmlStr);
  savedRange=null;
  decorateEditMedia();
  const tmp=body.querySelector('#kx-caret-tmp');
  if(tmp){
    tmp.removeAttribute('id');
    try{
      const r=document.createRange(); r.setStart(tmp,0); r.collapse(true);
      const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
      body.focus();
    }catch(e){}
  }
  const f=findPage(curPage); if(f){ f.page.html=sanitize(serializeBody()); flushPage(); }
}
function pickImageFile(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/png,image/jpeg,image/gif,image/webp';
  inp.onchange=()=>{ const file=inp.files&&inp.files[0]; if(!file)return; if(file.size>15*1024*1024){toast(t('nextlibrary','Image is too large (over 15 MB)'));return;} downscaleImage(file,1400,dataUrl=>uploadImage(dataUrl)); };
  inp.click();
}
/* Şablon kartlarındaki görsel yer tutucusuna tıklanınca doldurulur: yükleme bitince
   görsel, imlecin bulunduğu yere DEĞİL yer tutucunun yerine girer. Tıklama ile yükleme
   arasında seçim kaybolduğu için yer tutucunun kendisini tutuyoruz. */
let activePlaceholder=null;
// Görseli sunucuya (NC appdata) yükle → dönen dosya adını /api/media/ URL'i olarak göm (base64 gömme yok)
function uploadImage(dataUrl){
  const f=findPage(curPage); const cid=f?f.coll.id:(curColl||'');
  if(!cid){ toast(t('nextlibrary','Open a collection or a page first')); activePlaceholder=null; return; }
  toast(t('nextlibrary','Uploading image …'));
  api('POST','/upload',{collectionId:cid,data:dataUrl})
    .then(r=>{ if(r&&r.name){
                 const url=API_BASE+'/media/'+encodeURIComponent(r.collectionId||cid)+'/'+encodeURIComponent(r.name);
                 // Yer tutucu hâlâ belgede duruyorsa onun yerine geç; kullanıcı bu arada
                 // sayfayı değiştirdiyse (düğüm koptuysa) normal imleç akışına dön.
                 const ph=activePlaceholder; activePlaceholder=null;
                 if(ph&&ph.parentNode&&ROOT.contains(ph)){
                   const img=document.createElement('img'); img.src=url; img.alt='';
                   ph.parentNode.replaceChild(img,ph);
                   const fp=findPage(curPage);
                   if(fp&&el('kx-body')){ fp.page.html=sanitize(serializeBody()); flushPage(); }
                 } else {
                   insertAtSaved(`<img src="${esc(url)}" alt="">`,true);
                 }
               }
               else { activePlaceholder=null; toast(t('nextlibrary','Could not upload the image')); } })
    .catch(e=>{ activePlaceholder=null; apiErr(e); });
}
function downscaleImage(file,maxW,cb){
  const rd=new FileReader();
  rd.onload=()=>{ const img=new Image(); img.onload=()=>{
      // Hem genişlik hem YÜKSEKLİK sınırlanır: eskiden yalnızca genişliğe bakılıyordu,
      // dolayısıyla dar ve çok uzun bir görsel (ör. 300x4000) neredeyse hiç küçülmüyordu.
      let w=img.width,h=img.height;
      if(w>maxW){ h=Math.round(h*maxW/w); w=maxW; }
      if(h>maxW){ w=Math.round(w*maxW/h); h=maxW; }
      w=Math.max(1,w); h=Math.max(1,h);
      try{ const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').drawImage(img,0,0,w,h);
        const mime=file.type==='image/png'?'image/png':'image/jpeg';
        cb(cv.toDataURL(mime, mime==='image/jpeg'?0.82:undefined));
      }catch(e){ cb(rd.result); } // fallback: orijinal
    }; img.onerror=()=>toast(t('nextlibrary','Could not read the image')); img.src=rd.result; };
  rd.onerror=()=>toast(t('nextlibrary','Could not read the file')); rd.readAsDataURL(file);
}
/* -------- Nextcloud dosyasını bağlantı olarak ekle --------
   Nextcloud'un kendi dosya seçicisini (OC.dialogs.filepicker) açar. Dosyanın İÇERİĞİ
   kopyalanmaz; sayfaya yalnızca bağlantı girer, yani dosya Files'ta güncellenince
   bağlantı da güncel kalır ve yetkisi olmayan kimse açamaz.

   Bağlantı biçimi: /index.php/f/<fileid> — fileid örnek genelindeki tekil kimliktir,
   her kullanıcı kendi görünümünde açar. Yol (path) tabanlı adres kullanılsaydı, dosyayı
   paylaşan başka bir kullanıcının yolu farklı olduğu için bağlantı onda kırılırdı. */
function pickNextcloudFile(){
  const dlg=(window.OC&&OC.dialogs&&typeof OC.dialogs.filepicker==='function')?OC.dialogs:null;
  if(!dlg){ toast(t('nextlibrary','The Nextcloud file picker is only available inside Nextcloud')); return; }
  try{
    const ret=dlg.filepicker(
      t('nextlibrary','Pick a file'),
      target=>{
        // Sürüme göre ya düz yol ya da nesne döner → ikisini de karşıla.
        const path=(typeof target==='string')?target:((target&&(target.path||target.filename))||'');
        if(!path)return;
        insertNcFileLink(path,target&&target.fileid);
      },
      false, [], true,
      dlg.FILEPICKER_TYPE_CHOOSE
    );
    // NC'nin yeni FilePicker'ı, diyalog dosya seçilmeden kapatılınca promise'i
    // "No nodes selected" ile reddediyor. Eski sarmalayıcı bunu yakalamadığı için
    // konsola yakalanmamış hata olarak düşüyordu → iptali sessizce yut.
    if(ret&&typeof ret.catch==='function'){ ret.catch(()=>{}); }
  }catch(err){ try{console.error('[NextLibrary filepicker]',err);}catch(_){} toast(t('nextlibrary','Could not open the file picker')); }
}
// Yoldan fileid'yi WebDAV PROPFIND ile çözer; çözemezse doğrudan WebDAV adresine düşer.
function insertNcFileLink(path,knownId){
  const name=String(path).split('/').filter(Boolean).pop()||path;
  const put=href=>{ insertAtSaved(`<a href="${esc(href)}" target="_blank" rel="noopener">📎 ${esc(name)}</a>`,true); toast(t('nextlibrary','File linked')); };
  if(knownId){ put(OC.generateUrl('/f/'+knownId)); return; }
  const uid=(window.OC&&OC.getCurrentUser&&OC.getCurrentUser())?OC.getCurrentUser().uid:'';
  const base=(window.OC&&OC.linkToRemoteBase)?OC.linkToRemoteBase('dav'):'/remote.php/dav';
  const davUrl=base+'/files/'+encodeURIComponent(uid)+String(path).split('/').map(encodeURIComponent).join('/');
  fetch(davUrl,{method:'PROPFIND',credentials:'same-origin',
    headers:{'Depth':'0','Content-Type':'application/xml','requesttoken':reqToken()},
    body:'<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>'})
    .then(r=>r.text())
    .then(xml=>{ const m=xml.match(/<[^>]*fileid[^>]*>(\d+)</i); put(m?OC.generateUrl('/f/'+m[1]):davUrl); })
    .catch(()=>put(davUrl));
}
function pickVideoFile(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='video/mp4,video/webm,video/ogg,video/quicktime';
  inp.onchange=()=>{ const file=inp.files&&inp.files[0]; if(!file)return; if(file.size>50*1024*1024){toast(t('nextlibrary','Video is too large (over 50 MB)'));return;} uploadVideoFile(file); };
  inp.click();
}
function uploadVideoFile(file){
  const f=findPage(curPage); const cid=f?f.coll.id:(curColl||'');
  if(!cid){ toast(t('nextlibrary','Open a collection or a page first')); return; }
  toast(t('nextlibrary','Uploading video …'));
  const fd = new FormData();
  fd.append('collectionId', cid);
  fd.append('file', file);
  fetch(API_BASE+'/upload',{
    method: 'POST',
    headers: { 'requesttoken': reqToken() },
    credentials: 'same-origin',
    body: fd
  })
  .then(r => {
    if(!r.ok) return r.text().then(t=>{throw new Error(t || t('nextlibrary','Upload failed'));});
    return r.json();
  })
  .then(r => {
    if(r&&r.name){
      const url=API_BASE+'/media/'+encodeURIComponent(r.collectionId||cid)+'/'+encodeURIComponent(r.name);
      insertAtSaved(`<video src="${esc(url)}" controls playsinline width="100%"></video>`,true);
      toast(t('nextlibrary','Video uploaded'));
    } else {
      toast(t('nextlibrary','Could not upload the video'));
    }
  })
  .catch(e => {
    console.error(e);
    toast(t('nextlibrary','Could not upload the video'));
  });
}
/* Editöre sürükle-bırak ile görsel/video ekleme. Tarayıcının varsayılan davranışı
   (dosyayı sekmede açmak ya da ham base64 gömmek) engellenir; dosya seçicideki
   aynı yollara (downscale+uploadImage / uploadVideoFile) yönlendirilir. */
const DROP_IMG=/^image\/(png|jpeg|gif|webp)$/i;
const DROP_VID=/^video\/(mp4|webm|ogg|quicktime)$/i;
function wireDropZone(body){
  if(!body||body.dataset.dropWired)return;
  body.dataset.dropWired='1';
  const stop=e=>{ e.preventDefault(); e.stopPropagation(); };
  ['dragenter','dragover'].forEach(ev=>body.addEventListener(ev,e=>{
    if(!editing||!e.dataTransfer||!Array.from(e.dataTransfer.types||[]).includes('Files'))return;
    stop(e); e.dataTransfer.dropEffect='copy'; body.classList.add('drop-hot');
  }));
  ['dragleave','dragend'].forEach(ev=>body.addEventListener(ev,()=>body.classList.remove('drop-hot')));
  body.addEventListener('drop',e=>{
    if(!editing)return;
    const file=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];
    if(!file)return;
    stop(e); body.classList.remove('drop-hot');
    // Bırakılan noktayı ekleme hedefi yap (insertAtSaved savedRange'i kullanır).
    try{
      const r=document.caretRangeFromPoint?document.caretRangeFromPoint(e.clientX,e.clientY):null;
      if(r){ const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    }catch(_){}
    saveSel();
    if(DROP_IMG.test(file.type)){
      if(file.size>15*1024*1024){ toast(t('nextlibrary','Image is too large (over 15 MB)')); return; }
      downscaleImage(file,1400,d=>uploadImage(d)); // uploadImage kendi "yükleniyor" toast'ını basar
    } else if(DROP_VID.test(file.type)){
      if(file.size>50*1024*1024){ toast(t('nextlibrary','Video is too large (over 50 MB)')); return; }
      uploadVideoFile(file);
    } else {
      toast(t('nextlibrary','Unsupported file type'));
    }
  });
}
// Editörde medyayı silinebilir yap: iframe/video'yu ✕ butonlu, tek-parça (contenteditable=false) bloğa sar
function decorateEditMedia(){
  const body=el('kx-body'); if(!body)return;
  body.querySelectorAll('iframe,video').forEach(m=>{
    if(m.parentElement&&m.parentElement.classList.contains('media-wrap'))return;
    const w=document.createElement('span'); w.className='media-wrap'; w.setAttribute('contenteditable','false');
    m.replaceWith(w); w.appendChild(m);
    const del=document.createElement('button'); del.type='button'; del.className='media-del'; del.textContent='✕ Sil';
    del.onclick=()=>{ w.remove(); body.focus(); const f=findPage(curPage); if(f){ f.page.html=sanitize(serializeBody()); flushPage(); } toast('Medya silindi'); };
    w.appendChild(del);
  });
  ensureTrailingParagraph(body);
}
/* Video/gömme en sonda kalırsa altına yazı yazılamaz: media-wrap contenteditable=false
   olduğu için ardında imleç konulabilecek bir düğüm kalmaz. Gövdenin sonunda daima
   boş bir paragraf tut. Idempotent: son eleman zaten paragrafsa tekrar eklemez. */
function ensureTrailingParagraph(body){
  if(!body)return;
  const last=body.lastElementChild;
  let needs=false;
  if(!last){
    needs=true;
  } else if(last.classList&&last.classList.contains('media-wrap')){
    needs=true;                       // medya doğrudan gövdenin son çocuğu
  } else if(last.querySelector&&last.querySelector('.media-wrap')){
    // medya bir bloğun (ör. <p>) içinde ve o blokta medya dışında içerik yok
    const probe=last.cloneNode(true);
    probe.querySelectorAll('.media-wrap').forEach(w=>w.remove());
    needs=!probe.textContent.trim();
  }
  if(needs){
    const p=document.createElement('p');
    p.appendChild(document.createElement('br'));
    body.appendChild(p);
  }
}
// Kaydederken sarmalayıcı/sil butonlarını temizle (depoya sade HTML gitsin)
function serializeBody(){
  const body=el('kx-body'); if(!body)return'';
  const clone=body.cloneNode(true);
  clone.querySelectorAll('.media-del').forEach(b=>b.remove());
  clone.querySelectorAll('.media-wrap').forEach(w=>{ const m=w.querySelector('iframe,video'); if(m)w.replaceWith(m); else w.remove(); });
  return clone.innerHTML;
}

/* -------- Bağlam menüsü (⋯) -------- */
function openMenu(anchor,items){
  const m=el('ctxMenu'); if(!m)return; m.innerHTML='';
  items.forEach(it=>{
    if(it.sep){const s=document.createElement('div');s.className='ctx-sep';m.appendChild(s);return;}
    const b=document.createElement('button'); b.className='ctx-item'+(it.danger?' danger':'');
    b.innerHTML=`<span class="ci">${it.icon||''}</span>${esc(it.label)}`;
    b.onclick=()=>{ m.classList.remove('show'); it.fn(); };
    m.appendChild(b);
  });
  const r=anchor.getBoundingClientRect();
  m.style.left=Math.min(r.left,innerWidth-210)+'px';
  m.style.top=(r.bottom+4)+'px';
  m.classList.add('show');
}

/* -------- Sol ağaç -------- */
function renderTree(q=''){
  const box=el('tree');box.innerHTML='';
  colls.forEach(c=>{
    // Bir koleksiyonun içine girmek diğerlerini ağaçtan GİZLEMEZ. Eskiden gizliyordu:
    // yeni koleksiyon oluşturunca ilk sayfası açılıyor (openPage → curColl) ve kenar
    // çubuğunda yalnızca o kalıyordu → kullanıcı "eski koleksiyonlarım silindi" sanıyordu.
    // Artık hepsi listede durur; yalnızca açık olan genişletilir (openColls).
    const open=openColls.has(c.id);
    const wrap=document.createElement('div');wrap.className='coll'+(open?' open':'');
    const ce=canEdit(c);
    const ql=q?q.toLowerCase():'';
    // Aramada hiyerarşi bozulmasın: eşleşen kartın ATALARI da çizilir, yoksa çocuk
    // görünüp üstü kaybolur ve ağaç anlamsızlaşır.
    let visible=null;
    if(ql){
      visible=new Set();
      c.pages.forEach(p=>{
        if((p.title||'').toLowerCase().includes(ql)) pathOf(c,p).forEach(a=>visible.add(a.id));
      });
    }
    // Çocuk listesi tek geçişte indekslenir: her seviyede tüm diziyi süzmek
    // (childrenOf) büyük koleksiyonda kareli maliyet çıkarıyordu.
    const kidsMap={};
    c.pages.forEach(p=>{ const k=p.parentId||'0'; (kidsMap[k]=kidsMap[k]||[]).push(p); });
    Object.values(kidsMap).forEach(list=>list.sort((a,b)=>(a.sort||0)-(b.sort||0)||String(a.id).localeCompare(String(b.id))));
    // Bir seviyeyi çiz; çocukları varsa özyinelemeli olarak altına ekle.
    const renderLevel=(parentId,depth)=>(kidsMap[String(parentId)]||[]).map(p=>{
      if(visible&&!visible.has(p.id))return '';
      const kids=!!(kidsMap[p.id]&&kidsMap[p.id].length);
      const kidsOpen=openPages.has(p.id)||!!ql;   // arama sırasında yol açık gösterilir
      // KAPALI dal hiç çizilmez. Eskiden tüm ağaç DOM'a basılıp CSS ile gizleniyordu:
      // 780 kartlık koleksiyonda her tıkta 784 satır yeniden üretiliyordu.
      const inner=(kids&&kidsOpen)?renderLevel(p.id,depth+1):'';
      return `<div class="node ${kids?(kidsOpen?'open':'closed'):''}">
        <div class="node-row ${p.id===curPage?'active':''}" data-p="${p.id}" style="padding-left:${10+depth*14}px">
          ${kids?`<span class="ncaret" data-toggle="${p.id}">▶</span>`:'<span class="ncaret ncaret-empty"></span>'}
          <span class="nem">${iconHTML(p,c.id,16)}</span><span class="nname">${esc(p.title||t('nextlibrary','Untitled'))}</span>
          ${reads[p.id]?`<span class="nread" title="En son okundu: ${readFull(reads[p.id])}">✓ ${timeAgo(reads[p.id])}</span>`:''}
          ${ce?`<span class="act"><button data-pa="add" data-pid="${p.id}" title="${esc(t('nextlibrary','Add a page or a section inside'))}">＋</button><button data-pa="menu" data-pid="${p.id}" title="Eylemler">⋯</button></span>`:''}
        </div>
        ${(kids&&kidsOpen)?`<div class="subpages">${inner}</div>`:''}
      </div>`;
    }).join('');
    const rp=readablePages(c);
    const total=rp.length, readN=rp.filter(p=>reads[p.id]).length, unread=total-readN, pct=total?Math.round(readN/total*100):0;
    wrap.innerHTML=`<div class="coll-row ${c.id===curColl?'active':''}" data-c="${c.id}">
        <span class="caret">▶</span><span class="cem">${iconHTML(c,c.id,18)}</span><span class="cname">${esc(c.name)}</span>
        ${c.visibility==='private'?`<span class="cvis" title="${esc(t('nextlibrary','Private — only members can see it'))}">🔒</span>`:''}
        ${unread>0?`<span class="unread" title="${n('nextlibrary','%n unread page','%n unread pages',unread)}">${unread}</span>`:''}
        ${ce?`<span class="act"><button data-ca="add" title="${esc(t('nextlibrary','Add a page or a section'))}">＋</button><button data-ca="menu" title="Eylemler">⋯</button></span>`:''}
      </div>
      ${total?`<div class="coll-prog" title="${readN}/${total} okundu (%${pct})"><span style="width:${pct}%"></span></div>`:''}
      <div class="pages">${renderLevel('0',0)||'<div class="pg-empty">Sayfa yok</div>'}</div>`;
    box.appendChild(wrap);
  });
  box.querySelectorAll('.coll-row').forEach(r=>r.onclick=e=>{
    const cid=r.dataset.c;
    const a=e.target.closest('[data-ca]');
    if(a){
      if(a.dataset.ca==='add'){ curColl=cid; openColls.add(cid); addMenu(a,'0'); }
      else collActions(getColl(cid),a);
      return;
    }
    openCollection(cid); // aç/kapa mantığı openCollection içinde (çift toggle önlendi)
  });
  box.querySelectorAll('.node-row').forEach(r=>r.onclick=e=>{
    // Ok: yalnızca aç/kapa (kartı açmadan alt kartlarına bakabilmek için)
    const tg=e.target.closest('[data-toggle]');
    if(tg){ const id=tg.dataset.toggle; openPages.has(id)?openPages.delete(id):openPages.add(id); persistState(); renderTree(el('kx-search').value); return; }
    const a=e.target.closest('[data-pa]');
    if(a){
      if(a.dataset.pa==='add'){ openPages.add(a.dataset.pid); addMenu(a,a.dataset.pid); }
      else pageActions(a.dataset.pid,a);
      return;
    }
    openPage(r.dataset.p);
  });
  const mayWrite=canCreate&&!previewAsVisitor;
  el('newCollBtn').style.display=mayWrite?'flex':'none';
  el('trashBtn').style.display=mayWrite?'flex':'none';
}
async function openTrashBin() {
  curColl = null;
  curPage = null;
  persistState();
  updateBackBtnVisibility();
  const v = viewer();
  if(!v)return;
  v.innerHTML = `
    <div class="home">
      <div class="home-hero">
        <h1>🗑️ ${esc(t('nextlibrary','Trash bin'))}</h1>
        <p>${esc(t('nextlibrary','Deleted collections and pages are listed here. You can restore them or delete them for good.'))}</p>
      </div>
      <div class="rail-empty" style="padding: 24px 0;" id="trashLoading">${esc(t('nextlibrary','Loading …'))}</div>
      <div id="trashContent" style="display: none; padding: 0 16px;">
        <div class="trash-bar">
          <label class="trash-pick"><input type="checkbox" id="trashAll"><span></span></label>
          <span id="trashCount" class="trash-count">${esc(t('nextlibrary','Select all'))}</span>
          <span style="flex:1"></span>
          <button class="btn btn-danger btn-sm" id="trashPurgeSel" disabled title="${esc(t('nextlibrary','Delete permanently — cannot be undone'))}">${esc(t('nextlibrary','Delete selected'))}</button>
        </div>
        <h2 style="font-size: 16px; margin: 20px 0 10px; color: var(--ink);">Koleksiyonlar</h2>
        <div class="home-grid" id="trashColls" style="grid-template-columns: 1fr; gap: 10px; display: flex; flex-direction: column;"></div>
        <h2 style="font-size: 16px; margin: 30px 0 10px; color: var(--ink);">Sayfalar</h2>
        <div class="home-grid" id="trashPages" style="grid-template-columns: 1fr; gap: 10px; display: flex; flex-direction: column;"></div>
      </div>
    </div>
  `;
  try {
    const trashData = await api('GET', '/trash');
    el('trashLoading').style.display = 'none';
    const content = el('trashContent');
    content.style.display = 'block';
    const tc = el('trashColls');
    const tp = el('trashPages');
    // Satır: seçim kutusu + simge + ad + tarih + tekil eylemler
    const trashRow=(kind,id,icon,title,sub)=>`
      <div class="trash-row" data-kind="${kind}" data-id="${id}">
        <label class="trash-pick"><input type="checkbox" class="trash-cb" data-kind="${kind}" data-id="${id}"><span></span></label>
        <span class="trash-ico">${icon}</span>
        <div style="flex:1;min-width:0">
          <div class="trash-name">${esc(title)}</div>
          <div class="trash-sub">${sub}</div>
        </div>
        <div style="display:flex;gap:8px;flex:none">
          <button class="btn btn-ghost btn-sm" data-restore-${kind}="${id}">${esc(t('nextlibrary','Restore'))}</button>
          <button class="btn btn-danger btn-sm" data-purge-${kind}="${id}" title="${esc(t('nextlibrary','Delete permanently — cannot be undone'))}">${esc(t('nextlibrary','Delete'))}</button>
        </div>
      </div>`;

    tc.innerHTML = (trashData.collections || []).map(c =>
      trashRow('coll', c.id, iconHTML(c, c.id, 22), c.name,
        esc(t('nextlibrary','Owner: {name}',{name:userName(c.owner)}))+' · '+esc(t('nextlibrary','Deleted: {when}',{when:new Date(c.deletedAt).toLocaleDateString(LOCALE)})))
    ).join('') || '<div class="rail-empty">'+esc(t('nextlibrary','No deleted collections.'))+'</div>';

    tp.innerHTML = (trashData.pages || []).map(p =>
      trashRow('page', p.id, iconHTML(p, p.collectionId, 22), p.title || t('nextlibrary','Untitled'),
        esc(t('nextlibrary','Deleted: {when}',{when:new Date(p.deletedAt).toLocaleDateString(LOCALE)})))
    ).join('') || '<div class="rail-empty">'+esc(t('nextlibrary','No deleted pages.'))+'</div>';

    // NC'nin CSP'si (nonce + strict-dynamic) inline onclick="" attribute'larını bloklar →
    // butonlar sessizce ölüydü. Kod tabanının geri kalanı gibi gerçek handler bağlıyoruz.
    content.querySelectorAll('[data-restore-coll]').forEach(b => b.onclick = () => kxRestoreCollection(b.dataset.restoreColl));
    content.querySelectorAll('[data-purge-coll]').forEach(b => b.onclick = () => kxPurgeCollection(b.dataset.purgeColl));
    content.querySelectorAll('[data-restore-page]').forEach(b => b.onclick = () => kxRestorePage(b.dataset.restorePage));
    content.querySelectorAll('[data-purge-page]').forEach(b => b.onclick = () => kxPurgePage(b.dataset.purgePage));
    wireTrashSelection();
  } catch (e) {
    apiErr(e);
  }
}
/* Çöp kutusunda toplu seçim: satır kutuları + "tümünü seç" + "seçilenleri kalıcı sil".
   Tek tek silmek 20 kalemde işkenceydi. Silme geri alınamaz, o yüzden tek onay ekranında
   kaç kalemin gideceği yazılır. */
function wireTrashSelection(){
  const boxes=()=>[...ROOT.querySelectorAll('.trash-cb')];
  const all=el('trashAll'), btn=el('trashPurgeSel'), lbl=el('trashCount');
  if(!btn)return;
  const refresh=()=>{
    const sel=boxes().filter(b=>b.checked);
    btn.disabled=!sel.length;
    if(lbl)lbl.textContent=sel.length
      ? n('nextlibrary','%n item selected','%n items selected',sel.length)
      : t('nextlibrary','Select all');
    if(all){ all.checked=sel.length>0&&sel.length===boxes().length; all.indeterminate=sel.length>0&&sel.length<boxes().length; }
    ROOT.querySelectorAll('.trash-row').forEach(r=>{
      const cb=r.querySelector('.trash-cb'); r.classList.toggle('sel',!!(cb&&cb.checked));
    });
  };
  boxes().forEach(b=>b.onchange=refresh);
  if(all)all.onchange=()=>{ boxes().forEach(b=>b.checked=all.checked); refresh(); };
  btn.onclick=async()=>{
    const sel=boxes().filter(b=>b.checked);
    if(!sel.length)return;
    if(!confirm(n('nextlibrary','Permanently delete %n selected item? This cannot be undone.','Permanently delete %n selected items? This cannot be undone.',sel.length)))return;
    btn.disabled=true;
    let ok=0,fail=0;
    for(const b of sel){
      const path=b.dataset.kind==='coll'?'/collections/'+b.dataset.id+'/purge':'/pages/'+b.dataset.id+'/purge';
      try{ await api('DELETE',path); ok++; }catch(e){ fail++; try{console.error('[NextLibrary purge]',e);}catch(_){} }
    }
    toast(fail
      ? t('nextlibrary','{ok} deleted, {fail} failed',{ok:ok,fail:fail})
      : n('nextlibrary','%n item permanently deleted','%n items permanently deleted',ok));
    await loadState(true);
    renderTree(el('kx-search').value);
    openTrashBin();
  };
  refresh();
}
async function kxRestoreCollection(id) {
  if (!confirm(t('nextlibrary','Restore this collection and the deleted pages inside it?'))) return;
  try {
    await api('POST', '/collections/' + id + '/restore');
    toast(t('nextlibrary','Collection restored'));
    await loadState(true);
    openTrashBin();
    renderTree();
  } catch (e) { apiErr(e); }
}
async function kxPurgeCollection(id) {
  if (!confirm(t('nextlibrary','Permanently delete this collection with all of its pages and media? This cannot be undone.'))) return;
  try {
    await api('DELETE', '/collections/' + id + '/purge');
    toast(t('nextlibrary','Collection permanently deleted'));
    openTrashBin();
  } catch (e) { apiErr(e); }
}
async function kxRestorePage(id) {
  try {
    await api('POST', '/pages/' + id + '/restore');
    toast(t('nextlibrary','Page restored'));
    await loadState(true);
    openTrashBin();
    renderTree();
  } catch (e) { apiErr(e); }
}
async function kxPurgePage(id) {
  if (!confirm(t('nextlibrary','Permanently delete this page? This cannot be undone.'))) return;
  try {
    await api('DELETE', '/pages/' + id + '/purge');
    toast(t('nextlibrary','Page permanently deleted'));
    openTrashBin();
  } catch (e) { apiErr(e); }
}
function updateTreeTimes(){
  ROOT.querySelectorAll('.node-row[data-p]').forEach(nr=>{const pid=nr.dataset.p;const nre=nr.querySelector('.nread');if(nre&&reads[pid])nre.textContent='✓ '+timeAgo(reads[pid]);});
}

/* -------- Orta: okuma / editör -------- */
function openPage(id,edit=false){
  const f=findPage(id); if(!f)return;
  // Okundu otomatik işaretlenmez; kullanıcı "Okundu olarak işaretle" ile bilinçli tamamlar.
  curColl=f.coll.id; curPage=id; editing=edit;
  openColls.clear(); openColls.add(f.coll.id);
  // Derinde bir kart açıldıysa ağaçta görünür olması için atalarını genişlet
  pathOf(f.coll,f.page).slice(0,-1).forEach(a=>openPages.add(a.id));
  ROOT.classList.remove('nav-open'); persistState(); renderTree(el('kx-search').value); renderViewer(); renderRecs(); el('stage').scrollTo({top:0,behavior:'smooth'});
  updateBackBtnVisibility();
}
function goHome(){
  curPage=null; curColl=null; editing=false;
  openColls.clear();
  persistState(); renderTree(el('kx-search').value); renderViewer(); renderRecs(); el('stage').scrollTo({top:0,behavior:'smooth'});
  updateBackBtnVisibility();
}
// Koleksiyonun köküne git (aç/kapa YOK — yol satırından "en başa dön" için).
function openCollectionRoot(cId){
  const c=getColl(cId); if(!c)return;
  curColl=cId; curPage=null; editing=false; openColls.add(cId);
  persistState(); renderTree(el('kx-search').value); renderViewer(); renderRecs();
  el('stage').scrollTo({top:0,behavior:'smooth'}); updateBackBtnVisibility();
}
function openCollection(cId){
  const c=getColl(cId); if(!c)return;
  curColl=cId; curPage=null; editing=false;
  if(openColls.has(cId)){
    openColls.delete(cId);
  }else{
    openColls.clear();
    openColls.add(cId);
  }
  ROOT.classList.remove('nav-open'); persistState(); renderTree(el('kx-search').value); renderViewer(); renderRecs(); el('stage').scrollTo({top:0,behavior:'smooth'});
  updateBackBtnVisibility();
}
function goBack(){
  goHome();
}
function updateBackBtnVisibility(){
  const btn=el('backBtn');
  if(btn){
    btn.style.display=curColl!=null?'inline-flex':'none';
  }
}

function breadcrumbHTML(){
  const f=findPage(curPage); if(!f)return'';
  // İç içe kartlarda tam yol gösterilir: Bilgi Kartları › Koleksiyon › üst kart › … › kart
  const path=pathOf(f.coll,f.page);
  const mid=path.slice(0,-1).map(a=>
    `<span class="crumb" data-p="${a.id}">${iconHTML(a,f.coll.id,14)} ${esc(a.title||t('nextlibrary','Untitled'))}</span><span class="sep">›</span>`).join('');
  return `<div class="breadcrumbs">
    <span class="crumb" data-home>${esc(t('nextlibrary','Knowledge Cards'))}</span><span class="sep">›</span>
    <span class="crumb" data-c="${f.coll.id}">${esc(f.coll.name)}</span><span class="sep">›</span>
    ${mid}<span class="crumb current">${esc(f.page.title||t('nextlibrary','Untitled'))}</span></div>`;
}

/**
 * Okuma kanvasının kabı. #viewer şablonda hazır gelir; bazı kurulumlarda çalışma
 * anında DOM'dan kayboluyor (sebep tespit edilemedi — sayfa/eklenti kaynaklı) ve o
 * andan sonra HER render "null.innerHTML" ile patlıyordu: yeni sayfa oluşturulunca
 * ekrana hiçbir şey gelmiyor, üstelik hata promise zincirine düşüp "sunucuya
 * kaydedilemedi" toast'ı basılıyordu. Yoksa yeniden kurar → arayüz kendini onarır.
 */
function viewer(){
  let v=el('viewer');
  if(!v){
    const stage=el('stage');
    if(!stage)return null;
    v=document.createElement('div');
    v.id='viewer';
    stage.appendChild(v);
    try{console.warn('[NextLibrary] #viewer DOM\'dan kaybolmuştu, yeniden oluşturuldu');}catch(_){}
  }
  return v;
}
const stripHtml=h=>{const d=document.createElement('div');d.innerHTML=h||'';return d.textContent||'';};
function readingTime(html){ const n=stripHtml(html).trim().split(/\s+/).filter(Boolean).length; return Math.max(1,Math.round(n/200)); }

function readCtlHTML(p){
  return reads[p.id]
    ? `<button class="read-chip done" id="readBtn" title="${esc(t('nextlibrary','Mark as read again'))}">✔ ${esc(t('nextlibrary','Last read: {when}',{when:timeAgo(reads[p.id])}))}</button><button class="read-clear" id="readClear" title="${esc(t('nextlibrary','Remove read mark'))}">✕</button>`
    : `<button class="read-chip" id="readBtn">◯ ${esc(t('nextlibrary','Mark as read'))}</button>`;
}
function wireReadCtl(p){
  const rb=el('readBtn'); if(rb)rb.onclick=()=>{ markRead(p.id); renderTree(el('kx-search').value); renderReadCtl(p); toast(t('nextlibrary','Marked as read')); };
  const rc=el('readClear'); if(rc)rc.onclick=()=>{ clearRead(p.id); renderTree(el('kx-search').value); renderReadCtl(p); toast(t('nextlibrary','Read mark removed')); };
}
function renderReadCtl(p){ const c=el('readCtl'); if(c){ c.innerHTML=readCtlHTML(p); wireReadCtl(p); } }
function renderCollectionHome(v,c){
  const rp=readablePages(c);
  const total=rp.length;
  const readN=rp.filter(p=>reads[p.id]).length;
  const pct=total?Math.round(readN/total*100):0;
  v.innerHTML=`<div class="breadcrumbs">
      <span class="crumb" data-home>${esc(t('nextlibrary','Knowledge Cards'))}</span><span class="sep">›</span>
      <span class="crumb current">${iconHTML(c,c.id,14)} ${esc(c.name)}</span>
    </div>
    <div class="home">
      <div class="home-hero" style="display:flex;align-items:center;gap:16px;padding:20px 0 26px;">
        <span style="font-size:38px;background:var(--brand-soft);color:var(--brand-ink);width:64px;height:64px;border-radius:16px;display:grid;place-items:center;flex:none">${iconHTML(c,c.id,44)}</span>
        <div style="flex:1;min-width:0">
          <h1 style="font-size:28px;font-weight:800;letter-spacing:-.5px;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</h1>
          <p style="color:var(--ink-soft);font-size:14px">${total} sayfa · ${readN}/${total} okundu (%${pct})</p>
        </div>
      </div>
      <div class="home-grid">
        ${(()=>{const counts=subtreeCounts(c);return childrenOf(c,'0').map(p=>{
          const isRead=!!reads[p.id];
          const kids=counts[p.id]||0;
          const snippet=stripHtml(p.html).slice(0,100);
          return `<button class="home-card" data-hpage="${p.id}" style="text-align:left;height:100%;display:flex;flex-direction:column;gap:8px">
            <span class="hc-em" style="width:36px;height:36px;font-size:18px;border-radius:9px;background:var(--brand-soft);display:grid;place-items:center">${iconHTML(p,c.id,24)}</span>
            <span class="hc-name" style="font-size:14px;font-weight:700;color:var(--ink);margin-top:2px">${esc(p.title||t('nextlibrary','Untitled'))}</span>
            <span class="hc-meta" style="font-size:12px;color:var(--ink-soft);flex:1;line-height:1.4">${p.kind==='folder'?'':esc(snippet)+(snippet.length>=100?'...':'')}</span>
            <span style="font-size:11px;font-weight:700;color:${isRead?'var(--brand)':'var(--ink-faint)'};display:flex;align-items:center;gap:4px;margin-top:auto">
              ${p.kind==='folder'?'':(isRead?'✓ '+esc(t('nextlibrary','Read')):'◯ '+esc(t('nextlibrary','Unread')))}
              ${kids?`<span class="hc-kids" title="${esc(n('nextlibrary','%n card inside','%n cards inside',kids))}">· ${kids} ↳</span>`:''}
            </span>
          </button>`;
        }).join('')})()||'<div class="rail-empty">'+esc(t('nextlibrary','No pages in this collection yet.'))+'</div>'}
      </div>
    </div>`;
  v.querySelectorAll('[data-hpage]').forEach(b=>{b.onclick=()=>openPage(b.dataset.hpage);});
  v.querySelectorAll('.crumb').forEach(cr=>{cr.onclick=()=>{if('home' in cr.dataset)goHome();};});
}

// Bölüm (folder): yazı tutmaz, yalnızca alt kartlarını gösterir. Koleksiyon kapak
// ekranının aynısı, bir seviye altta — düzenleyici, okuma süresi, okundu düğmesi yok.
function renderSectionHome(v,f){
  const c=f.coll,p=f.page;
  const kids=childrenOf(c,p.id);
  const ce=canEdit(c);
  const readableKids=kids.filter(k=>k.kind!=='folder');
  const readN=readableKids.filter(k=>reads[k.id]).length;
  v.innerHTML=`${breadcrumbHTML()}
    <div class="home">
      <div class="home-hero" style="display:flex;align-items:center;gap:16px;padding:20px 0 26px;">
        <button id="secEmoji" style="font-size:38px;background:var(--brand-soft);color:var(--brand-ink);width:64px;height:64px;border-radius:16px;display:grid;place-items:center;flex:none;border:none;cursor:${ce?'pointer':'default'}">${iconHTML(p,c.id,44)}</button>
        <div style="flex:1;min-width:0">
          <h1 style="font-size:28px;font-weight:800;letter-spacing:-.5px;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title||t('nextlibrary','Untitled'))}</h1>
          <p style="color:var(--ink-soft);font-size:14px">📁 ${esc(t('nextlibrary','Section'))} · ${n('nextlibrary','%n card inside','%n cards inside',kids.length)}${readableKids.length?` · ${readN}/${readableKids.length} ${esc(t('nextlibrary','read'))}`:''}</p>
        </div>
        ${ce?`<button class="btn btn-ghost" id="secRename">✏️ ${esc(t('nextlibrary','Rename'))}</button>`:''}
      </div>
      <div class="home-grid">
        ${(()=>{const counts=subtreeCounts(c);return kids.map(k=>{
          const isRead=!!reads[k.id];
          const deeper=counts[k.id]||0;
          const snippet=k.kind==='folder'?'':stripHtml(k.html).slice(0,100);
          return `<button class="home-card" data-hpage="${k.id}" style="text-align:left;height:100%;display:flex;flex-direction:column;gap:8px">
            <span class="hc-em" style="width:36px;height:36px;font-size:18px;border-radius:9px;background:var(--brand-soft);display:grid;place-items:center">${iconHTML(k,c.id,24)}</span>
            <span class="hc-name" style="font-size:14px;font-weight:700;color:var(--ink);margin-top:2px">${esc(k.title||t('nextlibrary','Untitled'))}</span>
            <span class="hc-meta" style="font-size:12px;color:var(--ink-soft);flex:1;line-height:1.4">${k.kind==='folder'?'':esc(snippet)+(snippet.length>=100?'...':'')}</span>
            <span style="font-size:11px;font-weight:700;color:${isRead?'var(--brand)':'var(--ink-faint)'};display:flex;align-items:center;gap:4px;margin-top:auto">
              ${k.kind==='folder'?'':(isRead?'✓ '+esc(t('nextlibrary','Read')):'◯ '+esc(t('nextlibrary','Unread')))}
              ${deeper?`<span class="hc-kids">· ${deeper} ↳</span>`:''}
            </span>
          </button>`;
        }).join('')})()||'<div class="rail-empty">'+esc(t('nextlibrary','This section is empty yet.'))+'</div>'}
      </div>
      ${ce?`<div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-ghost" id="addChildBtn">＋ ${esc(t('nextlibrary','Page'))}</button>
        <button class="btn btn-ghost" id="addChildSecBtn">＋ ${esc(t('nextlibrary','Section'))}</button>
      </div>`:''}
    </div>`;
  v.querySelectorAll('[data-hpage]').forEach(b=>b.onclick=()=>openPage(b.dataset.hpage));
  v.querySelectorAll('.crumb').forEach(cr=>cr.onclick=()=>{
    if('home' in cr.dataset)goHome();
    else if(cr.dataset.c)openCollection(cr.dataset.c);
    else if(cr.dataset.p)openPage(cr.dataset.p);
  });
  const ab=el('addChildBtn'); if(ab)ab.onclick=()=>{ openPages.add(p.id); addPage(p.id,'page'); };
  const sb=el('addChildSecBtn'); if(sb)sb.onclick=()=>{ openPages.add(p.id); addPage(p.id,'folder'); };
  const em=el('secEmoji'); if(em&&ce)em.onclick=()=>openEmoji(em,(e,x)=>{
    if(x){ p.icon=x.icon; pushPage(p.id,{icon:x.icon}); }
    else { p.emoji=e; p.icon=''; pushPage(p.id,{emoji:e,icon:''}); }
    renderTree(el('kx-search').value); renderViewer();
  },{collectionId:c.id,hasIcon:!!p.icon});
  const rn=el('secRename'); if(rn)rn.onclick=()=>{ const nv=prompt(t('nextlibrary','New page name:'),p.title||''); if(nv&&nv.trim()){p.title=nv.trim();pushPage(p.id,{title:p.title});renderTree(el('kx-search').value);renderViewer();} };
}

function renderViewer(){
  const f=findPage(curPage);
  const v=viewer();
  if(!v)return;
  if(f&&f.page.kind==='folder'){ renderSectionHome(v,f); return; }   // renderRecs'i çağıranlar zaten çağırıyor
  if(!f){
    if(curColl){
      const c=getColl(curColl);
      if(c){
        renderCollectionHome(v,c);
        return;
      }
    }
    renderHome(v);
    return;
  }
  const p=f.page;
  const edit=canEdit(f.coll); if(!edit)editing=false;
  const initial=(userName(f.coll.owner)||'?').trim()[0]?.toUpperCase()||'?';
  v.innerHTML=`${breadcrumbHTML()}
   <div class="canvas"><div class="doc">
     <div class="doc-top">
       <button class="doc-emoji" id="docEmoji">${iconHTML(p,f.coll.id,30)}</button>
       <input class="doc-title" id="docTitle" value="${esc(p.title)}" placeholder="${esc(t('nextlibrary','Untitled'))}" ${editing?'':'readonly'}>
       ${edit?`<button class="btn btn-primary" id="editToggle">${editing?'✔ '+esc(t('nextlibrary','Done')):'🖊 '+esc(t('nextlibrary','Edit'))}</button>`:''}
     </div>
     <div class="doc-meta"><span class="av">${esc(initial)}</span> ${esc(userName(f.coll.owner))} · ${esc(f.coll.name)}
       <span class="rt-chip" title="${esc(t('nextlibrary','Estimated reading time'))}">⏱ ${esc(n('nextlibrary','~%n min','~%n min',readingTime(p.html)))}</span>
       ${edit?'':'<span class="ro-chip">🔒 Salt okunur</span>'}
       <span class="rd-spacer"></span>
       <span class="read-ctl" id="readCtl">${readCtlHTML(p)}</span>
     </div>
     <div class="toolbar" id="toolbar" style="display:${editing?'flex':'none'}">
       <button class="tbtn" data-cmd="undo" title="Geri al (Ctrl+Z)">↶</button>
       <button class="tbtn" data-cmd="redo" title="Yinele (Ctrl+Shift+Z)">↷</button><span class="tsep"></span>
       <button class="tbtn tbtn-wide" data-cmd="block" title="Paragraf stili"><span id="blockLabel">Normal</span><span class="tcar">▾</span></button><span class="tsep"></span>
       <button class="tbtn" data-cmd="bold" title="${esc(t('nextlibrary','Bold (Ctrl+B)'))}"><b>B</b></button>
       <button class="tbtn" data-cmd="italic" title="${esc(t('nextlibrary','Italic (Ctrl+I)'))}"><b><i>I</i></b></button>
       <button class="tbtn" data-cmd="underline" title="${esc(t('nextlibrary','Underline (Ctrl+U)'))}"><u>U</u></button>
       <button class="tbtn" data-cmd="strike" title="${esc(t('nextlibrary','Strikethrough'))}"><s>S</s></button>
       <button class="tbtn" data-cmd="code" title="${esc(t('nextlibrary','Inline code'))}">&lt;/&gt;</button><span class="tsep"></span>
       <button class="tbtn" data-cmd="color" title="${esc(t('nextlibrary','Text colour'))}"><b class="tclr">A</b></button>
       <button class="tbtn" data-cmd="hilite" title="Vurgu rengi">🖍</button><span class="tsep"></span>
       <button class="tbtn" data-cmd="ul" title="Madde listesi">•≡</button>
       <button class="tbtn" data-cmd="ol" title="${esc(t('nextlibrary','Numbered list'))}">1≡</button>
       <button class="tbtn" data-cmd="align" title="Hizalama">⇥</button><span class="tsep"></span>
       <button class="tbtn" data-cmd="link" title="${esc(t('nextlibrary','Insert link'))}">🔗</button>
       <button class="tbtn" data-cmd="unlink" title="${esc(t('nextlibrary','Remove link'))}">🚫</button>
       <button class="tbtn" data-cmd="callout" title="Bilgi notu">ℹ</button>
       <button class="tbtn" data-cmd="hr" title="${esc(t('nextlibrary','Divider'))}">―</button><span class="tsep"></span>
       <button class="tbtn" data-cmd="emoji" title="Emoji">🙂</button>
       <button class="tbtn" data-cmd="image" title="${esc(t('nextlibrary','Image'))}">🖼</button>
       <button class="tbtn" data-cmd="video" title="Video">🎬</button>
       <button class="tbtn" data-cmd="ncfile" title="${esc(t('nextlibrary','Link a file from Nextcloud'))}">${SVG_PAPERCLIP}</button><span class="tsep"></span>
       <button class="tbtn" data-cmd="clear" title="${esc(t('nextlibrary','Clear formatting'))}">✧</button>
     </div>
     <div class="doc-content" id="kx-body" data-ph="${esc(t('nextlibrary','Add a note, a list or a link …'))}" contenteditable="${editing}">${sanitize(p.html)}</div>
   </div>
   <div class="ex-wrap" id="childWrap"></div>
   <div class="prevnext" id="prevNext"></div>
   <div class="ex-wrap" id="exploreWrap"></div></div>`;

  if(edit){
    el('editToggle').onclick=()=>{ if(editing){savePage();editing=false;toast('Kaydedildi');}else editing=true; renderViewer(); if(editing)setTimeout(()=>el('docTitle').focus(),40); };
    el('docEmoji').onclick=()=>openEmoji(el('docEmoji'),(e,x)=>{
      if(x){ p.icon=x.icon; pushPage(p.id,{icon:x.icon}); }
      else { p.emoji=e; p.icon=''; pushPage(p.id,{emoji:e,icon:''}); }
      renderTree(el('kx-search').value); renderViewer();
    },{collectionId:f.coll.id,hasIcon:!!p.icon});
    el('docTitle').addEventListener('input',debounce(()=>{p.title=el('docTitle').value;saveCurrentPage();renderTree(el('kx-search').value);},250));
    el('kx-body').addEventListener('input',debounce(()=>{p.html=sanitize(serializeBody());saveCurrentPage();},400));
    el('toolbar').addEventListener('click',toolbarClick);
    if(editing){ decorateEditMedia(); wireDropZone(el('kx-body')); }
  }
  v.querySelectorAll('.crumb').forEach(cr=>cr.onclick=()=>{
    if('home' in cr.dataset)goHome();
    else if(cr.dataset.c)openCollection(cr.dataset.c);
    else if(cr.dataset.p)openPage(cr.dataset.p);   // yoldaki üst karta dön
  });
  wireReadCtl(p);
  renderChildren(f);
  renderPrevNext(f);
  renderExplore(f);
}

/* Kartın içindeki kartlar: koleksiyon ana ekranındaki ızgaranın aynısı, bir seviye altta.
   "Klasöre girince kendi kartları çıkıyor" davranışı böylece her derinlikte aynı olur. */
function renderChildren(f){
  const w=el('childWrap'); if(!w)return;
  const kids=childrenOf(f.coll,f.page.id);
  const ce=canEdit(f.coll);
  const addBtns=ce?`<div style="display:flex;gap:8px;margin-top:${kids.length?'10px':'0'}">
      <button class="btn btn-ghost" id="addChildBtn">＋ ${esc(t('nextlibrary','Page'))}</button>
      <button class="btn btn-ghost" id="addChildSecBtn">＋ ${esc(t('nextlibrary','Section'))}</button>
    </div>`:'';
  if(!kids.length){
    w.innerHTML=ce?`<div class="ex-head">${esc(t('nextlibrary','Cards inside'))}</div>${addBtns}`:'';
  }else{
    const counts=subtreeCounts(f.coll);
    w.innerHTML=`<div class="ex-head">${esc(t('nextlibrary','Cards inside'))}</div><div class="ex-grid">`+
      kids.map(p=>{
        const deeper=counts[p.id]||0;
        const desc=p.kind==='folder'?'':esc(stripHtml(p.html).slice(0,80))+'…';
        return `<button class="topic-card" data-cp="${p.id}">
          <span class="tc-ico">${iconHTML(p,f.coll.id,22)}</span>
          <span class="tc-title">${esc(p.title||t('nextlibrary','Untitled'))}</span>
          <span class="tc-desc">${desc}</span>
          <span class="tc-go">${p.kind==='folder'?esc(t('nextlibrary','Open'))+' →':(reads[p.id]?'✓ '+esc(t('nextlibrary','Read')):esc(t('nextlibrary','Open'))+' →')}${deeper?` · ${deeper} ↳`:''}</span></button>`;
      }).join('')+`</div>`+addBtns;
  }
  w.querySelectorAll('[data-cp]').forEach(b=>b.onclick=()=>openPage(b.dataset.cp));
  const ab=el('addChildBtn'); if(ab)ab.onclick=()=>{ openPages.add(f.page.id); addPage(f.page.id,'page'); };
  const sb=el('addChildSecBtn'); if(sb)sb.onclick=()=>{ openPages.add(f.page.id); addPage(f.page.id,'folder'); };
}
function savePage(){ const f=findPage(curPage); if(!f)return; f.page.title=el('docTitle').value; f.page.html=sanitize(serializeBody()); flushPage(); renderTree(el('kx-search').value); }

/* -------- Ana ekran (Akademi) -------- */
function renderHome(v){
  const first=me.name?me.name.split(' ')[0]:'';
  v.innerHTML=`<div class="home">
    <div class="home-hero"><h1>${first?esc(t('nextlibrary','Hello, {name}',{name:first})):esc(t('nextlibrary','Hello'))} 👋</h1><p>${esc(t('nextlibrary','Pick a collection to start reading. Your progress is saved automatically.'))}</p></div>
    <div class="home-grid">${colls.map(c=>{
      const rp=readablePages(c);
      const total=rp.length, readN=rp.filter(p=>reads[p.id]).length, pct=total?Math.round(readN/total*100):0;
      return `<button class="home-card" data-hc="${c.id}">
        <span class="hc-em">${c.emoji}</span>
        <span class="hc-name">${esc(c.name)}</span>
        <span class="hc-meta">${total} sayfa · ${readN}/${total} okundu</span>
        <span class="hc-bar"><span style="width:${pct}%"></span></span></button>`;
    }).join('')||'<div class="rail-empty">'+esc(t('nextlibrary','No collections yet.'))+'</div>'}</div></div>`;
  v.querySelectorAll('[data-hc]').forEach(b=>b.onclick=()=>{openCollection(b.dataset.hc);});
}

/* -------- Önceki / sonraki ders -------- */
/* Önceki/sonraki YALNIZCA aynı klasörün içinde gezinir.
   Eskiden tüm koleksiyonların düz sırasında yürüyordu → "Sonraki" bambaşka bir
   klasördeki (hatta başka koleksiyondaki) karta atlıyordu. Klasörün son kartındaysan
   ok görünmez; yukarı çıkmak breadcrumb/sağ panelin işi. */
function renderPrevNext(f){
  const w=el('prevNext'); if(!w)return;
  const sibs=childrenOf(f.coll,f.page.parentId||'0');
  const i=sibs.findIndex(x=>x.id===f.page.id);
  const prev=i>0?sibs[i-1]:null, next=(i>=0&&i<sibs.length-1)?sibs[i+1]:null;
  if(!prev&&!next){w.innerHTML='';return;}
  w.innerHTML=`${prev?`<button class="pn" data-p="${prev.id}"><span class="pn-dir">← ${esc(t('nextlibrary','Previous'))}</span><span class="pn-t">${iconHTML(prev,f.coll.id,16)} ${esc(prev.title||t('nextlibrary','Untitled'))}</span></button>`:'<span></span>'}
    ${next?`<button class="pn pn-next" data-p="${next.id}"><span class="pn-dir">${esc(t('nextlibrary','Next'))} →</span><span class="pn-t">${iconHTML(next,f.coll.id,16)} ${esc(next.title||t('nextlibrary','Untitled'))}</span></button>`:'<span></span>'}`;
  w.querySelectorAll('.pn').forEach(b=>b.onclick=()=>openPage(b.dataset.p));
}

/* ---- Editör motoru ----
   KRİTİK: execCommand varsayılan olarak CSS üretir (bold → <span style="font-weight:bold">).
   Sanitizer'ın izin verdiği öznitelikler arasında `style` YOK → biçim kaydedince SESSİZCE uçar.
   styleWithCSS=false demek, tarayıcıyı etiket üretmeye zorlar (<b>/<i>/<u>) → kalıcı olur.
   Renk/vurgu/hizalama execCommand ile hep style/<font> üretir; bu yüzden onları
   beyaz listede olan `class` ile uyguluyoruz (aşağıdaki KX_* tabloları + css/style.css). */
function execCmd(c,v){
  try{ document.execCommand('styleWithCSS',false,false); }catch(_){}
  try{ return document.execCommand(c,false,v===undefined?null:v); }catch(_){ return false; }
}
const KX_BLOCKS=[['P',t('nextlibrary','Normal text'),'¶'],['H1',t('nextlibrary','Heading 1'),'H1'],['H2',t('nextlibrary','Heading 2'),'H2'],['H3',t('nextlibrary','Heading 3'),'H3'],['BLOCKQUOTE',t('nextlibrary','Quote'),'❝'],['PRE',t('nextlibrary','Code block'),'</>']];
const KX_BLOCK_LABEL={P:t('nextlibrary','Normal'),H1:t('nextlibrary','Heading 1'),H2:t('nextlibrary','Heading 2'),H3:t('nextlibrary','Heading 3'),BLOCKQUOTE:t('nextlibrary','Quote'),PRE:t('nextlibrary','Code block')};
const KX_COLORS=[['',t('nextlibrary','Default'),'var(--ink)'],['kx-c-red',t('nextlibrary','Red'),'#e11d48'],['kx-c-orange',t('nextlibrary','Orange'),'#ea580c'],['kx-c-green',t('nextlibrary','Green'),'#16a34a'],['kx-c-blue',t('nextlibrary','Blue'),'#2563eb'],['kx-c-purple',t('nextlibrary','Purple'),'#9333ea'],['kx-c-gray',t('nextlibrary','Grey'),'#6b7280']];
const KX_HILITES=[['',t('nextlibrary','None'),'transparent'],['kx-hl-yellow',t('nextlibrary','Yellow'),'#fde047'],['kx-hl-green',t('nextlibrary','Green'),'#86efac'],['kx-hl-blue',t('nextlibrary','Blue'),'#93c5fd'],['kx-hl-pink',t('nextlibrary','Pink'),'#f9a8d4'],['kx-hl-gray',t('nextlibrary','Grey'),'#d1d5db']];
const KX_ALIGN=[['',t('nextlibrary','Align left'),'⬅'],['kx-al-center',t('nextlibrary','Centre'),'↔'],['kx-al-right',t('nextlibrary','Align right'),'➡'],['kx-al-justify',t('nextlibrary','Justify'),'☰']];
const BLOCK_SEL='p,h1,h2,h3,h4,li,blockquote,pre,div';

/** Seçim editörün içinde mi? */
function selInBody(){
  const body=el('kx-body'); const s=window.getSelection();
  return !!(body&&s&&s.rangeCount&&s.anchorNode&&body.contains(s.anchorNode));
}
function nodeEl(n){ return n?(n.nodeType===1?n:n.parentElement):null; }

/** Seçime `class` tabanlı satır-içi biçim uygula. cls boşsa yalnızca gruptan temizler. */
function applyInlineClass(cls,groupRe){
  const body=el('kx-body'); if(!body)return;
  body.focus();
  const sel=window.getSelection(); if(!sel||!sel.rangeCount)return;
  const range=sel.getRangeAt(0);
  if(range.collapsed){ toast(t('nextlibrary','Select the text you want to format first')); return; }
  const frag=range.extractContents();
  // seçim içindeki aynı gruptan eski sınıfları temizle (renk üstüne renk birikmesin)
  frag.querySelectorAll('span').forEach(sp=>{
    [...sp.classList].forEach(c=>{ if(groupRe.test(c))sp.classList.remove(c); });
    if(!sp.className.trim())sp.removeAttribute('class');
    if(!sp.attributes.length)sp.replaceWith(...sp.childNodes);
  });
  let sTart,eNd;
  if(cls){
    const span=document.createElement('span'); span.className=cls; span.appendChild(frag);
    range.insertNode(span); sTart=span; eNd=span;
  } else {
    sTart=frag.firstChild; eNd=frag.lastChild; range.insertNode(frag);
  }
  try{ if(sTart&&eNd){ const r=document.createRange(); r.setStartBefore(sTart); r.setEndAfter(eNd); sel.removeAllRanges(); sel.addRange(r); } }catch(_){}
}

/** Seçimin kapsadığı blokları döndür (yoksa imlecin içinde olduğu blok). */
function blocksInSel(){
  const body=el('kx-body'); if(!body)return[];
  const sel=window.getSelection(); if(!sel||!sel.rangeCount)return[];
  const range=sel.getRangeAt(0);
  const hit=[...body.querySelectorAll(BLOCK_SEL)].filter(b=>{ try{return range.intersectsNode(b);}catch(_){return false;} });
  if(hit.length)return hit;
  const n=nodeEl(sel.anchorNode); const b=n&&n.closest&&n.closest(BLOCK_SEL);
  return (b&&body.contains(b))?[b]:[];
}
function applyAlign(cls){
  const bl=blocksInSel();
  if(!bl.length){ toast(t('nextlibrary','No paragraph found to align')); return; }
  bl.forEach(b=>{
    [...b.classList].forEach(c=>{ if(/^kx-al-/.test(c))b.classList.remove(c); });
    if(cls)b.classList.add(cls);
    if(!b.className.trim())b.removeAttribute('class');
  });
}
/** Satır içi kod: seçimi <code> ile sar, zaten kodun içindeyse çöz. */
function toggleInlineCode(){
  const body=el('kx-body'); if(!body)return; body.focus();
  const sel=window.getSelection(); if(!sel||!sel.rangeCount)return;
  const n=nodeEl(sel.anchorNode); const inside=n&&n.closest&&n.closest('code');
  if(inside&&body.contains(inside)){ inside.replaceWith(...inside.childNodes); return; }
  const range=sel.getRangeAt(0);
  if(range.collapsed){ toast(t('nextlibrary','Select the text you want to mark as code first')); return; }
  const c=document.createElement('code');
  try{ range.surroundContents(c); }
  catch(_){ c.appendChild(range.extractContents()); range.insertNode(c); }
  try{ const r=document.createRange(); r.selectNodeContents(c); sel.removeAllRanges(); sel.addRange(r); }catch(_){}
}
/** Buton aktif durumlarını ve blok stili etiketini güncelle. */
function updateToolbarState(){
  const tb=el('toolbar'); if(!tb||!editing||!selInBody())return;
  const st=c=>{ try{return document.queryCommandState(c);}catch(_){return false;} };
  const set=(cmd,on)=>{ const b=tb.querySelector('[data-cmd="'+cmd+'"]'); if(b)b.classList.toggle('on',!!on); };
  set('bold',st('bold')); set('italic',st('italic')); set('underline',st('underline')); set('strike',st('strikeThrough'));
  set('ul',st('insertUnorderedList')); set('ol',st('insertOrderedList'));
  const n=nodeEl(window.getSelection().anchorNode);
  set('code',!!(n&&n.closest&&n.closest('code')));
  set('link',!!(n&&n.closest&&n.closest('a')));
  const blk=n&&n.closest&&n.closest('h1,h2,h3,blockquote,pre,p');
  const lbl=tb.querySelector('#blockLabel');
  if(lbl)lbl.textContent=(blk&&KX_BLOCK_LABEL[blk.tagName])||'Normal';
}
document.addEventListener('selectionchange',()=>{ try{updateToolbarState();}catch(_){} });

function toolbarClick(e){
  const b=e.target.closest('.tbtn'); if(!b)return;
  const cmd=b.dataset.cmd;
  const ins=h=>execCmd('insertHTML',h);
  // Menü açan komutlar seçimi kaybettirmemeli → önce sakla, odağı geri alma
  if(cmd==='image'||cmd==='video'||cmd==='ncfile'||cmd==='block'||cmd==='color'||cmd==='hilite'||cmd==='align'){ saveSel(); }
  else { el('kx-body').focus(); }
  switch(cmd){
    case 'undo':execCmd('undo');break;
    case 'redo':execCmd('redo');break;
    case 'bold':execCmd('bold');break;
    case 'italic':execCmd('italic');break;
    case 'underline':execCmd('underline');break;
    case 'strike':execCmd('strikeThrough');break;
    case 'code':toggleInlineCode();break;
    case 'ul':execCmd('insertUnorderedList');break;
    case 'ol':execCmd('insertOrderedList');break;
    case 'hr':execCmd('insertHorizontalRule');break;
    case 'clear':execCmd('removeFormat');applyInlineClass('',/^kx-(c|hl)-/);applyAlign('');break;
    case 'unlink':execCmd('unlink');break;
    case 'link':{const raw=prompt(t('nextlibrary','Link address:'),'https://');if(raw===null)break;const u=safeUrl(raw);if(u)execCmd('createLink',u);else toast(t('nextlibrary','Invalid link (only http/https)'));break;}
    case 'callout':ins('<blockquote>ℹ️ Bilgi notu…</blockquote>');break;
    case 'emoji':openEmoji(b,em=>{ if(em)ins(em); },{upload:false});break;
    case 'block':openMenu(b,KX_BLOCKS.map(([tag,label,icon])=>({icon,label,fn:()=>{ restoreSel(); execCmd('formatBlock',tag); afterEdit(); }})));e.stopPropagation();return;
    case 'color':openSwatch(b,KX_COLORS,'text',c=>{ restoreSel(); applyInlineClass(c,/^kx-c-/); afterEdit(); });e.stopPropagation();return;
    case 'hilite':openSwatch(b,KX_HILITES,'bg',c=>{ restoreSel(); applyInlineClass(c,/^kx-hl-/); afterEdit(); });e.stopPropagation();return;
    case 'align':openMenu(b,KX_ALIGN.map(([cls,label,icon])=>({icon,label,fn:()=>{ restoreSel(); applyAlign(cls); afterEdit(); }})));e.stopPropagation();return;
    case 'image':openMenu(b,[
      {icon:'💻',label:t('nextlibrary','Upload from this device'),fn:()=>pickImageFile()},
      {icon:'🔗',label:t('nextlibrary','Add by URL'),fn:()=>{const raw=prompt(t('nextlibrary','Image URL:'),'https://');if(raw===null)return;const u=safeUrl(raw);if(u)insertAtSaved(`<img src="${esc(u)}" alt="">`,true);else toast(t('nextlibrary','Invalid image link'));}}
    ]);e.stopPropagation();return;
    case 'video':openMenu(b,[
      {icon:'💻',label:t('nextlibrary','Upload a video from this device'),fn:()=>pickVideoFile()},
      {icon:'🔗',label:t('nextlibrary','YouTube / Vimeo / MP4 link'),fn:()=>{const raw=prompt(t('nextlibrary','Video link (YouTube, Vimeo or .mp4):'),'https://');if(raw===null)return;const emb=videoEmbedHTML(raw);if(emb)insertAtSaved(emb,true);else toast(t('nextlibrary','Unsupported video link'));}}
    ]);e.stopPropagation();return;
    case 'ncfile':pickNextcloudFile();e.stopPropagation();return;
  }
  afterEdit();
}
/** Menüden dönünce seçimi geri yükle (prompt/menü odağı kaybettirir). */
function restoreSel(){
  const body=el('kx-body'); if(!body)return; body.focus();
  try{ if(savedRange){const s=window.getSelection();s.removeAllRanges();s.addRange(savedRange);} }catch(_){}
}
function afterEdit(){
  const f=findPage(curPage);
  if(f){ f.page.html=sanitize(serializeBody()); saveCurrentPage(); }
  updateToolbarState();
}
/** Renk/vurgu için küçük kare paleti (emojiPop ile aynı popover kalıbı). */
function openSwatch(anchor,list,kind,cb){
  const pop=el('kxPop'); if(!pop)return;
  pop.innerHTML='';
  list.forEach(([cls,label,color])=>{
    const b=document.createElement('button'); b.className='kx-sw'; b.title=label;
    if(kind==='text'){ b.textContent='A'; b.style.color=color; }
    else { b.style.background=color; b.textContent=cls?'':'⃠'; }
    b.onclick=()=>{ pop.classList.remove('show'); cb(cls); };
    pop.appendChild(b);
  });
  const r=anchor.getBoundingClientRect();
  pop.style.left=Math.min(r.left,innerWidth-240)+'px';
  pop.style.top=(r.bottom+6)+'px';
  pop.classList.add('show');
}
document.addEventListener('click',e=>{ const p=el('kxPop'); if(p&&!e.target.closest('#kxPop')&&!e.target.closest('[data-cmd=color]')&&!e.target.closest('[data-cmd=hilite]'))p.classList.remove('show'); });

/* -------- Hazır Kart Şablonları (8 Farklı Tarz & Canlı Önizleme) -------- */
const CARD_CATEGORIES = [
  { id: 'all', label: 'Tümü' },
  { id: 'dev', label: '💻 Kod / API' },
  { id: 'executive', label: '📊 Yönetici' },
  { id: 'sop', label: '🛠️ Süreç' },
  { id: 'design', label: '🎨 Tasarım' },
  { id: 'meeting', label: '📝 Toplantı' },
  { id: 'profile', label: '👤 Profil' },
  { id: 'product', label: '🚀 Ürün' },
  { id: 'research', label: '📚 Akademik' }
];

let activeTmplCategory = 'all';

const CARD_TEMPLATES = [
  {
    id: 'code_doc',
    category: 'dev',
    emoji: '💻',
    title: 'Yazılım & API Dokümanı',
    desc: 'REST API uç noktaları, parametre tablosu ve cURL/JSON kod örnekleri',
    badge: 'Dev / API',
    html: `<div class="kx-code-hero">
  <div class="kx-api-endpoint">
    <span class="kx-method-tag kx-post">POST</span>
    <code class="kx-api-url">/api/v1/auth/login</code>
    <span class="kx-status-pill">200 OK</span>
  </div>
</div>
<h2>💻 API Dokümantasyonu</h2>
<p>Bu uç nokta kullanıcı doğrulaması ve JWT token üretimi gerçekleştirir.</p>
<div class="kx-callout kx-callout-info">
  <b>🔑 Güvenlik Uyarısı:</b> Tüm isteklerde <code>Authorization: Bearer &lt;token&gt;</code> üst bilgisi zorunludur.
</div>
<h3>📋 İstek Parametreleri</h3>
<table class="kx-table">
  <thead>
    <tr><th>Parametre</th><th>Tip</th><th>Zorunlu</th><th>Açıklama</th></tr>
  </thead>
  <tbody>
    <tr><td><code>username</code></td><td>String</td><td><span class="kx-badge-req">Zorunlu</span></td><td>Kullanıcı e-posta adresi</td></tr>
    <tr><td><code>password</code></td><td>String</td><td><span class="kx-badge-req">Zorunlu</span></td><td>Minimum 8 karakter parola</td></tr>
    <tr><td><code>remember_me</code></td><td>Boolean</td><td><span class="kx-badge-opt">Opsiyonel</span></td><td>30 günlük oturum süresi</td></tr>
  </tbody>
</table>
<h3>💻 Örnek İstek (cURL)</h3>
<div class="kx-code-block">
  <div class="kx-cb-head"><span>Bash</span><span class="kx-cb-copy">Kopyala</span></div>
  <pre><code>curl -X POST https://api.example.com/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username": "user@domain.com", "password": "SecretPassword123"}'</code></pre>
</div>
<h3>📤 Örnek Yanıt Payload (JSON)</h3>
<div class="kx-code-block">
  <div class="kx-cb-head"><span>JSON</span></div>
  <pre><code>{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 86400
}</code></pre>
</div>`
  },
  {
    id: 'exec_kpi',
    category: 'executive',
    emoji: '📊',
    title: 'Yönetici & Performans Raporu',
    desc: 'KPI metrik kartları, gelir grafiği ve stratejik karar listesi',
    badge: 'Yönetici',
    html: `<h2>📊 Çeyrek Dönem Yönetici Raporu</h2>
<p>2026 Q3 büyüme metrikleri, operasyonel hedefler ve kritik performans göstergeleri.</p>
<div class="kx-kpi-grid">
  <div class="kx-kpi-card kx-kpi-cyan">
    <div class="kx-kpi-label">Toplam Gelir (ARR)</div>
    <div class="kx-kpi-val">₺4.82M</div>
    <div class="kx-kpi-trend kx-up">▲ %18.4 (Geçen aya göre)</div>
  </div>
  <div class="kx-kpi-card kx-kpi-purple">
    <div class="kx-kpi-label">Aktif Aboneler</div>
    <div class="kx-kpi-val">12,450</div>
    <div class="kx-kpi-trend kx-up">▲ +1,280 Yeni</div>
  </div>
  <div class="kx-kpi-card kx-kpi-green">
    <div class="kx-kpi-label">Müşteri Memnuniyeti</div>
    <div class="kx-kpi-val">%96.8</div>
    <div class="kx-kpi-trend kx-up">▲ CSAT Puanı</div>
  </div>
  <div class="kx-kpi-card kx-kpi-amber">
    <div class="kx-kpi-label">Churn Oranı</div>
    <div class="kx-kpi-val">%1.2</div>
    <div class="kx-kpi-trend kx-down">▼ %0.4 Düşüş</div>
  </div>
</div>
<div class="kx-callout kx-callout-success">
  <b>🚀 Stratejik Kazanç:</b> Q3 hedeflerinin %112'si planlanandan 2 hafta önce tamamlandı.
</div>
<h3>📌 Alınan Kararlar & Aksiyonlar</h3>
<ul class="kx-check-list">
  <li>✅ Enterprise segment için sunucu altyapısı kapasitesi 2 katına çıkarıldı.</li>
  <li>✅ Pazarlama bütçesi dijital kanallara %25 oranında kaydırıldı.</li>
  <li>⏳ Mobil uygulama yenileme projesi Q4 başına takvimlendi.</li>
</ul>`
  },
  {
    id: 'sop_workflow',
    category: 'sop',
    emoji: '🛠️',
    title: 'SOP & Standart Süreç Rehberi',
    desc: 'Numaralı adım adım iş akışı, güvenlik kontrolü ve prosedür kartı',
    badge: 'Süreç / SOP',
    html: `<div class="kx-sop-header">
  <span class="kx-sop-badge">SOP-2026-08</span>
  <span class="kx-sop-title">Sunucu Dağıtım & Yayınlama Prosedürü</span>
  <span class="kx-sop-rev">Rev: 3.2</span>
</div>
<h2>🛠️ Süreç Adımları</h2>
<div class="kx-sop-steps">
  <div class="kx-sop-step">
    <div class="kx-sop-num">1</div>
    <div class="kx-sop-content">
      <h4>Kod Kontrolü & Birleştirme</h4>
      <p>Ana dala (main) girmeden önce tüm unit ve entegrasyon testlerinin geçtiğini doğrulayın.</p>
      <div class="kx-callout kx-callout-warning"><b>⚠️ Ön Koşul:</b> En az 2 senior geliştirici onayı (PR Approve) gereklidir.</div>
    </div>
  </div>
  <div class="kx-sop-step">
    <div class="kx-sop-num">2</div>
    <div class="kx-sop-content">
      <h4>Staging Ortamı Doğrulaması</h4>
      <p>Build artefact'lerini staging sunucusuna deploy edin ve duman (smoke) testlerini çalıştırın.</p>
    </div>
  </div>
  <div class="kx-sop-step">
    <div class="kx-sop-num">3</div>
    <div class="kx-sop-content">
      <h4>Canlıya Geçiş (Production Deploy)</h4>
      <p>Canlı dağıtım tetikleyiciyi başlatın. Trafik kademeli olarak (%10 -> %50 -> %100) aktarılacaktır.</p>
      <div class="kx-callout kx-callout-info"><b>💡 Geri Dönüş Planı:</b> Hata durumunda <code>./rollback.sh --version previous</code> komutunu çalıştırın.</div>
    </div>
  </div>
</div>`
  },
  {
    id: 'design_moodboard',
    category: 'design',
    emoji: '🎨',
    title: 'Tasarım & Kreatif Moodboard',
    desc: 'Renk paleti renk kartları, tipografi özellikleri ve görsel kılavuz',
    badge: 'Tasarım',
    html: `<div class="kx-img-placeholder" title="Kapak Görseli Yükle"><div class="kx-ip-icon">🎨</div><div class="kx-ip-text">Moodboard / Kapak Görseli Yükle (Tıkla)</div></div>
<h2>🎨 Marka & UI Tasarım Sistem Rehberi</h2>
<p>Proje görsel dili, renk paleti ve tipografik hiyerarşi standartları.</p>
<h3>🎨 Renk Paleti (Palette)</h3>
<div class="kx-palette-grid">
  <div class="kx-swatch kx-sw-brand"><span>Primary</span><code>#0082C9</code></div>
  <div class="kx-swatch kx-sw-purple"><span>Purple Accent</span><code>#7C6FE0</code></div>
  <div class="kx-swatch kx-sw-green"><span>Success Cyan</span><code>#00FF88</code></div>
  <div class="kx-swatch kx-sw-dark"><span>Ink Slate</span><code>#1B2733</code></div>
  <div class="kx-swatch kx-sw-light"><span>Surface 2</span><code>#F0F3F6</code></div>
</div>
<h3>✍️ Tipografi & Yazı Tipleri</h3>
<div class="kx-typo-box">
  <div class="kx-typo-item"><b>Başlıklar:</b> Rajdhani / IBM Plex Sans (Bold 700)</div>
  <div class="kx-typo-item"><b>Gövde Metni:</b> Segoe UI / Inter (Regular 400)</div>
  <div class="kx-typo-item"><b>Kod & Metrikler:</b> JetBrains Mono / Space Mono</div>
</div>
<h3>🖼️ Görsel Varlıklar</h3>
<div class="kx-media-grid">
  <div class="kx-img-placeholder kx-img-sm"><div class="kx-ip-icon">🖼️</div><div class="kx-ip-text">UI Mockup 1</div></div>
  <div class="kx-img-placeholder kx-img-sm"><div class="kx-ip-icon">🖼️</div><div class="kx-ip-text">UI Mockup 2</div></div>
</div>`
  },
  {
    id: 'meeting_notes',
    category: 'meeting',
    emoji: '📝',
    title: 'Toplantı Notu & Aksiyon Takibi',
    desc: 'Toplantı künyesi, alınan kararlar ve görev dağılım tablosu',
    badge: 'Toplantı',
    html: `<div class="kx-meeting-header">
  <div class="kx-mh-item">📅 <b>Tarih:</b> 11 Ağustos 2026 | 10:30</div>
  <div class="kx-mh-item">📍 <b>Lokasyon:</b> Online (Teams)</div>
  <div class="kx-mh-chips">
    <span class="kx-chip">👤 Safi M.</span>
    <span class="kx-chip">👤 Ahmet K.</span>
    <span class="kx-chip">👤 Zeynep T.</span>
  </div>
</div>
<h2>📝 Ürün Haftalık Senkronizasyonu</h2>
<div class="kx-callout kx-callout-info">
  <b>🎯 Toplantı Amacı:</b> Q4 yol haritası önceliklendirmesi ve yeni UI şablonlarının incelenmesi.
</div>
<h3>💡 Alınan Kritik Kararlar</h3>
<blockquote class="kx-quote">"Yeni kart şablonları tasarımı canlı önizleme paneliyle entegre edilecek ve kullanıcı onayına sunulacak."</blockquote>
<h3>📋 Aksiyon Takip Listesi</h3>
<table class="kx-table">
  <thead>
    <tr><th>Görev / Aksiyon</th><th>Sorumlu</th><th>Son Tarih</th><th>Durum</th></tr>
  </thead>
  <tbody>
    <tr><td>Önizleme modal bileşeni kodlanacak</td><td>Safi M.</td><td>12 Ağu</td><td><span class="kx-badge-req">Devam Ediyor</span></td></tr>
    <tr><td>CSS tasarım tokenları güncellenecek</td><td>Ahmet K.</td><td>13 Ağu</td><td><span class="kx-badge-opt">Beklemede</span></td></tr>
    <tr><td>Kullanıcı testleri tamamlanacak</td><td>Zeynep T.</td><td>15 Ağu</td><td><span class="kx-badge-opt">Beklemede</span></td></tr>
  </tbody>
</table>`
  },
  {
    id: 'user_profile',
    category: 'profile',
    emoji: '👤',
    title: 'Kişi & Profil Kartı',
    desc: 'Profil fotoğrafı, iletişim etiketleri, uzmanlık alanı ve sorumluluklar',
    badge: 'Profil',
    html: `<div class="kx-img-placeholder kx-img-avatar" title="Profil Fotoğrafı Yükle"><div class="kx-ip-icon">👤</div><div class="kx-ip-text">Profil Fotoğrafı Yükle</div></div>
<h2 class="kx-center">Safi M. Ceylan</h2>
<p class="kx-center kx-subtle"><b>Kıdemli Yazılım Mimarı & UI/UX Tasarımcısı</b></p>
<div class="kx-profile-contacts">
  <span class="kx-contact-pill">📧 safi@example.com</span>
  <span class="kx-contact-pill">📱 +90 532 000 00 00</span>
  <span class="kx-contact-pill">📍 İstanbul, TR</span>
</div>
<h3>🚀 Yetkinlikler & Uzmanlıklar</h3>
<div class="kx-skills-grid">
  <span class="kx-skill-tag">Nextcloud Plugin Dev</span>
  <span class="kx-skill-tag">Vue.js / React</span>
  <span class="kx-skill-tag">PHP / Symfony</span>
  <span class="kx-skill-tag">UI/UX Design System</span>
  <span class="kx-skill-tag">REST API Architecture</span>
</div>
<h3>📌 Güncel Projeler & Sorumluluklar</h3>
<ul>
  <li><b>NextLibrary:</b> Bilgi kartları ve şablon sistemi mimarı</li>
  <li><b>CloudImport:</b> Bulut depolama entegrasyon sağlayıcısı</li>
</ul>`
  },
  {
    id: 'product_spec',
    category: 'product',
    emoji: '🚀',
    title: 'Ürün Spesifikasyonu & Özellik Kartı',
    desc: 'Kullanıcı hikayesi (User story), kabul kriterleri ve tel kafes görsel alanı',
    badge: 'Ürün',
    html: `<div class="kx-img-placeholder" title="Wireframe / Tel Kafes Görseli Yükle"><div class="kx-ip-icon">🖼️</div><div class="kx-ip-text">Wireframe / Tel Kafes Görseli Yükle</div></div>
<h2>🚀 Özellik: Canlı Şablon Önizleme Modülü</h2>
<div class="kx-callout kx-callout-success">
  <b>👤 User Story:</b> Bir kullanıcı olarak, yeni kart oluşturmadan önce şablonun tam görünümünü sağ tarafta canlı önizlemek istiyorum, böylece ihtiyacıma en uygun düzeni anında seçebilirim.
</div>
<h3>✅ Kabul Kriterleri (Acceptance Criteria)</h3>
<ul class="kx-check-list">
  <li>✅ Kullanıcı sağ paneldeki şablona tıkladığında veya önizleme butonuna bastığında canlı mini önizleme açılır.</li>
  <li>✅ Şablonlar kategorilere göre (Tümü, Dev, Yönetici, SOP, Tasarım vb.) filtrelenebilir.</li>
  <li>✅ Önizleme alanından "Bu Şablonu Kullan" butonuna tek tıkla yeni kart oluşturulur.</li>
</ul>
<h3>🎯 Hedef Metrikler & Etki</h3>
<table class="kx-table">
  <thead><tr><th>Metrik</th><th>Mevcut</th><th>Hedef</th></tr></thead>
  <tbody>
    <tr><td>Şablon Kullanım Oranı</td><td>%22</td><td>%65+</td></tr>
    <tr><td>Kart Oluşturma Süresi</td><td>45 sn</td><td>10 sn</td></tr>
  </tbody>
</table>`
  },
  {
    id: 'academic_ref',
    category: 'research',
    emoji: '📚',
    title: 'Sözlük & Araştırma Makalesi',
    desc: 'Kavram açıklamaları, alıntılar ve literatür referans bağlantıları',
    badge: 'Akademik',
    html: `<h2>📚 Kavram: Bilgi Grafiği (Knowledge Graph)</h2>
<div class="kx-callout kx-callout-info">
  <b>💡 Tanım:</b> Nesneler, kavramlar ve bunların arasındaki ilişkileri anlamsal (semantic) ağ yapısında temsil eden veritabanı modelidir.
</div>
<blockquote class="kx-quote">
  "Bilgi kartları arasındaki ilişkisel bağlantılar, verinin sadece saklanmasını değil, keşfedilmesini ve ilişkilendirilmesini sağlar."
</blockquote>
<h3>🔍 Ana Bileşenler</h3>
<ul>
  <li><b>Varlıklar (Entities):</b> Kartlar, kişiler, dokümanlar.</li>
  <li><b>İlişkiler (Relations):</b> "İçerir", "Atıfta Bulunur", "Düzenleyen".</li>
  <li><b>Öznitelikler (Attributes):</b> Oluşturma tarihi, şablon tipi, etiketler.</li>
</ul>
<h3>🔗 Atıf Yapılan Dokümanlar</h3>
<div class="kx-ref-links">
  <a href="#" class="kx-ref-card">📄 W3C Resource Description Framework (RDF)</a>
  <a href="#" class="kx-ref-card">📄 Neo4j Graph Database Fundamentals</a>
</div>`
  }
];

/* Yazma yetkisi olmayan hesap şablonları hiç görmez: aksi halde tıklayınca yalnızca
   403 dönen ölü bir arayüz olurdu (uygulamanın geri kalanında da yazma düğmeleri gizli). */
function mayUseTemplates(){ return canCreate && !previewAsVisitor; }

/* Kullanıcının seçtiği sekme. Çizimden AYRI tutuluyor: renderTemplates açılışta bir kez
   yetkisiz varsayımıyla koşuyor (canCreate ancak state ile geliyor) ve o an paneli
   "ilgili kartlar"a alıyor. Seçim burada saklanmazsa yetki gelince sekmeler geri gelir
   ama panel yanlış sekmede kalırdı. */
let railTab='tmpl';

function showRailPanel(which){
  const tabT=el('railTabTmpl'), tabR=el('railTabRecs'), panT=el('panelTmpl'), panR=el('panelRecs');
  if(!panT||!panR)return;
  const tmpl=which==='tmpl';
  if(tabT)tabT.classList.toggle('active',tmpl);
  if(tabR)tabR.classList.toggle('active',!tmpl);
  panT.classList.toggle('active',tmpl);
  panR.classList.toggle('active',!tmpl);
}

/* Kullanıcı seçimi: hem çizer hem hatırlar. */
function selectRailTab(which){ railTab=which; showRailPanel(which); }

function wireRailTabs(){
  const tabT=el('railTabTmpl'), tabR=el('railTabRecs');
  if(tabT)tabT.onclick=()=>selectRailTab('tmpl');
  if(tabR)tabR.onclick=()=>selectRailTab('recs');
}

function renderTemplates(){
  const box=el('tmplList'); if(!box)return;
  const tabs=el('railTabs');
  if(!mayUseTemplates()){
    // Sekme şeridini tamamen kaldır ve "ilgili kartlar" panelini tek panel olarak bırak.
    // railTab'a DOKUNMA: yetki sonradan gelirse kullanıcı seçtiği sekmeye dönebilsin.
    if(tabs)tabs.style.display='none';
    box.innerHTML='';
    showRailPanel('recs');
    return;
  }
  if(tabs)tabs.style.display='';
  showRailPanel(railTab);

  const filtered=activeTmplCategory==='all'
    ? CARD_TEMPLATES
    : CARD_TEMPLATES.filter(x=>x.category===activeTmplCategory);

  const filtersHtml='<div class="tmpl-filters">'+
    CARD_CATEGORIES.map(c=>`<button class="tmpl-filter ${activeTmplCategory===c.id?'active':''}" data-cat="${esc(c.id)}">${esc(c.label)}</button>`).join('')+
    '</div>';

  // Mini önizleme şablonun KENDİ sabit HTML'i — kullanıcı girdisi değil, bu yüzden
  // doğrudan basılıyor. (Kaydedilen sayfa gövdesi ayrıca sanitize'den geçiyor.)
  const listHtml=filtered.map(x=>`
    <div class="tmpl-card-wrap" data-tmpl="${esc(x.id)}">
      <div class="tmpl-card-head" data-act="toggle-pv">
        <span class="tmpl-icon">${x.emoji}</span>
        <span class="tmpl-info">
          <span class="tmpl-title">${esc(x.title)} <span class="tmpl-badge">${esc(x.badge)}</span></span>
          <span class="tmpl-desc">${esc(x.desc)}</span>
        </span>
      </div>
      <div class="tmpl-actions">
        <button class="tmpl-btn-pv" data-act="full-pv">👁️ ${esc(t('nextlibrary','Live preview'))}</button>
        <button class="tmpl-btn-add" data-act="use">＋ ${esc(t('nextlibrary','Create'))}</button>
      </div>
      <div class="tmpl-mini-preview">${x.html}</div>
    </div>`).join('');

  box.innerHTML=filtersHtml+listHtml;

  box.querySelectorAll('.tmpl-filter').forEach(btn=>{
    btn.onclick=e=>{ e.stopPropagation(); activeTmplCategory=btn.dataset.cat; renderTemplates(); };
  });

  box.querySelectorAll('.tmpl-card-wrap').forEach(wrap=>{
    const tp=CARD_TEMPLATES.find(x=>x.id===wrap.dataset.tmpl); if(!tp)return;
    const head=wrap.querySelector('[data-act="toggle-pv"]');
    const mini=wrap.querySelector('.tmpl-mini-preview');
    if(head&&mini){
      head.onclick=()=>{
        const wasOpen=mini.classList.contains('open');
        box.querySelectorAll('.tmpl-mini-preview').forEach(m=>m.classList.remove('open'));
        if(!wasOpen)mini.classList.add('open');
      };
    }
    const pv=wrap.querySelector('[data-act="full-pv"]');
    if(pv)pv.onclick=e=>{ e.stopPropagation(); openTemplateFullPreview(tp); };
    const add=wrap.querySelector('[data-act="use"]');
    if(add)add.onclick=e=>{ e.stopPropagation(); addPageFromTemplate(tp); };
  });
}

/* Tam ekran önizleme. Kapatma/arka plan tıklaması main.php'deki statik [data-close]
   ve .backdrop kancalarıyla zaten bağlı — burada yalnızca içerik ve "kullan" düğmesi. */
function openTemplateFullPreview(tmpl){
  const md=el('mdTmplPreview'), stage=el('mdTmplStage');
  if(!md||!stage)return;
  const title=el('mdTmplTitle'), meta=el('mdTmplMeta'), use=el('mdTmplUseBtn');
  if(title)title.textContent='🔍 '+tmpl.emoji+' '+tmpl.title;
  if(meta)meta.innerHTML='<span><b>'+esc(t('nextlibrary','Category'))+':</b> '+esc(tmpl.badge)+'</span> <span>'+esc(tmpl.desc)+'</span>';
  stage.innerHTML=tmpl.html;
  if(use)use.onclick=()=>{ hide('mdTmplPreview'); addPageFromTemplate(tmpl); };
  show('mdTmplPreview');
}

/* Şablondan kart oluştur. addPage() ile aynı sözleşme: kart, açık koleksiyonun içinde
   ve bulunulan klasörün ALTINA eklenir (1.1.0 iç içe kartlar). Koleksiyon seçili
   değilken sessizce colls[0]'a yazılmıyor — kart, kullanıcının baktığı yerden başka
   bir koleksiyonda beliriyordu. */
function addPageFromTemplate(tmpl){
  const c=getColl(curColl);
  if(!c){ toast(t('nextlibrary','Open a collection first')); return; }
  if(!canEdit(c)){ toast(t('nextlibrary','You are not allowed to do this — ask an administrator for editing rights')); return; }
  const f=findPage(curPage);
  // Açık kart bir bölümse onun içine, normal bir kartsa kardeşi olarak, yoksa köke.
  let parentId='0';
  if(f&&f.coll.id===c.id)parentId=f.page.kind==='folder'?f.page.id:(f.page.parentId||'0');
  api('POST','/collections/'+c.id+'/pages',{
    emoji:tmpl.emoji||'📄', title:tmpl.title||'', html:tmpl.html||'',
    kind:'page', parentId:parentId==='0'?0:Number(parentId)
  }).then(p=>{
    // addPage() ile aynı gerekçe: buradan sonrası yalnızca çizim; hatası "kaydedilemedi"
    // sanılmasın diye ayrı yakalanır.
    try{
      const np={id:String(p.id),parentId:String(p.parentId||0),kind:p.kind==='folder'?'folder':'page',emoji:p.emoji||tmpl.emoji||'📄',icon:p.icon||'',title:p.title||tmpl.title||'',html:p.html||tmpl.html||'',sort:p.sort||0};
      c.pages.push(np); openColls.add(c.id);
      if(np.parentId!=='0')openPages.add(np.parentId);
      openPage(np.id,true);   // şablon kartı doğrudan düzenleme modunda açılır
      toast(t('nextlibrary','Card created from template'));
    }catch(err){ try{console.error('[NextLibrary render]',err);}catch(_){} }
  }).catch(apiErr);
}

/* NOT: Kelime skorlamalı "ilgili sayfa" mantığı kaldırıldı. Koleksiyonun her yerinden
   kart öneriyordu; artık hem sağ panel hem sayfa altı yalnızca bulunulan klasörün
   kartlarını gösteriyor (childrenOf). */

/* -------- Sağ panel: BULUNDUĞUN KLASÖR --------
   Eskiden koleksiyonun tamamından "ilgili sayfalar" listeleniyordu; iç içe yapıda bu
   nerede olduğunu değil, her yeri gösteriyordu. Artık panel yalnızca içinde bulunduğun
   klasörün kartlarını listeler ve en üstte tek satır yol vardır: bir adıma basmak
   üst klasöre (ya da koleksiyonun köküne) döndürür. */
function renderRecs(){
  const box=el('recs'); if(!box)return;
  const f=findPage(curPage);
  const coll=f?f.coll:getColl(curColl);
  if(!coll){ box.innerHTML='<div class="rail-empty">'+esc(t('nextlibrary','Select a page to start reading.'))+'</div>'; return; }

  // İçinde bulunduğumuz klasör: açık kart bir bölümse kendisi, değilse üstü.
  const here=(f&&f.page.kind==='folder')?f.page:(f?(f.page.parentId!=='0'?coll.pages.find(p=>p.id===f.page.parentId):null):null);
  const parentId=here?here.id:'0';
  const items=childrenOf(coll,parentId);
  const counts=subtreeCounts(coll);

  // Tek satır yol: Koleksiyon › … › bulunulan klasör
  const trail=here?pathOf(coll,here):[];
  const pathHTML=`<div class="rail-path" title="${esc(t('nextlibrary','Go back up'))}">`+
    `<span class="rp-step" data-rc="${coll.id}">${iconHTML(coll,coll.id,14)} ${esc(coll.name)}</span>`+
    trail.map((a,i)=>`<span class="rp-sep">›</span><span class="rp-step ${i===trail.length-1?'cur':''}" data-rp="${a.id}">${esc(a.title||t('nextlibrary','Untitled'))}</span>`).join('')+
    `</div>`;

  const listHTML=items.length
    ? items.map(p=>`<button class="rec ${p.id===curPage?'cur':''}" data-p="${p.id}">
        <span class="rem">${iconHTML(p,coll.id,18)}</span><span><span class="rt">${esc(p.title||t('nextlibrary','Untitled'))}${reads[p.id]?' <span class="rec-ok">✓</span>':''}</span>
        <span class="rd">${p.kind==='folder'?esc(n('nextlibrary','%n card inside','%n cards inside',counts[p.id]||0)):esc(stripHtml(p.html).slice(0,42))+'…'}</span></span></button>`).join('')
    : '<div class="rail-empty">'+esc(t('nextlibrary','This section is empty yet.'))+'</div>';

  box.innerHTML=pathHTML+listHTML;
  box.querySelectorAll('.rec').forEach(r=>r.onclick=()=>openPage(r.dataset.p));
  box.querySelectorAll('[data-rp]').forEach(r=>r.onclick=()=>openPage(r.dataset.rp));
  box.querySelectorAll('[data-rc]').forEach(r=>r.onclick=()=>openCollectionRoot(r.dataset.rc));
}

/* -------- Sayfa altı "Buradan devam et" --------
   Yalnızca AYNI KLASÖRDEKİ diğer kartlar. Eskiden koleksiyonun tamamından "ilgili"
   sayfalar geliyordu; okuyucu, içinde olmadığı klasörlerin belgelerini görüyordu. */
function renderExplore(f){
  const w=el('exploreWrap'); if(!w)return;
  const c=f.coll;
  const sibs=childrenOf(c,f.page.parentId||'0').filter(p=>p.id!==f.page.id).slice(0,4);
  if(!sibs.length){w.innerHTML='';return;}
  const counts=subtreeCounts(c);
  w.innerHTML=`<div class="ex-head">Buradan devam et</div><div class="ex-grid">`+
    sibs.map(p=>`<button class="topic-card" data-p="${p.id}">
       <span class="tc-ico">${iconHTML(p,c.id,22)}</span>
       <span class="tc-title">${esc(p.title||t('nextlibrary','Untitled'))}</span>
       <span class="tc-desc">${p.kind==='folder'?esc(n('nextlibrary','%n card inside','%n cards inside',counts[p.id]||0)):esc(stripHtml(p.html).slice(0,80))+'…'}</span>
       <span class="tc-go">${p.kind==='folder'?esc(t('nextlibrary','Open'))+' →':(reads[p.id]?'✓ '+esc(t('nextlibrary','Read')):esc(t('nextlibrary','Open'))+' →')}</span></button>`).join('')+`</div>`;
  w.querySelectorAll('.topic-card').forEach(b=>b.onclick=()=>openPage(b.dataset.p));
}

/* -------- Sayfa/koleksiyon işlemleri (bağlam menüsü) -------- */
/* Ağaçtaki ＋ düğmesi: doğrudan sayfa eklemek yerine türü sorar.
   ('İçine kart ekle' akışının her yerde aynı iki seçeneği sunması için.) */
function addMenu(anchor,parentId){
  openMenu(anchor,[
    {icon:'📄',label:t('nextlibrary','Page'),fn:()=>addPage(parentId,'page')},
    {icon:'📁',label:t('nextlibrary','Section'),fn:()=>addPage(parentId,'folder')}
  ]);
}
// parentId verilirse kart o kartın ALTINA eklenir ('0' = koleksiyonun kökü)
// kind: 'page' (yazı sayfası) | 'folder' (bölüm)
function addPage(parentId='0',kind='page'){ const c=getColl(curColl);if(!c)return;
  const folder=kind==='folder';
  api('POST','/collections/'+c.id+'/pages',{emoji:folder?'📁':'📄',title:'',html:'',kind:folder?'folder':'page',parentId:parentId==='0'?0:Number(parentId)}).then(p=>{
    // Buraya gelindiyse sunucu kaydı BAŞARILI. Sonrası yalnızca arayüz çizimi; orada
    // çıkan bir hata .catch(apiErr)'e düşerse kullanıcıya "sunucuya kaydedilemedi"
    // denir ve sayfa gerçekte oluşmuşken kaybolmuş sanılır → çizimi ayrı yakala.
    try{
      const np={id:String(p.id),parentId:String(p.parentId||0),kind:p.kind==='folder'?'folder':'page',emoji:p.emoji||'📄',icon:p.icon||'',title:p.title||'',html:p.html||'',sort:p.sort||0};
      c.pages.push(np); openColls.add(c.id);
      // Bölüm düzenleyiciyle açılmaz (yazısı yok) → kapak görünümüyle açılır
      openPage(np.id,np.kind!=='folder');
      toast(np.parentId==='0'?t('nextlibrary','Card added'):t('nextlibrary','Card added inside'));
    }catch(err){ try{console.error('[NextLibrary render]',err);}catch(_){} }
  }).catch(apiErr);
}
function pageActions(pid,anchor){
  const f=findPage(pid);if(!f)return;
  openMenu(anchor,[
    {icon:'📄',label:t('nextlibrary','Open'),fn:()=>openPage(pid)},
    {icon:'➕',label:t('nextlibrary','Add a page inside'),fn:()=>{ curColl=f.coll.id; openPages.add(pid); addPage(pid,'page'); }},
    {icon:'📁',label:t('nextlibrary','Add a section inside'),fn:()=>{ curColl=f.coll.id; openPages.add(pid); addPage(pid,'folder'); }},
    {icon:f.page.kind==='folder'?'📄':'📁',
     label:f.page.kind==='folder'?t('nextlibrary','Turn into a page'):t('nextlibrary','Turn into a section'),
     fn:()=>{
       const nk=f.page.kind==='folder'?'page':'folder';
       f.page.kind=nk;
       // Bölüme çevrilen kartın yazısı SİLİNMEZ, yalnızca gösterilmez (geri çevirince döner).
       pushPage(pid,{kind:nk});
       renderTree(el('kx-search').value); if(curPage===pid)renderViewer(); renderRecs();
       toast(nk==='folder'?t('nextlibrary','Turned into a section'):t('nextlibrary','Turned into a page'));
     }},
    {icon:'✏️',label:t('nextlibrary','Rename'),fn:()=>{const v=prompt(t('nextlibrary','New page name:'),f.page.title||'');if(v&&v.trim()){f.page.title=v.trim();pushPage(pid,{title:f.page.title});renderTree(el('kx-search').value);if(curPage===pid)renderViewer();}}},
    {sep:true},
    {icon:'🗑️',label:t('nextlibrary','Delete'),danger:true,fn:()=>{
      // Kart alt ağacıyla birlikte gider → kaç kartın gideceğini önce söyle.
      const doomed=subtreeOf(f.coll,f.page);
      const msg=doomed.length>1
        ? t('nextlibrary','Delete "{title}" and the {count} cards inside it? They go to the trash bin together.',{title:f.page.title||t('nextlibrary','Untitled'),count:doomed.length-1})
        : t('nextlibrary','Delete the page "{title}"? This cannot be undone.',{title:f.page.title||t('nextlibrary','Untitled')});
      if(!confirm(msg))return;
      api('DELETE','/pages/'+pid).catch(apiErr);
      const gone=new Set(doomed.map(x=>x.id));
      f.coll.pages=f.coll.pages.filter(x=>!gone.has(x.id));
      gone.forEach(id=>{ delete reads[id]; openPages.delete(id); });
      if(gone.has(curPage))curPage=null;
      renderTree(el('kx-search').value);renderViewer();renderRecs();
      toast(doomed.length>1?t('nextlibrary','{count} cards moved to the trash bin',{count:doomed.length}):'Sayfa silindi');
    }}
  ]);
}
function collActions(c,anchor){
  openMenu(anchor,[
    {icon:'✏️',label:t('nextlibrary','Rename'),fn:()=>{const v=prompt(t('nextlibrary','New collection name:'),c.name);if(v&&v.trim()){c.name=v.trim();api('PUT','/collections/'+c.id,{name:c.name}).catch(apiErr);renderTree(el('kx-search').value);renderViewer();}}},
    {icon:'😀',label:t('nextlibrary','Change icon'),fn:()=>openEmoji(anchor,(e,x)=>{
      if(x){ c.icon=x.icon; api('PUT','/collections/'+c.id,{icon:x.icon}).catch(apiErr); }
      else { c.emoji=e; c.icon=''; api('PUT','/collections/'+c.id,{emoji:e,icon:''}).catch(apiErr); }
      renderTree(el('kx-search').value); renderViewer();
    },{collectionId:c.id,hasIcon:!!c.icon})},
    {icon:'👥',label:t('nextlibrary','Members and visibility'),fn:()=>openManageMembers(c)},
    {icon:c.visibility==='private'?'🌐':'🔒',label:c.visibility==='private'?t('nextlibrary','Make public'):t('nextlibrary','Make private'),fn:()=>{const nv=c.visibility==='private'?'public':'private';c.visibility=nv;api('PUT','/collections/'+c.id,{visibility:nv}).catch(apiErr);renderTree(el('kx-search').value);renderViewer();toast(nv==='private'?t('nextlibrary','Collection is now private'):t('nextlibrary','Collection is now public'));}},
    {sep:true},
    {icon:'🗑️',label:t('nextlibrary','Delete'),danger:true,fn:()=>{ if(!confirm(t('nextlibrary','Delete "{name}" and the {count} pages inside it? This cannot be undone.',{name:c.name,count:c.pages.length})))return; api('DELETE','/collections/'+c.id).catch(apiErr); colls=colls.filter(x=>x.id!==c.id); if(curColl===c.id){curColl=null;curPage=null;} renderTree();renderViewer();renderRecs();toast('Koleksiyon silindi'); }}
  ]);
}

/* -------- Yeni koleksiyon + üye ekle -------- */
// pendingMembers: Map(principal id → rol). Rol arayüzden SEÇİLMEZ (yetkiyi etkilemiyor,
// bkz. renderMemberChips) — var olan kayıtların rolü olduğu gibi korunsun diye Map kaldı;
// yeni üye 'editor' olarak eklenir. mVisibility: 'public'|'private'
let newEmojiVal='📘', newIconVal='', pendingMembers=new Map(), membersMode='create', manageColl=null, memberQ='', mVisibility='public';

/* Yeni koleksiyon modalındaki kart satırları — iç içe.
   Her satır kendi kimliğini (rid) ve üstünün kimliğini (parent) taşır; ağaç DOM'dan
   bu iki alanla kurulur. Satırlar hep "üstünün alt ağacının sonuna" eklenir, böylece
   ekrandaki sıra ile gerçek hiyerarşi aynı kalır. Derinlik sınırı yok. */
let rowSeq=0;
// Bir satırın alt ağacındaki SON satır (yeni çocuğun nereye ekleneceğini bulmak için)
function lastRowOfSubtree(container,rid){
  const rows=[...container.querySelectorAll('.page-field-row')];
  const i=rows.findIndex(r=>r.dataset.rid===rid);
  if(i<0)return null;
  const base=Number(rows[i].dataset.depth||0);
  let last=rows[i];
  for(let j=i+1;j<rows.length;j++){
    if(Number(rows[j].dataset.depth||0)>base)last=rows[j]; else break;
  }
  return last;
}
function addPageInputRow(title='',emoji='📄',parentRid=''){
  const container=el('newPagesContainer'); if(!container)return;
  const rid='r'+(++rowSeq);
  let depth=0;
  if(parentRid){
    const pr=container.querySelector('.page-field-row[data-rid="'+parentRid+'"]');
    depth=pr?Number(pr.dataset.depth||0)+1:0;
  }
  const row=document.createElement('div');
  row.className='field page-field-row';
  row.dataset.rid=rid; row.dataset.parent=parentRid; row.dataset.depth=String(depth);
  row.style.margin='8px 0';
  row.style.marginLeft=(depth*20)+'px';
  row.dataset.kind='page';
  row.innerHTML=`
    ${depth?'<span style="color:var(--ink-faint);font-size:12px;padding-right:2px">↳</span>':''}
    <button class="ep page-emoji-btn" type="button">${emoji}</button>
    <input class="page-title-input" placeholder="${esc(t('nextlibrary','Enter a page title …'))}" style="flex:1; border:none; outline:none; background:transparent; color:var(--ink); font-size:14px;" value="${esc(title)}" />
    <button class="page-kind-btn" type="button" style="border:1px solid var(--line); background:transparent; cursor:pointer; color:var(--ink-soft); font-size:11.5px; font-weight:600; padding:3px 8px; border-radius:8px; white-space:nowrap;"></button>
    <button class="page-child-btn" type="button" title="${esc(t('nextlibrary','Add a card inside'))}" style="border:none; background:transparent; cursor:pointer; color:var(--ink-faint); font-size:15px; padding:0 4px;">＋</button>
    <button class="page-remove-btn" type="button" style="border:none; background:transparent; cursor:pointer; color:var(--ink-faint); font-size:16px; padding:0 4px;">✕</button>
  `;
  const emoBtn=row.querySelector('.page-emoji-btn');
  emoBtn.onclick=()=>openEmoji(emoBtn,(e,x)=>{
    if(x){ row.dataset.icon=x.icon||''; emoBtn.innerHTML=x.icon?`<img class="kx-ico" src="${esc(iconURL(x.icon,0))}" alt="" style="width:18px;height:18px;object-fit:contain;border-radius:4px">`:'📄'; }
    else { row.dataset.icon=''; emoBtn.textContent=e; }
  },{collectionId:0,hasIcon:!!row.dataset.icon});
  // Tür seçici: 📄 Sayfa (yazı yazılır) ↔ 📁 Bölüm (yalnızca alt kartları gruplar).
  // Simge kullanıcı elle değiştirmediyse türle birlikte gider (📄 ↔ 📁).
  const kindBtn=row.querySelector('.page-kind-btn');
  const paintKind=()=>{
    const isFolder=row.dataset.kind==='folder';
    kindBtn.textContent=isFolder?'📁 '+t('nextlibrary','Section'):'📄 '+t('nextlibrary','Page');
    kindBtn.title=isFolder
      ? t('nextlibrary','Section: groups other cards, has no text of its own. Click to make it a page.')
      : t('nextlibrary','Page: a card you write in. Click to make it a section.');
  };
  kindBtn.onclick=()=>{
    const wasFolder=row.dataset.kind==='folder';
    row.dataset.kind=wasFolder?'page':'folder';
    const cur=emoBtn.textContent;
    if(cur==='📄'||cur==='📁')emoBtn.textContent=wasFolder?'📄':'📁';
    paintKind();
  };
  paintKind();
  row.querySelector('.page-child-btn').onclick=()=>{
    const created=addPageInputRow('','📄',rid);
    if(created)created.querySelector('.page-title-input').focus();
  };
  row.querySelector('.page-remove-btn').onclick=()=>{
    const rows=[...container.querySelectorAll('.page-field-row')];
    // Satır silinince altındakiler sahipsiz kalmasın → alt ağacıyla birlikte gider
    const i=rows.indexOf(row); const base=Number(row.dataset.depth||0);
    const doomed=[row];
    for(let j=i+1;j<rows.length;j++){ if(Number(rows[j].dataset.depth||0)>base)doomed.push(rows[j]); else break; }
    if(rows.length-doomed.length<1){ toast('En az bir sayfa eklemelisiniz'); return; }
    doomed.forEach(r=>r.remove());
  };
  // Üstü varsa onun alt ağacının hemen ardına, yoksa listenin sonuna
  const anchor=parentRid?lastRowOfSubtree(container,parentRid):null;
  if(anchor&&anchor.nextSibling)container.insertBefore(row,anchor.nextSibling);
  else container.appendChild(row);
  return row;
}
// Modaldaki düz satır listesini sunucunun beklediği ağaca çevirir
function collectPageTree(){
  const container=el('newPagesContainer'); if(!container)return [];
  const emptyHtml=`<p>${esc(t('nextlibrary','This page is empty. Press Edit to start writing.'))}</p>`;
  const byRid={}; const roots=[];
  [...container.querySelectorAll('.page-field-row')].forEach(row=>{
    const kind=row.dataset.kind==='folder'?'folder':'page';
    const node={
      kind:kind,
      icon:row.dataset.icon||'',
      emoji:row.dataset.icon?'📄':row.querySelector('.page-emoji-btn').textContent,
      title:row.querySelector('.page-title-input').value.trim(),
      html:kind==='folder'?'':emptyHtml,   // bölümün kendi yazısı olmaz
      children:[]
    };
    byRid[row.dataset.rid]=node;
    const par=row.dataset.parent;
    if(par&&byRid[par])byRid[par].children.push(node); else roots.push(node);
  });
  return roots;
}

el('newCollBtn').onclick=()=>{
  membersMode='create'; el('newName').value=''; newEmojiVal='📘'; newIconVal=''; el('newEmoji').textContent='📘';
  pendingMembers=new Map(); mVisibility='public'; renderNVis();
  const container=el('newPagesContainer');
  if(container){
    container.innerHTML='';
    addPageInputRow();
  }
  show('mdNew');
  setTimeout(()=>el('newName').focus(),50);
};
el('trashBtn').onclick=()=>openTrashBin();
// mdNew görünürlük seçici → butonlar + hint + footer aksiyon etiketi
ROOT.querySelectorAll('#nVis .mvis-btn').forEach(b=>b.addEventListener('click',()=>{mVisibility=b.dataset.vis==='private'?'private':'public';renderNVis();}));
function renderNVis(){
  ROOT.querySelectorAll('#nVis .mvis-btn').forEach(b=>b.classList.toggle('active',b.dataset.vis===mVisibility));
  const h=el('nVisHint'); if(h)h.textContent=mVisibility==='private'
    ? '🔒 '+t('nextlibrary','Private: only the members you add can see it. You pick them in the next step.')
    : '🌐 '+t('nextlibrary','Public: everyone signed in can read it. You do not need to add members.');
  const btn=el('toMembers'); if(btn)btn.textContent=mVisibility==='private'?t('nextlibrary','Choose members')+' →':t('nextlibrary','Create');
}
el('newEmoji').onclick=()=>openEmoji(el('newEmoji'),(e,x)=>{
  if(x){ newIconVal=x.icon||''; el('newEmoji').innerHTML=newIconVal?`<img class="kx-ico" src="${esc(iconURL(newIconVal,0))}" alt="" style="width:20px;height:20px;object-fit:contain;border-radius:4px">`:'📘'; }
  else { newIconVal=''; newEmojiVal=e; el('newEmoji').textContent=e; }
},{collectionId:0,hasIcon:!!newIconVal});
if(el('addPageFieldBtn'))el('addPageFieldBtn').onclick=()=>addPageInputRow();

el('toMembers').onclick=()=>{
  if(!el('newName').value.trim()){el('newName').focus();toast('Bir ad gir');return;}
  const inputs=[...el('newPagesContainer').querySelectorAll('.page-title-input')];
  const empty=inputs.some(inp=>!inp.value.trim());
  if(empty){
    toast(t('nextlibrary','Please fill in every page title'));
    const firstEmpty=inputs.find(inp=>!inp.value.trim());
    if(firstEmpty)firstEmpty.focus();
    return;
  }
  // Public: üye adımına gerek yok → doğrudan oluştur
  if(mVisibility!=='private'){ pendingMembers=new Map(); createCollection(); return; }
  // Özel: üye seçme sayfasına geç (görünürlük zaten özel → modaldaki seçici gizli)
  membersMode='create'; el('mdMembersTitle').textContent=t('nextlibrary','"{name}" · choose members',{name:el('newName').value.trim()}); pendingMembers=new Map(); memberQ=''; if(el('mSearch'))el('mSearch').value=''; memberResults={users:[],groups:[]};
  if(el('mVis'))el('mVis').style.display='none'; if(el('mVisHint'))el('mVisHint').style.display='none';
  renderMembers(); fetchMembers(); hide('mdNew'); show('mdMembers');
};
el('membersBack').onclick=()=>{ if(membersMode==='manage'){hide('mdMembers');} else {hide('mdMembers');show('mdNew');} };
function openManageMembers(c){ membersMode='manage'; manageColl=c; pendingMembers=new Map((c.members||[]).map(m=>[m.principal,m.role||'editor'])); mVisibility=c.visibility||'public'; memberQ=''; if(el('mSearch'))el('mSearch').value=''; memberResults={users:[],groups:[]}; if(el('mVis'))el('mVis').style.display=''; if(el('mVisHint'))el('mVisHint').style.display=''; el('mdMembersTitle').textContent=t('nextlibrary','"{name}" · members and visibility',{name:c.name}); el('membersBack').textContent=t('nextlibrary','Close'); renderMembers(); fetchMembers(); show('mdMembers'); }
const toMembersPayload=map=>[...map].map(([pid,role])=>({principal:pid,type:pType(pid),role:role==='reader'?'reader':'editor'}));
el('createColl').onclick=()=>{
  if(membersMode==='manage'){
    if(manageColl){
      api('PUT','/collections/'+manageColl.id+'/members',{members:toMembersPayload(pendingMembers),visibility:mVisibility})
        .then(c=>{ manageColl.members=(c.members||[]).map(m=>({principal:m.principal,role:m.role||'editor'})); manageColl.canEdit=!!c.canEdit; manageColl.visibility=c.visibility||'public'; renderTree(el('kx-search').value); renderViewer(); })
        .catch(apiErr);
    }
    hide('mdMembers'); toast(t('nextlibrary','Members and visibility updated')); return;
  }
  createCollection();
};
// Koleksiyonu oluştur (public → doğrudan mdNew'den; özel → üye seçiminden sonra)
function createCollection(){
  const name=el('newName').value.trim();if(!name)return;

  const pages=collectPageTree();   // iç içe: {emoji,title,html,children:[…]}

  api('POST','/collections',{name,emoji:newEmojiVal,icon:newIconVal,visibility:mVisibility,members:toMembersPayload(pendingMembers),pages})
    .then(nc=>{
      // Koleksiyon sunucuda oluştu; buradan sonrası arayüz çizimi (bkz. addPage).
      try{
        const mapped=mapColl(nc); colls.push(mapped); hide('mdMembers'); hide('mdNew'); openColls.add(mapped.id);
        if(mapped.pages[0])openPage(mapped.pages[0].id,false); else openCollection(mapped.id);
        toast(pendingMembers.size?t('nextlibrary','"{name}" created · {count} members',{name:name,count:pendingMembers.size}):t('nextlibrary','"{name}" created',{name:name}));
      }catch(err){ try{console.error('[NextLibrary render]',err);}catch(_){} }
    }).catch(apiErr);
};
let memberResults={users:[],groups:[]}, membersLoading=false;
// Gerçek NC kullanıcı/grup araması (debounce'lu); sonuçları PMETA'ya da işler
const doFetchMembers=debounce(()=>{
  api('GET','/principals'+(memberQ?('?q='+encodeURIComponent(memberQ)):''))
    .then(r=>{ membersLoading=false;
      memberResults={users:(r&&r.users)||[],groups:(r&&r.groups)||[]};
      memberResults.users.forEach(u=>setPMeta(u.id,u.name,'user'));
      memberResults.groups.forEach(g=>setPMeta(g.id,g.name,'group'));
      renderMemberResults(); })
    .catch(()=>{ membersLoading=false; memberResults={users:[],groups:[]}; renderMemberResults(); });
},250);
function fetchMembers(){ membersLoading=true; renderMemberResults(); doFetchMembers(); }
if(el('mSearch'))el('mSearch').addEventListener('input',e=>{memberQ=e.target.value.trim();fetchMembers();});
// Görünürlük düğmeleri (statik HTML) — bir kez bağla
ROOT.querySelectorAll('#mVis .mvis-btn').forEach(b=>b.addEventListener('click',()=>{mVisibility=b.dataset.vis==='private'?'private':'public';renderVisibility();}));

function renderVisibility(){
  ROOT.querySelectorAll('#mVis .mvis-btn').forEach(b=>b.classList.toggle('active',b.dataset.vis===mVisibility));
  const hint=el('mVisHint');
  if(hint)hint.textContent=mVisibility==='private'
    ? '🔒 '+t('nextlibrary','Private: only the members below can see it. Only administrators and editors can write.')
    : '🌐 '+t('nextlibrary','Public: everyone signed in can read it. Only administrators and editors can write.');
}
/* Üyelik = "bu özel koleksiyonu KİM GÖREBİLİR". Yazma yetkisi değil.
   Buradaki editör/okuyucu düğmesi kaldırıldı: rol hiçbir yetkiyi etkilemiyordu
   (sunucuda canEdit() yalnızca isAdmin'e bakıyordu), yani kullanıcıya var olmayan bir
   ayrım vaat ediyordu. Rol alanı API/DB'de 'editor' varsayılanıyla duruyor —
   şema değişmesin ve eski istemciler bozulmasın diye.
   1.7.0 NOT: yazma yetkisi artık admin'e ek olarak editörlerde de var, ama bu liste
   UYGULAMA GENELİ ve Yönetim → Bilgi Kartları'ndan yönetiliyor. members.role hâlâ
   hiçbir yetkiyi etkilemiyor; buraya rol düğmesi geri koymak yine yalan olur. */
function renderMemberChips(){
  el('mChips').innerHTML=[...pendingMembers].map(([id])=>{const nm=pName(id);const col=pColor(id);return `<span class="mchip"><span class="av" style="background:${col.c};color:${col.t}">${esc((nm[0]||'?').toUpperCase())}</span>${esc(nm)}<button class="x" data-un="${esc(id)}">✕</button></span>`;}).join('');
  el('mChips').querySelectorAll('[data-un]').forEach(b=>b.onclick=()=>{pendingMembers.delete(b.dataset.un);renderMemberChips();renderMemberResults();updateMemberFooter();});
}
function updateMemberFooter(){
  if(membersMode==='manage'){ el('createColl').textContent=t('nextlibrary','Save'); el('membersBack').textContent=t('nextlibrary','Close'); }
  else { el('createColl').textContent=pendingMembers.size?n('nextlibrary','Create with %n member','Create with %n members',pendingMembers.size):t('nextlibrary','Create without members'); el('membersBack').textContent=t('nextlibrary','Back'); }
}
function renderMemberResults(){
  const mrow=(id,name,isGroup)=>{const sel=pendingMembers.has(id);const col=pColor(id);const ic=isGroup?'👥':((name||'').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?');return `<div class="mrow ${sel?'sel':''}" data-id="${esc(id)}"><span class="av" style="background:${col.c};color:${col.t}">${ic}</span><span class="mname">${esc(name)}</span><span class="mck">✓</span></div>`;};
  const loadTxt='<div class="pg-empty">'+esc(t('nextlibrary','Searching …'))+'</div>';
  el('mAccounts').innerHTML=memberResults.users.map(u=>mrow(u.id,u.name,false)).join('')||(membersLoading?loadTxt:'<div class="pg-empty">'+esc(t('nextlibrary','No matching account'))+'</div>');
  el('mGroups').innerHTML=memberResults.groups.map(g=>mrow(g.id,g.name,true)).join('')||(membersLoading?loadTxt:'<div class="pg-empty">'+esc(t('nextlibrary','No matching group'))+'</div>');
  ROOT.querySelectorAll('#mAccounts .mrow, #mGroups .mrow').forEach(r=>r.onclick=()=>{const id=r.dataset.id;pendingMembers.has(id)?pendingMembers.delete(id):pendingMembers.set(id,'editor');renderMemberChips();renderMemberResults();updateMemberFooter();});
}
function renderMembers(){
  renderVisibility();
  renderMemberChips();
  renderMemberResults();
  updateMemberFooter();
}

/* -------- Emoji -------- */
const EMOJIS=['📄','📘','📕','📗','📙','📓','🗂️','⭐','🔥','💡','🚀','🎯','✅','📌','💬','🔒','🌍','📊','🧠','⚙️','🎓','❤️','😀','😎','👍','🎉','🌱','☁️','💰','🔑','🛡️','📈','🧩','🔗','📝','🤖','✍️','🔐','🧭','📔'];
let emojiCb=null;
/* Küçük çizgi ikonlar — emoji yerine (emoji simgeler işletim sistemine göre değişiyor
   ve düğme içinde orantısız duruyordu). currentColor kullanır, temaya uyar. */
const SVG_IMAGE='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15.5L16 10.5 5.5 21"/></svg>';
const SVG_UNDO='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-2"/></svg>';
const SVG_PAPERCLIP='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.4 11.05l-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 1 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.49"/></svg>';

/* Simge seçici. cb(emoji) emoji seçilince, cb(null,{icon:ad}) görsel yüklenince çağrılır;
   cb(null,{icon:''}) ise yüklenen görsel kaldırılıp emojiye dönülür. collectionId
   yüklemenin hangi koleksiyona ait olduğunu söyler; yoksa 0 (henüz oluşturulmamış
   koleksiyonun simgesi) gönderilir. */
function openEmoji(anchor,cb,opts){
  opts=opts||{};
  emojiCb=cb;
  const pop=el('emojiPop');pop.innerHTML='';
  if(opts.upload!==false){
    const bar=document.createElement('div'); bar.className='emoji-tools';
    const up=document.createElement('button'); up.className='emoji-up';
    up.innerHTML=SVG_IMAGE+'<span>'+esc(t('nextlibrary','Image'))+'</span>';
    up.title=t('nextlibrary','Use your own picture as the icon');
    up.onclick=()=>{ pop.classList.remove('show'); pickIconFile(opts.collectionId||0,name=>cb(null,{icon:name})); };
    bar.appendChild(up);
    if(opts.hasIcon){
      const rm=document.createElement('button'); rm.className='emoji-up';
      rm.innerHTML=SVG_UNDO+'<span>'+esc(t('nextlibrary','Emoji'))+'</span>';
      rm.title=t('nextlibrary','Remove the picture and use an emoji again');
      rm.onclick=()=>{ pop.classList.remove('show'); cb(null,{icon:''}); };
      bar.appendChild(rm);
    }
    pop.appendChild(bar);
  }
  EMOJIS.forEach(e=>{const b=document.createElement('button');b.textContent=e;b.onclick=()=>{emojiCb(e);pop.classList.remove('show')};pop.appendChild(b);});
  const r=anchor.getBoundingClientRect();pop.style.left=Math.min(r.left,innerWidth-330)+'px';pop.style.top=(r.bottom+6)+'px';pop.classList.add('show');
}
/* Simge dosyası seç → 128px'e küçült → sunucuya yükle → dosya adını geri ver.
   Simgeler küçücük olduğu için sayfa gövdesine gömülen görsellerden ayrı tutulur. */
function pickIconFile(collectionId,cb){
  const inp=document.createElement('input');
  inp.type='file'; inp.accept='image/png,image/jpeg,image/gif,image/webp';
  inp.onchange=()=>{
    const file=inp.files&&inp.files[0]; if(!file)return;
    downscaleImage(file,128,dataUrl=>{
      toast(t('nextlibrary','Uploading image …'));
      api('POST','/upload',{collectionId:collectionId||0,data:dataUrl})
        .then(r=>{ if(r&&r.name)cb(r.name); else toast(t('nextlibrary','Could not upload the image')); })
        .catch(apiErr);
    });
  };
  inp.click();
}
// Simge çizimi: yüklenmiş görsel varsa onu, yoksa emojiyi göster.
function iconURL(icon,collId){ return API_BASE+'/media/'+encodeURIComponent(collId||0)+'/'+encodeURIComponent(icon); }
function iconHTML(obj,collId,size){
  if(obj&&obj.icon)return `<img class="kx-ico" src="${esc(iconURL(obj.icon,collId))}" alt="" style="width:${size||18}px;height:${size||18}px;object-fit:contain;border-radius:4px;vertical-align:middle">`;
  return (obj&&obj.emoji)||'📄';
}
document.addEventListener('click',e=>{if(!e.target.closest('#emojiPop')&&!e.target.closest('[data-cmd=emoji]')&&!e.target.closest('#docEmoji')&&!e.target.closest('#newEmoji')&&!e.target.closest('.page-emoji-btn')&&!e.target.closest('.ctx-item'))el('emojiPop').classList.remove('show');});
document.addEventListener('click',e=>{const m=el('ctxMenu');if(m&&!e.target.closest('#ctxMenu')&&!e.target.closest('[data-pa]')&&!e.target.closest('[data-ca]'))m.classList.remove('show');});

/* -------- Arama -------- */
let allPages=()=>colls.flatMap(c=>c.pages.map(p=>({p,c})));
let hi=-1;
el('kx-search').addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase(); const res=el('results'); hi=-1;
  renderTree(e.target.value);
  if(!q){res.classList.remove('show');return;}
  const hits=allPages().filter(x=>(x.p.title+' '+stripHtml(x.p.html)).toLowerCase().includes(q)).slice(0,7);
  if(!hits.length){res.innerHTML='<div class="result"><span class="r-sub">'+esc(t('nextlibrary','No results'))+'</span></div>';res.classList.add('show');return;}
  res.innerHTML=hits.map(x=>`<div class="result" data-p="${x.p.id}"><span class="r-em">${iconHTML(x.p,x.c.id,16)}</span><span>${esc(x.p.title||t('nextlibrary','Untitled'))}<br><span class="r-sub">${esc(x.c.name)}</span></span></div>`).join('');
  res.classList.add('show');
  res.querySelectorAll('.result').forEach(r=>r.onclick=()=>{openPage(r.dataset.p);res.classList.remove('show');el('kx-search').value='';renderTree('');});
});
el('kx-search').addEventListener('keydown',e=>{
  const res=el('results');const items=[...res.querySelectorAll('.result[data-p]')];if(!items.length)return;
  if(e.key==='ArrowDown'){hi=(hi+1)%items.length;} else if(e.key==='ArrowUp'){hi=(hi-1+items.length)%items.length;}
  else if(e.key==='Enter'&&hi>=0){items[hi].click();return;} else if(e.key==='Escape'){res.classList.remove('show');return;} else return;
  items.forEach((it,i)=>it.classList.toggle('hi',i===hi));e.preventDefault();
});
document.addEventListener('click',e=>{if(!e.target.closest('.top-search'))el('results').classList.remove('show');});

/* -------- Tema anahtarı (kaydırmalı: sol=açık, sağ=koyu) -------- */
function applyTheme(){
  ROOT.setAttribute('data-theme',theme);
  const b=el('themeBtn'); if(!b)return;
  const dark=theme==='dark';
  b.setAttribute('aria-checked',dark?'true':'false');
  b.title=dark?t('nextlibrary','Switch to light theme'):t('nextlibrary','Switch to dark theme');
}
if(el('themeBtn'))el('themeBtn').onclick=()=>{ theme=theme==='dark'?'light':'dark'; LS.set('theme',theme); applyTheme(); };
applyTheme();

/* -------- Mobil menü -------- */
if(el('backBtn'))el('backBtn').onclick=goBack;
if(el('menuBtn'))el('menuBtn').onclick=()=>ROOT.classList.toggle('nav-open');
if(el('navOvl'))el('navOvl').onclick=()=>ROOT.classList.remove('nav-open');

/* -------- Rol önizleme -------- */
// Editör ↔ ziyaretçi önizlemesi yalnızca yazabilenler için anlamlı: yazamayan hesap
// zaten ziyaretçi durumundadır, düğmeyi görmesi kafa karıştırır.
function updateRoleBtn(){
  const b=el('roleBtn'); if(!b)return;
  b.style.display=canCreate?'':'none';
  b.textContent=previewAsVisitor?'👁 '+t('nextlibrary','Visitor'):'✏️ '+t('nextlibrary','Editor');
}
el('roleBtn').onclick=()=>{ previewAsVisitor=!previewAsVisitor; LS.set('previewAsVisitor',previewAsVisitor); if(previewAsVisitor)editing=false; updateRoleBtn(); renderTree(el('kx-search').value); renderViewer(); renderRecs(); renderTemplates(); toast(previewAsVisitor?t('nextlibrary','Visitor view — read only'):t('nextlibrary','Back to editor mode')); };
updateRoleBtn();

/* -------- Yardımcı -------- */
function show(id){el(id).classList.add('show');} function hide(id){el(id).classList.remove('show');}
ROOT.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>hide(b.dataset.close));
ROOT.querySelectorAll('.backdrop').forEach(bd=>bd.addEventListener('mousedown',e=>{if(e.target===bd)hide(bd.id);}));
function persistState(){LS.set('curColl',curColl);LS.set('curPage',curPage);LS.set('openColls',[...openColls]);LS.set('openPages',[...openPages]);}
let toastT;function toast(t){const e=el('toast');e.textContent=t;e.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>e.classList.remove('show'),2000);}



/* -------- Başlat -------- */
{ const v0=viewer(); if(v0)v0.innerHTML=`<div class="rail-empty" style="padding:48px 20px;text-align:center">${esc(t('nextlibrary','Loading …'))}</div>`; }

/* Şablon gövdesindeki görsel yer tutucusu. Tek bir delege dinleyici: yer tutucular
   her renderViewer'da yeniden basıldığı için tek tek bağlamak kopardı.
   YALNIZCA düzenleme modunda ve yazma yetkisi varken çalışır — okuyan kullanıcıya
   dosya seçici açıp ardından 403 vermek yanlış bir sözdü (CSS de imleci ona göre verir). */
ROOT.addEventListener('click',e=>{
  const ph=e.target.closest('.kx-img-placeholder'); if(!ph)return;
  // Aynı yer tutucu işaretlemesi şablon ÖNİZLEMELERİNDE de var (sağ raydaki mini
  // önizleme ve tam ekran modal). Oradaki tıklama yükleme başlatmamalı: kullanıcı
  // henüz kart oluşturmadı, yükleyecek bir sayfa yok → yalnızca belge gövdesi.
  if(!ph.closest('#kx-body'))return;
  const f=findPage(curPage);
  if(!editing||!f||!canEdit(f.coll))return;
  activePlaceholder=ph;
  pickImageFile();
});

/* Kod bloğundaki "Kopyala". Şablonda <button> DEĞİL <span>: BUTTON sanitizer'ın DROP
   listesinde, yani kart kaydedilir kaydedilmez içeriğiyle birlikte siliniyordu. SPAN +
   class hayatta kalıyor, tıklaması buradan delege ediliyor — hem önizlemede hem
   kaydedilmiş kartta çalışır. */
ROOT.addEventListener('click',e=>{
  const btn=e.target.closest('.kx-cb-copy'); if(!btn)return;
  const pre=btn.closest('.kx-code-block')&&btn.closest('.kx-code-block').querySelector('pre');
  if(!pre)return;
  const done=()=>toast(t('nextlibrary','Copied'));
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(pre.innerText).then(done,()=>{});
    return;
  }
  // Pano API'si yoksa (güvensiz bağlam / eski tarayıcı) seçim üzerinden kopyala
  try{
    const r=document.createRange(); r.selectNodeContents(pre);
    const s=getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('copy'); s.removeAllRanges(); done();
  }catch(_){}
});

wireRailTabs();
renderTemplates();   // canCreate henüz bilinmiyor → yetkisiz varsayılır, state gelince tazelenir

loadState(true).then(()=>{
  // Kimlik ancak state ile kesinleşir (OC.getCurrentUser okunamamış olabilir) → hesap
  // değişimi kontrolünü gerçek kimlikle şimdi yap.
  scopeViewToUser();
  // Tarayıcıda saklı görünüm durumu artık sunucu id'leriyle eşleşmiyorsa ana ekrana düş
  if(curColl&&!getColl(curColl))curColl=null;
  if(curPage&&!findPage(curPage))curPage=null;
  if(curColl)openColls.add(curColl);
  // canCreate ancak state geldikten sonra bilinir → yazma yetkisine bağlı düğmeleri şimdi tazele
  updateRoleBtn();
  renderTree(); renderViewer(); renderRecs(); renderTemplates(); updateBackBtnVisibility();
});
setInterval(updateTreeTimes,60000); // "x dk önce" etiketlerini canlı tut

/* -------- Delta senkronu: periyodik yoklama --------
   Sunucudaki delta makinesi (touchCollection / deleted feed / syncAt) hazırdı ama onu çağıran
   yoktu → başkasının değişikliği ancak sayfa elle yenilenince görünüyordu. Bağlayan yer burası. */
const SYNC_MS = 20000;
let syncing = false;

// Yoklamanın zarar vereceği anlar. Hepsi ayrı bir sebeple burada:
function syncPaused(){
  // Düzenleme sırasında re-render contenteditable'ı baştan yazar → imleç ve yazılan metin gider.
  if (editing) return true;
  // Kayıt uçuşta ya da çakışma modalı açık → bayat veri çekip kullanıcıyı kendisiyle çakıştırma.
  if (saveInFlight || savePendingPage || isConflictOpen) return true;
  // Kullanıcı bir modalın ortasında (koleksiyon oluşturma, üye seçme…) → altını değiştirme.
  if (ROOT.querySelector('.backdrop.show')) return true;
  // Sekme arkada → boşuna istek. Geri dönünce visibilitychange zaten hemen tazeliyor.
  if (document.hidden) return true;
  return false;
}

async function syncTick(){
  if (syncing || syncPaused()) return;
  syncing = true;
  try {
    const r = await loadState(false, true);
    // Değişiklik yokken render etme: #viewer baştan yazılırsa okuma pozisyonu başa sarar
    // ve sayfa giriş animasyonu her turda yeniden oynar.
    if (!r.ok || !r.changed) return;
    if (curColl && !getColl(curColl)) { curColl = null; curPage = null; }
    if (curPage && !findPage(curPage)) curPage = null;
    renderTree(el('kx-search').value); renderViewer(); renderRecs(); updateBackBtnVisibility();
  } finally { syncing = false; }
}

setInterval(syncTick, SYNC_MS);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) syncTick(); });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
