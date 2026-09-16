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
    initWeekViewMode();
    setupEventListeners();
    renderPeriodsNav();
    renderControls();
    renderCalendar();
    renderBacklog();
    updateProgress();
    setupGoodNotesStylus();
    setupPlacedImagesModule();
    setupMobileNavigation();
    setupRealtimeSync();
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
      if (window.SyncEngine) {
        window.SyncEngine.broadcastFullState({
          periods: state.periods,
          backlog: state.backlog,
          currentPeriodIndex: state.currentPeriodIndex,
          drawings: window.GoodNotesStylus ? window.GoodNotesStylus.getDrawingsBackup() : {}
        });
      }
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
    loadPlacedImagesForPeriod(state.periods[idx].id);
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

        // Отображение активностей: каждый урок, сопутствующий тест и домашка рендерятся как отдельный независимый блок
        const visibleItems = dayData.items.filter(item => isItemVisible(item));
        visibleItems.forEach((item) => {
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

  function createCardElement(item, dateKey, index, isBacklog, attachedCompanions = []) {
    const card = document.createElement('div');
    const hasAccordion = attachedCompanions && attachedCompanions.length > 0;
    card.className = `schedule-card ${item.subject} ${item.category} ${item.isCompanion ? 'is-companion' : ''} ${item.completed ? 'completed' : ''} ${hasAccordion ? 'has-accordion' : ''}`;
    card.draggable = true;
    card.setAttribute('data-id', item.id);
    card.setAttribute('data-index', index);
    if (dateKey) card.setAttribute('data-date', dateKey);

    // Предмет
    const subjectLabels = {
      bio: 'Биология',
      chem: 'Химия',
      rus: 'Русский',
      general: 'Общее'
    };
    const subjectPillHtml = `<span class="subject-pill ${item.subject}">${subjectLabels[item.subject] || ''}</span>`;

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
          ${subjectPillHtml}
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
      updateProgress();
      if (window.SyncEngine) {
        window.SyncEngine.broadcastToggle({
          itemId: item.id,
          completed: item.completed,
          isCompanion: !!item.isCompanion,
          parentId: item.parentId || null,
          dateKey: dateKey,
          isBacklog: isBacklog
        });
      }
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
        deleteItem(dateKey, index, isBacklog, item.id);
      }
    });

    // Раскрывающийся чек-лист сопутствующих активностей (тест + ДЗ)
    if (hasAccordion) {
      const compDoneCount = attachedCompanions.filter(c => c.completed).length;
      const totalCompCount = attachedCompanions.length;
      const allDone = compDoneCount === totalCompCount;

      const accordionEl = document.createElement('div');
      accordionEl.className = 'card-accordion';

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = `accordion-toggle ${allDone ? 'all-done' : ''}`;
      toggleBtn.title = 'Развернуть связанные тесты и письменные ДЗ';
      toggleBtn.innerHTML = `
        <div class="accordion-toggle-left">
          <span class="accordion-arrow">▸</span>
          <span class="accordion-label">Задания (${compDoneCount}/${totalCompCount})</span>
        </div>
        <div class="accordion-chips">
          ${attachedCompanions.map(c => `
            <span class="mini-chip ${c.category}">${c.category === 'test' ? 'Тест' : 'ДЗ'}</span>
          `).join('')}
        </div>
      `;

      const checklistEl = document.createElement('div');
      checklistEl.className = 'accordion-checklist';
      checklistEl.style.display = 'none';

      attachedCompanions.forEach(comp => {
        const row = document.createElement('div');
        row.className = `checklist-row ${comp.completed ? 'completed' : ''}`;
        row.innerHTML = `
          <label class="checklist-label">
            <input type="checkbox" class="checklist-check" ${comp.completed ? 'checked' : ''}>
            <span class="mini-tag ${comp.category}">${comp.category === 'test' ? 'ТЕСТ' : 'ДЗ'}</span>
            <span class="checklist-task-title">${escapeHtml(comp.title)}</span>
          </label>
          <button class="checklist-del-btn" title="Удалить это задание">✕</button>
        `;

        const chk = row.querySelector('.checklist-check');
        chk.addEventListener('click', (e) => e.stopPropagation());
        chk.addEventListener('change', (e) => {
          e.stopPropagation();
          comp.completed = chk.checked;
          row.classList.toggle('completed', comp.completed);
          saveState();
          updateProgress();
          const newDone = attachedCompanions.filter(c => c.completed).length;
          const labelEl = toggleBtn.querySelector('.accordion-label');
          if (labelEl) labelEl.textContent = `Задания (${newDone}/${totalCompCount})`;
          toggleBtn.classList.toggle('all-done', newDone === totalCompCount);

          if (window.SyncEngine) {
            window.SyncEngine.broadcastToggle({
              itemId: comp.id,
              completed: comp.completed,
              isCompanion: true,
              parentId: item.id,
              dateKey: dateKey,
              isBacklog: isBacklog
            });
          }
        });

        row.querySelector('.checklist-del-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Удалить задание «${comp.title}»?`)) {
            if (isBacklog) {
              const cIdx = state.backlog.indexOf(comp);
              if (cIdx !== -1) state.backlog.splice(cIdx, 1);
            } else {
              const p = findPeriodByDate(dateKey);
              if (p && p.days[dateKey]) {
                const cIdx = p.days[dateKey].items.indexOf(comp);
                if (cIdx !== -1) p.days[dateKey].items.splice(cIdx, 1);
              }
            }
            saveState();
            renderCalendar();
            renderBacklog();
            if (window.SyncEngine) {
              window.SyncEngine.broadcastDelete({
                itemId: comp.id,
                dateKey: dateKey,
                isBacklog: isBacklog
              });
            }
          }
        });

        checklistEl.appendChild(row);
      });

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = checklistEl.style.display !== 'none';
        checklistEl.style.display = isOpen ? 'none' : 'flex';
        toggleBtn.classList.toggle('expanded', !isOpen);
        const arrow = toggleBtn.querySelector('.accordion-arrow');
        if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
        if (window.GoodNotesStylus) {
          setTimeout(() => window.GoodNotesStylus.resizeAndLoad(), 50);
        }
      });

      accordionEl.appendChild(toggleBtn);
      accordionEl.appendChild(checklistEl);
      card.appendChild(accordionEl);
    }

    // Настройка Drag-and-Drop для мыши и для планшетов (тач/стилус)
    setupCardDragEvents(card, item, dateKey, index, isBacklog, attachedCompanions);
    setupCardTouchEvents(card, item, dateKey, index, isBacklog, attachedCompanions);

    return card;
  }

  // ==========================================================================
  // ЧИСТЫЙ МЕХАНИЗМ DRAG-AND-DROP («НИЧЕГО ЗА СОБОЙ НЕ ОСТАВЛЯЮТ»)
  // ==========================================================================

  function setupCardDragEvents(card, item, dateKey, index, isBacklog, attachedCompanions = []) {
    card.addEventListener('dragstart', (e) => {
      dragData = {
        itemId: item.id,
        companionIds: (attachedCompanions || []).map(c => c.id),
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
  function setupCardTouchEvents(card, item, dateKey, index, isBacklog, attachedCompanions = []) {
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
        companionIds: (attachedCompanions || []).map(c => c.id),
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
      if (e.target.closest('.card-controls, .card-check, .card-btn, .card-accordion, .accordion-toggle, .checklist-row, .checklist-check, .checklist-del-btn, .checklist-label')) {
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

      // При нажатии на тело карточки — минимальная задержка 100 мс, чтобы не мешать быстрому скроллу
      holdTimer = setTimeout(() => {
        startTouchDrag(touch);
      }, 100);
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
    return 999999; // в самый конец списка (Math.min с targetArray.length гарантирует корректную вставку)
  }

  // АТОМАРНЫЙ ПЕРЕНОС БЛОКА
  function moveItem(source, target, isRemote = false) {
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

    // 2. Находим основной элемент и его связанные компаньоны
    let movedItems = [];
    let originalIndices = [];
    if (sourceArray) {
      const pIdx = source.itemId ? sourceArray.findIndex(it => it.id === source.itemId) : -1;
      if (pIdx !== -1) {
        originalIndices.push(pIdx);
        movedItems.push(sourceArray.splice(pIdx, 1)[0]);
      } else if (!source.itemId && source.sourceIndex >= 0 && source.sourceIndex < sourceArray.length) {
        originalIndices.push(source.sourceIndex);
        movedItems.push(sourceArray.splice(source.sourceIndex, 1)[0]);
      }
    }

    // Если в sourceArray не найден, но itemId передан — ищем глобально по всем дням и бэклогу
    if (movedItems.length === 0 && source.itemId) {
      for (const p of state.periods) {
        for (const dKey of Object.keys(p.days || {})) {
          const items = p.days[dKey].items || [];
          const idx = items.findIndex(it => it.id === source.itemId);
          if (idx !== -1) {
            sourceArray = items;
            originalIndices.push(idx);
            movedItems.push(items.splice(idx, 1)[0]);
            break;
          }
        }
        if (movedItems.length > 0) break;
      }
      if (movedItems.length === 0 && state.backlog) {
        const bIdx = state.backlog.findIndex(it => it.id === source.itemId);
        if (bIdx !== -1) {
          sourceArray = state.backlog;
          originalIndices.push(bIdx);
          movedItems.push(state.backlog.splice(bIdx, 1)[0]);
        }
      }
    }

    if (movedItems.length === 0) return;

    // Извлекаем также сопутствующие компаньоны, если перемещался родительский блок
    if (source.companionIds && source.companionIds.length > 0) {
      source.companionIds.forEach(cId => {
        const cIdx = sourceArray.findIndex(it => it.id === cId);
        if (cIdx !== -1) {
          originalIndices.push(cIdx);
          movedItems.push(sourceArray.splice(cIdx, 1)[0]);
        }
      });
    }

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
      sourceArray.push(...movedItems);
      return;
    }

    // 4. Вычисляем точный индекс вставки
    let targetIndex = target.targetIndex;
    // Если перемещение внутри одного и того же списка, компенсируем смещение от удаленных элементов
    if (sourceArray === targetArray && targetIndex < 999999) {
      const removedBeforeTarget = originalIndices.filter(idx => idx < targetIndex).length;
      targetIndex = Math.max(0, targetIndex - removedBeforeTarget);
    }

    const insertIdx = Math.min(Math.max(0, targetIndex), targetArray.length);
    targetArray.splice(insertIdx, 0, ...movedItems);

    // 5. Сохраняем состояние и перерисовываем
    saveState();
    renderCalendar();
    renderBacklog();
    updateProgress();

    if (!isRemote && window.SyncEngine) {
      window.SyncEngine.broadcastMove(source, target);
    }
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

    // Отображаем каждую задачу (включая ДЗ и тесты) как отдельный независимый блок
    state.backlog.forEach((item) => {
      const realIndex = state.backlog.indexOf(item);
      const card = createCardElement(item, null, realIndex, true);
      dropzone.appendChild(card);
    });
  }

  // ==========================================
  // УДАЛЕНИЕ И РЕДАКТИРОВАНИЕ
  // ==========================================

  function deleteItem(dateKey, index, isBacklog, itemId, isRemote = false) {
    let sourceArray = null;
    if (isBacklog) {
      sourceArray = state.backlog;
    } else if (dateKey) {
      const period = findPeriodByDate(dateKey);
      if (period && period.days[dateKey]) {
        sourceArray = period.days[dateKey].items;
      }
    }

    let deleted = null;
    if (sourceArray) {
      const pIdx = itemId ? sourceArray.findIndex(it => it.id === itemId) : index;
      if (pIdx >= 0 && pIdx < sourceArray.length) {
        deleted = sourceArray.splice(pIdx, 1)[0];
      }
    }

    // Если по dateKey не найдено, но itemId передан — ищем глобально
    if (!deleted && itemId) {
      for (const period of state.periods) {
        for (const dKey of Object.keys(period.days || {})) {
          const items = period.days[dKey].items || [];
          const idx = items.findIndex(it => it.id === itemId);
          if (idx !== -1) {
            sourceArray = items;
            deleted = items.splice(idx, 1)[0];
            break;
          }
        }
        if (deleted) break;
      }
      if (!deleted && state.backlog) {
        const bIdx = state.backlog.findIndex(it => it.id === itemId);
        if (bIdx !== -1) {
          sourceArray = state.backlog;
          deleted = state.backlog.splice(bIdx, 1)[0];
        }
      }
    }

    if (deleted && deleted.id && sourceArray) {
      // Удаляем также все привязанные сопутствующие блоки
      for (let i = sourceArray.length - 1; i >= 0; i--) {
        if (sourceArray[i].parentId === deleted.id) {
          sourceArray.splice(i, 1);
        }
      }
    }
    saveState();
    renderCalendar();
    renderBacklog();
    updateProgress();

    if (!isRemote && window.SyncEngine) {
      window.SyncEngine.broadcastDelete({ itemId, dateKey, isBacklog });
    }
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

      if (window.SyncEngine) {
        window.SyncEngine.broadcastUpdate({
          item: state.editingItem,
          dateKey: state.editingTarget ? state.editingTarget.dateKey : null,
          isBacklog: state.editingTarget ? state.editingTarget.isBacklog : false
        });
      }
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

      if (window.SyncEngine) {
        window.SyncEngine.broadcastAdd({ item: newItem, dateKey: target.dateKey, isBacklog: target.isBacklog });
      }
    }

    saveState();
    closeModal();
    renderCalendar();
    renderBacklog();
    updateProgress();
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

    // Меню настроек
    const settingsBtn = document.getElementById('settings-dropdown-btn');
    const settingsMenu = document.getElementById('settings-dropdown-menu');
    const settingsWrapper = document.getElementById('settings-dropdown-wrapper');

    const toggleSettings = (forceState) => {
      if (!settingsMenu) return;
      const isOpen = typeof forceState === 'boolean' ? forceState : !settingsMenu.classList.contains('active');
      settingsMenu.classList.toggle('active', isOpen);
      settingsBtn?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    };

    settingsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSettings();
    });

    document.addEventListener('click', (e) => {
      if (settingsWrapper && !settingsWrapper.contains(e.target)) {
        toggleSettings(false);
      }
    });

    settingsMenu?.addEventListener('click', (e) => {
      if (e.target.closest('.dropdown-item') && !e.target.closest('label')) {
        toggleSettings(false);
      }
    });

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
        toggleSettings(false);
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
          if (window.SyncEngine) {
            window.SyncEngine.broadcastFullState({
              periods: state.periods,
              backlog: state.backlog,
              currentPeriodIndex: state.currentPeriodIndex,
              drawings: window.GoodNotesStylus ? window.GoodNotesStylus.getDrawingsBackup() : {}
            });
          }
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

    const ctx = canvas.getContext('2d', { desynchronized: true, alpha: true }) || canvas.getContext('2d');
    let isDrawingMode = false;
    let isDrawing = false;
    let isPanning = false;
    let panStartY = 0;
    let panStartX = 0;
    let currentTool = 'pen'; // 'pen' | 'highlighter' | 'eraser' | 'pan'
    let currentColor = '#10b981';
    let currentSize = 3;
    let palmRejectionOnlyPen = false; // Защита от ладони: принудительно true только при явном включении!
    let lastX = 0;
    let lastY = 0;
    let lastMidX = 0;
    let lastMidY = 0;
    let hasMoved = false;
    let didDrawInStroke = false;
    let currentStrokeBeforeSnap = null;
    let activeTouches = new Map();
    let undoStack = [];
    let redoStack = [];
    const MAX_UNDO = 15;
    let saveTimeout = null;
    let resizeObserver = null;
    let isPenActive = false;
    let penInactiveTimer = null;
    let toastTimer = null;
    let currentStrokePoints = [];
    let pendingRemoteStrokes = [];
    let currentStrokeId = null;
    let lastStreamTime = 0;
    let streamedPointIndex = 0;
    let activeRemoteStrokes = new Map();

    let touchGesture = {
      startTime: 0,
      maxCount: 0,
      hasMoved: false,
      startPoints: new Map()
    };

    let vectorStrokes = [];
    let undoVectorStack = [];
    let redoVectorStack = [];
    let pressureSensitivity = true;

    function getPeriodKey() {
      const p = state.periods[state.currentPeriodIndex];
      return p ? `himbiorus_notes_${p.id}` : 'himbiorus_notes_default';
    }

    function getVectorKey() {
      const p = state.periods[state.currentPeriodIndex];
      return p ? `himbiorus_vector_strokes_${p.id}` : 'himbiorus_vector_strokes_default';
    }

    function saveVectorStrokes() {
      try {
        localStorage.setItem(getVectorKey(), JSON.stringify(vectorStrokes));
      } catch (e) {}
    }

    function loadVectorStrokes() {
      try {
        const saved = localStorage.getItem(getVectorKey());
        vectorStrokes = saved ? JSON.parse(saved) : [];
      } catch (e) {
        vectorStrokes = [];
      }
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.hypot(px - x1, py - y1);
      let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function renderSingleVectorStroke(st, targetCtx = ctx) {
      if (!st || !st.points || st.points.length === 0) return;
      const pts = st.points;
      const prevTool = currentTool;
      const prevColor = currentColor;
      const prevSize = currentSize;

      currentTool = st.tool || 'pen';
      currentColor = st.color || '#10b981';
      currentSize = st.size || 3;

      let lx = pts[0][0], ly = pts[0][1], lp = pts[0][2] || 0.5;
      let lmx = lx, lmy = ly;

      applyToolStyles(lp, targetCtx);
      targetCtx.beginPath();
      targetCtx.arc(lx, ly, (targetCtx.lineWidth || currentSize) / 2, 0, Math.PI * 2);
      targetCtx.fillStyle = targetCtx.strokeStyle;
      targetCtx.fill();

      for (let i = 1; i < pts.length; i++) {
        const x = pts[i][0], y = pts[i][1], p = pts[i][2] || 0.5;
        const mx = (lx + x) / 2;
        const my = (ly + y) / 2;
        applyToolStyles(p, targetCtx);
        targetCtx.beginPath();
        targetCtx.moveTo(lmx, lmy);
        targetCtx.quadraticCurveTo(lx, ly, mx, my);
        targetCtx.stroke();
        lmx = mx; lmy = my;
        lx = x; ly = y;
      }
      if (pts.length > 1) {
        targetCtx.beginPath();
        targetCtx.moveTo(lmx, lmy);
        targetCtx.lineTo(lx, ly);
        targetCtx.stroke();
      }

      currentTool = prevTool;
      currentColor = prevColor;
      currentSize = prevSize;
    }

    function redrawAllVectorStrokes() {
      clearCanvasOnly();
      vectorStrokes.forEach(st => {
        renderSingleVectorStroke(st, ctx);
      });
      debouncedSaveDrawing();
    }

    function checkAndEraseStrokeAt(x, y) {
      if (!vectorStrokes || vectorStrokes.length === 0) return false;
      const hitRadius = Math.max(currentSize * 3, 16);
      let erasedAny = false;
      const hitIds = new Set();

      for (let sIdx = vectorStrokes.length - 1; sIdx >= 0; sIdx--) {
        const st = vectorStrokes[sIdx];
        if (!st.points || st.points.length === 0) continue;
        const pts = st.points;
        const threshold = hitRadius + (st.size || 2) / 2;

        let hit = false;
        if (pts.length === 1) {
          if (Math.hypot(x - pts[0][0], y - pts[0][1]) <= threshold) {
            hit = true;
          }
        } else {
          for (let i = 0; i < pts.length - 1; i++) {
            const d = distToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
            if (d <= threshold) {
              hit = true;
              break;
            }
          }
        }

        if (hit) {
          hitIds.add(st.id);
          erasedAny = true;
        }
      }

      if (erasedAny) {
        saveUndo();
        vectorStrokes = vectorStrokes.filter(s => !hitIds.has(s.id));
        saveVectorStrokes();
        redrawAllVectorStrokes();
        showGestureToast('⚡ Линия стёрта');
        if (window.SyncEngine && typeof window.SyncEngine.broadcastStrokeErase === 'function') {
          window.SyncEngine.broadcastStrokeErase({
            strokeIds: Array.from(hitIds),
            periodIndex: state.currentPeriodIndex
          });
        }
        return true;
      }
      return false;
    }

    function hexToRgba(hex, alpha) {
      hex = hex.replace('#', '');
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }
      const num = parseInt(hex, 16);
      return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
    }

    function takeSnapshot() {
      if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
      const off = document.createElement('canvas');
      off.width = canvas.width;
      off.height = canvas.height;
      const offCtx = off.getContext('2d');
      offCtx.drawImage(canvas, 0, 0);
      return off;
    }

    function restoreSnapshot(snap) {
      if (!canvas || !ctx || !snap) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(snap, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function clearRedo() {
      while (redoStack.length > 0) {
        const discarded = redoStack.pop();
        discarded.width = 0;
        discarded.height = 0;
      }
    }

    function showGestureToast(msg) {
      let toast = document.getElementById('stylus-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'stylus-toast';
        toast.className = 'stylus-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.classList.add('visible');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove('visible');
      }, 750);
    }

    function resizeCanvas(preserveContent = true) {
      if (!canvas || !wrapper) return;
      const containerEl = document.getElementById('calendar-container');
      const displayWidth = Math.max(wrapper.offsetWidth, wrapper.scrollWidth, containerEl ? containerEl.scrollWidth : 0);
      const displayHeight = Math.max(wrapper.offsetHeight, wrapper.scrollHeight, containerEl ? containerEl.scrollHeight : 0);
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
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        tempCanvas.width = 0;
        tempCanvas.height = 0;
      } else {
        loadDrawing();
      }
    }

    function saveDrawing(immediate = false) {
      if (!canvas || isDrawing) return;
      const doSave = () => {
        if (isDrawing) return;
        try {
          const key = getPeriodKey();
          const dataUrl = canvas.toDataURL('image/png');
          localStorage.setItem(key, dataUrl);
        } catch (e) {
          console.warn('Не удалось сохранить рисунок стилуса:', e);
        }
      };

      if (immediate) {
        doSave();
      } else if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(doSave, { timeout: 3000 });
      } else {
        setTimeout(doSave, 50);
      }
    }

    function debouncedSaveDrawing() {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (!isDrawing) {
          saveDrawing(false);
        }
      }, 2000);
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
      loadVectorStrokes();
      clearCanvasOnly();
      clearRedo();
      while (undoStack.length > 0) {
        const d = undoStack.pop();
        d.width = 0;
        d.height = 0;
      }
      undoVectorStack = [];
      redoVectorStack = [];

      if (vectorStrokes.length > 0) {
        redrawAllVectorStrokes();
      } else if (saved) {
        const img = new Image();
        img.onload = () => {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(img, 0, 0);
          const dpr = window.devicePixelRatio || 1;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        img.src = saved;
      }
    }

    function saveUndo() {
      const snap = takeSnapshot();
      if (snap) {
        if (undoStack.length >= MAX_UNDO) {
          const discarded = undoStack.shift();
          discarded.width = 0;
          discarded.height = 0;
        }
        undoStack.push(snap);
        undoVectorStack.push(JSON.parse(JSON.stringify(vectorStrokes)));
        if (undoVectorStack.length > MAX_UNDO) undoVectorStack.shift();
        clearRedo();
      }
    }

    function undo(isRemote = false) {
      if (undoStack.length === 0) return;
      const currentSnap = takeSnapshot();
      const prev = undoStack.pop();
      if (currentSnap) {
        if (redoStack.length >= MAX_UNDO) {
          const discarded = redoStack.shift();
          discarded.width = 0;
          discarded.height = 0;
        }
        redoStack.push(currentSnap);
        redoVectorStack.push(JSON.parse(JSON.stringify(vectorStrokes)));
      }
      if (undoVectorStack.length > 0) {
        vectorStrokes = undoVectorStack.pop();
        saveVectorStrokes();
      }
      restoreSnapshot(prev);
      debouncedSaveDrawing();
      showGestureToast('↩️ Отмена');

      if (!isRemote && window.SyncEngine) {
        window.SyncEngine.broadcastUndo({ periodIndex: state.currentPeriodIndex });
      }
    }

    function redo() {
      if (redoStack.length === 0) return;
      const currentSnap = takeSnapshot();
      const next = redoStack.pop();
      if (currentSnap) {
        if (undoStack.length >= MAX_UNDO) {
          const discarded = undoStack.shift();
          discarded.width = 0;
          discarded.height = 0;
        }
        undoStack.push(currentSnap);
        undoVectorStack.push(JSON.parse(JSON.stringify(vectorStrokes)));
      }
      if (redoVectorStack.length > 0) {
        vectorStrokes = redoVectorStack.pop();
        saveVectorStrokes();
      }
      restoreSnapshot(next);
      debouncedSaveDrawing();
      showGestureToast('↪️ Повтор');
    }

    function updateToolCursor() {
      if (!canvas) return;
      canvas.classList.toggle('pan-active', currentTool === 'pan');
      canvas.classList.toggle('stroke-eraser-active', currentTool === 'stroke-eraser');
    }

    function setDrawingMode(active) {
      isDrawingMode = active;
      canvas.classList.toggle('drawing-active', active);
      wrapper.classList.toggle('drawing-mode', active);
      canvas.style.touchAction = active ? 'none' : '';
      wrapper.style.touchAction = active ? 'none' : '';
      updateToolCursor();
      if (toolbar) toolbar.style.display = active ? 'block' : 'none';
      if (drawToggleBtn) drawToggleBtn.classList.toggle('active', active);
      if (mobDrawBtn) mobDrawBtn.classList.toggle('active', active);

      if (active) {
        resizeCanvas(true);
        updateCachedCoords();
        if (toolbar) {
          toolbar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else {
        saveDrawing(true);
      }
    }

    function toggleDrawingMode() {
      setDrawingMode(!isDrawingMode);
    }

    function applyToolStyles(pressure = 0.5, targetCtx = ctx) {
      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';

      let width = currentSize;
      if (pressureSensitivity && pressure !== undefined && pressure > 0) {
        // Динамическая чувствительность Apple Pencil / S-Pen к нажиму (0.3x - 2.2x)
        const pNorm = Math.max(0.05, Math.min(1.0, pressure));
        width = currentSize * (0.28 + 1.84 * pNorm);
      } else if (pressure && pressure > 0) {
        width = currentSize * (0.6 + 0.8 * pressure);
      }

      const isDark = document.body.classList.contains('dark-mode');

      if (currentTool === 'pen') {
        targetCtx.globalCompositeOperation = 'source-over';
        targetCtx.strokeStyle = currentColor;
        targetCtx.lineWidth = width;
      } else if (currentTool === 'highlighter') {
        targetCtx.globalCompositeOperation = isDark ? 'screen' : 'multiply';
        targetCtx.strokeStyle = currentColor.startsWith('rgba') ? currentColor : hexToRgba(currentColor, isDark ? 0.65 : 0.45);
        targetCtx.lineWidth = Math.max(width * 3.5, 18);
      } else if (currentTool === 'eraser' || currentTool === 'stroke-eraser') {
        targetCtx.globalCompositeOperation = 'destination-out';
        targetCtx.lineWidth = Math.max(width * 5, 24);
      }
    }

    let cachedRect = null;
    let cachedScaleX = 1;
    let cachedScaleY = 1;

    function updateCachedCoords() {
      if (!canvas) return;
      cachedRect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cachedScaleX = (canvas.width / dpr) / (cachedRect.width || 1);
      cachedScaleY = (canvas.height / dpr) / (cachedRect.height || 1);
    }

    function getCanvasCoords(e) {
      if (!cachedRect) updateCachedCoords();
      return {
        x: (e.clientX - cachedRect.left) * cachedScaleX,
        y: (e.clientY - cachedRect.top) * cachedScaleY
      };
    }

    window.addEventListener('scroll', () => { cachedRect = null; }, { passive: true });
    window.addEventListener('resize', () => { cachedRect = null; }, { passive: true });

    // Touch event listeners для Palm Rejection и мультитач-жестов GoodNotes
    const resetTouchGesture = () => {
      touchGesture.maxCount = 0;
      touchGesture.hasMoved = false;
      touchGesture.startPoints.clear();
    };

    canvas.addEventListener('touchstart', (e) => {
      if (!isDrawingMode) return;
      if (isPenActive) {
        // Касания рукой при активном пере полностью блокируются
        e.preventDefault();
        return;
      }

      const now = Date.now();
      if (e.touches.length === 1) {
        touchGesture.startTime = now;
        touchGesture.maxCount = 1;
        touchGesture.hasMoved = false;
        touchGesture.startPoints.clear();
      } else {
        touchGesture.maxCount = Math.max(touchGesture.maxCount, e.touches.length);
      }

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (!touchGesture.startPoints.has(t.identifier)) {
          touchGesture.startPoints.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
      }

      if (e.touches.length >= 2 || (palmRejectionOnlyPen && currentTool !== 'pan')) {
        e.preventDefault();
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (!isDrawingMode) return;
      if (isPenActive) {
        e.preventDefault();
        return;
      }

      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        const init = touchGesture.startPoints.get(t.identifier);
        if (init) {
          if (Math.hypot(t.clientX - init.x, t.clientY - init.y) > 12) {
            touchGesture.hasMoved = true;
          }
        }
      }

      if (e.touches.length >= 2 || (palmRejectionOnlyPen && currentTool !== 'pan')) {
        e.preventDefault();
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      if (!isDrawingMode) return;
      if (isPenActive) {
        e.preventDefault();
        return;
      }

      // Определение тапов 2 и 3 пальцами (GoodNotes / Procreate)
      if (e.touches.length === 0) {
        const duration = Date.now() - touchGesture.startTime;
        if (!touchGesture.hasMoved && duration < 400) {
          if (touchGesture.maxCount === 2) {
            e.preventDefault();
            undo();
          } else if (touchGesture.maxCount === 3) {
            e.preventDefault();
            redo();
          }
        }
        resetTouchGesture();
      }
    }, { passive: false });

    canvas.addEventListener('touchcancel', resetTouchGesture);

    // Pointer Events на холсте с аппаратной десинхронизацией
    canvas.addEventListener('pointerdown', (e) => {
      if (!isDrawingMode) return;
      updateCachedCoords();

      if (e.pointerType === 'pen') {
        isPenActive = true;
        if (penInactiveTimer) clearTimeout(penInactiveTimer);
      }

      if (e.pointerType === 'touch') {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (isPenActive || (palmRejectionOnlyPen && currentTool !== 'pan')) {
          e.preventDefault();
          return;
        }
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

      // Жесткий Palm Rejection: при включенной защите касания рукой не рисуют
      if (palmRejectionOnlyPen && e.pointerType === 'touch') {
        e.preventDefault();
        return;
      }

      if (currentTool === 'stroke-eraser') {
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch(err) {}
        const coords = getCanvasCoords(e);
        isDrawing = true;
        hasMoved = false;
        checkAndEraseStrokeAt(coords.x, coords.y);
        return;
      }

      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch(err) {}

      // Фиксация слепка холста в памяти (GPU-to-GPU drawImage <0.1 мс, без зависаний toDataURL)
      currentStrokeBeforeSnap = takeSnapshot();
      isDrawing = true;
      hasMoved = false;
      didDrawInStroke = false;

      const coords = getCanvasCoords(e);
      const x = coords.x;
      const y = coords.y;
      const p = e.pressure || 0.5;

      lastX = x;
      lastY = y;
      lastMidX = x;
      lastMidY = y;
      currentStrokePoints = [[Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(p * 100) / 100]];

      applyToolStyles(p);
      ctx.beginPath();
      ctx.arc(x, y, (ctx.lineWidth || currentSize) / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      didDrawInStroke = true;

      // Мгновенная инициация потокового вещания штриха (0 мс задержки между устройствами)
      currentStrokeId = 'strk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      streamedPointIndex = 0;
      if (window.SyncEngine && typeof window.SyncEngine.broadcastStrokeChunk === 'function') {
        window.SyncEngine.broadcastStrokeChunk({
          strokeId: currentStrokeId,
          periodIndex: state.currentPeriodIndex,
          tool: currentTool,
          color: currentColor,
          size: currentSize,
          points: currentStrokePoints.slice()
        });
        streamedPointIndex = currentStrokePoints.length;
        lastStreamTime = Date.now();
      }
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
      if (palmRejectionOnlyPen && e.pointerType === 'touch') {
        e.preventDefault();
        return;
      }

      e.preventDefault();

      if (currentTool === 'stroke-eraser') {
        const coalesced = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : null;
        const events = (coalesced && coalesced.length > 0) ? coalesced : [e];
        for (let i = 0; i < events.length; i++) {
          const ev = events[i];
          const coords = getCanvasCoords(ev);
          checkAndEraseStrokeAt(coords.x, coords.y);
        }
        return;
      }

      // Zero-latency рендеринг через getCoalescedEvents для 120/240Hz стилусов
      const coalesced = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : null;
      const events = (coalesced && coalesced.length > 0) ? coalesced : [e];
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const coords = getCanvasCoords(ev);
        const x = coords.x;
        const y = coords.y;
        const p = ev.pressure || 0.5;

        hasMoved = true;
        didDrawInStroke = true;
        currentStrokePoints.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(p * 100) / 100]);
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
      }

      // Потоковая трансляция точек во время ведения стилуса (каждые ~40мс или 5 точек)
      if (currentStrokeId && window.SyncEngine && typeof window.SyncEngine.broadcastStrokeChunk === 'function') {
        const now = Date.now();
        if (now - lastStreamTime >= 40 || (currentStrokePoints.length - streamedPointIndex) >= 5) {
          const chunk = currentStrokePoints.slice(streamedPointIndex);
          if (chunk.length > 0) {
            window.SyncEngine.broadcastStrokeChunk({
              strokeId: currentStrokeId,
              periodIndex: state.currentPeriodIndex,
              tool: currentTool,
              color: currentColor,
              size: currentSize,
              points: chunk
            });
            streamedPointIndex = currentStrokePoints.length;
            lastStreamTime = now;
          }
        }
      }
    });

    const finishStroke = (e) => {
      if (e.pointerType === 'pen') {
        if (penInactiveTimer) clearTimeout(penInactiveTimer);
        penInactiveTimer = setTimeout(() => {
          isPenActive = false;
        }, 180);
      }

      if (e.pointerType === 'touch') {
        activeTouches.delete(e.pointerId);
      }
      if (isPanning) {
        isPanning = false;
      }

      if (currentTool === 'stroke-eraser') {
        isDrawing = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch(err) {}
        return;
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

      if (didDrawInStroke && currentStrokeBeforeSnap) {
        if (undoStack.length >= MAX_UNDO) {
          const discarded = undoStack.shift();
          discarded.width = 0;
          discarded.height = 0;
        }
        undoStack.push(currentStrokeBeforeSnap);
        clearRedo();
        currentStrokeBeforeSnap = null;
      } else if (currentStrokeBeforeSnap) {
        currentStrokeBeforeSnap.width = 0;
        currentStrokeBeforeSnap.height = 0;
        currentStrokeBeforeSnap = null;
      }

      if (didDrawInStroke && currentStrokePoints.length > 0) {
        if (currentTool === 'pen' || currentTool === 'highlighter') {
          const finishedStroke = {
            id: currentStrokeId || ('strk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)),
            tool: currentTool,
            color: currentColor,
            size: currentSize,
            points: currentStrokePoints.slice()
          };
          vectorStrokes.push(finishedStroke);
          saveVectorStrokes();
        }
      }

      if (didDrawInStroke && currentStrokePoints.length > 0 && window.SyncEngine) {
        if (typeof window.SyncEngine.broadcastStrokeEnd === 'function' && currentStrokeId) {
          const remainingChunk = currentStrokePoints.slice(streamedPointIndex);
          window.SyncEngine.broadcastStrokeEnd({
            strokeId: currentStrokeId,
            periodIndex: state.currentPeriodIndex,
            points: remainingChunk
          });
        }
        const strokePayload = {
          periodIndex: state.currentPeriodIndex,
          stroke: {
            tool: currentTool,
            color: currentColor,
            size: currentSize,
            points: currentStrokePoints,
            strokeId: currentStrokeId
          }
        };
        setTimeout(() => {
          if (window.SyncEngine) {
            window.SyncEngine.broadcastStroke(strokePayload);
          }
        }, 0);
      }
      currentStrokeId = null;
      streamedPointIndex = 0;

      try { canvas.releasePointerCapture(e.pointerId); } catch(err) {}
      debouncedSaveDrawing();

      if (pendingRemoteStrokes.length > 0) {
        const queue = pendingRemoteStrokes.slice();
        pendingRemoteStrokes = [];
        queue.forEach(item => {
          if (item.action === 'undo') {
            undo(true);
          } else if (item.action === 'clear') {
            saveUndo();
            clearCanvasOnly();
            localStorage.removeItem(getPeriodKey());
          } else if (item.action === 'chunk') {
            drawRemoteStrokeChunk(item.data);
          } else if (item.action === 'stroke_end') {
            finishRemoteStroke(item.data);
          } else if (item.stroke) {
            drawRemoteStroke(item.stroke, item.periodIndex);
          }
        });
      }
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

    // Выбор толщины и ползунок
    const sizeSlider = document.getElementById('stylus-size-slider');
    const sizeValEl = document.getElementById('stylus-size-val');

    document.querySelectorAll('.stroke-sizes .size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.stroke-sizes .size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSize = parseInt(btn.getAttribute('data-size') || '3', 10);
        if (sizeSlider) sizeSlider.value = currentSize;
        if (sizeValEl) sizeValEl.textContent = currentSize + 'px';
      });
    });

    sizeSlider?.addEventListener('input', (e) => {
      currentSize = parseInt(e.target.value, 10);
      if (sizeValEl) sizeValEl.textContent = currentSize + 'px';
      document.querySelectorAll('.stroke-sizes .size-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.getAttribute('data-size') || '0', 10) === currentSize);
      });
    });

    // Регулировка степени нажатия пера
    const pressureBtn = document.getElementById('stylus-pressure-btn');
    const pressureText = document.getElementById('pressure-status-text');
    pressureBtn?.addEventListener('click', () => {
      pressureSensitivity = !pressureSensitivity;
      pressureBtn.classList.toggle('active', pressureSensitivity);
      if (pressureText) pressureText.textContent = pressureSensitivity ? 'Вкл' : 'Выкл';
      showGestureToast(pressureSensitivity ? '✍️ Нажим пера: Включен' : '✍️ Нажим пера: Выключен');
    });

    // Undo & Redo & Clear
    document.getElementById('stylus-undo-btn')?.addEventListener('click', () => undo(false));
    document.getElementById('stylus-redo-btn')?.addEventListener('click', redo);
    document.getElementById('stylus-clear-btn')?.addEventListener('click', () => {
      if (confirm('Очистить рукописные заметки для этого периода?')) {
        saveUndo();
        clearCanvasOnly();
        vectorStrokes = [];
        saveVectorStrokes();
        localStorage.removeItem(getPeriodKey());
        localStorage.removeItem(getVectorKey());
        if (window.SyncEngine) {
          window.SyncEngine.broadcastClear({ periodIndex: state.currentPeriodIndex });
        }
      }
    });

    // Отрисовка векторных штрихов с других устройств
    function drawRemoteStrokeChunk(data) {
      if (!data || !data.points || data.points.length === 0) return;
      if (isDrawing) {
        pendingRemoteStrokes.push({ action: 'chunk', data });
        return;
      }
      if (data.periodIndex !== state.currentPeriodIndex) return;

      let st = activeRemoteStrokes.get(data.strokeId);
      if (!st) {
        saveUndo();
        st = {
          tool: data.tool || 'pen',
          color: data.color || '#10b981',
          size: data.size || 3,
          lastX: 0,
          lastY: 0,
          lastMidX: 0,
          lastMidY: 0,
          hasDrawnStart: false
        };
        activeRemoteStrokes.set(data.strokeId, st);
      }

      const prevTool = currentTool;
      const prevColor = currentColor;
      const prevSize = currentSize;

      currentTool = st.tool;
      currentColor = st.color;
      currentSize = st.size;

      const pts = data.points;
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const x = pt[0], y = pt[1], p = pt[2] || 0.5;
        applyToolStyles(p);

        if (!st.hasDrawnStart) {
          ctx.beginPath();
          ctx.arc(x, y, (ctx.lineWidth || currentSize) / 2, 0, Math.PI * 2);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
          st.lastX = x;
          st.lastY = y;
          st.lastMidX = x;
          st.lastMidY = y;
          st.hasDrawnStart = true;
        } else {
          const midX = (st.lastX + x) / 2;
          const midY = (st.lastY + y) / 2;
          ctx.beginPath();
          ctx.moveTo(st.lastMidX, st.lastMidY);
          ctx.quadraticCurveTo(st.lastX, st.lastY, midX, midY);
          ctx.stroke();
          st.lastMidX = midX;
          st.lastMidY = midY;
          st.lastX = x;
          st.lastY = y;
        }
      }

      currentTool = prevTool;
      currentColor = prevColor;
      currentSize = prevSize;
    }

    function finishRemoteStroke(data) {
      if (!data) return;
      if (data.points && data.points.length > 0) {
        drawRemoteStrokeChunk(data);
      }
      const st = activeRemoteStrokes.get(data.strokeId);
      if (st && st.hasDrawnStart) {
        const prevTool = currentTool;
        const prevColor = currentColor;
        const prevSize = currentSize;
        currentTool = st.tool;
        currentColor = st.color;
        currentSize = st.size;
        applyToolStyles(0.5);
        ctx.beginPath();
        ctx.moveTo(st.lastMidX, st.lastMidY);
        ctx.lineTo(st.lastX, st.lastY);
        ctx.stroke();
        currentTool = prevTool;
        currentColor = prevColor;
        currentSize = prevSize;
      }
      activeRemoteStrokes.delete(data.strokeId);
      debouncedSaveDrawing();
    }

    function drawRemoteStroke(stroke, periodIndex) {
      if (!stroke || !stroke.points || stroke.points.length === 0) return;
      if (stroke.strokeId && activeRemoteStrokes.has(stroke.strokeId)) {
        activeRemoteStrokes.delete(stroke.strokeId);
        debouncedSaveDrawing();
        return;
      }
      if (isDrawing) {
        pendingRemoteStrokes.push({ stroke, periodIndex });
        return;
      }

      if (periodIndex === state.currentPeriodIndex) {
        saveUndo();

        const prevTool = currentTool;
        const prevColor = currentColor;
        const prevSize = currentSize;

        currentTool = stroke.tool || 'pen';
        currentColor = stroke.color || '#10b981';
        currentSize = stroke.size || 3;

        const pts = stroke.points;
        const p0 = pts[0];
        applyToolStyles(p0[2] || 0.5);

        ctx.beginPath();
        ctx.arc(p0[0], p0[1], (ctx.lineWidth || currentSize) / 2, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();

        if (pts.length > 1) {
          let lx = p0[0], ly = p0[1];
          let lmx = lx, lmy = ly;
          for (let i = 1; i < pts.length; i++) {
            const pt = pts[i];
            const x = pt[0], y = pt[1], p = pt[2] || 0.5;
            const mx = (lx + x) / 2;
            const my = (ly + y) / 2;

            applyToolStyles(p);
            ctx.beginPath();
            ctx.moveTo(lmx, lmy);
            ctx.quadraticCurveTo(lx, ly, mx, my);
            ctx.stroke();

            lmx = mx;
            lmy = my;
            lx = x;
            ly = y;
          }
          ctx.beginPath();
          ctx.moveTo(lmx, lmy);
          ctx.lineTo(lx, ly);
          ctx.stroke();
        }

        currentTool = prevTool;
        currentColor = prevColor;
        currentSize = prevSize;

        if (!vectorStrokes.some(s => s.id === stroke.strokeId)) {
          vectorStrokes.push(stroke);
          saveVectorStrokes();
        }

        debouncedSaveDrawing();
      } else {
        updateOffscreenPeriodDrawing(periodIndex, stroke);
      }
    }

    function updateOffscreenPeriodDrawing(periodIndex, stroke) {
      const p = state.periods[periodIndex];
      if (!p) return;
      const key = `himbiorus_notes_${p.id}`;
      const saved = localStorage.getItem(key);
      const off = document.createElement('canvas');
      off.width = canvas ? canvas.width : 1200;
      off.height = canvas ? canvas.height : 800;
      const offCtx = off.getContext('2d');
      const dpr = window.devicePixelRatio || 1;

      const renderStroke = () => {
        offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        offCtx.lineCap = 'round';
        offCtx.lineJoin = 'round';
        const isDark = document.body.classList.contains('dark-mode');
        if (stroke.tool === 'pen') {
          offCtx.globalCompositeOperation = 'source-over';
          offCtx.strokeStyle = stroke.color || '#10b981';
          offCtx.lineWidth = stroke.size || 3;
        } else if (stroke.tool === 'highlighter') {
          offCtx.globalCompositeOperation = isDark ? 'screen' : 'multiply';
          offCtx.strokeStyle = stroke.color;
          offCtx.lineWidth = Math.max((stroke.size || 3) * 3.5, 18);
        } else if (stroke.tool === 'eraser') {
          offCtx.globalCompositeOperation = 'destination-out';
          offCtx.lineWidth = Math.max((stroke.size || 3) * 5, 24);
        }

        const pts = stroke.points;
        const p0 = pts[0];
        offCtx.beginPath();
        offCtx.arc(p0[0], p0[1], (offCtx.lineWidth || 3) / 2, 0, Math.PI * 2);
        offCtx.fillStyle = offCtx.strokeStyle;
        offCtx.fill();

        if (pts.length > 1) {
          let lx = p0[0], ly = p0[1];
          let lmx = lx, lmy = ly;
          for (let i = 1; i < pts.length; i++) {
            const pt = pts[i];
            const x = pt[0], y = pt[1];
            const mx = (lx + x) / 2;
            const my = (ly + y) / 2;
            offCtx.beginPath();
            offCtx.moveTo(lmx, lmy);
            offCtx.quadraticCurveTo(lx, ly, mx, my);
            offCtx.stroke();
            lmx = mx; lmy = my; lx = x; ly = y;
          }
          offCtx.beginPath();
          offCtx.moveTo(lmx, lmy);
          offCtx.lineTo(lx, ly);
          offCtx.stroke();
        }
        const commitSave = () => {
          try {
            localStorage.setItem(key, off.toDataURL('image/png'));
          } catch (e) {}
          off.width = 0;
          off.height = 0;
        };
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(commitSave, { timeout: 3000 });
        } else {
          setTimeout(commitSave, 50);
        }
      };

      if (saved) {
        const img = new Image();
        img.onload = () => {
          offCtx.drawImage(img, 0, 0);
          renderStroke();
        };
        img.src = saved;
      } else {
        renderStroke();
      }
    }

    // Горячие клавиши для отмены и повтора (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
    window.addEventListener('keydown', (e) => {
      if (isDrawingMode) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
          e.preventDefault();
          redo();
        }
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

    // Экспорт API стилуса для вызова при переключении страниц и синхронизации
    stylusModule = {
      saveDrawing,
      loadDrawing,
      resizeAndLoad: () => {
        resizeCanvas(false);
        loadDrawing();
      },
      setDrawingMode,
      toggleDrawingMode,
      drawRemoteStroke,
      drawRemoteStrokeChunk,
      finishRemoteStroke,
      remoteUndo: (periodIndex) => {
        if (periodIndex === state.currentPeriodIndex) {
          if (isDrawing) {
            pendingRemoteStrokes.push({ action: 'undo', periodIndex });
          } else {
            undo(true);
          }
        }
      },
      remoteClear: (periodIndex) => {
        if (periodIndex === state.currentPeriodIndex) {
          if (isDrawing) {
            pendingRemoteStrokes.push({ action: 'clear', periodIndex });
          } else {
            saveUndo();
            clearCanvasOnly();
            vectorStrokes = [];
            saveVectorStrokes();
            localStorage.removeItem(getPeriodKey());
            localStorage.removeItem(getVectorKey());
          }
        } else {
          const p = state.periods[periodIndex];
          if (p) {
            localStorage.removeItem(`himbiorus_notes_${p.id}`);
            localStorage.removeItem(`himbiorus_vector_strokes_${p.id}`);
          }
        }
      },
      remoteEraseStrokes: (strokeIds) => {
        if (!Array.isArray(strokeIds) || strokeIds.length === 0) return;
        const set = new Set(strokeIds);
        vectorStrokes = vectorStrokes.filter(s => !set.has(s.id));
        saveVectorStrokes();
        redrawAllVectorStrokes();
      },
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
      },
      getVectorStrokesBackup: () => {
        const backup = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('himbiorus_vector_strokes_')) {
            backup[key] = localStorage.getItem(key);
          }
        }
        return backup;
      },
      restoreVectorStrokesBackup: (backup) => {
        if (!backup) return;
        Object.entries(backup).forEach(([k, v]) => {
          if (k.startsWith('himbiorus_vector_strokes_') && v) {
            localStorage.setItem(k, v);
          }
        });
        loadVectorStrokes();
        redrawAllVectorStrokes();
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
  // РЕЖИМ ОТОБРАЖЕНИЯ НЕДЕЛИ (КОЛОНКИ КАК НА ПК / СПИСОК)
  // ==========================================================================
  let weekViewMode = localStorage.getItem('himbiorus_week_view') || 'columns';

  function initWeekViewMode() {
    applyWeekViewMode(weekViewMode);
    document.getElementById('week-view-toggle-btn')?.addEventListener('click', toggleWeekViewMode);
  }

  function toggleWeekViewMode() {
    const next = weekViewMode === 'columns' ? 'list' : 'columns';
    applyWeekViewMode(next);
    showGestureToast(next === 'columns' ? '📊 Вид недели: Колонки (как на ПК)' : '📋 Вид недели: Список');
  }

  function applyWeekViewMode(mode) {
    weekViewMode = mode || 'columns';
    localStorage.setItem('himbiorus_week_view', weekViewMode);
    const wrapper = document.getElementById('calendar-wrapper');
    if (wrapper) {
      wrapper.classList.toggle('view-list', weekViewMode === 'list');
    }
    const dropBtn = document.getElementById('week-view-toggle-btn');
    if (dropBtn) {
      dropBtn.textContent = weekViewMode === 'columns' ? '📊 Вид недели: Колонки (ПК)' : '📋 Вид недели: Список';
    }
    const mobBtn = document.getElementById('mob-view-toggle-btn');
    if (mobBtn) {
      mobBtn.textContent = weekViewMode === 'columns' ? '📊 Колонки' : '📋 Список';
    }
    if (window.GoodNotesStylus) {
      setTimeout(() => window.GoodNotesStylus.resizeAndLoad(), 60);
    }
  }

  // ==========================================================================
  // МОДУЛЬ ИНТЕРАКТИВНЫХ ФОТОГРАФИЙ (ВСТАВКА, МАСШТАБИРОВАНИЕ, РАСТЯЖЕНИЕ, СИНХРОНИЗАЦИЯ)
  // ==========================================================================
  let placedImages = {}; // periodId -> array of images

  function getImagesKey(periodId) {
    return `himbiorus_images_${periodId || (state.periods[state.currentPeriodIndex]?.id || 'default')}`;
  }

  function loadPlacedImagesForPeriod(periodId) {
    const pId = periodId || (state.periods[state.currentPeriodIndex]?.id || 'default');
    try {
      const raw = localStorage.getItem(getImagesKey(pId));
      placedImages[pId] = raw ? JSON.parse(raw) : [];
    } catch (e) {
      placedImages[pId] = [];
    }
    renderPlacedImages(pId);
  }

  function savePlacedImagesForPeriod(periodId) {
    const pId = periodId || (state.periods[state.currentPeriodIndex]?.id || 'default');
    try {
      localStorage.setItem(getImagesKey(pId), JSON.stringify(placedImages[pId] || []));
    } catch (e) {
      console.warn('Не удалось сохранить фото:', e);
    }
  }

  function getAllPlacedImagesBackup() {
    const backup = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('himbiorus_images_')) {
        backup[k] = localStorage.getItem(k);
      }
    }
    return backup;
  }

  function restoreAllPlacedImagesBackup(backup) {
    if (!backup) return;
    Object.entries(backup).forEach(([k, v]) => {
      if (k.startsWith('himbiorus_images_') && v) {
        localStorage.setItem(k, v);
      }
    });
    const curPid = state.periods[state.currentPeriodIndex]?.id;
    loadPlacedImagesForPeriod(curPid);
  }

  function renderPlacedImages(periodId) {
    const pId = periodId || (state.periods[state.currentPeriodIndex]?.id || 'default');
    const layer = document.getElementById('placed-images-layer');
    if (!layer) return;
    layer.innerHTML = '';

    const list = placedImages[pId] || [];
    list.forEach(imgObj => {
      const el = createPlacedImageElement(imgObj, pId);
      layer.appendChild(el);
    });
  }

  function createPlacedImageElement(imgObj, periodId) {
    const container = document.createElement('div');
    container.className = 'placed-image-item';
    container.setAttribute('data-id', imgObj.id);
    container.style.left = imgObj.x + 'px';
    container.style.top = imgObj.y + 'px';
    container.style.width = imgObj.width + 'px';
    container.style.height = imgObj.height + 'px';

    const img = document.createElement('img');
    img.src = imgObj.src;
    img.alt = 'Фото расписания';

    const delBtn = document.createElement('button');
    delBtn.className = 'placed-image-delete';
    delBtn.title = 'Удалить фото';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePlacedImage(imgObj.id, periodId);
    });

    container.appendChild(img);
    container.appendChild(delBtn);

    // 4 маркера изменения размера и свободного растяжения
    ['tl', 'tr', 'bl', 'br'].forEach(handleType => {
      const h = document.createElement('div');
      h.className = `resize-handle ${handleType}`;
      h.setAttribute('data-handle', handleType);
      setupResizeHandleEvents(h, container, imgObj, handleType, periodId);
      container.appendChild(h);
    });

    setupImageDragEvents(container, imgObj, periodId);

    return container;
  }

  function setupImageDragEvents(container, imgObj, periodId) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    container.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('resize-handle') || e.target.classList.contains('placed-image-delete')) {
        return;
      }
      e.stopPropagation();
      try { container.setPointerCapture(e.pointerId); } catch(err) {}
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = imgObj.x;
      initialTop = imgObj.y;
      document.querySelectorAll('.placed-image-item').forEach(i => i.classList.remove('selected'));
      container.classList.add('selected');
    });

    container.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      e.stopPropagation();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      imgObj.x = Math.max(0, initialLeft + dx);
      imgObj.y = Math.max(0, initialTop + dy);
      container.style.left = imgObj.x + 'px';
      container.style.top = imgObj.y + 'px';
    });

    const finishDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try { container.releasePointerCapture(e.pointerId); } catch(err) {}
      savePlacedImagesForPeriod(periodId);
      if (window.SyncEngine && typeof window.SyncEngine.broadcastImageUpdate === 'function') {
        window.SyncEngine.broadcastImageUpdate({
          periodId: periodId,
          image: { id: imgObj.id, x: imgObj.x, y: imgObj.y, width: imgObj.width, height: imgObj.height }
        });
      }
    };

    container.addEventListener('pointerup', finishDrag);
    container.addEventListener('pointercancel', finishDrag);
  }

  function setupResizeHandleEvents(handle, container, imgObj, handleType, periodId) {
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let initialW = 0;
    let initialH = 0;
    let initialLeft = 0;
    let initialTop = 0;

    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      try { handle.setPointerCapture(e.pointerId); } catch(err) {}
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      initialW = imgObj.width;
      initialH = imgObj.height;
      initialLeft = imgObj.x;
      initialTop = imgObj.y;
      container.classList.add('selected');
    });

    handle.addEventListener('pointermove', (e) => {
      if (!isResizing) return;
      e.stopPropagation();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (handleType === 'br') {
        imgObj.width = Math.max(60, initialW + dx);
        imgObj.height = Math.max(40, initialH + dy);
      } else if (handleType === 'bl') {
        const newW = Math.max(60, initialW - dx);
        imgObj.x = initialLeft + (initialW - newW);
        imgObj.width = newW;
        imgObj.height = Math.max(40, initialH + dy);
        container.style.left = imgObj.x + 'px';
      } else if (handleType === 'tr') {
        const newH = Math.max(40, initialH - dy);
        imgObj.y = initialTop + (initialH - newH);
        imgObj.width = Math.max(60, initialW + dx);
        imgObj.height = newH;
        container.style.top = imgObj.y + 'px';
      } else if (handleType === 'tl') {
        const newW = Math.max(60, initialW - dx);
        const newH = Math.max(40, initialH - dy);
        imgObj.x = initialLeft + (initialW - newW);
        imgObj.y = initialTop + (initialH - newH);
        imgObj.width = newW;
        imgObj.height = newH;
        container.style.left = imgObj.x + 'px';
        container.style.top = imgObj.y + 'px';
      }

      container.style.width = imgObj.width + 'px';
      container.style.height = imgObj.height + 'px';
    });

    const finishResize = (e) => {
      if (!isResizing) return;
      isResizing = false;
      try { handle.releasePointerCapture(e.pointerId); } catch(err) {}
      savePlacedImagesForPeriod(periodId);
      if (window.SyncEngine && typeof window.SyncEngine.broadcastImageUpdate === 'function') {
        window.SyncEngine.broadcastImageUpdate({
          periodId: periodId,
          image: { id: imgObj.id, x: imgObj.x, y: imgObj.y, width: imgObj.width, height: imgObj.height }
        });
      }
    };

    handle.addEventListener('pointerup', finishResize);
    handle.addEventListener('pointercancel', finishResize);
  }

  function handleImageUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        let w = img.naturalWidth || 400;
        let h = img.naturalHeight || 300;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round(h * (maxDim / w));
            w = maxDim;
          } else {
            w = Math.round(w * (maxDim / h));
            h = maxDim;
          }
        }
        const compressCanvas = document.createElement('canvas');
        compressCanvas.width = w;
        compressCanvas.height = h;
        const cCtx = compressCanvas.getContext('2d');
        cCtx.drawImage(img, 0, 0, w, h);
        const compressedDataUrl = compressCanvas.toDataURL('image/jpeg', 0.82);
        compressCanvas.width = 0;
        compressCanvas.height = 0;

        const pId = state.periods[state.currentPeriodIndex]?.id || 'default';
        const mainContent = document.querySelector('.main-content');
        const scrollLeft = mainContent ? mainContent.scrollLeft : 0;
        const scrollTop = window.scrollY || 0;

        const displayW = Math.min(260, w);
        const displayH = Math.round(displayW * (h / w));

        const newImageObj = {
          id: 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
          src: compressedDataUrl,
          x: Math.max(30, scrollLeft + 40),
          y: Math.max(30, Math.min(scrollTop + 60, 400)),
          width: displayW,
          height: displayH
        };

        if (!placedImages[pId]) placedImages[pId] = [];
        placedImages[pId].push(newImageObj);
        savePlacedImagesForPeriod(pId);
        renderPlacedImages(pId);

        showGestureToast('🖼️ Фото добавлено в расписание');

        if (window.SyncEngine && typeof window.SyncEngine.broadcastImageAdd === 'function') {
          window.SyncEngine.broadcastImageAdd({
            periodId: pId,
            image: newImageObj
          });
        }
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  }

  function deletePlacedImage(imageId, periodId) {
    const pId = periodId || (state.periods[state.currentPeriodIndex]?.id || 'default');
    if (!placedImages[pId]) return;
    placedImages[pId] = placedImages[pId].filter(im => im.id !== imageId);
    savePlacedImagesForPeriod(pId);
    renderPlacedImages(pId);
    showGestureToast('🗑️ Фото удалено');

    if (window.SyncEngine && typeof window.SyncEngine.broadcastImageDelete === 'function') {
      window.SyncEngine.broadcastImageDelete({
        periodId: pId,
        imageId: imageId
      });
    }
  }

  function setupPlacedImagesModule() {
    const curPid = state.periods[state.currentPeriodIndex]?.id;
    loadPlacedImagesForPeriod(curPid);

    const insertPhotoBtn = document.getElementById('tool-insert-photo');
    const photoFileInput = document.getElementById('stylus-photo-input');
    insertPhotoBtn?.addEventListener('click', () => {
      photoFileInput?.click();
    });
    photoFileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImageUpload(e.target.files[0]);
        photoFileInput.value = '';
      }
    });
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
    const dayChips = document.querySelectorAll('.mobile-day-selector .mob-day-chip:not(.mob-view-btn)');
    dayChips.forEach(chip => {
      chip.addEventListener('click', () => {
        dayChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const selectedDay = chip.getAttribute('data-day');
        const dayCards = document.querySelectorAll('.calendar-day-card');

        if (weekViewMode === 'columns') {
          // В режиме колонок (как на ПК) не скрываем дни, а плавно центрируем выбранный день!
          dayCards.forEach(card => {
            card.style.display = '';
          });
          if (selectedDay !== 'all') {
            for (let i = 0; i < dayCards.length; i++) {
              const card = dayCards[i];
              const nameEl = card.querySelector('.day-name');
              const dayName = (nameEl ? nameEl.textContent : '').trim().toLowerCase();
              if (dayName.startsWith(selectedDay.toLowerCase())) {
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                break;
              }
            }
          } else {
            const mainEl = document.querySelector('.main-content');
            if (mainEl) mainEl.scrollTo({ left: 0, behavior: 'smooth' });
          }
        } else {
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
        }

        if (window.GoodNotesStylus) {
          setTimeout(() => {
            window.GoodNotesStylus.resizeAndLoad();
          }, 100);
        }
      });
    });

    document.getElementById('mob-view-toggle-btn')?.addEventListener('click', toggleWeekViewMode);
  }

  // ==========================================================================
  // МОДУЛЬ СИНХРОНИЗАЦИИ УСТРОЙСТВ В РЕАЛЬНОМ ВРЕМЕНИ (SYNC ENGINE UI & HOOKS)
  // ==========================================================================
  function setupRealtimeSync() {
    if (!window.SyncEngine) return;

    const syncModal = document.getElementById('sync-modal-backdrop');
    const syncBtn = document.getElementById('sync-btn');
    const menuSyncBtn = document.getElementById('menu-sync-btn');
    const mobSyncBtn = document.getElementById('mob-sync-btn');
    const closeBtn = document.getElementById('sync-modal-close-btn');
    const doneBtn = document.getElementById('sync-modal-done-btn');
    const copyCodeBtn = document.getElementById('sync-copy-code-btn');
    const copyLinkBtn = document.getElementById('sync-copy-link-btn');
    const newRoomBtn = document.getElementById('sync-new-room-btn');
    const joinInput = document.getElementById('sync-join-input');
    const joinBtn = document.getElementById('sync-join-btn');

    const headerDot = document.getElementById('header-sync-dot');
    const peerBadge = document.getElementById('sync-peer-badge');
    const mobBadge = document.getElementById('mob-sync-badge');

    const modalDot = document.getElementById('modal-sync-dot');
    const modalTitle = document.getElementById('modal-sync-title');
    const modalSubtitle = document.getElementById('modal-sync-subtitle');
    const modalPeers = document.getElementById('modal-peers-count');
    const modalRoomCode = document.getElementById('modal-room-code');
    const modalQrContainer = document.getElementById('modal-qr-container');
    const modalLinkPreview = document.getElementById('modal-link-preview');

    const fbInput = document.getElementById('sync-firebase-input');
    const fbSaveBtn = document.getElementById('sync-firebase-save-btn');
    const fbClearBtn = document.getElementById('sync-firebase-clear-btn');
    const fbStatus = document.getElementById('sync-firebase-status');

    function updateFirebaseUI() {
      if (!window.SyncEngine) return;
      const fbUrl = window.SyncEngine.getFirebaseUrl();
      if (fbInput && document.activeElement !== fbInput) {
        fbInput.value = fbUrl || '';
      }
      if (fbStatus) {
        if (fbUrl) {
          fbStatus.textContent = '🟢 База активна';
          fbStatus.classList.add('active');
        } else {
          fbStatus.textContent = 'Не настроен (MQTT)';
          fbStatus.classList.remove('active');
        }
      }
    }

    function updateSyncUI(status, peerCount) {
      updateFirebaseUI();
      const isConnected = status === 'connected';
      const isConnecting = status === 'connecting';

      // Хедер
      if (headerDot) {
        headerDot.className = `sync-dot ${status}`;
      }
      if (peerBadge) {
        peerBadge.style.display = (isConnected && peerCount > 1) ? 'inline-block' : 'none';
        peerBadge.textContent = peerCount;
      }
      if (mobBadge) {
        mobBadge.style.display = isConnected ? 'block' : 'none';
        mobBadge.className = `badge-dot ${status}`;
      }

      // Модальное окно
      if (modalDot) {
        modalDot.className = `sync-dot-large ${status}`;
      }
      if (modalTitle) {
        if (isConnected) {
          modalTitle.textContent = peerCount > 1 ? `В сети (${peerCount} устройства)` : 'В сети (комната активна)';
        } else if (isConnecting) {
          modalTitle.textContent = 'Подключение к комнате...';
        } else {
          modalTitle.textContent = 'Офлайн (без интернета)';
        }
      }
      if (modalSubtitle) {
        modalSubtitle.textContent = isConnected ? 'Мгновенная передача карточек и стилуса' : 'Попытка установки защищенного WSS соединения';
      }
      if (modalPeers) {
        if (isConnected) {
          modalPeers.textContent = `🟢 ${peerCount} ${peerCount === 1 ? 'устройство' : (peerCount < 5 ? 'устройства' : 'устройств')}`;
        } else {
          modalPeers.textContent = '⚪ 0 устройств';
        }
      }

      const currentRoom = window.SyncEngine.getRoomId();
      if (modalRoomCode) {
        modalRoomCode.textContent = currentRoom || '---';
      }
      const roomUrl = window.SyncEngine.getRoomUrl();
      if (modalLinkPreview) {
        modalLinkPreview.textContent = roomUrl;
      }
      if (modalQrContainer && currentRoom) {
        window.SyncEngine.renderQRCode(modalQrContainer, roomUrl);
      }
    }

    function openSyncModal() {
      if (!syncModal) return;
      syncModal.classList.add('active');
      const curRoom = window.SyncEngine.getRoomId();
      if (!curRoom) {
        const initialRoom = window.SyncEngine.generateRoomCode();
        window.SyncEngine.connect(initialRoom);
      }
      updateSyncUI(window.SyncEngine.getStatus(), window.SyncEngine.getPeerCount());
    }

    function closeSyncModal() {
      if (syncModal) syncModal.classList.remove('active');
    }

    syncBtn?.addEventListener('click', openSyncModal);
    menuSyncBtn?.addEventListener('click', openSyncModal);
    mobSyncBtn?.addEventListener('click', openSyncModal);
    closeBtn?.addEventListener('click', closeSyncModal);
    doneBtn?.addEventListener('click', closeSyncModal);

    copyCodeBtn?.addEventListener('click', () => {
      const code = window.SyncEngine.getRoomId();
      if (code) {
        navigator.clipboard?.writeText(code).then(() => {
          showGestureToast(`📋 Код ${code} скопирован!`);
        }).catch(() => {
          prompt('Скопируйте код комнаты:', code);
        });
      }
    });

    copyLinkBtn?.addEventListener('click', () => {
      const url = window.SyncEngine.getRoomUrl();
      if (url) {
        navigator.clipboard?.writeText(url).then(() => {
          showGestureToast('🔗 Ссылка сопряжения скопирована!');
        }).catch(() => {
          prompt('Скопируйте ссылку для планшета:', url);
        });
      }
    });

    newRoomBtn?.addEventListener('click', () => {
      const newCode = window.SyncEngine.generateRoomCode();
      window.SyncEngine.connect(newCode);
      updateSyncUI(window.SyncEngine.getStatus(), window.SyncEngine.getPeerCount());
      showGestureToast(`Создана комната ${newCode}`);
    });

    joinBtn?.addEventListener('click', () => {
      const inputVal = (joinInput ? joinInput.value : '').trim().toUpperCase();
      if (!inputVal) {
        alert('Пожалуйста, введите код комнаты (например ХИМ-749)');
        return;
      }
      window.SyncEngine.connect(inputVal);
      if (joinInput) joinInput.value = '';
      updateSyncUI(window.SyncEngine.getStatus(), window.SyncEngine.getPeerCount());
      showGestureToast(`Подключение к ${inputVal}...`);
    });

    joinInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        joinBtn?.click();
      }
    });

    fbSaveBtn?.addEventListener('click', () => {
      const url = (fbInput ? fbInput.value : '').trim();
      if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        alert('Пожалуйста, введите корректный URL базы Firebase (например https://my-project-default-rtdb.firebaseio.com)');
        return;
      }
      window.SyncEngine.setFirebaseUrl(url);
      updateFirebaseUI();
      showGestureToast(url ? '🔥 Firebase RTDB подключен!' : 'Firebase отключен');
    });

    fbClearBtn?.addEventListener('click', () => {
      window.SyncEngine.setFirebaseUrl('');
      if (fbInput) fbInput.value = '';
      updateFirebaseUI();
      showGestureToast('Firebase очищен (MQTT активен)');
    });

    // Инициализация движка синхронизации с обработчиками
    window.SyncEngine.init({
      onStatusChange: (status, peerCount) => {
        updateSyncUI(status, peerCount);
      },

      onMoveItem: (data) => {
        if (!data || !data.source || !data.target) return;
        moveItem(data.source, data.target, true);
        showGestureToast('🔄 Карточка перемещена с другого устройства');
      },

      onToggleCompleted: (data) => {
        if (!data || !data.itemId) return;
        let found = false;
        state.periods.forEach(p => {
          Object.values(p.days || {}).forEach(day => {
            (day.items || []).forEach(it => {
              if (it.id === data.itemId) {
                it.completed = !!data.completed;
                found = true;
              }
            });
          });
        });
        if (!found && state.backlog) {
          state.backlog.forEach(it => {
            if (it.id === data.itemId) {
              it.completed = !!data.completed;
              found = true;
            }
          });
        }
        if (found) {
          saveState();
          renderCalendar();
          renderBacklog();
          updateProgress();
        }
      },

      onAddItem: (data) => {
        if (!data || !data.item) return;
        if (data.isBacklog) {
          state.backlog.push(data.item);
        } else {
          const period = findPeriodByDate(data.dateKey);
          if (period && period.days[data.dateKey]) {
            period.days[data.dateKey].items.push(data.item);
          }
        }
        saveState();
        renderCalendar();
        renderBacklog();
        updateProgress();
        showGestureToast('➕ Добавлен урок с другого устройства');
      },

      onUpdateItem: (data) => {
        if (!data || !data.item || !data.item.id) return;
        let found = false;
        state.periods.forEach(p => {
          Object.values(p.days || {}).forEach(day => {
            (day.items || []).forEach(it => {
              if (it.id === data.item.id) {
                Object.assign(it, data.item);
                found = true;
              }
            });
          });
        });
        if (!found && state.backlog) {
          state.backlog.forEach(it => {
            if (it.id === data.item.id) {
              Object.assign(it, data.item);
              found = true;
            }
          });
        }
        if (found) {
          saveState();
          renderCalendar();
          renderBacklog();
          updateProgress();
          showGestureToast('✏️ Урок изменен с другого устройства');
        }
      },

      onDeleteItem: (data) => {
        if (!data || !data.itemId) return;
        deleteItem(data.dateKey, null, data.isBacklog, data.itemId, true);
        showGestureToast('🗑️ Урок удален с другого устройства');
      },

      onStrokeAdd: (data) => {
        if (!data || !data.stroke) return;
        if (window.GoodNotesStylus && typeof window.GoodNotesStylus.drawRemoteStroke === 'function') {
          window.GoodNotesStylus.drawRemoteStroke(data.stroke, data.periodIndex);
        }
      },

      onStrokeChunk: (data) => {
        if (!data) return;
        if (window.GoodNotesStylus && typeof window.GoodNotesStylus.drawRemoteStrokeChunk === 'function') {
          window.GoodNotesStylus.drawRemoteStrokeChunk(data);
        }
      },

      onStrokeEnd: (data) => {
        if (!data) return;
        if (window.GoodNotesStylus && typeof window.GoodNotesStylus.finishRemoteStroke === 'function') {
          window.GoodNotesStylus.finishRemoteStroke(data);
        }
      },

      onStrokeUndo: (data) => {
        if (window.GoodNotesStylus && typeof window.GoodNotesStylus.remoteUndo === 'function') {
          window.GoodNotesStylus.remoteUndo(data.periodIndex);
        }
      },

      onStrokeClear: (data) => {
        if (window.GoodNotesStylus && typeof window.GoodNotesStylus.remoteClear === 'function') {
          window.GoodNotesStylus.remoteClear(data.periodIndex);
        }
      },

      onStrokeErase: (data) => {
        if (!data || !data.strokeIds) return;
        if (window.GoodNotesStylus && typeof window.GoodNotesStylus.remoteEraseStrokes === 'function') {
          window.GoodNotesStylus.remoteEraseStrokes(data.strokeIds);
        }
      },

      onImageAdd: (data) => {
        if (!data || !data.image || !data.periodId) return;
        if (!placedImages[data.periodId]) placedImages[data.periodId] = [];
        if (!placedImages[data.periodId].some(im => im.id === data.image.id)) {
          placedImages[data.periodId].push(data.image);
          savePlacedImagesForPeriod(data.periodId);
          const curPid = state.periods[state.currentPeriodIndex]?.id;
          if (curPid === data.periodId) {
            renderPlacedImages(curPid);
          }
        }
      },

      onImageUpdate: (data) => {
        if (!data || !data.image || !data.periodId) return;
        const list = placedImages[data.periodId];
        if (list) {
          const target = list.find(im => im.id === data.image.id);
          if (target) {
            Object.assign(target, data.image);
            savePlacedImagesForPeriod(data.periodId);
            const curPid = state.periods[state.currentPeriodIndex]?.id;
            if (curPid === data.periodId) {
              renderPlacedImages(curPid);
            }
          }
        }
      },

      onImageDelete: (data) => {
        if (!data || !data.imageId || !data.periodId) return;
        const list = placedImages[data.periodId];
        if (list) {
          placedImages[data.periodId] = list.filter(im => im.id !== data.imageId);
          savePlacedImagesForPeriod(data.periodId);
          const curPid = state.periods[state.currentPeriodIndex]?.id;
          if (curPid === data.periodId) {
            renderPlacedImages(curPid);
          }
        }
      },

      onRequestState: () => {
        return {
          periods: state.periods,
          backlog: state.backlog,
          currentPeriodIndex: state.currentPeriodIndex,
          drawings: window.GoodNotesStylus ? window.GoodNotesStylus.getDrawingsBackup() : {},
          vectorStrokes: window.GoodNotesStylus ? window.GoodNotesStylus.getVectorStrokesBackup() : {},
          placedImages: getAllPlacedImagesBackup()
        };
      },

      onFullStateSync: (remoteState) => {
        if (!remoteState || !remoteState.periods) return;
        state.periods = remoteState.periods;
        state.backlog = remoteState.backlog || [];
        if (typeof remoteState.currentPeriodIndex === 'number' && remoteState.currentPeriodIndex < state.periods.length) {
          state.currentPeriodIndex = remoteState.currentPeriodIndex;
        }
        if (remoteState.drawings && window.GoodNotesStylus) {
          window.GoodNotesStylus.restoreDrawingsBackup(remoteState.drawings);
        }
        if (remoteState.vectorStrokes && window.GoodNotesStylus) {
          window.GoodNotesStylus.restoreVectorStrokesBackup(remoteState.vectorStrokes);
        }
        if (remoteState.placedImages) {
          restoreAllPlacedImagesBackup(remoteState.placedImages);
        }
        saveState();
        renderPeriodsNav();
        renderCalendar();
        renderBacklog();
        updateProgress();
        showGestureToast('✨ Полная синхронизация завершена!');
      }
    });

    // Первичная отрисовка UI статуса
    updateSyncUI(window.SyncEngine.getStatus(), window.SyncEngine.getPeerCount());
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
