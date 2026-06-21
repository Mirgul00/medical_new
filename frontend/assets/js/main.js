const chatBtn = document.getElementById('chat-btn')
const chatWindow = document.getElementById('chat-window')
const closeBtn = document.getElementById('close-chat')
const sendBtn = document.getElementById('send-btn')
const input = document.getElementById('user-input')
const messages = document.getElementById('messages')
let clinicServices = []
let servicesPromise = null
let chatWelcomed = false
let siteSettings = {
  doctor_name: "Даданова Бегимай Нурмухамедовна",
  specialty: "Дерматолог-косметолог",
  experience: "6 лет",
  clients: "25 000+",
  phone: "0702664406",
  address: "Турусбекова-13",
  instagram: "#",
  telegram: "tel:0702664406",
  email: "begimaj.dadanova@gmail.com",
}
let siteSettingsPromise = null

if (chatBtn) {
  chatBtn.onclick = () => {
    if (chatWindow) chatWindow.classList.add('open')
    if (!chatWelcomed) {
      addBotMessage("Здравствуйте! Я помогу с услугами, ценами, записью, адресом и подготовкой к процедурам.")
      chatWelcomed = true
    }
  }
}

if (closeBtn) {
  closeBtn.onclick = () => {
    if (chatWindow) chatWindow.classList.remove('open')
  }
}

if (sendBtn) {
  sendBtn.onclick = sendMessage
}

function sendMessage() {
  const text = input.value.trim()
  if (!text) return

  addUserMessage(text)
  input.value = ''

  setTimeout(async () => {
    addBotMessage(await getBotResponse(text))
  }, 600)
}

function addUserMessage(text) {
  const msg = document.createElement('div')
  msg.className = 'message user'
  msg.textContent = text
  messages.appendChild(msg)
  scrollBottom()
}

function addBotMessage(text) {
  const msg = document.createElement('div')
  msg.className = 'message bot'
  msg.textContent = text
  messages.appendChild(msg)
  scrollBottom()
}

function scrollBottom() {
  messages.scrollTop = messages.scrollHeight
}

/* FAQ */
function faqAnswer(type) {
  getBotResponse(type).then(addBotMessage)
}

/* Простейший AI */
async function getBotResponse(text) {
  text = text.toLowerCase()
  await loadClinicServices()
  await loadSiteSettings()

  const servicesText = clinicServices.length
    ? clinicServices
        .slice(0, 5)
        .map((service) => `${service.title}${service.price ? ` - ${service.price}` : ""}`)
        .join("; ")
    : "Список услуг сейчас уточняется."

  if (text.includes("price") || text.includes("цена") || text.includes("стоимость")) return `Актуальные цены: ${servicesText}. Полный список можно открыть в разделе услуг.`
  if (text.includes("services") || text.includes("услуг") || text.includes("процедур")) return `Основные услуги: ${servicesText}.`
  if (text.includes("booking") || text.includes("запись") || text.includes("прием")) return "Записаться можно через кнопку «Записаться» на сайте. Выберите услугу, дату и свободное время."
  if (text.includes("address") || text.includes("адрес") || text.includes("где")) return `Адрес приёма: ${siteSettings.address}. В разделе контактов есть карта и кнопка маршрута.`
  if (text.includes("phone") || text.includes("телефон") || text.includes("номер")) return `Телефон: ${siteSettings.phone}.`
  if (text.includes("подготов") || text.includes("перед процедур")) return "Перед процедурой лучше не использовать агрессивные кислоты и ретиноиды 2-3 дня. Точные рекомендации специалист даст после оценки кожи."
  if (text.includes("привет")) return "Здравствуйте! Чем могу помочь?"
  if (text.includes("care") || text.includes("уход")) return "Для домашнего ухода обычно важны мягкое очищение, увлажнение и SPF. Подбор зависит от состояния кожи."
  
  return "Могу подсказать по услугам, ценам, записи, адресу, телефону и подготовке к процедурам."
}

/* ================= MOBILE MENU ================= */

const navMenu = document.getElementById('nav-menu')
const navToggle = document.getElementById('nav-toggle')
const navClose = document.getElementById('nav-close')

if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => {
    navMenu.classList.add('show-menu')
  })
}

