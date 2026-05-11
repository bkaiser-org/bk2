/* Seeclub Stäfa – geteilte Logik: i18n, Header, Footer, Helpers */

// ---------------- i18n ----------------
const i18n = {
  de: {
    'nav.club': 'Verein', 'nav.about': 'Über uns', 'nav.history': 'Geschichte', 'nav.boathouse': 'Neues Bootshaus',
    'nav.rowing': 'Rudern', 'nav.courses': 'Kurse für Einsteiger', 'nav.youth': 'Jugendrudern',
    'nav.competitive': 'Leistungssport', 'nav.lateral': 'Quereinstieg',
    'nav.events': 'Termine', 'nav.news': 'News', 'nav.contact': 'Kontakt', 'nav.login': 'Mitgliederbereich',
    'footer.tagline': 'Rudern auf dem Zürichsee seit 1917.', 'footer.links': 'Links',
    'footer.member': 'Mitgliederbereich', 'footer.calendar': 'Kalender', 'footer.newsLink': 'News', 'footer.contact': 'Kontakt',
    'footer.follow': 'Folge uns', 'footer.imprint': 'Impressum', 'footer.privacy': 'Datenschutz',
    'common.back': '← Zurück',
    'common.loading': 'Wird geladen …',
    'common.error': 'Inhalte konnten nicht geladen werden.',
    'common.readMore': 'Weiterlesen →',
    'news.title': 'News & Erfolge',
    'news.lead': 'Aktuelles aus dem Vereinsleben, Erfolge an Regatten und Hintergründe zu unseren Projekten.',
    'news.allTags': 'Alle',
    'calendar.title': 'Termine',
    'calendar.lead': 'Anlässe, Regatten und Vereinstermine im Überblick.',
    'calendar.filter.all': 'Alle',
    'calendar.filter.regatta': 'Regatten',
    'calendar.filter.club': 'Vereinsanlässe',
    'calendar.filter.course': 'Kurse',
    'calendar.empty': 'Keine Termine in dieser Kategorie.',
    'contact.title': 'Kontakt',
    'contact.lead': 'Du hast Fragen zum Verein, zu Kursen oder zum Bootshaus-Projekt? Wir freuen uns auf deine Nachricht.',
    'contact.address': 'Adresse',
    'contact.email': 'E-Mail',
    'contact.social': 'Social',
    'contact.form.title': 'Nachricht senden',
    'contact.form.name': 'Name',
    'contact.form.email': 'E-Mail',
    'contact.form.subject': 'Betreff',
    'contact.form.subject.general': 'Allgemeine Anfrage',
    'contact.form.subject.course': 'Kursanmeldung',
    'contact.form.subject.lateral': 'Quereinstieg',
    'contact.form.subject.youth': 'Jugendrudern',
    'contact.form.subject.boathouse': 'Bootshaus-Projekt',
    'contact.form.message': 'Nachricht',
    'contact.form.submit': 'Nachricht senden',
    'contact.form.hint': 'Formularversand erfolgt über den Mitgliederbereich. Du wirst weitergeleitet.',
    'boathouse.page.title': 'Neubau Bootshaus',
    'boathouse.page.lead': 'Ein neues Zuhause für den Rudersport in Stäfa.',
    'boathouse.facts.title': 'Eckdaten',
    'boathouse.facts.year': 'Geplante Eröffnung',
    'boathouse.facts.material': 'Hauptmaterial',
    'boathouse.facts.boats': 'Bootskapazität',
    'boathouse.facts.area': 'Nutzfläche',
    'boathouse.story.title': 'Warum wir bauen',
    'boathouse.story.p1': 'Das heutige Bootshaus stammt aus einer Zeit, in der unser Verein deutlich kleiner war. Mit über 100 aktiven Mitgliedern, einer wachsenden Jugendabteilung und ambitionierten Leistungssportlern stossen wir an räumliche Grenzen.',
    'boathouse.story.p2': 'Der Neubau ist nachhaltig konzipiert, fügt sich in die Uferlandschaft ein und schafft Platz für die nächsten Generationen am Zürichsee.',
    'boathouse.support.title': 'Projekt unterstützen',
    'boathouse.support.lead': 'Der Neubau wird durch Mitgliederbeiträge, Stiftungen und private Gönnerinnen und Gönner finanziert.',
    'boathouse.support.cta': 'Im Mitgliederbereich mehr erfahren →',
  },
  en: {
    'nav.club': 'Club', 'nav.about': 'About us', 'nav.history': 'History', 'nav.boathouse': 'New boathouse',
    'nav.rowing': 'Rowing', 'nav.courses': 'Beginner courses', 'nav.youth': 'Youth rowing',
    'nav.competitive': 'Competitive', 'nav.lateral': 'Experienced rowers',
    'nav.events': 'Events', 'nav.news': 'News', 'nav.contact': 'Contact', 'nav.login': 'Member area',
    'footer.tagline': 'Rowing on Lake Zürich since 1917.', 'footer.links': 'Links',
    'footer.member': 'Member area', 'footer.calendar': 'Calendar', 'footer.newsLink': 'News', 'footer.contact': 'Contact',
    'footer.follow': 'Follow us', 'footer.imprint': 'Imprint', 'footer.privacy': 'Privacy',
    'common.back': '← Back',
    'common.loading': 'Loading …',
    'common.error': 'Could not load content.',
    'common.readMore': 'Read more →',
    'news.title': 'News & results',
    'news.lead': 'Updates from our club, regatta results, and stories behind our projects.',
    'news.allTags': 'All',
    'calendar.title': 'Events',
    'calendar.lead': 'Events, regattas, and club activities at a glance.',
    'calendar.filter.all': 'All',
    'calendar.filter.regatta': 'Regattas',
    'calendar.filter.club': 'Club events',
    'calendar.filter.course': 'Courses',
    'calendar.empty': 'No events in this category.',
    'contact.title': 'Contact',
    'contact.lead': 'Questions about the club, our courses or the boathouse project? We look forward to hearing from you.',
    'contact.address': 'Address',
    'contact.email': 'Email',
    'contact.social': 'Social',
    'contact.form.title': 'Send a message',
    'contact.form.name': 'Name',
    'contact.form.email': 'Email',
    'contact.form.subject': 'Subject',
    'contact.form.subject.general': 'General enquiry',
    'contact.form.subject.course': 'Course registration',
    'contact.form.subject.lateral': 'Experienced rower',
    'contact.form.subject.youth': 'Youth rowing',
    'contact.form.subject.boathouse': 'Boathouse project',
    'contact.form.message': 'Message',
    'contact.form.submit': 'Send message',
    'contact.form.hint': 'Form submission runs through the member area. You will be redirected.',
    'boathouse.page.title': 'New boathouse',
    'boathouse.page.lead': 'A new home for rowing in Stäfa.',
    'boathouse.facts.title': 'Key facts',
    'boathouse.facts.year': 'Planned opening',
    'boathouse.facts.material': 'Main material',
    'boathouse.facts.boats': 'Boat capacity',
    'boathouse.facts.area': 'Usable floor space',
    'boathouse.story.title': 'Why we are building',
    'boathouse.story.p1': 'The current boathouse dates back to a time when our club was much smaller. With more than 100 active members, a growing youth programme and ambitious athletes, we have outgrown the space.',
    'boathouse.story.p2': 'The new building is designed sustainably, blends into the lakeside landscape, and creates room for the next generations on Lake Zürich.',
    'boathouse.support.title': 'Support the project',
    'boathouse.support.lead': 'The new boathouse is financed by membership contributions, foundations, and private donors.',
    'boathouse.support.cta': 'Learn more in the member area →',
  }
};

