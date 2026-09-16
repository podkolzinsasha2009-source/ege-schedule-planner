// ==========================================================================
// СТИЛУС «ХИМБИОРУС» — рукописные заметки поверх доски
//
// Штрихи хранятся в координатах доски (одинаковых на всех устройствах)
// по пути strokes/<период>/<id>. Пока линия рисуется, она транслируется
// в live/<клиент>, поэтому на другом устройстве видна прямо во время письма.
// ==========================================================================

(function () {
  'use strict';

  const MAX_CANVAS_PIXELS = 12e6;
  const LIVE_INTERVAL = 60;
  const STALE_LIVE_MS = 6000;

  let HB, Store;
  let board, ink, inkCtx, overlay, overlayCtx;
  let layout = { width: 1480, height: 0, zoom: 1 };
  let resolution = 1;

  const settings = {
    tool: 'pen',          // pen | hl | eraser | stroke-eraser
    color: '#ff7a1a',
    size: 3,
    pressure: true,
    stylusOnly: false
  };
  let penSeen = false;

  let rendered = new Set();
  const parsedCache = new Map(); // id → { p, pts }
  let current = null;            // рисуемый сейчас штрих
  let lastLiveSent = 0;
  let overlayDirty = false;
  const liveSeen = {};
  const undoStack = [];
  const redoStack = [];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // ------------------------------------------------------------------ формат точек

  function encodePoints(pts) {
    return pts.map(p => `${Math.round(p[0] * 10) / 10},${Math.round(p[1] * 10) / 10},${Math.round(p[2] * 100) / 100}`).join(' ');
  }

  function decodePoints(str) {
    if (!str || typeof str !== 'string') return [];
    return str.split(' ').map(chunk => {
      const [x, y, pr] = chunk.split(',').map(Number);
      return [x, y, isNaN(pr) ? 0.5 : pr];
    }).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
  }

  function pointsOf(id, stroke) {
    const cached = parsedCache.get(id);
    if (cached && cached.p === stroke.p) return cached.pts;
    const pts = decodePoints(stroke.p);
    parsedCache.set(id, { p: stroke.p, pts });
    return pts;
  }

  // ------------------------------------------------------------------ отрисовка штриха

  function widthFor(stroke, pressure) {
    const base = stroke.s || 3;
    if (stroke.t === 'hl') return Math.max(base * 3.5, 12);
    if (stroke.t === 'eraser') return Math.max(base * 4, 14);
    return base * (0.3 + 1.4 * Math.max(0.05, Math.min(1, pressure)));
  }

  function drawStroke(ctx, stroke, pts) {
    if (!pts || pts.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (stroke.t === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.c || '#ff7a1a';
      ctx.fillStyle = stroke.c || '#ff7a1a';
      if (stroke.t === 'hl') ctx.globalAlpha = 0.38;
    }

    const uniform = stroke.t !== 'pen' || pts.every(p => Math.abs(p[2] - pts[0][2]) < 0.02);

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], widthFor(stroke, pts[0][2]) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (uniform) {
      // Один путь — у маркера не появляются «бусины» в местах перекрытия
      ctx.lineWidth = widthFor(stroke, pts[0][2]);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last[0], last[1]);
      ctx.stroke();
    } else {
      // Переменная толщина по нажиму: сегменты между серединами соседних отрезков
      let lx = pts[0][0], ly = pts[0][1];
      let mx0 = lx, my0 = ly;
      for (let i = 1; i < pts.length; i++) {
        const [x, y, pr] = pts[i];
        const mx = (lx + x) / 2, my = (ly + y) / 2;
        ctx.lineWidth = widthFor(stroke, (pts[i - 1][2] + pr) / 2);
        ctx.beginPath();
        ctx.moveTo(mx0, my0);
        ctx.quadraticCurveTo(lx, ly, mx, my);
        ctx.stroke();
        mx0 = mx; my0 = my; lx = x; ly = y;
      }
      ctx.lineWidth = widthFor(stroke, pts[pts.length - 1][2]);
      ctx.beginPath();
      ctx.moveTo(mx0, my0);
      ctx.lineTo(lx, ly);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ холсты

  function periodId() {
    const p = HB.currentPeriod();
    return p ? p.id : 'default';
  }

  function periodStrokes() {
    return Store.get(`strokes/${periodId()}`) || {};
  }

  function sortedIds(strokes) {
    return Object.keys(strokes).sort((a, b) => ((strokes[a].ts || 0) - (strokes[b].ts || 0)) || (a < b ? -1 : 1));
  }

  function resizeCanvases() {
    const w = layout.width, h = Math.max(layout.height, 1);
    const dpr = window.devicePixelRatio || 1;
    const cap = Math.sqrt(MAX_CANVAS_PIXELS / (w * h));
    const r = Math.max(0.5, Math.min(dpr * layout.zoom, cap, 3));
    const pw = Math.round(w * r), ph = Math.round(h * r);
    let changed = false;
    [ink, overlay].forEach(c => {
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      if (c.width !== pw || c.height !== ph) {
        c.width = pw;
        c.height = ph;
        changed = true;
      }
    });
    resolution = r;
    if (changed) {
      inkCtx.setTransform(r, 0, 0, r, 0, 0);
      overlayCtx.setTransform(r, 0, 0, r, 0, 0);
      redrawAll();
      overlayDirty = false;
      requestOverlay();
    }
  }

  function clearCtx(ctx, canvas) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function redrawAll() {
    clearCtx(inkCtx, ink);
    const strokes = periodStrokes();
    rendered = new Set();
    sortedIds(strokes).forEach(id => {
      drawStroke(inkCtx, strokes[id], pointsOf(id, strokes[id]));
      rendered.add(id);
    });
  }

  // Дорисовываем только новые штрихи; если что-то удалили — перерисовываем всё
  function syncInk() {
    const strokes = periodStrokes();
    const ids = new Set(Object.keys(strokes));
    for (const id of rendered) {
      if (!ids.has(id)) { redrawAll(); return; }
    }
    sortedIds(strokes).forEach(id => {
      if (rendered.has(id)) {
        const cached = parsedCache.get(id);
        if (cached && cached.p !== strokes[id].p) { redrawAll(); }
        return;
      }
      drawStroke(inkCtx, strokes[id], pointsOf(id, strokes[id]));
      rendered.add(id);
    });
  }

  function requestOverlay() {
    if (overlayDirty) return;
    overlayDirty = true;
    requestAnimationFrame(drawOverlay);
  }

  function drawOverlay() {
    overlayDirty = false;
    clearCtx(overlayCtx, overlay);
    const live = Store.get('live') || {};
    const pid = periodId();
    const now = Date.now();
    Object.keys(live).forEach(cid => {
      if (cid === Store.clientId) return;
      const entry = live[cid];
      if (!entry || entry.pid !== pid || entry.t === 'eraser') return;
      if (entry.sid && Store.get(`strokes/${pid}/${entry.sid}`)) return;
      if (now - (liveSeen[cid] || 0) > STALE_LIVE_MS) return;
      drawStroke(overlayCtx, entry, decodePoints(entry.p));
    });
    if (current && current.stroke.t !== 'eraser' && current.stroke.t !== 'stroke-eraser') {
      drawStroke(overlayCtx, current.stroke, current.pts);
    }
  }

  // ------------------------------------------------------------------ ввод

  function boardPoint(e) {
    const rect = current && current.rect ? current.rect : board.getBoundingClientRect();
    return [(e.clientX - rect.left) / layout.zoom, (e.clientY - rect.top) / layout.zoom];
  }

  function pressureOf(e) {
    if (!settings.pressure || e.pointerType !== 'pen' || !e.pressure) return 0.5;
    return e.pressure;
  }

  const touches = new Map();
  let gesture = null;

  function onDown(e) {
    if (!HB.ui.drawMode) return;
    e.preventDefault();

    if (e.pointerType === 'pen' && !penSeen) {
      penSeen = true;
      lsSet('hb_pen_seen', '1');
      updateToolbar();
    }

    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      const fingerDraws = !settings.stylusOnly && !penSeen;
      if (!fingerDraws || touches.size > 1) {
        if (current && current.pointerType === 'touch') discardStroke();
        startGesture();
        return;
      }
    }

    if (current) return;
    try { overlay.setPointerCapture(e.pointerId); } catch (err) {}
    beginStroke(e);
  }

  function onMove(e) {
    if (!HB.ui.drawMode) return;
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      const t = touches.get(e.pointerId);
      const dx = e.clientX - t.x, dy = e.clientY - t.y;
      t.x = e.clientX; t.y = e.clientY;
      if (gesture) { moveGesture(dx, dy); return; }
    }
    if (!current || current.pointerId !== e.pointerId) return;
    e.preventDefault();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (events.length ? events : [e]).forEach(ev => extendStroke(ev));
  }

  function onUp(e) {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      if (gesture && touches.size === 0) endGesture();
    }
    if (current && current.pointerId === e.pointerId) {
      if (e.type === 'pointercancel') discardStroke();
      else finishStroke();
    }
  }

  // ---- жесты пальцами в режиме стилуса: прокрутка, масштаб, отмена/повтор

  function startGesture() {
    if (!gesture) gesture = { start: Date.now(), maxTouches: 0, moved: 0, pinchDist: null, pinchZoom: layout.zoom };
    gesture.maxTouches = Math.max(gesture.maxTouches, touches.size);
    if (touches.size === 2) {
      const [a, b] = Array.from(touches.values());
      gesture.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.pinchZoom = layout.zoom;
    }
  }

  function moveGesture(dx, dy) {
    gesture.moved += Math.abs(dx) + Math.abs(dy);
    const viewport = $('#board-viewport');
    if (touches.size === 2 && gesture.pinchDist) {
      const [a, b] = Array.from(touches.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (Math.abs(d - gesture.pinchDist) > 12 || gesture.pinching) {
        gesture.pinching = true;
        HB.setZoom(gesture.pinchZoom * d / gesture.pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      viewport.scrollLeft -= dx / 2;
      window.scrollBy(0, -dy / 2);
    } else if (touches.size === 1) {
      viewport.scrollLeft -= dx;
      window.scrollBy(0, -dy);
    }
  }

  function endGesture() {
    const quick = Date.now() - gesture.start < 320 && gesture.moved < 24 && !gesture.pinching;
    if (quick && gesture.maxTouches === 2) undo();
    else if (quick && gesture.maxTouches === 3) redo();
    gesture = null;
  }

  // ---- штрих

  function beginStroke(e) {
    const tool = settings.tool;
    current = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      id: Store.newId('s'),
      pid: periodId(),
      rect: board.getBoundingClientRect(),
      pts: [],
      erased: {},
      stroke: { t: tool, c: settings.color, s: settings.size }
    };
    extendStroke(e);
  }

  function extendStroke(e) {
    const [x, y] = boardPoint(e);
    const pr = pressureOf(e);
    const pts = current.pts;
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(prev[0] - x) < 0.4 && Math.abs(prev[1] - y) < 0.4) return;
    pts.push([x, y, pr]);

    if (current.stroke.t === 'stroke-eraser') {
      eraseStrokesAt(x, y);
      return;
    }
    if (current.stroke.t === 'eraser') {
      // Ластик сразу стирает на основном холсте
      const seg = pts.slice(-3);
      drawStroke(inkCtx, current.stroke, seg.length ? seg : [[x, y, pr]]);
    } else {
      requestOverlay();
    }

    const now = performance.now();
    if (now - lastLiveSent > LIVE_INTERVAL) {
      lastLiveSent = now;
      sendLive();
    }
  }

  function sendLive() {
    if (!Store.room || !current || current.stroke.t === 'stroke-eraser') return;
    Store.update({
      ['live/' + Store.clientId]: Object.assign({ pid: current.pid, sid: current.id, p: encodePoints(current.pts) }, current.stroke)
    }, { ephemeral: true, silent: true });
  }

  function finishStroke() {
    const done = current;
    current = null;
    if (!done) return;

    if (done.stroke.t === 'stroke-eraser') {
      if (Object.keys(done.erased).length) {
        pushUndo({ type: 'erase', pid: done.pid, strokes: done.erased });
      }
      return;
    }
    if (done.pts.length === 0) { requestOverlay(); return; }

    const record = Object.assign({}, done.stroke, { p: encodePoints(done.pts), ts: Date.now(), by: Store.clientId });
    const updates = { [`strokes/${done.pid}/${done.id}`]: record };
    if (Store.room) updates['live/' + Store.clientId] = null;
    Store.update(updates);
    // На случай, если последний «живой» кусок ещё в пути — очищаем live и в живой полосе
    if (Store.room) Store.update({ ['live/' + Store.clientId]: null }, { ephemeral: true, silent: true });
    pushUndo({ type: 'add', pid: done.pid, strokes: { [done.id]: record } });
    requestOverlay();
  }

  function discardStroke() {
    const was = current;
    current = null;
    if (was && was.stroke.t === 'eraser') redrawAll();
    if (Store.room && was) Store.update({ ['live/' + Store.clientId]: null }, { ephemeral: true, silent: true });
    requestOverlay();
  }

  // ---- ластик штрихов: касание любой части линии удаляет её целиком

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = dx * dx + dy * dy;
    let t = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function eraseStrokesAt(x, y) {
    const strokes = periodStrokes();
    const radius = Math.max(10, settings.size * 3) ;
    const updates = {};
    Object.keys(strokes).forEach(id => {
      const st = strokes[id];
      if (!st || st.t === 'eraser') return;
      const pts = pointsOf(id, st);
      const reach = radius + widthFor(st, 0.6) / 2;
      const hit = pts.length === 1
        ? Math.hypot(pts[0][0] - x, pts[0][1] - y) <= reach
        : pts.some((p, i) => i > 0 && distToSegment(x, y, pts[i - 1][0], pts[i - 1][1], p[0], p[1]) <= reach);
      if (hit) {
        current.erased[id] = st;
        updates[`strokes/${current.pid}/${id}`] = null;
      }
    });
    if (Object.keys(updates).length) Store.update(updates);
  }

  // ------------------------------------------------------------------ отмена / повтор / очистка

  function pushUndo(action) {
    undoStack.push(action);
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    updateToolbar();
  }

  function applyAction(action, reverse) {
    const updates = {};
    // add: прямой ход — добавить, обратный — убрать; erase/clear — наоборот
    const add = action.type === 'add' ? !reverse : reverse;
    Object.keys(action.strokes).forEach(id => {
      updates[`strokes/${action.pid}/${id}`] = add ? action.strokes[id] : null;
    });
    Store.update(updates);
  }

  function undo() {
    const action = undoStack.pop();
    if (!action) { HB.toast('Нечего отменять'); return; }
    applyAction(action, true);
    redoStack.push(action);
    HB.toast('↩ Отменено');
    updateToolbar();
  }

  function redo() {
    const action = redoStack.pop();
    if (!action) return;
    applyAction(action, false);
    undoStack.push(action);
    HB.toast('↪ Повторено');
    updateToolbar();
  }

  function clearPeriod() {
    const strokes = periodStrokes();
    if (!Object.keys(strokes).length) { HB.toast('На этом периоде нет рисунков'); return; }
    if (!confirm('Стереть все рисунки на этом периоде? Действие можно отменить кнопкой «Отменить».')) return;
    const action = { type: 'clear', pid: periodId(), strokes: Object.assign({}, strokes) };
    applyAction(action, false);
    pushUndo(action);
  }

  // ------------------------------------------------------------------ панель инструментов

  function setDrawMode(on) {
    if (on && HB.ui.query !== undefined && board.classList.contains('layers-hidden')) {
      HB.toast('Сбросьте фильтры и поиск, чтобы рисовать');
      return;
    }
    HB.ui.drawMode = on;
    document.body.classList.toggle('is-drawing', on);
    $('#ink-toolbar').hidden = !on;
    $$('[data-toggle-draw]').forEach(b => b.classList.toggle('is-active', on));
    if (!on && current) finishStroke();
  }

  function updateToolbar() {
    $$('[data-tool]').forEach(b => b.classList.toggle('is-active', b.dataset.tool === settings.tool));
    $$('[data-color]').forEach(b => b.classList.toggle('is-active', b.dataset.color.toLowerCase() === settings.color.toLowerCase()));
    $('#ink-size').value = settings.size;
    $('#ink-size-value').textContent = settings.size;
    $('#ink-size-dot').style.setProperty('--dot', Math.min(22, 3 + settings.size) + 'px');
    $('#ink-pressure').classList.toggle('is-active', settings.pressure);
    $('#ink-stylus-only').classList.toggle('is-active', settings.stylusOnly || penSeen);
    $('#ink-stylus-only').title = penSeen
      ? 'Найден стилус: пальцы и ладонь не рисуют (прокрутка, щипок, 2 пальца — отмена)'
      : 'Рисовать только стилусом';
    $('#ink-undo').disabled = undoStack.length === 0;
    $('#ink-redo').disabled = redoStack.length === 0;
  }

  function saveSettings() {
    lsSet('hb_ink', JSON.stringify(settings));
    updateToolbar();
  }

  function setupToolbar() {
    try { Object.assign(settings, JSON.parse(lsGet('hb_ink') || '{}')); } catch (e) {}
    penSeen = lsGet('hb_pen_seen') === '1';

    $$('[data-toggle-draw]').forEach(b => b.addEventListener('click', () => setDrawMode(!HB.ui.drawMode)));
    $$('[data-tool]').forEach(b => b.addEventListener('click', () => { settings.tool = b.dataset.tool; saveSettings(); }));
    $$('[data-color]').forEach(b => b.addEventListener('click', () => {
      settings.color = b.dataset.color;
      if (settings.tool === 'eraser' || settings.tool === 'stroke-eraser') settings.tool = 'pen';
      saveSettings();
    }));
    $('#ink-custom-color').addEventListener('input', (e) => {
      settings.color = e.target.value;
      if (settings.tool === 'eraser' || settings.tool === 'stroke-eraser') settings.tool = 'pen';
      saveSettings();
    });
    $('#ink-size').addEventListener('input', (e) => { settings.size = parseInt(e.target.value, 10) || 3; saveSettings(); });
    $('#ink-pressure').addEventListener('click', () => {
      settings.pressure = !settings.pressure;
      saveSettings();
      HB.toast(settings.pressure ? 'Нажим стилуса включён' : 'Нажим стилуса выключен');
    });
    $('#ink-stylus-only').addEventListener('click', () => {
      if (penSeen) {
        penSeen = false;
        lsSet('hb_pen_seen', '0');
        settings.stylusOnly = false;
        HB.toast('Пальцы снова рисуют');
      } else {
        settings.stylusOnly = !settings.stylusOnly;
        HB.toast(settings.stylusOnly ? 'Рисует только стилус' : 'Пальцы тоже рисуют');
      }
      saveSettings();
    });
    $('#ink-undo').addEventListener('click', undo);
    $('#ink-redo').addEventListener('click', redo);
    $('#ink-clear').addEventListener('click', clearPeriod);
    $('#ink-done').addEventListener('click', () => setDrawMode(false));

    document.addEventListener('keydown', (e) => {
      if (!HB.ui.drawMode || e.target.closest('input, textarea')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    });
    updateToolbar();
  }

  // ------------------------------------------------------------------ запуск

  function setup() {
    HB = window.HB;
    Store = HB.store;
    board = $('#board');
    ink = $('#ink-canvas');
    overlay = $('#overlay-canvas');
    inkCtx = ink.getContext('2d');
    overlayCtx = overlay.getContext('2d', { desynchronized: true }) || overlay.getContext('2d');

    overlay.addEventListener('pointerdown', onDown, { passive: false });
    overlay.addEventListener('pointermove', onMove, { passive: false });
    overlay.addEventListener('pointerup', onUp);
    overlay.addEventListener('pointercancel', onUp);
    overlay.addEventListener('touchstart', (e) => { if (HB.ui.drawMode) e.preventDefault(); }, { passive: false });
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('hb:layout', (e) => {
      const d = e.detail;
      const zoomChanged = Math.abs(d.zoom - layout.zoom) > 0.001;
      layout = d;
      clearTimeout(setup.resizeTimer);
      // При щипке меняем разрешение с задержкой, чтобы не перерисовывать на каждом кадре
      if (zoomChanged) setup.resizeTimer = setTimeout(resizeCanvases, 160);
      else resizeCanvases();
    });

    document.addEventListener('hb:period', () => {
      undoStack.length = 0;
      redoStack.length = 0;
      if (current) discardStroke();
      redrawAll();
      requestOverlay();
      updateToolbar();
    });

    Store.subscribe(({ paths }) => {
      const roots = new Set(paths.map(p => p.split('/').filter(Boolean)[0] || '/'));
      if (roots.has('/')) {
        redrawAll();
        requestOverlay();
        return;
      }
      if (roots.has('strokes')) syncInk();
      if (roots.has('live')) {
        paths.forEach(p => {
          const parts = p.split('/').filter(Boolean);
          if (parts[0] === 'live' && parts[1]) liveSeen[parts[1]] = Date.now();
          if (parts[0] === 'live' && !parts[1]) Object.keys(Store.get('live') || {}).forEach(cid => { liveSeen[cid] = Date.now(); });
        });
        requestOverlay();
      }
    });

    // Прячем «зависшие» живые штрихи устройств, которые закрыли вкладку посреди линии
    setInterval(() => {
      const live = Store.get('live') || {};
      if (Object.keys(live).some(cid => cid !== Store.clientId)) requestOverlay();
    }, 2000);

    setupToolbar();
    resizeCanvases();
  }

  if (window.HB) setup();
  else document.addEventListener('hb:ready', setup, { once: true });

  window.HBInk = { undo, redo, redrawAll };
})();
