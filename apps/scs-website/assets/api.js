/* Seeclub Stäfa – API-Client gegen seeclub.org/public/api/v1
 *
 * Das Frontend spricht ausschliesslich gegen dieses Schema. Solange die API
 * noch nicht live ist, werden lokale Fallback-Daten in genau demselben Format
 * geliefert. Der Wechsel auf die echte API ist dann ein One-Line-Change in
 * SCS_API.baseUrl.
 */

const SCS_TENANT = 'scs';

const SCS_API = {
  baseUrl: 'https://europe-west6-bkaiser-org.cloudfunctions.net/publicApi/public/api/v1',

  async _get(path) {
    try {
      const res = await fetch(this.baseUrl + path, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return null;
      return await res.json();
    } catch { return null; }
  },

  async content() {
    return (await this._get(`/content?tenantId=${SCS_TENANT}`)) || null;
  },

  async org()           { return (await this._get(`/org?tenantId=${SCS_TENANT}`))       || SCS_FALLBACK.org; },
  async news(params)    {
    const q = new URLSearchParams({ tenantId: SCS_TENANT, ...(params || {}) }).toString();
    return (await this._get('/news?' + q)) || SCS_FALLBACK.news;
  },
  async newsBySlug(slug){ return (await this._get(`/news/${encodeURIComponent(slug)}?tenantId=${SCS_TENANT}`))
                              || SCS_FALLBACK.news.find(n => n.slug === slug) || null; },
  async calendar(params){
    const q = new URLSearchParams({ tenantId: SCS_TENANT, ...(params || {}) }).toString();
    return (await this._get('/calendar?' + q)) || SCS_FALLBACK.calendar;
  },
  async page(pageKey)   { return (await this._get(`/pages/${encodeURIComponent(pageKey)}?tenantId=${SCS_TENANT}`)) || null; },
  async courses()       { return (await this._get(`/courses?tenantId=${SCS_TENANT}`))   || SCS_FALLBACK.courses; },
  async results(params) {
    const q = new URLSearchParams({ tenantId: SCS_TENANT, ...(params || {}) }).toString();
    return (await this._get('/results?' + q))   || SCS_FALLBACK.results;
  },
};

/* ----------------------------------------------------------------------
 * Fallback-Daten in API-konformem Schema.
 * Werden geliefert, solange seeclub.org/public/api/v1 noch nicht antwortet.
 * -------------------------------------------------------------------- */
const SCS_FALLBACK = {

  org: {
    name: "Seeclub Stäfa",
    shortName: "SCS",
    foundedYear: 1917,
    tagline: { de: "Rudern auf dem Zürichsee seit 1917.", en: "Rowing on Lake Zürich since 1917." },
    memberCount: 120,
    address: { street: "Seestrasse", postalCode: "8712", city: "Stäfa", country: "CH",
               latitude: 47.2386, longitude: 8.7232 },
    contact: { email: "info@seeclub-staefa.ch" },
    social: { instagram: "https://www.instagram.com/seeclub_staefa/" },
    memberLoginUrl: "https://seeclub.org/",
    logoUrl: "https://bkaiser.imgix.net/tenant/scs/logo/logo.svg",
  },

  news: [
    {
      slug: "saisonstart-2026",
      date: "2026-04-28",
      title: { de: "Erfolgreicher Saisonstart 2026", en: "Successful start to the 2026 season" },
      subTitle: { de: "Starke Resultate in Sarnen und am Rotsee", en: "Strong results at Sarnen and the Rotsee" },
      excerpt: {
        de: "Unsere Athletinnen und Athleten überzeugen mit starken Leistungen an den ersten Frühjahrsregatten.",
        en: "Our athletes deliver strong performances at the first spring regattas."
      },
      coverImage: {
        url: "assets/hero-sunset.jpg",
        alt: { de: "Vierer beim Sonnenaufgang", en: "Quad sculls at sunrise" }
      },
      tags: ["regatta", "erfolg"],
      author: { name: "Marco Keller", role: { de: "Cheftrainer", en: "Head coach" } },
      content: {
        de: `<p>Mit der Frühjahrsregatta in Sarnen und dem klassischen Auftakt am Rotsee ist die Rudersaison 2026 für den Seeclub Stäfa erfolgreich angelaufen. Sowohl im Breitensport als auch im Leistungskader konnten beachtliche Resultate erzielt werden.</p><h2>Höhepunkte</h2><ul><li>Erster Platz im leichten Doppelzweier in Sarnen</li><li>Drei Finalteilnahmen am Rotsee</li><li>Starkes Debüt unserer Jugend-Crew</li></ul><p>Trainer Marco Keller spricht von einem "sehr soliden Trainingswinter, der sich jetzt auszahlt".</p>`,
        en: `<p>With the spring regatta in Sarnen and the traditional opener on the Rotsee, the 2026 season has started successfully. Strong results were achieved in both recreational and competitive rowing.</p><h2>Highlights</h2><ul><li>First place in lightweight double sculls at Sarnen</li><li>Three final appearances at the Rotsee</li><li>Strong debut for our youth crew</li></ul><p>Coach Marco Keller speaks of a "very solid winter of training that is now paying off."</p>`
      }
    },
    {
      slug: "bootshaus-update-april-2026",
      date: "2026-04-10",
      title: { de: "Neubau Bootshaus – Update April", en: "New boathouse – April update" },
      excerpt: {
        de: "Das Bauprojekt nimmt Form an. Wir blicken auf den nächsten Meilenstein.",
        en: "The construction project is taking shape. A look at the next milestone."
      },
      coverImage: { url: "assets/bootshaus-neubau.png",
                    alt: { de: "Visualisierung Neubau Bootshaus", en: "Visualisation new boathouse" } },
      tags: ["bootshaus", "projekt"],
      content: {
        de: `<p>Nach intensiven Monaten in der Planungsphase ist das Bauprojekt einen wichtigen Schritt weiter. Die Detailprojektierung steht kurz vor dem Abschluss, und die ersten Submissionen sind unterwegs.</p><h2>Was als nächstes ansteht</h2><p>Im Sommer 2026 erwarten wir die Baubewilligung. Anschliessend folgt die finale Finanzierungsrunde, bevor der Spatenstich Anfang 2027 geplant ist.</p><blockquote>Wir bauen nicht nur ein Gebäude – wir bauen ein Zuhause für den Rudersport in Stäfa für die nächsten Jahrzehnte.</blockquote><p>Mehr Informationen findest du auf der <a href="bootshaus.html">Projektseite</a>.</p>`,
        en: `<p>After intensive months of planning, the construction project has taken an important step forward. Detailed planning is nearing completion.</p><h2>What's next</h2><p>In summer 2026 we expect the building permit. The final round of financing follows before the groundbreaking, planned for early 2027.</p><blockquote>We are not just building a building – we are building a home for rowing in Stäfa for the next decades.</blockquote><p>More information on the <a href="bootshaus.html">project page</a>.</p>`
      }
    },
    {
      slug: "einsteigerkurs-anmeldung-offen",
      date: "2026-03-22",
      title: { de: "Anmeldung Einsteigerkurs offen", en: "Beginner course registration open" },
      excerpt: {
        de: "Die Plätze für den Einsteigerkurs sind ab sofort online buchbar.",
        en: "Spots for our beginner course are now bookable online."
      },
      tags: ["kurs", "einstieg"],
      content: {
        de: `<p>Der Einsteigerkurs 2026 startet am 14. Juni. In acht Wochen lernst du bei uns die Grundlagen des Ruderns – im Einer, im Doppelzweier und im Vierer.</p><h2>Daten</h2><ul><li>Start: 14. Juni 2026</li><li>Dauer: 8 Wochen</li><li>Trainingszeiten: Dienstag und Donnerstag, 18:30–20:00 Uhr</li></ul><p><a href="https://seeclub.org/public/courses">Jetzt anmelden →</a></p>`,
        en: `<p>The 2026 beginner course starts on 14 June. Over eight weeks you will learn the basics of rowing.</p><h2>Dates</h2><ul><li>Start: 14 June 2026</li><li>Duration: 8 weeks</li><li>Times: Tuesday and Thursday, 18:30–20:00</li></ul><p><a href="https://seeclub.org/public/courses">Register now →</a></p>`
      }
    },
    {
      slug: "jugend-trainingslager-2026",
      date: "2026-02-15",
      title: { de: "Jugendabteilung im Trainingslager", en: "Youth team at training camp" },
      excerpt: {
        de: "Unsere Jugendlichen verbringen eine intensive Woche am Lago di Caldonazzo.",
        en: "Our youth team spends an intensive week at Lago di Caldonazzo."
      },
      tags: ["jugend", "training"],
      content: {
        de: `<p>Eine Woche, zwei Trainings pro Tag, perfekte Bedingungen: Unsere Jugendabteilung war am Lago di Caldonazzo im Trainingslager.</p>`,
        en: `<p>One week, two training sessions a day, perfect conditions: Our youth team trained at Lago di Caldonazzo.</p>`
      }
    }
  ],

  calendar: [
    { id: "evt_001", date: "2026-05-24", category: "club",
      topic: { de: "Saisoneröffnung", en: "Season opening" },
      location: "Bootshaus Stäfa" },
    { id: "evt_002", date: "2026-06-07", time: "10:00", category: "course",
      topic: { de: "Schnuppertag für Einsteiger", en: "Open day for beginners" },
      location: "Bootshaus Stäfa" },
    { id: "evt_003", date: "2026-06-14", category: "course",
      topic: { de: "Start Einsteigerkurs", en: "Beginner course starts" },
      location: "Bootshaus Stäfa" },
    { id: "evt_004", date: "2026-06-21", time: "08:30", category: "regatta",
      topic: { de: "Ruderregatta Sarnen", en: "Regatta Sarnen" },
      location: "Sarnersee, Sarnen" },
    { id: "evt_005", date: "2026-07-05", category: "club",
      topic: { de: "Clubrennen", en: "Club race" },
      location: "Zürichsee" },
    { id: "evt_006", date: "2026-08-23", category: "regatta",
      topic: { de: "Seeclub-Regatta Zürich", en: "Seeclub regatta Zürich" },
      location: "Zürichsee" },
    { id: "evt_007", date: "2026-09-13", category: "regatta",
      topic: { de: "SM Rotsee", en: "Swiss Championships Rotsee" },
      location: "Luzern, Rotsee" },
    { id: "evt_008", date: "2026-10-04", category: "club",
      topic: { de: "Herbst-Wanderfahrt", en: "Autumn tour" },
      location: "Zürichsee" },
    { id: "evt_009", date: "2026-11-15", time: "19:00", category: "club",
      topic: { de: "Generalversammlung", en: "General assembly" },
      location: "Bootshaus Stäfa" },
  ],

  courses: [],
  results: [],
};
