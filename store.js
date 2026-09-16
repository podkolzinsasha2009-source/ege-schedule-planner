// ==========================================================================
// ХРАНИЛИЩЕ И СИНХРОНИЗАЦИЯ «ХИМБИОРУС»
//
// Источник правды — Firebase Realtime Database (бесплатный тариф Spark).
// Все данные комнаты лежат по пути /planner/<комната>:
//   items/<id>            — плашки расписания (date, order, completed, …)
//   strokes/<период>/<id> — штрихи стилуса в координатах доски
//   images/<период>/<id>  — фото на доске
//   live/<клиент>         — штрих, который рисуется прямо сейчас
//   presence/<клиент>     — кто онлайн
//
// Локально держим зеркало этих данных (IndexedDB), поэтому сайт работает
// офлайн, а несохранённые изменения отправляются при появлении сети.
// ==========================================================================

(function () {
  'use strict';

  const DEFAULT_FIREBASE_URL = 'https://himbiorus-schedule-default-rtdb.firebaseio.com';
  const ROOM_KEY = 'hb_room';
  const LEGACY_ROOM_KEY = 'himbiorus_sync_room';
  const FIREBASE_KEY = 'himbiorus_firebase_url';
  const CLIENT_KEY = 'hb_client_id';
  const LOCAL_SCOPE = '__local';
  const EPHEMERAL_ROOTS = ['live', 'presence'];

  // ---------------------------------------------------------------- utils

  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
  }

  function randomId(prefix) {
    const rnd = (crypto && crypto.getRandomValues)
      ? Array.from(crypto.getRandomValues(new Uint8Array(6)), b => (b % 36).toString(36)).join('')
      : Math.random().toString(36).slice(2, 8);
    return (prefix || '') + Date.now().toString(36) + rnd;
  }

  function splitPath(path) {
    return String(path || '').split('/').filter(Boolean);
  }

  // Firebase не хранит пустые объекты и null — зеркало ведём так же
  function isEmptyValue(v) {
    return v === null || v === undefined || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  }

  function resolveServerValues(value) {
    if (value && typeof value === 'object') {
      if (value['.sv'] === 'timestamp') return Date.now();
      const out = Array.isArray(value) ? [] : {};
      Object.keys(value).forEach(k => { out[k] = resolveServerValues(value[k]); });
      return out;
    }
    return value;
  }

  function setAt(root, path, value) {
    const parts = splitPath(path);
    if (parts.length === 0) {
      return (value && typeof value === 'object') ? value : {};
    }
    let node = root;
    const trail = [];
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!node[key] || typeof node[key] !== 'object') {
        if (isEmptyValue(value)) return root;
        node[key] = {};
      }
      trail.push([node, key]);
      node = node[key];
    }
    const last = parts[parts.length - 1];
    if (isEmptyValue(value)) delete node[last];
    else node[last] = value;
    // Подчищаем опустевшие родительские узлы
    for (let i = trail.length - 1; i >= 0; i--) {
      const [parent, key] = trail[i];
      if (isEmptyValue(parent[key])) delete parent[key];
      else break;
    }
    return root;
  }

  function getAt(root, path) {
    let node = root;
    for (const key of splitPath(path)) {
      if (!node || typeof node !== 'object') return undefined;
      node = node[key];
    }
    return node;
  }

  function isRelatedPath(a, b) {
    const pa = splitPath(a), pb = splitPath(b);
    const n = Math.min(pa.length, pb.length);
    for (let i = 0; i < n; i++) if (pa[i] !== pb[i]) return false;
    return true;
  }

  // ---------------------------------------------------------------- IndexedDB

  const idb = (function () {
    let dbPromise = null;
    function open() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve) => {
        try {
          const req = indexedDB.open('himbiorus', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('kv');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
      return dbPromise;
    }
    return {
      async get(key) {
        const db = await open();
        if (!db) return undefined;
        return new Promise((resolve) => {
          try {
            const req = db.transaction('kv').objectStore('kv').get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(undefined);
          } catch (e) { resolve(undefined); }
        });
      },
      async set(key, value) {
        const db = await open();
        if (!db) return;
        return new Promise((resolve) => {
          try {
            const tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch (e) { resolve(); }
        });
      }
    };
  })();

  // ---------------------------------------------------------------- store

  const listeners = new Set();
  const clientId = lsGet(CLIENT_KEY) || (() => { const id = randomId('c'); lsSet(CLIENT_KEY, id); return id; })();

  let data = {};
  let room = null;
  let status = 'local'; // local | connecting | online | offline
  let eventSource = null;
  let queue = [];        // постоянные записи: [{ updates, inFlight }]
  let livePending = {};  // эфемерные записи (живой штрих, присутствие)
  let liveSending = false;
  let sending = false;
  let retryTimer = null;
  let retryDelay = 1000;
  let persistTimer = null;
  let presenceTimer = null;
  let hasSnapshot = false;
  let seedFn = null;
  const snapshotWaiters = [];

  function firebaseUrl() {
    return (lsGet(FIREBASE_KEY) || DEFAULT_FIREBASE_URL).trim().replace(/\/+$/, '');
  }

  function roomUrl(path) {
    const suffix = splitPath(path).map(encodeURIComponent).join('/');
    return `${firebaseUrl()}/planner/${encodeURIComponent(room)}${suffix ? '/' + suffix : ''}.json`;
  }

  function scopeKey() {
    return room || LOCAL_SCOPE;
  }

  function emit(paths, remote) {
    listeners.forEach(fn => {
      try { fn({ paths, remote }); } catch (e) { console.error('Ошибка обработчика хранилища:', e); }
    });
  }

  function setStatus(next) {
    if (status === next) return;
    status = next;
    emit(['__status'], false);
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 600);
  }

  function persistNow() {
    clearTimeout(persistTimer);
    const snapshot = {};
    Object.keys(data).forEach(k => {
      if (!EPHEMERAL_ROOTS.includes(k)) snapshot[k] = data[k];
    });
    idb.set('mirror:' + scopeKey(), snapshot);
    idb.set('queue:' + scopeKey(), queue.map(q => q.updates));
  }

  function applyUpdates(updates) {
    const paths = Object.keys(updates);
    paths.forEach(p => { data = setAt(data, p, resolveServerValues(updates[p])); });
    return paths;
  }

  // ---- очередь записи в Firebase

  function enqueue(updates, ephemeral) {
    if (!room) return;
    if (ephemeral) {
      // Отдельная «живая» полоса: всегда отправляется только самое свежее состояние
      Object.keys(updates).forEach(k => {
        Object.keys(livePending).forEach(ek => { if (ek !== k && isRelatedPath(ek, k)) delete livePending[ek]; });
        livePending[k] = updates[k];
      });
      pumpLive();
      return;
    }
    const last = queue[queue.length - 1];
    const keys = Object.keys(updates);
    const canMerge = last && !last.inFlight &&
      keys.every(k => Object.keys(last.updates).every(ek => ek === k || !isRelatedPath(ek, k)));
    if (canMerge) Object.assign(last.updates, updates);
    else queue.push({ updates: Object.assign({}, updates) });
    schedulePersist();
    pump();
  }

  async function pumpLive() {
    if (liveSending || !room || Object.keys(livePending).length === 0) return;
    const body = livePending;
    livePending = {};
    liveSending = true;
    try {
      await fetch(roomUrl(''), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      // живые данные при сбое не повторяем
    } finally {
      liveSending = false;
    }
    if (Object.keys(livePending).length) pumpLive();
  }

  async function pump() {
    if (sending || !room || queue.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    sending = true;
    const entry = queue[0];
    entry.inFlight = true;
    const currentRoom = room;
    let ok = false;
    try {
      const res = await fetch(roomUrl(''), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.updates)
      });
      if (res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) console.warn('Firebase отклонил запись', res.status, await res.text().catch(() => ''));
      ok = true;
    } catch (err) {
      entry.inFlight = false;
      if (status === 'online') setStatus('offline');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { retryTimer = null; pump(); }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    } finally {
      sending = false;
    }
    if (ok) {
      if (room === currentRoom && queue[0] === entry) queue.shift();
      retryDelay = 1000;
      schedulePersist();
      if (queue.length > 0) pump();
    }
  }

  // ---- подписка на изменения (Server-Sent Events)

  function closeStream() {
    if (eventSource) {
      try { eventSource.close(); } catch (e) {}
      eventSource = null;
    }
  }

  function openStream() {
    closeStream();
    if (!room || typeof EventSource === 'undefined') return;
    setStatus('connecting');
    const currentRoom = room;
    const es = new EventSource(roomUrl(''));
    eventSource = es;

    const reapplyPending = () => {
      queue.forEach(q => applyUpdates(q.updates));
    };

    es.addEventListener('put', (ev) => {
      if (room !== currentRoom) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg) return;
      if (msg.path === '/') {
        data = (msg.data && typeof msg.data === 'object') ? msg.data : {};
        reapplyPending();
        markSnapshot();
        schedulePersist();
        emit(['/'], true);
      } else {
        data = setAt(data, msg.path, msg.data);
        reapplyPendingOver([msg.path]);
        schedulePersist();
        emit([msg.path], true);
      }
      setStatus('online');
    });

    es.addEventListener('patch', (ev) => {
      if (room !== currentRoom) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg || !msg.data) return;
      const paths = Object.keys(msg.data).map(k => `${msg.path.replace(/\/$/, '')}/${k}`);
      Object.keys(msg.data).forEach((k, i) => { data = setAt(data, paths[i], msg.data[k]); });
      reapplyPendingOver(paths);
      schedulePersist();
      emit(paths, true);
      setStatus('online');
    });

    es.addEventListener('keep-alive', () => setStatus('online'));
    es.addEventListener('cancel', () => setStatus('offline'));
    es.onopen = () => { setStatus('online'); retryDelay = 1000; pump(); };
    es.onerror = () => {
      if (room !== currentRoom) return;
      setStatus(navigator.onLine === false ? 'offline' : 'connecting');
      // Браузер переподключается сам; если соединение закрыто окончательно — пересоздаём
      if (es.readyState === 2) setTimeout(() => { if (room === currentRoom && eventSource === es) openStream(); }, 3000);
    };
  }

  // Эхо старой записи не должно перетирать более свежие локальные изменения, ещё не дошедшие до сервера
  function reapplyPendingOver(paths) {
    queue.forEach(q => {
      const related = {};
      Object.keys(q.updates).forEach(k => {
        if (paths.some(p => isRelatedPath(p, k))) related[k] = q.updates[k];
      });
      if (Object.keys(related).length) applyUpdates(related);
    });
  }

  function markSnapshot() {
    hasSnapshot = true;
    while (snapshotWaiters.length) snapshotWaiters.shift()();
  }

  function whenSnapshot(timeoutMs) {
    if (hasSnapshot || !room) return Promise.resolve(hasSnapshot);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), timeoutMs || 8000);
      snapshotWaiters.push(() => { clearTimeout(t); resolve(true); });
    });
  }

  // ---- присутствие

  function sendPresence() {
    if (!room) return;
    enqueue({ ['presence/' + clientId]: { ts: { '.sv': 'timestamp' }, device: deviceLabel() } }, true);
  }

  function deviceLabel() {
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet|SM-T|Android(?!.*Mobile)/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return 'Планшет';
    if (/iPhone|Android.*Mobile|Mobile/i.test(ua)) return 'Телефон';
    return 'Компьютер';
  }

  function leaveBeacon() {
    if (!room) return;
    try {
      fetch(roomUrl(''), {
        method: 'PATCH',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ['presence/' + clientId]: null, ['live/' + clientId]: null })
      });
    } catch (e) {}
  }

  // ---------------------------------------------------------------- public API

  const Store = {
    clientId,

    get data() { return data; },
    get room() { return room; },
    get status() { return status; },
    get pendingCount() { return queue.length; },

    get(path) { return getAt(data, path); },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // Мульти-путевое обновление: { 'items/abc/date': '2026-09-01', 'strokes/p01/x': null }
    update(updates, options) {
      const opts = options || {};
      const paths = applyUpdates(updates);
      const ephemeral = !!opts.ephemeral || paths.every(p => EPHEMERAL_ROOTS.includes(splitPath(p)[0]));
      if (!ephemeral) schedulePersist();
      enqueue(updates, ephemeral);
      if (!opts.silent) emit(paths, false);
    },

    newId: randomId,

    firebaseUrl,
    setFirebaseUrl(url) {
      const clean = (url || '').trim().replace(/\/+$/, '');
      lsSet(FIREBASE_KEY, clean && clean !== DEFAULT_FIREBASE_URL ? clean : null);
      if (room) Store.join(room);
    },

    // seedProvider() → { items, strokes?, images? } — данные для пустого хранилища
    async init(seedProvider) {
      seedFn = seedProvider;
      const target = Store.roomFromUrl() || lsGet(ROOM_KEY) || lsGet(LEGACY_ROOM_KEY);
      if (target) {
        await Store.join(target);
      } else {
        await loadScope();
        if (!data.items && seedFn) {
          const seed = await seedFn();
          if (seed) { Object.keys(seed).forEach(k => { data[k] = seed[k]; }); persistNow(); }
        }
        emit(['/'], false);
      }
    },

    roomFromUrl() {
      const m = (location.hash || '').match(/(?:room|sync)=([^&]+)/);
      if (!m) return null;
      try { return decodeURIComponent(m[1]).trim().toUpperCase(); } catch (e) { return null; }
    },

    generateRoomCode() {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      return 'HB-' + Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
    },

    shareUrl() {
      return `${location.origin}${location.pathname}#room=${encodeURIComponent(room || '')}`;
    },

    // Подключение к комнате. Если комната пустая — заливаем в неё текущие данные устройства.
    async join(code) {
      const nextRoom = String(code || '').trim().toUpperCase();
      if (!nextRoom || /[.#$\[\]\/]/.test(nextRoom)) throw new Error('Недопустимый код комнаты');

      const carried = data;
      if (room) { leaveBeacon(); persistNow(); }
      closeStream();
      clearInterval(presenceTimer);
      room = nextRoom;
      lsSet(ROOM_KEY, room);
      lsSet(LEGACY_ROOM_KEY, null);
      hasSnapshot = false;
      await loadScope();

      try {
        const hash = `#room=${encodeURIComponent(room)}`;
        if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);
      } catch (e) {}

      emit(['/'], false);
      openStream();
      sendPresence();
      presenceTimer = setInterval(sendPresence, 25000);

      const gotSnapshot = await whenSnapshot(12000);
      if (gotSnapshot && room === nextRoom && !data.items) {
        let seed = (carried && carried.items) ? carried : null;
        if (!seed) {
          const localMirror = await idb.get('mirror:' + LOCAL_SCOPE);
          if (localMirror && localMirror.items) seed = localMirror;
        }
        if (!seed && seedFn) seed = await seedFn();
        if (seed) await Store.seedRoom(seed);
      }
      return room;
    },

    leave() {
      if (!room) return;
      leaveBeacon();
      persistNow();
      closeStream();
      clearInterval(presenceTimer);
      room = null;
      lsSet(ROOM_KEY, null);
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      setStatus('local');
      loadScope().then(() => emit(['/'], false));
      seedLocalIfEmpty();
    },

    // Первичная заливка данных в пустую комнату (с защитой от одновременной заливки с двух устройств)
    async seedRoom(seed) {
      if (!room || !seed || !seed.items) return false;
      const url = roomUrl('items');
      try {
        // Firebase не разрешает shallow вместе с ETag; комната пустая, так что ответ маленький
        const probe = await fetch(url, { headers: { 'X-Firebase-ETag': 'true' } });
        const etag = probe.headers.get('ETag');
        const existing = await probe.json();
        if (existing) return false;
        const headers = { 'Content-Type': 'application/json' };
        if (etag) headers['if-match'] = etag;
        const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(seed.items) });
        if (!res.ok) return false;
        data = setAt(data, 'items', seed.items);
        const rest = {};
        ['strokes', 'images'].forEach(root => {
          const branch = seed[root];
          if (!branch || typeof branch !== 'object') return;
          Object.keys(branch).forEach(pid => {
            Object.keys(branch[pid] || {}).forEach(id => { rest[`${root}/${pid}/${id}`] = branch[pid][id]; });
          });
        });
        if (Object.keys(rest).length) Store.update(rest, { silent: true });
        schedulePersist();
        emit(['/'], false);
        return true;
      } catch (e) {
        console.warn('Не удалось заполнить комнату:', e);
        return false;
      }
    },

    // Заменить всё расписание (сброс или импорт)
    replaceItems(items) {
      data = setAt(data, 'items', items);
      schedulePersist();
      if (room) {
        queue = queue.filter(q => q.inFlight || !Object.keys(q.updates).some(k => splitPath(k)[0] === 'items'));
        enqueue({ items }, false);
      }
      emit(['items'], false);
    },

    flush: pump,

    peers() {
      const presence = data.presence || {};
      const now = Date.now();
      return Object.keys(presence)
        .filter(id => id !== clientId && presence[id] && Math.abs(now - (presence[id].ts || 0)) < 75000)
        .map(id => ({ id, device: presence[id].device || 'Устройство' }));
    }
  };

  async function loadScope() {
    const mirror = await idb.get('mirror:' + scopeKey());
    const pending = await idb.get('queue:' + scopeKey());
    data = (mirror && typeof mirror === 'object') ? mirror : {};
    queue = Array.isArray(pending) ? pending.map(u => ({ updates: u })) : [];
    queue.forEach(q => applyUpdates(q.updates));
  }

  async function seedLocalIfEmpty() {
    await new Promise(r => setTimeout(r, 0));
    if (!room && !data.items && seedFn) {
      const seed = await seedFn();
      if (seed && !room) { Object.keys(seed).forEach(k => { data[k] = seed[k]; }); persistNow(); emit(['/'], false); }
    }
  }

  // Прибираемся при закрытии вкладки и восстанавливаем связь при возвращении
  window.addEventListener('pagehide', () => { persistNow(); leaveBeacon(); });
  window.addEventListener('online', () => { if (room) { openStream(); pump(); } });
  window.addEventListener('offline', () => { if (room) setStatus('offline'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { persistNow(); return; }
    if (room) {
      if (!eventSource || eventSource.readyState === 2) openStream();
      sendPresence();
      pump();
    }
  });

  window.HBStore = Store;
})();
