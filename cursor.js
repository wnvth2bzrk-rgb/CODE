(function() {
  function initCursor() {
    var dot = document.getElementById('cursorDot');
    if (!dot) {
      dot = document.createElement('div');
      dot.id = 'cursorDot';
      dot.className = 'cursor-dot';
      dot.setAttribute('aria-hidden', 'true');
      if (document.body) document.body.insertBefore(dot, document.body.firstChild);
    }
    if (!window.matchMedia('(hover: hover)').matches) return;
    document.body.classList.add('custom-cursor');
    document.addEventListener('mousemove', function(e) {
      dot.classList.add('is-visible');
      dot.style.left = e.clientX + 'px';
      dot.style.top = e.clientY + 'px';
    });
    document.addEventListener('mouseleave', function() {
      dot.classList.remove('is-visible');
    });
    var sel = 'a, button, .cat-card, .btn, .nav-link, .quick-bubble, .search-suggestion-row, .service-card, .filter-btn, .btn-view, .btn-details, .btn-fav, .page-btn, .modal-close, [role="button"], .option-item, .btn-chat, .btn-pay';
    document.querySelectorAll(sel).forEach(function(el) {
      el.addEventListener('mouseenter', function() { dot.classList.add('hover'); });
      el.addEventListener('mouseleave', function() { dot.classList.remove('hover'); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCursor);
  else initCursor();
})();
