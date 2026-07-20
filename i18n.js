// small reusable i18n for the site — include <script src="i18n.js"></script> on every page
(function (global) {
  const TRANSLATIONS = {
    fr: {
      site_title: "Needs",
      search_placeholder: "Rechercher — plombier, chauffeur, ménage...",
      find_service: "Trouver un service",
      quick_search: "Recherche rapide",
      create_profile: "Créer mon profil",
      propose_service: "Proposer un service",
      featured_week: "Offre de la semaine",
      book_now: "Réserver",
      contact_us: "Nous contacter",
      categories_title_home: "Maison & Ménage",
      categories_home_desc: "Ménage, réparations, montage de meubles",
      categories_mobility: "Mobilité",
      categories_mobility_desc: "Chauffeurs, déménagements, logistique",
      categories_professional: "Professionnel",
      categories_professional_desc: "Design, cours particuliers, support tech",
      categories_wellbeing: "Bien‑être",
      categories_wellbeing_desc: "Coaching, jardinage, services personnels",
      testimonial_header: "Ce que disent nos clients",
      footer_terms: "Conditions",
      footer_privacy: "Confidentialité",
      address_verified: "Adresse vérifiée",
      address_not_found: "Adresse introuvable — vérifiez l'orthographe",
      address_required_valid: "Veuillez entrer une adresse valide",
      price_cad_label: "PRICE (CA$)"
    },
    en: {
      site_title: "Needs",
      search_placeholder: "Search — plumber, driver, cleaner...",
      find_service: "Find a service",
      quick_search: "Quick search",
      create_profile: "Create profile",
      propose_service: "Propose a service",
      featured_week: "Featured this week",
      book_now: "Book now",
      contact_us: "Contact us",
      categories_title_home: "Home & Cleaning",
      categories_home_desc: "Cleaning, repairs, assembly",
      categories_mobility: "Mobility",
      categories_mobility_desc: "Drivers, movers, logistics",
      categories_professional: "Professional",
      categories_professional_desc: "Design, tutors, tech support",
      categories_wellbeing: "Wellbeing",
      categories_wellbeing_desc: "Coaching, gardening, personal services",
      testimonial_header: "What our clients say",
      footer_terms: "Terms",
      footer_privacy: "Privacy",
      address_verified: "Address verified",
      address_not_found: "Address not found — check spelling",
      address_required_valid: "Please enter a valid address",
      price_cad_label: "PRICE (CA$)"
    }
  };

  function getLang() {
    try { return localStorage.getItem('needs_lang') || 'fr'; }
    catch (e) { return 'fr'; }
  }
  function setLang(lang) {
    try { localStorage.setItem('needs_lang', lang); } catch (e) {}
  }

  function translatePage(lang) {
    const t = TRANSLATIONS[lang] || TRANSLATIONS.fr;
    // text content translation: elements with data-i18n (key)
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const attr = el.getAttribute('data-i18n-attr'); // optional attribute to set (placeholder, value, title)
      const value = t[key] ?? key;
      if (attr) el.setAttribute(attr, value);
      else el.textContent = value;
    });
    // placeholders for inputs (use data-i18n + data-i18n-attr="placeholder")
  }

  function initI18n() {
    const langSelect = document.getElementById('langSelect');
    const current = getLang();
    // set select if present
    if (langSelect) langSelect.value = current;
    translatePage(current);
    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        const v = e.target.value || 'fr';
        setLang(v);
        translatePage(v);
      });
    }
  }

  // expose
  global.__needs_i18n = { initI18n, translatePage, getLang, setLang, TRANSLATIONS };
})(window);