if (navClose && navMenu) {
  navClose.addEventListener('click', () => {
    navMenu.classList.remove('show-menu')
  })
}

const navLinks = document.querySelectorAll('.nav__link')

navLinks.forEach(link => {
  link.addEventListener('click', () => {
    if (navMenu) navMenu.classList.remove('show-menu')
  })
})

/* ================= MODAL (CERTIFICATE) ================= */

const openCertBtn = document.getElementById('open-cert')
const certModal = document.getElementById('cert-modal')
const closeCertBtn = document.getElementById('close-cert')

if (openCertBtn && certModal) {
  openCertBtn.addEventListener('click', () => {
    certModal.style.display = 'flex'
  })
}

if (closeCertBtn && certModal) {
  closeCertBtn.addEventListener('click', () => {
    certModal.style.display = 'none'
  })
}

window.addEventListener('click', (e) => {
  if (certModal && e.target === certModal) {
    certModal.style.display = 'none'
  }
})

window.API_ROOT =
  window.APP_CONFIG?.API_ROOT ||
  "";

function normalizeExternalUrl(value) {
  const url = String(value || "").trim()

  if (!url) return ""

  try {
    const parsed = new URL(url)
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : ""
  } catch (error) {
    return ""
  }
}

function applyAiAppLinks() {
  const bindAiLink = (selector, configKey) => {
    const configuredUrl = normalizeExternalUrl(window.APP_CONFIG?.[configKey])

    document.querySelectorAll(selector).forEach((link) => {
      if (configuredUrl) {
        link.href = configuredUrl
        link.rel = "noopener"
      }

      link.addEventListener("click", (event) => {
        const runtimeUrl = normalizeExternalUrl(window.APP_CONFIG?.[configKey])

        if (!runtimeUrl) return

        event.preventDefault()
        window.location.href = runtimeUrl
      })
    })
  }

  bindAiLink("[data-ai-skin-link]", "AI_SKIN_APP_URL")
  bindAiLink("[data-ai-dermatology-link]", "AI_DERMATOLOGY_APP_URL")
}

applyAiAppLinks()

async function loadClinicServices() {
  if (servicesPromise) return servicesPromise

  servicesPromise = fetch(`${window.API_ROOT}/services?active=true`)
    .then(async (response) => {
      if (!response.ok) throw new Error("Services fetch failed")
      const text = await response.text()
      const services = text ? JSON.parse(text) : []
      clinicServices = Array.isArray(services) ? services : []
      return clinicServices
    })
    .catch((error) => {
      console.warn("Services API unavailable", error)
      clinicServices = []
      return clinicServices
    })

  return servicesPromise
}

function applySiteSettings() {
  document.querySelectorAll("[data-site-phone]").forEach((item) => {
    item.textContent = siteSettings.phone
  })
  document.querySelectorAll("[data-site-address]").forEach((item) => {
    item.textContent = siteSettings.address
  })
  document.querySelectorAll("[data-site-email]").forEach((item) => {
    item.textContent = siteSettings.email
  })
  document.querySelectorAll("[data-site-instagram]").forEach((item) => {
    item.href = siteSettings.instagram || "#"
  })
  document.querySelectorAll("[data-site-telegram]").forEach((item) => {
    item.href = siteSettings.telegram || `tel:${siteSettings.phone}`
  })
  document.querySelectorAll("[data-site-phone-link]").forEach((item) => {
    item.href = `tel:${siteSettings.phone}`
  })
  document.querySelectorAll("[data-site-doctor-name]").forEach((item) => {
    item.textContent = siteSettings.doctor_name
  })
  document.querySelectorAll("[data-site-specialty]").forEach((item) => {
    item.textContent = siteSettings.specialty
  })
  document.querySelectorAll("[data-site-experience]").forEach((item) => {
    item.textContent = siteSettings.experience
  })
  document.querySelectorAll("[data-site-clients]").forEach((item) => {
    item.textContent = siteSettings.clients
  })
  document.querySelectorAll("[data-site-map]").forEach((item) => {
    item.href = `https://maps.google.com/maps?q=${encodeURIComponent(siteSettings.address)}`
  })
  document.querySelectorAll("[data-site-map-frame]").forEach((item) => {
    item.src = `https://maps.google.com/maps?q=${encodeURIComponent(siteSettings.address)}&t=&z=13&ie=UTF8&iwloc=&output=embed`
  })
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function renderStars(rating) {
  const value = Math.max(1, Math.min(5, Number(rating) || 5))
  return "★★★★★".slice(0, value) + "☆☆☆☆☆".slice(0, 5 - value)
}

function animateReviews() {
  const reviewCards = document.querySelectorAll('.review-card')
  if (!reviewCards.length) return

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = 1
        entry.target.style.transform = "translateY(0)"
      }
    })
  }, { threshold: 0.2 })

  reviewCards.forEach(card => {
    card.style.opacity = 0
    card.style.transform = "translateY(30px)"
    card.style.transition = "0.6s ease"
    observer.observe(card)
  })
}

