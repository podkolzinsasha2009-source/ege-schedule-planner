// ==========================================================================
// ФОТО НА ДОСКЕ «ХИМБИОРУС»
// Фото хранятся по пути images/<период>/<id> в координатах доски:
// перемещение, растяжение за углы, закрепление и удаление синхронизируются.
// ==========================================================================

(function () {
  'use strict';

  const MAX_SIDE = 1600;
  const MIN_SIZE = 40;
  const SYNC_INTERVAL = 120;

  let HB, Store, layer;
  let selectedId = null;
  let editPinned = false;
  let action = null; // { id, mode: 'move'|'resize', corner, start…, el }
  let lastSync = 0;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function periodId() {
    const p = HB.currentPeriod();
    return p ? p.id : 'default';
  }

  function periodImages() {
    return Store.get(`images/${periodId()}`) || {};
  }

  // ------------------------------------------------------------------ отрисовка

  function render() {
    const images = periodImages();
    const ids = Object.keys(images).sort((a, b) => (images[a].z || 0) - (images[b].z || 0));
    const existing = new Map($$('#photos-layer .photo').map(el => [el.dataset.id, el]));

    ids.forEach((id, index) => {
      const img = images[id];
      if (!img || !img.src) return;
      let el = existing.get(id);
      existing.delete(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'photo';
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
      if (!(action && action.id === id)) {
        el.style.left = img.x + 'px';
        el.style.top = img.y + 'px';
        el.style.width = img.w + 'px';
        el.style.height = img.h + 'px';
      }
      el.style.zIndex = String(index + 1);
      el.classList.toggle('is-pinned', !!img.pinned);
      el.classList.toggle('is-selected', id === selectedId);
      const pinBtn = el.querySelector('[data-photo="pin"]');
      pinBtn.textContent = img.pinned ? '📍 Открепить' : '📌 Закрепить';
    });

    existing.forEach(el => el.remove());
    if (selectedId && !images[selectedId]) selectedId = null;
    layer.classList.toggle('is-editing-pinned', editPinned);
  }

  function select(id) {
    selectedId = id;
    $$('#photos-layer .photo').forEach(el => el.classList.toggle('is-selected', el.dataset.id === id));
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
    const boardH = board.offsetHeight;

    let offset = 0;
    for (const file of list) {
      try {
        const { src, w, h } = await compress(file);
        const displayW = Math.min(360, w);
        const displayH = Math.round(displayW * h / w);
        // По центру видимой части доски (или там, куда бросили файл)
        const cx = clientX !== undefined ? clientX : Math.max(rect.left, 0) + Math.min(rect.width, window.innerWidth) / 2;
        const cy = clientY !== undefined ? clientY : Math.max(rect.top, 0) + Math.min(window.innerHeight, rect.bottom) / 2 - Math.max(rect.top, 0) / 2;
        const x = Math.max(0, Math.min(HB.BOARD.width - displayW, (cx - rect.left) / zoom - displayW / 2 + offset));
        const y = Math.max(0, Math.min(Math.max(0, boardH - displayH), (cy - rect.top) / zoom - displayH / 2 + offset));
        offset += 24;
        const id = Store.newId('i');
        Store.update({ [`images/${periodId()}/${id}`]: { src, x: Math.round(x), y: Math.round(y), w: displayW, h: displayH, z: Date.now() } });
        select(id);
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
      if (selectedId && !e.target.closest('.photo-tools')) {
        select(null);
        if (editPinned) { editPinned = false; render(); }
      }
      return;
    }
    const id = photo.dataset.id;
    const img = periodImages()[id];
    if (!img) return;

    const toolBtn = e.target.closest('[data-photo]');
    if (toolBtn) return;

    // На сенсорном экране первое касание только выделяет фото, чтобы не мешать прокрутке
    if (e.pointerType === 'touch' && selectedId !== id) {
      select(id);
      return;
    }
    select(id);
    e.preventDefault();
    e.stopPropagation();

    const corner = e.target.closest('.photo-handle');
    action = {
      id,
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
    el.style.top = c.y + 'px';
    el.style.width = c.w + 'px';
    el.style.height = c.h + 'px';

    const now = performance.now();
    if (now - lastSync > SYNC_INTERVAL) {
      lastSync = now;
      pushGeometry(action.id, c, true);
    }
  }

  function onPointerUp(e) {
    if (!action || action.pointerId !== e.pointerId) return;
    const done = action;
    action = null;
    if (done.moved) pushGeometry(done.id, done.current, false);
  }

  function pushGeometry(id, g, silent) {
    const base = `images/${periodId()}/${id}`;
    Store.update({ [`${base}/x`]: g.x, [`${base}/y`]: g.y, [`${base}/w`]: g.w, [`${base}/h`]: g.h }, { silent });
  }

  function onToolClick(e) {
    const btn = e.target.closest('[data-photo]');
    if (!btn) return;
    const photo = btn.closest('.photo');
    const id = photo && photo.dataset.id;
    const img = id && periodImages()[id];
    if (!img) return;
    e.stopPropagation();
    const base = `images/${periodId()}/${id}`;
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
      const pinned = Object.values(periodImages()).filter(i => i.pinned).length;
      if (!pinned) { HB.toast('На этом периоде нет закреплённых фото'); return; }
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
      if (!selectedId || e.target.closest('input, textarea') || document.body.classList.contains('has-modal')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (confirm('Удалить выбранное фото на всех устройствах?')) {
          Store.update({ [`images/${periodId()}/${selectedId}`]: null });
          select(null);
        }
      }
    });

    document.addEventListener('hb:period', () => { select(null); editPinned = false; render(); });
    Store.subscribe(({ paths }) => {
      if (paths.some(p => p === '/' || p.split('/').filter(Boolean)[0] === 'images')) render();
    });
    render();
  }

  if (window.HB) setup();
  else document.addEventListener('hb:ready', setup, { once: true });
})();
