// ==========================================================================
// СТИЛУС «ХИМБИОРУС» — рукописные заметки поверх доски
//
// Доска — одна длинная лента из всех периодов. Холст стилуса один на всю
// ленту, а какому периоду принадлежит штрих определяется по тому, в какой
// период попала точка начала жеста (HB.periodAt). В хранилище координаты
// штриха остаются локальными для своего периода (strokes/<период>/<id>),
// а при рисовании к ним прибавляется смещение периода на общей ленте
// (HB.periodTop) — так штрихи не «поедут», если высота периодов чуть
// изменится из-за добавленных/удалённых плашек на других устройствах.
// ==========================================================================

(function () {
  'use strict';

  const MAX_CANVAS_PIXELS = 8e6;
  const VIEW_MARGIN = 240; // запас вокруг видимой области, чтобы при прокрутке не было пустых краёв
  const LIVE_INTERVAL = 60;
  const STALE_LIVE_MS = 6000;
  // «Нарисуй и задержи»: как в GoodNotes и Procreate (там задержка настраивается 0,1–1,5 с)
  const SHAPE_HOLD_MS = 500;
  const SHAPE_HOLD_TOLERANCE = 6; // экранных px — дрожание руки не сбрасывает удержание

  let HB, Store;
  let board, ink, inkCtx, overlay, overlayCtx;
  let layout = { width: 1480, height: 0, zoom: 1 };
  // Где стоят холсты внутри #board-sizer (экранные px) и с каким разрешением
  let view = { left: 0, top: 0, w: 0, h: 0, scale: 1, zoom: 0 };
  let placeRaf = null;
  let placeForce = false;
  let placeAfterStroke = false;

  const settings = {
    tool: 'pen',          // pen | hl | eraser | stroke-eraser
    color: '#ff7a1a',
    size: 3,
    pressure: true,
    stylusOnly: false,
    shapes: true
  };
  let penSeen = false;

  let rendered = new Set();
  const parsedCache = new Map(); // id → { p, pts, box }
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
    return parsed(id, stroke).pts;
  }

  // Точки штриха (в ЛОКАЛЬНЫХ для своего периода координатах) и его рамка
  // (для пропуска штрихов за краем холста)
  function parsed(id, stroke) {
    const cached = parsedCache.get(id);
    if (cached && cached.p === stroke.p) return cached;
    const pts = decodePoints(stroke.p);
    const pad = widthFor(stroke, 1) / 2 + 2;
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    pts.forEach(pt => {
      if (pt[0] < box.x0) box.x0 = pt[0];
      if (pt[1] < box.y0) box.y0 = pt[1];
      if (pt[0] > box.x1) box.x1 = pt[0];
      if (pt[1] > box.y1) box.y1 = pt[1];
    });
    box.x0 -= pad; box.y0 -= pad; box.x1 += pad; box.y1 += pad;
    const entry = { p: stroke.p, pts, box };
    parsedCache.set(id, entry);
    return entry;
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

  // «Текущий» период (для кнопки «Стереть всё») — период, видимый на экране
  function periodId() {
    const p = HB.currentPeriod();
    return p ? p.id : 'default';
  }

  function periodStrokes(pid) {
    return Store.get(`strokes/${pid}`) || {};
  }

  function sortedIds(strokes) {
    return Object.keys(strokes).sort((a, b) => ((strokes[a].ts || 0) - (strokes[b].ts || 0)) || (a < b ? -1 : 1));
  }

  // Холсты покрывают только видимую часть доски (плюс запас) и не масштабируются через CSS.
  // Раньше холст был размером со всю доску внутри увеличенной доски: при сильном
  // приближении браузер на каждое движение стилуса перерисовывал огромную текстуру.
  function placeCanvases(force) {
    if (current) { placeAfterStroke = true; return; }
    const sizer = board.parentElement;
    const viewport = sizer.parentElement;
    const sr = sizer.getBoundingClientRect();
    const vr = viewport.getBoundingClientRect();
    const z = layout.zoom;
    const fullW = layout.width * z;
    const fullH = Math.max(layout.height, 1) * z;

    const visL = Math.max(0, Math.max(vr.left, 0) - sr.left);
    const visT = Math.max(0, Math.max(vr.top, 0) - sr.top);
    const visR = Math.min(fullW, Math.min(vr.right, window.innerWidth) - sr.left);
    const visB = Math.min(fullH, Math.min(vr.bottom, window.innerHeight) - sr.top);
    if (visR <= visL || visB <= visT) return; // доска не на экране

    const covered = view.w > 0 && view.zoom === z &&
      visL >= view.left && visT >= view.top && visR <= view.left + view.w && visB <= view.top + view.h;
    if (covered && !force) return;

    const left = Math.max(0, Math.floor(visL - VIEW_MARGIN));
    const top = Math.max(0, Math.floor(visT - VIEW_MARGIN));
    const w = Math.max(1, Math.min(fullW, Math.ceil(visR + VIEW_MARGIN)) - left);
    const h = Math.max(1, Math.min(fullH, Math.ceil(visB + VIEW_MARGIN)) - top);
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.max(0.5, Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (w * h))));
    const pw = Math.round(w * scale), ph = Math.round(h * scale);

    [ink, overlay].forEach(c => {
      c.style.left = left + 'px';
      c.style.top = top + 'px';
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      if (c.width !== pw) c.width = pw;
      if (c.height !== ph) c.height = ph;
    });
    view = { left, top, w, h, scale, zoom: z };
    applyTransform(inkCtx);
    applyTransform(overlayCtx);
    redrawAll();
    overlayDirty = false;
    requestOverlay();
  }

  // Координаты доски (глобальные, по всей ленте периодов) → пиксели холста
  function applyTransform(ctx) {
    const k = view.scale * view.zoom;
    ctx.setTransform(k, 0, 0, k, -view.left * view.scale, -view.top * view.scale);
  }

  function schedulePlace(force) {
    if (force) placeForce = true;
    if (placeRaf) return;
    placeRaf = requestAnimationFrame(() => {
      placeRaf = null;
      const f = placeForce;
      placeForce = false;
      placeCanvases(f);
    });
  }

  // Видимая часть доски в глобальных координатах ленты — чтобы не рисовать штрихи
  // и не перебирать периоды за краем холста
  function visibleBoardRect() {
    const k = view.zoom || 1;
    return { x0: view.left / k, y0: view.top / k, x1: (view.left + view.w) / k, y1: (view.top + view.h) / k };
  }

  function clearCtx(ctx, canvas) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Перебираем периоды, которые попадают в видимую область, и для каждого рисуем
  // его штрихи со сдвигом ctx.translate(0, периодTop) — так локальные координаты
  // штриха превращаются в правильное место на общей ленте.
  function redrawAll() {
    clearCtx(inkCtx, ink);
    rendered = new Set();
    const vis = visibleBoardRect();
    const periods = HB.periodLayout().filter(p => p.top + p.height >= vis.y0 && p.top <= vis.y1);
    periods.forEach(p => {
      const strokes = periodStrokes(p.id);
      const localVis = { x0: vis.x0, x1: vis.x1, y0: vis.y0 - p.top, y1: vis.y1 - p.top };
      inkCtx.save();
      inkCtx.translate(0, p.top);
      sortedIds(strokes).forEach(id => {
        const entry = parsed(id, strokes[id]);
        rendered.add(id);
        const box = entry.box;
        if (box.x1 < localVis.x0 || box.x0 > localVis.x1 || box.y1 < localVis.y0 || box.y0 > localVis.y1) return;
        drawStroke(inkCtx, strokes[id], entry.pts);
      });
      inkCtx.restore();
    });
    // Недописанная линия ручки уже в глобальных координатах — сдвиг не нужен
    if (current && current.stroke.t === 'pen') drawStroke(inkCtx, current.stroke, current.pts);
  }

  // Полный пересчёт при любом изменении штрихов от других устройств — штрихи
  // финализируются нечасто (раз на законченную линию), поэтому точечная
  // доперерисовка не нужна и лишь усложняет код при нескольких периодах разом.
  function syncInk() {
    redrawAll();
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
    const now = Date.now();
    Object.keys(live).forEach(cid => {
      if (cid === Store.clientId) return;
      const entry = live[cid];
      if (!entry || entry.t === 'eraser') return;
      if (entry.sid && Store.get(`strokes/${entry.pid}/${entry.sid}`)) return;
      if (now - (liveSeen[cid] || 0) > STALE_LIVE_MS) return;
      overlayCtx.save();
      overlayCtx.translate(0, HB.periodTop(entry.pid));
      drawStroke(overlayCtx, entry, decodePoints(entry.p));
      overlayCtx.restore();
    });
    if (current && current.stroke.t === 'hl') {
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
    const rect = board.getBoundingClientRect();
    const startY = (e.clientY - rect.top) / layout.zoom;
    const pid = HB.periodAt(startY).id;
    current = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      id: Store.newId('s'),
      pid,
      originTop: HB.periodTop(pid), // локальная точка отсчёта штриха для хранения в БД
      rect,
      pts: [],           // точки копятся в ГЛОБАЛЬНЫХ координатах, пока штрих рисуется
      erased: {},
      stroke: { t: tool, c: settings.color, s: settings.size }
    };
    extendStroke(e);
  }

  function extendStroke(e) {
    if (current.snapped) return; // фигура уже выпрямлена — ждём, пока стилус оторвут
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
    } else if (current.stroke.t === 'pen') {
      // Ручку рисуем сразу на основном холсте — без ожидания кадра анимации
      drawPenSegment(current, pts.length - 1);
    } else {
      requestOverlay();
    }

    watchHold(x, y);

    const now = performance.now();
    if (now - lastLiveSent > LIVE_INTERVAL) {
      lastLiveSent = now;
      sendLive();
    }
  }

  // Если стилус замер, не отрываясь, — пробуем превратить линию в ровную фигуру
  function watchHold(x, y) {
    if (!settings.shapes || (current.stroke.t !== 'pen' && current.stroke.t !== 'hl')) return;
    const tolerance = SHAPE_HOLD_TOLERANCE / (layout.zoom || 1);
    const anchor = current.holdAnchor;
    if (anchor && Math.abs(anchor[0] - x) <= tolerance && Math.abs(anchor[1] - y) <= tolerance) return;
    current.holdAnchor = [x, y];
    clearTimeout(current.holdTimer);
    const stroke = current;
    current.holdTimer = setTimeout(() => snapShape(stroke), SHAPE_HOLD_MS);
  }

  function snapShape(stroke) {
    if (current !== stroke || stroke.snapped || !window.HBShapes) return;
    const shape = window.HBShapes.recognize(stroke.pts);
    if (!shape) return;
    stroke.pts = shape.points;
    stroke.snapped = true;
    if (navigator.vibrate) navigator.vibrate(10);
    if (stroke.stroke.t === 'pen') redrawAll(); // стираем кривую линию и рисуем ровную
    requestOverlay();
    sendLive();
  }

  // Отрезок между серединами соседних точек — та же кривая, что и в drawStroke
  function drawPenSegment(stroke, i) {
    const pts = stroke.pts;
    if (i < 1) return;
    const a = pts[i - 1], b = pts[i];
    const start = i >= 2 ? [(pts[i - 2][0] + a[0]) / 2, (pts[i - 2][1] + a[1]) / 2] : [a[0], a[1]];
    const end = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    inkCtx.save();
    inkCtx.globalCompositeOperation = 'source-over';
    inkCtx.lineCap = 'round';
    inkCtx.lineJoin = 'round';
    inkCtx.strokeStyle = stroke.stroke.c;
    inkCtx.lineWidth = widthFor(stroke.stroke, (a[2] + b[2]) / 2);
    inkCtx.beginPath();
    inkCtx.moveTo(start[0], start[1]);
    inkCtx.quadraticCurveTo(a[0], a[1], end[0], end[1]);
    inkCtx.stroke();
    inkCtx.restore();
  }

  function drawPenTail(stroke) {
    const pts = stroke.pts;
    if (pts.length === 1) {
      drawStroke(inkCtx, stroke.stroke, pts);
      return;
    }
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    inkCtx.save();
    inkCtx.lineCap = 'round';
    inkCtx.strokeStyle = stroke.stroke.c;
    inkCtx.lineWidth = widthFor(stroke.stroke, b[2]);
    inkCtx.beginPath();
    inkCtx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    inkCtx.lineTo(b[0], b[1]);
    inkCtx.stroke();
    inkCtx.restore();
  }

  // В сеть уходят ЛОКАЛЬНЫЕ координаты (минус originTop) — так соседнее устройство
  // само прибавит смещение своего (совпадающего) HB.periodTop(pid) при отрисовке.
  function sendLive() {
    if (!Store.room || !current || current.stroke.t === 'stroke-eraser') return;
    const localPts = current.pts.map(p => [p[0], p[1] - current.originTop, p[2]]);
    Store.update({
      ['live/' + Store.clientId]: Object.assign({ pid: current.pid, sid: current.id, p: encodePoints(localPts) }, current.stroke)
    }, { ephemeral: true, silent: true });
  }

  function finishStroke() {
    const done = current;
    current = null;
    if (!done) return;
    clearTimeout(done.holdTimer);
    if (placeAfterStroke) {
      placeAfterStroke = false;
      schedulePlace(true);
    }

    if (done.stroke.t === 'stroke-eraser') {
      if (Object.keys(done.erased).length) {
        pushUndo({ type: 'erase', pid: done.pid, strokes: done.erased });
      }
      return;
    }
    if (done.pts.length === 0) { requestOverlay(); return; }
    if (done.stroke.t === 'pen') {
      drawPenTail(done);
      rendered.add(done.id); // уже на холсте — syncInk не будет рисовать повторно
    }

    const localPts = done.pts.map(p => [p[0], p[1] - done.originTop, p[2]]);
    const record = Object.assign({}, done.stroke, { p: encodePoints(localPts), ts: Date.now(), by: Store.clientId });
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
    if (was) clearTimeout(was.holdTimer);
    if (was && (was.stroke.t === 'eraser' || was.stroke.t === 'pen')) redrawAll();
    if (Store.room && was) Store.update({ ['live/' + Store.clientId]: null }, { ephemeral: true, silent: true });
    requestOverlay();
  }

  // ---- ластик штрихов: касание любой части линии удаляет её целиком.
  // x,y — глобальные координаты; сравниваем с локальными точками штрихов
  // того же периода, куда «попал» этот жест стирания (current.pid/originTop).

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = dx * dx + dy * dy;
    let t = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function eraseStrokesAt(x, y) {
    const pid = current.pid;
    const localY = y - current.originTop;
    const strokes = periodStrokes(pid);
    const radius = Math.max(10, settings.size * 3);
    const updates = {};
    Object.keys(strokes).forEach(id => {
      const st = strokes[id];
      if (!st || st.t === 'eraser') return;
      const pts = pointsOf(id, st);
      const reach = radius + widthFor(st, 0.6) / 2;
      const hit = pts.length === 1
        ? Math.hypot(pts[0][0] - x, pts[0][1] - localY) <= reach
        : pts.some((p, i) => i > 0 && distToSegment(x, localY, pts[i - 1][0], pts[i - 1][1], p[0], p[1]) <= reach);
      if (hit) {
        current.erased[id] = st;
        updates[`strokes/${pid}/${id}`] = null;
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
    const pid = periodId();
    const strokes = periodStrokes(pid);
    if (!Object.keys(strokes).length) { HB.toast('На этом периоде нет рисунков'); return; }
    if (!confirm('Стереть все рисунки на этом периоде? Действие можно отменить кнопкой «Отменить».')) return;
    const action = { type: 'clear', pid, strokes: Object.assign({}, strokes) };
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
    $('#ink-shapes').classList.toggle('is-active', settings.shapes);
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
    $('#ink-shapes').addEventListener('click', () => {
      settings.shapes = !settings.shapes;
      saveSettings();
      HB.toast(settings.shapes
        ? 'Фигуры: нарисуйте и задержите стилус на полсекунды — линия выпрямится'
        : 'Выпрямление фигур выключено');
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
    // Без desynchronized: Safari на iPad не показывает такой холст, пока линия не закончена
    overlayCtx = overlay.getContext('2d');

    overlay.addEventListener('pointerdown', onDown, { passive: false });
    overlay.addEventListener('pointermove', onMove, { passive: false });
    overlay.addEventListener('pointerup', onUp);
    overlay.addEventListener('pointercancel', onUp);
    overlay.addEventListener('touchstart', (e) => { if (HB.ui.drawMode) e.preventDefault(); }, { passive: false });
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('hb:layout', (e) => {
      const d = e.detail;
      const changed = Math.abs(d.zoom - layout.zoom) > 0.0001 || d.height !== layout.height;
      layout = d;
      schedulePlace(changed);
    });
    window.addEventListener('scroll', () => schedulePlace(false), { passive: true });
    board.parentElement.parentElement.addEventListener('scroll', () => schedulePlace(false), { passive: true });
    window.addEventListener('resize', () => schedulePlace(true));
    // Запасной таймер: кадры анимации не приходят в фоновой вкладке
    setInterval(() => { if (!current) placeCanvases(false); }, 1500);

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
    placeCanvases(true);
  }

  if (window.HB) setup();
  else document.addEventListener('hb:ready', setup, { once: true });

  window.HBInk = { undo, redo, redrawAll };
})();
