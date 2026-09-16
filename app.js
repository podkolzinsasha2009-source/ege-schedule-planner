// ==========================================================================
// ИНТЕРАКТИВНЫЙ ПЛАНИРОВЩИК «ХИМБИОРУС ЕГЭ»
// Управление состоянием, Drag-and-Drop, Фильтры, Поиск и Хранилище
// ==========================================================================

(function () {
  'use strict';

  const STORAGE_KEY = 'himbiorus_schedule_state_v2';

  // Глобальное состояние
  let state = {
    periods: [],
    backlog: [],
    currentPeriodIndex: 0,
    filterSubject: 'all',     // 'all' | 'bio' | 'chem' | 'rus'
    filterCategory: 'all',    // 'all' | 'theory' | 'practice' | 'test' | 'homework' | 'mock' | 'webinar'
    showCompanions: true,     // показывать сопутствующие тесты и ДЗ
    searchQuery: '',
    editingItem: null,
    editingTarget: null       // { dateKey, index, isBacklog }
  };

  // Переменная для отслеживания текущего перетаскиваемого объекта
  let dragData = null;

  // Очистка любых сопутствующих тестов к пробникам
  function cleanMockCompanionTests(periods, backlog) {
    const isMockTest = (it) => it.isCompanion && (it.id?.startsWith('mock_') || it.title?.toLowerCase().includes('пробник'));
    if (periods) {
      periods.forEach(p => {
        Object.values(p.days || {}).forEach(day => {
          if (day.items) {
            day.items = day.items.filter(it => !isMockTest(it));
          }
        });
      });
    }
    if (backlog) {
      return backlog.filter(it => !isMockTest(it));
    }
    return [];
  }

  // ==========================================
  // ТЁМНАЯ ТЕМА (DARK MODE)
  // ==========================================
  const THEME_STORAGE_KEY = 'himbiorus_theme';

  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme ? (savedTheme === 'dark') : prefersDark;
    applyTheme(isDark);
  }

  function applyTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch(e) {}

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#090d16' : '#4f46e5');
    }

    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.innerHTML = isDark ? '☀️ Светлая' : '🌙 Тёмная';
      themeBtn.title = isDark ? 'Включить светлую тему' : 'Включить тёмную тему';
    }

    const mobThemeBtn = document.getElementById('mob-theme-btn');
    if (mobThemeBtn) {
      const icon = mobThemeBtn.querySelector('.mob-bar-icon');
      const label = mobThemeBtn.querySelector('.mob-bar-label');
      if (icon) icon.textContent = isDark ? '☀️' : '🌙';
      if (label) label.textContent = isDark ? 'Светлая' : 'Тёмная';
    }
  }

  function toggleTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    applyTheme(!isDark);
  }

  // Инициализация приложения
  function initApp() {
    loadState();
    initTheme();
    setupEventListeners();
    renderPeriodsNav();
    renderControls();
    renderCalendar();
    renderBacklog();
    updateProgress();
    setupGoodNotesStylus();
    setupMobileNavigation();
  }

  // Загрузка состояния из localStorage или базовых данных курса
  function loadState() {
    // Очищаем старую версию с тестами у пробников
    try {
      localStorage.removeItem('himbiorus_schedule_state_v1');
    } catch(e) {}

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.periods && parsed.periods.length > 0) {
          state.periods = parsed.periods;
          state.backlog = parsed.backlog || [];
          state.currentPeriodIndex = parsed.currentPeriodIndex || 0;
          state.showCompanions = parsed.showCompanions !== undefined ? parsed.showCompanions : true;
          cleanMockCompanionTests(state.periods, state.backlog);
          return;
        }
      } catch (e) {
        console.error('Ошибка загрузки сохраненного состояния:', e);
      }
    }

    // Загрузка из window.COURSE_DATA
    if (window.COURSE_DATA && Array.isArray(window.COURSE_DATA)) {
      state.periods = JSON.parse(JSON.stringify(window.COURSE_DATA));
      state.backlog = [];
      state.currentPeriodIndex = 0;
      cleanMockCompanionTests(state.periods, state.backlog);
    } else {
      console.error('База данных курса window.COURSE_DATA не найдена!');
    }
  }

  // Сохранение состояния в localStorage
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        periods: state.periods,
        backlog: state.backlog,
        currentPeriodIndex: state.currentPeriodIndex,
        showCompanions: state.showCompanions
      }));
    } catch (e) {
      console.error('Ошибка сохранения состояния:', e);
    }
    updateProgress();
  }

  // Сброс к оригинальному расписанию из PDF
  function resetToDefault() {
    if (confirm('Вы уверены, что хотите сбросить расписание к оригинальному виду из PDF? Все внесенные перестановки и новые плашки будут сброшены.')) {
      localStorage.removeItem(STORAGE_KEY);
      if (window.COURSE_DATA) {
        state.periods = JSON.parse(JSON.stringify(window.COURSE_DATA));
      }
      state.backlog = [];
      saveState();
      renderCalendar();
      renderBacklog();
      renderPeriodsNav();
    }
  }

  // ==========================================================================
  // ПЕРЕКЛЮЧЕНИЕ ПЕРИОДОВ С СОХРАНЕНИЕМ ЗАМЕТОК СТИЛУСА
  // ==========================================================================

  function selectPeriod(idx) {
    if (idx < 0 || idx >= state.periods.length || idx === state.currentPeriodIndex) return;
    if (window.GoodNotesStylus) {
      window.GoodNotesStylus.saveDrawing();
    }
    state.currentPeriodIndex = idx;
    saveState();
    renderPeriodsNav();
    renderCalendar();
    if (window.GoodNotesStylus) {
      setTimeout(() => {
        window.GoodNotesStylus.resizeAndLoad();
      }, 60);
    }
  }

  // ==========================================================================
  // РЕНДЕРИНГ НАВИГАЦИИ И ШАПКИ
  // ==========================================================================

  function renderPeriodsNav() {
    const period = state.periods[state.currentPeriodIndex];
    if (!period) return;

    // Отображение названия текущего периода
    const displayEl = document.getElementById('current-period-display');
    if (displayEl) {
      displayEl.textContent = `${period.name} (Период ${state.currentPeriodIndex + 1}/${state.periods.length})`;
    }

    // Стрелки вперед/назад
    const prevBtn = document.getElementById('prev-period-btn');
    const nextBtn = document.getElementById('next-period-btn');
    if (prevBtn) prevBtn.disabled = state.currentPeriodIndex === 0;
    if (nextBtn) nextBtn.disabled = state.currentPeriodIndex === state.periods.length - 1;

    // Вкладки всех 12 периодов
    const tabsContainer = document.getElementById('periods-tabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = '';
      state.periods.forEach((p, idx) => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${idx === state.currentPeriodIndex ? 'active' : ''}`;
        btn.textContent = p.name;
        btn.title = `Страница ${idx + 1}: ${p.name}`;
        btn.addEventListener('click', () => {
          selectPeriod(idx);
        });
        tabsContainer.appendChild(btn);
      });
      // Плавная прокрутка активной вкладки
      const activeTab = tabsContainer.querySelector('.tab-btn.active');
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }

  function renderControls() {
    // Тумблер сопутствующих плашек
    const toggle = document.getElementById('toggle-companions');
    if (toggle) {
      toggle.checked = state.showCompanions;
    }

    // Активные чипы предметов
    document.querySelectorAll('.filter-group [data-subject]').forEach(chip => {
      const subj = chip.getAttribute('data-subject');
      chip.classList.toggle('active', subj === state.filterSubject);
    });

    // Активные чипы типов
    document.querySelectorAll('.filter-group [data-category]').forEach(chip => {
      const cat = chip.getAttribute('data-category');
      chip.classList.toggle('active', cat === state.filterCategory);
    });
  }

  // ==========================================================================
  // РЕНДЕРИНГ КАЛЕНДАРЯ
  // ==========================================================================

  function renderCalendar() {
    const period = state.periods[state.currentPeriodIndex];
    const container = document.getElementById('calendar-container');
    if (!container || !period) return;

    container.innerHTML = '';

    // Группируем дни по неделям (каждые 7 дней)
    const dayEntries = Object.entries(period.days);
    const weeks = [];
    for (let i = 0; i < dayEntries.length; i += 7) {
      weeks.push(dayEntries.slice(i, i + 7));
    }

    weeks.forEach((weekDays, weekIndex) => {
      const weekEl = document.createElement('div');
      weekEl.className = 'calendar-week';

      weekDays.forEach(([dateKey, dayData]) => {
        const dayCard = document.createElement('div');
        dayCard.className = 'calendar-day-card';
        dayCard.setAttribute('data-date', dateKey);

        // Заголовок дня
        const header = document.createElement('div');
        header.className = 'day-header';
        header.innerHTML = `
          <div class="day-title">
            <span class="day-name">${dayData.dayName}</span>
            <span class="day-number">${dayData.dayNum}</span>
            <span class="day-month">${dayData.month}</span>
          </div>
          <button class="day-add-btn" title="Добавить плашку на этот день" data-date="${dateKey}">+</button>
        `;

        header.querySelector('.day-add-btn').addEventListener('click', () => {
          openCreateModal(dateKey);
        });

        // Дропзона дня
        const dropzone = document.createElement('div');
        dropzone.className = 'day-dropzone';
        dropzone.setAttribute('data-date', dateKey);
        setupDropzoneEvents(dropzone, dateKey, false);

        // Фильтрация и рендеринг карточек
        const filteredItems = dayData.items.filter(item => isItemVisible(item));

        filteredItems.forEach((item, itemIndex) => {
          // Реальный индекс в массиве dayData.items
          const realIndex = dayData.items.indexOf(item);
          const card = createCardElement(item, dateKey, realIndex, false);
          dropzone.appendChild(card);
        });

        dayCard.appendChild(header);
        dayCard.appendChild(dropzone);
        weekEl.appendChild(dayCard);
      });

      container.appendChild(weekEl);
    });

    updateProgress();

    if (window.GoodNotesStylus) {
      setTimeout(() => {
        window.GoodNotesStylus.resizeAndLoad();
      }, 50);
    }
  }

  // Проверка видимости карточки с учетом фильтров и поиска
  function isItemVisible(item) {
    // 1. Фильтр сопутствующих блоков (Тесты и ДЗ)
    if (!state.showCompanions && item.isCompanion) {
      return false;
    }

    // 2. Фильтр по предмету
    if (state.filterSubject !== 'all') {
      if (item.subject !== state.filterSubject && item.subject !== 'general') {
        return false;
      }
    }

    // 3. Фильтр по категории
    if (state.filterCategory !== 'all') {
      if (item.category !== state.filterCategory) {
        return false;
      }
    }

    // 4. Поисковый запрос
    if (state.searchQuery.trim() !== '') {
      const q = state.searchQuery.toLowerCase();
      const titleMatch = (item.title || '').toLowerCase().includes(q);
      const subMatch = (item.subtitle || '').toLowerCase().includes(q);
      const timeMatch = (item.time || '').toLowerCase().includes(q);
      if (!titleMatch && !subMatch && !timeMatch) {
        return false;
      }
    }

    return true;
  }

  // ==========================================================================
  // СОЗДАНИЕ DOM-ЭЛЕМЕНТА КАРТОЧКИ
  // ==========================================================================

  function createCardElement(item, dateKey, index, isBacklog) {
    const card = document.createElement('div');
    card.className = `schedule-card ${item.subject} ${item.category} ${item.isCompanion ? 'is-companion' : ''} ${item.completed ? 'completed' : ''}`;
    card.draggable = true;
    card.setAttribute('data-id', item.id);
    card.setAttribute('data-index', index);
    if (dateKey) card.setAttribute('data-date', dateKey);

    // Иконка
    let iconHtml = '';
    if (item.icon === 'plus') {
      iconHtml = '<span class="icon-badge" title="Дополнительный вебинар">+</span>';
    } else if (item.icon === 'check') {
      iconHtml = '<span class="icon-badge" title="Зачет">✓</span>';
    } else if (item.icon === 'alert') {
      iconHtml = '<span class="icon-badge" title="Рубежная аттестация">!</span>';
    }

    // Время
    let timeHtml = '';
    if (item.time) {
      timeHtml = `<span class="time-badge">🕒 ${item.time}</span>`;
    }

    // Бейдж типа (для тестов, ДЗ, пробников)
    let typePillHtml = '';
    if (item.category === 'test' && item.isCompanion) {
      typePillHtml = '<span class="type-pill">ТЕСТ</span>';
    } else if (item.category === 'homework' && item.isCompanion) {
      typePillHtml = '<span class="type-pill">ПИСЬМЕННОЕ ДЗ</span>';
    } else if (item.category === 'mock') {
      typePillHtml = '<span class="type-pill">ПРОБНИК</span>';
    }

    card.innerHTML = `
      <div class="card-header-row">
        <div class="card-badges">
          <span class="drag-handle" title="Перетащить пальцем или мышкой">⠿</span>
          ${timeHtml}
          ${typePillHtml}
          ${iconHtml}
        </div>
        <div class="card-controls">
          <input type="checkbox" class="card-check" title="Отметить как выполненное" ${item.completed ? 'checked' : ''}>
          <button class="card-btn edit" title="Редактировать">✎</button>
          <button class="card-btn delete" title="Удалить">✕</button>
        </div>
      </div>
      <div class="card-title">${escapeHtml(item.title)}</div>
      ${item.subtitle ? `<div class="card-subtitle">${escapeHtml(item.subtitle)}</div>` : ''}
    `;

    // Чекбокс завершения
    const checkEl = card.querySelector('.card-check');
    checkEl.addEventListener('change', (e) => {
      e.stopPropagation();
      item.completed = checkEl.checked;
      card.classList.toggle('completed', item.completed);
      saveState();
    });

    // Редактирование
    const editBtn = card.querySelector('.card-btn.edit');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(item, dateKey, index, isBacklog);
    });

    // Удаление
    const delBtn = card.querySelector('.card-btn.delete');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Удалить плашку «${item.title}»?`)) {
        deleteItem(dateKey, index, isBacklog);
      }
    });

    // Настройка Drag-and-Drop для мыши и для планшетов (тач/стилус)
    setupCardDragEvents(card, item, dateKey, index, isBacklog);
    setupCardTouchEvents(card, item, dateKey, index, isBacklog);

    return card;
  }

  // ==========================================================================
  // ЧИСТЫЙ МЕХАНИЗМ DRAG-AND-DROP («НИЧЕГО ЗА СОБОЙ НЕ ОСТАВЛЯЮТ»)
  // ==========================================================================

  function setupCardDragEvents(card, item, dateKey, index, isBacklog) {
    card.addEventListener('dragstart', (e) => {
      dragData = {
        itemId: item.id,
        sourceDateKey: dateKey,
        sourceIndex: index,
        sourceIsBacklog: isBacklog
      };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify(dragData));

      setTimeout(() => {
        card.classList.add('dragging');
      }, 0);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      dragData = null;
      removeDropIndicators();
    });
  }

  // ПОЛНОЦЕННЫЙ ТАЧ-ПЕРЕНОС ДЛЯ ПЛАНШЕТОВ (IPAD / ANDROID)
  function setupCardTouchEvents(card, item, dateKey, index, isBacklog) {
    let touchStartX = 0;
    let touchStartY = 0;
    let isDragging = false;
    let ghost = null;
    let ghostOffsetX = 0;
    let ghostOffsetY = 0;
    let holdTimer = null;
    let currentHoverDropzone = null;

    const startTouchDrag = (touch) => {
      if (isDragging) return;
      isDragging = true;
      dragData = {
        itemId: item.id,
        sourceDateKey: dateKey,
        sourceIndex: index,
        sourceIsBacklog: isBacklog
      };

      if (navigator.vibrate) {
        try { navigator.vibrate(25); } catch (err) {}
      }

      const rect = card.getBoundingClientRect();
      ghostOffsetX = touch.clientX - rect.left;
      ghostOffsetY = touch.clientY - rect.top;

      ghost = card.cloneNode(true);
      ghost.classList.add('touch-drag-ghost');
      ghost.style.width = rect.width + 'px';
      ghost.style.left = (touch.clientX - ghostOffsetX) + 'px';
      ghost.style.top = (touch.clientY - ghostOffsetY) + 'px';
      document.body.appendChild(ghost);

      card.classList.add('touch-dragging');
    };

    card.addEventListener('touchstart', (e) => {
      if (e.target.closest('.card-controls, .card-check, .card-btn')) {
        return;
      }

      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      isDragging = false;

      // Если нажали прямо на иконку перетаскивания '⠿' — хватаем сразу
      if (e.target.closest('.drag-handle')) {
        e.preventDefault();
        startTouchDrag(touch);
        return;
      }

      // При нажатии на тело карточки — задержка 180 мс, чтобы не мешать быстрому скроллу
      holdTimer = setTimeout(() => {
        startTouchDrag(touch);
      }, 180);
    }, { passive: false });

    card.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      const dist = Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY);

      if (!isDragging) {
        if (dist > 10) {
          clearTimeout(holdTimer);
        }
        return;
      }

      e.preventDefault();

      if (ghost) {
        ghost.style.left = (touch.clientX - ghostOffsetX) + 'px';
        ghost.style.top = (touch.clientY - ghostOffsetY) + 'px';
      }

      const elemUnder = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropzone = elemUnder ? elemUnder.closest('.day-dropzone, .drawer-dropzone') : null;

      if (dropzone !== currentHoverDropzone) {
        if (currentHoverDropzone) {
          currentHoverDropzone.classList.remove('drag-over');
          removeDropIndicators(currentHoverDropzone);
        }
        currentHoverDropzone = dropzone;
        if (currentHoverDropzone) {
          currentHoverDropzone.classList.add('drag-over');
        }
      }

      if (currentHoverDropzone) {
        showDropIndicator(currentHoverDropzone, touch.clientY);
      }
    }, { passive: false });

    const endTouchDrag = (e) => {
      clearTimeout(holdTimer);

      if (!isDragging) return;
      isDragging = false;

      if (ghost) {
        ghost.remove();
        ghost = null;
      }
      card.classList.remove('touch-dragging');

      const touch = e.changedTouches ? e.changedTouches[0] : null;
      let targetDropzone = currentHoverDropzone;
      let clientY = touch ? touch.clientY : 0;

      if (!targetDropzone && touch) {
        const elemUnder = document.elementFromPoint(touch.clientX, touch.clientY);
        targetDropzone = elemUnder ? elemUnder.closest('.day-dropzone, .drawer-dropzone') : null;
      }

      if (targetDropzone && dragData) {
        const targetIndex = calculateDropIndex(targetDropzone, clientY);
        const isTargetBacklog = targetDropzone.classList.contains('drawer-dropzone') || targetDropzone.id === 'backlog-dropzone';
        const targetDateKey = targetDropzone.getAttribute('data-date');

        moveItem(dragData, {
          targetDateKey: targetDateKey,
          targetIndex: targetIndex,
          targetIsBacklog: isTargetBacklog
        });
      }

      if (currentHoverDropzone) {
        currentHoverDropzone.classList.remove('drag-over');
        removeDropIndicators(currentHoverDropzone);
        currentHoverDropzone = null;
      }
      removeDropIndicators();
      dragData = null;
    };

    card.addEventListener('touchend', endTouchDrag);
    card.addEventListener('touchcancel', endTouchDrag);
  }

  function setupDropzoneEvents(dropzone, dateKey, isBacklog) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      dropzone.classList.add('drag-over');

      // Рассчитываем позицию индикатора вставки между карточками
      showDropIndicator(dropzone, e.clientY);
    });

    dropzone.addEventListener('dragleave', (e) => {
      // Убираем подсветку, если курсор вышел за пределы дропзоны
      if (!dropzone.contains(e.relatedTarget)) {
        dropzone.classList.remove('drag-over');
        removeDropIndicators(dropzone);
      }
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');

      let transferData = dragData;
      if (!transferData) {
        try {
          transferData = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch (err) {
          transferData = null;
        }
      }

      if (!transferData) return;

      // Вычисляем целевой индекс вставки в зависимости от положения мыши
      const targetIndex = calculateDropIndex(dropzone, e.clientY);

      // Выполняем атомарное перемещение
      moveItem(transferData, {
        targetDateKey: dateKey,
        targetIndex: targetIndex,
        targetIsBacklog: isBacklog
      });

      removeDropIndicators();
    });
  }

  // Индикатор линии вставки
  function showDropIndicator(dropzone, mouseY) {
    removeDropIndicators(dropzone);

    const cards = [...dropzone.querySelectorAll('.schedule-card:not(.dragging):not(.touch-dragging)')];
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';

    if (cards.length === 0) {
      dropzone.appendChild(indicator);
      return;
    }

    let inserted = false;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (mouseY < midY) {
        dropzone.insertBefore(indicator, card);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      dropzone.appendChild(indicator);
    }
  }

  function removeDropIndicators(container = document) {
    container.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  }

  function calculateDropIndex(dropzone, mouseY) {
    const cards = [...dropzone.querySelectorAll('.schedule-card:not(.dragging):not(.touch-dragging)')];
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (mouseY < midY) {
        return parseInt(cards[i].getAttribute('data-index'), 10);
      }
    }
    return cards.length; // в конец списка
  }

  // АТОМАРНЫЙ ПЕРЕНОС БЛОКА
  function moveItem(source, target) {
    let sourceArray = null;

    // 1. Извлекаем исходный список
    if (source.sourceIsBacklog) {
      sourceArray = state.backlog;
    } else {
      const period = findPeriodByDate(source.sourceDateKey);
      if (period && period.days[source.sourceDateKey]) {
        sourceArray = period.days[source.sourceDateKey].items;
      }
    }

    if (!sourceArray) return;

    // 2. Находим элемент по индексу или id
    let movedItem = null;
    if (source.sourceIndex >= 0 && source.sourceIndex < sourceArray.length) {
      movedItem = sourceArray.splice(source.sourceIndex, 1)[0];
    } else {
      const idx = sourceArray.findIndex(it => it.id === source.itemId);
      if (idx !== -1) {
        movedItem = sourceArray.splice(idx, 1)[0];
      }
    }

    if (!movedItem) return;

    // 3. Извлекаем целевой список
    let targetArray = null;
    if (target.targetIsBacklog) {
      targetArray = state.backlog;
    } else {
      const period = findPeriodByDate(target.targetDateKey);
      if (period && period.days[target.targetDateKey]) {
        targetArray = period.days[target.targetDateKey].items;
      }
    }

    if (!targetArray) {
      // Откатываем назад, если цель не найдена
      sourceArray.push(movedItem);
      return;
    }

    // 4. Вставляем элемент в целевой список на точный индекс
    const insertIdx = Math.min(Math.max(0, target.targetIndex), targetArray.length);
    targetArray.splice(insertIdx, 0, movedItem);

    // 5. Сохраняем состояние и перерисовываем
    saveState();
    renderCalendar();
    renderBacklog();
  }

  function findPeriodByDate(dateKey) {
    if (!dateKey) return null;
    return state.periods.find(p => p.days && p.days[dateKey] !== undefined);
  }

  // ==========================================
  // БОКОВАЯ ПАНЕЛЬ БЭКЛОГА (ОТЛОЖЕННЫЕ ЗАДАЧИ)
  // ==========================================

  function renderBacklog() {
    const dropzone = document.getElementById('backlog-dropzone');
    const badge = document.getElementById('backlog-badge');
    if (!dropzone) return;

    if (badge) {
      badge.textContent = state.backlog.length;
      badge.style.display = state.backlog.length > 0 ? 'inline-block' : 'none';
    }

    const mobBadge = document.getElementById('mob-backlog-badge');
    if (mobBadge) {
      mobBadge.style.display = state.backlog.length > 0 ? 'block' : 'none';
    }

    dropzone.innerHTML = '';
    dropzone.setAttribute('data-is-backlog', 'true');
    setupDropzoneEvents(dropzone, null, true);

    if (state.backlog.length === 0) {
      dropzone.innerHTML = `
        <div class="empty-backlog-notice">
          Перетащите сюда любой урок или тест, чтобы отложить его без привязки к конкретному дню.
        </div>
      `;
      return;
    }

    state.backlog.forEach((item, index) => {
      const card = createCardElement(item, null, index, true);
      dropzone.appendChild(card);
    });
  }

  // ==========================================
  // УДАЛЕНИЕ И РЕДАКТИРОВАНИЕ
  // ==========================================

  function deleteItem(dateKey, index, isBacklog) {
    if (isBacklog) {
      state.backlog.splice(index, 1);
    } else {
      const period = findPeriodByDate(dateKey);
      if (period && period.days[dateKey]) {
        period.days[dateKey].items.splice(index, 1);
      }
    }
    saveState();
    renderCalendar();
    renderBacklog();
  }

  function openCreateModal(dateKey) {
    state.editingItem = null;
    state.editingTarget = { dateKey, index: -1, isBacklog: false };

    document.getElementById('modal-title').textContent = 'Добавить плашку в расписание';
    document.getElementById('modal-field-title').value = '';
    document.getElementById('modal-field-subtitle').value = '';
    document.getElementById('modal-field-subject').value = 'bio';
    document.getElementById('modal-field-category').value = 'theory';
    document.getElementById('modal-field-time').value = '16:00';
    document.getElementById('modal-field-icon').value = 'none';

    document.getElementById('block-modal-backdrop').classList.add('active');
  }

  function openEditModal(item, dateKey, index, isBacklog) {
    state.editingItem = item;
    state.editingTarget = { dateKey, index, isBacklog };

    document.getElementById('modal-title').textContent = 'Редактировать плашку';
    document.getElementById('modal-field-title').value = item.title || '';
    document.getElementById('modal-field-subtitle').value = item.subtitle || '';
    document.getElementById('modal-field-subject').value = item.subject || 'bio';
    document.getElementById('modal-field-category').value = item.category || 'theory';
    document.getElementById('modal-field-time').value = item.time || '';
    document.getElementById('modal-field-icon').value = item.icon || 'none';

    document.getElementById('block-modal-backdrop').classList.add('active');
  }

  function closeModal() {
    document.getElementById('block-modal-backdrop').classList.remove('active');
    state.editingItem = null;
    state.editingTarget = null;
  }

  function saveModalForm() {
    const title = document.getElementById('modal-field-title').value.trim();
    if (!title) {
      alert('Пожалуйста, введите название блока!');
      return;
    }

    const subtitle = document.getElementById('modal-field-subtitle').value.trim();
    const subject = document.getElementById('modal-field-subject').value;
    const category = document.getElementById('modal-field-category').value;
    const time = document.getElementById('modal-field-time').value.trim() || null;
    const iconVal = document.getElementById('modal-field-icon').value;
    const icon = iconVal === 'none' ? null : iconVal;

    if (state.editingItem) {
      // Редактирование существующего
      state.editingItem.title = title;
      state.editingItem.subtitle = subtitle;
      state.editingItem.subject = subject;
      state.editingItem.category = category;
      state.editingItem.time = time;
      state.editingItem.icon = icon;
    } else {
      // Создание нового
      const newItem = {
        id: 'custom-' + Date.now(),
        title,
        subtitle,
        subject,
        category,
        time,
        icon,
        completed: false,
        isCompanion: false
      };

      const target = state.editingTarget;
      if (target.isBacklog) {
        state.backlog.push(newItem);
      } else {
        const period = findPeriodByDate(target.dateKey);
        if (period && period.days[target.dateKey]) {
          period.days[target.dateKey].items.push(newItem);
        }
      }
    }

    saveState();
    closeModal();
    renderCalendar();
    renderBacklog();
  }

  // ==========================================
  // ОБНОВЛЕНИЕ СТАТИСТИКИ И ПРОГРЕССА
  // ==========================================

  function updateProgress() {
    let total = 0;
    let completed = 0;
    let bioTotal = 0, bioDone = 0;
    let chemTotal = 0, chemDone = 0;
    let rusTotal = 0, rusDone = 0;

    const countItem = (item) => {
      total++;
      if (item.completed) completed++;
      if (item.subject === 'bio') {
        bioTotal++;
        if (item.completed) bioDone++;
      } else if (item.subject === 'chem') {
        chemTotal++;
        if (item.completed) chemDone++;
      } else if (item.subject === 'rus') {
        rusTotal++;
        if (item.completed) rusDone++;
      }
    };

    state.periods.forEach(p => {
      Object.values(p.days).forEach(d => {
        d.items.forEach(countItem);
      });
    });
    state.backlog.forEach(countItem);

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const bioPct = bioTotal > 0 ? Math.round((bioDone / bioTotal) * 100) : 0;
    const chemPct = chemTotal > 0 ? Math.round((chemDone / chemTotal) * 100) : 0;
    const rusPct = rusTotal > 0 ? Math.round((rusDone / rusTotal) * 100) : 0;

    const percentEl = document.getElementById('progress-percent');
    if (percentEl) percentEl.textContent = `${percent}%`;

    const countEl = document.getElementById('progress-counts');
    if (countEl) countEl.textContent = `${completed} из ${total} выполнено`;

    const bioBar = document.getElementById('bar-bio');
    if (bioBar) bioBar.style.width = `${(bioTotal / total) * 100}%`;

    const chemBar = document.getElementById('bar-chem');
    if (chemBar) chemBar.style.width = `${(chemTotal / total) * 100}%`;

    const rusBar = document.getElementById('bar-rus');
    if (rusBar) rusBar.style.width = `${(rusTotal / total) * 100}%`;

    const statBio = document.getElementById('stat-bio');
    if (statBio) statBio.textContent = `Био: ${bioDone}/${bioTotal} (${bioPct}%)`;

    const statChem = document.getElementById('stat-chem');
    if (statChem) statChem.textContent = `Хим: ${chemDone}/${chemTotal} (${chemPct}%)`;

    const statRus = document.getElementById('stat-rus');
    if (statRus) statRus.textContent = `Рус: ${rusDone}/${rusTotal} (${rusPct}%)`;
  }

  // ==========================================
  // НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ
  // ==========================================

  function setupEventListeners() {
    // Навигация стрелками
    document.getElementById('prev-period-btn')?.addEventListener('click', () => {
      if (state.currentPeriodIndex > 0) {
        selectPeriod(state.currentPeriodIndex - 1);
      }
    });

    document.getElementById('next-period-btn')?.addEventListener('click', () => {
      if (state.currentPeriodIndex < state.periods.length - 1) {
        selectPeriod(state.currentPeriodIndex + 1);
      }
    });

    // Переключение темной темы
    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);

    // Тумблер сопутствующих блоков
    document.getElementById('toggle-companions')?.addEventListener('change', (e) => {
      state.showCompanions = e.target.checked;
      saveState();
      renderCalendar();
    });

    // Фильтры по предмету
    document.querySelectorAll('.filter-group [data-subject]').forEach(chip => {
      chip.addEventListener('click', () => {
        state.filterSubject = chip.getAttribute('data-subject');
        renderControls();
        renderCalendar();
      });
    });

    // Фильтры по категории
    document.querySelectorAll('.filter-group [data-category]').forEach(chip => {
      chip.addEventListener('click', () => {
        state.filterCategory = chip.getAttribute('data-category');
        renderControls();
        renderCalendar();
      });
    });

    // Поиск
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        if (searchClear) {
          searchClear.classList.toggle('visible', state.searchQuery.length > 0);
        }
        renderCalendar();
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        searchClear.classList.remove('visible');
        renderCalendar();
      });
    }

    // Бэклог (выдвижная панель)
    const openBacklogBtn = document.getElementById('open-backlog-btn');
    const closeBacklogBtn = document.getElementById('close-backlog-btn');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const drawer = document.getElementById('drawer');

    const toggleDrawer = (open) => {
      drawerOverlay?.classList.toggle('active', open);
      drawer?.classList.toggle('active', open);
    };

    openBacklogBtn?.addEventListener('click', () => toggleDrawer(true));
    closeBacklogBtn?.addEventListener('click', () => toggleDrawer(false));
    drawerOverlay?.addEventListener('click', () => toggleDrawer(false));

    // Сброс к исходному
    document.getElementById('reset-btn')?.addEventListener('click', resetToDefault);

    // Печать / PDF
    document.getElementById('print-btn')?.addEventListener('click', () => {
      window.print();
    });

    // Экспорт / Импорт JSON
    document.getElementById('export-btn')?.addEventListener('click', exportJson);
    document.getElementById('import-file-input')?.addEventListener('change', importJson);
    document.getElementById('modal-export-btn')?.addEventListener('click', exportJson);
    document.getElementById('modal-import-file-input')?.addEventListener('change', importJson);
    document.getElementById('modal-print-btn')?.addEventListener('click', () => window.print());
    document.getElementById('modal-reset-btn')?.addEventListener('click', resetToDefault);

    // Модальное окно для подключения планшета
    const tabletBtn = document.getElementById('tablet-btn');
    const tabletModal = document.getElementById('tablet-modal-backdrop');
    const tabletCloseBtn = document.getElementById('tablet-modal-close-btn');
    const tabletOkBtn = document.getElementById('tablet-modal-ok-btn');

    function openTabletModal() {
      if (!tabletModal) return;
      tabletModal.classList.add('active');

      // Получаем сетевой адрес от сервера run_planner.py
      fetch('/network-info.json')
        .then(res => res.json())
        .then(data => {
          if (data && data.url) {
            const linkEl = document.getElementById('tablet-network-link');
            if (linkEl) {
              linkEl.href = data.url;
              linkEl.textContent = data.url;
            }
            const qrEl = document.getElementById('tablet-qr-image');
            if (qrEl) {
              qrEl.src = (data.qr_svg || 'tablet_qr.svg') + '?t=' + Date.now();
            }
          }
        })
        .catch(() => {
          // Fallback если запущено без run_planner.py
          const fallbackUrl = window.location.href;
          const linkEl = document.getElementById('tablet-network-link');
          if (linkEl) {
            linkEl.href = fallbackUrl;
            linkEl.textContent = fallbackUrl;
          }
        });
    }

    function closeTabletModal() {
      tabletModal?.classList.remove('active');
    }

    tabletBtn?.addEventListener('click', openTabletModal);
    tabletCloseBtn?.addEventListener('click', closeTabletModal);
    tabletOkBtn?.addEventListener('click', closeTabletModal);
    tabletModal?.addEventListener('click', (e) => {
      if (e.target.id === 'tablet-modal-backdrop') closeTabletModal();
    });

    // Модальное окно
    document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
    document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);
    document.getElementById('modal-save-btn')?.addEventListener('click', saveModalForm);
    document.getElementById('block-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'block-modal-backdrop') closeModal();
    });

    // Горячие клавиши (Esc для закрытия окон, стрелки для перелистывания)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        closeTabletModal();
        toggleDrawer(false);
      } else if (e.key === 'ArrowLeft' && !document.querySelector('.modal-backdrop.active') && document.activeElement.tagName !== 'INPUT') {
        document.getElementById('prev-period-btn')?.click();
      } else if (e.key === 'ArrowRight' && !document.querySelector('.modal-backdrop.active') && document.activeElement.tagName !== 'INPUT') {
        document.getElementById('next-period-btn')?.click();
      }
    });
  }

  function exportJson() {
    if (window.GoodNotesStylus) {
      window.GoodNotesStylus.saveDrawing();
    }
    const drawings = window.GoodNotesStylus ? window.GoodNotesStylus.getDrawingsBackup() : {};
    const dataStr = JSON.stringify({
      periods: state.periods,
      backlog: state.backlog,
      drawings: drawings,
      theme: localStorage.getItem(THEME_STORAGE_KEY) || 'light',
      exportedAt: new Date().toISOString()
    }, null, 2);

    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `himbiorus_schedule_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.periods && Array.isArray(parsed.periods)) {
          state.periods = parsed.periods;
          state.backlog = parsed.backlog || [];
          if (parsed.drawings && window.GoodNotesStylus) {
            window.GoodNotesStylus.restoreDrawingsBackup(parsed.drawings);
          }
          if (parsed.theme) {
            applyTheme(parsed.theme === 'dark');
          }
          saveState();
          renderCalendar();
          renderBacklog();
          renderPeriodsNav();
          alert('Расписание и рукописные заметки успешно импортированы!');
        } else {
          alert('Неверный формат файла!');
        }
      } catch (err) {
        alert('Ошибка чтения файла: ' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  // ==========================================================================
  // МОДУЛЬ СТИЛУСА GOODNOTES (РУКОПИСНЫЙ ВВОД, ЗАЩИТА ОТ ЛАДОНИ, ХАЙЛАЙТЕР)
  // ==========================================================================
  let stylusModule = null;

  function setupGoodNotesStylus() {
    const canvas = document.getElementById('stylus-canvas');
    const toolbar = document.getElementById('stylus-toolbar');
    const wrapper = document.getElementById('calendar-wrapper');
    const drawToggleBtn = document.getElementById('draw-mode-btn');
    const mobDrawBtn = document.getElementById('mob-draw-btn');
    if (!canvas || !wrapper) return;

    const ctx = canvas.getContext('2d');
    let isDrawingMode = false;
    let isDrawing = false;
    let isPanning = false;
    let panStartY = 0;
    let panStartX = 0;
    let currentTool = 'pen'; // 'pen' | 'highlighter' | 'eraser' | 'pan'
    let currentColor = '#10b981';
    let currentSize = 3;
    let palmRejectionOnlyPen = true; // Защита от ладони: true = только Apple Pencil / S-Pen рисует!
    let lastX = 0;
    let lastY = 0;
    let lastMidX = 0;
    let lastMidY = 0;
    let hasMoved = false;
    let activeTouches = new Map();
    let undoStack = [];
    const MAX_UNDO = 25;
    let saveTimeout = null;
    let resizeObserver = null;

    function getPeriodKey() {
      const p = state.periods[state.currentPeriodIndex];
      return p ? `himbiorus_notes_${p.id}` : 'himbiorus_notes_default';
    }

    function hexToRgba(hex, alpha) {
      hex = hex.replace('#', '');
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }
      const num = parseInt(hex, 16);
      return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
    }

    function resizeCanvas(preserveContent = true) {
      if (!canvas || !wrapper) return;
      const displayWidth = wrapper.offsetWidth;
      const displayHeight = wrapper.offsetHeight;
      if (displayWidth === 0 || displayHeight === 0) return;

      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(displayWidth * dpr);
      const targetH = Math.round(displayHeight * dpr);

      if (canvas.width === targetW && canvas.height === targetH) return;

      let tempCanvas = null;
      if (preserveContent && canvas.width > 0 && canvas.height > 0) {
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0);
      }

      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = displayWidth + 'px';
      canvas.style.height = displayHeight + 'px';

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (tempCanvas) {
        ctx.drawImage(tempCanvas, 0, 0, displayWidth, displayHeight);
      } else {
        loadDrawing();
      }
    }

    function saveDrawing() {
      if (!canvas) return;
      try {
        const key = getPeriodKey();
        const dataUrl = canvas.toDataURL('image/png');
        localStorage.setItem(key, dataUrl);
      } catch (e) {
        console.warn('Не удалось сохранить рисунок стилуса:', e);
      }
    }

    function debouncedSaveDrawing() {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveDrawing, 300);
    }

    function clearCanvasOnly() {
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function loadDrawing() {
      if (!canvas || !ctx) return;
      const key = getPeriodKey();
      const saved = localStorage.getItem(key);
      clearCanvasOnly();
      if (saved) {
        const img = new Image();
        img.onload = () => {
          const dpr = window.devicePixelRatio || 1;
          const displayW = canvas.width / dpr;
          const displayH = canvas.height / dpr;
          ctx.drawImage(img, 0, 0, displayW, displayH);
        };
        img.src = saved;
      }
    }

    function saveUndo() {
      if (!canvas) return;
      if (undoStack.length >= MAX_UNDO) undoStack.shift();
      undoStack.push(canvas.toDataURL('image/png'));
    }

    function undo() {
      if (undoStack.length === 0) return;
      const prev = undoStack.pop();
      clearCanvasOnly();
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        ctx.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr);
        debouncedSaveDrawing();
      };
      img.src = prev;
    }

    function updateToolCursor() {
      if (!canvas) return;
      canvas.classList.toggle('pan-active', currentTool === 'pan');
    }

    function setDrawingMode(active) {
      isDrawingMode = active;
      canvas.classList.toggle('drawing-active', active);
      updateToolCursor();
      if (toolbar) toolbar.style.display = active ? 'block' : 'none';
      if (drawToggleBtn) drawToggleBtn.classList.toggle('active', active);
      if (mobDrawBtn) mobDrawBtn.classList.toggle('active', active);

      if (active) {
        resizeCanvas(true);
        if (toolbar) {
          toolbar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else {
        saveDrawing();
      }
    }

    function toggleDrawingMode() {
      setDrawingMode(!isDrawingMode);
    }

    function applyToolStyles(pressure = 0.5) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let width = currentSize;
      if (pressure && pressure > 0) {
        width = currentSize * (0.6 + 0.8 * pressure);
      }

      const isDark = document.body.classList.contains('dark-mode');

      if (currentTool === 'pen') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = width;
      } else if (currentTool === 'highlighter') {
        ctx.globalCompositeOperation = isDark ? 'screen' : 'multiply';
        ctx.strokeStyle = currentColor.startsWith('rgba') ? currentColor : hexToRgba(currentColor, isDark ? 0.65 : 0.45);
        ctx.lineWidth = Math.max(width * 3.5, 18);
      } else if (currentTool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = Math.max(width * 5, 24);
      }
    }

    function getCanvasCoords(e) {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const scaleX = (canvas.width / dpr) / (rect.width || 1);
      const scaleY = (canvas.height / dpr) / (rect.height || 1);
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }

    // Touch event listeners to explicitly prevent default when palm rests
    canvas.addEventListener('touchstart', (e) => {
      if (!isDrawingMode) return;
      if (palmRejectionOnlyPen && e.touches.length < 2 && currentTool !== 'pan') {
        e.preventDefault();
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (!isDrawingMode) return;
      if (palmRejectionOnlyPen && e.touches.length < 2 && currentTool !== 'pan') {
        e.preventDefault();
      }
    }, { passive: false });

    // Pointer Events на холсте
    canvas.addEventListener('pointerdown', (e) => {
      if (!isDrawingMode) return;

      if (e.pointerType === 'touch') {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.size >= 2) {
          isDrawing = false;
          e.preventDefault();
          return;
        }
      }

      if (currentTool === 'pan') {
        panStartY = e.clientY;
        panStartX = e.clientX;
        isPanning = true;
        e.preventDefault();
        return;
      }

      // Защита от ладони: касания руки и пальцев игнорируются и не вызывают смещений
      if (palmRejectionOnlyPen && e.pointerType !== 'pen') {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch(err) {}

      saveUndo();
      isDrawing = true;
      hasMoved = false;

      const coords = getCanvasCoords(e);
      const x = coords.x;
      const y = coords.y;
      const p = e.pressure || 0.5;

      lastX = x;
      lastY = y;
      lastMidX = x;
      lastMidY = y;

      applyToolStyles(p);
      ctx.beginPath();
      ctx.arc(x, y, (ctx.lineWidth || currentSize) / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && activeTouches.has(e.pointerId)) {
        const prev = activeTouches.get(e.pointerId);
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.size >= 2) {
          const dy = prev.y - e.clientY;
          const dx = prev.x - e.clientX;
          window.scrollBy({ top: dy, left: dx, behavior: 'auto' });
          e.preventDefault();
          return;
        }
      }

      if (isPanning && currentTool === 'pan') {
        const dy = e.clientY - panStartY;
        const dx = e.clientX - panStartX;
        panStartY = e.clientY;
        panStartX = e.clientX;
        window.scrollBy({ top: -dy, left: -dx, behavior: 'auto' });
        e.preventDefault();
        return;
      }

      if (!isDrawing || !isDrawingMode) return;
      if (palmRejectionOnlyPen && e.pointerType !== 'pen') {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      const coords = getCanvasCoords(e);
      const x = coords.x;
      const y = coords.y;
      const p = e.pressure || 0.5;

      hasMoved = true;
      const midX = (lastX + x) / 2;
      const midY = (lastY + y) / 2;

      applyToolStyles(p);
      ctx.beginPath();
      ctx.moveTo(lastMidX, lastMidY);
      ctx.quadraticCurveTo(lastX, lastY, midX, midY);
      ctx.stroke();

      lastMidX = midX;
      lastMidY = midY;
      lastX = x;
      lastY = y;
    });

    const finishStroke = (e) => {
      if (e.pointerType === 'touch') {
        activeTouches.delete(e.pointerId);
      }
      if (isPanning) {
        isPanning = false;
      }
      if (!isDrawing) return;
      isDrawing = false;

      if (hasMoved) {
        applyToolStyles(e.pressure || 0.5);
        ctx.beginPath();
        ctx.moveTo(lastMidX, lastMidY);
        ctx.lineTo(lastX, lastY);
        ctx.stroke();
      }

      try { canvas.releasePointerCapture(e.pointerId); } catch(err) {}
      debouncedSaveDrawing();
    };

    canvas.addEventListener('pointerup', finishStroke);
    canvas.addEventListener('pointercancel', finishStroke);

    // Кнопки тулбара GoodNotes
    drawToggleBtn?.addEventListener('click', toggleDrawingMode);
    mobDrawBtn?.addEventListener('click', toggleDrawingMode);
    document.getElementById('stylus-close-btn')?.addEventListener('click', () => setDrawingMode(false));

    // Выбор инструмента (Ручка, Маркер, Ластик, Скролл)
    document.querySelectorAll('.tools-selection .stylus-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tools-selection .stylus-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.getAttribute('data-tool') || 'pen';
        updateToolCursor();
      });
    });

    // Тумблер защиты от ладони
    const palmBtn = document.getElementById('palm-rejection-btn');
    palmBtn?.addEventListener('click', () => {
      palmRejectionOnlyPen = !palmRejectionOnlyPen;
      palmBtn.classList.toggle('active', palmRejectionOnlyPen);
      const statusEl = palmBtn.querySelector('.palm-status');
      if (statusEl) {
        statusEl.textContent = palmRejectionOnlyPen ? 'Только стилус' : 'Стилус+Палец';
      }
    });

    // Выбор цвета
    document.querySelectorAll('.color-palette .color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('.color-palette .color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        currentColor = dot.getAttribute('data-color') || '#10b981';
      });
    });

    const customColorInput = document.getElementById('stylus-custom-color');
    customColorInput?.addEventListener('input', (e) => {
      currentColor = e.target.value;
      document.querySelectorAll('.color-palette .color-dot').forEach(d => d.classList.remove('active'));
    });

    // Выбор толщины
    document.querySelectorAll('.stroke-sizes .size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.stroke-sizes .size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSize = parseInt(btn.getAttribute('data-size') || '3', 10);
      });
    });

    // Undo & Clear
    document.getElementById('stylus-undo-btn')?.addEventListener('click', undo);
    document.getElementById('stylus-clear-btn')?.addEventListener('click', () => {
      if (confirm('Очистить рукописные заметки для этого периода?')) {
        saveUndo();
        clearCanvasOnly();
        localStorage.removeItem(getPeriodKey());
      }
    });

    // Слежение за изменением размера экрана и разметки с ResizeObserver
    window.addEventListener('resize', () => {
      resizeCanvas(true);
    });

    if (window.ResizeObserver && wrapper) {
      resizeObserver = new ResizeObserver(() => {
        resizeCanvas(true);
      });
      resizeObserver.observe(wrapper);
    }

    // Экспорт API стилуса для вызова при переключении страниц
    stylusModule = {
      saveDrawing,
      loadDrawing,
      resizeAndLoad: () => {
        resizeCanvas(false);
        loadDrawing();
      },
      setDrawingMode,
      toggleDrawingMode,
      getDrawingsBackup: () => {
        const drawings = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('himbiorus_notes_')) {
            drawings[key] = localStorage.getItem(key);
          }
        }
        return drawings;
      },
      restoreDrawingsBackup: (drawings) => {
        if (!drawings) return;
        Object.entries(drawings).forEach(([k, v]) => {
          if (k.startsWith('himbiorus_notes_') && v) {
            localStorage.setItem(k, v);
          }
        });
        loadDrawing();
      }
    };
    window.GoodNotesStylus = stylusModule;

    // Первичная инициализация холста
    setTimeout(() => {
      resizeCanvas(false);
      loadDrawing();
    }, 100);
  }

  // ==========================================================================
  // МОБИЛЬНАЯ НАВИГАЦИЯ И БЫСТРЫЙ ВЫБОР ДНЯ
  // ==========================================================================
  function setupMobileNavigation() {
    // 1. Мобильная нижняя панель
    document.getElementById('mob-period-btn')?.addEventListener('click', () => {
      const tabsWrapper = document.querySelector('.periods-tabs-wrapper');
      if (tabsWrapper) {
        tabsWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (state.currentPeriodIndex < state.periods.length - 1) {
        selectPeriod(state.currentPeriodIndex + 1);
      } else {
        selectPeriod(0);
      }
    });

    document.getElementById('mob-theme-btn')?.addEventListener('click', toggleTheme);

    document.getElementById('mob-backlog-btn')?.addEventListener('click', () => {
      document.getElementById('open-backlog-btn')?.click();
    });

    document.getElementById('mob-tablet-btn')?.addEventListener('click', () => {
      document.getElementById('tablet-btn')?.click();
    });

    // 2. Мобильный быстрый селектор дня (Все дни, Пн, Вт, Ср, Чт, Пт, Сб, Вс)
    const dayChips = document.querySelectorAll('.mobile-day-selector .mob-day-chip');
    dayChips.forEach(chip => {
      chip.addEventListener('click', () => {
        dayChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const selectedDay = chip.getAttribute('data-day');
        const dayCards = document.querySelectorAll('.calendar-day-card');

        if (selectedDay === 'all') {
          dayCards.forEach(card => {
            card.style.display = '';
          });
        } else {
          let foundFirst = false;
          dayCards.forEach(card => {
            const nameEl = card.querySelector('.day-name');
            const dayName = (nameEl ? nameEl.textContent : '').trim().toLowerCase();
            const matches = dayName.startsWith(selectedDay.toLowerCase());

            card.style.display = matches ? '' : 'none';

            if (matches && !foundFirst) {
              foundFirst = true;
              card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          });
        }

        if (window.GoodNotesStylus) {
          setTimeout(() => {
            window.GoodNotesStylus.resizeAndLoad();
          }, 100);
        }
      });
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Запуск при готовности DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
