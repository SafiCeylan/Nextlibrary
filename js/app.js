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
function apiErr(e){ try{console.error('[NextLibrary API]',e);}catch(_){} toast(t('nextlibrary','Could not save to the server — check your connection')); }

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
function detectUser(){
  try{ if(window.OC&&typeof OC.getCurrentUser==='function'){const u=OC.getCurrentUser();if(u&&u.uid)return{id:u.uid,name:u.displayName||u.uid};} }catch(e){}
  return {id:'smc',name:'safi m. ceylan'};
}
let me=detectUser();
/* Aynı tarayıcıda farklı NC hesabıyla giriş yapılırsa (localStorage paylaşımlı) önceki
   kullanıcının açık koleksiyon/sayfa durumu miras alınmasın → ana ekrandan başlat. */
{ const lastUser=LS.get('lastUser',null);
  if(lastUser!==me.id){
    if(lastUser!==null){ curColl=null; curPage=null; openColls.clear();
      LS.set('curColl',null); LS.set('curPage',null); LS.set('openColls',[]); }
    LS.set('lastUser',me.id);
  }
}
function userName(id){ if(!id)return''; if(id===me.id)return me.name; return pName(id); }

/* -------- Rol / yetki (yetki sunucuda hesaplanır, coll.canEdit) -------- */
let previewAsVisitor=LS.get('previewAsVisitor',false);
function canEdit(coll){ if(previewAsVisitor||!coll)return false; return !!coll.canEdit; }

const save=()=>{}; // Kalıcılık artık sunucu API'si ile (apiSave*/pushPage çağrıları). Yerel yazma yok.
const getColl=id=>colls.find(c=>c.id===id);
const findPage=id=>{for(const c of colls){const p=c.pages.find(p=>p.id===id);if(p)return{coll:c,page:p};}return null;};
const flatPages=()=>{const a=[];colls.forEach(c=>c.pages.forEach(p=>a.push({c,p})));return a;};

