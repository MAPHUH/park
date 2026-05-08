// ========== 1. КОНФИГУРАЦИЯ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
// Дни недели для отображения
const daysOfWeekFull = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
// Месяцы в родительном падеже для красивого отображения даты
const monthNamesGenitive = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// Настройки доступности по дням недели (0 = воскресенье, 1 = понедельник, ...)
let daySettings = {
    0: { active: false, greenStart: "10:00", greenEnd: "18:00" },  // воскресенье
    1: { active: true,  greenStart: "09:00", greenEnd: "21:00" },  // понедельник
    2: { active: true,  greenStart: "09:00", greenEnd: "21:00" },  // вторник
    3: { active: true,  greenStart: "09:00", greenEnd: "21:00" },  // среда
    4: { active: true,  greenStart: "09:00", greenEnd: "21:00" },  // четверг
    5: { active: true,  greenStart: "09:00", greenEnd: "20:00" },  // пятница
    6: { active: false, greenStart: "12:00", greenEnd: "16:00" }   // суббота
};

// Массив броней (записей пользователя)
// Каждая бронь: { id, dayIndex, dateStr, startMin, endMin, startTime, endTime }
let bookings = [];

// Настройки времени
let stepMinutes = 60;      // шаг сетки (30 или 60 минут)
let defaultDuration = 60;  // длительность матча (60, 90, 120 минут)

// ========== 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

// Переводит время "14:30" в минуты (870)
function timeToMinutes(timeStr) {
    let [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
}

// Переводит минуты (870) во время "14:30"
function minutesToTime(min) {
    let h = Math.floor(min / 60);
    let m = min % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
}

// Форматирует дату в красивый вид: "Понедельник, 04 мая 2026"
function formatFullDate(dateObj, dayFullName) {
    let dayNum = dateObj.getDate();
    let formattedDayNum = dayNum < 10 ? '0' + dayNum : dayNum;
    let monthName = monthNamesGenitive[dateObj.getMonth()];
    let year = dateObj.getFullYear();
    return `${dayFullName}, ${formattedDayNum} ${monthName} ${year}`;
}

// Возвращает массив следующих 7 дней с датами
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

// Проверяет, входит ли время в "зеленую зону" (доступное время для записи)
function isInGreenZone(dayIndex, minuteOfDay) {
    let sett = daySettings[dayIndex];
    if (!sett.active) return false;
    let startMin = timeToMinutes(sett.greenStart);
    let endMin = timeToMinutes(sett.greenEnd);
    return (minuteOfDay >= startMin && minuteOfDay < endMin);
}

// Получает все слоты для конкретного дня
function getSlotsForDay(dayObj) {
    let slots = [];
    let totalMinutes = 24 * 60;
    for (let t = 0; t < totalMinutes; t += stepMinutes) {
        let startMin = t;
        let endMin = Math.min(t + stepMinutes, totalMinutes);
        if (!isInGreenZone(dayObj.dayIndex, startMin)) continue;
        if (endMin > totalMinutes) continue;
        
        // Находим брони на этот слот
        let slotBookings = bookings.filter(b => 
            b.dayIndex === dayObj.dayIndex && 
            b.dateStr === dayObj.dateStr && 
            b.startMin === startMin
        );
        let bookedCount = slotBookings.length;
        let status = 'available';   // свободно (0/2)
        if (bookedCount === 1) status = 'partial';  // частично (1/2)
        if (bookedCount >= 2) status = 'full';      // полностью (2/2)
        
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

// Получает все слоты на 7 дней вперед (плоский список)
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

// ========== 3. ОТРИСОВКА КАРТОЧЕК ==========
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
    
    // Добавляем обработчики клика на все карточки
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

// ========== 4. УПРАВЛЕНИЕ ЗАПИСЯМИ ==========

// Обработка записи на слот
function handleBooking(dayIndex, dateStr, startMin, endMin) {
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
    let confirmMsg = `🎾 Запись на теннис\n📅 ${niceDate}\n⏰ ${startTime} — ${endTime}\nМест осталось: ${2 - existing.length}\nЗаписаться?`;
    
    if (confirm(confirmMsg)) {
        let newId = Date.now() + Math.random() * 10000;
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
        renderCards();
        renderMyBookings();
    }
}

// Отмена записи по ID
function cancelBookingById(bookingId) {
    let booking = bookings.find(b => b.id == bookingId);
    if (!booking) return false;
    
    let week = getNext7Days();
    let dayInfo = week.find(d => d.dateStr === booking.dateStr);
    let niceDate = dayInfo ? dayInfo.displayDate : booking.dateStr;
    
    if (confirm(`Отменить запись?\n📅 ${niceDate}\n⏰ ${booking.startTime} — ${booking.endTime}`)) {
        bookings = bookings.filter(b => b.id !== bookingId);
        showToast("❌ Запись отменена", 1200);
        renderCards();
        renderMyBookings();
        return true;
    }
    return false;
}

// Отрисовка блока "Мои записи" и обновление счетчика на кнопке
function renderMyBookings() {
    const container = document.getElementById('myBookingsList');
    if (!container) return;
    
    // Обновляем счетчик на кнопке
    const bookingsCountBadge = document.getElementById('bookingsCountBadge');
    if (bookingsCountBadge) {
        bookingsCountBadge.textContent = bookings.length;
    }
    
    if (bookings.length === 0) {
        container.innerHTML = '<div style="padding: 12px; text-align:center;">🎾 Нет активных записей. Нажмите на карточку.</div>';
        return;
    }
    
    // Сортируем записи по дате и времени
    let sorted = [...bookings].sort((a, b) => {
        if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
        return a.startMin - b.startMin;
    });
    
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
    
    // Добавляем обработчики на кнопки отмены
    document.querySelectorAll('.cancel-mini').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            let id = parseFloat(btn.dataset.id);
            cancelBookingById(id);
        });
    });
}

