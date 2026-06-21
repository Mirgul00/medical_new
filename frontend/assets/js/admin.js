(function () {
  const adminApiRoot =
    window.API_ROOT ||
    window.APP_CONFIG?.API_ROOT ||
    "";

  const SLOT_TIMES = generateTimeSlots("09:00", "18:00", 30);
  const STATUS_LABELS = {
    new: "Новая",
    confirmed: "Подтверждена",
    completed: "Завершена",
    cancelled: "Отменена",
  };
  const SERVICE_COLORS = [
    ["#1677ff", "#e8f3ff"],
    ["#22c7ee", "#e6faff"],
    ["#12b76a", "#ecfdf3"],
    ["#f79009", "#fff7ed"],
    ["#7c3aed", "#f3e8ff"],
    ["#f04438", "#fff2f0"],
  ];

  const state = {
    view: "calendar",
    appointments: [],
    services: [],
    certificates: [],
    beforeAfterCases: [],
    reviews: [],
    schedule: null,
    siteSettings: {},
    closedSlots: [],
    clients: [],
    calendarDate: formatDate(new Date()),
    calendarMode: "day",
    editingServiceId: null,
    editingCertificateId: null,
    editingBeforeAfterId: null,
  };

function getToken() {
  return localStorage.getItem("token");
}

 if (!getToken()) {
  window.location.href = "login.html";
  return;
}

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function formatDate(date) {
    const item = new Date(date);
    return [
      item.getFullYear(),
      String(item.getMonth() + 1).padStart(2, "0"),
      String(item.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function generateTimeSlots(start, end, stepMinutes) {
    const slots = [];
    const current = new Date(`2026-01-01T${start}:00`);
    const finish = new Date(`2026-01-01T${end}:00`);

    while (current <= finish) {
      slots.push(current.toTimeString().slice(0, 5));
      current.setMinutes(current.getMinutes() + stepMinutes);
    }

    return slots;
  }

  function addMinutes(time, minutes) {
    const date = new Date(`2026-01-01T${time || "09:00"}:00`);
    date.setMinutes(date.getMinutes() + minutes);
    return date.toTimeString().slice(0, 5);
  }

  function today() {
    return formatDate(new Date());
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function safeJson(response, fallback = null) {
    const text = await response.text();

    if (!text) return fallback;

    try {
      return JSON.parse(text);
    } catch (error) {
      console.error("Invalid JSON response", error);
      return fallback;
    }
  }
  let isLoggingOut = false;
  async function api(path, options = {}, fallback = null) {
  const token = getToken();

  if (!token) {
    window.location.href = "login.html";
    throw new Error("No token");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${adminApiRoot}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  const data = await safeJson(response, fallback);
  
  if (response.status === 401) {
    if (!isLoggingOut) {
      isLoggingOut = true;
      localStorage.removeItem("token");
      window.location.href = "login.html";
    }
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || data?.detail || "API request failed");
  }

  return data;
}

  async function uploadImageFromInput(inputId) {
    const input = document.getElementById(inputId);
    const file = input?.files?.[0];

    if (!file) return "";

    const form = new FormData();
    form.append("file", file);
    const result = await api("/upload-image", { method: "POST", body: form }, {});
    return result?.path || "";
  }

  async function uploadImageFromElement(input) {
    const file = input?.files?.[0];
    if (!file) return "";

    const form = new FormData();
    form.append("file", file);
    const result = await api("/upload-image", { method: "POST", body: form }, {});
    return result?.path || "";
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function parsePrice(value) {
    const number = String(value || "").replace(",", ".").match(/\d+(\.\d+)?/);
    return number ? Number(number[0]) : 0;
  }

  function getServicePrice(title) {
    const service = state.services.find((item) => item.title === title);
    return parsePrice(service?.price);
  }

  function getWorkTimes() {
    const start = state.schedule?.start_time || SLOT_TIMES[0];
    const end = state.schedule?.end_time || SLOT_TIMES[SLOT_TIMES.length - 1];
    const breakStart = state.schedule?.break_start || "";
    const breakEnd = state.schedule?.break_end || "";

    return SLOT_TIMES.filter((time) => {
      const inWorkRange = time >= start && time <= end;
      const inBreak = breakStart && breakEnd && time >= breakStart && time < breakEnd;
      return inWorkRange && !inBreak;
    });
  }

  function isWorkDay(dateString) {
    const workDays = (state.schedule?.work_days || "1,2,3,4,5")
      .split(",")
      .filter(Boolean);
    const date = new Date(`${dateString}T00:00:00`);
    return workDays.includes(String(date.getDay()));
  }

  function appointmentBusy(item) {
    return item.status !== "cancelled";
  }

  function appointmentsByDate(dateString) {
    return state.appointments
      .filter((item) => item.date === dateString)
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }

  function closedSlotsByDate(dateString) {
    return state.closedSlots.filter((item) => item.date === dateString);
  }

  function freeSlotsForDate(dateString) {
    if (!isWorkDay(dateString)) return [];

    const busy = new Set();

    appointmentsByDate(dateString)
      .filter(appointmentBusy)
      .forEach((item) => {
        SLOT_TIMES
          .filter((time) => time >= item.time && time < appointmentEnd(item))
          .forEach((time) => busy.add(time));
      });

    closedSlotsByDate(dateString).forEach((slot) => busy.add(slot.time));
    return getWorkTimes().filter((time) => !busy.has(time));
  }

  function isWorkSlot(dateString, time) {
    return isWorkDay(dateString) && getWorkTimes().includes(time);
  }

  function parseDurationMinutes(value) {
    const match = String(value || "").match(/\d+/);
    return match ? Number(match[0]) : 60;
  }

  function appointmentRange(item) {
    const service = state.services.find((entry) => entry.title === item.procedure);
    const minutes = parseDurationMinutes(service?.duration);
    return `${item.time}-${addMinutes(item.time, minutes)}`;
  }

  function appointmentEnd(item) {
    const service = state.services.find((entry) => entry.title === item.procedure);
    return addMinutes(item.time, parseDurationMinutes(service?.duration));
  }

  function appointmentForSlot(dateString, time) {
    return appointmentsByDate(dateString).find((item) => {
      return appointmentBusy(item) && time >= item.time && time < appointmentEnd(item);
    });
  }

  function serviceColor(procedure) {
    const index = Math.abs(
      String(procedure || "")
        .split("")
        .reduce((sum, char) => sum + char.charCodeAt(0), 0)
    ) % SERVICE_COLORS.length;
    const [accent, surface] = SERVICE_COLORS[index];
    return `--service-accent:${accent};--service-surface:${surface};`;
  }

  function renderStatusBadge(status) {
    return `<span class="status-tag ${status || "new"}">${STATUS_LABELS[status] || status || "Новая"}</span>`;
  }

  function renderEmpty(text) {
    return `<div class="empty-state"><i class="ri-inbox-line"></i><span>${escapeHtml(text)}</span></div>`;
  }

  function showMessage(text, type = "error") {
    let box = $("#adminMessage");

    if (!box) {
      box = document.createElement("div");
      box.id = "adminMessage";
      box.className = "admin-message";
      document.body.appendChild(box);
    }

    box.textContent = text;
    box.className = `admin-message ${type} show`;
    window.clearTimeout(showMessage.timer);
    showMessage.timer = window.setTimeout(() => {
      box.classList.remove("show");
    }, 3200);
  }

  function setView(view) {
    state.view = view;
    $all(".admin-view").forEach((section) => {
      section.classList.toggle("active", section.id === `view-${view}`);
    });
    $all("[data-view-link]").forEach((button) => {
      button.classList.toggle("active", button.dataset.viewLink === view);
    });

    const titles = {
      calendar: "Календарь",
      bookings: "Записи",
      clients: "Клиенты",
      services: "Услуги",
      certificates: "Сертификаты",
      "before-after": "До / После",
      schedule: "Расписание",
      reviews: "Отзывы",
      settings: "Настройки",
    };

    setText("pageTitle", titles[view] || "Админ-панель");
  }

  function renderAdminMetrics() {
    setText("notificationCount", state.appointments.filter((item) => item.status === "new").length);
    setText("topbarNotificationCount", state.appointments.filter((item) => item.status === "new").length);
    setText(
      "todayDate",
      new Date().toLocaleDateString("ru-RU", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    );

    const selectedDayAppointments = appointmentsByDate(state.calendarDate).filter(appointmentBusy);
    const selectedDayRevenue = selectedDayAppointments
      .filter((item) => ["confirmed", "completed"].includes(item.status))
      .reduce((sum, item) => sum + getServicePrice(item.procedure), 0);
    const firstAppointmentByPhone = new Map();

    state.appointments
      .slice()
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .forEach((item) => {
        if (!firstAppointmentByPhone.has(item.phone)) {
          firstAppointmentByPhone.set(item.phone, item.date);
        }
      });

    const newClientsToday = selectedDayAppointments.filter(
      (item) => firstAppointmentByPhone.get(item.phone) === state.calendarDate
    ).length;

    setText("calendarTodayCount", selectedDayAppointments.length);
    setText("calendarFreeCount", freeSlotsForDate(state.calendarDate).length);
    setText("calendarRevenueCount", selectedDayRevenue ? `${selectedDayRevenue}` : "0");
    setText("calendarNewClientsCount", newClientsToday);
  }

  function renderAppointmentCard(item) {
    return `
      <button class="appointment-card ${item.status || "new"}" style="${serviceColor(item.procedure)}" type="button" data-open-appointment="${item.id}">
        <span class="appointment-time">${escapeHtml(appointmentRange(item))}</span>
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(item.procedure)}</small>
        <small>${escapeHtml(item.phone)}</small>
        ${renderStatusBadge(item.status)}
      </button>
    `;
  }

  function renderCalendar() {
    const input = $("#calendarDate");
    if (input && input.value !== state.calendarDate) {
      input.value = state.calendarDate;
    }

    const date = new Date(`${state.calendarDate}T00:00:00`);
    setText(
      "calendarDayTitle",
      date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })
    );
    setText("miniCalendarTitle", date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }));

    renderMiniCalendar(date);
    renderCalendarSchedule();
    renderAdminMetrics();
  }

  function renderMiniCalendar(date) {
    const box = $("#miniCalendar");
    if (!box) return;

    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const firstDay = first.getDay() || 7;
    const days = new Date(year, month + 1, 0).getDate();
    const cells = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => `<span>${day}</span>`);

    for (let i = 1; i < firstDay; i++) {
      cells.push("<em></em>");
    }

    for (let day = 1; day <= days; day++) {
      const dateString = formatDate(new Date(year, month, day));
      const count = appointmentsByDate(dateString).filter(appointmentBusy).length;
      cells.push(`
        <button class="${dateString === state.calendarDate ? "active" : ""}" data-calendar-day="${dateString}" type="button">
          ${day}
          ${count ? `<small>${count}</small>` : ""}
        </button>
      `);
    }

    box.innerHTML = cells.join("");
  }

  function renderCalendarSchedule() {
    const box = $("#calendarSchedule");
    if (!box) return;

    if (state.calendarMode === "month") {
      renderMonthSchedule(box);
      return;
    }

    if (state.calendarMode === "week") {
      renderWeekSchedule(box);
      return;
    }

    const rows = SLOT_TIMES.map((time) => renderTimeRow(state.calendarDate, time));
    const free = freeSlotsForDate(state.calendarDate);

    box.innerHTML = `
      <div class="free-slots">
        <span>Свободные слоты</span>
        ${free.length ? free.map((time) => `<b>${time}</b>`).join("") : "<small>Нет свободных слотов</small>"}
      </div>
      ${rows.join("") || renderEmpty("В этот день приёма нет")}
    `;
  }

  function renderWeekSchedule(box) {
    const start = new Date(`${state.calendarDate}T00:00:00`);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return formatDate(date);
    });

    box.innerHTML = `
      <div class="week-board">
        ${days.map((dateString) => `
          <div class="week-day ${dateString === state.calendarDate ? "active" : ""}">
            <button type="button" data-calendar-day="${dateString}">
              ${new Date(`${dateString}T00:00:00`).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" })}
            </button>
            ${appointmentsByDate(dateString).length
              ? appointmentsByDate(dateString).map(renderAppointmentCard).join("")
              : `<small>${freeSlotsForDate(dateString).length} свободных слотов</small>`}
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderMonthSchedule(box) {
    const date = new Date(`${state.calendarDate}T00:00:00`);
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();

    box.innerHTML = `
      <div class="month-board">
        ${Array.from({ length: days }, (_, index) => {
          const dateString = formatDate(new Date(year, month, index + 1));
          const count = appointmentsByDate(dateString).filter(appointmentBusy).length;
          return `
            <button class="${dateString === state.calendarDate ? "active" : ""}" data-calendar-day="${dateString}" type="button">
              <span>${index + 1}</span>
              <strong>${count}</strong>
              <small>${freeSlotsForDate(dateString).length} free</small>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderTimeRow(dateString, time) {
    const appointment = appointmentForSlot(dateString, time);
    const closed = closedSlotsByDate(dateString).find((item) => item.time === time);

    if (appointment && appointment.time === time) {
      return `
        <div class="time-row busy">
          <span>${time}</span>
          ${renderAppointmentCard(appointment)}
        </div>
      `;
    }

    if (appointment) {
      return `
        <div class="time-row busy continuation">
          <span>${time}</span>
          <div>
            <strong>Занято</strong>
            <small>${escapeHtml(appointment.name)} · до ${escapeHtml(appointmentEnd(appointment))}</small>
          </div>
        </div>
      `;
    }

    if (closed) {
      return `
        <div class="time-row closed">
          <span>${time}</span>
          <div>
            <strong>Слот закрыт</strong>
            <small>${escapeHtml(closed.reason || "Недоступно")}</small>
          </div>
        </div>
      `;
    }

    if (!isWorkSlot(dateString, time)) {
      return `
        <div class="time-row off">
          <span>${time}</span>
          <div>
            <strong>Вне рабочего времени</strong>
            <small>Слот не открыт для записи</small>
          </div>
        </div>
      `;
    }

    return `
      <div class="time-row free">
        <span>${time}</span>
        <div>
          <strong>Свободно</strong>
          <small>Можно записать клиента</small>
        </div>
      </div>
    `;
  }

  function filteredAppointments() {
    const search = ($("#bookingSearch")?.value || "").trim().toLowerCase();
    const date = $("#bookingDateFilter")?.value || "";
    const status = $("#bookingStatusFilter")?.value || "";

    return state.appointments.filter((item) => {
      const matchesSearch =
        !search ||
        String(item.name || "").toLowerCase().includes(search) ||
        String(item.phone || "").toLowerCase().includes(search);
      const matchesDate = !date || item.date === date;
      const matchesStatus = !status || item.status === status;

      return matchesSearch && matchesDate && matchesStatus;
    });
  }

  function renderBookings() {
    const table = $("#bookingsTable");
    if (!table) return;

    const data = filteredAppointments()
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

    table.innerHTML = data.length
      ? data.map((item) => `
        <tr>
          <td><button class="link-button" data-open-appointment="${item.id}" type="button">${escapeHtml(item.name)}</button></td>
          <td>${escapeHtml(item.phone)}</td>
          <td>${escapeHtml(item.procedure)}</td>
          <td>${escapeHtml(item.date)}</td>
          <td>${escapeHtml(item.time)}</td>
          <td>${renderStatusBadge(item.status)}</td>
          <td>
            <div class="action-row">
              <button class="success" data-status-action="confirmed" data-id="${item.id}" type="button">Подтвердить</button>
              <button class="neutral" data-status-action="completed" data-id="${item.id}" type="button">Завершить</button>
              <button class="warning" data-status-action="cancelled" data-id="${item.id}" type="button">Отменить</button>
              <button class="danger" data-delete-appointment="${item.id}" type="button">Удалить</button>
            </div>
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="7">${renderEmpty("Записей по фильтрам не найдено")}</td></tr>`;
  }

  function renderServices() {
    const box = $("#servicesList");
    if (!box) return;

    box.innerHTML = state.services.length
      ? state.services.map((service) => `
        <article class="service-card ${service.active ? "active" : "inactive"}">
          <div>
            <h3>${escapeHtml(service.title)}</h3>
            <p>${escapeHtml(service.description || "Описание не указано")}</p>
            <small>${escapeHtml(service.price || "Цена не указана")} · ${escapeHtml(service.category || "Категория не указана")}</small>
          </div>
          <div class="service-actions">
            <span class="service-pill ${service.active ? "active" : "inactive"}">${service.active ? "Активна" : "Скрыта"}</span>
            <button data-edit-service="${service.id}" type="button">Редактировать</button>
            <button class="danger" data-delete-service="${service.id}" type="button">Удалить</button>
          </div>
        </article>
      `).join("")
      : renderEmpty("Услуг пока нет");

    const procedureSelect = $("#adminBookingProcedure");
    if (procedureSelect) {
      procedureSelect.innerHTML = `
        <option value="">Выберите процедуру</option>
        ${state.services
          .filter((service) => service.active)
          .map((service) => `<option value="${escapeHtml(service.title)}">${escapeHtml(service.title)}</option>`)
          .join("")}
      `;
    }
  }

  function renderCertificates() {
    const box = $("#certificatesList");
    if (!box) return;

    box.innerHTML = state.certificates.length
      ? state.certificates.map((certificate) => `
        <article class="service-card ${certificate.active ? "active" : "inactive"}">
          <div>
            <h3>${escapeHtml(certificate.title)}</h3>
            <p>${escapeHtml(certificate.description || "Описание не указано")}</p>
            <small>${escapeHtml(certificate.year || "Год не указан")} · ${escapeHtml(certificate.tags || "Теги не указаны")}</small>
          </div>
          <div class="service-actions">
            <span class="service-pill ${certificate.active ? "active" : "inactive"}">${certificate.active ? "Виден" : "Скрыт"}</span>
            <button data-edit-certificate="${certificate.id}" type="button">Редактировать</button>
            <button class="danger" data-delete-certificate="${certificate.id}" type="button">Удалить</button>
          </div>
        </article>
      `).join("")
      : renderEmpty("Сертификатов пока нет");
  }

  function renderBeforeAfterCases() {
    const box = $("#beforeAfterList");
    if (!box) return;

    box.innerHTML = state.beforeAfterCases.length
      ? state.beforeAfterCases.map((item) => `
        <article class="service-card ${item.active ? "active" : "inactive"}">
          <div>
            <div class="before-after-preview">
              ${item.before_image ? `<img src="${escapeHtml(item.before_image)}" alt="До">` : "<span>До</span>"}
              ${item.after_image ? `<img src="${escapeHtml(item.after_image)}" alt="После">` : "<span>После</span>"}
            </div>
            <h3>${escapeHtml(item.title || "Кейс до / после")}</h3>
            <p>${escapeHtml(item.description || "Описание не указано")}</p>
            <small>${escapeHtml(item.procedure || "Процедура не указана")} · ${escapeHtml(item.result || "Результат не указан")}</small>
          </div>
          <div class="service-actions">
            <span class="service-pill ${item.active ? "active" : "inactive"}">${item.active ? "Виден" : "Скрыт"}</span>
            <button data-edit-before-after="${item.id}" type="button">Редактировать</button>
            <button class="danger" data-delete-before-after="${item.id}" type="button">Удалить</button>
          </div>
        </article>
      `).join("")
      : renderEmpty("Кейсов до / после пока нет");
  }

  function renderSchedule() {
    const workDays = (state.schedule?.work_days || "1,2,3,4,5").split(",");
    $all('input[name="workDay"]').forEach((input) => {
      input.checked = workDays.includes(input.value);
    });

    const fields = {
      scheduleStart: state.schedule?.start_time || "09:00",
      scheduleEnd: state.schedule?.end_time || "16:00",
      breakStart: state.schedule?.break_start || "",
      breakEnd: state.schedule?.break_end || "",
      closedSlotDate: state.calendarDate,
    };

    Object.entries(fields).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input && !input.value) input.value = value;
    });

    const box = $("#closedSlotsList");
    if (box) {
      box.innerHTML = state.closedSlots.length
        ? state.closedSlots
            .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
            .map((slot) => `
              <div class="closed-slot">
                <span>${escapeHtml(slot.date)} · ${escapeHtml(slot.time)}</span>
                <small>${escapeHtml(slot.reason || "Без причины")}</small>
                <button class="danger" data-delete-closed-slot="${slot.id}" type="button">Открыть</button>
              </div>
            `).join("")
        : renderEmpty("Закрытых слотов нет");
    }
  }

  function renderClients() {
    const box = $("#clientsList");
    if (!box) return;

    const search = ($("#clientSearch")?.value || "").trim().toLowerCase();
    const data = state.clients.filter((client) => {
      return (
        !search ||
        String(client.name || "").toLowerCase().includes(search) ||
        String(client.phone || "").toLowerCase().includes(search)
      );
    });

    box.innerHTML = data.length
      ? data.map((client) => `
        <article class="client-card">
          <div>
            <h3>${escapeHtml(client.name)}</h3>
            <p>${escapeHtml(client.phone)}</p>
            <small>${client.appointments.length} записей</small>
          </div>
          <div class="client-history">
            ${client.appointments
              .slice()
              .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
              .slice(0, 4)
              .map((item) => `<span>${escapeHtml(item.date)} · ${escapeHtml(item.procedure)} · ${STATUS_LABELS[item.status] || item.status}</span>`)
              .join("")}
          </div>
          <textarea data-client-note="${escapeHtml(client.phone)}" placeholder="Комментарий администратора">${escapeHtml(client.note || "")}</textarea>
          <button class="ghost-button small" data-save-client-note="${escapeHtml(client.phone)}" type="button">Сохранить комментарий</button>
        </article>
      `).join("")
      : renderEmpty("Клиенты не найдены");
  }

  function renderReviews() {
    const box = $("#reviewsAdminList");
    if (!box) return;

    const reviews = [1, 2, 3].map((id) => {
      return state.reviews.find((item) => Number(item.id) === id) || {
        id,
        name: "",
        text: "",
        rating: 5,
        image: "",
      };
    });

    box.innerHTML = reviews.map((review) => `
      <form class="review-admin-card" data-review-form="${review.id}">
        <div class="review-admin-card__head">
          <span>Отзыв ${review.id}</span>
          <strong>${"★★★★★".slice(0, Math.max(1, Math.min(5, Number(review.rating) || 5)))}</strong>
        </div>
        ${review.image ? `<img class="review-admin-card__image" src="${escapeHtml(review.image)}" alt="${escapeHtml(review.name)}">` : ""}
        <input name="name" placeholder="Имя клиента" value="${escapeHtml(review.name)}" />
        <textarea name="text" placeholder="Текст отзыва">${escapeHtml(review.text)}</textarea>
        <select name="rating">
          ${[5, 4, 3, 2, 1].map((value) => `<option value="${value}" ${Number(review.rating) === value ? "selected" : ""}>${value} звезд</option>`).join("")}
        </select>
        <label class="review-upload">
          <input name="image" type="file" accept="image/*" />
          <span><i class="ri-image-add-line"></i> Фото клиента</span>
        </label>
        <input name="imagePath" type="hidden" value="${escapeHtml(review.image)}" />
        <button class="primary-button" type="submit">Сохранить отзыв</button>
        <p class="form-message" data-review-message="${review.id}"></p>
      </form>
    `).join("");
  }

  function renderAll() {
    renderAdminMetrics();
    renderCalendar();
    renderBookings();
    renderServices();
    renderCertificates();
    renderBeforeAfterCases();
    renderReviews();
    renderSchedule();
    renderClients();
    renderSiteSettings();
  }

  async function loadAll() {
    try {
      const [appointments, services, certificates, beforeAfterCases, reviews, schedule, closedSlots, clients, siteSettings] = await Promise.all([
        api("/appointments", {}, []),
        api("/services", {}, []),
        api("/certificates", {}, []),
        api("/before-after", {}, []),
        api("/reviews", {}, []),
        api("/schedule", {}, null),
        api("/closed-slots", {}, []),
        api("/clients", {}, []),
        api("/site-settings", {}, {}),
      ]);

      state.appointments = Array.isArray(appointments) ? appointments : [];
      state.services = Array.isArray(services) ? services : [];
      state.certificates = Array.isArray(certificates) ? certificates : [];
      state.beforeAfterCases = Array.isArray(beforeAfterCases) ? beforeAfterCases : [];
      state.reviews = Array.isArray(reviews) ? reviews.slice(0, 3) : [];
      state.schedule = schedule;
      state.closedSlots = Array.isArray(closedSlots) ? closedSlots : [];
      state.clients = Array.isArray(clients) ? clients : [];
      state.siteSettings = siteSettings || {};
      renderAll();
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Ошибка загрузки данных");
      renderAll();
    }
  }

  function renderSiteSettings() {
    const fields = {
      siteDoctorName: state.siteSettings.doctor_name || "",
      siteSpecialty: state.siteSettings.specialty || "",
      siteExperience: state.siteSettings.experience || "",
      siteClients: state.siteSettings.clients || "",
      sitePhone: state.siteSettings.phone || "",
      siteEmail: state.siteSettings.email || "",
      siteAddress: state.siteSettings.address || "",
      siteInstagram: state.siteSettings.instagram || "",
      siteTelegram: state.siteSettings.telegram || "",
      siteTiktok: state.siteSettings.tiktok || "",
    };

    Object.entries(fields).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input && document.activeElement !== input && input.value !== value) input.value = value;
    });
  }

  function openAppointmentModal(id) {
    const item = state.appointments.find((appointment) => appointment.id === Number(id));
    const modal = $("#appointmentModal");
    const content = $("#modalContent");

    if (!item || !modal || !content) return;

    content.innerHTML = `
      <p class="admin-eyebrow">Booking details</p>
      <h2>${escapeHtml(item.name)}</h2>
      <div class="modal-details">
        <span>Телефон <b>${escapeHtml(item.phone)}</b></span>
        <span>Процедура <b>${escapeHtml(item.procedure)}</b></span>
        <span>Дата <b>${escapeHtml(item.date)}</b></span>
        <span>Время <b>${escapeHtml(appointmentRange(item))}</b></span>
        <span>Статус <b>${STATUS_LABELS[item.status] || item.status}</b></span>
        <span>Комментарий <b>${escapeHtml(item.comment || "Нет комментария")}</b></span>
      </div>
      <div class="action-row modal-actions">
        <button class="success" data-status-action="confirmed" data-id="${item.id}" type="button">Подтвердить</button>
        <button class="neutral" data-status-action="completed" data-id="${item.id}" type="button">Завершить</button>
        <button class="warning" data-status-action="cancelled" data-id="${item.id}" type="button">Отменить</button>
        <button class="danger" data-delete-appointment="${item.id}" type="button">Удалить</button>
      </div>
    `;

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    const modal = $("#appointmentModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function openDrawer() {
    const drawer = $("#appointmentDrawer");
    if (!drawer) return;

    const date = $("#adminBookingDate");
    const time = $("#adminBookingTime");
    if (date && !date.value) date.value = state.calendarDate;
    if (time && !time.value) time.value = "09:00";

    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    const drawer = $("#appointmentDrawer");
    if (!drawer) return;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }

  async function updateAppointmentStatus(id, status) {
    const form = new FormData();
    form.append("status", status);
    await api(`/appointment/${id}`, { method: "PATCH", body: form }, {});
    await loadAll();
  }

  async function deleteAppointment(id) {
    if (!confirm("Удалить запись?")) return;
    await api(`/appointment/${id}`, { method: "DELETE" }, {});
    await loadAll();
  }

  function resetServiceForm() {
    state.editingServiceId = null;
    ["serviceId", "serviceTitle", "servicePrice", "serviceDuration", "serviceCategory", "serviceDescription", "serviceImage", "serviceImagePath"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });
    const active = $("#serviceActive");
    if (active) active.checked = true;
    setText("serviceImageLabel", "PNG, JPG, WEBP");
    setText("serviceSubmit", "Добавить услугу");
  }

  async function submitService(event) {
    event.preventDefault();

    const title = $("#serviceTitle")?.value.trim() || "";
    if (!title) {
      setText("serviceMessage", "Название услуги обязательно");
      return;
    }

    const uploadedImage = await uploadImageFromInput("serviceImage");
    const imagePath = uploadedImage || $("#serviceImagePath")?.value.trim() || "";

    const form = new FormData();
    form.append("title", title);
    form.append("price", $("#servicePrice")?.value.trim() || "");
    form.append("duration", $("#serviceDuration")?.value.trim() || "");
    form.append("category", $("#serviceCategory")?.value.trim() || "");
    form.append("description", $("#serviceDescription")?.value.trim() || "");
    form.append("image", imagePath);
    form.append("active", $("#serviceActive")?.checked ? "true" : "false");

    const path = state.editingServiceId ? `/service/${state.editingServiceId}` : "/service";
    const method = state.editingServiceId ? "PUT" : "POST";
    await api(path, { method, body: form }, {});
    resetServiceForm();
    setText("serviceMessage", "Услуга сохранена");
    await loadAll();
  }

  function editService(id) {
    const service = state.services.find((item) => item.id === Number(id));
    if (!service) return;

    state.editingServiceId = service.id;
    const fields = {
      serviceId: service.id,
      serviceTitle: service.title || "",
      servicePrice: service.price || "",
      serviceDuration: service.duration || "",
      serviceCategory: service.category || "",
      serviceDescription: service.description || "",
      serviceImagePath: service.image || "",
    };

    Object.entries(fields).forEach(([field, value]) => {
      const input = document.getElementById(field);
      if (input) input.value = value;
    });

    const active = $("#serviceActive");
    if (active) active.checked = Boolean(service.active);
    setText("serviceImageLabel", service.image ? `Текущее фото: ${service.image}` : "PNG, JPG, WEBP");
    setText("serviceSubmit", "Сохранить услугу");
    setView("services");
  }

  async function deleteService(id) {
    if (!confirm("Удалить услугу?")) return;
    await api(`/service/${id}`, { method: "DELETE" }, {});
    await loadAll();
  }

  function resetCertificateForm() {
    state.editingCertificateId = null;
    ["certificateId", "certificateTitle", "certificateYear", "certificateImage", "certificateImagePath", "certificateDescription", "certificateTags"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });
    const active = $("#certificateActive");
    if (active) active.checked = true;
    setText("certificateImageLabel", "PNG, JPG, WEBP");
    setText("certificateSubmit", "Добавить сертификат");
  }

  async function submitCertificate(event) {
    event.preventDefault();

    const title = $("#certificateTitle")?.value.trim() || "";
    if (!title) {
      setText("certificateMessage", "Название сертификата обязательно");
      return;
    }

    const uploadedImage = await uploadImageFromInput("certificateImage");
    const imagePath = uploadedImage || $("#certificateImagePath")?.value.trim() || "assets/img/about-img.png";

    const form = new FormData();
    form.append("title", title);
    form.append("year", $("#certificateYear")?.value.trim() || "");
    form.append("image", imagePath);
    form.append("description", $("#certificateDescription")?.value.trim() || "");
    form.append("tags", $("#certificateTags")?.value.trim() || "");
    form.append("active", $("#certificateActive")?.checked ? "true" : "false");

    const path = state.editingCertificateId ? `/certificate/${state.editingCertificateId}` : "/certificate";
    const method = state.editingCertificateId ? "PUT" : "POST";
    await api(path, { method, body: form }, {});
    resetCertificateForm();
    setText("certificateMessage", "Сертификат сохранен");
    await loadAll();
  }

  function editCertificate(id) {
    const certificate = state.certificates.find((item) => item.id === Number(id));
    if (!certificate) return;

    state.editingCertificateId = certificate.id;
    const fields = {
      certificateId: certificate.id,
      certificateTitle: certificate.title || "",
      certificateYear: certificate.year || "",
      certificateImagePath: certificate.image || "",
      certificateDescription: certificate.description || "",
      certificateTags: certificate.tags || "",
    };

    Object.entries(fields).forEach(([field, value]) => {
      const input = document.getElementById(field);
      if (input) input.value = value;
    });

    const active = $("#certificateActive");
    if (active) active.checked = Boolean(certificate.active);
    setText("certificateImageLabel", certificate.image ? `Текущее фото: ${certificate.image}` : "PNG, JPG, WEBP");
    setText("certificateSubmit", "Сохранить сертификат");
    setView("certificates");
  }

  async function deleteCertificate(id) {
    if (!confirm("Удалить сертификат?")) return;
    await api(`/certificate/${id}`, { method: "DELETE" }, {});
    await loadAll();
  }

  function resetBeforeAfterForm() {
    state.editingBeforeAfterId = null;
    [
      "beforeAfterId",
      "beforeAfterTitle",
      "beforeAfterDescription",
      "beforeAfterProcedure",
      "beforeAfterResult",
      "beforeAfterBeforeImage",
      "beforeAfterBeforePath",
      "beforeAfterAfterImage",
      "beforeAfterAfterPath",
    ].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });
    const active = $("#beforeAfterActive");
    if (active) active.checked = true;
    setText("beforeAfterBeforeLabel", "PNG, JPG, WEBP");
    setText("beforeAfterAfterLabel", "PNG, JPG, WEBP");
    setText("beforeAfterSubmit", "Добавить кейс");
  }

  async function submitBeforeAfter(event) {
    event.preventDefault();

    const uploadedBeforeImage = await uploadImageFromInput("beforeAfterBeforeImage");
    const uploadedAfterImage = await uploadImageFromInput("beforeAfterAfterImage");
    const beforeImagePath = uploadedBeforeImage || $("#beforeAfterBeforePath")?.value.trim() || "";
    const afterImagePath = uploadedAfterImage || $("#beforeAfterAfterPath")?.value.trim() || "";
    const title = $("#beforeAfterTitle")?.value.trim() || "Кейс до / после";

    const form = new FormData();
    form.append("title", title);
    form.append("description", $("#beforeAfterDescription")?.value.trim() || "");
    form.append("procedure", $("#beforeAfterProcedure")?.value.trim() || "");
    form.append("result", $("#beforeAfterResult")?.value.trim() || "");
    form.append("before_image", beforeImagePath);
    form.append("after_image", afterImagePath);
    form.append("active", $("#beforeAfterActive")?.checked ? "true" : "false");

    const path = state.editingBeforeAfterId ? `/before-after/${state.editingBeforeAfterId}` : "/before-after";
    const method = state.editingBeforeAfterId ? "PUT" : "POST";
    await api(path, { method, body: form }, {});
    resetBeforeAfterForm();
    setText("beforeAfterMessage", "Кейс сохранен");
    await loadAll();
  }

  function editBeforeAfter(id) {
    const item = state.beforeAfterCases.find((caseItem) => caseItem.id === Number(id));
    if (!item) return;

    state.editingBeforeAfterId = item.id;
    const fields = {
      beforeAfterId: item.id,
      beforeAfterTitle: item.title || "",
      beforeAfterDescription: item.description || "",
      beforeAfterProcedure: item.procedure || "",
      beforeAfterResult: item.result || "",
      beforeAfterBeforePath: item.before_image || "",
      beforeAfterAfterPath: item.after_image || "",
    };

    Object.entries(fields).forEach(([field, value]) => {
      const input = document.getElementById(field);
      if (input) input.value = value;
    });

    const active = $("#beforeAfterActive");
    if (active) active.checked = Boolean(item.active);
    setText("beforeAfterBeforeLabel", item.before_image ? `Текущее фото: ${item.before_image}` : "PNG, JPG, WEBP");
    setText("beforeAfterAfterLabel", item.after_image ? `Текущее фото: ${item.after_image}` : "PNG, JPG, WEBP");
    setText("beforeAfterSubmit", "Сохранить кейс");
    setView("before-after");
  }

  async function deleteBeforeAfter(id) {
    if (!confirm("Удалить кейс до / после?")) return;
    await api(`/before-after/${id}`, { method: "DELETE" }, {});
    await loadAll();
  }

  async function submitSchedule(event) {
    event.preventDefault();

    const form = new FormData();
    const days = $all('input[name="workDay"]:checked').map((input) => input.value).join(",");
    form.append("work_days", days);
    form.append("start_time", $("#scheduleStart")?.value || "09:00");
    form.append("end_time", $("#scheduleEnd")?.value || "16:00");
    form.append("break_start", $("#breakStart")?.value || "");
    form.append("break_end", $("#breakEnd")?.value || "");

    await api("/schedule", { method: "PUT", body: form }, {});
    setText("scheduleMessage", "Расписание сохранено");
    await loadAll();
  }

  async function submitClosedSlot(event) {
    event.preventDefault();

    const date = $("#closedSlotDate")?.value || "";
    const time = $("#closedSlotTime")?.value || "";
    if (!date || !time) return;

    const form = new FormData();
    form.append("date", date);
    form.append("time", time);
    form.append("reason", $("#closedSlotReason")?.value.trim() || "");

    await api("/closed-slot", { method: "POST", body: form }, {});
    const reason = $("#closedSlotReason");
    if (reason) reason.value = "";
    await loadAll();
  }

  async function deleteClosedSlot(id) {
    await api(`/closed-slot/${id}`, { method: "DELETE" }, {});
    await loadAll();
  }

  async function saveClientNote(phone) {
    const field = $all("[data-client-note]").find((item) => item.dataset.clientNote === phone);
    const form = new FormData();
    form.append("phone", phone);
    form.append("note", field?.value || "");
    await api("/client-note", { method: "PUT", body: form }, {});
    await loadAll();
  }

  async function submitAdminBooking(event) {
    event.preventDefault();

    const name = $("#adminBookingName")?.value.trim() || "";
    const phone = $("#adminBookingPhone")?.value.trim() || "";
    const procedure = $("#adminBookingProcedure")?.value || "";
    const date = $("#adminBookingDate")?.value || "";
    const time = $("#adminBookingTime")?.value || "";

    if (!name || !phone || !procedure || !date || !time) {
      setText("adminBookingMessage", "Заполните имя, телефон, процедуру, дату и время");
      showMessage("Заполните имя, телефон, процедуру, дату и время");
      return;
    }

    const form = new FormData();
    form.append("name", name);
    form.append("phone", phone);
    form.append("procedure", procedure);
    form.append("date", date);
    form.append("time", time);
    form.append("comment", $("#adminBookingComment")?.value.trim() || "");

    const result = await api("/appointment", { method: "POST", body: form }, {});

    if (result?.success === false) {
      setText("adminBookingMessage", result.message || "Не удалось создать запись");
      showMessage(result.message || "Не удалось создать запись");
      return;
    }

    setText("adminBookingMessage", "Запись создана");
    state.calendarDate = date;
    event.target.reset();
    closeDrawer();
    setView("calendar");
    await loadAll();
  }

  async function submitSiteSettings(event) {
    event.preventDefault();

    const form = new FormData();
    form.append("doctor_name", $("#siteDoctorName")?.value.trim() || "");
    form.append("specialty", $("#siteSpecialty")?.value.trim() || "");
    form.append("experience", $("#siteExperience")?.value.trim() || "");
    form.append("clients", $("#siteClients")?.value.trim() || "");
    form.append("phone", $("#sitePhone")?.value.trim() || "");
    form.append("email", $("#siteEmail")?.value.trim() || "");
    form.append("address", $("#siteAddress")?.value.trim() || "");
    form.append("instagram", $("#siteInstagram")?.value.trim() || "");
    form.append("telegram", $("#siteTelegram")?.value.trim() || "");
    form.append("tiktok", $("#siteTiktok")?.value.trim() || "");

    state.siteSettings = await api("/site-settings", { method: "PUT", body: form }, {});
    setText("siteSettingsMessage", "Настройки сохранены");
    renderSiteSettings();
  }

  async function submitReview(event, id) {
    event.preventDefault();

    const formElement = event.target;
    const imageInput = formElement.querySelector('input[name="image"]');
    const uploadedImage = await uploadImageFromElement(imageInput);

    const form = new FormData();
    form.append("name", formElement.elements.name?.value.trim() || "");
    form.append("text", formElement.elements.text?.value.trim() || "");
    form.append("rating", formElement.elements.rating?.value || "5");
    form.append("image", uploadedImage || formElement.elements.imagePath?.value || "");

    const saved = await api(`/review/${id}`, { method: "PUT", body: form }, {});
    const index = state.reviews.findIndex((item) => Number(item.id) === Number(id));
    if (index >= 0) {
      state.reviews[index] = saved;
    } else {
      state.reviews.push(saved);
    }

    renderReviews();
    showMessage("Отзыв сохранен", "success");
  }

  function shiftCalendar(days) {
    const date = new Date(`${state.calendarDate}T00:00:00`);
    date.setDate(date.getDate() + days);
    state.calendarDate = formatDate(date);
    renderCalendar();
  }

  function bindImageLabel(inputId, labelId) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);

    if (!input || !label) return;

    input.addEventListener("change", () => {
      label.textContent = input.files?.[0]?.name || "PNG, JPG, WEBP";
    });
  }

  function bindEvents() {
    document.addEventListener("submit", async (event) => {
      const reviewForm = event.target.closest("[data-review-form]");
      if (!reviewForm) return;

      try {
        await submitReview(event, reviewForm.dataset.reviewForm);
      } catch (error) {
        console.error(error);
        showMessage(error.message || "Не удалось сохранить отзыв");
      }
    });

    document.addEventListener("click", async (event) => {
      const viewLink = event.target.closest("[data-view-link]");
      if (viewLink) {
        setView(viewLink.dataset.viewLink);
        $("#profileDropdown")?.classList.remove("open");
        return;
      }

      const calendarDay = event.target.closest("[data-calendar-day]");
      if (calendarDay) {
        state.calendarDate = calendarDay.dataset.calendarDay;
        renderCalendar();
        return;
      }

      const mode = event.target.closest("[data-calendar-mode]");
      if (mode) {
        state.calendarMode = mode.dataset.calendarMode;
        $all("[data-calendar-mode]").forEach((button) => {
          button.classList.toggle("active", button === mode);
        });
        renderCalendar();
        return;
      }

      const appointmentButton = event.target.closest("[data-open-appointment]");
      if (appointmentButton) {
        openAppointmentModal(appointmentButton.dataset.openAppointment);
        return;
      }

      const statusButton = event.target.closest("[data-status-action]");
      if (statusButton) {
        await updateAppointmentStatus(statusButton.dataset.id, statusButton.dataset.statusAction);
        closeModal();
        return;
      }

      const deleteButton = event.target.closest("[data-delete-appointment]");
      if (deleteButton) {
        await deleteAppointment(deleteButton.dataset.deleteAppointment);
        closeModal();
        return;
      }

      const editServiceButton = event.target.closest("[data-edit-service]");
      if (editServiceButton) {
        editService(editServiceButton.dataset.editService);
        return;
      }

      const deleteServiceButton = event.target.closest("[data-delete-service]");
      if (deleteServiceButton) {
        await deleteService(deleteServiceButton.dataset.deleteService);
        return;
      }

      const editCertificateButton = event.target.closest("[data-edit-certificate]");
      if (editCertificateButton) {
        editCertificate(editCertificateButton.dataset.editCertificate);
        return;
      }

      const deleteCertificateButton = event.target.closest("[data-delete-certificate]");
      if (deleteCertificateButton) {
        await deleteCertificate(deleteCertificateButton.dataset.deleteCertificate);
        return;
      }

      const editBeforeAfterButton = event.target.closest("[data-edit-before-after]");
      if (editBeforeAfterButton) {
        editBeforeAfter(editBeforeAfterButton.dataset.editBeforeAfter);
        return;
      }

      const deleteBeforeAfterButton = event.target.closest("[data-delete-before-after]");
      if (deleteBeforeAfterButton) {
        await deleteBeforeAfter(deleteBeforeAfterButton.dataset.deleteBeforeAfter);
        return;
      }

      const deleteClosedButton = event.target.closest("[data-delete-closed-slot]");
      if (deleteClosedButton) {
        await deleteClosedSlot(deleteClosedButton.dataset.deleteClosedSlot);
        return;
      }

      const saveNoteButton = event.target.closest("[data-save-client-note]");
      if (saveNoteButton) {
        await saveClientNote(saveNoteButton.dataset.saveClientNote);
        return;
      }

      if (event.target.closest("[data-close-modal]")) {
        closeModal();
      }

      if (event.target.closest("[data-close-drawer]")) {
        closeDrawer();
      }

      const profileTrigger = event.target.closest("#profileTrigger");
      const profileDropdown = $("#profileDropdown");
      if (profileTrigger && profileDropdown) {
        profileDropdown.classList.toggle("open");
        return;
      }

      if (profileDropdown && !event.target.closest(".profile-menu")) {
        profileDropdown.classList.remove("open");
      }
    });

    $("#refreshBtn")?.addEventListener("click", loadAll);
    $("#newAppointmentBtn")?.addEventListener("click", () => {
      openDrawer();
    });
    $("#globalClientSearch")?.addEventListener("input", (event) => {
      const clientSearch = $("#clientSearch");
      if (clientSearch) clientSearch.value = event.target.value;
      setView("clients");
      renderClients();
    });
    $("#calendarPrev")?.addEventListener("click", () => shiftCalendar(-1));
    $("#calendarNext")?.addEventListener("click", () => shiftCalendar(1));
    $("#calendarDate")?.addEventListener("change", (event) => {
      state.calendarDate = event.target.value || today();
      renderCalendar();
    });

    ["bookingSearch", "bookingDateFilter", "bookingStatusFilter"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", renderBookings);
      document.getElementById(id)?.addEventListener("change", renderBookings);
    });

    $("#clientSearch")?.addEventListener("input", renderClients);
    $("#serviceForm")?.addEventListener("submit", submitService);
    $("#certificateForm")?.addEventListener("submit", submitCertificate);
    $("#beforeAfterForm")?.addEventListener("submit", submitBeforeAfter);
    bindImageLabel("serviceImage", "serviceImageLabel");
    bindImageLabel("certificateImage", "certificateImageLabel");
    bindImageLabel("beforeAfterBeforeImage", "beforeAfterBeforeLabel");
    bindImageLabel("beforeAfterAfterImage", "beforeAfterAfterLabel");
    $("#scheduleForm")?.addEventListener("submit", submitSchedule);
    $("#closedSlotForm")?.addEventListener("submit", submitClosedSlot);
    $("#adminBookingForm")?.addEventListener("submit", submitAdminBooking);
    $("#siteSettingsForm")?.addEventListener("submit", submitSiteSettings);
    $("#adminBookingPhone")?.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/\D/g, "");
    });
  }

  window.logout = function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("admin");
    window.location.href = "login.html";
  };

  bindEvents();
  setView("calendar");
  loadAll();
  window.setInterval(loadAll, 15000);
})();