/* -------- Sunucu ↔ model dönüşümü + yükleme -------- */
// Sunucu koleksiyonunu istemci model şekline çevir (id'ler string tutulur → tüm render kodu aynı kalır).
function mapColl(c){
  if(c.owner)setPMeta(c.owner,c.ownerName||c.owner,'user');
  (c.members||[]).forEach(m=>{ if(m&&m.principal!==undefined)setPMeta(m.principal,m.label||m.principal,m.type||'user'); });
  return {
    id:String(c.id), emoji:c.emoji||'📘', name:c.name||'', owner:c.owner,
    canEdit:!!c.canEdit, visibility:c.visibility||'public',
    members:(c.members||[]).map(m=>(m&&m.principal!==undefined)?{principal:m.principal,role:m.role||'editor'}:{principal:m,role:'editor'}),
    // updatedAt: optimistic locking (PUT /pages/{id} lastUpdatedAt) için şart — düşerse çakışma kontrolü sessizce devre dışı kalır.
    pages:((c.pages)||[]).map(p=>({id:String(p.id),emoji:p.emoji||'📄',title:p.title||'',html:p.html||'',sort:p.sort||0,updatedAt:p.updatedAt||0}))
  };
}
function applyState(st){
  if(st&&st.me&&st.me.id){ me={id:st.me.id,name:st.me.name||st.me.id}; }
  colls=((st&&st.collections)||[]).map(mapColl);
  reads={}; const rs=(st&&st.reads)||{}; Object.keys(rs).forEach(k=>{reads[String(k)]=rs[k];});
}
// Dönüş: bu delta gerçekten bir şey değiştirdi mi. Arka plan poll'u buna bakıp
// gereksiz re-render'dan kaçınır (bkz. syncTick).
function applySyncState(st) {
  if (!st) return false;
  let changed = false;
  if (st.me && st.me.id) { me = { id: st.me.id, name: st.me.name || st.me.id }; }

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
    try{ st=await api('POST','/import',{collections:seed()}); }catch(e){ apiErr(e); }
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
// Görseli sunucuya (NC appdata) yükle → dönen dosya adını /api/media/ URL'i olarak göm (base64 gömme yok)
function uploadImage(dataUrl){
  const f=findPage(curPage); const cid=f?f.coll.id:(curColl||'');
  if(!cid){ toast(t('nextlibrary','Open a collection or a page first')); return; }
  toast(t('nextlibrary','Uploading image …'));
  api('POST','/upload',{collectionId:cid,data:dataUrl})
    .then(r=>{ if(r&&r.name){ const url=API_BASE+'/media/'+encodeURIComponent(r.collectionId||cid)+'/'+encodeURIComponent(r.name); insertAtSaved(`<img src="${esc(url)}" alt="">`,true); }
               else { toast(t('nextlibrary','Could not upload the image')); } })
    .catch(apiErr);
}
function downscaleImage(file,maxW,cb){
  const rd=new FileReader();
  rd.onload=()=>{ const img=new Image(); img.onload=()=>{
      let w=img.width,h=img.height; if(w>maxW){ h=Math.round(h*maxW/w); w=maxW; }
      try{ const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').drawImage(img,0,0,w,h);
        const mime=file.type==='image/png'?'image/png':'image/jpeg';
        cb(cv.toDataURL(mime, mime==='image/jpeg'?0.82:undefined));
      }catch(e){ cb(rd.result); } // fallback: orijinal
    }; img.onerror=()=>toast(t('nextlibrary','Could not read the image')); img.src=rd.result; };
  rd.onerror=()=>toast(t('nextlibrary','Could not read the file')); rd.readAsDataURL(file);
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
    if(curColl && c.id !== curColl) return;
    const open=openColls.has(c.id);
    const wrap=document.createElement('div');wrap.className='coll'+(open?' open':'');
    const pages=c.pages.filter(p=>!q||p.title.toLowerCase().includes(q.toLowerCase()));
    const ce=canEdit(c);
    const total=c.pages.length, readN=c.pages.filter(p=>reads[p.id]).length, unread=total-readN, pct=total?Math.round(readN/total*100):0;
    wrap.innerHTML=`<div class="coll-row ${c.id===curColl?'active':''}" data-c="${c.id}">
        <span class="caret">▶</span><span class="cem">${c.emoji}</span><span class="cname">${esc(c.name)}</span>
        ${c.visibility==='private'?`<span class="cvis" title="${esc(t('nextlibrary','Private — only members can see it'))}">🔒</span>`:''}
        ${unread>0?`<span class="unread" title="${n('nextlibrary','%n unread page','%n unread pages',unread)}">${unread}</span>`:''}
        ${ce?`<span class="act"><button data-ca="add" title="Sayfa ekle">＋</button><button data-ca="menu" title="Eylemler">⋯</button></span>`:''}
      </div>
      ${total?`<div class="coll-prog" title="${readN}/${total} okundu (%${pct})"><span style="width:${pct}%"></span></div>`:''}
      <div class="pages">${pages.map(p=>`
        <div class="node-row ${p.id===curPage?'active':''}" data-p="${p.id}">
          <span class="nem">${p.emoji}</span><span class="nname">${esc(p.title||t('nextlibrary','Untitled'))}</span>
          ${reads[p.id]?`<span class="nread" title="En son okundu: ${readFull(reads[p.id])}">✓ ${timeAgo(reads[p.id])}</span>`:''}
          ${ce?`<span class="act"><button data-pa="menu" data-pid="${p.id}" title="Eylemler">⋯</button></span>`:''}
        </div>`).join('')||'<div class="pg-empty">Sayfa yok</div>'}</div>`;
    box.appendChild(wrap);
  });
  box.querySelectorAll('.coll-row').forEach(r=>r.onclick=e=>{
    const cid=r.dataset.c;
    const a=e.target.closest('[data-ca]');
    if(a){ if(a.dataset.ca==='add'){curColl=cid;openColls.add(cid);addPage();} else collActions(getColl(cid),a); return; }
    openCollection(cid); // aç/kapa mantığı openCollection içinde (çift toggle önlendi)
  });
  box.querySelectorAll('.node-row').forEach(r=>r.onclick=e=>{
    const a=e.target.closest('[data-pa]'); if(a){pageActions(a.dataset.pid,a);return;}
    openPage(r.dataset.p);
  });
  el('newCollBtn').style.display=previewAsVisitor?'none':'flex';
  el('trashBtn').style.display=previewAsVisitor?'none':'flex';
}
async function openTrashBin() {
  curColl = null;
  curPage = null;
  persistState();
  updateBackBtnVisibility();
  const v = el('viewer');
  v.innerHTML = `
    <div class="home">
      <div class="home-hero">
        <h1>🗑️ ${esc(t('nextlibrary','Trash bin'))}</h1>
        <p>${esc(t('nextlibrary','Deleted collections and pages are listed here. You can restore them or delete them for good.'))}</p>
      </div>
      <div class="rail-empty" style="padding: 24px 0;" id="trashLoading">${esc(t('nextlibrary','Loading …'))}</div>
      <div id="trashContent" style="display: none; padding: 0 16px;">
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
    tc.innerHTML = (trashData.collections || []).map(c => `
      <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-soft); padding: 12px 16px; border-radius: 12px; border: 1px solid var(--line);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 20px;">${c.emoji}</span>
          <div>
            <div style="font-weight: bold; color: var(--ink);">${esc(c.name)}</div>
            <div style="font-size: 11px; color: var(--ink-soft);">${esc(t('nextlibrary','Owner: {name}',{name:userName(c.owner)}))} · ${esc(t('nextlibrary','Deleted: {when}',{when:new Date(c.deletedAt).toLocaleDateString(LOCALE)}))}</div>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-ghost btn-sm" data-restore-coll="${c.id}" style="padding: 6px 12px; font-size: 12px;">${esc(t('nextlibrary','Restore'))}</button>
          <button class="btn btn-ghost btn-sm" data-purge-coll="${c.id}" style="padding: 6px 12px; font-size: 12px; color: var(--brand-danger, #d9534f);">${esc(t('nextlibrary','Delete for good'))}</button>
        </div>
      </div>
    `).join('') || '<div class="rail-empty">'+esc(t('nextlibrary','No deleted collections.'))+'</div>';
    tp.innerHTML = (trashData.pages || []).map(p => `
      <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-soft); padding: 12px 16px; border-radius: 12px; border: 1px solid var(--line);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 20px;">${p.emoji}</span>
          <div>
            <div style="font-weight: bold; color: var(--ink);">${esc(p.title || t('nextlibrary','Untitled'))}</div>
            <div style="font-size: 11px; color: var(--ink-soft);">${esc(t('nextlibrary','Deleted: {when}',{when:new Date(p.deletedAt).toLocaleDateString(LOCALE)}))}</div>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-ghost btn-sm" data-restore-page="${p.id}" style="padding: 6px 12px; font-size: 12px;">${esc(t('nextlibrary','Restore'))}</button>
          <button class="btn btn-ghost btn-sm" data-purge-page="${p.id}" style="padding: 6px 12px; font-size: 12px; color: var(--brand-danger, #d9534f);">${esc(t('nextlibrary','Delete for good'))}</button>
        </div>
      </div>
    `).join('') || '<div class="rail-empty">'+esc(t('nextlibrary','No deleted pages.'))+'</div>';

    // NC'nin CSP'si (nonce + strict-dynamic) inline onclick="" attribute'larını bloklar →
    // butonlar sessizce ölüydü. Kod tabanının geri kalanı gibi gerçek handler bağlıyoruz.
    content.querySelectorAll('[data-restore-coll]').forEach(b => b.onclick = () => kxRestoreCollection(b.dataset.restoreColl));
    content.querySelectorAll('[data-purge-coll]').forEach(b => b.onclick = () => kxPurgeCollection(b.dataset.purgeColl));
    content.querySelectorAll('[data-restore-page]').forEach(b => b.onclick = () => kxRestorePage(b.dataset.restorePage));
    content.querySelectorAll('[data-purge-page]').forEach(b => b.onclick = () => kxPurgePage(b.dataset.purgePage));
  } catch (e) {
    apiErr(e);
  }
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
  ROOT.classList.remove('nav-open'); persistState(); renderTree(el('kx-search').value); renderViewer(); renderRecs(); el('stage').scrollTo({top:0,behavior:'smooth'});
  updateBackBtnVisibility();
}
function goHome(){
  curPage=null; curColl=null; editing=false;
  openColls.clear();
  persistState(); renderTree(el('kx-search').value); renderViewer(); renderRecs(); el('stage').scrollTo({top:0,behavior:'smooth'});
  updateBackBtnVisibility();
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
  return `<div class="breadcrumbs">
    <span class="crumb" data-home>${esc(t('nextlibrary','Knowledge Cards'))}</span><span class="sep">›</span>
    <span class="crumb" data-c="${f.coll.id}">${esc(f.coll.name)}</span><span class="sep">›</span>
    <span class="crumb current">${esc(f.page.title||t('nextlibrary','Untitled'))}</span></div>`;
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
  const total=c.pages.length;
  const readN=c.pages.filter(p=>reads[p.id]).length;
  const pct=total?Math.round(readN/total*100):0;
  v.innerHTML=`<div class="breadcrumbs">
      <span class="crumb" data-home>${esc(t('nextlibrary','Knowledge Cards'))}</span><span class="sep">›</span>
      <span class="crumb current">${c.emoji} ${esc(c.name)}</span>
    </div>
    <div class="home">
      <div class="home-hero" style="display:flex;align-items:center;gap:16px;padding:20px 0 26px;">
        <span style="font-size:38px;background:var(--brand-soft);color:var(--brand-ink);width:64px;height:64px;border-radius:16px;display:grid;place-items:center;flex:none">${c.emoji}</span>
        <div style="flex:1;min-width:0">
          <h1 style="font-size:28px;font-weight:800;letter-spacing:-.5px;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</h1>
          <p style="color:var(--ink-soft);font-size:14px">${total} sayfa · ${readN}/${total} okundu (%${pct})</p>
        </div>
      </div>
      <div class="home-grid">
        ${c.pages.map(p=>{
          const isRead=!!reads[p.id];
          const snippet=stripHtml(p.html).slice(0,100);
          return `<button class="home-card" data-hpage="${p.id}" style="text-align:left;height:100%;display:flex;flex-direction:column;gap:8px">
            <span class="hc-em" style="width:36px;height:36px;font-size:18px;border-radius:9px;background:var(--brand-soft);display:grid;place-items:center">${p.emoji}</span>
            <span class="hc-name" style="font-size:14px;font-weight:700;color:var(--ink);margin-top:2px">${esc(p.title||t('nextlibrary','Untitled'))}</span>
            <span class="hc-meta" style="font-size:12px;color:var(--ink-soft);flex:1;line-height:1.4">${esc(snippet)}${snippet.length>=100?'...':''}</span>
            <span style="font-size:11px;font-weight:700;color:${isRead?'var(--brand)':'var(--ink-faint)'};display:flex;align-items:center;gap:4px;margin-top:auto">
              ${isRead?'✓ '+esc(t('nextlibrary','Read')):'◯ '+esc(t('nextlibrary','Unread'))}
            </span>
          </button>`;
        }).join('')||'<div class="rail-empty">'+esc(t('nextlibrary','No pages in this collection yet.'))+'</div>'}
      </div>
    </div>`;
  v.querySelectorAll('[data-hpage]').forEach(b=>{b.onclick=()=>openPage(b.dataset.hpage);});
  v.querySelectorAll('.crumb').forEach(cr=>{cr.onclick=()=>{if('home' in cr.dataset)goHome();};});
}

function renderViewer(){
  const f=findPage(curPage);
  const v=el('viewer');
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
       <button class="doc-emoji" id="docEmoji">${p.emoji}</button>
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
       <button class="tbtn" data-cmd="video" title="Video">🎬</button><span class="tsep"></span>
       <button class="tbtn" data-cmd="clear" title="${esc(t('nextlibrary','Clear formatting'))}">✧</button>
     </div>
     <div class="doc-content" id="kx-body" data-ph="${esc(t('nextlibrary','Add a note, a list or a link …'))}" contenteditable="${editing}">${sanitize(p.html)}</div>
   </div>
   <div class="prevnext" id="prevNext"></div>
   <div class="ex-wrap" id="exploreWrap"></div></div>`;

  if(edit){
    el('editToggle').onclick=()=>{ if(editing){savePage();editing=false;toast('Kaydedildi');}else editing=true; renderViewer(); if(editing)setTimeout(()=>el('docTitle').focus(),40); };
    el('docEmoji').onclick=()=>openEmoji(el('docEmoji'),e=>{p.emoji=e;el('docEmoji').textContent=e;pushPage(p.id,{emoji:e});renderTree(el('kx-search').value);});
    el('docTitle').addEventListener('input',debounce(()=>{p.title=el('docTitle').value;saveCurrentPage();renderTree(el('kx-search').value);},250));
    el('kx-body').addEventListener('input',debounce(()=>{p.html=sanitize(serializeBody());saveCurrentPage();},400));
    el('toolbar').addEventListener('click',toolbarClick);
    if(editing){ decorateEditMedia(); wireDropZone(el('kx-body')); }
  }
  el('viewer').querySelectorAll('.crumb').forEach(cr=>cr.onclick=()=>{ if('home' in cr.dataset){goHome();} else if(cr.dataset.c){openCollection(cr.dataset.c);} });
  wireReadCtl(p);
  renderPrevNext(f);
  renderExplore(f);
}
function savePage(){ const f=findPage(curPage); if(!f)return; f.page.title=el('docTitle').value; f.page.html=sanitize(serializeBody()); flushPage(); renderTree(el('kx-search').value); }

