try {
  if (document.documentElement.classList.contains('dark-mode')) {
    document.body.classList.add('dark-mode');
  } else if (!document.documentElement.classList.contains('needs-light')) {
    document.body.classList.add('dark-mode');
  }
} catch (e) {}

function filterByFooter(category) {
    window.location.href = `services.html?cat=${category}`;
  }

  function showToast(msg) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(function () {
      el.classList.remove('visible');
    }, 3200);
  }

  function toggleNavDrawer() {
    document.body.classList.toggle('nav-open');
    var btn = document.getElementById('burgerBtn');
    var overlay = document.getElementById('navOverlay');
    if (btn) btn.setAttribute('aria-expanded', document.body.classList.contains('nav-open'));
    if (overlay) overlay.setAttribute('aria-hidden', !document.body.classList.contains('nav-open'));
  }

  // --- CONFIGURATION FIREBASE (Inchangée) ---
  const firebaseConfig = {
    apiKey: "AIzaSyAQQSVZx38jeI-8-OL-sfaDSxElqrOTJOU",
    authDomain: "needs-ae86d.firebaseapp.com",
    projectId: "needs-ae86d",
    storageBucket: "needs-ae86d.firebasestorage.app",
    messagingSenderId: "253900994407",
    appId: "1:253900994407:web:55168e1b73c878761de1c2"
  };
  
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  /** Collez ici la clé VAPID : Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Key pair */
  window.NEEDS_FCM_VAPID_KEY = "BJ8gwYLFlZgvZzzDCGwRmDEV9VfGkIL2q01dOb7qAH2KMRsDCCO8FrHVwDgOpZdrW_YUCLH33eXbCwOXfkceZqg";
  var db = firebase.firestore();
  var auth = firebase.auth();
  var fns = firebase.app().functions("us-central1");
  const needsChatIA = fns.httpsCallable("needsChatIA");
  const getVisitorCount = fns.httpsCallable("getVisitorCount");
  const incrementVisitor = fns.httpsCallable("incrementVisitor");

  // --- VARIABLES D'ÉTAT (langue et thème depuis préférences partagées) ---
  let currentLang = (window.__needs_prefs && __needs_prefs.getLang()) ? __needs_prefs.getLang() : 'fr';
  let iaTextIndex = 0;
  let serviceToConfirm = "";
  let lastAddedId = null;
  let weekOffset = 0;
  let selectedDateStr = "";
  let weeklyPlannerData = {};
  let userUid = null;

  const iaMessages = {
    fr: ["Calcul des trajectoires...", "Core Online.", "Protection active.", "Prêt pour vos besoins."],
    en: ["Calculating trajectories...", "Core Online.", "Active protection.", "Ready for your needs."]
  };

  // --- DICTIONNAIRE : source unique js/i18n.js (NEEDS_TRANSLATIONS) ---
  var dictionary = (typeof window !== 'undefined' && window.NEEDS_TRANSLATIONS && window.NEEDS_TRANSLATIONS.fr)
    ? window.NEEDS_TRANSLATIONS
    : { fr: {}, en: {} };

  // --- LOGIQUE CALENDRIER (Inchangée) ---
  function getWeekDates(offset) {
      const week = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (let i = 0; i < 7; i++) {
          const date = new Date();
          date.setDate(today.getDate() + (offset * 7) + i);
          date.setHours(0, 0, 0, 0);
          week.push(date);
      }
      return week;
  }

  function formatDateKey(date) { 
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`; 
  }

  function renderDayButtons() {
      const weekDates = getWeekDates(weekOffset);
      const container = document.getElementById('weekSelector');
      if(!container) return;
      container.innerHTML = '';
      const dayNames = currentLang === 'fr' ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      weekDates.forEach((date) => {
          const dateKey = formatDateKey(date);
          const btn = document.createElement('button');
          btn.className = `week-day-btn ${dateKey === selectedDateStr ? 'active' : ''}`;
          btn.innerHTML = `${dayNames[date.getDay()]}<br><span style="font-size:0.75rem">${date.getDate()}</span>`;
          btn.onclick = () => { 
              selectedDateStr = dateKey; 
              renderDayButtons(); 
              renderPlanner(); 
              updateDisplayHeader(date); 
              maybePersistPlannerGuest();
          };
          container.appendChild(btn);
      });
  }

  function updateDisplayHeader(date) {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const dd = document.getElementById('displayDate');
      if (!dd) return;
      dd.innerText = date.toLocaleDateString(currentLang === 'fr' ? 'fr-CA' : 'en-CA', options);
  }

  function changeWeek(dir) {
    weekOffset += dir;
    renderDayButtons();
    maybePersistPlannerGuest();
  }

  // --- LOGIQUE PLANNING & FIRESTORE ---
  const PLANNER_LS_KEY = "needs_saved_planner_v1";
  const PLANNER_EXPIRE_MS = 12 * 60 * 60 * 1000; // 12h pour payer (compromis client / fournisseur)

  function persistPlannerLocal() {
    try {
      localStorage.setItem(
        PLANNER_LS_KEY,
        JSON.stringify({
          data: weeklyPlannerData,
          selectedDateStr: selectedDateStr,
          weekOffset: weekOffset
        })
      );
    } catch (e) {
      console.warn(e);
    }
  }

  /** @returns {boolean} true si des données locales ont été restaurées */
  function loadPlannerFromLocalStorage() {
    try {
      const raw = localStorage.getItem(PLANNER_LS_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.data !== "object") return false;
      weeklyPlannerData = parsed.data;
      if (parsed.selectedDateStr) selectedDateStr = parsed.selectedDateStr;
      if (parsed.weekOffset != null && !isNaN(Number(parsed.weekOffset))) weekOffset = Number(parsed.weekOffset);
      return true;
    } catch (e) {
      return false;
    }
  }

  function maybePersistPlannerGuest() {
    if (!userUid) persistPlannerLocal();
  }

  function isSlotExpired(slot) {
    if (!slot || slot.addedAt == null) return false;
    return (Date.now() - slot.addedAt) > PLANNER_EXPIRE_MS;
  }

  function filterExpiredSlotsFromPlanner() {
    let changed = false;
    Object.keys(weeklyPlannerData).forEach(function (dateKey) {
      const before = weeklyPlannerData[dateKey].length;
      weeklyPlannerData[dateKey] = (weeklyPlannerData[dateKey] || []).filter(function (s) { return !isSlotExpired(s); });
      if (weeklyPlannerData[dateKey].length !== before) changed = true;
      if (weeklyPlannerData[dateKey].length === 0) delete weeklyPlannerData[dateKey];
    });
    return changed;
  }

  function addToPlannerData(name, desc, addr, time, dateKey, serviceId, price) {
    if (dateKey == null) dateKey = selectedDateStr;
    if (!weeklyPlannerData[dateKey]) weeklyPlannerData[dateKey] = [];
    const newId = Date.now();
    const item = { id: newId, name, desc, addr, time, addedAt: newId };
    if (serviceId) item.serviceId = serviceId;
    if (price != null && price > 0) item.price = price;
    if (serviceId && price != null && price > 0) item.bookedAt = new Date().toISOString();
    weeklyPlannerData[dateKey].push(item);
    lastAddedId = newId;
    weeklyPlannerData[dateKey].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    renderPlanner();
    maybePersistPlannerGuest();
  }

  async function loadSavedPlanner(uid) {
    try {
      const doc = await db.collection("users").doc(uid).get();
      const cloud = doc.exists && doc.data().savedPlanner;
      const hasCloud =
        cloud &&
        typeof cloud === "object" &&
        Object.keys(cloud).some(function (k) {
          return (cloud[k] || []).length > 0;
        });
      if (hasCloud) {
        weeklyPlannerData = cloud;
        if (filterExpiredSlotsFromPlanner()) {
          renderPlanner();
          if (userUid) await db.collection("users").doc(userUid).set({ savedPlanner: weeklyPlannerData }, { merge: true });
        } else {
          renderPlanner();
        }
      } else {
        loadPlannerFromLocalStorage();
        if (Object.keys(weeklyPlannerData).some(function (k) { return (weeklyPlannerData[k] || []).length > 0; })) {
          filterExpiredSlotsFromPlanner();
          renderPlanner();
          await db.collection("users").doc(uid).set({ savedPlanner: weeklyPlannerData }, { merge: true });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function saveToFirebase() {
    try {
      filterExpiredSlotsFromPlanner();
      if (!userUid) {
        persistPlannerLocal();
        showToast(
          currentLang === "fr"
            ? "✅ Planning enregistré sur cet appareil (connectez-vous pour synchroniser le cloud)."
            : "✅ Planner saved on this device (log in to sync to the cloud)."
        );
        return;
      }
      await db.collection("users").doc(userUid).set({ savedPlanner: weeklyPlannerData }, { merge: true });
      showToast(currentLang === 'fr' ? "✅ Planning synchronisé !" : "✅ Planner synced!");
    } catch (e) {
      showToast("Erreur: " + e.message);
    }
  }

  function renderPlanner() {
    const expiredRemoved = filterExpiredSlotsFromPlanner();
    const planner = document.getElementById('plannerItems');
    if(!planner) return;
    planner.innerHTML = '';
    const dayData = (weeklyPlannerData[selectedDateStr] || []).filter(function (s) { return !isSlotExpired(s); });
    if (dayData.length === 0) {
        planner.innerHTML = `<p style="text-align: center; color: var(--text-primary); margin-top: 80px; opacity: 0.9;" data-tr="agenda_empty">${dictionary[currentLang].agenda_empty}</p>`;
        if (expiredRemoved) maybePersistPlannerGuest();
        return;
    }
    const payables = dayData.filter(function (i) { return i.serviceId && i.price > 0; });
    const totalDay = payables.reduce(function (sum, i) { return sum + (i.price || 0); }, 0);
    const fmtDay = (window.__needs_prefs && __needs_prefs.formatPriceCad) ? __needs_prefs.formatPriceCad(totalDay) : ('CA$ ' + totalDay.toFixed(2));
    const payDayBtn = payables.length >= 2 && totalDay > 0
        ? `<button type="button" class="btn-pay-day" onclick="payPlannerDay()" style="margin-bottom:12px;padding:10px 18px;font-size:13px;background:var(--pro-blue, #1d4ed8);color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:700;"><i class="fa-solid fa-credit-card"></i> ${currentLang === 'fr' ? 'Payer la journée' : 'Pay the day'} (${fmtDay})</button>`
        : '';
    if (payDayBtn) planner.innerHTML += '<div class="pay-day-row">' + payDayBtn + '</div>';
    dayData.forEach(item => {
        const canPay = item.serviceId && item.price > 0;
        const paySlotFmt = (window.__needs_prefs && __needs_prefs.formatPriceCad) ? __needs_prefs.formatPriceCad(item.price) : ('CA$ ' + String(item.price));
        const payBtn = canPay
            ? `<button type="button" class="btn-pay-slot" onclick="payPlannerSlot(${item.id})" style="margin-left:8px;padding:6px 12px;font-size:11px;background:var(--pro-blue, #1d4ed8);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;"><i class="fa-solid fa-credit-card"></i> ${currentLang === 'fr' ? 'Payer' : 'Pay'} ${paySlotFmt}</button>`
            : '';
        planner.innerHTML += `
        <div class="planned-item">
            <div>
                <span class="planned-time-tag">${item.time || ''}</span>
                <b>${item.name}</b>
                <span class="planned-info">${item.addr || ''}</span>
                ${payBtn}
            </div>
            <i class="fa-solid fa-trash" style="color:#ef4444; cursor:pointer" onclick="removeFromPlanner(${item.id})"></i>
        </div>`;
    });
    if (expiredRemoved) maybePersistPlannerGuest();
  }

  function removeFromPlanner(id) {
    weeklyPlannerData[selectedDateStr] = weeklyPlannerData[selectedDateStr].filter(item => item.id !== id);
    renderPlanner();
    maybePersistPlannerGuest();
  }

  async function payPlannerSlot(itemId) {
    if (!userUid) {
      showToast(currentLang === 'fr' ? "Connectez-vous pour payer." : "Log in to pay.");
      return;
    }
    const dayData = weeklyPlannerData[selectedDateStr] || [];
    const item = dayData.find(function (i) { return i.id === itemId; });
    if (!item || !item.serviceId || !item.price) {
      showToast(currentLang === 'fr' ? "Ce créneau n'est pas réservable (pas de service lié)." : "This slot is not bookable.");
      return;
    }
    try {
      const createSession = fns.httpsCallable('createCheckoutSession');
      const base = window.location.origin || '';
      const result = await createSession({
        amount: item.price,
        title: item.name,
        serviceId: item.serviceId,
        successUrl: base + '/success.html',
        cancelUrl: base + '/index.html'
      });
      if (result.data && result.data.url) {
        window.location.href = result.data.url;
      } else {
        showToast(currentLang === 'fr' ? "Impossible de créer le paiement." : "Could not create payment.");
      }
    } catch (e) {
      showToast(e.message || (currentLang === 'fr' ? "Erreur paiement." : "Payment error."));
    }
  }

  async function payPlannerDay() {
    if (!userUid) {
      showToast(currentLang === 'fr' ? "Connectez-vous pour payer." : "Log in to pay.");
      return;
    }
    const dayData = (weeklyPlannerData[selectedDateStr] || []).filter(function (s) { return !isSlotExpired(s); });
    const items = dayData.filter(function (i) { return i.serviceId && i.price > 0; }).map(function (i) { return { serviceId: i.serviceId, title: i.name, amount: i.price }; });
    if (items.length < 2) {
      showToast(currentLang === 'fr' ? "Payer la journée : au moins 2 services payants ce jour." : "Pay the day: at least 2 bookable services.");
      return;
    }
    try {
      const createBatch = fns.httpsCallable('createCheckoutSessionBatch');
      const base = window.location.origin || '';
      const result = await createBatch({
        items,
        successUrl: base + '/success.html',
        cancelUrl: base + '/index.html'
      });
      if (result.data && result.data.url) {
        window.location.href = result.data.url;
      } else {
        showToast(currentLang === 'fr' ? "Impossible de créer le paiement." : "Could not create payment.");
      }
    } catch (e) {
      showToast(e.message || (currentLang === 'fr' ? "Erreur paiement." : "Payment error."));
    }
  }

  function clearFullAgenda() {
      if(confirm(currentLang === 'fr' ? "Vider ce jour ?" : "Clear this day?")) {
          weeklyPlannerData[selectedDateStr] = [];
          renderPlanner();
          maybePersistPlannerGuest();
      }
  }

  function exportPlanningToIcs() {
    let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Needs//Planning//FR\r\n';
    Object.keys(weeklyPlannerData || {}).forEach(function(dateKey) {
      const items = weeklyPlannerData[dateKey] || [];
      items.forEach(function(item) {
        const [h, m] = (item.time || '09:00').split(':').map(Number);
        const d = new Date(dateKey + 'T' + (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':00');
        const end = new Date(d.getTime() + 60 * 60 * 1000);
        const fmt = function(x) {
          const y = x.getFullYear();
          const mo = String(x.getMonth() + 1).padStart(2, '0');
          const day = String(x.getDate()).padStart(2, '0');
          const hh = String(x.getHours()).padStart(2, '0');
          const mm = String(x.getMinutes()).padStart(2, '0');
          const ss = String(x.getSeconds()).padStart(2, '0');
          return y + mo + day + 'T' + hh + mm + ss;
        };
        ics += 'BEGIN:VEVENT\r\nDTSTART:' + fmt(d) + '\r\nDTEND:' + fmt(end) + '\r\nSUMMARY:' + (item.name || 'Service').replace(/\r?\n/g, ' ') + '\r\nDESCRIPTION:' + (item.addr || '').replace(/\r?\n/g, ' ') + '\r\nEND:VEVENT\r\n';
      });
    });
    ics += 'END:VCALENDAR\r\n';
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'needs-planning.ics';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast(currentLang === 'fr' ? 'Planning exporté (.ics)' : 'Planner exported (.ics)');
  }

  // --- INTERFACE & LANGUE (persistées sur toutes les pages) ---
  function toggleMode() {
    const isLight = document.body.classList.toggle('light-mode');
    document.documentElement.classList.toggle('needs-light', isLight);
    if (isLight) document.body.classList.remove('dark-mode');
    else document.body.classList.add('dark-mode');
    const theme = isLight ? 'light' : 'dark';
    if (window.__needs_prefs) __needs_prefs.setTheme(theme);
    const btn = document.getElementById('modeBtn');
    if (btn) btn.innerHTML = isLight ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.content = isLight ? '#faf8f5' : '#0a0a0f';
  }

  function switchLang() {
    currentLang = currentLang === 'fr' ? 'en' : 'fr';
    if (window.__needs_prefs) __needs_prefs.setLang(currentLang);
    __needs_prefs.applyLang(currentLang);
    var lb = document.getElementById('langBtn');
    if (lb) lb.textContent = currentLang === 'fr' ? 'EN' : 'FR';
    document.querySelectorAll('[data-tr]').forEach(el => {
      const key = el.getAttribute('data-tr');
      if (dictionary[currentLang][key]) el.innerHTML = dictionary[currentLang][key];
    });
    const qml = document.getElementById('quickMatchLabel');
    if (qml && dictionary[currentLang].quick_match_label) qml.textContent = dictionary[currentLang].quick_match_label;
    document.querySelectorAll('[data-tr-ph]').forEach(el => {
      const key = el.getAttribute('data-tr-ph');
      if (dictionary[currentLang][key]) el.placeholder = dictionary[currentLang][key];
    });
    if (window.NeedsI18n) window.NeedsI18n.applyDOM(currentLang);
    renderDayButtons();
    const activeItem = document.querySelector('.agenda-cat-item.active');
    if(activeItem) {
        const t = activeItem.innerText.toLowerCase();
        const cat = t.includes('tous') || t.includes('all serv') ? 'all' : t.includes('foyer') || t.includes('my home') ? 'home' : t.includes('digital') ? 'tech' : (t.includes('démarches') || t.includes('projets') || t.includes('legal')) ? 'pro' : t.includes('locations') || t.includes('rentals') ? 'rent' : t.includes('événements') || t.includes('events') ? 'event' : 'life';
        loadAgendaServices(cat);
    }
  }

  // Restaurer thème + langue au chargement (après que le DOM soit prêt)
  function applySavedPrefs() {
    if (!window.__needs_prefs) return;
    var theme = __needs_prefs.getTheme();
    if (theme === 'light') {
      document.body.classList.add('light-mode');
      document.body.classList.remove('dark-mode');
      document.documentElement.classList.add('needs-light');
      var modeBtn = document.getElementById('modeBtn');
      if (modeBtn) modeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
      var meta = document.getElementById('meta-theme-color');
      if (meta) meta.content = '#faf8f5';
    } else {
      document.body.classList.remove('light-mode');
      document.body.classList.add('dark-mode');
      document.documentElement.classList.remove('needs-light');
      var modeBtnDark = document.getElementById('modeBtn');
      if (modeBtnDark) modeBtnDark.innerHTML = '<i class="fa-solid fa-moon"></i>';
      var metaDark = document.getElementById('meta-theme-color');
      if (metaDark) metaDark.content = '#0a0a0f';
    }
    currentLang = __needs_prefs.getLang();
    var langBtn = document.getElementById('langBtn');
    if (langBtn) langBtn.textContent = currentLang === 'fr' ? 'EN' : 'FR';
    var footerCur = document.getElementById('footerCurrency');
    if (footerCur && __needs_prefs.getCurrency) footerCur.value = __needs_prefs.getCurrency();
    document.querySelectorAll('[data-tr]').forEach(function(el) {
      var key = el.getAttribute('data-tr');
      if (dictionary[currentLang] && dictionary[currentLang][key]) el.innerHTML = dictionary[currentLang][key];
    });
    var qml = document.getElementById('quickMatchLabel');
    if (qml && dictionary[currentLang] && dictionary[currentLang].quick_match_label) qml.textContent = dictionary[currentLang].quick_match_label;
    document.querySelectorAll('[data-tr-ph]').forEach(function(el) {
      var key = el.getAttribute('data-tr-ph');
      if (dictionary[currentLang] && dictionary[currentLang][key]) el.placeholder = dictionary[currentLang][key];
    });
    if (window.NeedsI18n) window.NeedsI18n.applyDOM(currentLang);
    if (typeof renderDayButtons === 'function') renderDayButtons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applySavedPrefs);
  else applySavedPrefs();

  function rotateIAText() {
      const el = document.getElementById('iaTextContent');
      if(!el) return;
      el.classList.remove('fade-text'); void el.offsetWidth; el.classList.add('fade-text');
      el.innerText = iaMessages[currentLang][iaTextIndex];
      iaTextIndex = (iaTextIndex + 1) % iaMessages[currentLang].length;
  }
  setInterval(rotateIAText, 5000);

  // --- CHARGEMENT SERVICES DEPUIS FIRESTORE ---
  let agendaServicesCache = [];
  let agendaCurrentCat = 'all';
  let agendaExpanded = false;

  async function loadAgendaServices(cat, el) {
    agendaExpanded = false;
    if(el) {
      document.querySelectorAll('.agenda-cat-item').forEach(item => item.classList.remove('active'));
      el.classList.add('active');
    }
    agendaCurrentCat = cat;
    const container = document.getElementById('serviceOptions');
    if(!container) return;
    container.innerHTML = '<p style="color:var(--text-muted);padding:15px;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</p>';

    try {
      let query = db.collection("services");
      if (cat !== 'all') query = query.where("cat", "==", cat);
      const snap = await query.get();
      agendaServicesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAgendaServices();
    } catch (e) {
      console.error(e);
      agendaServicesCache = [];
      container.innerHTML = '<p style="color:var(--text-muted);padding:15px;">Aucun service trouvé. <a href="services.html" style="color:var(--pro-blue);">Voir les services</a></p>';
    }
  }

  function filterAgendaServices() {
    const q = (document.getElementById('agendaSearch')?.value || '').toLowerCase().trim();
    renderAgendaServices(q);
  }

  function getAgendaMaxVisible() {
    try {
      if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 600px)').matches) return 4;
    } catch (e) {}
    return 6;
  }

  function toggleAgendaExpand() {
    agendaExpanded = !agendaExpanded;
    var q = (document.getElementById('agendaSearch') && document.getElementById('agendaSearch').value || '').toLowerCase().trim();
    renderAgendaServices(q);
  }
  window.toggleAgendaExpand = toggleAgendaExpand;

  function renderAgendaServices(searchQuery = '') {
    const container = document.getElementById('serviceOptions');
    if(!container) return;
    let list = agendaServicesCache;
    if (searchQuery) {
      list = list.filter(s =>
        (s.title || '').toLowerCase().includes(searchQuery) ||
        (s.description || '').toLowerCase().includes(searchQuery)
      );
    }
    if (list.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:15px;">Aucun service trouvé.</p>';
      return;
    }
    const maxV = getAgendaMaxVisible();
    const total = list.length;
    const cat = typeof agendaCurrentCat !== 'undefined' ? agendaCurrentCat : 'all';
    const showAll = cat !== 'all' && agendaExpanded;
    const count = showAll ? total : Math.min(maxV, total);
    const slice = list.slice(0, count);
    const moreLine = (function () {
      if (cat === 'all' || total <= maxV) return '';
      var seeAllHref = 'services.html?cat=' + encodeURIComponent(cat);
      var seeAllLabel = (window.NeedsI18n && window.NeedsI18n.t) ? window.NeedsI18n.t('agenda_see_all_cat') : (currentLang === 'fr' ? 'Voir tous les services de cette catégorie →' : 'See all services in this category →');
      var allLink = '<div style="margin-top:10px;text-align:center;"><a href="' + seeAllHref + '" class="agenda-see-all-link" style="display:inline-block;font-size:0.8rem;color:#C9A84C;font-weight:700;text-decoration:none;">' + seeAllLabel + '</a></div>';
      if (!agendaExpanded) {
        var labelMore = (window.NeedsI18n && window.NeedsI18n.t) ? window.NeedsI18n.t('agenda_see_more') : (currentLang === 'fr' ? 'Voir plus (' + total + ')' : 'See more (' + total + ')');
        labelMore = labelMore.replace(/\{\{n\}\}/g, String(total));
        return '<div style="margin-top:14px;text-align:center;display:flex;flex-direction:column;gap:10px;align-items:center;">' +
          '<button type="button" class="agenda-toggle-btn" onclick="toggleAgendaExpand()" style="padding:10px 16px;border-radius:10px;background:#C9A84C;color:#1a1a1a;font-weight:800;font-size:0.85rem;border:none;cursor:pointer;">' + labelMore + '</button>' +
          allLink + '</div>';
      }
      var labelLess = (window.NeedsI18n && window.NeedsI18n.t) ? window.NeedsI18n.t('agenda_see_less') : (currentLang === 'fr' ? 'Voir moins ▲' : 'See less ▲');
      return '<div style="margin-top:14px;text-align:center;display:flex;flex-direction:column;gap:10px;align-items:center;">' +
        '<button type="button" class="agenda-toggle-btn" onclick="toggleAgendaExpand()" style="padding:10px 16px;border-radius:10px;background:#2a2a32;color:var(--text-primary);font-weight:800;font-size:0.85rem;border:1px solid rgba(201,168,76,.35);cursor:pointer;">' + labelLess + '</button>' +
        allLink + '</div>';
    })();
    container.innerHTML = slice.map(function (s, idx) {
      const title = (s.title || 'Service');
      const price = s.price && window.__needs_prefs && window.__needs_prefs.formatPriceCad
        ? __needs_prefs.formatPriceCad(s.price)
        : (s.price ? ('CA$ ' + String(s.price)) : '');
      const safeId = (s.id || '').replace(/"/g, '');
      const extra = showAll && idx >= maxV ? ' service-mini-card--extra' : '';
      return '<div class="service-mini-card' + extra + '" data-svc-title="' + title.replace(/"/g, '&quot;') + '" data-svc-id="' + safeId + '" onclick="openIAModal(this.dataset.svcTitle, this.dataset.svcId)"><strong>' + title + '</strong>' + (price ? '<br><small style="color:var(--pro-blue)">' + price + '</small>' : '') + '</div>';
    }).join('') + moreLine;
  }

  // --- MODALE IA ---
  function openIAModal(name, serviceId) {
    serviceToConfirm = name;
    window._lastAgendaServiceId = serviceId || null;
    var mt = document.getElementById('modalTitleIA');
    var mo = document.getElementById('iaServiceModal');
    if (!mt || !mo) return;
    mt.innerText = name;
    mo.style.display = 'flex';
  }

  function closeIAModal() {
    var mo = document.getElementById('iaServiceModal');
    if (mo) mo.style.display = 'none';
    var d = document.getElementById('iaDesc'), a = document.getElementById('iaAddr'), t = document.getElementById('iaTime');
    if (d) d.value = '';
    if (a) a.value = '';
    if (t) t.value = '';
  }

  function confirmAddWithIA() {
    const desc = document.getElementById('iaDesc').value;
    const addr = document.getElementById('iaAddr').value;
    const time = document.getElementById('iaTime').value;
    if(!desc || !addr || !time) return showToast(currentLang === 'fr' ? "Remplissez tout." : "Fill all fields.");
    addToPlannerData(serviceToConfirm, desc, addr, time);
    closeIAModal();
  }

  function getPreciseLocation() {
    const btn = document.getElementById('geoBtn');
    if (!btn) return;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async p => {
            const lat = p.coords.latitude;
            const lon = p.coords.longitude;
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                const data = await res.json();
                document.getElementById('iaAddr').value = data.display_name.split(',').slice(0,3).join(',');
            } catch(e) { 
                document.getElementById('iaAddr').value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`; 
            }
            btn.innerHTML = '<i class="fa-solid fa-check"></i> OK';
        }, () => {
            showToast("Accès GPS refusé.");
            btn.innerHTML = '<i class="fa-solid fa-location-dot"></i>';
        });
    }
  }

  function toggleAIChat() {
    const win = document.getElementById('aiChatWindow');
    if (!win) return;
    win.style.display = (win.style.display === 'flex') ? 'none' : 'flex';
  }

  // --- Géolocalisation pour l’IA (mieux noté + plus proche) ---
  if (navigator.geolocation && !window._userCoords) {
    navigator.geolocation.getCurrentPosition(
      function (p) { window._userCoords = { lat: p.coords.latitude, lng: p.coords.longitude }; },
      function () {},
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 600000 }
    );
  }

  // --- INITIALISATION planning (uniquement si le module est présent sur la page) ---
  if (document.getElementById("weekSelector")) {
    const hadLocal = loadPlannerFromLocalStorage();
    if (!hadLocal || !selectedDateStr) {
      selectedDateStr = formatDateKey(new Date());
    }
    renderDayButtons();
    updateDisplayHeader(selectedDateStr ? new Date(selectedDateStr + "T12:00:00") : new Date());
    loadAgendaServices("all");
  }
  rotateIAText();

  // --- FONCTION D'ENVOI DU CHAT IA (Ciblée sur la fenêtre modélisée) ---
 // --- FONCTION D'ENVOI DU CHAT IA (Version US-CENTRAL1) ---
  async function handleAISubmit() {
    const input = document.getElementById('aiInput');
    const chatBody = document.getElementById('chatBodyAI');
    const userMsg = input.value.trim();
    if(!userMsg) return;

    addChatMessage(userMsg, 'user');
    input.value = '';

    const typingDiv = document.createElement('div');
    typingDiv.className = 'msg msg-ai';
    typingDiv.id = 'ai-typing-indicator';
    typingDiv.innerText = '...';
    chatBody.appendChild(typingDiv);

    try {
      const message = userMsg;
      const payload = { message };
      var d = new Date();
      payload.clientDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      if (window._userCoords && typeof window._userCoords.lat === 'number' && typeof window._userCoords.lng === 'number') {
        payload.userLocation = { lat: window._userCoords.lat, lng: window._userCoords.lng };
      }
      const res = (await needsChatIA(payload)).data;
      const indicator = document.getElementById('ai-typing-indicator');
      if (indicator) indicator.remove();
      addChatMessage(res.reply, 'ai');
      if (res.action === "PLANNER_ADD" && res.data) {
        var planDate = res.data.date;
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        if (!planDate || planDate < '2024-01-01' || planDate < todayStr) planDate = todayStr;
        addToPlannerData(res.data.service, "", "", res.data.heure, planDate, res.data.serviceId || null, res.data.price || null);
        selectedDateStr = planDate;
        var targetDate = new Date(planDate + 'T12:00:00');
        targetDate.setHours(0, 0, 0, 0);
        var diffDays = Math.round((targetDate - today) / (24 * 60 * 60 * 1000));
        weekOffset = Math.floor(diffDays / 7);
        renderDayButtons();
        updateDisplayHeader(targetDate);
        renderPlanner();
        maybePersistPlannerGuest();
      } else if (res.action === "PLANNER_REMOVE" && res.data) {
        var planDate = res.data.date;
        var serviceName = (res.data.service || "").toLowerCase();
        var targetTime = (res.data.heure || "").replace(/^(\d):/, "0$1:");
        if (!weeklyPlannerData[planDate]) weeklyPlannerData[planDate] = [];
        weeklyPlannerData[planDate] = weeklyPlannerData[planDate].filter(function (item) {
          var itemTime = (item.time || "").replace(/^(\d):/, "0$1:");
          var nameMatch = (item.name || "").toLowerCase().indexOf(serviceName) !== -1 || serviceName.indexOf((item.name || "").toLowerCase()) !== -1;
          return !(nameMatch && itemTime === targetTime);
        });
        selectedDateStr = planDate;
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var targetDate = new Date(planDate + 'T12:00:00');
        targetDate.setHours(0, 0, 0, 0);
        var diffDays = Math.round((targetDate - today) / (24 * 60 * 60 * 1000));
        weekOffset = Math.floor(diffDays / 7);
        renderDayButtons();
        updateDisplayHeader(targetDate);
        renderPlanner();
        maybePersistPlannerGuest();
      }
    } catch (e) {
      console.log("Erreur Cloud, passage au mode local:", e);
      const indicator = document.getElementById('ai-typing-indicator');
      if(indicator) indicator.remove();
      const localReply = await processAIChat(userMsg);
      addChatMessage(localReply, 'ai');
    }
  }

  function addChatMessage(text, type) {
    const chatBody = document.getElementById('chatBodyAI');
    if (!chatBody) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg msg-${type}`;
    msgDiv.innerText = text;
    chatBody.appendChild(msgDiv);
    
    // Scroll automatique vers le bas
    chatBody.scrollTop = chatBody.scrollHeight;
}

  // --- PROCESSING IA LOCAL : pioche dans les services Firestore ---
  function isServiceAvailableAt(service, dayOfWeek, timeStr, dateKey) {
    if (!service) return false;
    const days = service.availableDays;
    if (Array.isArray(days) && days.length > 0 && days.indexOf(dayOfWeek) < 0) return false;
    const from = service.availableFrom;
    const to = service.availableTo;
    const t = (timeStr || '').replace(/^(\d{1,2}):(\d{2})$/, (_, h, m) => (h.length === 1 ? '0' + h : h) + ':' + (m || '00'));
    if (from && t < from) return false;
    if (to && t > to) return false;
    const blocked = service.blockedSlots;
    if (Array.isArray(blocked) && blocked.length > 0 && timeStr && dateKey) {
      const tNorm = t.substring(0, 5);
      for (let i = 0; i < blocked.length; i++) {
        const b = blocked[i];
        if (String(b.date).substring(0, 10) === String(dateKey).substring(0, 10) && (b.time || '').substring(0, 5) === tNorm) return false;
      }
    }
    return true;
  }

  function findScoredServicesFromText(text, services) {
    const stopwords = /^(je|j|tu|il|elle|on|nous|vous|ils|elles|le|la|les|un|une|des|du|au|aux|pour|avec|dans|sur|demain|tomorrow|lundi|monday|mardi|tuesday|mercredi|wednesday|jeudi|thursday|vendredi|friday|samedi|saturday|dimanche|sunday|veux|vouloir|want|need|besoin|à|a|et|ou|de)$/i;
    const words = text.toLowerCase().replace(/[^\wàâäéèêëïîôùûüç\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopwords.test(w));
    if (words.length === 0) return [];
    const scored = [];
    services.forEach(s => {
      const title = (s.title || '').toLowerCase();
      const desc = (s.description || '').toLowerCase();
      let score = 0;
      words.forEach(w => {
        if (title.includes(w)) score += 10;
        else if (title.startsWith(w) || title.endsWith(w)) score += 8;
        else if (desc.includes(w)) score += 3;
      });
      if (text.includes(title)) score += 15;
      if (score > 0) scored.push({ service: s, score });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  function findServiceFromText(text, services) {
    const list = findScoredServicesFromText(text, services);
    return list.length ? list[0].service : null;
  }

  async function processAIChat(prompt) {
    const text = prompt.toLowerCase();
    const isEn = text.match(/hello|hi|how|you|delete|remove|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
    const lang = isEn ? 'en' : 'fr';

    if (text.match(/supprime|enleve|retire|delete|remove|cancel/)) {
      let targetDate = new Date();
      if(text.includes("demain") || text.includes("tomorrow")) targetDate.setDate(targetDate.getDate() + 1);
      const dKey = formatDateKey(targetDate);
      if(weeklyPlannerData[dKey]) {
        const initialCount = weeklyPlannerData[dKey].length;
        weeklyPlannerData[dKey] = weeklyPlannerData[dKey].filter(item => !text.includes(item.name.toLowerCase()));
        if (weeklyPlannerData[dKey].length < initialCount) {
          renderPlanner();
          maybePersistPlannerGuest();
          return lang === 'fr' ? "C'est fait ! Service retiré." : "Done! Service removed.";
        }
      }
    }

    try {
      const snapshot = await db.collection("services").get();
      const allServices = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const candidates = findScoredServicesFromText(prompt, allServices);
      if (candidates.length === 0) { /* fall through to "not found" below */ } else {
        let targetDate = new Date();
        if(text.includes("demain") || text.includes("tomorrow")) targetDate.setDate(targetDate.getDate() + 1);
        else if(text.includes("lundi") || text.includes("monday")) setDayOfWeek(targetDate, 1);
        else if(text.includes("mardi") || text.includes("tuesday")) setDayOfWeek(targetDate, 2);
        else if(text.includes("mercredi") || text.includes("wednesday")) setDayOfWeek(targetDate, 3);
        else if(text.includes("jeudi") || text.includes("thursday")) setDayOfWeek(targetDate, 4);
        else if(text.includes("vendredi") || text.includes("friday")) setDayOfWeek(targetDate, 5);
        else if(text.includes("samedi") || text.includes("saturday")) setDayOfWeek(targetDate, 6);
        else if(text.includes("dimanche") || text.includes("sunday")) setDayOfWeek(targetDate, 0);

        const dateKey = formatDateKey(targetDate);
        const timeMatch = text.match(/(\d{1,2})[h:](\d{0,2})/);
        const hour = timeMatch ? `${timeMatch[1].padStart(2,'0')}:${(timeMatch[2]||'00').padEnd(2,'0')}` : "12:00";
        const dayOfWeek = targetDate.getDay();
        const dateKeyForAvail = formatDateKey(targetDate);

        let foundService = null;
        for (let i = 0; i < candidates.length; i++) {
          if (isServiceAvailableAt(candidates[i].service, dayOfWeek, hour, dateKeyForAvail)) {
            foundService = candidates[i].service;
            break;
          }
        }
        if (!foundService) foundService = candidates[0].service;

        addToPlannerData(foundService.title, foundService.description || "Service réservé via IA", "Lieu à définir", hour, dateKey, foundService.id || null, foundService.price != null ? parseFloat(foundService.price) : null);
        selectedDateStr = dateKey;
        renderDayButtons();
        updateDisplayHeader(targetDate);
        renderPlanner();
        maybePersistPlannerGuest();

        return lang === 'fr' ? `Parfait ! J'ai ajouté "${foundService.title}" pour le ${dateKey} à ${hour}.`
                              : `Perfect! I've added "${foundService.title}" for ${dateKey} at ${hour}.`;
      }
    } catch (error) { console.error("Erreur Firestore:", error); }

    if(text.match(/bonjour|salut|hello|hi|hey/)) return lang==='fr' ? "Bonjour ! Dites-moi quel service vous voulez planifier (ex: plombier demain à 14h)." : "Hello! Tell me which service to schedule (e.g. plumber tomorrow at 2pm).";
    if(text.match(/ca va|ça va|how are you/)) return lang==='fr' ? "Je vais très bien ! Et vous ?" : "I'm doing great! How about you?";
    if(text.match(/merci|thanks/)) return lang==='fr' ? "À votre service !" : "You're welcome!";

    if(text.match(/nettoyage|maintenance|bureau|office/)) return lang==='fr' ? "Je peux planifier une intervention de maintenance pro. Quel jour ?" : "I can schedule pro maintenance for your office. Which day?";
    if(text.match(/louer|location|rent|studio|appart/)) return lang==='fr' ? "Nos catalogues de studios et véhicules sont disponibles. Voulez-vous voir les disponibilités ?" : "Our studio and vehicle catalogs are ready. Want to see availability?";

    return lang==='fr' ? "Je n'ai pas trouvé ce service. Essayez avec un mot clé (ex: plombier, massage, ménage). Consultez aussi la page Services pour voir les offres disponibles." 
                       : "Service not found. Try a keyword (e.g. plumber, massage, cleaning). Check the Services page for available offers.";
  }

  function setDayOfWeek(d, day) {
    const currentDay = d.getDay();
    const diff = (day - currentDay + 7) % 7;
    d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
  }

  function updateBecomeProviderCtaVisibility(authUser) {
    var ctaWrap = document.querySelector('.hero-cta-provider');
    var navCta = document.getElementById('navBecomeProviderLink');
    var navCtaDrawer = document.getElementById('navBecomeProviderLinkDrawer');
    function applyHide(hide) {
      if (ctaWrap) ctaWrap.style.display = hide ? 'none' : '';
      if (navCta) navCta.style.display = hide ? 'none' : '';
      if (navCtaDrawer) navCtaDrawer.style.display = hide ? 'none' : '';
    }
    if (!authUser || !authUser.uid) {
      applyHide(false);
      return;
    }
    db.collection('users').doc(authUser.uid).get().then(function (snap) {
      var d = snap.exists ? (snap.data() || {}) : {};
      var role = String(d.role || '').trim().toLowerCase();
      applyHide(role === 'provider');
    }).catch(function () {
      applyHide(false);
    });
  }

  // --- AUTH ET RECHARGEMENT PLANNING ---
  auth.onAuthStateChanged(function (user) {
    updateBecomeProviderCtaVisibility(user);
    if (user) {
      userUid = user.uid;
      loadSavedPlanner(user.uid);
      try {
        initNeedsFcmIfPossible(user.uid);
      } catch (e) {}
    } else {
      userUid = null;
      if (document.getElementById("weekSelector")) {
        loadPlannerFromLocalStorage();
        renderDayButtons();
        updateDisplayHeader(selectedDateStr ? new Date(selectedDateStr + "T12:00:00") : new Date());
        renderPlanner();
      }
    }
  });

  function initNeedsFcmIfPossible(uid) {
    if (!uid || typeof firebase === "undefined" || !firebase.messaging) return;
    var vk = window.NEEDS_FCM_VAPID_KEY;
    if (!vk || String(vk).indexOf("PASTE_VAPID") !== -1) return;
    if (sessionStorage.getItem("needs_fcm_prompted") === "1") return;
    var armed = false;
    function promptAndRegister() {
      if (armed) return;
      armed = true;
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onInteract);
      document.removeEventListener("keydown", onInteract);
      sessionStorage.setItem("needs_fcm_prompted", "1");
      var lang = (window.__needs_prefs && __needs_prefs.getLang && __needs_prefs.getLang()) || "fr";
      var msg =
        lang === "en"
          ? "Needs would like to send you notifications for your bookings and messages. Allow notifications?"
          : "Needs aimerait vous envoyer des notifications pour vos réservations et messages. Autoriser les notifications ?";
      if (!window.confirm(msg)) return;
      if (!("Notification" in window)) return;
      Notification.requestPermission().then(function (perm) {
        if (perm !== "granted") return;
        var messaging = firebase.messaging();
        return navigator.serviceWorker
          .register("/firebase-messaging-sw.js")
          .then(function (reg) {
            messaging.useServiceWorker(reg);
            return messaging.getToken({ vapidKey: vk });
          })
          .then(function (token) {
            if (!token) return;
            return db.collection("users").doc(uid).set({ fcmToken: token }, { merge: true });
          })
          .catch(function (e) {
            console.warn("FCM", e);
          });
      });
    }
    function onInteract() {
      promptAndRegister();
    }
    var timer = setTimeout(promptAndRegister, 30000);
    document.addEventListener("pointerdown", onInteract, { once: true });
    document.addEventListener("keydown", onInteract, { once: true });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && userUid) loadSavedPlanner(userUid);
  });

  // --- Compteur visiteurs (Activité Live) ---
  (function initVisitorCount() {
    const el = document.getElementById('visitorCount') || document.getElementById('liveVisitorCount');
    if (!el) return;
    const card = document.querySelector('.live-stats-card');
    function displayCount(raw) {
      var n = raw != null ? Number(raw) : NaN;
      if (!isNaN(n) && n > 0) {
        el.textContent = n.toLocaleString('fr-FR');
        if (card) card.classList.add('has-real-data');
      } else {
        el.textContent = '1';
        if (card) card.classList.add('has-real-data');
      }
    }
    const fnsRegion = firebase.app().functions('us-central1');
    const inc = fnsRegion.httpsCallable('incrementVisitor');
    const getCount = fnsRegion.httpsCallable('getVisitorCount');
    function fallback() {
      displayCount(1);
    }
    if (!localStorage.getItem('needs_visited')) {
      inc()
        .then(function (r) {
          displayCount(r.data && (r.data.count != null ? r.data.count : r.data.totalVisits));
          localStorage.setItem('needs_visited', '1');
        })
        .catch(fallback);
    } else {
      getCount()
        .then(function (r) {
          displayCount(r.data && (r.data.count != null ? r.data.count : r.data.totalVisits));
        })
        .catch(fallback);
    }
  })();

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  function homeReviewCertifiedLabel() {
    var pack = dictionary[currentLang] || dictionary.fr;
    return pack.home_review_certified_badge || "Prestation certifiée";
  }

  /** Avis Firestore : cartes alignées sur le fallback (texte échappé). */
  function renderHomeReviewLiveCards(wall, items) {
    if (!wall) return;
    wall.innerHTML = "";
    var cert = escapeHtml(homeReviewCertifiedLabel());
    items.forEach(function (d) {
      var rawText = d.text != null ? String(d.text) : "";
      var rawUser = d.user != null ? String(d.user) : "";
      var rawName = d.name != null ? String(d.name) : "";
      var rawPlace = d.place != null ? String(d.place) : "";
      var stars = d.stars != null ? String(d.stars) : "⭐⭐⭐⭐⭐";
      var text = escapeHtml(rawText);
      var name = escapeHtml(rawName);
      var place = escapeHtml(rawPlace);
      var userEsc = escapeHtml(rawUser);
      var body =
        '<p class="home-review-text">&ldquo;' +
        text +
        '&rdquo;</p>' +
        (name && place
          ? '<div class="home-review-name">' +
            name +
            '</div><div class="home-review-place">' +
            place +
            '</div><div class="home-review-stars" aria-hidden="true">' +
            escapeHtml(stars) +
            '</div>'
          : '<div class="home-review-name"><i class="fa-solid fa-circle-user" aria-hidden="true"></i> ' +
            (userEsc || "Client") +
            '</div>') +
        '<span class="home-review-card-badge">' +
        cert +
        "</span>";
      wall.innerHTML += '<article class="home-review-card">' + body + "</article>";
    });
  }

  function getValidLiveComments(items) {
    return (items || []).filter(function (c) {
      var txt = String((c && c.text) || "").trim();
      return txt.length >= 10;
    });
  }

  var liveWall = document.getElementById("commentWall");
  var fallbackGrid = document.getElementById("homeReviewsFallback");
  var reviewsSection = document.getElementById("reviewsHomeSection");

  function setHomeReviewsMode(hasLive) {
    if (fallbackGrid) {
      fallbackGrid.style.display = hasLive ? "none" : "grid";
      fallbackGrid.setAttribute("aria-hidden", hasLive ? "true" : "false");
    }
    if (liveWall) {
      liveWall.style.display = hasLive ? "grid" : "none";
      if (!hasLive) liveWall.innerHTML = "";
    }
    if (reviewsSection) reviewsSection.style.display = "";
  }

  if (liveWall && reviewsSection && db) {
    db.collection("comments")
      .orderBy("createdAt", "desc")
      .limit(6)
      .onSnapshot(
        function (snap) {
          var liveComments = [];
          snap.forEach(function (doc) {
            liveComments.push(doc.data());
          });
        var validComments = getValidLiveComments(liveComments);
        if (!validComments.length) {
            setHomeReviewsMode(false);
            return;
          }
          setHomeReviewsMode(true);
        renderHomeReviewLiveCards(liveWall, validComments);
        },
        function (err) {
          console.warn("comments listener", err);
          setHomeReviewsMode(false);
        }
      );
  }

  async function postComment() {
    const txt = document.getElementById('userComment');
    if (!txt.value.trim()) return;
    try {
      await db.collection("comments").add({ text: txt.value, user: auth.currentUser ? auth.currentUser.displayName : "Client", createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      txt.value = '';
    } catch(e) { console.error(e); }
  }

  function closeSearchSuggestionsBox() {
    var list = document.getElementById("searchSuggestions");
    if (list) {
      list.classList.remove("open");
      list.innerHTML = "";
    }
  }

  function executeSearch() {
    closeSearchSuggestionsBox();
    const val = document.getElementById('searchInput');
    if (val && val.value) {
      try {
        if (window.NeedsGA && typeof NeedsGA.event === 'function') {
          NeedsGA.event('search_service', { search_term: (val.value || '').trim() });
        }
      } catch (e) {}
      location.href = "services.html?q=" + encodeURIComponent(val.value) + "&sort=rating";
    }
  }

  var homeSearchServicesCache = null;
  var homeSearchDebounceTimer = null;
  var searchHintTimer = null;

  function getHomeSearchRating(s) {
    var r = parseFloat(s.avgRating != null ? s.avgRating : s.rating);
    return isNaN(r) ? 0 : r;
  }

  function loadHomeSearchServicesCache() {
    if (homeSearchServicesCache !== null) return Promise.resolve(homeSearchServicesCache);
    if (typeof firebase === "undefined" || !db) {
      homeSearchServicesCache = [];
      return Promise.resolve(homeSearchServicesCache);
    }
    return db.collection("services").limit(50).get().then(function (snap) {
      homeSearchServicesCache = snap.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      });
      return homeSearchServicesCache;
    }).catch(function (e) {
      console.warn("home search cache", e);
      homeSearchServicesCache = [];
      return homeSearchServicesCache;
    });
  }

  function normalizeSearchText(str) {
    var t = String(str || "").toLowerCase();
    try {
      if (t.normalize) t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {}
    return t;
  }

  /** La chaîne tapée apparaît dans le texte du service (casse et accents ignorés pour la comparaison). */
  function serviceMatchesTypedQuery(s, qNormalized) {
    if (!qNormalized) return false;
    var titleFr = normalizeSearchText(s.title || s.name || "");
    var titleEn = normalizeSearchText(s.titleEn || "");
    var desc = normalizeSearchText(s.description || "");
    var cat = normalizeSearchText(s.category || "");
    return titleFr.indexOf(qNormalized) !== -1 || titleEn.indexOf(qNormalized) !== -1 || desc.indexOf(qNormalized) !== -1 || cat.indexOf(qNormalized) !== -1;
  }

  function filterHomeSearchServices(queryLower) {
    if (!homeSearchServicesCache || !homeSearchServicesCache.length) return [];
    var q = normalizeSearchText((queryLower || "").trim());
    if (q.length < 2) return [];
    var matches = homeSearchServicesCache.filter(function (s) {
      return serviceMatchesTypedQuery(s, q);
    });
    matches.sort(function (a, b) { return getHomeSearchRating(b) - getHomeSearchRating(a); });
    return matches.slice(0, 8);
  }

  function homeSearchProviderName(s) {
    return (s.sellerName || s.providerName || "").trim() || (currentLang === "fr" ? "Prestataire" : "Provider");
  }

  function homeSearchDisplayTitle(s) {
    if (currentLang === "en" && s.titleEn) return String(s.titleEn);
    return String((s.title || s.name || "").trim() || "Service");
  }

  function tSearchSuggest(key) {
    if (window.NeedsI18n && typeof NeedsI18n.t === "function") {
      var x = NeedsI18n.t(key);
      if (x && x !== key) return x;
    }
    return (dictionary[currentLang] && dictionary[currentLang][key]) ? dictionary[currentLang][key] : key;
  }

  function escapeHtmlAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderHomeSearchSuggestions(queryTrim) {
    var list = document.getElementById("searchSuggestions");
    var input = document.getElementById("searchInput");
    if (!list || !input) return;
    var raw = queryTrim.trim();
    if (raw.length < 2) {
      closeSearchSuggestionsBox();
      return;
    }
    var filtered = filterHomeSearchServices(raw);
    list.innerHTML = "";
    if (filtered.length === 0) {
      var empty = document.createElement("div");
      empty.className = "search-suggestions-empty";
      var seeAll = tSearchSuggest("search_see_all_services");
      var prefix = tSearchSuggest("search_no_results_for");
      empty.innerHTML =
        escapeHtmlAttr(prefix) + " «" + escapeHtmlAttr(queryTrim.trim()) + "». " +
        '<a href="services.html?q=' + encodeURIComponent(queryTrim.trim()) + '&sort=rating">' + escapeHtmlAttr(seeAll) + "</a>";
      list.appendChild(empty);
      list.classList.add("open");
      return;
    }
    filtered.forEach(function (s) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-suggestion-row";
      btn.setAttribute("role", "option");
      var img = document.createElement("img");
      img.className = "search-suggestion-thumb";
      img.src = homeFeaturedImageUrl(s);
      img.alt = "";
      var meta = document.createElement("div");
      meta.className = "search-suggestion-meta";
      var titleEl = document.createElement("div");
      titleEl.className = "search-suggestion-title";
      titleEl.textContent = homeSearchDisplayTitle(s);
      var sub = document.createElement("div");
      sub.className = "search-suggestion-sub";
      var priceSpan = document.createElement("span");
      priceSpan.className = "search-suggestion-price";
      if (s.price != null && s.price !== "") {
        priceSpan.textContent = window.__needs_prefs && __needs_prefs.formatPriceCad
          ? __needs_prefs.formatPriceCad(s.price)
          : "CA$ " + Number(s.price).toFixed(2);
      } else {
        priceSpan.textContent = "—";
      }
      var ratingSpan = document.createElement("span");
      ratingSpan.className = "search-suggestion-rating";
      var rt = getHomeSearchRating(s);
      ratingSpan.textContent = rt > 0 ? "★ " + rt.toFixed(1) : "★ —";
      var provSpan = document.createElement("span");
      provSpan.className = "search-suggestion-provider";
      provSpan.textContent = homeSearchProviderName(s);
      sub.appendChild(priceSpan);
      sub.appendChild(ratingSpan);
      sub.appendChild(provSpan);
      meta.appendChild(titleEl);
      meta.appendChild(sub);
      btn.appendChild(img);
      btn.appendChild(meta);
      btn.addEventListener("click", function () {
        closeSearchSuggestionsBox();
        window.location.href = "services.html?service=" + encodeURIComponent(s.id);
      });
      list.appendChild(btn);
    });
    list.classList.add("open");
  }

  function onSearchInput() {
    var input = document.getElementById("searchInput");
    var hint = document.getElementById("searchIAHint");
    var list = document.getElementById("searchSuggestions");
    if (!input) return;
    if (hint) {
      hint.classList.remove("visible");
      clearTimeout(searchHintTimer);
      searchHintTimer = setTimeout(function () { hint.classList.add("visible"); }, 300);
      setTimeout(function () { if (hint) hint.classList.remove("visible"); }, 800);
    }
    clearTimeout(homeSearchDebounceTimer);
    var raw = (input.value || "").trim();
    if (!list || raw.length < 2) {
      if (list) {
        list.classList.remove("open");
        list.innerHTML = "";
      }
      return;
    }
    homeSearchDebounceTimer = setTimeout(function () {
      var latest = (input.value || "").trim();
      if (latest.length < 2) {
        closeSearchSuggestionsBox();
        return;
      }
      loadHomeSearchServicesCache().then(function () {
        if ((input.value || "").trim().length < 2) return;
        renderHomeSearchSuggestions(latest);
      });
    }, 300);
  }

  function initHomeSearchField() {
    var input = document.getElementById("searchInput");
    if (!input) return;
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeSearchSuggestionsBox();
        input.blur();
      }
    });
    input.addEventListener("blur", function () {
      setTimeout(closeSearchSuggestionsBox, 200);
    });
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".search-wrapper")) closeSearchSuggestionsBox();
  });

  function handleAccountClick() { auth.onAuthStateChanged(user => { location.href = user ? "compte.html" : "auth.html"; }); }

  async function reserve(id, price, title) {
      const u = auth.currentUser;
      if (!u) return location.href = "auth.html";
      await db.collection("customers")
          .doc(u.uid)
          .collection("checkout_sessions")
          .add({
              mode: "payment",
              success_url: "https://needs-ae86d.web.app/success.html",
              cancel_url: "https://needs-ae86d.web.app/index.html",
          });
  }


