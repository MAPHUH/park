/* ==========================================================================
   ТЕННИС КОРТ — ПОЛНАЯ ВЕРСИЯ
   WebSocket + вибрация + фильтр "Моя регистрация" + прозрачный статус-бар
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // ===== КОНСТАНТЫ =====
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
    // Массив бронирований
    window.bookings = window.bookings || [];
    
    // WebSocket менеджер
    let wsManager = null;
    // Настройки сетки
    let stepMinutes = 60;
    let defaultDuration = 60;
    
    // Состояние фильтра
    let filterMode = 'all';
    
    // ===== АУТЕНТИФИКАЦИЯ =====
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
    
    // ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
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
    
    function getUserBookingForSlot(dayIndex, dateStr, startMin) {
        return window.bookings.find(b => 
            b.userId === currentUserId &&
            b.dayIndex === dayIndex && 
            b.dateStr === dateStr && 
            b.startMin === startMin
        );
    }
    
    // ===== ГЕНЕРАЦИЯ СЛОТОВ =====
    function getSlotsForDay(dayObj) {
        let slots = [];
        let totalMinutes = 24 * 60;
        
        for (let t = 0; t < totalMinutes; t += stepMinutes) {
            let startMin = t;
            let endMin = Math.min(t + stepMinutes, totalMinutes);
            
            if (!isInGreenZone(dayObj.dayIndex, startMin)) continue;
            if (endMin > totalMinutes) continue;
            
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
                isUserBooked: isUserBooked
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
    
    function getFilteredSlots() {
        const allSlots = getAllFlatSlots();
        if (filterMode === 'all') {
            return allSlots;
        } else {
            return allSlots.filter(slot => slot.isUserBooked === true);
        }
    }
    
    // ===== ВИБРАЦИЯ =====
    function vibrate(duration) {
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(duration);
        }
    }
    
    // ===== TOAST =====
    function showToast(msg, duration = 1800) {
        let toast = document.getElementById('toastMsg');
        toast.innerText = msg;
        toast.style.opacity = '1';
        setTimeout(() => { toast.style.opacity = '0'; }, duration);
    }
    
    // ===== ОБНОВЛЕНИЕ СЧЁТЧИКА =====
    function updateBookingsCount() {
        const myBookings = window.bookings.filter(b => b.userId === currentUserId);
        const count = myBookings.length;
        
        const myRegBtn = document.getElementById('myRegistrationsBtn');
        if (myRegBtn) {
            const badge = myRegBtn.querySelector('#bookingsCountBadge');
            if (badge) {
                badge.textContent = count;
            }
        }
    }
        // ===== ОБРАБОТКА СООБЩЕНИЙ ОТ СЕРВЕРА =====
    function handleWebSocketMessage(data) {
        console.log('📨 Получено от сервера:', data);
        
        if (data.type === 'sync') {
            const newBookings = [];
            for (const slot of data.payload.slots) {
                for (const userId of slot.bookedUsers) {
                    newBookings.push({
                        id: `${slot.slotId}_${userId}`,
                        userId: userId,
                        dayIndex: new Date(slot.dateStr).getDay(),
                        dateStr: slot.dateStr,
                        startMin: slot.startMin,
                        endMin: slot.endMin,
                        startTime: minutesToTime(slot.startMin),
                        endTime: minutesToTime(slot.endMin),
                    });
                }
            }
            window.bookings = newBookings;
            renderCards();
            updateBookingsCount();
            showToast('🔄 Данные синхронизированы', 1000);
            
        } else if (data.type === 'update') {
            updateSlotFromServer(data.payload);
            renderCards();
            updateBookingsCount();
            
        } else if (data.type === 'error') {
            vibrate(200);
            showToast('❌ ' + (data.message || 'Ошибка сервера'), 2000);
            if (wsManager && wsManager.isConnected) {
                wsManager.send({ type: 'get_sync' });
            }
        }
    }
    
    function updateSlotFromServer(payload) {
        console.log('🔄 updateSlotFromServer получил:', payload);
        
        window.bookings = window.bookings.filter(b => 
            !(b.dateStr === payload.dateStr && b.startMin === payload.startMin)
        );
        
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
        
        renderCards();
        updateBookingsCount();
    }
    
    // ===== ОТМЕНА ЗАПИСИ (БЕЗ ПОДТВЕРЖДЕНИЯ) =====
    function cancelBooking(dayIndex, dateStr, startMin) {
        const booking = getUserBookingForSlot(dayIndex, dateStr, startMin);
        if (!booking) return false;
        
        const slotId = `${dateStr}_${startMin}`;
        
        // Оптимистичное удаление из UI
        window.bookings = window.bookings.filter(b => b.id !== booking.id);
        renderCards();
        updateBookingsCount();
        vibrate(200);
        showToast("❌ Отмена отправлена", 1200);
        
        if (wsManager && wsManager.isConnected) {
            wsManager.cancelSlot(slotId, currentUserId);
        }
        return true;
    }
    
    // ===== ЗАПИСЬ НА СЛОТ (БЕЗ ПОДТВЕРЖДЕНИЯ) =====
    function handleBooking(dayIndex, dateStr, startMin, endMin) {
        const slotId = `${dateStr}_${startMin}`;
        
        const existingUserBooking = getUserBookingForSlot(dayIndex, dateStr, startMin);
        if (existingUserBooking) {
            vibrate(200);
            showToast('❌ Вы уже записаны на этот слот', 1300);
            return;
        }
        
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
        
        if (wsManager && wsManager.isConnected) {
            wsManager.bookSlot(slotId, currentUserId);
        } else {
            console.warn('WebSocket не подключён');
        }
    }
    
    // ===== ОТРИСОВКА КАРТОЧЕК =====
    function renderCards() {
        const container = document.getElementById('slotsContainer');
        if (!container) return;
        
        const slots = getFilteredSlots();
        
        if (filterMode === 'my' && slots.length === 0) {
            vibrate(200);
            showToast('📭 У вас нет активных записей', 1500);
            container.innerHTML = `<div style="text-align:center; padding:40px;">✨ У вас нет записей. Нажмите "Все слоты" чтобы посмотреть слоты.</div>`;
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
            
            if (slot.status === 'available') {
                statusClass = 'available';
                statusText = '🟢 Свободно (2 места)';
                leftIcon = '🎾';
            } else if (slot.status === 'partial') {
                statusClass = 'partial';
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
        
        document.querySelectorAll('.card-slot').forEach(card => {
            const isUserBooked = card.dataset.userBooked === 'true';
            const status = card.dataset.status;
            const dayIdx = parseInt(card.dataset.dayidx);
            const dateStr = card.dataset.datestr;
            const startMin = parseInt(card.dataset.startmin);
            const endMin = parseInt(card.dataset.endmin);
            
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                
                if (e.target.classList && e.target.classList.contains('cancel-slot-btn')) {
                    return;
                }
                
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
    
    // ===== АДМИН-ПАНЕЛЬ =====
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
    
    // ===== ТЕМА =====
    function initTheme() {
        const savedTheme = localStorage.getItem('tennis_theme');
        const themeBtn = document.getElementById('themeToggleBtn');
        
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
        updateThemeColor();
        
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
            updateThemeColor();
        });
    }
    // ===== ОБНОВЛЕНИЕ АКТИВНОГО СОСТОЯНИЯ КНОПОК =====
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
    
    // ===== ИНИЦИАЛИЗАЦИЯ =====
    function init() {
        buildDayTogglesUI();
        renderCards();
        updateBookingsCount();
        initTheme();
        
        const adminBtn = document.getElementById('adminToggleBtn');
        const adminPanel = document.getElementById('adminPanel');
        adminBtn.addEventListener('click', () => {
            adminPanel.classList.toggle('open');
        });
        
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
        // Кнопка "Моя регистрация"
        const myRegistrationsBtn = document.getElementById('myRegistrationsBtn');
        if (myRegistrationsBtn) {
            myRegistrationsBtn.addEventListener('click', () => {
                if (filterMode === 'my') {
                    showToast('ℹ️ Вы уже в режиме фильтра', 1500);
                    return;
                }
                
                const myBookingsCount = window.bookings.filter(b => b.userId === currentUserId).length;
                if (myBookingsCount === 0) {
                    showToast('📭 У вас нет активных записей', 1500);
                    return;
                }
                
                filterMode = 'my';
                updateActiveButtonState();
                updateBookingsCount();
                renderCards();
            });
        }
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
        
        // Установить начальное активное состояние
        updateActiveButtonState();
        
        // ===== ПОДКЛЮЧЕНИЕ WEBSOCKET =====
        const WS_URL = 'ws://localhost:8080/ws';
        wsManager = new WebSocketManager(WS_URL, handleWebSocketMessage);
        console.log('🔌 WebSocket менеджер создан');
    }
    
    init();
});