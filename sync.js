// ==========================================================================
// ДВИЖОК МГНОВЕННОЙ СИНХРОНИЗАЦИИ В РЕАЛЬНОМ ВРЕМЕНИ (REALTIME SYNC ENGINE)
// «ХимБиоРус ЕГЭ» — Кросс-девайс обмен (Планшет ↔ ПК ↔ Телефон)
// Технологии: MQTT over Secure WebSockets (WSS), BroadcastChannel, Firebase RTDB
// ==========================================================================

(function (global) {
  'use strict';

  // Константы хранилища и реле
  const ROOM_STORAGE_KEY = 'himbiorus_sync_room';
  const FIREBASE_STORAGE_KEY = 'himbiorus_firebase_url';
  const PRIMARY_BROKER_WSS = 'wss://broker.hivemq.com:8884/mqtt';
  const FALLBACK_BROKER_WSS = 'wss://broker.emqx.io:8084/mqtt';
  const MOSQUITTO_BROKER_WSS = 'wss://test.mosquitto.org:8081/mqtt';

  // Префиксы для читаемых кодов комнат (например ХИМ-749, БИО-521, ЕГЭ-308)
  const ROOM_PREFIXES = ['ХИМ', 'БИО', 'РУС', 'ЕГЭ', 'КУРС', 'МЕД', 'ПЛАН'];

  // Уникальный ID текущего клиента (вкладки/устройства)
  const CLIENT_ID = 'client_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);

  // Внутреннее состояние
  let currentRoom = null;
  let ws = null;
  let broadcastChannel = null;
  let status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
  // Тройное резервирование: EMQX и Mosquitto отвечают <200мс без блокировок LTE, HiveMQ как резерв
  let activeBrokers = [FALLBACK_BROKER_WSS, MOSQUITTO_BROKER_WSS, PRIMARY_BROKER_WSS];
  let currentBrokerIdx = 0;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let connectTimeout = null;
  let pingInterval = null;
  let heartbeatInterval = null;
  let pruneInterval = null;
  let activePeers = new Map(); // clientId -> lastSeen timestamp
  let seenMessageIds = new Set();
  let outgoingQueue = [];
  let callbacks = {
    onStatusChange: null,
    onMoveItem: null,
    onToggleCompleted: null,
    onAddItem: null,
    onUpdateItem: null,
    onDeleteItem: null,
    onStrokeAdd: null,
    onStrokeUndo: null,
    onStrokeClear: null,
    onRequestState: null,
    onFullStateSync: null
  };

  // ==========================================================================
  // КОМПАКТНЫЙ ГЕНЕРАТОР ВЕКТОРНЫХ QR-КОДОВ (Type 1-10 Byte Mode)
  // Без внешних библиотек и CDN — работает 100% автономно в офлайне PWA
  // ==========================================================================
  const MiniQR = (function () {
    const EXP = new Uint8Array(512);
    const LOG = new Uint8Array(256);
    for (let i = 0, x = 1; i < 255; i++) {
      EXP[i] = x;
      EXP[i + 255] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 256) x ^= 0x11d;
    }

    function polyMul(p1, p2) {
      const r = new Uint8Array(p1.length + p2.length - 1);
      for (let i = 0; i < p1.length; i++) {
        if (!p1[i]) continue;
        const l1 = LOG[p1[i]];
        for (let j = 0; j < p2.length; j++) {
          if (p2[j]) r[i + j] ^= EXP[l1 + LOG[p2[j]]];
        }
      }
      return r;
    }

    function getGenerator(n) {
      let g = new Uint8Array([1]);
      for (let i = 0; i < n; i++) {
        g = polyMul(g, new Uint8Array([1, EXP[i]]));
      }
      return g;
    }

    function polyDiv(msg, gen) {
      const m = new Uint8Array(msg.length + gen.length - 1);
      m.set(msg);
      const genLen = gen.length;
      for (let i = 0; i < msg.length; i++) {
        const coef = m[i];
        if (coef !== 0) {
          const logCoef = LOG[coef];
          for (let j = 0; j < genLen; j++) {
            if (gen[j]) m[i + j] ^= EXP[logCoef + LOG[gen[j]]];
          }
        }
      }
      return m.subarray(msg.length);
    }

    const TABLE_L = [
      null,
      { data: 19, ec: 7, blocks: 1 },
      { data: 34, ec: 10, blocks: 1 },
      { data: 55, ec: 15, blocks: 1 },
      { data: 80, ec: 20, blocks: 1 },
      { data: 108, ec: 26, blocks: 1 },
      { data: 136, ec: 18, blocks: 2 },
      { data: 156, ec: 20, blocks: 2 },
      { data: 194, ec: 24, blocks: 2 },
      { data: 232, ec: 30, blocks: 2 },
      { data: 274, ec: 18, blocks: 4 }
    ];

    const ALIGN = [
      [], [], [6, 18], [6, 22], [6, 26], [6, 30],
      [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
    ];

    function encodeData(text, version) {
      const tBytes = new TextEncoder().encode(text);
      const capacity = TABLE_L[version].data;
      const bits = [];
      function put(val, len) {
        for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
      }
      put(4, 4); // Byte mode
      put(tBytes.length, version < 10 ? 8 : 16);
      for (let i = 0; i < tBytes.length; i++) {
        put(tBytes[i], 8);
      }
      const termLen = Math.min(4, capacity * 8 - bits.length);
      for (let i = 0; i < termLen; i++) bits.push(0);
      while (bits.length % 8 !== 0) bits.push(0);

      const bytes = [];
      for (let i = 0; i < bits.length; i += 8) {
        let b = 0;
        for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
        bytes.push(b);
      }
      const pad = [0xEC, 0x11];
      let padIdx = 0;
      while (bytes.length < capacity) {
        bytes.push(pad[padIdx++ % 2]);
      }
      return new Uint8Array(bytes);
    }

    function generateMatrix(text) {
      const rawBytes = new TextEncoder().encode(text);
      let version = 1;
      while (version <= 10 && TABLE_L[version].data < rawBytes.length + (version < 10 ? 2 : 3)) {
        version++;
      }
      if (version > 10) version = 10;

      const vInfo = TABLE_L[version];
      const dataBytes = encodeData(text, version);
      const size = 17 + 4 * version;

      const blockSize = Math.floor(vInfo.data / vInfo.blocks);
      const ecPerBlock = vInfo.ec;
      const gen = getGenerator(ecPerBlock);
      const blocks = [];
      const ecBlocks = [];

      let offset = 0;
      for (let b = 0; b < vInfo.blocks; b++) {
        const bLen = blockSize + (b >= vInfo.blocks - (vInfo.data % vInfo.blocks) ? 1 : 0);
        const bData = dataBytes.subarray(offset, offset + bLen);
        offset += bLen;
        blocks.push(bData);
        ecBlocks.push(polyDiv(bData, gen));
      }

      const interleaved = [];
      const maxDataLen = Math.max(...blocks.map(b => b.length));
      for (let i = 0; i < maxDataLen; i++) {
        for (let b = 0; b < vInfo.blocks; b++) {
          if (i < blocks[b].length) interleaved.push(blocks[b][i]);
        }
      }
      for (let i = 0; i < ecPerBlock; i++) {
        for (let b = 0; b < vInfo.blocks; b++) {
          interleaved.push(ecBlocks[b][i]);
        }
      }

      const matrix = Array.from({ length: size }, () => Array(size).fill(null));
      const isReserved = Array.from({ length: size }, () => Array(size).fill(false));

      function setFunc(r, c, val) {
        matrix[r][c] = val;
        isReserved[r][c] = true;
      }

      function addFinder(row, col) {
        for (let r = -1; r <= 7; r++) {
          for (let c = -1; c <= 7; c++) {
            const nr = row + r, nc = col + c;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            const isDark = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                           (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                           (r >= 2 && r <= 4 && c >= 2 && c <= 4);
            setFunc(nr, nc, isDark);
          }
        }
      }
      addFinder(0, 0);
      addFinder(0, size - 7);
      addFinder(size - 7, 0);

      const alignPos = ALIGN[version];
      for (let i = 0; i < alignPos.length; i++) {
        for (let j = 0; j < alignPos.length; j++) {
          const r = alignPos[i], c = alignPos[j];
          if (isReserved[r][c]) continue;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const isDark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
              setFunc(r + dr, c + dc, isDark);
            }
          }
        }
      }

      for (let i = 8; i < size - 8; i++) {
        if (!isReserved[6][i]) setFunc(6, i, i % 2 === 0);
        if (!isReserved[i][6]) setFunc(i, 6, i % 2 === 0);
      }

      setFunc(4 * version + 9, 8, true);

      // Резервируем ячейки информации о формате (15 бит вокруг поисковых меток)
      for (let i = 0; i < 9; i++) {
        if (!isReserved[8][i]) isReserved[8][i] = true;
        if (!isReserved[i][8]) isReserved[i][8] = true;
      }
      for (let i = 0; i < 8; i++) {
        isReserved[8][size - 1 - i] = true;
      }
      for (let i = 0; i < 7; i++) {
        isReserved[size - 1 - i][8] = true;
      }

      const dataBits = [];
      for (const b of interleaved) {
        for (let i = 7; i >= 0; i--) dataBits.push((b >> i) & 1);
      }

      let bitIdx = 0;
      let right = size - 1;
      let dir = -1;

      while (right > 0) {
        if (right === 6) right--;
        const rRange = dir === -1
          ? Array.from({ length: size }, (_, i) => size - 1 - i)
          : Array.from({ length: size }, (_, i) => i);

        for (const r of rRange) {
          for (let c = 0; c < 2; c++) {
            const col = right - c;
            if (!isReserved[r][col]) {
              let bit = bitIdx < dataBits.length ? dataBits[bitIdx++] : 0;
              if ((r + col) % 2 === 0) bit ^= 1; // Mask 0
              matrix[r][col] = bit === 1;
            }
          }
        }
        right -= 2;
        dir = -dir;
      }

      // Информация о формате: Level L, mask 0 -> 111011111000100 (BCH 15,5 с маской 0x5412)
      const FORMAT_BITS = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
      for (let i = 0; i < 6; i++) matrix[8][i] = FORMAT_BITS[i] === 1;
      matrix[8][7] = FORMAT_BITS[6] === 1;
      matrix[8][8] = FORMAT_BITS[7] === 1;
      matrix[7][8] = FORMAT_BITS[8] === 1;
      for (let i = 9; i < 15; i++) matrix[14 - i][8] = FORMAT_BITS[i] === 1;

      for (let i = 0; i < 7; i++) matrix[size - 1 - i][8] = FORMAT_BITS[i] === 1;
      for (let i = 0; i < 8; i++) matrix[8][size - 8 + i] = FORMAT_BITS[7 + i] === 1;

      return { matrix, size };
    }

    function toSVG(text, sizePx = 220) {
      const { matrix, size } = generateMatrix(text);
      const border = 4;
      const total = size + border * 2;
      let path = '';
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c]) {
            path += `M${c + border},${r + border}h1v1h-1z `;
          }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">
        <rect width="100%" height="100%" fill="#ffffff" rx="12" />
        <path d="${path.trim()}" fill="#090d16" />
      </svg>`;
    }

    return { toSVG };
  })();

  // ==========================================================================
  // MQTT 3.1.1 НАД WEBSOCKET (WSS RELAY PROTOCOL)
  // Бессерверное общение, задержка <40 мс, нулевая стоимость
  // ==========================================================================

  function encodeRemainingLength(len) {
    const bytes = [];
    do {
      let encByte = len % 128;
      len = Math.floor(len / 128);
      if (len > 0) encByte |= 0x80;
      bytes.push(encByte);
    } while (len > 0);
    return bytes;
  }

  function decodeRemainingLength(buf, offset) {
    let multiplier = 1;
    let value = 0;
    let bytesRead = 0;
    let encodedByte;
    do {
      if (offset + bytesRead >= buf.length) return null;
      encodedByte = buf[offset + bytesRead++];
      value += (encodedByte & 127) * multiplier;
      multiplier *= 128;
      if (multiplier > 128 * 128 * 128) throw new Error('Malformed Remaining Length');
    } while ((encodedByte & 128) !== 0);
    return { value, bytesRead };
  }

  function createConnectPacket(clientId) {
    const protoName = [0, 4, 77, 81, 84, 84]; // 'MQTT'
    const protoLevel = 4; // 3.1.1
    const flags = 2; // Clean session
    const keepAlive = [0, 45]; // 45 seconds keep-alive
    const clientIdBytes = new TextEncoder().encode(clientId);
    const varHeaderLen = 10 + 2 + clientIdBytes.length;
    const remBytes = encodeRemainingLength(varHeaderLen);
    const packet = new Uint8Array(1 + remBytes.length + varHeaderLen);
    packet[0] = 0x10;
    packet.set(remBytes, 1);
    let offset = 1 + remBytes.length;
    packet.set(protoName, offset); offset += 6;
    packet[offset++] = protoLevel;
    packet[offset++] = flags;
    packet.set(keepAlive, offset); offset += 2;
    packet[offset++] = Math.floor(clientIdBytes.length / 256);
    packet[offset++] = clientIdBytes.length % 256;
    packet.set(clientIdBytes, offset);
    return packet;
  }

  function createSubscribePacket(topic, packetId = 1) {
    const tBytes = new TextEncoder().encode(topic);
    const payloadLen = 2 + 2 + tBytes.length + 1;
    const remBytes = encodeRemainingLength(payloadLen);
    const packet = new Uint8Array(1 + remBytes.length + payloadLen);
    packet[0] = 0x82;
    packet.set(remBytes, 1);
    let offset = 1 + remBytes.length;
    packet[offset++] = Math.floor(packetId / 256);
    packet[offset++] = packetId % 256;
    packet[offset++] = Math.floor(tBytes.length / 256);
    packet[offset++] = tBytes.length % 256;
    packet.set(tBytes, offset); offset += tBytes.length;
    packet[offset] = 0; // QoS 0
    return packet;
  }

  function createPublishPacket(topic, payloadStr) {
    const tBytes = new TextEncoder().encode(topic);
    const mBytes = new TextEncoder().encode(payloadStr);
    const varHeaderLen = 2 + tBytes.length;
    const payloadLen = varHeaderLen + mBytes.length;
    const remBytes = encodeRemainingLength(payloadLen);
    const packet = new Uint8Array(1 + remBytes.length + payloadLen);
    packet[0] = 0x30;
    packet.set(remBytes, 1);
    let offset = 1 + remBytes.length;
    packet[offset++] = Math.floor(tBytes.length / 256);
    packet[offset++] = tBytes.length % 256;
    packet.set(tBytes, offset); offset += tBytes.length;
    packet.set(mBytes, offset);
    return packet;
  }

  const PINGREQ_PACKET = new Uint8Array([0xC0, 0x00]);

  function parseMqttPackets(data) {
    const packets = [];
    let offset = 0;
    while (offset < data.length) {
      const type = data[offset] >> 4;
      const flags = data[offset] & 0x0f;
      offset++;
      const rem = decodeRemainingLength(data, offset);
      if (!rem) break;
      offset += rem.bytesRead;
      const packetEnd = offset + rem.value;
      if (packetEnd > data.length) break;

      const payloadSlice = data.subarray(offset, packetEnd);
      packets.push({ type, flags, payload: payloadSlice });
      offset = packetEnd;
    }
    return packets;
  }

  // ==========================================================================
  // ГЕНЕРАЦИЯ И ПАРСИНГ КОДОВ КОМНАТ
  // ==========================================================================

  function generateRoomCode() {
    const prefix = ROOM_PREFIXES[Math.floor(Math.random() * ROOM_PREFIXES.length)];
    const num = Math.floor(100 + Math.random() * 900);
    return `${prefix}-${num}`;
  }

  function getStoredRoom() {
    try {
      return localStorage.getItem(ROOM_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function saveStoredRoom(code) {
    try {
      if (code) {
        localStorage.setItem(ROOM_STORAGE_KEY, code);
      } else {
        localStorage.removeItem(ROOM_STORAGE_KEY);
      }
    } catch (e) {}
  }

  function parseRoomFromUrl() {
    try {
      const hash = window.location.hash || '';
      const match = hash.match(/#(?:sync|room)=([^&]+)/i);
      if (match && match[1]) {
        return decodeURIComponent(match[1].trim());
      }
      const search = window.location.search || '';
      const matchSearch = search.match(/[?&](?:sync|room)=([^&]+)/i);
      if (matchSearch && matchSearch[1]) {
        return decodeURIComponent(matchSearch[1].trim());
      }
    } catch (e) {}
    return null;
  }

  function getRoomUrl(roomId) {
    const base = window.location.origin + window.location.pathname;
    return `${base}#sync=${encodeURIComponent(roomId || currentRoom || '')}`;
  }

  // ==========================================================================
  // УПРАВЛЕНИЕ ПИРАМИ И СТАТУСОМ СЕТИ
  // ==========================================================================

  function updateStatus(newStatus) {
    if (status !== newStatus) {
      status = newStatus;
    }
    notifyStatus();
  }

  function notifyStatus() {
    if (typeof callbacks.onStatusChange === 'function') {
      callbacks.onStatusChange(status, getPeerCount());
    }
  }

  function getPeerCount() {
    if (status !== 'connected') return 0;
    return activePeers.size + 1; // Себя + активные пиры
  }

  function recordPeerActivity(peerId) {
    if (!peerId || peerId === CLIENT_ID) return;
    const isNew = !activePeers.has(peerId);
    activePeers.set(peerId, Date.now());
    if (isNew) {
      notifyStatus();
    }
  }

  function prunePeers() {
    const now = Date.now();
    let changed = false;
    for (const [peerId, lastSeen] of activePeers.entries()) {
      if (now - lastSeen > 40000) { // Не слышали 40 секунд
        activePeers.delete(peerId);
        changed = true;
      }
    }
    if (changed) {
      notifyStatus();
    }
  }

  // ==========================================================================
  // СЕТЕВОЙ ТРАНСПОРТ И ПЕРЕПОДКЛЮЧЕНИЕ
  // ==========================================================================

  function getTopic(roomId) {
    return `himbiorus/rooms/${roomId || currentRoom}`;
  }

  function connect(roomId) {
    if (!roomId) {
      roomId = parseRoomFromUrl() || getStoredRoom() || generateRoomCode();
    }
    roomId = roomId.trim().toUpperCase();
    currentRoom = roomId;
    saveStoredRoom(roomId);

    try {
      if (typeof window !== 'undefined' && window.location && window.history) {
        const expectedHash = `#sync=${encodeURIComponent(roomId)}`;
        if (window.location.hash !== expectedHash) {
          window.history.replaceState(null, '', expectedHash);
        }
      }
    } catch (e) {}

    // 1. Инициализация локального кросс-вкладочного канала (BroadcastChannel)
    setupBroadcastChannel(roomId);

    // 2. Инициализация WebSocket реле
    connectWebSocket();

    // 3. Инициализация опционального Firebase Realtime DB
    setupFirebaseSubscription(roomId);

    // 4. Запуск фоновых таймеров пульса
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(sendHeartbeat, 15000);

    if (pruneInterval) clearInterval(pruneInterval);
    pruneInterval = setInterval(prunePeers, 5000);

    updateStatus('connecting');
    return roomId;
  }

  function setupBroadcastChannel(roomId) {
    if (broadcastChannel) {
      try { broadcastChannel.close(); } catch (e) {}
      broadcastChannel = null;
    }

    const BC = (typeof BroadcastChannel !== 'undefined') ? BroadcastChannel : ((typeof global !== 'undefined' && global.BroadcastChannel) || (typeof globalThis !== 'undefined' && globalThis.BroadcastChannel));
    if (BC) {
      try {
        broadcastChannel = new BC('himbiorus_sync_' + roomId);
        broadcastChannel.onmessage = (event) => {
          handleIncomingPayload(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel недоступен:', e);
      }
    }
  }

  function connectWebSocket() {
    if (connectTimeout) {
      clearTimeout(connectTimeout);
      connectTimeout = null;
    }

    if (ws) {
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      } catch (e) {}
      ws = null;
    }

    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    const WS = (typeof WebSocket !== 'undefined') ? WebSocket : (typeof globalThis !== 'undefined' ? globalThis.WebSocket : null);
    if (!WS) {
      return;
    }

    const brokerUrl = activeBrokers[currentBrokerIdx];
    try {
      ws = new WS(brokerUrl, 'mqtt');
      ws.binaryType = 'arraybuffer';
    } catch (e) {
      console.warn('Ошибка создания WebSocket для брокера:', brokerUrl, e);
      scheduleReconnect();
      return;
    }

    // Быстрый таймаут рукопожатия (3.5 сек) для мгновенного обхода мобильных сетевых блокировок
    connectTimeout = setTimeout(() => {
      if (status !== 'connected') {
        console.warn('Таймаут WSS брокера (3.5с), переключение на резервный:', brokerUrl);
        currentBrokerIdx = (currentBrokerIdx + 1) % activeBrokers.length;
        if (ws) {
          try { ws.close(); } catch (e) {}
          ws = null;
        }
        connectWebSocket();
      }
    }, 3500);

    ws.onopen = () => {
      // Отправляем пакет MQTT CONNECT
      try {
        ws.send(createConnectPacket(CLIENT_ID));
      } catch (err) {
        console.warn('Ошибка отправки CONNECT:', err);
      }
    };

    ws.onmessage = (event) => {
      try {
        const raw = new Uint8Array(event.data);
        const packets = parseMqttPackets(raw);
        for (const pkt of packets) {
          handleMqttPacket(pkt);
        }
      } catch (err) {
        console.warn('Ошибка парсинга входящего пакета:', err);
      }
    };

    ws.onerror = (err) => {
      console.warn('Сетевая ошибка WSS:', err);
    };

    ws.onclose = () => {
      if (connectTimeout) {
        clearTimeout(connectTimeout);
        connectTimeout = null;
      }
      if (status === 'connected') {
        updateStatus('connecting');
      }
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      scheduleReconnect();
    };
  }

  function handleMqttPacket(pkt) {
    if (pkt.type === 2) {
      // CONNACK: Подключение подтверждено брокером!
      if (connectTimeout) {
        clearTimeout(connectTimeout);
        connectTimeout = null;
      }
      reconnectAttempts = 0;

      const topic = getTopic(currentRoom);
      ws.send(createSubscribePacket(topic));
      updateStatus('connected');

      // Начинаем пинговать брокер каждые 25 секунд
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try { ws.send(PINGREQ_PACKET); } catch (e) {}
        }
      }, 25000);

      // Сбрасываем накопленные в офлайне сообщения
      flushOutgoingQueue();

      // Оповещаем о своем присутствии и запрашиваем актуальное состояние
      sendHeartbeat();
      broadcastMessage('REQUEST_STATE', { clientTime: Date.now() });
    } else if (pkt.type === 3) {
      // PUBLISH: Входящее сообщение из комнаты
      try {
        const payload = pkt.payload;
        let pIdx = 0;
        const topicLen = (payload[pIdx] << 8) | payload[pIdx + 1];
        pIdx += 2;
        pIdx += topicLen; // пропускаем топик
        if ((pkt.flags & 0x06) > 0) {
          pIdx += 2; // пропускаем Packet Identifier для QoS 1/2
        }
        const msgStr = new TextDecoder().decode(payload.subarray(pIdx));
        handleIncomingPayload(JSON.parse(msgStr));
      } catch (e) {
        console.warn('Не удалось распарсить PUBLISH:', e);
      }
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectAttempts++;
    // Мгновенное переключение на следующий резервный брокер
    currentBrokerIdx = (currentBrokerIdx + 1) % activeBrokers.length;
    const delay = reconnectAttempts <= activeBrokers.length ? 400 : Math.min(1000 * Math.pow(1.5, Math.min(reconnectAttempts, 5)), 8000);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (currentRoom) {
        connectWebSocket();
      }
    }, delay);
  }

  function disconnect() {
    if (connectTimeout) {
      clearTimeout(connectTimeout);
      connectTimeout = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (pruneInterval) {
      clearInterval(pruneInterval);
      pruneInterval = null;
    }
    if (ws) {
      try { ws.close(); } catch (e) {}
      ws = null;
    }
    if (broadcastChannel) {
      try { broadcastChannel.close(); } catch (e) {}
      broadcastChannel = null;
    }
    teardownFirebase();
    activePeers.clear();
    currentRoom = null;
    saveStoredRoom(null);
    updateStatus('disconnected');
  }

  // ==========================================================================
  // ОТПРАВКА И ПРИЕМ СОБЫТИЙ (BROADCASTING & DISPATCH)
  // ==========================================================================

  function broadcastMessage(type, data) {
    if (!currentRoom) return;

    const envelope = {
      id: 'msg_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36),
      senderId: CLIENT_ID,
      roomId: currentRoom,
      type: type,
      data: data,
      timestamp: Date.now()
    };

    // Запоминаем свой собственный ID, чтобы не обрабатывать эхо
    seenMessageIds.add(envelope.id);

    // 1. Отправляем в локальный BroadcastChannel
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(envelope);
      } catch (e) {}
    }

    // 2. Отправляем через WebSocket / MQTT
    const msgStr = JSON.stringify(envelope);
    if (ws && ws.readyState === WebSocket.OPEN && status === 'connected') {
      try {
        ws.send(createPublishPacket(getTopic(currentRoom), msgStr));
      } catch (e) {
        outgoingQueue.push(msgStr);
      }
    } else {
      if (type !== 'PRESENCE') {
        outgoingQueue.push(msgStr);
        if (outgoingQueue.length > 80) outgoingQueue.shift();
      }
    }

    // 3. Отправляем в опциональный Google Firebase RTDB
    sendToFirebase(envelope);
  }

  function flushOutgoingQueue() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const topic = getTopic(currentRoom);
    while (outgoingQueue.length > 0) {
      const msgStr = outgoingQueue.shift();
      try {
        ws.send(createPublishPacket(topic, msgStr));
      } catch (e) {
        outgoingQueue.unshift(msgStr);
        break;
      }
    }
  }

  function sendHeartbeat() {
    broadcastMessage('PRESENCE', {
      clientId: CLIENT_ID,
      time: Date.now()
    });
  }

  function handleIncomingPayload(envelope) {
    if (!envelope || !envelope.id || !envelope.type) return;
    if (envelope.senderId === CLIENT_ID) return; // Игнорируем свои же пакеты
    if (envelope.roomId !== currentRoom) return; // Игнорируем чужие комнаты

    if (seenMessageIds.has(envelope.id)) return;
    seenMessageIds.add(envelope.id);
    if (seenMessageIds.size > 300) {
      const first = seenMessageIds.values().next().value;
      seenMessageIds.delete(first);
    }

    recordPeerActivity(envelope.senderId);

    const type = envelope.type;
    const data = envelope.data;

    switch (type) {
      case 'PRESENCE':
        // Пир просто сообщил, что он в сети
        break;

      case 'MOVE_ITEM':
        if (typeof callbacks.onMoveItem === 'function') {
          callbacks.onMoveItem(data);
        }
        break;

      case 'TOGGLE_COMPLETED':
        if (typeof callbacks.onToggleCompleted === 'function') {
          callbacks.onToggleCompleted(data);
        }
        break;

      case 'ADD_ITEM':
        if (typeof callbacks.onAddItem === 'function') {
          callbacks.onAddItem(data);
        }
        break;

      case 'UPDATE_ITEM':
        if (typeof callbacks.onUpdateItem === 'function') {
          callbacks.onUpdateItem(data);
        }
        break;

      case 'DELETE_ITEM':
        if (typeof callbacks.onDeleteItem === 'function') {
          callbacks.onDeleteItem(data);
        }
        break;

      case 'STROKE_ADD':
        if (typeof callbacks.onStrokeAdd === 'function') {
          callbacks.onStrokeAdd(data);
        }
        break;

      case 'STROKE_UNDO':
        if (typeof callbacks.onStrokeUndo === 'function') {
          callbacks.onStrokeUndo(data);
        }
        break;

      case 'STROKE_CLEAR':
        if (typeof callbacks.onStrokeClear === 'function') {
          callbacks.onStrokeClear(data);
        }
        break;

      case 'REQUEST_STATE':
        // Другое устройство только что подключилось и запросило слепок данных
        if (typeof callbacks.onRequestState === 'function') {
          const fullState = callbacks.onRequestState();
          if (fullState) {
            broadcastMessage('FULL_STATE_SYNC', fullState);
          }
        }
        break;

      case 'FULL_STATE_SYNC':
        if (typeof callbacks.onFullStateSync === 'function') {
          callbacks.onFullStateSync(data);
        }
        break;

      default:
        break;
    }
  }

  // ==========================================================================
  // ОПЦИОНАЛЬНЫЙ GOOGLE FIREBASE REALTIME DB (ДВУХСТОРОННИЙ ОБМЕН ЧЕРЕЗ SSE/REST)
  // ==========================================================================

  let firebaseEventSource = null;

  function getFirebaseUrl() {
    try {
      return localStorage.getItem(FIREBASE_STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setFirebaseUrl(url) {
    try {
      if (url) {
        localStorage.setItem(FIREBASE_STORAGE_KEY, url.trim().replace(/\/$/, ''));
      } else {
        localStorage.removeItem(FIREBASE_STORAGE_KEY);
      }
    } catch (e) {}

    if (currentRoom) {
      setupFirebaseSubscription(currentRoom);
    }
  }

  function setupFirebaseSubscription(roomId) {
    teardownFirebase();
    const fbUrl = getFirebaseUrl();
    if (!fbUrl || !roomId) return;

    const ES = (typeof EventSource !== 'undefined') ? EventSource : ((typeof global !== 'undefined' && global.EventSource) || (typeof globalThis !== 'undefined' && globalThis.EventSource));
    if (!ES) return;

    try {
      const streamUrl = `${fbUrl}/rooms/${encodeURIComponent(roomId)}/latest.json`;
      firebaseEventSource = new ES(streamUrl);

      const handleEventData = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const payload = parsed && parsed.data ? parsed.data : parsed;
          if (payload && typeof payload === 'object' && payload.id && payload.type) {
            handleIncomingPayload(payload);
          }
        } catch (err) {}
      };

      firebaseEventSource.addEventListener('put', handleEventData);
      firebaseEventSource.onmessage = handleEventData;
      firebaseEventSource.onerror = () => {
        // Firebase SSE auto-reconnects under the hood
      };
    } catch (err) {
      console.warn('Не удалось подключить Firebase EventSource:', err);
    }
  }

  function teardownFirebase() {
    if (firebaseEventSource) {
      try {
        firebaseEventSource.close();
      } catch (e) {}
      firebaseEventSource = null;
    }
  }

  function sendToFirebase(envelope) {
    const fbUrl = getFirebaseUrl();
    if (!fbUrl || !currentRoom) return;

    try {
      const endpoint = `${fbUrl}/rooms/${encodeURIComponent(currentRoom)}/latest.json`;
      fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope)
      }).catch(() => {});
    } catch (e) {}
  }

  // ==========================================================================
  // РЕНДЕРИНГ QR-КОДА ДЛЯ UI
  // ==========================================================================

  function renderQRCode(containerEl, url) {
    if (!containerEl) return;
    const targetUrl = url || getRoomUrl();
    containerEl.innerHTML = '';

    try {
      const svgMarkup = MiniQR.toSVG(targetUrl, 220);
      containerEl.innerHTML = svgMarkup;
    } catch (err) {
      console.warn('Ошибка генерации векторного QR, переключение на резервное изображение:', err);
      const img = document.createElement('img');
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(targetUrl)}`;
      img.alt = 'QR-код комнаты';
      img.className = 'sync-qr-image';
      containerEl.appendChild(img);
    }
  }

  // ==========================================================================
  // ОБРАБОТЧИКИ ОФЛАЙНА И ВОССТАНОВЛЕНИЯ СВЯЗИ В БРАУЗЕРЕ
  // ==========================================================================

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (currentRoom && status !== 'connected') {
        connectWebSocket();
      }
    });

    window.addEventListener('offline', () => {
      updateStatus('disconnected');
    });

    window.addEventListener('hashchange', () => {
      const hashRoom = parseRoomFromUrl();
      if (hashRoom && hashRoom.toUpperCase() !== currentRoom) {
        connect(hashRoom);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && currentRoom && (status === 'disconnected' || !ws || ws.readyState !== WebSocket.OPEN)) {
        connectWebSocket();
      }
    });
  }

  // ==========================================================================
  // ПУБЛИЧНЫЙ API
  // ==========================================================================

  const SyncEngine = {
    init: function (opts = {}) {
      callbacks = Object.assign(callbacks, opts);
      const autoRoom = parseRoomFromUrl() || getStoredRoom() || generateRoomCode();
      connect(autoRoom);
      return this;
    },

    connect: connect,
    disconnect: disconnect,

    getRoomId: () => currentRoom,
    getRoomUrl: getRoomUrl,
    getStatus: () => status,
    getPeerCount: getPeerCount,
    getClientId: () => CLIENT_ID,

    generateRoomCode: generateRoomCode,
    renderQRCode: renderQRCode,

    setFirebaseUrl: setFirebaseUrl,
    getFirebaseUrl: getFirebaseUrl,

    // Методы вещания
    broadcastMove: function (source, target) {
      broadcastMessage('MOVE_ITEM', { source, target });
    },

    broadcastToggle: function (details) {
      broadcastMessage('TOGGLE_COMPLETED', details);
    },

    broadcastAdd: function (details) {
      broadcastMessage('ADD_ITEM', details);
    },

    broadcastUpdate: function (details) {
      broadcastMessage('UPDATE_ITEM', details);
    },

    broadcastDelete: function (details) {
      broadcastMessage('DELETE_ITEM', details);
    },

    broadcastStroke: function (details) {
      broadcastMessage('STROKE_ADD', details);
    },

    broadcastUndo: function (details) {
      broadcastMessage('STROKE_UNDO', details);
    },

    broadcastClear: function (details) {
      broadcastMessage('STROKE_CLEAR', details);
    },

    broadcastFullState: function (stateData) {
      broadcastMessage('FULL_STATE_SYNC', stateData);
    },

    requestState: function () {
      broadcastMessage('REQUEST_STATE', { clientTime: Date.now() });
    }
  };

  global.SyncEngine = SyncEngine;
  if (typeof globalThis !== 'undefined') {
    globalThis.SyncEngine = SyncEngine;
  }

})(typeof window !== 'undefined' ? window : globalThis);
