// ==========================================================================
// ПЛАНИРОВЩИК «ХИМБИОРУС ЕГЭ» — доска расписания
// Периоды, плашки, перетаскивание, фильтры, масштаб доски, окна и меню.
// Данные живут в HBStore (store.js), стилус — в ink.js, фото — в photos.js.
// ==========================================================================

(function () {
  'use strict';

  const Store = window.HBStore;
  const COURSE = Array.isArray(window.COURSE_DATA) ? window.COURSE_DATA : [];

  // Геометрия доски в «логических» пикселях — одинаковая на всех устройствах,
  // поэтому штрихи и фото ложатся в одно и то же место на ПК, планшете и телефоне.
  const BOARD = { width: 1480, column: 200, gap: 8, pad: 16 };

  const SUBJECTS = {
    bio: { label: 'Биология', short: 'Био' },
    chem: { label: 'Химия', short: 'Хим' },
    rus: { label: 'Русский', short: 'Рус' },
    general: { label: 'Общее', short: 'Общ' }
  };

  const CATEGORIES = {
    theory: 'Теория',
    practice: 'Практика',
    test: 'Тест',
    homework: 'Письменное ДЗ',
    webinar: 'Вебинар',
    mock: 'Пробник',
    review: 'Разбор',
    attestation: 'Аттестация',
    credit: 'Зачёт',
    payment: 'Оплата'
  };

  const ICONS = {
    plus: { sign: '+', label: 'Дополнительный вебинар' },
    check: { sign: '✓', label: 'Зачёт' },
    alert: { sign: '!', label: 'Рубежная аттестация' }
  };

  const ui = {
    periodIndex: 0,
    subject: 'all',
    category: 'all',
    showCompanions: true,
    query: '',
    zoomMode: 'fit',
    zoom: 1,
    drawMode: false
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ------------------------------------------------------------------ данные

  const dayIndex = {}; // dateKey → periodIndex
  COURSE.forEach((p, i) => Object.keys(p.days || {}).forEach(d => { dayIndex[d] = i; }));

  function currentPeriod() {
    return COURSE[ui.periodIndex] || null;
  }

  function allItems() {
    const items = Store.get('items') || {};
    return Object.keys(items).map(id => Object.assign({ id }, items[id]));
  }

  function itemsByDate() {
    const map = {};
    allItems().forEach(it => {
      const key = (it.date && dayIndex[it.date] !== undefined) ? it.date : 'backlog';
      (map[key] = map[key] || []).push(it);
    });
    Object.values(map).forEach(list => list.sort((a, b) => (a.order || 0) - (b.order || 0)));
    return map;
  }

  function isVisible(it) {
    if (!ui.showCompanions && it.isCompanion) return false;
    if (ui.subject !== 'all' && it.subject !== ui.subject && it.subject !== 'general') return false;
    if (ui.category !== 'all' && it.category !== ui.category) return false;
    if (ui.query) {
      const q = ui.query.toLowerCase();
      if (!`${it.title || ''} ${it.subtitle || ''} ${it.time || ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }

  function filtersActive() {
    return ui.subject !== 'all' || ui.category !== 'all' || !ui.showCompanions || !!ui.query;
  }

  // Первичные данные: сохранённое старой версией расписание или исходное из PDF
  function buildSeed() {
    const items = {};
    let periods = null;
    try {
      const legacy = JSON.parse(lsGet('himbiorus_schedule_state_v2') || 'null');
      if (legacy && legacy.periods) periods = legacy.periods;
    } catch (e) {}
    if (!periods || countLegacyItems(periods) === 0) periods = COURSE;

    const add = (it, date, order) => {
      if (!it || !it.id || /[.#$\[\]\/]/.test(it.id)) return;
      const rec = { title: it.title || 'Без названия', subject: it.subject || 'general', category: it.category || 'theory', date, order };
      ['subtitle', 'time', 'icon', 'parentId'].forEach(k => { if (it[k]) rec[k] = it[k]; });
      if (it.completed) rec.completed = true;
      if (it.isCompanion) rec.isCompanion = true;
      items[it.id] = rec;
    };

    toArray(periods).forEach(p => {
      Object.keys((p && p.days) || {}).forEach(dateKey => {
        toArray(p.days[dateKey] && p.days[dateKey].items).forEach((it, i) => add(it, dateKey, (i + 1) * 1000));
      });
    });
    try {
      const legacy = JSON.parse(lsGet('himbiorus_schedule_state_v2') || 'null');
      toArray(legacy && legacy.backlog).forEach((it, i) => add(it, 'backlog', (i + 1) * 1000));
    } catch (e) {}

    // Фото из старой версии
    const images = {};
    COURSE.forEach(p => {
      try {
        const list = JSON.parse(lsGet('himbiorus_images_' + p.id) || '[]');
        toArray(list).forEach(img => {
          if (!img || !img.src || !img.id) return;
          (images[p.id] = images[p.id] || {})[img.id.replace(/[.#$\[\]\/]/g, '_')] = {
            src: img.src, x: img.x || 40, y: img.y || 40, w: img.width || 240, h: img.height || 180, pinned: !!img.pinned, z: Date.now()
          };
        });
      } catch (e) {}
    });

    const seed = { items };
    if (Object.keys(images).length) seed.images = images;
    return seed;
  }

  function toArray(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    if (v && typeof v === 'object') return Object.values(v).filter(Boolean);
    return [];
  }

  function countLegacyItems(periods) {
    let n = 0;
    toArray(periods).forEach(p => Object.values((p && p.days) || {}).forEach(d => { n += toArray(d && d.items).length; }));
    return n;
  }

  function courseItems() {
    const items = {};
    COURSE.forEach(p => Object.keys(p.days).forEach(dateKey => {
      p.days[dateKey].items.forEach((it, i) => {
        const rec = { title: it.title, subject: it.subject, category: it.category, date: dateKey, order: (i + 1) * 1000 };
        ['subtitle', 'time', 'icon', 'parentId'].forEach(k => { if (it[k]) rec[k] = it[k]; });
        if (it.isCompanion) rec.isCompanion = true;
        items[it.id] = rec;
      });
    }));
    return items;
  }

  // ------------------------------------------------------------------ отрисовка

  function cardHtml(it) {
    const subject = SUBJECTS[it.subject] || SUBJECTS.general;
    const category = CATEGORIES[it.category] || '';
    const icon = ICONS[it.icon];
    const typeLabel = it.isCompanion ? (it.category === 'homework' ? 'ДЗ' : 'Тест') : category;
    return `
      <div class="card ${it.subject || 'general'} cat-${it.category || 'theory'}${it.isCompanion ? ' is-companion' : ''}${it.completed ? ' is-done' : ''}" data-id="${escapeHtml(it.id)}">
        <div class="card-top">
          <span class="pill subject">${subject.label}</span>
          <span class="pill type">${escapeHtml(typeLabel)}</span>
          ${icon ? `<span class="pill icon" title="${icon.label}">${icon.sign}</span>` : ''}
          ${it.time ? `<span class="card-time">${escapeHtml(it.time)}</span>` : ''}
          <button class="card-check" type="button" role="checkbox" aria-checked="${it.completed ? 'true' : 'false'}" aria-label="Выполнено"></button>
        </div>
        <div class="card-title">${escapeHtml(it.title)}</div>
        ${it.subtitle ? `<div class="card-sub">${escapeHtml(it.subtitle)}</div>` : ''}
      </div>`;
  }

  let renderQueued = false;
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    let fallback = null;
    const run = () => {
      if (!renderQueued) return;
      renderQueued = false;
      clearTimeout(fallback);
      renderBoard();
      renderBacklog();
      renderProgress();
    };
    requestAnimationFrame(run);
    // Кадры анимации не приходят в фоновой вкладке — дорисуем по таймеру
    fallback = setTimeout(run, 120);
  }

  function renderBoard() {
    const period = currentPeriod();
    const weeksEl = $('#weeks');
    if (!period || !weeksEl) return;
    if (drag.active) return; // не перерисовываем под пальцем — дорисуем после броска

    const byDate = itemsByDate();
    const dates = Object.keys(period.days);
    const weeks = [];
    for (let i = 0; i < dates.length; i += 7) weeks.push(dates.slice(i, i + 7));

    weeksEl.innerHTML = weeks.map(week => `
      <div class="week">
        ${week.map(dateKey => {
          const day = period.days[dateKey];
          const list = (byDate[dateKey] || []).filter(isVisible);
          const isToday = dateKey === todayKey();
          return `
            <section class="day${isToday ? ' is-today' : ''}${list.length ? '' : ' is-empty'}" data-date="${dateKey}">
              <header class="day-head">
                <span class="day-name">${escapeHtml(day.dayName)}</span>
                <span class="day-num">${day.dayNum}</span>
                <span class="day-month">${escapeHtml(day.month)}</span>
                <button class="day-add" type="button" data-add="${dateKey}" aria-label="Добавить плашку">+</button>
              </header>
              <div class="day-list" data-drop="${dateKey}">
                ${list.map(cardHtml).join('')}
              </div>
            </section>`;
        }).join('')}
      </div>`).join('');

    $('#board').classList.toggle('layers-hidden', filtersActive());
    $('#filter-note').hidden = !filtersActive();
    updateBoardSize();
  }

  function renderBacklog() {
    const listEl = $('#backlog-list');
    if (!listEl) return;
    const list = (itemsByDate().backlog || []);
    listEl.innerHTML = list.length
      ? list.map(cardHtml).join('')
      : '<p class="empty-hint">Перетащите сюда плашку, чтобы отложить её.</p>';
    $$('[data-backlog-count]').forEach(el => {
      el.textContent = list.length;
      el.hidden = list.length === 0;
    });
  }

  function renderProgress() {
    const stats = { all: [0, 0], bio: [0, 0], chem: [0, 0], rus: [0, 0] };
    allItems().forEach(it => {
      if (it.category === 'payment') return;
      stats.all[1]++; if (it.completed) stats.all[0]++;
      if (stats[it.subject]) { stats[it.subject][1]++; if (it.completed) stats[it.subject][0]++; }
    });
    Object.keys(stats).forEach(key => {
      const [done, total] = stats[key];
      const pct = total ? Math.round(done / total * 100) : 0;
      $$(`[data-progress="${key}"]`).forEach(el => { el.textContent = key === 'all' ? `${pct}%` : `${done}/${total}`; });
      $$(`[data-bar="${key}"]`).forEach(el => { el.style.width = pct + '%'; });
    });
    const [done, total] = stats.all;
    $$('[data-progress-count]').forEach(el => { el.textContent = `${done} из ${total}`; });
  }

  function renderPeriods() {
    const tabs = $('#period-tabs');
    tabs.innerHTML = COURSE.map((p, i) => `
      <button class="period-tab${i === ui.periodIndex ? ' is-active' : ''}" type="button" data-period="${i}">
        <span class="period-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="period-name">${escapeHtml(p.name)}</span>
      </button>`).join('');
    const p = currentPeriod();
    $('#period-title').textContent = p ? p.name : '';
    $('#period-counter').textContent = `Период ${ui.periodIndex + 1} из ${COURSE.length}`;
    const active = tabs.querySelector('.is-active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  function selectPeriod(index, animate) {
    if (index < 0 || index >= COURSE.length) return;
    const changed = index !== ui.periodIndex;
    ui.periodIndex = index;
    lsSet('hb_period', String(index));
    renderPeriods();
    renderBoard();
    if (changed) {
      document.dispatchEvent(new CustomEvent('hb:period', { detail: { periodId: currentPeriod().id } }));
      if (animate !== false) {
        const board = $('#board');
        board.classList.remove('is-switching');
        void board.offsetWidth;
        board.classList.add('is-switching');
      }
    }
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function defaultPeriodIndex() {
    const saved = parseInt(lsGet('hb_period'), 10);
    if (!isNaN(saved) && saved >= 0 && saved < COURSE.length) return saved;
    const today = todayKey();
    if (dayIndex[today] !== undefined) return dayIndex[today];
    const firstDay = Object.keys(dayIndex).sort()[0];
    return today < firstDay ? 0 : COURSE.length - 1;
  }

  // ------------------------------------------------------------------ масштаб доски

  function boardHeight() {
    const weeks = $('#weeks');
    return weeks ? weeks.offsetHeight : 0;
  }

  function fitZoom() {
    const viewport = $('#board-viewport');
    const available = viewport.clientWidth;
    return Math.max(0.2, Math.min(1.15, available / BOARD.width));
  }

  function updateBoardSize() {
    const z = ui.zoomMode === 'fit' ? fitZoom() : ui.zoom;
    ui.zoom = z;
    const h = boardHeight();
    const board = $('#board');
    const sizer = $('#board-sizer');
    board.style.transform = `scale(${z})`;
    board.style.height = h + 'px';
    sizer.style.width = Math.round(BOARD.width * z) + 'px';
    sizer.style.height = Math.round(h * z) + 'px';
    $('#zoom-label').textContent = Math.round(z * 100) + '%';
    document.dispatchEvent(new CustomEvent('hb:layout', { detail: { width: BOARD.width, height: h, zoom: z } }));
  }

  function setZoom(z, anchorX, anchorY) {
    const viewport = $('#board-viewport');
    const sizer = $('#board-sizer');
    const next = Math.max(0.2, Math.min(2.5, z));
    const before = sizer.getBoundingClientRect();
    const ax = anchorX !== undefined ? anchorX : before.left + Math.min(before.width, viewport.clientWidth) / 2;
    const ay = anchorY !== undefined ? anchorY : Math.max(before.top, 0) + window.innerHeight / 3;
    const bx = (ax - before.left) / ui.zoom;
    const by = (ay - before.top) / ui.zoom;
    ui.zoomMode = 'manual';
    ui.zoom = next;
    lsSet('hb_zoom', String(next));
    updateBoardSize();
    const after = sizer.getBoundingClientRect();
    viewport.scrollLeft += (after.left + bx * next) - ax;
    window.scrollBy(0, (after.top + by * next) - ay);
  }

  function setFitZoom() {
    ui.zoomMode = 'fit';
    lsSet('hb_zoom', 'fit');
    updateBoardSize();
  }

  function setupZoom() {
    const saved = lsGet('hb_zoom');
    if (saved && saved !== 'fit' && !isNaN(parseFloat(saved))) {
      ui.zoomMode = 'manual';
      ui.zoom = parseFloat(saved);
    }
    $('#zoom-in').addEventListener('click', () => setZoom(ui.zoom * 1.2));
    $('#zoom-out').addEventListener('click', () => setZoom(ui.zoom / 1.2));
    $('#zoom-fit').addEventListener('click', setFitZoom);
    window.addEventListener('resize', () => { if (ui.zoomMode === 'fit') updateBoardSize(); });

    const viewport = $('#board-viewport');
    // Ctrl + колесо / жест трекпада — масштаб
    viewport.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(ui.zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    }, { passive: false });

    // Щипок двумя пальцами — масштаб (в режиме стилуса жесты обрабатывает ink.js)
    let pinch = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2 && !ui.drawMode) {
        pinch = { d: dist(e.touches), z: ui.zoom };
      }
    }, { passive: true });
    viewport.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      setZoom(pinch.z * dist(e.touches) / pinch.d, cx, cy);
    }, { passive: false });
    viewport.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });
    document.addEventListener('gesturestart', (e) => e.preventDefault());

    if (window.ResizeObserver) {
      new ResizeObserver(() => updateBoardSize()).observe($('#weeks'));
    }
  }

  // ------------------------------------------------------------------ перетаскивание плашек

  const drag = { active: false, pending: null, ghost: null, marker: null, id: null, source: null, timer: null };

  function setupDragAndDrop() {
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', cancelDrag);
    document.addEventListener('touchmove', (e) => { if (drag.active) e.preventDefault(); }, { passive: false });
    document.addEventListener('contextmenu', (e) => { if (drag.active || drag.pending) e.preventDefault(); });
  }

  function onPointerDown(e) {
    if (ui.drawMode || e.button > 0) return;
    const card = e.target.closest('.card');
    if (!card || e.target.closest('.card-check')) return;
    drag.pending = { card, x: e.clientX, y: e.clientY, pointerId: e.pointerId, type: e.pointerType };
    if (e.pointerType === 'touch') {
      // На сенсорном экране — долгое нажатие, чтобы не мешать прокрутке
      clearTimeout(drag.timer);
      drag.timer = setTimeout(() => {
        if (drag.pending && drag.pending.card === card) {
          if (navigator.vibrate) navigator.vibrate(12);
          startDrag(drag.pending.x, drag.pending.y);
        }
      }, 260);
    }
  }

  function onPointerMove(e) {
    if (drag.active) {
      e.preventDefault();
      moveDrag(e.clientX, e.clientY);
      return;
    }
    const p = drag.pending;
    if (!p || p.pointerId !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (p.type === 'touch') {
      if (moved > 10) { clearTimeout(drag.timer); drag.pending = null; }
      else { p.x = e.clientX; p.y = e.clientY; }
      return;
    }
    if (moved > 5) {
      startDrag(p.x, p.y);
      moveDrag(e.clientX, e.clientY);
    }
  }

  function onPointerUp(e) {
    clearTimeout(drag.timer);
    if (drag.active) {
      finishDrag(e.clientX, e.clientY);
      return;
    }
    const p = drag.pending;
    drag.pending = null;
    if (p && !e.target.closest('.card-check') && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10) {
      openItemModal(p.card.dataset.id);
    }
  }

  function startDrag(x, y) {
    const card = drag.pending.card;
    const rect = card.getBoundingClientRect();
    drag.active = true;
    drag.id = card.dataset.id;
    drag.offsetX = (x - rect.left) / ui.zoom;
    drag.offsetY = (y - rect.top) / ui.zoom;
    drag.pending = null;
    drag.source = card;
    card.classList.add('is-drag-source');

    const ghost = card.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = card.offsetWidth + 'px';
    ghost.style.setProperty('--z', ui.zoom);
    document.body.appendChild(ghost);
    drag.ghost = ghost;

    drag.marker = document.createElement('div');
    drag.marker.className = 'drop-marker';
    document.body.classList.add('is-dragging');
    moveDrag(x, y);
  }

  function moveDrag(x, y) {
    const g = drag.ghost;
    g.style.transform = `translate(${x - drag.offsetX * ui.zoom}px, ${y - drag.offsetY * ui.zoom}px) scale(${ui.zoom}) rotate(1.5deg)`;

    const target = dropTargetAt(x, y);
    $$('.is-drop-target').forEach(el => { if (el !== target) el.classList.remove('is-drop-target'); });
    if (target) {
      target.classList.add('is-drop-target');
      const before = cardAfter(target, y);
      if (before) target.insertBefore(drag.marker, before);
      else target.appendChild(drag.marker);
    } else if (drag.marker.parentNode) {
      drag.marker.remove();
    }
    autoScroll(x, y);
  }

  function dropTargetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const list = el.closest('[data-drop]');
    if (list) return list;
    const day = el.closest('.day');
    return day ? day.querySelector('[data-drop]') : (el.closest('#backlog') ? $('#backlog-list') : null);
  }

  function cardAfter(list, y) {
    const cards = $$('.card', list).filter(c => c !== drag.source);
    return cards.find(c => {
      const r = c.getBoundingClientRect();
      return y < r.top + r.height / 2;
    }) || null;
  }

  let scrollRaf = null;
  function autoScroll(x, y) {
    cancelAnimationFrame(scrollRaf);
    const viewport = $('#board-viewport');
    const vr = viewport.getBoundingClientRect();
    const edge = 56;
    let dx = 0, dy = 0;
    if (x < vr.left + edge) dx = -14; else if (x > vr.right - edge) dx = 14;
    if (y < edge + 40) dy = -14; else if (y > window.innerHeight - edge) dy = 14;
    if (!dx && !dy) return;
    scrollRaf = requestAnimationFrame(() => {
      viewport.scrollLeft += dx;
      window.scrollBy(0, dy);
      if (drag.active) autoScroll(x, y);
    });
  }

  function finishDrag(x, y) {
    const target = dropTargetAt(x, y);
    const id = drag.id;
    if (target && id) {
      const date = target.dataset.drop;
      const before = cardAfter(target, y);
      const siblings = (itemsByDate()[date] || []).filter(it => it.id !== id);
      let order;
      if (before) {
        const idx = siblings.findIndex(it => it.id === before.dataset.id);
        const next = siblings[idx];
        const prev = siblings[idx - 1];
        order = prev ? (prev.order + next.order) / 2 : next.order - 1000;
      } else {
        const last = siblings[siblings.length - 1];
        order = last ? last.order + 1000 : 1000;
      }
      const item = Store.get(`items/${id}`);
      if (item && (item.date !== date || item.order !== order)) {
        Store.update({ [`items/${id}/date`]: date, [`items/${id}/order`]: order });
      }
    }
    cleanupDrag();
    requestRender();
  }

  function cancelDrag() {
    clearTimeout(drag.timer);
    drag.pending = null;
    if (drag.active) {
      cleanupDrag();
      requestRender();
    }
  }

  function cleanupDrag() {
    cancelAnimationFrame(scrollRaf);
    if (drag.ghost) drag.ghost.remove();
    if (drag.marker) drag.marker.remove();
    if (drag.source) drag.source.classList.remove('is-drag-source');
    $$('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
    document.body.classList.remove('is-dragging');
    Object.assign(drag, { active: false, ghost: null, marker: null, id: null, source: null });
  }

  // ------------------------------------------------------------------ окно плашки

  let editingId = null;
  let creatingDate = null;

  function fillSelect(select, options, value) {
    select.innerHTML = Object.keys(options).map(k => `<option value="${k}"${k === value ? ' selected' : ''}>${options[k].label || options[k]}</option>`).join('');
  }

  function openItemModal(id, dateForNew) {
    const modal = $('#item-modal');
    const it = id ? Store.get(`items/${id}`) : null;
    editingId = it ? id : null;
    creatingDate = it ? null : (dateForNew || 'backlog');
    const form = $('#item-form');
    form.title.value = it ? it.title || '' : '';
    form.subtitle.value = it ? it.subtitle || '' : '';
    form.time.value = it ? it.time || '' : '';
    fillSelect(form.subject, SUBJECTS, it ? it.subject : (ui.subject !== 'all' ? ui.subject : 'bio'));
    fillSelect(form.category, CATEGORIES, it ? it.category : 'theory');
    form.icon.value = it && it.icon && ICONS[it.icon] ? it.icon : '';
    form.completed.checked = !!(it && it.completed);
    $('#item-modal-title').textContent = it ? 'Плашка' : 'Новая плашка';
    $('#item-delete').hidden = !it;
    const where = it ? it.date : creatingDate;
    $('#item-modal-date').textContent = where === 'backlog' || !where ? 'Отложено' : formatDate(where);
    openModal(modal);
    if (!it) setTimeout(() => form.title.focus(), 60);
  }

  function formatDate(dateKey) {
    const p = COURSE[dayIndex[dateKey]];
    const d = p && p.days[dateKey];
    return d ? `${d.dayName}, ${d.dayNum} ${d.month}` : dateKey;
  }

  function saveItemFromForm(e) {
    e.preventDefault();
    const form = $('#item-form');
    const title = form.title.value.trim();
    if (!title) { form.title.focus(); return; }
    const fields = {
      title,
      subtitle: form.subtitle.value.trim() || null,
      time: form.time.value.trim() || null,
      subject: form.subject.value,
      category: form.category.value,
      icon: form.icon.value || null,
      completed: form.completed.checked || null
    };
    if (editingId) {
      const updates = {};
      Object.keys(fields).forEach(k => { updates[`items/${editingId}/${k}`] = fields[k]; });
      Store.update(updates);
    } else {
      const id = Store.newId('u');
      const siblings = itemsByDate()[creatingDate] || [];
      const last = siblings[siblings.length - 1];
      const rec = { date: creatingDate, order: last ? last.order + 1000 : 1000 };
      Object.keys(fields).forEach(k => { if (fields[k] !== null) rec[k] = fields[k]; });
      Store.update({ [`items/${id}`]: rec });
      toast('Плашка добавлена');
    }
    closeModal($('#item-modal'));
  }

  function deleteEditingItem() {
    if (!editingId) return;
    const it = Store.get(`items/${editingId}`);
    if (!confirm(`Удалить плашку «${it ? it.title : ''}»?`)) return;
    Store.update({ [`items/${editingId}`]: null });
    closeModal($('#item-modal'));
    toast('Плашка удалена');
  }

  function toggleCompleted(id) {
    const it = Store.get(`items/${id}`);
    if (!it) return;
    Store.update({ [`items/${id}/completed`]: it.completed ? null : true });
  }

  // ------------------------------------------------------------------ модальные окна и меню

  function openModal(modal) {
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
    document.body.classList.add('has-modal');
  }

  function closeModal(modal) {
    modal.classList.remove('is-open');
    setTimeout(() => {
      modal.hidden = true;
      if (!$$('.modal:not([hidden])').length) document.body.classList.remove('has-modal');
    }, 180);
  }

  let toastTimer = null;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
  }

  function setupMenus() {
    $$('[data-open-menu]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = $('#' + btn.dataset.openMenu);
      const willOpen = menu.hidden;
      $$('.menu').forEach(m => { m.hidden = true; });
      menu.hidden = !willOpen;
      btn.setAttribute('aria-expanded', String(willOpen));
    }));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.menu')) $$('.menu').forEach(m => { m.hidden = true; });
    });

    $$('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-close]')) closeModal(modal);
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $$('.modal:not([hidden])').forEach(closeModal);
        $$('.menu').forEach(m => { m.hidden = true; });
      }
    });
  }

  // ------------------------------------------------------------------ тема

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    lsSet('hb_theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f6f3ef' : '#08080a';
    $$('[data-theme-label]').forEach(el => { el.textContent = theme === 'light' ? 'Тёмная тема' : 'Светлая тема'; });
    document.dispatchEvent(new CustomEvent('hb:theme'));
  }

  // ------------------------------------------------------------------ синхронизация (интерфейс)

  function renderSyncStatus() {
    const peers = Store.peers();
    const status = Store.room ? Store.status : 'local';
    const labels = {
      local: 'Только это устройство',
      connecting: 'Подключение…',
      online: peers.length ? `Онлайн · ещё ${peers.length} ${plural(peers.length, 'устройство', 'устройства', 'устройств')}` : 'Онлайн',
      offline: 'Нет сети — изменения сохранятся'
    };
    $$('[data-sync-status]').forEach(el => {
      el.dataset.state = status;
      const text = el.querySelector('[data-sync-text]');
      if (text) text.textContent = labels[status];
    });
    $$('[data-sync-peers]').forEach(el => {
      el.textContent = peers.length ? String(peers.length + 1) : '';
      el.hidden = !peers.length;
    });

    const modal = $('#sync-modal');
    if (modal.hidden) return;
    $('#sync-room-block').hidden = !Store.room;
    $('#sync-local-block').hidden = !!Store.room;
    if (Store.room) {
      $('#sync-room-code').textContent = Store.room;
      $('#sync-link').textContent = Store.shareUrl();
      $('#sync-devices').innerHTML = [`<li class="is-self">Это устройство</li>`]
        .concat(peers.map(p => `<li>${escapeHtml(p.device)}</li>`)).join('');
      const pending = Store.pendingCount;
      $('#sync-pending').textContent = pending ? `Ожидают отправки: ${pending}` : 'Все изменения сохранены в облаке';
    }
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  let lastQrRoom = null;
  function renderQr() {
    const box = $('#sync-qr');
    if (!Store.room || lastQrRoom === Store.room) return;
    lastQrRoom = Store.room;
    if (typeof window.qrcode !== 'function') {
      box.innerHTML = '<p class="empty-hint">QR недоступен офлайн</p>';
      return;
    }
    const qr = window.qrcode(0, 'M');
    qr.addData(Store.shareUrl());
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }

  function openSyncModal() {
    openModal($('#sync-modal'));
    renderSyncStatus();
    renderQr();
    $('#sync-firebase').value = Store.firebaseUrl();
  }

  function copyText(text, done) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove();
      toast(done);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(done), fallback);
    else fallback();
  }

  function setupSync() {
    $$('[data-open-sync]').forEach(b => b.addEventListener('click', openSyncModal));
    $('#sync-create').addEventListener('click', async () => {
      await Store.join(Store.generateRoomCode());
      lastQrRoom = null;
      renderQr();
      renderSyncStatus();
      toast('Комната создана — откройте ссылку на другом устройстве');
    });
    $('#sync-join-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('#sync-join-input');
      let code = input.value.trim();
      const fromLink = code.match(/(?:room|sync)=([^&\s]+)/);
      if (fromLink) code = decodeURIComponent(fromLink[1]);
      if (!code) return;
      try {
        await Store.join(code);
        input.value = '';
        lastQrRoom = null;
        renderQr();
        renderSyncStatus();
        toast('Подключено к комнате ' + Store.room);
      } catch (err) {
        toast(err.message);
      }
    });
    $('#sync-copy-link').addEventListener('click', () => copyText(Store.shareUrl(), 'Ссылка скопирована'));
    $('#sync-copy-code').addEventListener('click', () => copyText(Store.room, 'Код скопирован'));
    $('#sync-leave').addEventListener('click', () => {
      if (!confirm('Отключить это устройство от синхронизации? Данные в облаке останутся.')) return;
      Store.leave();
      renderSyncStatus();
    });
    $('#sync-firebase-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const url = $('#sync-firebase').value.trim();
      if (url && !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(firebaseio\.com|firebasedatabase\.app)$/i.test(url.replace(/\/+$/, ''))) {
        toast('Нужна ссылка вида https://….firebaseio.com');
        return;
      }
      Store.setFirebaseUrl(url);
      toast('Сервер синхронизации сохранён');
    });
    setInterval(renderSyncStatus, 10000);
  }

  // ------------------------------------------------------------------ экспорт / импорт / сброс

  function exportJson() {
    const payload = {
      app: 'himbiorus-planner',
      version: 3,
      exportedAt: new Date().toISOString(),
      items: Store.get('items') || {},
      strokes: Store.get('strokes') || {},
      images: Store.get('images') || {}
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `himbiorus-backup-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Резервная копия скачана');
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        let items = parsed.items;
        if (!items && parsed.periods) {
          lsSet('himbiorus_schedule_state_v2', JSON.stringify(parsed));
          items = buildSeed().items;
        }
        if (!items || typeof items !== 'object' || !Object.keys(items).length) throw new Error('В файле нет расписания');
        if (!confirm('Заменить текущее расписание данными из файла? Это отразится на всех подключённых устройствах.')) return;
        Store.replaceItems(items);
        const rest = {};
        if (parsed.strokes && typeof parsed.strokes === 'object') rest.strokes = parsed.strokes;
        if (parsed.images && typeof parsed.images === 'object') rest.images = parsed.images;
        if (Object.keys(rest).length) Store.update(rest);
        toast('Данные восстановлены');
      } catch (err) {
        alert('Не удалось прочитать файл: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function resetSchedule() {
    if (!confirm('Вернуть расписание к исходному виду из PDF? Перестановки, свои плашки и отметки «выполнено» будут сброшены на всех устройствах. Рисунки и фото останутся.')) return;
    Store.replaceItems(courseItems());
    toast('Расписание сброшено');
  }

  // ------------------------------------------------------------------ события интерфейса

  function setupControls() {
    $('#period-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-period]');
      if (tab) selectPeriod(parseInt(tab.dataset.period, 10));
    });
    $('#period-prev').addEventListener('click', () => selectPeriod(ui.periodIndex - 1));
    $('#period-next').addEventListener('click', () => selectPeriod(ui.periodIndex + 1));

    $('#subject-filters').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-subject]');
      if (!chip) return;
      ui.subject = chip.dataset.subject;
      $$('[data-subject]').forEach(c => c.classList.toggle('is-active', c === chip));
      renderBoard();
    });
    $('#category-filter').addEventListener('change', (e) => {
      ui.category = e.target.value;
      renderBoard();
    });
    $('#companions-toggle').addEventListener('change', (e) => {
      ui.showCompanions = e.target.checked;
      lsSet('hb_companions', ui.showCompanions ? '1' : '0');
      renderBoard();
    });
    let searchTimer = null;
    $('#search').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        ui.query = e.target.value.trim();
        $('#search-clear').hidden = !ui.query;
        renderBoard();
      }, 120);
    });
    $('#search-clear').addEventListener('click', () => {
      $('#search').value = '';
      ui.query = '';
      $('#search-clear').hidden = true;
      renderBoard();
    });
    $('#filter-reset').addEventListener('click', () => {
      ui.subject = 'all'; ui.category = 'all'; ui.query = ''; ui.showCompanions = true;
      $('#search').value = ''; $('#search-clear').hidden = true;
      $('#category-filter').value = 'all';
      $('#companions-toggle').checked = true;
      $$('[data-subject]').forEach(c => c.classList.toggle('is-active', c.dataset.subject === 'all'));
      renderBoard();
    });

    // Клики внутри доски
    document.addEventListener('click', (e) => {
      const check = e.target.closest('.card-check');
      if (check) {
        const card = check.closest('.card');
        if (card) toggleCompleted(card.dataset.id);
        return;
      }
      const add = e.target.closest('[data-add]');
      if (add) openItemModal(null, add.dataset.add);
    });

    $('#item-form').addEventListener('submit', saveItemFromForm);
    $('#item-delete').addEventListener('click', deleteEditingItem);

    $$('[data-open-backlog]').forEach(b => b.addEventListener('click', () => {
      renderBacklog();
      $('#backlog').classList.add('is-open');
      $('#backlog-scrim').hidden = false;
    }));
    const closeBacklog = () => {
      $('#backlog').classList.remove('is-open');
      $('#backlog-scrim').hidden = true;
    };
    $('#backlog-close').addEventListener('click', closeBacklog);
    $('#backlog-scrim').addEventListener('click', closeBacklog);
    $('#backlog-add').addEventListener('click', () => openItemModal(null, 'backlog'));

    $$('[data-action="theme"]').forEach(b => b.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    }));
    $$('[data-action="export"]').forEach(b => b.addEventListener('click', exportJson));
    $$('[data-action="import"]').forEach(b => b.addEventListener('click', () => $('#import-input').click()));
    $('#import-input').addEventListener('change', (e) => {
      if (e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });
    $$('[data-action="print"]').forEach(b => b.addEventListener('click', () => window.print()));
    $$('[data-action="reset"]').forEach(b => b.addEventListener('click', resetSchedule));
    $$('[data-action="refresh-app"]').forEach(b => b.addEventListener('click', () => {
      location.href = location.pathname + '?reset=1' + location.hash;
    }));

    // Клавиатура: ← → переключают периоды
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select') || document.body.classList.contains('has-modal')) return;
      if (e.key === 'ArrowLeft') selectPeriod(ui.periodIndex - 1);
      if (e.key === 'ArrowRight') selectPeriod(ui.periodIndex + 1);
    });

    // Проявление блоков при прокрутке
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
      }, { threshold: 0.08 });
      $$('.reveal').forEach(el => io.observe(el));
    } else {
      $$('.reveal').forEach(el => el.classList.add('is-in'));
    }
  }

  // ------------------------------------------------------------------ запуск

  async function start() {
    applyTheme(lsGet('hb_theme') === 'light' ? 'light' : 'dark');
    ui.showCompanions = lsGet('hb_companions') !== '0';
    $('#companions-toggle').checked = ui.showCompanions;
    $('#category-filter').innerHTML = '<option value="all">Все типы</option>' +
      Object.keys(CATEGORIES).map(k => `<option value="${k}">${CATEGORIES[k]}</option>`).join('');
    ui.periodIndex = defaultPeriodIndex();

    setupMenus();
    setupControls();
    setupZoom();
    setupDragAndDrop();
    setupSync();
    renderPeriods();

    Store.subscribe(({ paths }) => {
      if (paths.includes('__status')) { renderSyncStatus(); return; }
      const roots = new Set(paths.map(p => p.split('/').filter(Boolean)[0] || '/'));
      if (roots.has('/') || roots.has('items')) requestRender();
      if (roots.has('/') || roots.has('presence')) renderSyncStatus();
    });

    window.HB = {
      BOARD,
      ui,
      store: Store,
      currentPeriod,
      toast,
      setZoom,
      updateBoardSize,
      openModal,
      closeModal
    };
    document.dispatchEvent(new CustomEvent('hb:ready'));

    renderBoard();
    window.__appBooted = true;
    document.body.classList.add('is-loaded');
    try {
      await Store.init(buildSeed);
    } catch (err) {
      console.error('Ошибка запуска синхронизации:', err);
      toast('Синхронизация недоступна — работаем локально');
    }
    requestRender();
    renderSyncStatus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
