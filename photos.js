// ==========================================================================
// ФОТО НА ДОСКЕ «ХИМБИОРУС»
// Фото хранятся по пути images/<период>/<id> в ЛОКАЛЬНЫХ для своего периода
// координатах доски (как и штрихи стилуса): при отрисовке к ним прибавляется
// смещение периода на общей ленте (HB.periodTop), а какому периоду принадлежит
// новое фото — определяется по координате добавления (HB.periodAt).
// Перемещение, растяжение за углы, закрепление и удаление синхронизируются.
// ==========================================================================

(function () {
  'use strict';

  const MAX_SIDE = 1600;
  const MIN_SIZE = 40;
  const SYNC_INTERVAL = 120;

  let HB, Store, layer;
  let selectedKey = null; // "<pid>/<id>"
  let editPinned = false;
  let action = null; // { key, pid, id, mode: 'move'|'resize', corner, start…, el }
  let lastSync = 0;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function keyOf(pid, id) { return pid + '/' + id; }

  // Период, видимый на экране прямо сейчас — используется, когда нет точки
  // добавления (кнопка «Фото», вставка из буфера обмена)
  function viewPeriodId() {
    const p = HB.currentPeriod();
    return p ? p.id : 'default';
  }

  function imageAt(pid, id) {
    return Store.get(`images/${pid}/${id}`);
  }

  // ------------------------------------------------------------------ отрисовка

  function render() {
    const allImgs = Store.get('images') || {};
    const existing = new Map($$('#photos-layer .photo').map(el => [el.dataset.key, el]));
    const seenKeys = new Set();

    Object.keys(allImgs).forEach(pid => {
      const top = HB.periodTop(pid);
      const images = allImgs[pid] || {};
      const ids = Object.keys(images).sort((a, b) => (images[a].z || 0) - (images[b].z || 0));
      ids.forEach((id, index) => {
        const img = images[id];
        if (!img || !img.src) return;
        const key = keyOf(pid, id);
        seenKeys.add(key);
        let el = existing.get(key);
        existing.delete(key);
        if (!el) {
          el = document.createElement('div');
          el.className = 'photo';
          el.dataset.key = key;
          el.dataset.pid = pid;
          el.dataset.id = id;
          el.innerHTML = `
            <img alt="" draggable="false">
            <div class="photo-frame">
              <span class="photo-handle" data-corner="nw"></span>
              <span class="photo-handle" data-corner="ne"></span>
              <span class="photo-handle" data-corner="sw"></span>
              <span class="photo-handle" data-corner="se"></span>
            </div>
            <div class="photo-tools">
              <button type="button" data-photo="pin" aria-label="Закрепить"></button>
              <button type="button" data-photo="front" aria-label="На передний план">⬆</button>
              <button type="button" data-photo="delete" aria-label="Удалить">✕</button>
            </div>`;
          layer.appendChild(el);
        }
        const imgEl = el.querySelector('img');
        if (imgEl.getAttribute('src') !== img.src) imgEl.setAttribute('src', img.src);
        if (!(action && action.key === key)) {
          el.style.left = img.x + 'px';
          el.style.top = (top + img.y) + 'px';
          el.style.width = img.w + 'px';
          el.style.height = img.h + 'px';
        }
        el.style.zIndex = String(index + 1);
        el.classList.toggle('is-pinned', !!img.pinned);
        el.classList.toggle('is-selected', key === selectedKey);
        const pinBtn = el.querySelector('[data-photo="pin"]');
        pinBtn.textContent = img.pinned ? '📍 Открепить' : '📌 Закрепить';
      });
    });

    existing.forEach(el => el.remove());
    if (selectedKey && !seenKeys.has(selectedKey)) selectedKey = null;
    layer.classList.toggle('is-editing-pinned', editPinned);
  }

  function select(key) {
    selectedKey = key;
    $$('#photos-layer .photo').forEach(el => el.classList.toggle('is-selected', el.dataset.key === key));
  }

  // ------------------------------------------------------------------ добавление

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function compress(file) {
    const img = await loadImage(await readFile(file));
    let side = MAX_SIDE, quality = 0.82, out = null, w = 0, h = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      w = Math.max(1, Math.round(img.naturalWidth * k));
      h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      out = c.toDataURL('image/jpeg', quality);
      c.width = 0; c.height = 0;
      if (out.length < 900000) break;
      side = Math.round(side * 0.75);
      quality -= 0.07;
    }
    return { src: out, w, h };
  }

  function periodCenterGlobalY(pid) {
    const p = (HB.periodLayout() || []).find(x => x.id === pid);
    return p ? p.top + p.height / 2 : 0;
  }

  async function addFiles(files, clientX, clientY) {
    const list = Array.from(files || []).filter(f => /^image\//.test(f.type));
    if (!list.length) return;
    if (document.querySelector('#board').classList.contains('layers-hidden')) {
      HB.toast('Сбросьте фильтры, чтобы добавить фото');
      return;
    }
    HB.toast('Загружаю фото…');
    const board = $('#board');
    const rect = board.getBoundingClientRect();
    const zoom = HB.ui.zoom;

    // Куда положить фото: под точкой броска/клика или в центр видимого периода
    const globalY = clientY !== undefined ? (clientY - rect.top) / zoom : periodCenterGlobalY(viewPeriodId());
    const period = HB.periodAt(globalY);
    const pid = period.id;
    const localCenterX = clientX !== undefined ? (clientX - rect.left) / zoom : HB.BOARD.width / 2;
    const localCenterY = globalY - period.top;

    let offset = 0;
    for (const file of list) {
      try {
        const { src, w, h } = await compress(file);
        const displayW = Math.min(360, w);
        const displayH = Math.round(displayW * h / w);
        const x = Math.max(0, Math.min(HB.BOARD.width - displayW, localCenterX - displayW / 2 + offset));
        const y = Math.max(0, Math.min(Math.max(0, period.height - displayH), localCenterY - displayH / 2 + offset));
        offset += 24;
        const id = Store.newId('i');
        Store.update({ [`images/${pid}/${id}`]: { src, x: Math.round(x), y: Math.round(y), w: displayW, h: displayH, z: Date.now() } });
        select(keyOf(pid, id));
      } catch (err) {
        console.error(err);
        HB.toast('Не удалось открыть фото');
      }
    }
    HB.toast('Фото добавлено — тяните за углы, чтобы изменить размер');
  }

  // ------------------------------------------------------------------ перемещение и растяжение

  function onPointerDown(e) {
    if (HB.ui.drawMode) return;
    const photo = e.target.closest('#photos-layer .photo');
    if (!photo) {
      if (selectedKey && !e.target.closest('.photo-tools')) {
        select(null);
        if (editPinned) { editPinned = false; render(); }
      }
      return;
    }
    const pid = photo.dataset.pid, id = photo.dataset.id, key = photo.dataset.key;
    const img = imageAt(pid, id);
    if (!img) return;

    const toolBtn = e.target.closest('[data-photo]');
    if (toolBtn) return;

    // На сенсорном экране первое касание только выделяет фото, чтобы не мешать прокрутке
    if (e.pointerType === 'touch' && selectedKey !== key) {
      select(key);
      return;
    }
    select(key);
    e.preventDefault();
    e.stopPropagation();

    const corner = e.target.closest('.photo-handle');
    action = {
      key, pid, id,
      el: photo,
      pointerId: e.pointerId,
      mode: corner ? 'resize' : 'move',
      corner: corner ? corner.dataset.corner : null,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: img.x, y: img.y, w: img.w, h: img.h },
      current: { x: img.x, y: img.y, w: img.w, h: img.h },
      moved: false
    };
    try { photo.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function onPointerMove(e) {
    if (!action || action.pointerId !== e.pointerId) return;
    e.preventDefault();
    const zoom = HB.ui.zoom;
    const dx = (e.clientX - action.startX) / zoom;
    const dy = (e.clientY - action.startY) / zoom;
    if (Math.abs(dx) + Math.abs(dy) > 2) action.moved = true;
    const o = action.orig;
    const c = action.current;

    if (action.mode === 'move') {
      c.x = Math.round(o.x + dx);
      c.y = Math.round(o.y + dy);
    } else {
      const ratio = o.w / o.h;
      const signX = action.corner.includes('e') ? 1 : -1;
      const signY = action.corner.includes('s') ? 1 : -1;
      let w = Math.max(MIN_SIZE, o.w + dx * signX);
      let h = Math.max(MIN_SIZE, o.h + dy * signY);
      if (!e.shiftKey) {
        // Сохраняем пропорции: берём большее из изменений
        if (Math.abs(dx) * o.h > Math.abs(dy) * o.w) h = w / ratio; else w = h * ratio;
      }
      c.w = Math.round(w);
      c.h = Math.round(h);
      c.x = Math.round(signX < 0 ? o.x + (o.w - c.w) : o.x);
      c.y = Math.round(signY < 0 ? o.y + (o.h - c.h) : o.y);
    }

    const el = action.el;
    el.style.left = c.x + 'px';
    el.style.top = (HB.periodTop(action.pid) + c.y) + 'px';
    el.style.width = c.w + 'px';
    el.style.height = c.h + 'px';

    const now = performance.now();
    if (now - lastSync > SYNC_INTERVAL) {
      lastSync = now;
      pushGeometry(action.pid, action.id, c, true);
    }
  }

  function onPointerUp(e) {
    if (!action || action.pointerId !== e.pointerId) return;
    const done = action;
    action = null;
    if (done.moved) pushGeometry(done.pid, done.id, done.current, false);
  }

  function pushGeometry(pid, id, g, silent) {
    const base = `images/${pid}/${id}`;
    Store.update({ [`${base}/x`]: g.x, [`${base}/y`]: g.y, [`${base}/w`]: g.w, [`${base}/h`]: g.h }, { silent });
  }

  function onToolClick(e) {
    const btn = e.target.closest('[data-photo]');
    if (!btn) return;
    const photo = btn.closest('.photo');
    const pid = photo && photo.dataset.pid, id = photo && photo.dataset.id;
    const img = pid && id && imageAt(pid, id);
    if (!img) return;
    e.stopPropagation();
    const base = `images/${pid}/${id}`;
    if (btn.dataset.photo === 'pin') {
      Store.update({ [`${base}/pinned`]: img.pinned ? null : true });
      if (!img.pinned) { select(null); editPinned = false; HB.toast('Фото закреплено — теперь поверх можно писать и двигать плашки'); }
    } else if (btn.dataset.photo === 'front') {
      Store.update({ [`${base}/z`]: Date.now() });
    } else if (btn.dataset.photo === 'delete') {
      if (confirm('Удалить это фото на всех устройствах?')) {
        Store.update({ [base]: null });
        select(null);
      }
    }
  }

  // ------------------------------------------------------------------ запуск

  function setup() {
    HB = window.HB;
    Store = HB.store;
    layer = $('#photos-layer');

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    layer.addEventListener('click', onToolClick);

    const input = $('#photo-input');
    $$('[data-action="add-photo"]').forEach(b => b.addEventListener('click', () => input.click()));
    input.addEventListener('change', () => {
      addFiles(input.files);
      input.value = '';
    });
    $$('[data-action="edit-pinned"]').forEach(b => b.addEventListener('click', () => {
      const all = Store.get('images') || {};
      const anyPinned = Object.values(all).some(images => Object.values(images || {}).some(i => i.pinned));
      if (!anyPinned) { HB.toast('Нет закреплённых фото'); return; }
      editPinned = true;
      render();
      HB.toast('Закреплённые фото можно выделить и открепить');
    }));

    // Вставка из буфера обмена (Ctrl+V) и перетаскивание файлов на доску
    document.addEventListener('paste', (e) => {
      if (e.target.closest('input, textarea')) return;
      const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
      if (files.length) { e.preventDefault(); addFiles(files); }
    });
    const viewport = $('#board-viewport');
    viewport.addEventListener('dragover', (e) => {
      if (Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); viewport.classList.add('is-file-over'); }
    });
    viewport.addEventListener('dragleave', () => viewport.classList.remove('is-file-over'));
    viewport.addEventListener('drop', (e) => {
      viewport.classList.remove('is-file-over');
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      addFiles(e.dataTransfer.files, e.clientX, e.clientY);
    });

    document.addEventListener('keydown', (e) => {
      if (!selectedKey || e.target.closest('input, textarea') || document.body.classList.contains('has-modal')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (confirm('Удалить выбранное фото на всех устройствах?')) {
          Store.update({ [`images/${selectedKey}`]: null });
          select(null);
        }
      }
    });

    Store.subscribe(({ paths }) => {
      if (paths.some(p => p === '/' || p.split('/').filter(Boolean)[0] === 'images')) render();
    });
    render();
  }

  if (window.HB) setup();
  else document.addEventListener('hb:ready', setup, { once: true });
})();