function detectLang() {
  const stored = localStorage.getItem('scs-lang');
  if (stored) return stored;
  const browser = (navigator.language || 'de').toLowerCase();
  return browser.startsWith('de') ? 'de' : 'en';
}

let currentLang = detectLang();

function t(key) { return (i18n[currentLang] && i18n[currentLang][key]) || key; }

function applyLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  localStorage.setItem('scs-lang', lang);
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[lang] && i18n[lang][key]) el.textContent = i18n[lang][key];
  });
  const de = document.getElementById('lang-de');
  const en = document.getElementById('lang-en');
  if (de && en) {
    de.className = 'px-2 py-1 rounded ' + (lang === 'de' ? 'font-semibold' : 'text-slate-500');
    en.className = 'px-2 py-1 rounded ' + (lang === 'en' ? 'font-semibold' : 'text-slate-500');
  }
  // Re-render dynamische Listen
  if (typeof window.scsReRender === 'function') window.scsReRender();
}

// ---------------- Header / Footer ----------------
function renderHeader() {
  const slot = document.getElementById('site-header');
  if (!slot) return;
  slot.innerHTML = `
    <header class="sticky top-0 z-40 backdrop-blur bg-white/80 dark:bg-slate-950/80 border-b border-slate-200/60 dark:border-slate-800/60">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <a href="/public" class="flex items-center gap-3" aria-label="Seeclub Stäfa">
          <img src="https://bkaiser.imgix.net/tenant/scs/logo/logo.svg" alt="Logo Seeclub Stäfa" class="h-9 w-auto" />
          <span class="font-display font-bold text-lg hidden sm:inline">Seeclub Stäfa</span>
        </a>
        <nav class="hidden md:flex items-center gap-1" aria-label="Hauptnavigation">
          <div class="relative group">
            <button class="px-3 py-2 text-sm font-medium hover:text-scs-green transition" data-i18n="nav.club">Verein</button>
            <div class="absolute left-0 top-full pt-2 hidden group-hover:block">
              <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg py-2 min-w-[200px]">
                <a href="/public#ueber-uns" class="block px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" data-i18n="nav.about">Über uns</a>
                <a href="bootshaus.html" class="block px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" data-i18n="nav.boathouse">Neues Bootshaus</a>
              </div>
            </div>
          </div>
          <div class="relative group">
            <button class="px-3 py-2 text-sm font-medium hover:text-scs-green transition" data-i18n="nav.rowing">Rudern</button>
            <div class="absolute left-0 top-full pt-2 hidden group-hover:block">
              <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg py-2 min-w-[220px]">
                <a href="/public#kurse" class="block px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" data-i18n="nav.courses">Kurse für Einsteiger</a>
                <a href="/public#jugend" class="block px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" data-i18n="nav.youth">Jugendrudern</a>
                <a href="/public#leistungssport" class="block px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" data-i18n="nav.competitive">Leistungssport</a>
                <a href="/public#quereinstieg" class="block px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" data-i18n="nav.lateral">Quereinstieg</a>
              </div>
            </div>
          </div>
          <a href="/public/calendar" class="px-3 py-2 text-sm font-medium hover:text-scs-green transition" data-i18n="nav.events">Termine</a>
          <a href="/public/news" class="px-3 py-2 text-sm font-medium hover:text-scs-green transition" data-i18n="nav.news">News</a>
          <a href="kontakt.html" class="px-3 py-2 text-sm font-medium hover:text-scs-green transition" data-i18n="nav.contact">Kontakt</a>
        </nav>
        <div class="flex items-center gap-2">
          <div class="hidden sm:flex items-center gap-1 text-xs">
            <button id="lang-de" class="px-2 py-1 rounded" aria-label="Deutsch">DE</button>
            <span class="text-slate-300 dark:text-slate-700">|</span>
            <button id="lang-en" class="px-2 py-1 rounded" aria-label="English">EN</button>
          </div>
          <a href="https://seeclub.org/" class="hidden sm:inline-flex items-center gap-2 bg-scs-green hover:bg-scs-greenDark text-white px-4 py-2 rounded-lg text-sm font-semibold transition" data-i18n="nav.login">Mitgliederbereich</a>
          <button id="menu-toggle" class="md:hidden p-2" aria-label="Menü">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
        </div>
      </div>
      <div id="mobile-menu" class="hidden md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div class="px-4 py-3 space-y-1">
          <a href="/public#ueber-uns" class="block px-3 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800" data-i18n="nav.about">Über uns</a>
          <a href="/public#kurse" class="block px-3 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800" data-i18n="nav.courses">Kurse</a>
          <a href="/public/calendar" class="block px-3 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800" data-i18n="nav.events">Termine</a>
          <a href="/public/news" class="block px-3 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800" data-i18n="nav.news">News</a>
          <a href="kontakt.html" class="block px-3 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800" data-i18n="nav.contact">Kontakt</a>
          <a href="bootshaus.html" class="block px-3 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800" data-i18n="nav.boathouse">Bootshaus</a>
          <a href="https://seeclub.org/" class="block px-3 py-2 rounded bg-scs-green text-white text-center font-semibold" data-i18n="nav.login">Mitgliederbereich</a>
        </div>
      </div>
    </header>`;
  document.getElementById('lang-de').addEventListener('click', () => applyLang('de'));
  document.getElementById('lang-en').addEventListener('click', () => applyLang('en'));
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('mobile-menu').classList.toggle('hidden');
  });
}

