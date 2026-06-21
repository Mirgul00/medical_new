(function () {
  const list = document.getElementById("services-page-list");
  const filters = document.getElementById("services-page-filters");
  const apiRoot = window.APP_CONFIG?.API_ROOT || "";
  const navMenu = document.getElementById("nav-menu");
  const navToggle = document.getElementById("nav-toggle");
  const navClose = document.getElementById("nav-close");
  let siteSettings = {
    phone: "0702664406",
    address: "Турусбекова-13",
    instagram: "#",
    telegram: "tel:0702664406",
    email: "begimaj.dadanova@gmail.com",
    tiktok: "#",
  };
  let allServices = [];
  let activeFilter = "all";

  navToggle?.addEventListener("click", () => navMenu?.classList.add("show-menu"));
  navClose?.addEventListener("click", () => navMenu?.classList.remove("show-menu"));

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function detectCategory(service) {
    if (service.category) return service.category;

    const value = `${service.title || ""} ${service.description || ""}`.toLowerCase();

    if (/(ботул|контур|мезо|биоревитал|плазмо|инъекц|botox|filler)/.test(value)) return "Инъекционные процедуры";
    if (/(чист|уход|пилинг|clean|facial)/.test(value)) return "Уход";
    return "Другое";
  }

  function renderFilters() {
    if (!filters) return;

    const categories = Array.from(new Set(allServices.map(detectCategory).filter(Boolean)));
    filters.innerHTML = [
      '<button class="active" type="button" data-service-filter="all">Все</button>',
      ...categories.map((category) => `<button type="button" data-service-filter="${escapeHtml(category)}">${escapeHtml(category)}</button>`),
    ].join("");
  }

  function renderServices() {
    if (!list) return;

    const services = activeFilter === "all"
      ? allServices
      : allServices.filter((service) => detectCategory(service) === activeFilter);

    if (!services.length) {
      list.innerHTML = '<p class="services-page__state">В этой категории пока нет активных услуг.</p>';
      return;
    }

    list.innerHTML = services
      .map((service) => {
        const category = detectCategory(service);
        const price = service.price ? escapeHtml(service.price) : "Цена уточняется";
        const description = escapeHtml(service.description || "Описание процедуры скоро появится.");

        return `
          <article class="services-page__card" data-category="${category}">
            <a class="services-page__image" href="../booking.html" aria-label="Записаться на ${escapeHtml(service.title)}">
              <img src="../${escapeHtml(service.image || "assets/img/home-img.png")}" alt="${escapeHtml(service.title)}">
            </a>
            <div class="services-page__body">
              <div class="services-page__topline">
                <span>${escapeHtml(service.category || category)}</span>
                <strong>${price}</strong>
              </div>
              <h2>${escapeHtml(service.title)}</h2>
              <p>${description}</p>
              <a href="../booking.html" class="services-page__button">
                Записаться
                <i class="ri-arrow-right-line"></i>
              </a>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function applySiteSettings() {
    document.querySelectorAll("[data-site-phone]").forEach((item) => {
      item.textContent = siteSettings.phone;
    });
    document.querySelectorAll("[data-site-address]").forEach((item) => {
      item.textContent = siteSettings.address;
    });
    document.querySelectorAll("[data-site-email]").forEach((item) => {
      item.textContent = siteSettings.email;
    });
    document.querySelectorAll("[data-site-instagram]").forEach((item) => {
      item.href = siteSettings.instagram || "#";
    });
    document.querySelectorAll("[data-site-telegram]").forEach((item) => {
      item.href = siteSettings.telegram || `tel:${siteSettings.phone}`;
    });
    document.querySelectorAll("[data-site-phone-link]").forEach((item) => {
      item.href = `tel:${siteSettings.phone}`;
    });
  document.querySelectorAll("[data-site-tiktok]").forEach((item) => {
    item.href = siteSettings.tiktok || "#";
  });
  }

  async function loadSiteSettings() {
    try {
      const response = await fetch(`${apiRoot}/site-settings`);
      const text = await response.text();
      const settings = text ? JSON.parse(text) : {};
      if (response.ok) {
        siteSettings = { ...siteSettings, ...settings };
      }
    } catch (error) {
      console.warn("Site settings unavailable", error);
    }

    applySiteSettings();
  }

  async function loadServices() {
    if (!list) return;

    try {
      const response = await fetch(`${apiRoot}/services?active=true`);
      const text = await response.text();
      const services = text ? JSON.parse(text) : [];

      if (!response.ok || !Array.isArray(services) || !services.length) {
        list.innerHTML = '<p class="services-page__state">Пока нет активных услуг.</p>';
        return;
      }

      allServices = services;
      renderFilters();
      renderServices();
    } catch (error) {
      console.error(error);
      list.innerHTML = '<p class="services-page__state">Не удалось загрузить услуги. Попробуйте позже.</p>';
    }
  }

  filters?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-service-filter]");
    if (!button) return;

    activeFilter = button.dataset.serviceFilter || "all";
    filters.querySelectorAll("[data-service-filter]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    renderServices();
  });

  loadSiteSettings();
  loadServices();
})();
