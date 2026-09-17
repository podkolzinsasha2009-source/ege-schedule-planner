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
    payment: 'Оплата',
    event: 'Событие'
  };

  const ICONS = {
    plus: { sign: '+', label: 'Дополнительный вебинар' },
    check: { sign: '✓', label: 'Зачёт' },
    alert: { sign: '!', label: 'Рубежная аттестация' }
  };

  // Ориентировочное время на выполнение — своя оценка (не найдено готового значения
  // в проекте), можно менять. Используется только для «средней нагрузки в день».
  const DURATION_MIN = {
    theory: 60,
    practice: 90,
    test: 60,
    homework: 90,
    webinar: 90,
    mock: 180,
    review: 45,
    attestation: 120,
    credit: 45,
    event: 60,
    payment: 0
  };

  function itemDuration(it) {
    const v = DURATION_MIN[it.category];
    return typeof v === 'number' ? v : 60;
  }

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

  // В исходных данных четверг 10 сентября был записан как 2026-10-10 и попадал в октябрь.
  // Возвращаем такие плашки на место один раз для каждой комнаты.
  function migrateSeptember10() {
    const items = Store.get('items');
    if (!items || Store.get('meta/fixSep10')) return;
    const day = COURSE[dayIndex['2026-09-10']] && COURSE[dayIndex['2026-09-10']].days['2026-09-10'];
    const updates = { 'meta/fixSep10': true };
    toArray(day && day.items).forEach(it => {
      if (items[it.id] && items[it.id].date === '2026-10-10') updates[`items/${it.id}/date`] = '2026-09-10';
    });
    Store.update(updates);
  }

  // Исправления после сверки с PDF: неверные предметы у пробников и зачётов, лишние «+»,
  // выдуманные тесты к «Интенсиву по ИС». Меняем поле, только если в комнате
  // всё ещё старое значение, — ручные правки пользователя не трогаем.
  const PDF_FIXES = {"changes":{"comp-hw-p9_01_r1":{"subtitle":["9 задание + 10 задание + сочинение ЕГЭ. Нетиповый вебчик","9 задание + 10 задание + сочинение ЕГЭ. Base"]},"comp-test-p2_05_c1":{"subtitle":["Чистые вещества и смеси. Растворы. Массовая доля. Задача 26.","Чистые вещества и смеси. Растворы. Виды растворов. Массовая доля. Задача 26."]},"p10_07_c1":{"icon":["plus",null]},"p11_04_c1":{"icon":["plus",null]},"p11_21_c1":{"icon":["plus",null]},"p1_15_b1":{"icon":["plus",null]},"p1_16_c1":{"icon":["plus",null]},"p1_17_r1":{"icon":["plus",null]},"p1_23_c1":{"icon":["plus",null]},"p1_30_c1":{"icon":["plus",null]},"p2_05_c1":{"subtitle":["Чистые вещества и смеси. Растворы. Массовая доля. Задача 26.","Чистые вещества и смеси. Растворы. Виды растворов. Массовая доля. Задача 26."]},"p3_02_b1":{"subject":["bio","chem"],"subtitle":["Биология","Химия"]},"p3_04_c1":{"icon":["plus",null]},"p3_27_c1":{"icon":["plus",null]},"p4_01_c1":{"icon":["plus",null]},"p4_15_b2":{"subject":["bio","rus"],"subtitle":["Биология","Русский язык"]},"p4_17_c1":{"subject":["chem","bio"],"subtitle":["Химия","Биология"]},"p4_18_c1":{"icon":["plus",null]},"p5_08_b1":{"subject":["bio","chem"],"subtitle":["Биология","Химия"]},"p5_15_b1":{"subject":["bio","rus"],"subtitle":["Биология","Русский язык"]},"p5_15_c1":{"icon":["plus",null]},"p6_01_r1":{"category":["review","event"]},"p6_02_r1":{"category":["review","event"]},"p6_13_c1":{"icon":["plus",null]},"p6_24_r1":{"category":["review","event"]},"p6_25_r1":{"category":["review","event"]},"p6_26_r1":{"category":["review","event"]},"p6_27_r1":{"category":["review","event"]},"p6_28_r1":{"category":["review","event"]},"p6_29_c1":{"icon":["plus",null]},"p6_29_r1":{"category":["review","event"]},"p6_30_r1":{"category":["review","event"]},"p7_06_b1":{"subject":["bio","chem"],"subtitle":["Биология","Химия"]},"p7_10_c1":{"icon":["plus",null]},"p7_15_c1":{"subject":["chem","rus"],"subtitle":["Химия","Русский язык"]},"p7_27_c1":{"icon":["plus",null]},"p8_15_b1":{"subject":["bio","rus"],"subtitle":["Биология","Русский язык"]},"p8_24_c1":{"icon":["plus",null]},"p9_01_r1":{"subtitle":["9 задание + 10 задание + сочинение ЕГЭ. Нетиповый вебчик","9 задание + 10 задание + сочинение ЕГЭ. Base"]},"p9_06_c1":{"subject":["chem","bio"],"subtitle":["Химия","Биология"]},"p9_07_c1":{"icon":["plus",null]},"p9_15_b2":{"subject":["bio","rus"],"subtitle":["Биология","Русский язык"]},"p9_21_c1":{"icon":["plus",null]}},"removed":["comp-test-p6_01_r1","comp-test-p6_02_r1","comp-test-p6_24_r1","comp-test-p6_25_r1","comp-test-p6_26_r1","comp-test-p6_27_r1","comp-test-p6_28_r1","comp-test-p6_29_r1","comp-test-p6_30_r1"]};

  function migratePdfCheck() {
    const items = Store.get('items');
    if (!items || Store.get('meta/fixPdf2026')) return;
    const updates = { 'meta/fixPdf2026': true };
    Object.keys(PDF_FIXES.changes).forEach(id => {
      const item = items[id];
      if (!item) return;
      Object.keys(PDF_FIXES.changes[id]).forEach(field => {
        const [from, to] = PDF_FIXES.changes[id][field];
        if ((item[field] == null ? null : item[field]) === from) updates[`items/${id}/${field}`] = to;
      });
    });
    PDF_FIXES.removed.forEach(id => {
      if (items[id] && !items[id].completed) updates[`items/${id}`] = null;
    });
    Store.update(updates);
  }

  // По химии тест и письменное ДЗ раньше цеплялись не к тем занятиям (тест — к теории,
  // ДЗ — к практике). Пользователь объяснил, что по химии наоборот: ДЗ — к теории,
  // тест — к практике. Ниже — таблица «какой companion какой категорией/названием
  // должен стать», построенная сравнением старого и нового build_dataset.py. Меняем
  // те же самые id (без переименования) — категория и название чисто косметические
  // для кода, а id как ключ БД трогать незачем.
  const CHEM_COMPANION_FIX_2026 = {"comp-test-p1_15_c1":{"category":["test","homework"],"title":["Тест: Теория №1","Письменное ДЗ: Теория №1"]},"comp-test-p1_15_c2":{"category":["test","homework"],"title":["Тест: Теория №2","Письменное ДЗ: Теория №2"]},"comp-hw-p1_19_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №1","Тест: Практика №1"]},"comp-hw-p1_21_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №2","Тест: Практика №2"]},"comp-test-p1_22_c1":{"category":["test","homework"],"title":["Тест: Теория №3","Письменное ДЗ: Теория №3"]},"comp-test-p1_22_c2":{"category":["test","homework"],"title":["Тест: Теория №4","Письменное ДЗ: Теория №4"]},"comp-hw-p1_26_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №3","Тест: Практика №3"]},"comp-hw-p1_28_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №4","Тест: Практика №4"]},"comp-test-p1_29_c1":{"category":["test","homework"],"title":["Тест: Теория №5","Письменное ДЗ: Теория №5"]},"comp-test-p1_29_c2":{"category":["test","homework"],"title":["Тест: Теория №6","Письменное ДЗ: Теория №6"]},"comp-hw-p2_02_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №5","Тест: Практика №5"]},"comp-hw-p2_04_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №6","Тест: Практика №6"]},"comp-test-p2_05_c1":{"category":["test","homework"],"title":["Тест: Теория №7","Письменное ДЗ: Теория №7"]},"comp-test-p2_05_c2":{"category":["test","homework"],"title":["Тест: Теория №8","Письменное ДЗ: Теория №8"]},"comp-hw-p2_09_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №7","Тест: Практика №7"]},"comp-hw-p2_11_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №8","Тест: Практика №8"]},"comp-test-p2_12_c1":{"category":["test","homework"],"title":["Тест: Теория №9","Письменное ДЗ: Теория №9"]},"comp-test-p2_12_c2":{"category":["test","homework"],"title":["Тест: Теория №10","Письменное ДЗ: Теория №10"]},"comp-hw-p2_16_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №9","Тест: Практика №9"]},"comp-hw-p2_18_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №10","Тест: Практика №10"]},"comp-test-p2_19_c1":{"category":["test","homework"],"title":["Тест: Теория №11","Письменное ДЗ: Теория №11"]},"comp-test-p2_19_c2":{"category":["test","homework"],"title":["Тест: Теория №12","Письменное ДЗ: Теория №12"]},"comp-hw-p3_23_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №11","Тест: Практика №11"]},"comp-hw-p3_25_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №12","Тест: Практика №12"]},"comp-test-p3_26_c1":{"category":["test","homework"],"title":["Тест: Теория №13","Письменное ДЗ: Теория №13"]},"comp-test-p3_26_c2":{"category":["test","homework"],"title":["Тест: Теория №14","Письменное ДЗ: Теория №14"]},"comp-hw-p3_30_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №13","Тест: Практика №13"]},"comp-hw-p3_02_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №14","Тест: Практика №14"]},"comp-test-p3_03_c1":{"category":["test","homework"],"title":["Тест: Теория №15","Письменное ДЗ: Теория №15"]},"comp-test-p3_03_c2":{"category":["test","homework"],"title":["Тест: Теория №16","Письменное ДЗ: Теория №16"]},"comp-hw-p3_07_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №15","Тест: Практика №15"]},"comp-hw-p3_09_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №16","Тест: Практика №16"]},"comp-test-p3_10_c1":{"category":["test","homework"],"title":["Тест: Теория №17","Письменное ДЗ: Теория №17"]},"comp-test-p3_10_c2":{"category":["test","homework"],"title":["Тест: Теория №18","Письменное ДЗ: Теория №18"]},"comp-hw-p4_14_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №17","Тест: Практика №17"]},"comp-hw-p4_16_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №18","Тест: Практика №18"]},"comp-test-p4_17_c2":{"category":["test","homework"],"title":["Тест: Теория №19","Письменное ДЗ: Теория №19"]},"comp-test-p4_17_c3":{"category":["test","homework"],"title":["Тест: Теория №20","Письменное ДЗ: Теория №20"]},"comp-hw-p4_21_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №19","Тест: Практика №19"]},"comp-hw-p4_23_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №20","Тест: Практика №20"]},"comp-test-p4_24_c1":{"category":["test","homework"],"title":["Тест: Теория №21","Письменное ДЗ: Теория №21"]},"comp-test-p4_24_c2":{"category":["test","homework"],"title":["Тест: Теория №22","Письменное ДЗ: Теория №22"]},"comp-hw-p4_28_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №21","Тест: Практика №21"]},"comp-hw-p4_30_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №22","Тест: Практика №22"]},"comp-test-p4_31_c1":{"category":["test","homework"],"title":["Тест: Теория №23","Письменное ДЗ: Теория №23"]},"comp-test-p4_31_c2":{"category":["test","homework"],"title":["Тест: Теория №24","Письменное ДЗ: Теория №24"]},"comp-hw-p5_04_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №23","Тест: Практика №23"]},"comp-hw-p5_06_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №24","Тест: Практика №24"]},"comp-test-p5_07_c1":{"category":["test","homework"],"title":["Тест: Теория №25","Письменное ДЗ: Теория №25"]},"comp-test-p5_07_c2":{"category":["test","homework"],"title":["Тест: Теория №26","Письменное ДЗ: Теория №26"]},"comp-hw-p5_11_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №25","Тест: Практика №25"]},"comp-hw-p5_13_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №26","Тест: Практика №26"]},"comp-test-p5_14_c1":{"category":["test","homework"],"title":["Тест: Теория №27","Письменное ДЗ: Теория №27"]},"comp-hw-p5_18_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Обобщающая практика по неорганике","Тест: Обобщающая практика по неорганике"]},"comp-hw-p5_20_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №27","Тест: Практика №27"]},"comp-test-p5_21_c1":{"category":["test","homework"],"title":["Тест: Теория №28","Письменное ДЗ: Теория №28"]},"comp-test-p5_21_c2":{"category":["test","homework"],"title":["Тест: Теория №29","Письменное ДЗ: Теория №29"]},"comp-hw-p6_25_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №28","Тест: Практика №28"]},"comp-hw-p6_27_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №29","Тест: Практика №29"]},"comp-test-p6_28_c1":{"category":["test","homework"],"title":["Тест: Теория №30","Письменное ДЗ: Теория №30"]},"comp-test-p6_28_c2":{"category":["test","homework"],"title":["Тест: Теория №31","Письменное ДЗ: Теория №31"]},"comp-hw-p6_02_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №30","Тест: Практика №30"]},"comp-hw-p6_04_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №31","Тест: Практика №31"]},"comp-test-p6_05_c1":{"category":["test","homework"],"title":["Тест: Теория №32","Письменное ДЗ: Теория №32"]},"comp-test-p6_05_c2":{"category":["test","homework"],"title":["Тест: Теория №33","Письменное ДЗ: Теория №33"]},"comp-hw-p6_09_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №32","Тест: Практика №32"]},"comp-hw-p6_11_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №33","Тест: Практика №33"]},"comp-test-p6_12_c1":{"category":["test","homework"],"title":["Тест: Теория №34","Письменное ДЗ: Теория №34"]},"comp-test-p6_12_c2":{"category":["test","homework"],"title":["Тест: Теория №35","Письменное ДЗ: Теория №35"]},"comp-hw-p7_16_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №34","Тест: Практика №34"]},"comp-hw-p7_18_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №35","Тест: Практика №35"]},"comp-test-p7_19_c1":{"category":["test","homework"],"title":["Тест: Теория №36","Письменное ДЗ: Теория №36"]},"comp-test-p7_19_c2":{"category":["test","homework"],"title":["Тест: Теория №37","Письменное ДЗ: Теория №37"]},"comp-hw-p7_23_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №36","Тест: Практика №36"]},"comp-hw-p7_25_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №37","Тест: Практика №37"]},"comp-test-p7_26_c1":{"category":["test","homework"],"title":["Тест: Теория №38","Письменное ДЗ: Теория №38"]},"comp-test-p7_26_c2":{"category":["test","homework"],"title":["Тест: Теория №39","Письменное ДЗ: Теория №39"]},"comp-hw-p7_06_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №38","Тест: Практика №38"]},"comp-hw-p7_08_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №39","Тест: Практика №39"]},"comp-test-p7_09_c1":{"category":["test","homework"],"title":["Тест: Теория №40","Письменное ДЗ: Теория №40"]},"comp-test-p7_09_c2":{"category":["test","homework"],"title":["Тест: Теория №41","Письменное ДЗ: Теория №41"]},"comp-hw-p8_13_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №40","Тест: Практика №40"]},"comp-hw-p8_15_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №41","Тест: Практика №41"]},"comp-test-p8_16_c1":{"category":["test","homework"],"title":["Тест: Теория №42","Письменное ДЗ: Теория №42"]},"comp-test-p8_16_c2":{"category":["test","homework"],"title":["Тест: Теория №43","Письменное ДЗ: Теория №43"]},"comp-hw-p8_20_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №42","Тест: Практика №42"]},"comp-hw-p8_22_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №43","Тест: Практика №43"]},"comp-test-p8_23_c1":{"category":["test","homework"],"title":["Тест: Теория №44","Письменное ДЗ: Теория №44"]},"comp-test-p8_23_c2":{"category":["test","homework"],"title":["Тест: Теория №45","Письменное ДЗ: Теория №45"]},"comp-hw-p8_27_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №44","Тест: Практика №44"]},"comp-hw-p8_29_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №45","Тест: Практика №45"]},"comp-test-p8_30_c1":{"category":["test","homework"],"title":["Тест: Теория №46","Письменное ДЗ: Теория №46"]},"comp-test-p8_30_c2":{"category":["test","homework"],"title":["Тест: Теория №47","Письменное ДЗ: Теория №47"]},"comp-hw-p9_03_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №46","Тест: Практика №46"]},"comp-hw-p9_05_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №47","Тест: Практика №47"]},"comp-test-p9_06_c2":{"category":["test","homework"],"title":["Тест: Теория №48","Письменное ДЗ: Теория №48"]},"comp-test-p9_06_c3":{"category":["test","homework"],"title":["Тест: Теория №49","Письменное ДЗ: Теория №49"]},"comp-hw-p9_10_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №48","Тест: Практика №48"]},"comp-hw-p9_12_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №49","Тест: Практика №49"]},"comp-test-p9_13_c1":{"category":["test","homework"],"title":["Тест: Теория №50","Письменное ДЗ: Теория №50"]},"comp-test-p9_13_c2":{"category":["test","homework"],"title":["Тест: Теория №51","Письменное ДЗ: Теория №51"]},"comp-hw-p9_17_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №50","Тест: Практика №50"]},"comp-hw-p9_19_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №51","Тест: Практика №51"]},"comp-test-p9_20_c1":{"category":["test","homework"],"title":["Тест: Теория №52","Письменное ДЗ: Теория №52"]},"comp-hw-p10_24_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Обобщающая практика по органике","Тест: Обобщающая практика по органике"]},"comp-hw-p10_26_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №52","Тест: Практика №52"]},"comp-test-p10_27_c1":{"category":["test","homework"],"title":["Тест: Теория №53","Письменное ДЗ: Теория №53"]},"comp-test-p10_27_c2":{"category":["test","homework"],"title":["Тест: Теория №54","Письменное ДЗ: Теория №54"]},"comp-hw-p10_03_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №53","Тест: Практика №53"]},"comp-hw-p10_05_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №54","Тест: Практика №54"]},"comp-test-p10_06_c1":{"category":["test","homework"],"title":["Тест: Теория №55","Письменное ДЗ: Теория №55"]},"comp-test-p10_06_c2":{"category":["test","homework"],"title":["Тест: Теория №56","Письменное ДЗ: Теория №56"]},"comp-hw-p10_10_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №55","Тест: Практика №55"]},"comp-hw-p10_12_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №56","Тест: Практика №56"]},"comp-test-p10_13_c1":{"category":["test","homework"],"title":["Тест: Теория №57","Письменное ДЗ: Теория №57"]},"comp-test-p10_13_c2":{"category":["test","homework"],"title":["Тест: Теория №58","Письменное ДЗ: Теория №58"]},"comp-hw-p11_17_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №57","Тест: Практика №57"]},"comp-hw-p11_19_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №58","Тест: Практика №58"]},"comp-test-p11_20_c1":{"category":["test","homework"],"title":["Тест: Теория №59","Письменное ДЗ: Теория №59"]},"comp-test-p11_20_c2":{"category":["test","homework"],"title":["Тест: Теория №60","Письменное ДЗ: Теория №60"]},"comp-hw-p11_24_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №59","Тест: Практика №59"]},"comp-hw-p11_26_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №60","Тест: Практика №60"]},"comp-test-p11_27_c1":{"category":["test","homework"],"title":["Тест: Теория №61","Письменное ДЗ: Теория №61"]},"comp-test-p11_27_c2":{"category":["test","homework"],"title":["Тест: Теория №62","Письменное ДЗ: Теория №62"]},"comp-hw-p11_31_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №61","Тест: Практика №61"]},"comp-hw-p11_02_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №62","Тест: Практика №62"]},"comp-test-p11_03_c1":{"category":["test","homework"],"title":["Тест: Теория №63","Письменное ДЗ: Теория №63"]},"comp-hw-p12_07_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №63","Тест: Практика №63"]},"comp-hw-p12_09_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Обобщающая практика по химии элементов","Тест: Обобщающая практика по химии элементов"]},"comp-test-p12_10_c1":{"category":["test","homework"],"title":["Тест: Теория №64","Письменное ДЗ: Теория №64"]},"comp-hw-p12_14_c1":{"category":["homework","test"],"title":["Письменное ДЗ: Практика №64","Тест: Практика №64"]}};

  function migrateChemCompanions() {
    const items = Store.get('items');
    if (!items || Store.get('meta/fixChemCompanions2026')) return;
    const updates = { 'meta/fixChemCompanions2026': true };
    Object.keys(CHEM_COMPANION_FIX_2026).forEach(id => {
      const item = items[id];
      if (!item) return;
      const fix = CHEM_COMPANION_FIX_2026[id];
      Object.keys(fix).forEach(field => {
        const [from, to] = fix[field];
        if ((item[field] == null ? null : item[field]) === from) updates[`items/${id}/${field}`] = to;
      });
    });
    Store.update(updates);
  }

  // --------------------------------------------------------------- дедлайны

  // Определено по разбору формул, которые прислал пользователь на конкретных
  // примерах дат. Дни считаются от даты плашки (23:59 того же часового пояса,
  // что и остальное расписание). Там, где пользователь явно не назвал число,
  // взято по аналогии — см. итоговое сообщение, где это оговорено отдельно.
  const DEADLINE_DAYS = {
    mock: 6,          // пробник: выложен «в 00:00 N числа» → дедлайн 23:59 (N+6)
    attestation: 7,   // рубежная аттестация: +неделя
    reviewTest: 4,    // тест к разбору произведения: +4 дня
    theoryTest: { bio: 4, rus: 4 },          // тест к теории (био/рус)
    practiceHw: { bio: 3, rus: 7 },          // ДЗ/сочинение к практике (био: 3 дня, рус: неделя — не названо явно)
    chem: 7           // химия: и ДЗ к теории, и тест к практике — от даты теории того же номера, +7 дней
  };

  function itemNumber(title) {
    const m = /№\s*(\d+(?:\.\d+)?)/.exec(title || '');
    return m ? m[1].split('.')[0] : null;
  }

  function parseDateKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  const DEADLINE_MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  function formatDeadline(date) {
    return `до ${date.getDate()} ${DEADLINE_MONTHS[date.getMonth()]}, 23:59`;
  }

  // Строим один раз за отрисовку: карту id→плашка и «дату теории по химии для номера N»
  // (тест к практике №N по химии считается от даты ТЕОРИИ №N, а не от своей собственной).
  function buildDeadlineContext(itemsList) {
    const byId = {};
    const chemTheoryDate = {};
    itemsList.forEach(it => {
      byId[it.id] = it;
      if (it.subject === 'chem' && it.category === 'theory' && it.date && it.date !== 'backlog') {
        const n = itemNumber(it.title);
        if (n && !chemTheoryDate[n]) chemTheoryDate[n] = it.date;
      }
    });
    return { byId, chemTheoryDate };
  }

  function deadlineFor(it, ctx) {
    if (!it.date || it.date === 'backlog') return null;
    if (it.category === 'mock') return formatDeadline(addDays(parseDateKey(it.date), DEADLINE_DAYS.mock));
    if (it.category === 'attestation') return formatDeadline(addDays(parseDateKey(it.date), DEADLINE_DAYS.attestation));
    if (!it.isCompanion) return null;

    if (it.subject === 'chem') {
      const num = itemNumber(it.title);
      const theoryDateKey = (num && ctx.chemTheoryDate[num]) || it.date;
      return formatDeadline(addDays(parseDateKey(theoryDateKey), DEADLINE_DAYS.chem));
    }

    const parent = it.parentId ? ctx.byId[it.parentId] : null;
    const parentCategory = parent ? parent.category : null;
    if (parentCategory === 'review') {
      return formatDeadline(addDays(parseDateKey(it.date), DEADLINE_DAYS.reviewTest));
    }
    if (parentCategory === 'theory') {
      const days = DEADLINE_DAYS.theoryTest[it.subject];
      return days ? formatDeadline(addDays(parseDateKey(it.date), days)) : null;
    }
    if (parentCategory === 'practice') {
      const days = DEADLINE_DAYS.practiceHw[it.subject];
      return days ? formatDeadline(addDays(parseDateKey(it.date), days)) : null;
    }
    return null;
  }

  let deadlineCtx = null;

  // ------------------------------------------------------------------ отрисовка

  // Помечаем пары «занятие → его тест/ДЗ», стоящие подряд, чтобы соединить их полоской
  function linkedCardsHtml(list) {
    return list.map((it, i) => {
      const next = list[i + 1];
      const prev = list[i - 1];
      const links = [];
      if (next && next.isCompanion && next.parentId === it.id) links.push('link-below');
      if (prev && it.isCompanion && it.parentId === prev.id) links.push('link-above');
      return cardHtml(it, links.join(' '));
    }).join('');
  }

  function cardHtml(it, extraClass) {
    const subject = SUBJECTS[it.subject] || SUBJECTS.general;
    const category = CATEGORIES[it.category] || '';
    const icon = ICONS[it.icon];
    const typeLabel = it.isCompanion ? (it.category === 'homework' ? 'ДЗ' : 'Тест') : category;
    const deadline = deadlineCtx ? deadlineFor(it, deadlineCtx) : null;
    return `
      <div class="card ${it.subject || 'general'} cat-${it.category || 'theory'}${it.isCompanion ? ' is-companion' : ''}${it.completed ? ' is-done' : ''}${extraClass ? ' ' + extraClass : ''}" data-id="${escapeHtml(it.id)}">
        <div class="card-top">
          <span class="pill subject" title="${subject.label}">${subject.short}</span>
          <span class="pill type">${escapeHtml(typeLabel)}</span>
          ${icon ? `<span class="pill icon" title="${icon.label}">${icon.sign}</span>` : ''}
          ${it.time ? `<span class="card-time">${escapeHtml(it.time)}</span>` : ''}
          <button class="card-check" type="button" role="checkbox" aria-checked="${it.completed ? 'true' : 'false'}" aria-label="Выполнено"></button>
        </div>
        <div class="card-title">${escapeHtml(it.title)}</div>
        ${it.subtitle ? `<div class="card-sub">${escapeHtml(it.subtitle)}</div>` : ''}
        ${deadline ? `<div class="card-deadline">${escapeHtml(deadline)}</div>` : ''}
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
      renderLoad();
    };
    requestAnimationFrame(run);
    // Кадры анимации не приходят в фоновой вкладке — дорисуем по таймеру
    fallback = setTimeout(run, 120);
  }

  const isPayment = (it) => it.category === 'payment';

  function dateKeyOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Окна оплаты: плашки «Оплата следующего месяца» с одинаковым сроком «С 10.10 ДО 14.10»
  // превращаются в одну полосу через все дни этого срока.
  function paymentWindows(items) {
    const groups = {};
    items.filter(it => isPayment(it) && it.date && it.date !== 'backlog').forEach(it => {
      const key = `${it.title}|${it.subtitle || ''}`;
      (groups[key] = groups[key] || { title: it.title, subtitle: it.subtitle || '', dates: new Set() }).dates.add(it.date);
    });
    return Object.values(groups).map(g => {
      const known = Array.from(g.dates).sort();
      const m = g.subtitle.match(/(\d{1,2})\.(\d{1,2})\D+(\d{1,2})\.(\d{1,2})/);
      if (m) {
        const year = parseInt(known[0].slice(0, 4), 10);
        const start = new Date(year, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
        const end = new Date(year, parseInt(m[4], 10) - 1, parseInt(m[3], 10));
        if (end < start) end.setFullYear(year + 1);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) g.dates.add(dateKeyOf(d));
      }
      return g;
    });
  }

  function paymentLabel(text) {
    const t = String(text || '').trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function weekBannersHtml(week, windows) {
    if (ui.query || (ui.category !== 'all' && ui.category !== 'payment')) return '';
    const bars = [];
    windows.forEach(w => {
      let start = -1;
      for (let i = 0; i <= week.length; i++) {
        const inside = i < week.length && w.dates.has(week[i]);
        if (inside && start < 0) start = i;
        if (!inside && start >= 0) {
          bars.push(`
            <div class="pay-banner" style="grid-column: ${start + 1} / ${i + 1}" title="${escapeHtml(paymentLabel(w.title))} ${escapeHtml(w.subtitle.toLowerCase())}">
              <span class="pay-icon" aria-hidden="true">₽</span>
              <span class="pay-title">${escapeHtml(paymentLabel(w.title))}</span>
              <span class="pay-range">${escapeHtml(w.subtitle.toLowerCase())}</span>
            </div>`);
          start = -1;
        }
      }
    });
    return bars.length ? `<div class="week-banners">${bars.join('')}</div>` : '';
  }

  // Все 12 периодов рендерятся один под другим в общую ленту — плашку можно
  // перетащить прямо из одного периода в другой, без переключения вкладок.
  function renderBoard() {
    const weeksEl = $('#weeks');
    if (!weeksEl) return;
    if (drag.active) return; // не перерисовываем под пальцем — дорисуем после броска

    const byDate = itemsByDate();
    const allItemsList = allItems();
    const windows = paymentWindows(allItemsList);
    deadlineCtx = buildDeadlineContext(allItemsList);

    weeksEl.innerHTML = COURSE.map((period, periodIdx) => {
      const dates = Object.keys(period.days);
      const weeks = [];
      for (let i = 0; i < dates.length; i += 7) weeks.push(dates.slice(i, i + 7));

      const weeksHtml = weeks.map(week => `
        ${weekBannersHtml(week, windows)}
        <div class="week">
          ${week.map(dateKey => {
            const day = period.days[dateKey];
            const list = (byDate[dateKey] || []).filter(it => !isPayment(it) && isVisible(it));
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
                  ${linkedCardsHtml(list)}
                </div>
              </section>`;
          }).join('')}
        </div>`).join('');

      return `
        <section class="period-block" id="period-${period.id}" data-period-index="${periodIdx}">
          <header class="period-divider">
            <span class="period-divider-num">${String(periodIdx + 1).padStart(2, '0')}</span>
            <span class="period-divider-name">${escapeHtml(period.name)}</span>
          </header>
          ${weeksHtml}
        </section>`;
    }).join('');

    $('#board').classList.toggle('layers-hidden', filtersActive());
    $('#filter-note').hidden = !filtersActive();
    computePeriodLayout();
    updateBoardSize();
  }

  // -------------------------------------------------------- раскладка периодов в общей ленте

  let periodLayoutCache = [];

  function computePeriodLayout() {
    periodLayoutCache = COURSE.map((p, i) => {
      const el = document.getElementById('period-' + p.id);
      return { id: p.id, index: i, top: el ? el.offsetTop : 0, height: el ? el.offsetHeight : 0 };
    });
  }

  function periodTop(id) {
    const p = periodLayoutCache.find(x => x.id === id);
    return p ? p.top : 0;
  }

  // Какой период занимает данную координату Y на общей доске (в логических пикселях,
  // без масштаба) — используется стилусом и фото, чтобы понять, в какой период
  // складывать штрих или картинку.
  function periodAt(y) {
    if (!periodLayoutCache.length) return { id: COURSE[0] ? COURSE[0].id : 'default', index: 0, top: 0, height: 0 };
    for (const p of periodLayoutCache) {
      if (y >= p.top && y < p.top + p.height) return p;
    }
    return y < periodLayoutCache[0].top ? periodLayoutCache[0] : periodLayoutCache[periodLayoutCache.length - 1];
  }

  // Какой период сейчас читает пользователь — примерно на трети экрана сверху
  function periodIndexInView() {
    const sizer = $('#board-sizer');
    if (!sizer) return ui.periodIndex;
    const sr = sizer.getBoundingClientRect();
    const localY = (window.innerHeight * 0.35 - sr.top) / (ui.zoom || 1);
    return periodAt(localY).index;
  }

  function renderBacklog() {
    const listEl = $('#backlog-list');
    if (!listEl) return;
    const list = (itemsByDate().backlog || []);
    listEl.innerHTML = list.length
      ? linkedCardsHtml(list)
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

  // Вкладки периодов строятся один раз — это быстрый переход к нужному месяцу
  // на общей ленте, а не переключение того, что показано (как было раньше).
  function renderPeriods() {
    const tabs = $('#period-tabs');
    tabs.innerHTML = COURSE.map((p, i) => `
      <button class="period-tab${i === ui.periodIndex ? ' is-active' : ''}" type="button" data-period="${i}">
        <span class="period-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="period-name">${escapeHtml(p.name)}</span>
      </button>`).join('');
    updatePeriodChrome();
  }

  // Обновляет всё, что зависит от «текущего» (видимого на экране) периода:
  // заголовок, счётчик, активную вкладку и среднюю нагрузку в день.
  function updatePeriodChrome() {
    const p = currentPeriod();
    $('#period-title').textContent = p ? p.name : '';
    $('#period-counter').textContent = `Период ${ui.periodIndex + 1} из ${COURSE.length}`;
    $$('#period-tabs .period-tab').forEach((el, i) => el.classList.toggle('is-active', i === ui.periodIndex));
    const active = $('#period-tabs .is-active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    renderLoad();
  }

  // Прокручивает страницу к периоду (клик по вкладке, стрелки ‹ ›, стрелки клавиатуры)
  function selectPeriod(index) {
    if (index < 0 || index >= COURSE.length) return;
    const el = document.getElementById('period-' + COURSE[index].id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 84, behavior: 'smooth' });
    ui.periodIndex = index;
    lsSet('hb_period', String(index));
    updatePeriodChrome();
  }

  // Мгновенный прыжок к периоду без анимации — только при первой загрузке страницы
  function jumpToPeriod(index) {
    const p = COURSE[index] || COURSE[0];
    const el = p && document.getElementById('period-' + p.id);
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 84);
  }

  let viewPeriodRaf = null;
  function scheduleViewPeriodUpdate() {
    if (viewPeriodRaf) return;
    viewPeriodRaf = requestAnimationFrame(() => {
      viewPeriodRaf = null;
      const idx = periodIndexInView();
      if (idx === ui.periodIndex) return;
      ui.periodIndex = idx;
      lsSet('hb_period', String(idx));
      updatePeriodChrome();
    });
  }

  // -------------------------------------------------------- средняя нагрузка в день

  function computePeriodLoadMinutes(period) {
    const byDate = itemsByDate();
    let total = 0;
    Object.keys(period.days).forEach(dateKey => {
      (byDate[dateKey] || []).forEach(it => { if (it.category !== 'payment') total += itemDuration(it); });
    });
    return { total, days: Object.keys(period.days).length };
  }

  function renderLoad() {
    const period = currentPeriod();
    const valueEl = $('[data-load]');
    const labelEl = $('[data-load-label]');
    if (!valueEl || !period) return;
    const { total, days } = computePeriodLoadMinutes(period);
    const perDay = days ? total / days : 0;
    const hours = perDay / 60;
    valueEl.textContent = hours >= 1 ? `${(Math.round(hours * 10) / 10)}`.replace('.', ',') + ' ч' : `${Math.round(perDay)} мин`;
    if (labelEl) labelEl.textContent = `в день · ${period.name}`;
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
    ghost.classList.remove('link-below', 'link-above');
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
      if (roots.has('/') || roots.has('items')) {
        migrateSeptember10();
        migratePdfCheck();
        migrateChemCompanions();
        requestRender();
      }
      if (roots.has('/') || roots.has('presence')) renderSyncStatus();
    });

    window.addEventListener('scroll', scheduleViewPeriodUpdate, { passive: true });

    window.HB = {
      BOARD,
      ui,
      store: Store,
      currentPeriod,
      toast,
      setZoom,
      updateBoardSize,
      openModal,
      closeModal,
      periodTop,
      periodAt,
      periodLayout: () => periodLayoutCache
    };
    document.dispatchEvent(new CustomEvent('hb:ready'));

    renderBoard();
    window.__appBooted = true;
    document.body.classList.add('is-loaded');
    // Если человек уже сам начал листать, пока грузились данные, — не перебиваем его прыжком
    let userScrolledDuringBoot = false;
    const noticeUserScroll = () => { userScrolledDuringBoot = true; };
    window.addEventListener('scroll', noticeUserScroll, { passive: true, once: true });
    try {
      await Store.init(buildSeed);
    } catch (err) {
      console.error('Ошибка запуска синхронизации:', err);
      toast('Синхронизация недоступна — работаем локально');
    }
    requestRender();
    renderSyncStatus();
    window.removeEventListener('scroll', noticeUserScroll);
    // Мгновенно прокручиваем к сохранённому/сегодняшнему периоду — один раз, без анимации,
    // и только если человек не успел сам прокрутить страницу, пока грузились данные
    if (!userScrolledDuringBoot) jumpToPeriod(ui.periodIndex);
    updatePeriodChrome();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