async function loadReviews() {
  const grid = document.getElementById('reviews-grid')
  if (!grid) return

  try {
    const response = await fetch(`${window.API_ROOT}/reviews`)
    if (!response.ok) throw new Error("Reviews fetch failed")

    const text = await response.text()
    const reviews = text ? JSON.parse(text) : []
    if (!Array.isArray(reviews) || !reviews.length) throw new Error("No reviews")

    const decor = Array.from(grid.querySelectorAll('.decor')).map((item) => item.outerHTML).join('')
    grid.innerHTML = reviews.slice(0, 3).map((review, index) => `
      <article class="review-card card-${index + 1}">
        ${review.image ? `<img class="review-card__photo" src="${escapeHtml(review.image)}" alt="${escapeHtml(review.name)}">` : ""}
        <div class="stars">${renderStars(review.rating)}</div>
        <p class="text">${escapeHtml(review.text)}</p>
        <span class="name">${escapeHtml(review.name)}</span>
      </article>
    `).join('') + decor

    animateReviews()
  } catch (error) {
    console.warn("Reviews unavailable", error)
    grid.innerHTML = `
      <article class="review-card card-1"><div class="stars">★★★★★</div><p class="text">Очень довольна результатом. Кожа стала заметно лучше уже после первой процедуры.</p><span class="name">Анна П.</span></article>
      <article class="review-card card-2"><div class="stars">★★★★☆</div><p class="text">Профессиональный подход и внимательное отношение к пациенту.</p><span class="name">Мария К.</span></article>
      <article class="review-card card-3"><div class="stars">★★★★★</div><p class="text">Отличный результат, кожа стала чистой и здоровой.</p><span class="name">Елена С.</span></article>
    `
    animateReviews()
  }
}

async function loadSiteSettings() {
  if (siteSettingsPromise) return siteSettingsPromise

  siteSettingsPromise = fetch(`${window.API_ROOT}/site-settings`, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Site settings fetch failed")
      const text = await response.text()
      const settings = text ? JSON.parse(text) : {}
      siteSettings = { ...siteSettings, ...settings }
      applySiteSettings()
      return siteSettings
    })
    .catch((error) => {
      console.warn("Site settings unavailable", error)
      applySiteSettings()
      return siteSettings
    })

  return siteSettingsPromise
}

loadSiteSettings()
loadReviews()

async function loadCertificates() {
  const gallery = document.getElementById('certGallery')
  if (!gallery) return

  try {
    const response = await fetch(`${window.API_ROOT}/certificates?active=true`)
    if (!response.ok) return

    const text = await response.text()
    if (!text) return

    const certificates = JSON.parse(text)
    if (!Array.isArray(certificates) || certificates.length === 0) return

    gallery.innerHTML = certificates
      .map((certificate) => {
        const tags = String(certificate.tags || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .map((tag) => `<span>${escapeHtml(tag)}</span>`)
          .join('')

        return `
   <div class="cert__card">
      <div class="cert__image">
         <img src="${escapeHtml(certificate.image || 'assets/img/about-img.png')}" alt="">
      </div>

      <div class="cert__info">
         <span class="cert__year">${escapeHtml(certificate.year || '')}</span>

         <h3 class="cert__name">
            ${escapeHtml(certificate.title || '')}
         </h3>

         <p class="cert__text">
            ${escapeHtml(certificate.description || '')}
         </p>

         <div class="cert__tags">
            ${tags}
         </div>
      </div>
   </div>
        `
      })
      .join('')
  } catch (error) {
    console.error(error)
  }
}

loadCertificates()

/* ================= CAROUSEL ================= */

const track = document.querySelector('.carousel__track')
const nextBtn = document.querySelector('.next')
const prevBtn = document.querySelector('.prev')

if (track) {
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      track.scrollBy({ left: 300, behavior: 'smooth' })
    })
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      track.scrollBy({ left: -300, behavior: 'smooth' })
    })
  }
}

