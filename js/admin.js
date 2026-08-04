/**
 * NextLibrary — Yönetim → Bilgi Kartları ayar formu.
 *
 * Uygulamanın kendisinden (js/app.js) tamamen ayrı, küçük ve bağımsız bir betik.
 * Ortak bir yardımcı dosya YOK: app.js tek IIFE ve #kesif-app'e bağlı; buradan
 * çağrılamaz. Kopyalanan tek şey istek yardımcısıdır (~10 satır).
 *
 * Kullanıcı ve grup id'leri AYRI tutulur: teoride aynı id hem bir hesap hem bir grup
 * olabilir, tek listede birleştirilirse yanlış olan yetkilendirilir.
 */
(function () {
    'use strict';

    var root = document.getElementById('nextlibrary-admin');
    if (!root) {
        return; // ayar sayfası açık değil
    }

    var API = (window.OC && OC.generateUrl) ? OC.generateUrl('/apps/nextlibrary/api') : '/apps/nextlibrary/api';

    /** NC'nin çeviri fonksiyonu yoksa İngilizce kaynağı göster (boot'u öldürmesin). */
    function T(s) {
        try { if (window.t) { return window.t('nextlibrary', s); } } catch (e) { /* yoksay */ }
        return s;
    }

    function reqToken() {
        try { if (window.OC && OC.requestToken) { return OC.requestToken; } } catch (e) { /* yoksay */ }
        var m = document.querySelector('head meta[name=requesttoken]');
        return m ? m.getAttribute('content') : '';
    }

    function api(method, path, body) {
        var h = { 'requesttoken': reqToken() };
        var payload;
        if (body !== undefined) {
            h['Content-Type'] = 'application/json';
            payload = JSON.stringify(body);
        }
        return fetch(API + path, { method: method, headers: h, credentials: 'same-origin', body: payload })
            .then(function (r) {
                if (!r.ok) {
                    var err = new Error(String(r.status));
                    err.status = r.status;
                    throw err;
                }
                return r.json().catch(function () { return null; });
            });
    }

    var el = function (id) { return document.getElementById(id); };
    var chipsBox = el('nlibChips');
    var usersBox = el('nlibUsers');
    var groupsBox = el('nlibGroups');
    var searchBox = el('nlibSearch');
    var saveBtn = el('nlibSave');
    var statusBox = el('nlibStatus');

    /** Seçili editörler. Map(id → görünen ad). */
    var selUsers = new Map();
    var selGroups = new Map();
    /** Son arama sonucu. */
    var found = { users: [], groups: [] };
    var loading = false;

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function status(msg, isError) {
        statusBox.textContent = msg || '';
        statusBox.classList.toggle('is-error', !!isError);
    }

    // ───────────────────────── çizim ─────────────────────────

    function renderChips() {
        var parts = [];
        selUsers.forEach(function (name, id) {
            parts.push('<span class="nlib-chip"><span class="nlib-av">' +
                esc((name || id || '?').charAt(0).toUpperCase()) + '</span>' + esc(name || id) +
                '<button type="button" class="nlib-x" data-kind="user" data-id="' + esc(id) + '"' +
                ' aria-label="' + esc(T('Remove')) + '">✕</button></span>');
        });
        selGroups.forEach(function (name, id) {
            parts.push('<span class="nlib-chip is-group"><span class="nlib-av">👥</span>' +
                esc(name || id) +
                '<button type="button" class="nlib-x" data-kind="group" data-id="' + esc(id) + '"' +
                ' aria-label="' + esc(T('Remove')) + '">✕</button></span>');
        });

        chipsBox.innerHTML = parts.length
            ? parts.join('')
            : '<span class="nlib-empty">' + esc(T('No editors yet — only administrators can write.')) + '</span>';

        Array.prototype.forEach.call(chipsBox.querySelectorAll('.nlib-x'), function (b) {
            b.onclick = function () {
                (b.dataset.kind === 'group' ? selGroups : selUsers).delete(b.dataset.id);
                renderAll();
            };
        });
    }

    function renderList(box, items, isGroup) {
        var sel = isGroup ? selGroups : selUsers;
        if (loading) {
            box.innerHTML = '<div class="nlib-empty">' + esc(T('Searching …')) + '</div>';
            return;
        }
        if (!items.length) {
            box.innerHTML = '<div class="nlib-empty">' +
                esc(isGroup ? T('No matching group') : T('No matching account')) + '</div>';
            return;
        }
        box.innerHTML = items.map(function (it) {
            var on = sel.has(it.id);
            return '<div class="nlib-row' + (on ? ' is-sel' : '') + '" data-id="' + esc(it.id) + '"' +
                ' data-name="' + esc(it.name || it.id) + '" role="button" tabindex="0"' +
                ' aria-pressed="' + (on ? 'true' : 'false') + '">' +
                '<span class="nlib-av">' + (isGroup ? '👥' : esc((it.name || it.id || '?').charAt(0).toUpperCase())) + '</span>' +
                '<span class="nlib-name">' + esc(it.name || it.id) + '</span>' +
                '<span class="nlib-ck">✓</span></div>';
        }).join('');

        Array.prototype.forEach.call(box.querySelectorAll('.nlib-row'), function (r) {
            var toggle = function () {
                var id = r.dataset.id;
                if (sel.has(id)) { sel.delete(id); } else { sel.set(id, r.dataset.name); }
                renderAll();
            };
            r.onclick = toggle;
            r.onkeydown = function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
            };
        });
    }

    function renderAll() {
        renderChips();
        renderList(usersBox, found.users, false);
        renderList(groupsBox, found.groups, true);
    }

    // ───────────────────────── veri ─────────────────────────

    var searchTimer = null;
    function search() {
        var q = searchBox.value.trim();
        loading = true;
        renderAll();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
            api('GET', '/principals' + (q ? ('?q=' + encodeURIComponent(q)) : ''))
                .then(function (r) {
                    loading = false;
                    found = { users: (r && r.users) || [], groups: (r && r.groups) || [] };
                    renderAll();
                })
                .catch(function () {
                    loading = false;
                    found = { users: [], groups: [] };
                    renderAll();
                });
        }, 250);
    }

    function load() {
        api('GET', '/editors')
            .then(function (r) {
                selUsers = new Map(((r && r.users) || []).map(function (u) { return [u.id, u.name || u.id]; }));
                selGroups = new Map(((r && r.groups) || []).map(function (g) { return [g.id, g.name || g.id]; }));
                renderAll();
            })
            .catch(function (e) {
                status(e && e.status === 403
                    ? T('Only Nextcloud administrators can change this list. Editors cannot add or remove editors.')
                    : T('Could not load the editor list.'), true);
            });
    }

    saveBtn.onclick = function () {
        saveBtn.disabled = true;
        status(T('Saving …'), false);
        api('PUT', '/editors', {
            users: Array.from(selUsers.keys()),
            groups: Array.from(selGroups.keys())
        })
            .then(function (r) {
                // Sunucu var olmayan hesap/grupları eler → kaydedilen listeyi geri yazıyoruz,
                // ekranda kalan bir isim aslında yetki vermiyor olmasın.
                selUsers = new Map(((r && r.users) || []).map(function (u) { return [u.id, u.name || u.id]; }));
                selGroups = new Map(((r && r.groups) || []).map(function (g) { return [g.id, g.name || g.id]; }));
                renderAll();
                status(T('Editors saved'), false);
            })
            .catch(function (e) {
                status(e && e.status === 403 ? T('You are not allowed to do this') : T('Could not save — please try again.'), true);
            })
            .then(function () { saveBtn.disabled = false; });
    };

    searchBox.addEventListener('input', search);

    renderAll();
    load();
    search();
})();
