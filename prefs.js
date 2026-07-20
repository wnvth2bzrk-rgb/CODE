// Préférences partagées : langue + thème + monnaie. Inclure en premier dans <head>.
(function () {
  var STORAGE_LANG = 'needs_lang';
  var STORAGE_THEME = 'needs_theme';
  var STORAGE_CURRENCY = 'needs_currency';

  /** Ancienne clé par erreur sur certaines pages — migrer une fois */
  function migrateLegacyLangKey() {
    try {
      var legacy = localStorage.getItem('needsLang');
      if (legacy && (legacy === 'fr' || legacy === 'en') && !localStorage.getItem(STORAGE_LANG)) {
        localStorage.setItem(STORAGE_LANG, legacy);
      }
    } catch (e) {}
  }
  migrateLegacyLangKey();

  // Monnaies supportées (pays / code / symbole / taux depuis EUR)
  var CURRENCIES = {
    eur: { code: 'eur', symbol: '€', name: 'Euro', rate: 1 },
    usd: { code: 'usd', symbol: '$', name: 'US Dollar', rate: 1.08 },
    gbp: { code: 'gbp', symbol: '£', name: 'British Pound', rate: 0.86 },
    chf: { code: 'chf', symbol: 'CHF', name: 'Swiss Franc', rate: 0.95 },
    cad: { code: 'cad', symbol: 'CA$', name: 'Canadian Dollar', rate: 1.47 },
    mxn: { code: 'mxn', symbol: 'MX$', name: 'Mexican Peso', rate: 18.5 }
  };

  function detectCurrency() {
    try {
      var lang = (navigator.language || navigator.userLanguage || '').toLowerCase();
      var tz = (typeof Intl !== 'undefined' && Intl.DateTimeFormat) ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
      if (lang.indexOf('en-ca') === 0 || lang.indexOf('fr-ca') === 0) return 'cad';
      if (tz.indexOf('America/Toronto') >= 0 || tz.indexOf('America/Montreal') >= 0 || tz.indexOf('America/Halifax') >= 0) return 'cad';
      if (lang.indexOf('en-us') === 0 || (tz.indexOf('America/') === 0 && tz.indexOf('America/New_York') >= 0)) return 'usd';
      if (lang.indexOf('en-gb') === 0 || tz.indexOf('Europe/London') >= 0) return 'gbp';
      if (lang.indexOf('es-mx') === 0 || tz.indexOf('America/Mexico') >= 0) return 'mxn';
      if (lang.indexOf('de') === 0 || lang.indexOf('fr') === 0 || lang.indexOf('it') === 0 || lang.indexOf('es') === 0 || tz.indexOf('Europe/') === 0) return 'eur';
      if (lang.indexOf('en') === 0) return 'usd';
    } catch (e) {}
    return 'cad';
  }

  function getCurrency() {
    try {
      var c = localStorage.getItem(STORAGE_CURRENCY);
      if (c && CURRENCIES[c]) return c;
      return detectCurrency();
    } catch (e) { return 'cad'; }
  }
  function setCurrency(code) {
    try { if (CURRENCIES[code]) localStorage.setItem(STORAGE_CURRENCY, code); } catch (e) {}
  }
  function getCurrencyInfo() {
    var c = getCurrency();
    return CURRENCIES[c] || CURRENCIES.eur;
  }
  function formatPrice(amountEur) {
    var info = getCurrencyInfo();
    var value = (amountEur == null || amountEur === '') ? 0 : (parseFloat(amountEur) * info.rate);
    var str = typeof value === 'number' && !isNaN(value) ? value.toFixed(2) : '0.00';
    return info.symbol.length === 1 ? str + ' ' + info.symbol : str + ' ' + info.symbol;
  }
  /** Montant déjà en dollars canadiens (affichage sans conversion depuis EUR) */
  function formatPriceCad(amountCad) {
    var n = amountCad == null || amountCad === '' ? 0 : parseFloat(amountCad);
    var str = typeof n === 'number' && !isNaN(n) ? (Math.abs(n - Math.round(n)) < 0.01 ? String(Math.round(n)) : n.toFixed(2)) : '0';
    return 'CA$ ' + str;
  }

  function getLang() {
    try { return localStorage.getItem(STORAGE_LANG) || 'fr'; }
    catch (e) { return 'fr'; }
  }
  function setLang(lang) {
    try { localStorage.setItem(STORAGE_LANG, lang); } catch (e) {}
  }
  function getTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_THEME);
      if (!saved) {
        localStorage.setItem(STORAGE_THEME, 'dark');
        return 'dark';
      }
      return saved;
    } catch (e) { return 'dark'; }
  }
  function setTheme(theme) {
    try { localStorage.setItem(STORAGE_THEME, theme); } catch (e) {}
  }

  // Appliquer le thème dès le chargement pour éviter le flash (classe sur html uniquement, body appliqué par les pages au besoin)
  function applyTheme(theme) {
    theme = theme || getTheme();
    var root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('needs-light');
      if (document.body) {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
      }
    } else {
      root.classList.remove('needs-light');
      if (document.body) {
        document.body.classList.remove('light-mode');
        document.body.classList.add('dark-mode');
      }
    }
  }

  // Appliquer la langue sur <html>
  function applyLang(lang) {
    lang = lang || getLang();
    document.documentElement.lang = lang === 'fr' ? 'fr' : 'en';
  }

  // Au chargement immédiat (script en head) — html reçoit la classe
  applyTheme();
  applyLang();
  // Réappliquer quand le body existe pour que body.light-mode soit posé sur toutes les pages
  if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function () {
      applyTheme();
      try {
        if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 600px)').matches) {
          var shell = document.createElement('script');
          shell.src = 'mobile-app-shell.js';
          shell.async = true;
          document.body.appendChild(shell);
        }
      } catch (e) {}
    });
  }

  function toggleTheme() {
    var t = getTheme() === 'light' ? 'dark' : 'light';
    setTheme(t);
    applyTheme(t);
    try {
      var meta = document.getElementById('meta-theme-color');
      if (meta) meta.setAttribute('content', t === 'light' ? '#faf8f5' : '#0a0908');
    } catch (e) {}
  }

  window.__needs_prefs = {
    getLang: getLang,
    setLang: setLang,
    getTheme: getTheme,
    setTheme: setTheme,
    applyTheme: applyTheme,
    applyLang: applyLang,
    toggleTheme: toggleTheme,
    getCurrency: getCurrency,
    setCurrency: setCurrency,
    getCurrencyInfo: getCurrencyInfo,
    formatPrice: formatPrice,
    formatPriceCad: formatPriceCad,
    CURRENCIES: CURRENCIES
  };

  try {
    console.log(
      "👋 Tu cherches quelque chose ? Rejoins l'équipe Needs → contact@needs-app.com"
    );
  } catch (e) {}
})();