// ========== 5. ВСПЛЫВАЮЩИЕ УВЕДОМЛЕНИЯ ==========
function showToast(msg, duration = 1800) {
    let toast = document.getElementById('toastMsg');
    toast.innerText = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

// ========== 6. АДМИН-ПАНЕЛЬ (НАСТРОЙКИ) ==========

// Создает интерфейс для настройки каждого дня недели
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
    
    // Обработчики изменений
    document.querySelectorAll('.dayActiveCheck').forEach(cb => {
        cb.addEventListener('change', (e) => {
            let day = parseInt(e.target.dataset.day);
            daySettings[day].active = e.target.checked;
            renderCards();
            renderMyBookings();
        });
    });
    
    document.querySelectorAll('.greenStartInput').forEach(inp => {
        inp.addEventListener('change', (e) => {
            let day = parseInt(e.target.dataset.day);
            daySettings[day].greenStart = e.target.value;
            renderCards();
            renderMyBookings();
        });
    });
    
    document.querySelectorAll('.greenEndInput').forEach(inp => {
        inp.addEventListener('change', (e) => {
            let day = parseInt(e.target.dataset.day);
            daySettings[day].greenEnd = e.target.value;
            renderCards();
            renderMyBookings();
        });
    });
}

// ========== 7. УПРАВЛЕНИЕ ТЕМОЙ (С СОХРАНЕНИЕМ) ==========
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

// ========== 8. ИНИЦИАЛИЗАЦИЯ ==========
function init() {
    // Создаем UI админ-панели
    buildDayTogglesUI();
    
    // Отрисовываем карточки и записи
    renderCards();
    renderMyBookings();
    
    // Настраиваем тему
    initTheme();
    
    // Кнопка открытия/закрытия админ-панели
    const adminBtn = document.getElementById('adminToggleBtn');
    const adminPanel = document.getElementById('adminPanel');
    adminBtn.addEventListener('click',