/* ================= SERVICE MODAL ================= */

const serviceModal = document.getElementById('service-modal')

const modalTitle = document.getElementById('modal-title')
const modalDesc = document.getElementById('modal-desc')
const modalPrice = document.getElementById('modal-price')

const cards = document.querySelectorAll('.card')
const carouselTrack = document.querySelector('.carousel__track')

async function loadPublicServices() {
  if (!carouselTrack) return;

  const prevButton = carouselTrack.querySelector('.prev');
  const nextButton = carouselTrack.querySelector('.next');

  try {
    const services = await loadClinicServices();

    if (!Array.isArray(services) || services.length === 0) {
      return;
    }

    const prevButtonHtml = prevButton ? prevButton.outerHTML : '';
    const nextButtonHtml = nextButton ? nextButton.outerHTML : '';

    // Duplicate services for infinite carousel effect
    const duplicatedServices = [...services, ...services];

    carouselTrack.innerHTML = duplicatedServices
      .map((service) => `
        <div class="card" data-service-id="${service.id}" data-title="${escapeHtml(service.title)}" data-price="${escapeHtml(service.price || '')}" data-desc="${escapeHtml(service.description || '')}" data-duration="${escapeHtml(service.duration || '')}">
          <img src="${escapeHtml(service.image || 'assets/img/home-img.png')}" alt="${escapeHtml(service.title)}" />
          <h3>${escapeHtml(service.title)}</h3>
          ${service.category || service.price ? `<p>${escapeHtml(service.category || service.price)}</p>` : ''}
        </div>
      `)
      .join('') + prevButtonHtml + nextButtonHtml;

    attachServiceCardListeners();
    
    if (prevButton) {
      const newPrev = carouselTrack.querySelector('.prev');
      newPrev?.addEventListener('click', () => track.scrollBy({ left: -300, behavior: 'smooth' }));
    }
    if (nextButton) {
      const newNext = carouselTrack.querySelector('.next');
      newNext?.addEventListener('click', () => track.scrollBy({ left: 300, behavior: 'smooth' }));
    }
  } catch (err) {
    console.warn('Services API unavailable, using static cards');
  }
}

function attachServiceCardListeners() {
  const dynamicCards = document.querySelectorAll('.carousel__track .card');
  dynamicCards.forEach((card) => {
    card?.addEventListener('click', () => openServiceModal(card));
  });
}

function openServiceModal(card) {
  const service = clinicServices.find((item) => String(item.id) === card.dataset.serviceId);
  const title = card.dataset.title || "Услуга";
  const desc = card.dataset.desc || "Описание отсутствует";
  const priceValue = card.dataset.price || "Не указана";
  const duration = service?.duration || card.dataset.duration || "";
  const modalDescription = service?.description || desc;
  const modalPriceValue = service?.price || priceValue;

  modalTitle.innerHTML = `
      ${escapeHtml(title)}
      ${duration ? `<span class="service-time">${escapeHtml(duration)}</span>` : ""}
    `;

  modalDesc.innerHTML = `
      <p class="modal-text">${escapeHtml(modalDescription)}</p>
    `;

  modalPrice.innerHTML = `
      <div class="service-price">
        Цена: ${escapeHtml(modalPriceValue)}
      </div>
    `;

  serviceModal.style.display = 'flex';
}

/* OPEN MODAL */
loadPublicServices();
attachServiceCardListeners();

const closeModalBtn = document.querySelector('.modal__close')

if (closeModalBtn) {
  closeModalBtn.addEventListener('click', () => {
    serviceModal.style.display = 'none'
  })
}

window.addEventListener('click', (e) => {
  if (e.target === serviceModal) {
    serviceModal.style.display = 'none'
  }
})

/* ================= RESULTS BEFORE / AFTER ================= */

