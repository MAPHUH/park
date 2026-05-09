/* ==========================================================================
   ТЕННИС КОРТ — ОСНОВНАЯ ЛОГИКА (script.js)
   Версия: 1.0
   Описание: PWA приложение для записи на теннисный корт
             Управление слотами, бронированиями, админ-панелью, темами
   ========================================================================== */

// ==========================================================================
// 1. ЗАПУСК ПРИЛОЖЕНИЯ ПОСЛЕ ПОЛНОЙ ЗАГРУЗКИ DOM
// ==========================================================================
// Используем DOMContentLoaded — событие, когда HTML полностью загружен и построен
// Это гарантирует, что все элементы существуют до того, как мы начнём с ними работать
document.addEventListener('DOMContentLoaded', () => {
    
    // ======================================================================
    // 2. ВСПОМОГАТЕЛЬНЫЕ ДАННЫЕ И КОНСТАНТЫ
    // ======================================================================
    
    // Названия дней недели в именительном падеже (для отображения)
    const daysOfWeekFull = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    
    // Названия месяцев в родительном падеже (для красивой даты: "04 мая 2026")
    const monthNamesGenitive = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    
    // ======================================================================
    // 3. НАСТРОЙКИ РАБОТЫ КОРТА (ДНИ НЕДЕЛИ, ВРЕМЯ)
    // ======================================================================
    // daySettings — объект, где ключ = номер дня недели (0=Воскресенье, 1=Понедельник...)
    // Каждый день содержит:
    //   - active: работает ли корт в этот день (true/false)
    //   - greenStart: время начала работы (строка "HH:MM")
    //   - greenEnd: время окончания работы (строка "HH:MM")
    let daySettings = {
        0: { active: false, greenStart: "10:00", greenEnd: "18:00" },  // Воскресенье — выходной
        1: { active: true,  greenStart: "09:00", greenEnd: "21:00" },  // Понедельник
        2: { active: true,  greenStart: "09:00", greenEnd: "21:00" },  // Вторник
        3: { active: true,  greenStart: "09:00", greenEnd: "21:00" },  // Среда
        4: { active: true,  greenStart: "09:00", greenEnd: "21:00" },  // Четверг
        5: { active: true,  greenStart: "09:00", greenEnd: "20:00" },  // Пятница
        6: { active: false, greenStart: "12:00", greenEnd: "16:00" }    // Суббота — выходной
    };
    
    // ======================================================================
    // 4. ХРАНИЛИЩЕ БРОНИРОВАНИЙ
    // ======================================================================
    // bookings — массив, хранит все записи пользователей
    // Каждое бронирование содержит:
    //   - id: уникальный идентификатор (используем timestamp + случайное число)
    //   - dayIndex: номер дня недели (0-6)
    //   - dateStr: дата в формате YYYY-MM-DD (для сравнения)
    //   - startMin: время начала в минутах от полуночи (0-1439)
    //   - endMin: время окончания в минутах от полуночи
    //   - startTime: строка времени начала "HH:MM"
    //   - endTime: строка времени окончания "HH:MM"
    let bookings = [];
    
    // ======================================================================
    // 5. НАСТРОЙКИ СЕТКИ РАСПИСАНИЯ (ИЗ АДМИН-ПАНЕЛИ)
    // ======================================================================
    let stepMinutes = 60;        // Шаг сетки в минутах (30 или 60)
    let defaultDuration = 60;    // Длительность слота в минутах (60, 90, 120)
    
    // ======================================================================
    // 6. УТИЛИТЫ — ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ СО ВРЕМЕНЕМ
    // ======================================================================
    
    /**
     * Преобразует строку времени в минуты от полуночи
     * @param {string} timeStr - время в формате "HH:MM" (например "14:30")
     * @returns {number} - количество минут (0-1439)
     * 
     * Пример: "14:30" → 14*60 + 30 = 870 минут
     */
    function timeToMinutes(timeStr) {
        let [h, m] = timeStr.split(':').map(Number);
        return h * 60 + (m || 0);
    }
    
    /**
     * Преобразует минуты от полуночи в строку времени
     * @param {number} min - минуты от полуночи (0-1439)
     * @returns {string} - время в формате "HH:MM" с ведущими нулями
     * 
     * Пример: 870 → "14:30"
     */
    function minutesToTime(min) {
        let h = Math.floor(min / 60);
        let m = min % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    
    /**
     * Форматирует дату в красивый читаемый вид
     * @param {Date} dateObj - объект JavaScript Date
     * @param {string} dayFullName - полное название дня недели
     * @returns {string} - отформатированная дата (пример: "Понедельник, 04 мая 2026")
     * 
     * Особенности: число всегда с ведущим нулём, месяц в родительном падеже
     */
    function formatFullDate(dateObj, dayFullName) {
        let dayNum = dateObj.getDate();
        let formattedDayNum = dayNum < 10 ? '0' + dayNum : dayNum;  // Добавляем ноль если нужно
        let monthName = monthNamesGenitive[dateObj.getMonth()];
        let year = dateObj.getFullYear();
        return `${dayFullName}, ${formattedDayNum} ${monthName} ${year}`;
    }
    
    // ======================================================================
    // 7. ГЕНЕРАЦИЯ ДНЕЙ НА БЛИЖАЙШУЮ НЕДЕЛЮ
    // ======================================================================
    
    /**
     * Возвращает массив объектов для следующих 7 дней (начиная с сегодня)
     * @returns {Array} - массив объектов с информацией о каждом дне
     * 
     * Каждый объект содержит:
     *   - date: объект Date
     *   - dayIndex: номер дня недели (0-6)
     *   - fullName: название дня на русском
     *   - dateStr: дата в формате YYYY-MM-DD (для сравнений)
     *   - displayDate: красивая отформатированная дата
     */
    function getNext7Days() {
        let today = new Date();
        let days = [];
        
        for (let i = 0; i < 7; i++) {
            let d = new Date();
            d.setDate(today.getDate() + i);  // Прибавляем i дней к сегодняшней дате
            
            let dayIndex = d.getDay();        // 0 = Воскресенье, 1 = Понедельник...
            let fullDateStr = d.toISOString().slice(0, 10);  // "2026-05-09"
            let fullDayName = daysOfWeekFull[dayIndex];
            let formattedDateStr = formatFullDate(d, fullDayName);
            
            days.push({
                date: d,
                dayIndex: dayIndex,
                fullName: fullDayName,
                dateStr: fullDateStr,
                displayDate: formattedDateStr,
            });
        }
        return days;
    }
    
    // ======================================================================
    // 8. ПРОВЕРКА, ВХОДИТ ЛИ ВРЕМЯ В РАБОЧИЕ ЧАСЫ КОРТА
    // ======================================================================
    
    /**
     * Проверяет, находится ли указанное время в рабочей зоне для конкретного дня
     * @param {number} dayIndex - номер дня недели (0-6)
     * @param {number} minuteOfDay - минута дня (0-1439)
     * @returns {boolean} - true если время в рабочей зоне, иначе false
     */
    function isInGreenZone(dayIndex, minuteOfDay) {
        let sett = daySettings[dayIndex];
        if (!sett.active) return false;  // День не работает — сразу false
        
        let startMin = timeToMinutes(sett.greenStart);
        let endMin = timeToMinutes(sett.greenEnd);
        
        // Время должно быть >= начала и < конца рабочего дня
        return (minuteOfDay >= startMin && minuteOfDay < endMin);
    }
    
    // ======================================================================
    // 9. ГЕНЕРАЦИЯ СЛОТОВ ДЛЯ КОНКРЕТНОГО ДНЯ
    // ======================================================================
    
    /**
     * Создаёт все возможные слоты для заданного дня на основе настроек
     * @param {Object} dayObj - объект дня из getNext7Days()
     * @returns {Array} - массив слотов с их статусами
     * 
     * Каждый слот содержит:
     *   - startMin: время начала в минутах
     *   - endMin: время окончания в минутах
     *   - startTime: строка времени начала
     *   - endTime: строка времени окончания
     *   - status: 'available' (свободно), 'partial' (1 игрок), 'full' (занято)
     *   - bookedCount: количество бронирований (0, 1 или 2)
     */
    function getSlotsForDay(dayObj) {
        let slots = [];
        let totalMinutes = 24 * 60;  // Всего минут в сутках = 1440
        
        // Проходим по времени с шагом stepMinutes
        for (let t = 0; t < totalMinutes; t += stepMinutes) {
            let startMin = t;
            let endMin = Math.min(t + stepMinutes, totalMinutes);
            
            // Пропускаем слоты вне рабочего времени корта
            if (!isInGreenZone(dayObj.dayIndex, startMin)) continue;
            if (endMin > totalMinutes) continue;
            
            // Находим все бронирования, которые попадают в этот слот
            let slotBookings = bookings.filter(b => 
                b.dayIndex === dayObj.dayIndex && 
                b.dateStr === dayObj.dateStr && 
                b.startMin === startMin
            );
            
            let bookedCount = slotBookings.length;
            let status = 'available';
            if (bookedCount === 1) status = 'partial';   // 1 игрок — оранжевый
            if (bookedCount >= 2) status = 'full';       // 2 игрока — красный
            
            slots.push({
                startMin: startMin,
                endMin: endMin,
                startTime: minutesToTime(startMin),
                endTime: minutesToTime(endMin),
                status: status,
                bookedCount: bookedCount,
            });
        }
        return slots;
    }
    
    // ======================================================================
    // 10. ПОЛУЧЕНИЕ ВСЕХ СЛОТОВ НА НЕДЕЛЮ
    // ======================================================================
    
    /**
     * Собирает все слоты для всех 7 дней и объединяет в один плоский массив
     * @returns {Array} - все слоты недели с привязанной информацией о дне
     */
    function getAllFlatSlots() {
        const weekDays = getNext7Days();
        let result = [];
        
        for (let day of weekDays) {
            const daySlots = getSlotsForDay(day);
            for (let slot of daySlots) {
                result.push({
                    ...slot,                    // Копируем все поля слота
                    dayIndex: day.dayIndex,
                    dateStr: day.dateStr,
                    displayDate: day.displayDate,
                    fullDayName: day.fullName,
                });
            }
        }
        return result;
    }
    
    // ======================================================================
    // 11. ГОЛОВНОЙ КОМПОНЕНТ — TOAST УВЕДОМЛЕНИЯ
    // ======================================================================
    
    /**
     * Показывает временное всплывающее сообщение внизу экрана
     * @param {string} msg - текст сообщения
     * @param {number} duration - время показа в миллисекундах (по умолчанию 1800)
     */
    function showToast(msg, duration = 1800) {
        let toast = document.getElementById('toastMsg');
        toast.innerText = msg;
        toast.style.opacity = '1';
        setTimeout(() => { 
            toast.style.opacity = '0'; 
        }, duration);
    }
    
    // ======================================================================
    // 12. ОБНОВЛЕНИЕ СЕКЦИИ "МОИ ЗАПИСИ" И СЧЁТЧИКА НА КНОПКЕ
    // ======================================================================
    
    /**
     * Отрисовывает список текущих бронирований пользователя
     * Также обновляет цифровой бейдж на кнопке "Мои записи"
     */
    function renderMyBookings() {
        const container = document.getElementById('myBookingsList');
        if (!container) return;
        
        // ОБНОВЛЯЕМ СЧЁТЧИК НА КНОПКЕ — отображаем количество записей
        const bookingsCountBadge = document.getElementById('bookingsCountBadge');
        if (bookingsCountBadge) {
            bookingsCountBadge.textContent = bookings.length;
        }
        
        // Если нет записей — показываем пустое состояние
        if (bookings.length === 0) {
            container.innerHTML = '<div style="padding: 12px; text-align:center;">🎾 Нет активных записей. Нажмите на карточку.</div>';
            return;
        }
        
        // Сортируем записи: сначала по дате, потом по времени начала
        let sorted = [...bookings].sort((a, b) => {
            if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
            return a.startMin - b.startMin;
        });
        
        // Генерируем HTML для каждой записи
        let html = '';
        for (let b of sorted) {
            let week = getNext7Days();
            let dayMatch = week.find(d => d.dateStr === b.dateStr);
            let niceDate = dayMatch ? dayMatch.displayDate : b.dateStr;
            html += `
                <div class="booking-item-mini">
                    <span><strong>🎾 ${niceDate}</strong>  ${b.startTime} — ${b.endTime}</span>
                    <button class="cancel-mini" data-id="${b.id}">Отменить</button>
                </div>
            `;
        }
        container.innerHTML = html;
        
        // Вешаем обработчики на кнопки отмены
        document.querySelectorAll('.cancel-mini').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                let id = parseFloat(btn.dataset.id);
                cancelBookingById(id);
            });
        });
    }
    
    // ======================================================================
    // 13. ОТМЕНА БРОНИРОВАНИЯ
    // ======================================================================
    
    /**
     * Отменяет бронирование по ID после подтверждения пользователя
     * @param {number} bookingId - уникальный идентификатор бронирования
     * @returns {boolean} - true если отмена успешна, false если пользователь отказался
     */
    function cancelBookingById(bookingId) {
        let booking = bookings.find(b => b.id == bookingId);
        if (!booking) return false;
        
        // Получаем красивую дату для отображения в подтверждении
        let week = getNext7Days();
        let dayInfo = week.find(d => d.dateStr === booking.dateStr);
        let niceDate = dayInfo ? dayInfo.displayDate : booking.dateStr;
        
        // Запрашиваем подтверждение отмены
        if (confirm(`Отменить запись?\n📅 ${niceDate}\n⏰ ${booking.startTime} — ${booking.endTime}`)) {
            bookings = bookings.filter(b => b.id !== bookingId);
            showToast("❌ Запись отменена", 1200);
            renderCards();          // Перерисовываем все карточки слотов
            renderMyBookings();     // Обновляем список записей
            return true;
        }
        return false;
    }
    
    // ======================================================================
    // 14. СОЗДАНИЕ НОВОГО БРОНИРОВАНИЯ
    // ======================================================================
    
    /**
     * Обрабатывает запись пользователя на выбранный слот
     * @param {number} dayIndex - номер дня недели
     * @param {string} dateStr - дата в формате YYYY-MM-DD
     * @param {number} startMin - время начала в минутах
     * @param {number} endMin - время окончания в минутах
     */
    function handleBooking(dayIndex, dateStr, startMin, endMin) {
        // Проверяем, сколько уже записей в этом слоте
        let existing = bookings.filter(b => 
            b.dayIndex === dayIndex && b.dateStr === dateStr && b.startMin === startMin
        );
        
        if (existing.length >= 2) {
            showToast('⚠️ Уже 2 игрока, запись невозможна', 1300);
            return;
        }
        
        let startTime = minutesToTime(startMin);
        let endTime = minutesToTime(endMin);
        let week = getNext7Days();
        let dayObj = week.find(d => d.dateStr === dateStr);
        let niceDate = dayObj ? dayObj.displayDate : dateStr;
        
        // Подтверждение записи с информацией о слоте
        let confirmMsg = `🎾 Запись на теннис\n📅 ${niceDate}\n⏰ ${startTime} — ${endTime}\nМест осталось: ${2 - existing.length}\nЗаписаться?`;
        
        if (confirm(confirmMsg)) {
            let newId = Date.now() + Math.random() * 10000;  // Уникальный ID
            bookings.push({
                id: newId,
                dayIndex: dayIndex,
                dateStr: dateStr,
                startMin: startMin,
                endMin: endMin,
                startTime: startTime,
                endTime: endTime,
            });
            showToast(`✅ Запись добавлена!`, 1300);
            renderCards();          // Обновляем карточки
            renderMyBookings();     // Обновляем список записей
        }
    }
    
    // ======================================================================
    // 15. ОТРИСОВКА ВСЕХ КАРТОЧЕК СЛОТОВ (ОСНОВНОЙ СПИСОК)
    // ======================================================================
    
    /**
     * Генерирует и отображает все карточки слотов на неделю
     * Это основная функция рендеринга интерфейса
     */
    function renderCards() {
        const container = document.getElementById('slotsContainer');
        if (!container) return;
        
        const slots = getAllFlatSlots();
        
        if (slots.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:40px;">✨ Нет доступных слотов. Измените настройки дней.</div>`;
            return;
        }
        
        let html = '';
        for (let slot of slots) {
            let statusClass = '';
            let statusText = '';
            let leftIcon = '';
            
            // Определяем стили и текст в зависимости от статуса слота
            if (slot.status === 'available') {
                statusClass = 'available';
                statusText = '🟢 Свободно (2 места)';
                leftIcon = '🎾';
            } else if (slot.status === 'partial') {
                statusClass = 'partial';
                statusText = '🟡 1 игрок, есть место!';
                leftIcon = '🎾+';
            } else {
                statusClass = 'full';
                statusText = '🔴 Занято (оба игрока)';
                leftIcon = '⛔';
            }
            
            html += `
                <div class="card-slot ${statusClass}" 
                     data-dayidx="${slot.dayIndex}" 
                     data-datestr="${slot.dateStr}" 
                     data-startmin="${slot.startMin}" 
                     data-endmin="${slot.endMin}" 
                     data-status="${slot.status}">
                    <div class="time-block">
                        <div class="hour-large">${slot.startTime} — ${slot.endTime}</div>
                        <div class="date-sm">${slot.displayDate}</div>
                    </div>
                    <div class="players-info">
                        <div class="player-badge">${leftIcon} ${slot.bookedCount}/2 игрока</div>
                        <div class="status-chip">${statusText}</div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
        
        // Вешаем обработчики кликов на каждую карточку
        document.querySelectorAll('.card-slot').forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const status = card.dataset.status;
                
                if (status === 'full') {
                    showToast('❌ Слот полностью занят', 1200);
                    return;
                }
                
                const dayIdx = parseInt(card.dataset.dayidx);
                const dateStr = card.dataset.datestr;
                const startMin = parseInt(card.dataset.startmin);
                const endMin = parseInt(card.dataset.endmin);
                handleBooking(dayIdx, dateStr, startMin, endMin);
            });
        });
    }
    
    // ======================================================================
    // 16. АДМИН-ПАНЕЛЬ — ПОСТРОЕНИЕ UI ДЛЯ НАСТРОЙКИ ДНЕЙ
    // ======================================================================
    
    /**
     * Создаёт интерфейс в админ-панели для настройки каждого дня недели
     * Позволяет включать/выключать дни и задавать время работы
     */
    function buildDayTogglesUI() {
        const container = document.getElementById('dayTogglesContainer');
        if (!container) return;
        container.innerHTML = '';
        
        for (let i = 0; i <= 6; i++) {
            let sett = daySettings[i];
            let dayDiv = document.createElement('div');
            dayDiv.className = 'day-tag';
            dayDiv.innerHTML = `
                <input type="checkbox" class="dayActiveCheck" data-day="${i}" ${sett.active ? 'checked' : ''}>
                <strong>${daysOfWeekFull[i].slice(0, 3)}</strong>
                <input type="time" class="greenStartInput" data-day="${i}" value="${sett.greenStart}" style="width:85px;">
                <span>-</span>
                <input type="time" class="greenEndInput" data-day="${i}" value="${sett.greenEnd}" style="width:85px;">
            `;
            container.appendChild(dayDiv);
        }
        
        // Обработчик изменения чекбокса (вкл/выкл день)
        document.querySelectorAll('.dayActiveCheck').forEach(cb => {
            cb.addEventListener('change', (e) => {
                let day = parseInt(e.target.dataset.day);
                daySettings[day].active = e.target.checked;
                renderCards();
                renderMyBookings();
            });
        });
        
        // Обработчик изменения времени начала работы
        document.querySelectorAll('.greenStartInput').forEach(inp => {
            inp.addEventListener('change', (e) => {
                let day = parseInt(e.target.dataset.day);
                daySettings[day].greenStart = e.target.value;
                renderCards();
                renderMyBookings();
            });
        });
        
        // Обработчик изменения времени окончания работы
        document.querySelectorAll('.greenEndInput').forEach(inp => {
            inp.addEventListener('change', (e) => {
                let day = parseInt(e.target.dataset.day);
                daySettings[day].greenEnd = e.target.value;
                renderCards();
                renderMyBookings();
            });
        });
    }
    
    // ======================================================================
    // 17. УПРАВЛЕНИЕ ТЕМОЙ (СВЕТЛАЯ/ТЁМНАЯ)
    // ======================================================================
    
    /**
     * Инициализирует тему из localStorage и настраивает переключение
     * Сохраняет выбор пользователя между сессиями
     */
    function initTheme() {
        const savedTheme = localStorage.getItem('tennis_theme');
        const themeBtn = document.getElementById('themeToggleBtn');
        
        if (savedTheme === 'dark') {
            document.body.classList.remove('light');
            document.body.classList.add('dark');
            themeBtn.innerText = '☀️ Светлая';
        } else {
            document.body.classList.add('light');
            themeBtn.innerText = '🌙 Темная';
        }
        
        themeBtn.addEventListener('click', () => {
            if (document.body.classList.contains('light')) {
                document.body.classList.remove('light');
                document.body.classList.add('dark');
                localStorage.setItem('tennis_theme', 'dark');
                themeBtn.innerText = '☀️ Светлая';
            } else {
                document.body.classList.remove('dark');
                document.body.classList.add('light');
                localStorage.setItem('tennis_theme', 'light');
                themeBtn.innerText = '🌙 Темная';
            }
        });
    }
    
    // ======================================================================
    // 18. ФУНКЦИЯ ДЛЯ ПЕРЕСЧЁТА ВЫСОТЫ СПИСКА (для корректного скролла)
    // ======================================================================
    
    /**
     * Принудительно обновляет layout страницы при скрытии/показе блока "Мои записи"
     * Исправляет возможные проблемы с прокруткой
     */
    function refreshSlotsHeight() {
        const slotsContainer = document.getElementById('slotsContainer');
        if (!slotsContainer) return;
        slotsContainer.style.transform = 'translateZ(0)';
        setTimeout(() => {
            slotsContainer.style.transform = '';
        }, 50);
    }
    
    // ======================================================================
    // 19. ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ — ТОЧКА ВХОДА
    // ======================================================================
    
    /**
     * Главная функция инициализации — вызывается при загрузке страницы
     * Настраивает всё приложение: темы, админку, обработчики, рендеринг
     */
    function init() {
        // Строим UI админ-панели (переключатели дней)
        buildDayTogglesUI();
        
        // Отрисовываем карточки и список записей
        renderCards();
        renderMyBookings();
        
        // Настраиваем тему
        initTheme();
        
        // ===== НАСТРОЙКА АДМИН-ПАНЕЛИ =====
        const adminBtn = document.getElementById('adminToggleBtn');
        const adminPanel = document.getElementById('adminPanel');
        adminBtn.addEventListener('click', () => {
            adminPanel.classList.toggle('open');
        });
        
        // Настройка шага сетки (30 или 60 минут)
        const stepSelect = document.getElementById('stepSelect');
        stepSelect.addEventListener('change', (e) => {
            stepMinutes = parseInt(e.target.value);
            renderCards();
        });
        
        // Настройка длительности слота
        const durationSelect = document.getElementById('durationSelect');
        durationSelect.addEventListener('change', (e) => {
            defaultDuration = parseInt(e.target.value);
            renderCards();
        });
        
        // Кнопка принудительного обновления календаря
        document.getElementById('refreshCalendarBtn')?.addEventListener('click', () => {
            renderCards();
            renderMyBookings();
            showToast("Календарь обновлён", 1000);
        });
        
        // ===== УПРАВЛЕНИЕ СКРЫТИЕМ/ПОКАЗОМ БЛОКА "МОИ ЗАПИСИ" =====
        const myBookingsSection = document.getElementById('myBookingsSection');
        const myBookingsToggleBtn = document.getElementById('myBookingsToggleBtn');
        let isBookingsVisible = true;
        
        if (myBookingsToggleBtn && myBookingsSection) {
            myBookingsToggleBtn.addEventListener('click', () => {
                if (isBookingsVisible) {
                    myBookingsSection.classList.add('hidden');
                    isBookingsVisible = false;
                } else {
                    myBookingsSection.classList.remove('hidden');
                    isBookingsVisible = true;
                }
                // После изменения видимости обновляем высоту списка
                setTimeout(() => {
                    refreshSlotsHeight();
                    window.dispatchEvent(new Event('resize'));
                }, 50);
            });
        }
    }
    
    // ======================================================================
    // 20. ЗАПУСК ПРИЛОЖЕНИЯ
    // ======================================================================
    // Вызываем init() после полной загрузки DOM
    init();
    
}); // Конец DOMContentLoaded