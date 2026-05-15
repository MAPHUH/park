
/* ==========================================================================
   ТЕННИС КОРТ — ОСНОВНАЯ ЛОГИКА (script.js)
   Версия: 2.0 — с фильтром "Мои записи" и кнопкой отмены в карточке
   ========================================================================== */

// ===== 1. ЗАПУСК ПРИЛОЖЕНИЯ =====
document.addEventListener('DOMContentLoaded', () => {
    
    // ===== 2. КОНСТАНТЫ И ДАННЫЕ =====
    const daysOfWeekFull = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const monthNamesGenitive = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    
    // Настройки работы корта
    let daySettings = {
        0: { active: false, greenStart: "10:00", greenEnd: "18:00" },
        1: { active: true,  greenStart: "09:00", greenEnd: "21:00" },
        2: { active: true,  greenStart: "09:00", greenEnd: "21:00" },
        3: { active: true,  greenStart: "09:00", greenEnd: "21:00" },
        4: { active: true,  greenStart: "09:00", greenEnd: "21:00" },
        5: { active: true,  greenStart: "09:00", greenEnd: "20:00" },
        6: { active: false, greenStart: "12:00", greenEnd: "16:00" }
    };
    
    // Массив бронирований (каждый пользователь — это объект с уникальным ID)
    window.bookings = [];

    // WebSocket менеджер
    let wsManager = null;
    
    // Настройки сетки
    let stepMinutes = 60;
    let defaultDuration = 60;
    
    // ===== НОВОЕ: СОСТОЯНИЕ ФИЛЬТРА =====
    // filterMode = 'all' → показываем все слоты
    // filterMode = 'my'  → показываем только слоты, где есть запись текущего пользователя
    let filterMode = 'all';  // 'all' или 'my'
    
    // ===== АУТЕНТИФИКАЦИЯ: ГЕНЕРАЦИЯ ID ПОЛЬЗОВАТЕЛЯ =====
    let currentUserId = localStorage.getItem('tennis_user_id');
    let currentUserName = localStorage.getItem('tennis_user_name');
    
    if (!currentUserId) {
        currentUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        localStorage.setItem('tennis_user_id', currentUserId);
    }
    
    if (!currentUserName) {
        currentUserName = 'Игрок_' + currentUserId.substr(-4);
        localStorage.setItem('tennis_user_name', currentUserName);
    }
    
    console.log('👤 Текущий пользователь:', currentUserId, currentUserName);
    
    // ===== 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
    function timeToMinutes(timeStr) {
        let [h, m] = timeStr.split(':').map(Number);
        return h * 60 + (m || 0);
    }
    
    function minutesToTime(min) {
        let h = Math.floor(min / 60);
        let m = min % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    
    function formatFullDate(dateObj, dayFullName) {
        let dayNum = dateObj.getDate();
        let formattedDayNum = dayNum < 10 ? '0' + dayNum : dayNum;
        let monthName = monthNamesGenitive[dateObj.getMonth()];
        let year = dateObj.getFullYear();
        return `${dayFullName}, ${formattedDayNum} ${monthName} ${year}`;
    }
    
    function getNext7Days() {
        let today = new Date();
        let days = [];
        for (let i = 0; i < 7; i++) {
            let d = new Date();
            d.setDate(today.getDate() + i);
            let dayIndex = d.getDay();
            let fullDateStr = d.toISOString().slice(0, 10);
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
    
    function isInGreenZone(dayIndex, minuteOfDay) {
        let sett = daySettings[dayIndex];
        if (!sett.active) return false;
        let startMin = timeToMinutes(sett.greenStart);
        let endMin = timeToMinutes(sett.greenEnd);
        return (minuteOfDay >= startMin && minuteOfDay < endMin);
    }
    
    // ===== 4. НОВАЯ ФУНКЦИЯ: ПРОВЕРКА, ЗАПИСАН ЛИ ПОЛЬЗОВАТЕЛЬ НА СЛОТ =====
    /**
     * Проверяет, есть ли у текущего пользователя бронирование на конкретный слот
     * @param {number} dayIndex - номер дня недели
     * @param {string} dateStr - дата в формате YYYY-MM-DD
     * @param {number} startMin - время начала в минутах
     * @returns {object|null} - объект бронирования или null
     */
    function getUserBookingForSlot(dayIndex, dateStr, startMin) {
        return window.bookings.find(b => 
            b.userId === currentUserId &&
            b.dayIndex === dayIndex && 
            b.dateStr === dateStr && 
            b.startMin === startMin
        );
    }
    
    /**
     * Проверяет, может ли пользователь записаться на слот
     * @param {number} dayIndex - номер дня недели
     * @param {string} dateStr - дата в формате YYYY-MM-DD
     * @param {number} startMin - время начала в минутах
     * @returns {boolean} - true если может записаться
     */
    function canUserBook(dayIndex, dateStr, startMin) {
        // Нельзя записаться если уже записан
        const existingUserBooking = getUserBookingForSlot(dayIndex, dateStr, startMin);
        if (existingUserBooking) return false;
        
        // Нельзя записаться если слот уже заполнен (2 игрока)
        const slotBookings = window.bookings.filter(b => 
            b.dayIndex === dayIndex && b.dateStr === dateStr && b.startMin === startMin
        );
        return slotBookings.length < 2;
    }
    
    // ===== 5. ГЕНЕРАЦИЯ СЛОТОВ (С УЧЁТОМ ЗАПИСЕЙ ПОЛЬЗОВАТЕЛЯ) =====
    function getSlotsForDay(dayObj) {
        let slots = [];
        let totalMinutes = 24 * 60;
        
        for (let t = 0; t < totalMinutes; t += stepMinutes) {
            let startMin = t;
            let endMin = Math.min(t + stepMinutes, totalMinutes);
            
            if (!isInGreenZone(dayObj.dayIndex, startMin)) continue;
            if (endMin > totalMinutes) continue;
            
            // Получаем все бронирования на этот слот
            let slotBookings = window.bookings.filter(b => 
                b.dayIndex === dayObj.dayIndex && 
                b.dateStr === dayObj.dateStr && 
                b.startMin === startMin
            );
            
            let bookedCount = slotBookings.length;
            let isUserBooked = !!getUserBookingForSlot(dayObj.dayIndex, dayObj.dateStr, startMin);
            
            let status = 'available';
            if (bookedCount === 1) status = 'partial';
            if (bookedCount >= 2) status = 'full';
            
            slots.push({
                startMin: startMin,
                endMin: endMin,
                startTime: minutesToTime(startMin),
                endTime: minutesToTime(endMin),
                status: status,
                bookedCount: bookedCount,
                isUserBooked: isUserBooked  // ← НОВОЕ: флаг, записан ли пользователь
            });
        }
        return slots;
    }
    
    function getAllFlatSlots() {
        const weekDays = getNext7Days();
        let result = [];
        for (let day of weekDays) {
            const daySlots = getSlotsForDay(day);
            for (let slot of daySlots) {
                result.push({
                    ...slot,
                    dayIndex: day.dayIndex,
                    dateStr: day.dateStr,
                    displayDate: day.displayDate,
                    fullDayName: day.fullName,
                });
            }
        }
        return result;
    }
    
    // ===== НОВАЯ ФУНКЦИЯ: ФИЛЬТРАЦИЯ СЛОТОВ =====
    function getFilteredSlots() {
        const allSlots = getAllFlatSlots();
        
        if (filterMode === 'all') {
            return allSlots;
        } else { // filterMode === 'my'
            return allSlots.filter(slot => slot.isUserBooked === true);
        }
    }
    
    // ===== 6. TOAST УВЕДОМЛЕНИЯ =====
    function showToast(msg, duration = 1800) {
        let toast = document.getElementById('toastMsg');
        toast.innerText = msg;
        toast.style.opacity = '1';
        setTimeout(() => { toast.style.opacity = '0'; }, duration);
    }
    
    // ===== ВИБРАЦИЯ =====
    function vibrate(duration) {
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(duration);
        }
    }
    
    // ===== 7. ОТМЕНА БРОНИРОВАНИЯ (НОВАЯ ВЕРСИЯ) =====
    function cancelBooking(dayIndex, dateStr, startMin) {
        const booking = getUserBookingForSlot(dayIndex, dateStr, startMin);
        if (!booking) return false;
        
        const slotId = `${dateStr}_${startMin}`;
        
        let week = getNext7Days();
        let dayInfo = week.find(d => d.dateStr === dateStr);
        let niceDate = dayInfo ? dayInfo.displayDate : dateStr;
        
        // Оптимистичное удаление из UI
        window.bookings = window.bookings.filter(b => b.id !== booking.id);
        renderCards();
        updateBookingsCount();
        vibrate(200);
        showToast("❌ Отмена отправлена", 1200);
        
        // Отправляем на сервер
        if (wsManager) {
            wsManager.cancelSlot(slotId, currentUserId);
        }
        return true;
    }
    
    // ===== 8. СОЗДАНИЕ БРОНИРОВАНИЯ (С ЗАЩИТОЙ ОТ ДУБЛЕЙ) =====
        function handleBooking(dayIndex, dateStr, startMin, endMin) {
        const slotId = `${dateStr}_${startMin}`;
        
        // Проверяем, не записан ли уже пользователь (по локальным данным)
        const existingUserBooking = getUserBookingForSlot(dayIndex, dateStr, startMin);
        if (existingUserBooking) {
            vibrate(200);
            showToast('❌ Вы уже записаны на этот слот', 1300);
            return;
        }
        
        // Проверяем, есть ли свободные места (по локальным данным)
        let existingBookings = window.bookings.filter(b => 
            b.dayIndex === dayIndex && b.dateStr === dateStr && b.startMin === startMin
        );
        
        if (existingBookings.length >= 2) {
            vibrate(200);
            showToast('⚠️ Уже 2 игрока, запись невозможна', 1300);
            return;
        }
        
        let startTime = minutesToTime(startMin);
        let endTime = minutesToTime(endMin);
        let week = getNext7Days();
        let dayObj = week.find(d => d.dateStr === dateStr);
        let niceDate = dayObj ? dayObj.displayDate : dateStr;
        
        // Оптимистичное обновление UI
        const newId = Date.now() + Math.random() * 10000;
        window.bookings.push({
            id: newId,
            userId: currentUserId,
            dayIndex: dayIndex,
            dateStr: dateStr,
            startMin: startMin,
            endMin: endMin,
            startTime: startTime,
            endTime: endTime,
        });
        renderCards();
        updateBookingsCount();
        vibrate(50);
        showToast(`✅ Запись отправлена`, 1300);
        
        // Отправляем на сервер
        if (wsManager) {
            wsManager.bookSlot(slotId, currentUserId);
        } else {
            console.warn('WebSocket не инициализирован');
        }
    }
    
    // ===== 9. ОБНОВЛЕНИЕ СЧЁТЧИКА НА КНОПКЕ =====
    function updateBookingsCount() {
        const myBookings = bookings.filter(b => b.userId === currentUserId);
        const count = myBookings.length;
        
        // Обновляем счётчик на кнопке "Моя регистрация"
        const myRegBtn = document.getElementById('myRegistrationsBtn');
        if (myRegBtn) {
            const badge = myRegBtn.querySelector('#bookingsCountBadge');
            if (badge) {
                badge.textContent = count;
            }
        }
    }
    
    // ===== 10. ОТРИСОВКА КАРТОЧЕК (С КНОПКОЙ ОТМЕНЫ В УГЛУ) =====
    function renderCards() {
        const container = document.getElementById('slotsContainer');
        if (!container) return;
        
        const slots = getFilteredSlots();
        
        // Проверка на пустой результат при фильтрации
        if (filterMode === 'my' && slots.length === 0) {
            vibrate(200);
            showToast('📭 У вас нет активных записей', 1500);
            container.innerHTML = `<div style="text-align:center; padding:40px;">✨ У вас нет записей. Нажмите "Все записи" чтобы посмотреть слоты.</div>`;
            return;
        }
        
        if (slots.length === 0 && filterMode === 'all') {
            container.innerHTML = `<div style="text-align:center; padding:40px;">✨ Нет доступных слотов. Измените настройки дней.</div>`;
            return;
        }
        
        let html = '';
        for (let slot of slots) {
            let statusClass = '';
            let statusText = '';
            let leftIcon = '';
            
            // Определяем статус и текст
            if (slot.status === 'available') {
                statusClass = 'available';
                statusText = '🟢 Свободно (2 места)';
                leftIcon = '🎾';
            } else if (slot.status === 'partial') {
                statusClass = 'partial';
                // ===== НОВОЕ: меняем текст если пользователь записан =====
                if (slot.isUserBooked) {
                    statusText = '🎾 Вы записаны · 1/2 игрока';
                } else {
                    statusText = '🟡 1 игрок, есть место!';
                }
                leftIcon = '🎾+';
            } else {
                statusClass = 'full';
                if (slot.isUserBooked) {
                    statusText = '🔴 Вы записаны (слот заполнен)';
                } else {
                    statusText = '🔴 Занято (оба игрока)';
                }
                leftIcon = '⛔';
            }
            
            // ===== НОВОЕ: генерируем кнопку отмены (красный крестик в правом верхнем углу) =====
            const cancelButtonHtml = slot.isUserBooked 
                ? `<button class="cancel-slot-btn" data-cancel="true" data-dayidx="${slot.dayIndex}" data-datestr="${slot.dateStr}" data-startmin="${slot.startMin}">✖</button>` 
                : '';
            
            html += `
                <div class="card-slot ${statusClass}" 
                     data-dayidx="${slot.dayIndex}" 
                     data-datestr="${slot.dateStr}" 
                     data-startmin="${slot.startMin}" 
                     data-endmin="${slot.endMin}" 
                     data-status="${slot.status}"
                     ${slot.isUserBooked ? 'data-user-booked="true"' : ''}>
                    
                    ${cancelButtonHtml}
                    
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
        
        // Вешаем обработчики
        document.querySelectorAll('.card-slot').forEach(card => {
            // Определяем, есть ли у карточки data-user-booked
            const isUserBooked = card.dataset.userBooked === 'true';
            const status = card.dataset.status;
            const dayIdx = parseInt(card.dataset.dayidx);
            const dateStr = card.dataset.datestr;
            const startMin = parseInt(card.dataset.startmin);
            const endMin = parseInt(card.dataset.endmin);
            
            // Обработчик для основной области карточки (запись)
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Если кликнули на кнопку отмены — ничего не делаем (она обработает сама)
                if (e.target.classList && e.target.classList.contains('cancel-slot-btn')) {
                    return;
                }
                
                // Если пользователь уже записан на этот слот — нельзя записаться снова
                if (isUserBooked) {
                    showToast('❌ Вы уже записаны на этот слот', 1200);
                    return;
                }
                
                if (status === 'full') {
                    vibrate(200);
                    showToast('❌ Слот полностью занят', 1200);
                    return;
                }
                
                handleBooking(dayIdx, dateStr, startMin, endMin);
            });
        });
        
        // Обработчики для кнопок отмены (красные крестики)
        document.querySelectorAll('.cancel-slot-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dayIdx = parseInt(btn.dataset.dayidx);
                const dateStr = btn.dataset.datestr;
                const startMin = parseInt(btn.dataset.startmin);
                cancelBooking(dayIdx, dateStr, startMin);
            });
        });
    }
    
    // ===== 11. АДМИН-ПАНЕЛЬ =====
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
        
        document.querySelectorAll('.dayActiveCheck').forEach(cb => {
            cb.addEventListener('change', (e) => {
                let day = parseInt(e.target.dataset.day);
                daySettings[day].active = e.target.checked;
                renderCards();
                updateBookingsCount();
            });
        });
        
        document.querySelectorAll('.greenStartInput').forEach(inp => {
            inp.addEventListener('change', (e) => {
                let day = parseInt(e.target.dataset.day);
                daySettings[day].greenStart = e.target.value;
                renderCards();
                updateBookingsCount();
            });
        });
        
        document.querySelectorAll('.greenEndInput').forEach(inp => {
            inp.addEventListener('change', (e) => {
                let day = parseInt(e.target.dataset.day);
                daySettings[day].greenEnd = e.target.value;
                renderCards();
                updateBookingsCount();
            });
        });
    }
    
    // ===== 12. ТЕМА =====
        function initTheme() {
        const savedTheme = localStorage.getItem('tennis_theme');
        const themeBtn = document.getElementById('themeToggleBtn');
        
        // Функция для обновления цвета статус-бара
        function updateThemeColor() {
            const isDark = document.body.classList.contains('dark');
            const themeColor = isDark ? '#0a0f1c' : '#f2f5f9';
            const metaThemeColor = document.querySelector('meta[name="theme-color"]');
            if (metaThemeColor) {
                metaThemeColor.setAttribute('content', themeColor);
            }
        }
        
        if (savedTheme === 'dark') {
            document.body.classList.remove('light');
            document.body.classList.add('dark');
            themeBtn.innerText = '☀️ Светлая';
        } else {
            document.body.classList.add('light');
            themeBtn.innerText = '🌙 Темная';
        }
        updateThemeColor(); // Устанавливаем начальный цвет
        
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
            updateThemeColor(); // Обновляем цвет после переключения
        });
    }
    
        // Обновление активного состояния кнопок
        function updateActiveButtonState() {
            const myBtn = document.getElementById('myRegistrationsBtn');
            const allBtn = document.getElementById('allSlotsBtn');
            
            if (myBtn && allBtn) {
                if (filterMode === 'my') {
                    myBtn.classList.add('active');
                    allBtn.classList.remove('active');
                } else {
                    myBtn.classList.remove('active');
                    allBtn.classList.add('active');
                }
            }
        }


    // ===== 13. ИНИЦИАЛИЗАЦИЯ =====
    function init() {

            // ===== ПОДКЛЮЧЕНИЕ WEBSOCKET =====
        wsManager = null;
        
        // Функция обработки сообщений от сервера
        function handleWebSocketMessage(data) {
            console.log('📨 Получено сообщение от сервера:', data);
            
            if (data.type === 'sync') {
<<<<<<< Updated upstream
                // Полная синхронизация всех слотов
                bookings = convertServerSlotsToBookings(data.payload.slots);
=======
                window.bookings = convertServerSlotsToBookings(data.payload.slots);
>>>>>>> Stashed changes
                renderCards();
                updateBookingsCount();
                showToast('🔄 Данные синхронизированы', 1000);
                
            } else if (data.type === 'update') {
                // Обновление конкретного слота
                updateSlotFromServer(data.payload);
                renderCards();
                updateBookingsCount();
                
            } else if (data.type === 'error') {
                // Ошибка от сервера (конфликт, слот занят)
                vibrate(200);
                showToast('❌ ' + (data.message || 'Ошибка сервера'), 2000);
                
                // Запрашиваем полную синхронизацию
                if (wsManager) wsManager.send({ type: 'get_sync' });
            }
        }
        
        // Функция конвертации слотов от сервера в формат bookings
        function convertServerSlotsToBookings(serverSlots) {
            const newBookings = [];
            for (const slot of serverSlots) {
                // Для каждого пользователя в слоте создаём бронирование
                for (const userId of slot.bookedUsers) {
                    newBookings.push({
                        id: `${slot.slotId}_${userId}`,
                        userId: userId,
                        dayIndex: slot.dayIndex,
                        dateStr: slot.dateStr,
                        startMin: slot.startMin,
                        endMin: slot.endMin,
                        startTime: minutesToTime(slot.startMin),
                        endTime: minutesToTime(slot.endMin),
                    });
                }
            }
            return newBookings;
        }
        
<<<<<<< Updated upstream
        // Функция обновления одного слота
        function updateSlotFromServer(payload) {
            // Удаляем старые бронирования для этого слота
            bookings = bookings.filter(b => 
                !(b.dayIndex === payload.dayIndex && 
                b.dateStr === payload.dateStr && 
                b.startMin === payload.startMin)
            );
            
=======
                function updateSlotFromServer(payload) {
            console.log('🔄 updateSlotFromServer ПОЛУЧЕН payload:', payload);
            console.log('📊 ДО обновления bookings:', JSON.parse(JSON.stringify(window.bookings)));
            
            // Удаляем старые бронирования для этого слота
            window.bookings = window.bookings.filter(b => 
                !(b.dateStr === payload.dateStr && b.startMin === payload.startMin)
            );
            
            console.log('📊 ПОСЛЕ удаления старых:', JSON.parse(JSON.stringify(window.bookings)));
            
>>>>>>> Stashed changes
            // Добавляем новые
            for (const userId of payload.bookedUsers) {
                window.bookings.push({
                    id: `${payload.slotId}_${userId}`,
                    userId: userId,
                    dayIndex: new Date(payload.dateStr).getDay(),
                    dateStr: payload.dateStr,
                    startMin: payload.startMin,
                    endMin: payload.endMin,
                    startTime: minutesToTime(payload.startMin),
                    endTime: minutesToTime(payload.endMin),
                });
            }
            
            console.log('📊 ПОСЛЕ добавления новых:', JSON.parse(JSON.stringify(window.bookings)));
            console.log('🔄 Вызываю renderCards()');
            renderCards();
            updateBookingsCount();
        }
        
        // Инициализируем WebSocket (URL позже заменим на реальный)
        const WS_URL = 'ws://localhost:8080/ws';  // ВРЕМЕННО, для теста
        wsManager = new WebSocketManager(WS_URL, handleWebSocketMessage);

        buildDayTogglesUI();
        renderCards();
        updateBookingsCount();
        initTheme();
        
        // Админ-панель
        const adminBtn = document.getElementById('adminToggleBtn');
        const adminPanel = document.getElementById('adminPanel');
        adminBtn.addEventListener('click', () => {
            adminPanel.classList.toggle('open');
        });
        
        // Настройки сетки
        const stepSelect = document.getElementById('stepSelect');
        const durationSelect = document.getElementById('durationSelect');
        stepSelect.addEventListener('change', (e) => {
            stepMinutes = parseInt(e.target.value);
            renderCards();
        });
        durationSelect.addEventListener('change', (e) => {
            defaultDuration = parseInt(e.target.value);
            renderCards();
        });
        
        document.getElementById('refreshCalendarBtn')?.addEventListener('click', () => {
            renderCards();
            updateBookingsCount();
            showToast("Календарь обновлён", 1000);
        });
        
<<<<<<< Updated upstream
        // ===== НОВОЕ: КНОПКА ФИЛЬТРА "МОИ ЗАПИСИ" / "ВСЕ ЗАПИСИ" =====
        const myBookingsToggleBtn = document.getElementById('myBookingsToggleBtn');
        if (myBookingsToggleBtn) {
            myBookingsToggleBtn.addEventListener('click', () => {
                if (filterMode === 'all') {
                    // Проверяем, есть ли у пользователя записи
                    const myBookingsCount = bookings.filter(b => b.userId === currentUserId).length;
                    if (myBookingsCount === 0) {
                        showToast('📭 У вас нет активных записей', 1500);
                        return;
                    }
                    filterMode = 'my';
                } else {
                    filterMode = 'all';
                }
                
                // Обновляем текст кнопки и счётчик
=======
        // Кнопка "Моя регистрация"
        const myRegistrationsBtn = document.getElementById('myRegistrationsBtn');
        if (myRegistrationsBtn) {
            myRegistrationsBtn.addEventListener('click', () => {
                if (filterMode === 'my') {
                    showToast('ℹ️ Вы уже в режиме фильтра', 1500);
                    return;
                }
                
                const myBookingsCount = bookings.filter(b => b.userId === currentUserId).length;
                if (myBookingsCount === 0) {
                    showToast('📭 У вас нет активных записей', 1500);
                    return;
                }
                
                filterMode = 'my';
                updateActiveButtonState();
>>>>>>> Stashed changes
                updateBookingsCount();
                // Перерисовываем карточки с учётом фильтра
                renderCards();
            });
        }
<<<<<<< Updated upstream
=======

        // Кнопка "Все слоты"
        const allSlotsBtn = document.getElementById('allSlotsBtn');
        if (allSlotsBtn) {
            allSlotsBtn.addEventListener('click', () => {
                if (filterMode === 'all') {
                    showToast('ℹ️ Все слоты уже отображаются', 1500);
                    return;
                }
                
                filterMode = 'all';
                updateActiveButtonState();
                updateBookingsCount();
                renderCards();
            });
        }

        updateActiveButtonState();
        
        // ===== ПОДКЛЮЧЕНИЕ WEBSOCKET (В САМОМ КОНЦЕ) =====
        const WS_URL = 'ws://localhost:8080/ws';
        wsManager = new WebSocketManager(WS_URL, handleWebSocketMessage);
>>>>>>> Stashed changes
    }
    
    init();
    
}); // Конец DOMContentLoaded