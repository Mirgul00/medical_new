(async function () {
  const datesBox = document.querySelector(".dates");
  const title = document.querySelector(".calendar-title");
  const timeBox = document.querySelector(".time-list");
  const prevButton = document.getElementById("prev");
  const nextButton = document.getElementById("next");
  const bookingForm = document.getElementById("booking-form");
  const showDate = document.getElementById("show-date");
  const showTime = document.getElementById("show-time");
  const nameInput = document.getElementById("name");
  const phoneInput = document.getElementById("phone");
  const procedureSelect = document.getElementById("procedure");
  const commentInput = document.getElementById("comment");
  const messageBox = document.getElementById("booking-message");

  if (!datesBox || !title || !timeBox || !bookingForm) {
    return;
  }

  let current = new Date();
  let selectedDate = "";
  let selectedTime = "";

  const bookingApiRoot =
    window.API_ROOT ||
    window.APP_CONFIG?.API_ROOT ||
    "";

  function initProcedureSelect() {
    if (!procedureSelect || procedureSelect.dataset.enhanced === "true") {
      return;
    }

    const field = procedureSelect.closest(".procedure-field");
    const options = Array.from(procedureSelect.options).map((option) => ({
      text: option.text,
      value: option.value,
      disabled: option.disabled,
    }));

    if (!field || options.length < 2) {
      return;
    }

    procedureSelect.dataset.enhanced = "true";
    field.classList.add("is-enhanced");

    const customSelect = document.createElement("div");
    customSelect.className = "procedure-select";
    customSelect.innerHTML = `
      <button class="procedure-select__trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span class="procedure-select__value">${procedureSelect.options[procedureSelect.selectedIndex]?.text || "Выберите процедуру"}</span>
        <i class="ri-arrow-down-s-line"></i>
      </button>
      <div class="procedure-select__dropdown" role="listbox"></div>
    `;

    const dropdown = customSelect.querySelector(".procedure-select__dropdown");
    const trigger = customSelect.querySelector(".procedure-select__trigger");
    const valueText = customSelect.querySelector(".procedure-select__value");

    options.forEach((option) => {
      if (option.disabled) return;

      const optionButton = document.createElement("button");
      optionButton.className = "procedure-select__option";
      optionButton.type = "button";
      optionButton.role = "option";
      optionButton.textContent = option.text;
      optionButton.dataset.value = option.value;

      optionButton.addEventListener("click", () => {
        procedureSelect.value = option.value;
        procedureSelect.dispatchEvent(new Event("change", { bubbles: true }));
        valueText.textContent = option.text;

        dropdown
          .querySelectorAll(".procedure-select__option")
          .forEach((item) => item.classList.toggle("selected", item === optionButton));

        customSelect.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
        setMessage("");
      });

      dropdown.appendChild(optionButton);
    });

    trigger.addEventListener("click", () => {
      const isOpen = customSelect.classList.toggle("open");
      trigger.setAttribute("aria-expanded", String(isOpen));
    });

    document.addEventListener("click", (event) => {
      if (!customSelect.contains(event.target)) {
        customSelect.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
      }
    });

    field.appendChild(customSelect);
  }

  function initPhoneInput() {
    if (!phoneInput) {
      return;
    }

    phoneInput.addEventListener("input", () => {
      phoneInput.value = phoneInput.value.replace(/\D/g, "");
    });
  }

  function setMessage(text, type = "error") {
    if (!messageBox) {
      if (text) alert(text);
      return;
    }

    messageBox.textContent = text;
    messageBox.className = `booking-message ${text ? "show" : ""} ${type}`;
  }

  async function safeJson(response, fallback = null) {
    const text = await response.text();

    if (!text) {
      return fallback;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      console.error("Invalid JSON response", error);
      return fallback;
    }
  }

  async function loadProcedures() {
    if (!procedureSelect) return;

    try {
      const response = await fetch(`${bookingApiRoot}/services?active=true`);
      const services = await safeJson(response, []);

      if (!response.ok || !Array.isArray(services) || services.length === 0) {
        return;
      }

      procedureSelect.innerHTML = '<option value="" disabled selected>Выберите процедуру</option>';

      services.forEach((service) => {
        const option = document.createElement("option");
        option.value = service.id || "";
        option.dataset.title = service.title || "";
        option.textContent = service.price
          ? `${service.title} · ${service.price}`
          : service.title;
        procedureSelect.appendChild(option);
      });
    } catch (error) {
      setMessage("Не удалось загрузить список услуг. Обновите страницу.");
    }
  }

  function renderCalendar() {
    datesBox.innerHTML = "";

    const year = current.getFullYear();
    const month = current.getMonth();

    title.innerText = current.toLocaleString("ru", {
      month: "long",
      year: "numeric",
    });

    let first = new Date(year, month, 1).getDay();

    if (first === 0) {
      first = 7;
    }

    const days = new Date(year, month + 1, 0).getDate();

    for (let i = 1; i < first; i++) {
      datesBox.innerHTML += "<span></span>";
    }

    for (let d = 1; d <= days; d++) {
      const button = document.createElement("button");

      button.type = "button";
      button.innerText = d;

      const date = new Date(year, month, d);

      if (date < new Date().setHours(0, 0, 0, 0)) {
        button.disabled = true;
      }

      button.onclick = () => {
        chooseDate(date, button);
      };

      datesBox.appendChild(button);
    }
  }

  function chooseDate(date, button) {
    selectedDate =
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0");

    selectedTime = "";

    document
      .querySelectorAll(".dates button")
      .forEach((dateButton) => dateButton.classList.remove("active"));

    button.classList.add("active");

    if (showDate) {
      showDate.innerText = selectedDate;
    }

    if (showTime) {
      showTime.innerText = " - ";
    }

    setMessage("");
    loadTimes();
  }

  async function loadTimes() {
    timeBox.innerHTML = '<span class="time-loading">Загрузка времени...</span>';

    let slots = [];

    try {
      const serviceId = procedureSelect?.value || "";
      const query = serviceId ? `?service_id=${encodeURIComponent(serviceId)}` : "";
      const response = await fetch(`${bookingApiRoot}/available-slots/${selectedDate}${query}`);
      const data = await safeJson(response, []);

      slots = Array.isArray(data) ? data : [];
    } catch (error) {
      setMessage("Не удалось загрузить свободное время. Попробуйте выбрать дату ещё раз.");
      slots = [];
    }

    timeBox.innerHTML = "";

    if (!slots.length) {
      timeBox.innerHTML = '<span class="time-loading">На эту дату нет свободного времени</span>';
      return;
    }

    slots.forEach((time) => {
      const button = document.createElement("button");

      button.type = "button";
      button.innerText = time;

      button.onclick = () => {
        document
          .querySelectorAll(".time-list button")
          .forEach((timeButton) => timeButton.classList.remove("active"));

        button.classList.add("active");
        selectedTime = time;

        if (showTime) {
          showTime.innerText = time;
        }

        setMessage("");
      };

      timeBox.appendChild(button);
    });
  }

  function validateForm() {
    if (!selectedDate) {
      return "Выберите дату приема";
    }

    if (!selectedTime) {
      return "Выберите удобное время";
    }

    if (!procedureSelect || !procedureSelect.value.trim()) {
      return "Выберите услугу или процедуру";
    }

    if (!nameInput || !nameInput.value.trim()) {
      return "Введите имя клиента";
    }

    if (!phoneInput || !phoneInput.value.trim()) {
      return "Введите номер телефона";
    }

    return "";
  }

  if (prevButton) {
    prevButton.onclick = () => {
      current.setMonth(current.getMonth() - 1);
      renderCalendar();
    };
  }

  if (nextButton) {
    nextButton.onclick = () => {
      current.setMonth(current.getMonth() + 1);
      renderCalendar();
    };
  }

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setMessage(validationError);
      return;
    }

    setMessage("");

    const form = new FormData();

    form.append("name", nameInput.value.trim());
    form.append("phone", phoneInput.value.trim());
    form.append("service_id", procedureSelect.value.trim());
    form.append("procedure", procedureSelect.selectedOptions[0]?.dataset.title || procedureSelect.selectedOptions[0]?.textContent || "");
    form.append("date", selectedDate);
    form.append("time", selectedTime);
    form.append("comment", commentInput ? commentInput.value.trim() : "");

    try {
      const response = await fetch(`${bookingApiRoot}/appointment`, {
        method: "POST",
        body: form,
      });

      const data = await safeJson(response, {});

      if (!response.ok || data?.error || data?.success === false) {
        setMessage(data?.message || data?.error || "Это время уже занято");
        return;
      }

      setMessage("Запись создана. Мы свяжемся с вами для подтверждения.", "success");

      window.setTimeout(() => {
        location.reload();
      }, 900);
    } catch (error) {
      setMessage("Не удалось отправить запись. Проверьте подключение и попробуйте снова.");
    }
  });

  procedureSelect?.addEventListener("change", () => {
    selectedTime = "";
    if (showTime) showTime.innerText = " - ";
    if (selectedDate) loadTimes();
  });

  await loadProcedures();
  initProcedureSelect();
  initPhoneInput();
  renderCalendar();
})();
