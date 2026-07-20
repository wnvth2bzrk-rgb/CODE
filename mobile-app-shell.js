/**
 * Barre de navigation type application (téléphone uniquement).
 * Chargé depuis prefs.js lorsque la largeur est ≤ 600px.
 */
(function () {
  var MQ = '(max-width: 600px)';

  function pageKey() {
    var p = (location.pathname || '').replace(/\/+$/, '');
    var parts = p.split('/').filter(function (x) {
      return !!x;
    });
    var seg = (parts.length ? parts[parts.length - 1] : '').toLowerCase();
    if (!seg) return 'index.html';
    return seg;
  }

  function activeTab() {
    var s = pageKey();
    if (s === 'index.html' || s === '') return 'home';
    if (s.indexOf('services') === 0) return 'services';
    if (s.indexOf('favoris') === 0) return 'favoris';
    if (s.indexOf('compte') === 0 || s.indexOf('auth') === 0 || s.indexOf('profile-public') === 0) return 'compte';
    return '';
  }

  function labels() {
    var en = document.documentElement.lang === 'en';
    if (en) {
      return { home: 'Home', services: 'Services', favoris: 'Saved', compte: 'Account' };
    }
    return { home: 'Accueil', services: 'Services', favoris: 'Favoris', compte: 'Compte' };
  }

  function removeBar() {
    var n = document.getElementById('app-tabbar');
    if (n) n.remove();
    document.body.classList.remove('has-app-tabbar');
  }

  function buildBar() {
    if (document.getElementById('app-tabbar')) return;

    var L = labels();
    var cur = activeTab();

    var nav = document.createElement('nav');
    nav.id = 'app-tabbar';
    nav.className = 'app-tabbar';
    nav.setAttribute('aria-label', document.documentElement.lang === 'en' ? 'Main navigation' : 'Navigation principale');

    var items = [
      { id: 'home', href: 'index.html', icon: 'fa-house', label: L.home },
      { id: 'services', href: 'services.html', icon: 'fa-magnifying-glass', label: L.services },
      { id: 'favoris', href: 'favoris.html', icon: 'fa-heart', label: L.favoris },
      { id: 'compte', href: 'compte.html', icon: 'fa-user', label: L.compte }
    ];

    items.forEach(function (item) {
      var a = document.createElement('a');
      a.className = 'app-tabbar__link';
      a.href = item.href;
      a.setAttribute('data-app-tab', item.id);
      if (cur === item.id) a.setAttribute('aria-current', 'page');
      a.innerHTML = '<i class="fa-solid ' + item.icon + '" aria-hidden="true"></i><span>' + item.label + '</span>';
      nav.appendChild(a);
    });

    document.body.appendChild(nav);
    document.body.classList.add('has-app-tabbar');
  }

  function sync() {
    try {
      if (!window.matchMedia(MQ).matches) {
        removeBar();
        return;
      }
      if (!document.getElementById('app-tabbar')) buildBar();
      else {
        var cur = activeTab();
        document.querySelectorAll('.app-tabbar__link').forEach(function (a) {
          var id = a.getAttribute('data-app-tab');
          if (id === cur) a.setAttribute('aria-current', 'page');
          else a.removeAttribute('aria-current');
        });
      }
    } catch (e) {}
  }

  function viewportFit() {
    try {
      var m = document.querySelector('meta[name="viewport"]');
      if (m && m.getAttribute('content').indexOf('viewport-fit') < 0) {
        m.setAttribute('content', m.getAttribute('content') + ', viewport-fit=cover');
      }
    } catch (e) {}
  }

  function init() {
    viewportFit();
    sync();
    window.addEventListener('resize', function () {
      sync();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