let resultCases = []
let resultIndex = 0
const resultsTitle = document.getElementById('results-title')
const resultsDescription = document.getElementById('results-description')
const resultsProcedure = document.getElementById('results-procedure')
const resultsResult = document.getElementById('results-result')
const resultsBefore = document.getElementById('results-before')
const resultsAfter = document.getElementById('results-after')
const resultsBeforeWrap = document.getElementById('results-before-wrap')
const resultsDivider = document.getElementById('results-divider')
const resultsRange = document.getElementById('results-range')
const resultsCompare = document.getElementById('results-compare')

function updateResultsSlider(value) {
  if (!resultsBeforeWrap || !resultsDivider) return
  if (resultsBefore && resultsCompare) {
    resultsBefore.style.width = `${resultsCompare.clientWidth}px`
  }
  resultsBeforeWrap.style.width = `${value}%`
  resultsDivider.style.left = `${value}%`
}

function renderResultCase() {
  const item = resultCases[resultIndex]
  if (!item || !resultsTitle) return

  resultsTitle.textContent = item.title
  resultsDescription.textContent = item.description
  resultsProcedure.textContent = item.procedure
  resultsResult.textContent = item.result
  resultsBefore.src = item.before_image
  resultsAfter.src = item.after_image
  if (resultsRange) resultsRange.value = 50
  updateResultsSlider(50)
}

document.getElementById('results-prev')?.addEventListener('click', () => {
  if (!resultCases.length) return
  resultIndex = (resultIndex - 1 + resultCases.length) % resultCases.length
  renderResultCase()
})

document.getElementById('results-next')?.addEventListener('click', () => {
  if (!resultCases.length) return
  resultIndex = (resultIndex + 1) % resultCases.length
  renderResultCase()
})

resultsRange?.addEventListener('input', (event) => {
  updateResultsSlider(event.target.value)
})

resultsCompare?.addEventListener('pointerdown', (event) => {
  const rect = resultsCompare.getBoundingClientRect()
  const move = (pointerEvent) => {
    const percent = Math.min(100, Math.max(0, ((pointerEvent.clientX - rect.left) / rect.width) * 100))
    if (resultsRange) resultsRange.value = percent
    updateResultsSlider(percent)
  }

  move(event)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true })
})

window.addEventListener('resize', () => updateResultsSlider(resultsRange?.value || 50))

async function loadResultCases() {
  if (!resultsTitle) return

  try {
    const response = await fetch(`${window.API_ROOT}/before-after?active=true`)
    const text = await response.text()
    const data = text ? JSON.parse(text) : []

    if (response.ok && Array.isArray(data) && data.length) {
      resultCases = data
      resultIndex = 0
      renderResultCase()
      return
    }
  } catch (error) {
    // Keep the server-rendered fallback content visible.
  }

  updateResultsSlider(resultsRange?.value || 50)
}

loadResultCases()

/* ================= SCROLL REVEAL ================= */

if (typeof ScrollReveal !== 'undefined') {
  const sr = ScrollReveal({
    origin: 'top',
    distance: '40px',
    duration: 1000,
    delay: 200,
    reset: false
  })

  sr.reveal('.home__title, .home__description, .home__buttons', { interval: 200 })
  sr.reveal('.home__img', { origin: 'right' })
  sr.reveal('.info__card', { interval: 150 })
  sr.reveal('.featured__card', { interval: 200 })
  sr.reveal('.story__data', { origin: 'left' })
  sr.reveal('.story__img', { origin: 'right' })
  sr.reveal('.footer__content', { interval: 200 })
  sr.reveal('.section__title', { origin: 'top', distance: '20px' })
}

/* ================= HEADER ACTIVE LINK ================= */

const sections = document.querySelectorAll('section')
const navUlLinks = document.querySelectorAll('nav ul li a')

window.addEventListener('scroll', () => {
  let current = ''

  sections.forEach(section => {
    const sectionTop = section.offsetTop

    if (window.pageYOffset >= sectionTop - 60) {
      current = section.getAttribute('id')
    }
  })

  navLinks.forEach(link => {
    link.classList.remove('active')

    if (link.getAttribute('href') === '#' + current) {
      link.classList.add('active')
    }
  })
})