// -------------------- Accueil : services à la une --------------------
  const NEEDS_HOME_FEATURED_DEFAULT_IMG =
    "https://images.unsplash.com/photo-1581578017424-3dc73814715d?w=800&q=85&auto=format&fit=crop";

  function homeFeaturedImageUrl(s) {
    if (!s) return NEEDS_HOME_FEATURED_DEFAULT_IMG;
    let raw =
      (s.imageUrl && String(s.imageUrl).trim()) || (s.image && String(s.image).trim()) || "";
    const bad = !raw || /placeholder|picsum|via\.placeholder|^data:/i.test(raw);
    if (!bad && /^https?:\/\//i.test(raw)) return raw;
    return NEEDS_HOME_FEATURED_DEFAULT_IMG;
  }

  function homeFeaturedTitle(s) {
    const lang = window.NeedsI18n && NeedsI18n.getLang ? NeedsI18n.getLang() : "fr";
    if (lang === "en" && s.titleEn) return String(s.titleEn);
    return String((s.title || s.name || "").trim() || "Service");
  }

  function homeFeaturedRating(s) {
    const r = parseFloat(s.avgRating != null ? s.avgRating : s.rating);
    return isNaN(r) ? 0 : r;
  }

  function homeFeaturedBoostActive(s) {
    if (!s || s.boosted !== true) return false;
    var until = s.boostedUntil && s.boostedUntil.toDate ? s.boostedUntil.toDate() : null;
    if (!until) return true;
    return until.getTime() > Date.now();
  }

  function homeFeaturedBadgesEl(s, kind) {
    var wrap = document.createElement("div");
    wrap.className = "card-badges";
    var lang = window.NeedsI18n && NeedsI18n.getLang ? NeedsI18n.getLang() : "fr";
    var t = function (fr, en) { return lang === "en" ? en : fr; };
    if (homeFeaturedBoostActive(s) || kind === "boost") {
      var f = document.createElement("span");
      f.className = "svc-badge-featured";
      f.textContent = t("EN VEDETTE", "FEATURED");
      wrap.appendChild(f);
    }
    var rating = homeFeaturedRating(s);
    if (rating >= 4.95 || kind === "rated") {
      var top = document.createElement("span");
      top.className = "svc-badge-top-rated";
      top.textContent = "TOP RATED";
      wrap.appendChild(top);
    }
    var pl = String(s.sellerPlan || "free").toLowerCase();
    if (pl === "business" || pl === "pro") {
      var plan = document.createElement("span");
      plan.className = pl === "business" ? "svc-badge-plan-business" : "svc-badge-plan-pro";
      plan.textContent = pl === "business" ? "BUSINESS" : "PRO";
      wrap.appendChild(plan);
    }
    if (s.partnerCertified === true || s.verified === true) {
      var cert = document.createElement("span");
      cert.className = "svc-badge-partner";
      cert.textContent = t("Partenaire certifié", "Certified partner");
      wrap.appendChild(cert);
    }
    return wrap.childElementCount ? wrap : null;
  }

  function renderHomeFeaturedCards(grid, section, pick, tBoosted, tTop) {
    grid.innerHTML = "";
    if (!pick.length) {
      section.classList.add("is-empty");
      return;
    }
    section.classList.remove("is-empty");
    pick.forEach((item) => {
      const s = item.data;
      const title = homeFeaturedTitle(s);
      const a = document.createElement("a");
      a.className = "home-featured-card";
      a.href = "services.html?service=" + encodeURIComponent(item.id);
      a.style.position = "relative";
      const im = document.createElement("img");
      im.src = homeFeaturedImageUrl(s);
      im.alt = title;
      im.loading = "lazy";
      a.appendChild(im);
      var badges = homeFeaturedBadgesEl(s, item.kind);
      if (badges) a.appendChild(badges);
      const body = document.createElement("div");
      body.className = "home-featured-body";
      const h3 = document.createElement("h3");
      h3.className = "card-title";
      h3.textContent = title;
      body.appendChild(h3);
      const meta = document.createElement("div");
      meta.className = "home-featured-meta";
      const pill = document.createElement("span");
      pill.className = "home-featured-pill";
      pill.textContent = item.kind === "boost" ? tBoosted : tTop;
      const stars = document.createElement("span");
      stars.className = "card-rating";
      const rating = homeFeaturedRating(s);
      stars.textContent = rating > 0 ? "★ " + rating.toFixed(1) : "—";
      meta.appendChild(pill);
      meta.appendChild(stars);
      body.appendChild(meta);
      a.appendChild(body);
      grid.appendChild(a);
    });
  }

  function loadHomeFeaturedServices() {
    const grid = document.getElementById("homeFeaturedGrid");
    const section = document.getElementById("homeFeaturedSection");
    if (!grid || !section || typeof firebase === "undefined" || !db) return;
    const now = new Date();
    const tBoosted =
      window.NeedsI18n && NeedsI18n.t ? NeedsI18n.t("home_featured_boosted") : "En vedette";
    const tTop =
      window.NeedsI18n && NeedsI18n.t ? NeedsI18n.t("home_featured_top_rated") : "Mieux noté";

    db.collection("services")
      .where("boosted", "==", true)
      .limit(45)
      .get()
      .then((snap) => {
        const boostedRows = [];
        snap.forEach((doc) => {
          const d = doc.data();
          if (d.isActive === false || d.available === false) return;
          const until = d.boostedUntil && d.boostedUntil.toDate ? d.boostedUntil.toDate() : null;
          if (until && until.getTime() <= now.getTime()) return;
          let atMs = 0;
          if (d.boostedAt && d.boostedAt.toMillis) atMs = d.boostedAt.toMillis();
          boostedRows.push({ id: doc.id, data: d, atMs, kind: "boost" });
        });
        boostedRows.sort((a, b) => b.atMs - a.atMs);
        const need = 3;
        const pick = boostedRows.slice(0, need);
        const pickedIds = {};
        pick.forEach((p) => {
          pickedIds[p.id] = true;
        });
        if (pick.length >= need) {
          renderHomeFeaturedCards(grid, section, pick, tBoosted, tTop);
          return;
        }
        return db
          .collection("services")
          .orderBy("createdAt", "desc")
          .limit(120)
          .get()
          .then((snap2) => {
            const rated = [];
            snap2.forEach((doc) => {
              if (pickedIds[doc.id]) return;
              const d = doc.data();
              if (d.isActive === false || d.available === false) return;
              rated.push({ id: doc.id, data: d, score: homeFeaturedRating(d), kind: "rated" });
            });
            rated.sort((a, b) => b.score - a.score);
            for (let i = 0; i < rated.length && pick.length < need; i++) {
              pick.push(rated[i]);
              pickedIds[rated[i].id] = true;
            }
            renderHomeFeaturedCards(grid, section, pick, tBoosted, tTop);
          });
      })
      .catch((e) => console.warn("home featured", e));
  }

// -------------------- CHAT IA --------------------
// On s'assure que les boutons réagissent au clic
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('aiSendBtn');
    const input = document.getElementById('aiInput');

    if (btn) {
        btn.onclick = handleAISubmit;
    }
    if (input) {
        input.onkeypress = (e) => {
            if (e.key === 'Enter') handleAISubmit();
        };
    }

    // ——— Reveal on scroll (smooth Odoo-style) ———
    const revealSelectors = '.reveal, .reveal-left, .reveal-right, .reveal-stagger';
    const revealEls = document.querySelectorAll(revealSelectors);
    if (revealEls.length && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -5% 0px', threshold: 0.08 });
      revealEls.forEach((el) => observer.observe(el));
    } else {
      revealEls.forEach((el) => el.classList.add('visible'));
    }

    // Header shadow on scroll
    const header = document.querySelector('header');
    if (header) {
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    // Bouton retour en haut
    const scrollTopBtn = document.getElementById('scrollTopBtn');
    if (scrollTopBtn) {
      window.addEventListener('scroll', () => {
        scrollTopBtn.classList.toggle('visible', window.scrollY > 300);
      }, { passive: true });
      scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    // Fermer le menu mobile au clic sur un lien du drawer
    document.querySelectorAll('.nav-drawer a, .nav-drawer .btn').forEach(function (link) {
      link.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
    });

    if (document.getElementById('homeFeaturedGrid')) loadHomeFeaturedServices();
    if (document.getElementById('searchInput')) {
      loadHomeSearchServicesCache();
      initHomeSearchField();
    }
  });