function renderFooter() {
  const slot = document.getElementById('site-footer');
  if (!slot) return;
  slot.innerHTML = `
    <footer class="border-t border-slate-200 dark:border-slate-800 py-12 mt-16">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid md:grid-cols-3 gap-8 mb-8">
          <div>
            <div class="flex items-center gap-3 mb-4">
              <img src="https://bkaiser.imgix.net/tenant/scs/logo/logo.svg" alt="" class="h-9 w-auto" />
              <span class="font-display font-bold">Seeclub Stäfa</span>
            </div>
            <p class="text-sm text-slate-600 dark:text-slate-400" data-i18n="footer.tagline">Rudern auf dem Zürichsee seit 1917.</p>
          </div>
          <div>
            <h4 class="font-semibold mb-3 text-sm" data-i18n="footer.links">Links</h4>
            <ul class="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li><a href="https://seeclub.org/" class="hover:text-scs-green" data-i18n="footer.member">Mitgliederbereich</a></li>
              <li><a href="/public/calendar" class="hover:text-scs-green" data-i18n="footer.calendar">Kalender</a></li>
              <li><a href="/public/news" class="hover:text-scs-green" data-i18n="footer.newsLink">News</a></li>
              <li><a href="kontakt.html" class="hover:text-scs-green" data-i18n="footer.contact">Kontakt</a></li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold mb-3 text-sm" data-i18n="footer.follow">Folge uns</h4>
            <a href="https://www.instagram.com/seeclub_staefa/" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-scs-green">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              @seeclub_staefa
            </a>
          </div>
        </div>
        <div class="pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center gap-3 text-xs text-slate-500">
          <div>© <span id="year"></span> Seeclub Stäfa</div>
          <div class="flex gap-4">
            <a href="https://seeclub.org/public/imprint" class="hover:text-scs-green" data-i18n="footer.imprint">Impressum</a>
            <a href="https://seeclub.org/public/privacy" class="hover:text-scs-green" data-i18n="footer.privacy">Datenschutz</a>
          </div>
        </div>
      </div>
    </footer>`;
  document.getElementById('year').textContent = new Date().getFullYear();
}

// ---------------- Helpers ----------------
function fmtDate(d, withWeekday = false) {
  const date = new Date(d);
  if (isNaN(date)) return d;
  const opts = withWeekday
    ? { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }
    : { day: '2-digit', month: 'short', year: 'numeric' };
  return date.toLocaleDateString(currentLang === 'de' ? 'de-CH' : 'en-GB', opts);
}

function localized(field) {
  if (typeof field === 'object' && field !== null) return field[currentLang] || field.de || field.en;
  return field;
}

async function tryFetchJSON(url) {
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return await res.json();
  } catch { return null; }
}

function initReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }});
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
}

// ---------------- Bootstrap ----------------
document.addEventListener('DOMContentLoaded', () => {
  renderHeader();
  renderFooter();
  applyLang(currentLang);
  initReveal();
  if (typeof window.scsPageInit === 'function') window.scsPageInit();
});

// Export für Page-Skripte
window.scs = { i18n, t, applyLang, fmtDate, localized, tryFetchJSON,
               get lang() { return currentLang; } };
