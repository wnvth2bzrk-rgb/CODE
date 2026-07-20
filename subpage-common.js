/**
 * Barre langue / thème alignée sur prefs.js (needs_lang, needs_theme).
 * Inclure après prefs.js. Les pages appellent needsSubpage.updateChromeButtons() après rendu i18n.
 */
(function () {
  function getLang() {
    if (window.__needs_prefs) return window.__needs_prefs.getLang();
    try {
      return localStorage.getItem('needs_lang') || localStorage.getItem('needsLang') || 'fr';
    } catch (e) {
      return 'fr';
    }
  }

  function setLang(lang) {
    if (window.__needs_prefs) {
      window.__needs_prefs.setLang(lang);
      window.__needs_prefs.applyLang(lang);
    } else {
      try {
        localStorage.setItem('needs_lang', lang);
      } catch (e) {}
    }
    try {
      document.documentElement.lang = lang === 'fr' ? 'fr' : 'en';
    } catch (e) {}
  }

  function toggleLang(afterChange) {
    var next = getLang() === 'fr' ? 'en' : 'fr';
    setLang(next);
    if (window.NeedsI18n) window.NeedsI18n.applyDOM(next);
    updateChromeButtons();
    if (typeof afterChange === 'function') afterChange(next);
  }

  function toggleTheme() {
    if (window.__needs_prefs && window.__needs_prefs.toggleTheme) {
      window.__needs_prefs.toggleTheme();
    }
    updateChromeButtons();
  }

  function updateChromeButtons() {
    var langBtn = document.getElementById('subpageLangBtn');
    if (langBtn) {
      langBtn.textContent = getLang() === 'fr' ? 'EN' : 'FR';
      langBtn.setAttribute('aria-label', getLang() === 'fr' ? 'Switch to English' : 'Passer en français');
    }
    var themeBtn = document.getElementById('subpageThemeBtn');
    if (themeBtn && window.__needs_prefs) {
      var isLight = window.__needs_prefs.getTheme() === 'light';
      themeBtn.innerHTML = isLight
        ? '<i class="fa-solid fa-moon" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-sun" aria-hidden="true"></i>';
      themeBtn.setAttribute('aria-label', isLight ? 'Mode sombre' : 'Mode clair');
    }
  }

  window.needsSubpage = {
    getLang: getLang,
    setLang: setLang,
    toggleLang: toggleLang,
    toggleTheme: toggleTheme,
    updateChromeButtons: updateChromeButtons
  };

  if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function () {
      updateChromeButtons();
    });
  }
})();