/* -------- Ana ekran (Akademi) -------- */
function renderHome(v){
  const first=me.name?me.name.split(' ')[0]:'';
  v.innerHTML=`<div class="home">
    <div class="home-hero"><h1>${first?esc(t('nextlibrary','Hello, {name}',{name:first})):esc(t('nextlibrary','Hello'))} 👋</h1><p>${esc(t('nextlibrary','Pick a collection to start reading. Your progress is saved automatically.'))}</p></div>
    <div class="home-grid">${colls.map(c=>{
      const total=c.pages.length, readN=c.pages.filter(p=>reads[p.id]).length, pct=total?Math.round(readN/total*100):0;
      return `<button class="home-card" data-hc="${c.id}">
        <span class="hc-em">${c.emoji}</span>
        <span class="hc-name">${esc(c.name)}</span>
        <span class="hc-meta">${total} sayfa · ${readN}/${total} okundu</span>
        <span class="hc-bar"><span style="width:${pct}%"></span></span></button>`;
    }).join('')||'<div class="rail-empty">'+esc(t('nextlibrary','No collections yet.'))+'</div>'}</div></div>`;
  v.querySelectorAll('[data-hc]').forEach(b=>b.onclick=()=>{openCollection(b.dataset.hc);});
}

/* -------- Önceki / sonraki ders -------- */
function renderPrevNext(f){
  const w=el('prevNext'); if(!w)return;
  const flat=flatPages(); const i=flat.findIndex(x=>x.p.id===f.page.id);
  const prev=i>0?flat[i-1]:null, next=i>=0&&i<flat.length-1?flat[i+1]:null;
  if(!prev&&!next){w.innerHTML='';return;}
  w.innerHTML=`${prev?`<button class="pn" data-p="${prev.p.id}"><span class="pn-dir">← ${esc(t('nextlibrary','Previous'))}</span><span class="pn-t">${prev.p.emoji} ${esc(prev.p.title||t('nextlibrary','Untitled'))}</span></button>`:'<span></span>'}
    ${next?`<button class="pn pn-next" data-p="${next.p.id}"><span class="pn-dir">${esc(t('nextlibrary','Next'))} →</span><span class="pn-t">${next.p.emoji} ${esc(next.p.title||t('nextlibrary','Untitled'))}</span></button>`:'<span></span>'}`;
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
  if(cmd==='image'||cmd==='video'||cmd==='block'||cmd==='color'||cmd==='hilite'||cmd==='align'){ saveSel(); }
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
    case 'emoji':openEmoji(b,em=>ins(em));break;
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

/* -------- Akıllı ilgili-sayfa mantığı -------- */
const STOP=new Set(['ve','ile','bir','bu','şu','için','ama','çok','daha','gibi','olan','olarak','the','and','veya','de','da','ki','mi','mı','ise','her','en','ne','ya']);
function words(s){return (s||'').toLowerCase().replace(/<[^>]+>/g,' ').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(w=>w.length>2&&!STOP.has(w));}
function relatedPages(page,coll,limit){
  const tw=new Set(words(page.title));
  const cw=new Set(words(stripHtml(page.html)));
  const scored=[];
  coll.pages.forEach(p=>{
    if(p.id===page.id)return;
    let s=0;
    words(p.title).forEach(w=>{ if(tw.has(w))s+=3; if(cw.has(w))s+=1; });
    words(stripHtml(p.html)).forEach(w=>{ if(tw.has(w))s+=1; });
    scored.push({p,c:coll,s});
  });
  scored.sort((a,b)=>b.s-a.s);
  let out=scored.filter(x=>x.s>0);
  if(out.length<limit){
    const rest=scored.filter(x=>x.s===0);
    out=out.concat(rest);
  }
  return out.slice(0,limit);
}

/* -------- Sağ öneriler -------- */
function renderRecs(){
  const box=el('recs');const f=findPage(curPage);
  if(!f){box.innerHTML='<div class="rail-empty">'+esc(t('nextlibrary','Select a page to start reading.'))+'</div>';return;}
  const rel=relatedPages(f.page,f.coll,6);
  if(!rel.length){box.innerHTML='<div class="rail-empty">'+esc(t('nextlibrary','No other pages.'))+'</div>';return;}
  box.innerHTML=rel.map(({p,c})=>`<button class="rec" data-p="${p.id}">
     <span class="rem">${p.emoji}</span><span><span class="rt">${esc(p.title||t('nextlibrary','Untitled'))}${reads[p.id]?' <span class="rec-ok">✓</span>':''}</span>
     <span class="rd">${esc(c.name)} · ${esc(stripHtml(p.html).slice(0,42))}…</span></span></button>`).join('');
  box.querySelectorAll('.rec').forEach(r=>r.onclick=()=>openPage(r.dataset.p));
}

/* -------- Sayfa altı "Buradan devam et" -------- */
function renderExplore(f){
  const w=el('exploreWrap'); if(!w)return;
  const rel=relatedPages(f.page,f.coll,4);
  if(!rel.length){w.innerHTML='';return;}
  w.innerHTML=`<div class="ex-head">Buradan devam et</div><div class="ex-grid">`+
    rel.map(({p,c})=>`<button class="topic-card" data-p="${p.id}">
       <span class="tc-ico">${p.emoji}</span>
       <span class="tc-tag">${esc(c.name)}</span>
       <span class="tc-title">${esc(p.title||t('nextlibrary','Untitled'))}</span>
       <span class="tc-desc">${esc(stripHtml(p.html).slice(0,80))}…</span>
       <span class="tc-go">${reads[p.id]?'✓ '+esc(t('nextlibrary','Read')):esc(t('nextlibrary','Open'))+' →'}</span></button>`).join('')+`</div>`;
  w.querySelectorAll('.topic-card').forEach(b=>b.onclick=()=>openPage(b.dataset.p));
}

/* -------- Sayfa/koleksiyon işlemleri (bağlam menüsü) -------- */
function addPage(){ const c=getColl(curColl);if(!c)return;
  api('POST','/collections/'+c.id+'/pages',{emoji:'📄',title:'',html:''}).then(p=>{
    const np={id:String(p.id),emoji:p.emoji||'📄',title:p.title||'',html:p.html||''};
    c.pages.push(np); openColls.add(c.id); openPage(np.id,true); toast('Sayfa eklendi');
  }).catch(apiErr);
}
function pageActions(pid,anchor){
  const f=findPage(pid);if(!f)return;
  openMenu(anchor,[
    {icon:'📄',label:t('nextlibrary','Open'),fn:()=>openPage(pid)},
    {icon:'✏️',label:t('nextlibrary','Rename'),fn:()=>{const v=prompt(t('nextlibrary','New page name:'),f.page.title||'');if(v&&v.trim()){f.page.title=v.trim();pushPage(pid,{title:f.page.title});renderTree(el('kx-search').value);if(curPage===pid)renderViewer();}}},
    {sep:true},
    {icon:'🗑️',label:t('nextlibrary','Delete'),danger:true,fn:()=>{ if(!confirm(t('nextlibrary','Delete the page "{title}"? This cannot be undone.',{title:f.page.title||t('nextlibrary','Untitled')})))return; api('DELETE','/pages/'+pid).catch(apiErr); f.coll.pages=f.coll.pages.filter(x=>x.id!==pid); if(curPage===pid)curPage=f.coll.pages[0]?.id||null; delete reads[pid]; renderTree(el('kx-search').value);renderViewer();renderRecs();toast('Sayfa silindi'); }}
  ]);
}
function collActions(c,anchor){
  openMenu(anchor,[
    {icon:'✏️',label:t('nextlibrary','Rename'),fn:()=>{const v=prompt(t('nextlibrary','New collection name:'),c.name);if(v&&v.trim()){c.name=v.trim();api('PUT','/collections/'+c.id,{name:c.name}).catch(apiErr);renderTree(el('kx-search').value);renderViewer();}}},
    {icon:'😀',label:t('nextlibrary','Change icon'),fn:()=>openEmoji(anchor,e=>{c.emoji=e;api('PUT','/collections/'+c.id,{emoji:e}).catch(apiErr);renderTree(el('kx-search').value);})},
    {icon:'👥',label:t('nextlibrary','Members and visibility'),fn:()=>openManageMembers(c)},
    {icon:c.visibility==='private'?'🌐':'🔒',label:c.visibility==='private'?t('nextlibrary','Make public'):t('nextlibrary','Make private'),fn:()=>{const nv=c.visibility==='private'?'public':'private';c.visibility=nv;api('PUT','/collections/'+c.id,{visibility:nv}).catch(apiErr);renderTree(el('kx-search').value);renderViewer();toast(nv==='private'?t('nextlibrary','Collection is now private'):t('nextlibrary','Collection is now public'));}},
    {sep:true},
    {icon:'🗑️',label:t('nextlibrary','Delete'),danger:true,fn:()=>{ if(!confirm(t('nextlibrary','Delete "{name}" and the {count} pages inside it? This cannot be undone.',{name:c.name,count:c.pages.length})))return; api('DELETE','/collections/'+c.id).catch(apiErr); colls=colls.filter(x=>x.id!==c.id); if(curColl===c.id){curColl=null;curPage=null;} renderTree();renderViewer();renderRecs();toast('Koleksiyon silindi'); }}
  ]);
}

/* -------- Yeni koleksiyon + üye ekle -------- */
// pendingMembers: Map(principal id → 'editor'|'reader'); mVisibility: 'public'|'private'
let newEmojiVal='📘', pendingMembers=new Map(), membersMode='create', manageColl=null, memberQ='', mVisibility='public';

function addPageInputRow(title='',emoji='📄'){
  const container=el('newPagesContainer'); if(!container)return;
  const row=document.createElement('div');
  row.className='field page-field-row';
  row.style.margin='8px 0';
  row.innerHTML=`
    <button class="ep page-emoji-btn" type="button">${emoji}</button>
    <input class="page-title-input" placeholder="${esc(t('nextlibrary','Enter a page title …'))}" style="flex:1; border:none; outline:none; background:transparent; color:var(--ink); font-size:14px;" value="${esc(title)}" />
    <button class="page-remove-btn" type="button" style="border:none; background:transparent; cursor:pointer; color:var(--ink-faint); font-size:16px; padding:0 4px;">✕</button>
  `;
  const emoBtn=row.querySelector('.page-emoji-btn');
  emoBtn.onclick=()=>openEmoji(emoBtn,e=>{emoBtn.textContent=e;});
  row.querySelector('.page-remove-btn').onclick=()=>{
    if(container.querySelectorAll('.page-field-row').length>1){
      row.remove();
    }else{
      toast('En az bir sayfa eklemelisiniz');
    }
  };
  container.appendChild(row);
}

el('newCollBtn').onclick=()=>{
  membersMode='create'; el('newName').value=''; newEmojiVal='📘'; el('newEmoji').textContent='📘';
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
el('newEmoji').onclick=()=>openEmoji(el('newEmoji'),e=>{newEmojiVal=e;el('newEmoji').textContent=e;});
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

  const pages=[];
  const rows=[...el('newPagesContainer').querySelectorAll('.page-field-row')];
  rows.forEach(row=>{
    const emoji=row.querySelector('.page-emoji-btn').textContent;
    const title=row.querySelector('.page-title-input').value.trim();
    pages.push({
      emoji:emoji,
      title:title,
      html:`<p>${esc(t('nextlibrary','This page is empty. Press Edit to start writing.'))}</p>`
    });
  });

  api('POST','/collections',{name,emoji:newEmojiVal,visibility:mVisibility,members:toMembersPayload(pendingMembers),pages})
    .then(nc=>{
      const mapped=mapColl(nc); colls.push(mapped); hide('mdMembers'); hide('mdNew'); openColls.add(mapped.id);
      if(mapped.pages[0])openPage(mapped.pages[0].id,false); else openCollection(mapped.id);
      toast(pendingMembers.size?t('nextlibrary','"{name}" created · {count} members',{name:name,count:pendingMembers.size}):t('nextlibrary','"{name}" created',{name:name}));
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
    ? '🔒 '+t('nextlibrary','Private: only the members below can see it. Editors can write, readers can only read.')
    : '🌐 '+t('nextlibrary','Public: everyone signed in can read it; the editors below can write.');
}
function renderMemberChips(){
  el('mChips').innerHTML=[...pendingMembers].map(([id,role])=>{const nm=pName(id);const col=pColor(id);const rd=role==='reader';return `<span class="mchip"><span class="av" style="background:${col.c};color:${col.t}">${esc((nm[0]||'?').toUpperCase())}</span>${esc(nm)}<button class="mrole" data-mrole="${esc(id)}" title="${esc(rd?t('nextlibrary','Reader (read only) — click to make editor'):t('nextlibrary','Editor (read and write) — click to make reader'))}">${rd?'👁':'✏️'}</button><button class="x" data-un="${esc(id)}">✕</button></span>`;}).join('');
  el('mChips').querySelectorAll('[data-un]').forEach(b=>b.onclick=()=>{pendingMembers.delete(b.dataset.un);renderMemberChips();renderMemberResults();updateMemberFooter();});
  el('mChips').querySelectorAll('[data-mrole]').forEach(b=>b.onclick=()=>{const id=b.dataset.mrole;pendingMembers.set(id,pendingMembers.get(id)==='reader'?'editor':'reader');renderMemberChips();});
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
function openEmoji(anchor,cb){ emojiCb=cb;const pop=el('emojiPop');pop.innerHTML='';EMOJIS.forEach(e=>{const b=document.createElement('button');b.textContent=e;b.onclick=()=>{emojiCb(e);pop.classList.remove('show')};pop.appendChild(b);});const r=anchor.getBoundingClientRect();pop.style.left=Math.min(r.left,innerWidth-330)+'px';pop.style.top=(r.bottom+6)+'px';pop.classList.add('show'); }
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
  res.innerHTML=hits.map(x=>`<div class="result" data-p="${x.p.id}"><span class="r-em">${x.p.emoji}</span><span>${esc(x.p.title||t('nextlibrary','Untitled'))}<br><span class="r-sub">${esc(x.c.name)}</span></span></div>`).join('');
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
function updateRoleBtn(){ el('roleBtn').textContent=previewAsVisitor?'👁 '+t('nextlibrary','Visitor'):'✏️ '+t('nextlibrary','Editor'); }
el('roleBtn').onclick=()=>{ previewAsVisitor=!previewAsVisitor; LS.set('previewAsVisitor',previewAsVisitor); if(previewAsVisitor)editing=false; updateRoleBtn(); renderTree(el('kx-search').value); renderViewer(); renderRecs(); toast(previewAsVisitor?t('nextlibrary','Visitor view — read only'):t('nextlibrary','Back to editor mode')); };
updateRoleBtn();

/* -------- Yardımcı -------- */
function show(id){el(id).classList.add('show');} function hide(id){el(id).classList.remove('show');}
ROOT.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>hide(b.dataset.close));
ROOT.querySelectorAll('.backdrop').forEach(bd=>bd.addEventListener('mousedown',e=>{if(e.target===bd)hide(bd.id);}));
function persistState(){LS.set('curColl',curColl);LS.set('curPage',curPage);LS.set('openColls',[...openColls]);}
let toastT;function toast(t){const e=el('toast');e.textContent=t;e.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>e.classList.remove('show'),2000);}



/* -------- Başlat -------- */
el('viewer').innerHTML=`<div class="rail-empty" style="padding:48px 20px;text-align:center">${esc(t('nextlibrary','Loading …'))}</div>`;
loadState(true).then(()=>{
  // Tarayıcıda saklı görünüm durumu artık sunucu id'leriyle eşleşmiyorsa ana ekrana düş
  if(curColl&&!getColl(curColl))curColl=null;
  if(curPage&&!findPage(curPage))curPage=null;
  if(curColl)openColls.add(curColl);
  renderTree(); renderViewer(); renderRecs(); updateBackBtnVisibility();
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
