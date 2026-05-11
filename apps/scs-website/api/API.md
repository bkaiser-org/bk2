# Seeclub Stäfa – Public API

Spezifikation der öffentlichen Read-Only-API, mit der die Landing Page (statisches HTML) die Daten aus der Webapp auf `seeclub.org` lädt.

**Basis-URL** (Vorschlag): `https://seeclub.org/public/api/v1`

## Inhaltsverzeichnis

- [Konventionen](#konventionen)
- [Endpunkte](#endpunkte)
  - [`GET /org`](#get-org)
  - [`GET /news`](#get-news)
  - [`GET /news/{slug}`](#get-newsslug)
  - [`GET /calendar`](#get-calendar)
  - [`GET /courses`](#get-courses)
  - [`GET /results`](#get-results)
  - [`POST /contact`](#post-contact)
- [Sprachen](#sprachen)
- [Caching & CORS](#caching--cors)
- [Fehlermodell](#fehlermodell)

---

## Konventionen

| Thema | Regel |
|---|---|
| **Format** | JSON, UTF-8 |
| **Datum** | `YYYY-MM-DD` (ISO-8601) |
| **Zeit** | `HH:MM` (24h, Europe/Zurich) |
| **Mehrsprachig** | Objekte mit Sprach-Codes: `{"de": "...", "en": "..."}`. `de` ist Pflicht. |
| **Slugs** | Kleinschreibung mit Bindestrichen: `saisonstart-2026` |
| **Bild-URLs** | Absolute https-URLs, idealerweise mit `width`/`height` |
| **HTML-Inhalt** | Sanitiziert. Erlaubt: `<p> <h2> <h3> <ul> <ol> <li> <a> <strong> <em> <blockquote> <br> <img>` |

---

## Endpunkte

### `GET /org`

Stammdaten des Vereins – verändern sich selten. Wird einmalig beim Seitenaufbau für Footer, Kontaktblock und strukturierte Daten (Schema.org) verwendet.

**Response 200**

```json
{
  "name": "Seeclub Stäfa",
  "shortName": "SCS",
  "foundedYear": 1917,
  "tagline": {
    "de": "Rudern auf dem Zürichsee seit 1917.",
    "en": "Rowing on Lake Zürich since 1917."
  },
  "description": {
    "de": "Traditionsreicher Ruderclub am Zürichsee mit Breitensport, Jugendförderung und Leistungssport.",
    "en": "Traditional rowing club on Lake Zürich – recreational, youth, and competitive rowing."
  },
  "memberCount": 120,
  "address": {
    "street": "Seestrasse 123",
    "postalCode": "8712",
    "city": "Stäfa",
    "country": "CH",
    "latitude": 47.2386,
    "longitude": 8.7232
  },
  "contact": {
    "email": "info@seeclub-staefa.ch",
    "phone": "+41 44 123 45 67"
  },
  "social": {
    "instagram": "https://www.instagram.com/seeclub_staefa/"
  },
  "memberLoginUrl": "https://seeclub.org/",
  "logoUrl": "https://bkaiser.imgix.net/tenant/scs/logo/logo.svg"
}
```

---

### `GET /news`

News-Übersicht, neueste zuerst. **Ohne** den Volltext `content` – der kommt nur beim Detail-Endpunkt.

**Query-Parameter**

| Name | Typ | Default | Beschreibung |
|---|---|---|---|
| `limit` | int | 50 | 1–200 |
| `tag` | string | – | Filtert nach Tag |

**Response 200**

```json
[
  {
    "slug": "saisonstart-2026",
    "date": "2026-04-28",
    "title": {
      "de": "Erfolgreicher Saisonstart 2026",
      "en": "Successful start to the 2026 season"
    },
    "subTitle": {
      "de": "Starke Resultate an Sarnen und Rotsee",
      "en": "Strong results at Sarnen and Rotsee"
    },
    "excerpt": {
      "de": "Unsere Athletinnen und Athleten überzeugen mit starken Leistungen an den ersten Frühjahrsregatten.",
      "en": "Our athletes deliver strong performances at the first spring regattas."
    },
    "coverImage": {
      "url": "https://cdn.seeclub.org/news/saisonstart-2026/cover.jpg",
      "alt": { "de": "Vierer beim Sonnenaufgang", "en": "Quad sculls at sunrise" },
      "width": 2048,
      "height": 1365
    },
    "tags": ["regatta", "erfolg"]
  }
]
```

---

### `GET /news/{slug}`

Einzelner Artikel mit Volltext und optionaler Galerie.

**Path-Parameter**

| Name | Typ | Beschreibung |
|---|---|---|
| `slug` | string | Eindeutiger Slug aus der Übersicht |

**Response 200** – wie `NewsSummary`, zusätzlich:

```json
{
  "slug": "saisonstart-2026",
  "date": "2026-04-28",
  "title": { "de": "...", "en": "..." },
  "subTitle": { "de": "...", "en": "..." },
  "excerpt": { "de": "...", "en": "..." },
  "coverImage": { "url": "...", "alt": { "de": "..." }, "width": 2048, "height": 1365 },
  "tags": ["regatta", "erfolg"],
  "author": { "name": "Marco Keller", "role": { "de": "Cheftrainer", "en": "Head coach" } },
  "content": {
    "de": "<p>Mit der Frühjahrsregatta in Sarnen ...</p><h2>Höhepunkte</h2><ul><li>Erster Platz im leichten Doppelzweier</li></ul>",
    "en": "<p>With the spring regatta in Sarnen ...</p><h2>Highlights</h2><ul><li>First place in lightweight double sculls</li></ul>"
  },
  "images": [
    {
      "url": "https://cdn.seeclub.org/news/saisonstart-2026/img-01.jpg",
      "alt": { "de": "Siegerehrung", "en": "Award ceremony" },
      "credit": "Foto: Lara Müller"
    }
  ]
}
```

**Response 404** – siehe [Fehlermodell](#fehlermodell).

---

### `GET /calendar`

Termine, aufsteigend sortiert nach `date`. Voreinstellung: ab heute.

**Query-Parameter**

| Name | Typ | Default | Beschreibung |
|---|---|---|---|
| `from` | date | heute | Frühestes Datum (inkl.) |
| `to` | date | – | Spätestes Datum (inkl.) |
| `category` | enum | – | `regatta` \| `club` \| `course` \| `training` |
| `limit` | int | 100 | 1–500 |

**Response 200**

```json
[
  {
    "id": "evt_8f2a1b",
    "date": "2026-06-21",
    "time": "08:30",
    "topic": {
      "de": "Ruderregatta Sarnen",
      "en": "Regatta Sarnen"
    },
    "location": "Sarnersee, Sarnen",
    "category": "regatta",
    "description": {
      "de": "Traditioneller Saisonauftakt mit Rennen über 1000 m.",
      "en": "Traditional season opener over 1000 m."
    },
    "url": "https://seeclub.org/public/calendar/evt_8f2a1b"
  },
  {
    "date": "2026-11-15",
    "time": "19:00",
    "topic": { "de": "Generalversammlung", "en": "General assembly" },
    "location": "Bootshaus Stäfa",
    "category": "club"
  }
]
```

**Hinweis** zum vom Nutzer vorgeschlagenen Format `{date, topic, location}`: Dieses Trio ist Pflicht. `category`, `time`, `description`, `url` und `id` sind optional aber empfohlen.

---

### `GET /courses`

Aktuell ausgeschriebene Kurse für Einsteiger, Jugend, Quereinstieg und Leistungssport.

**Response 200**

```json
[
  {
    "slug": "einsteigerkurs-2026",
    "audience": "beginner",
    "title": {
      "de": "Einsteigerkurs Sommer 2026",
      "en": "Beginner course summer 2026"
    },
    "startDate": "2026-06-14",
    "endDate": "2026-08-09",
    "weekdays": ["tue", "thu"],
    "time": "18:30–20:00",
    "location": "Bootshaus Stäfa",
    "priceCHF": 350,
    "spotsTotal": 12,
    "spotsAvailable": 4,
    "description": {
      "de": "In acht Wochen lernst du die Grundlagen des Ruderns im Einer, Doppelzweier und Vierer.",
      "en": "In eight weeks you will learn the basics of rowing in the single, double and quad."
    },
    "registrationUrl": "https://seeclub.org/public/courses/einsteigerkurs-2026/register"
  }
]
```

---

### `GET /results`

Öffentliche Regattaergebnisse für die "Erfolge"-Sektion.

**Query-Parameter**

| Name | Typ | Default | Beschreibung |
|---|---|---|---|
| `year` | int | aktuelles Jahr | Saisonjahr |
| `limit` | int | 20 | 1–200 |

**Response 200**

```json
[
  {
    "date": "2026-04-21",
    "regatta": "Frühjahrsregatta Sarnen",
    "location": "Sarnersee",
    "boatClass": "M2x leicht",
    "position": 1,
    "crew": ["Lara Müller", "Sophie Keller"],
    "time": "07:12.43",
    "category": "U23"
  }
]
```

---

### `POST /contact`

Nimmt eine Kontaktanfrage vom Formular auf der Kontaktseite entgegen.

**Request Body**

```json
{
  "name": "Anna Beispiel",
  "email": "anna@example.com",
  "phone": "+41 79 123 45 67",
  "subject": "course",
  "message": "Ich interessiere mich für den Einsteigerkurs im Juni.",
  "language": "de",
  "honeypot": "",
  "captchaToken": "..."
}
```

| Feld | Typ | Pflicht | Bemerkung |
|---|---|---|---|
| `name` | string | ✓ | 2–100 Zeichen |
| `email` | email | ✓ | |
| `phone` | string | – | |
| `subject` | enum | ✓ | `general` \| `course` \| `lateral` \| `youth` \| `boathouse` |
| `message` | string | ✓ | 10–5000 Zeichen |
| `language` | enum | – | `de` \| `en` |
| `honeypot` | string | – | Anti-Spam: muss leer sein |
| `captchaToken` | string | – | Optional, z. B. Cloudflare Turnstile |

**Response 202**

```json
{ "status": "accepted", "reference": "msg_8f2a1b" }
```

**Response 400/429** – siehe [Fehlermodell](#fehlermodell).

---

## Sprachen

Alle benutzerlesbaren Felder sind mehrsprachig als Objekt mit Sprach-Codes:

```json
{ "de": "Saisoneröffnung", "en": "Season opening" }
```

- **`de`** ist Pflicht und der Fallback.
- **`en`** ist empfohlen, fehlt sie, fällt der Client auf `de` zurück.
- Weitere Sprachen können später unter ihren ISO-639-1-Codes ergänzt werden, ohne Schema-Bruch.

Der Client sendet keinen `Accept-Language`-Header — er entscheidet selbst auf Basis der Browser-Sprache.

---

## Caching & CORS

**Empfohlene Header für alle GET-Endpunkte**

```http
Cache-Control: public, max-age=300, stale-while-revalidate=600
Access-Control-Allow-Origin: *
Vary: Accept-Encoding
```

`POST /contact` ist **nicht** cacheable und sollte mit Rate-Limiting versehen werden (Empfehlung: 5 Requests / IP / Minute).

---

## Fehlermodell

Alle Fehlerantworten verwenden dasselbe Schema:

```json
{
  "error": {
    "code": "not_found",
    "message": "Article not found.",
    "details": { "slug": "does-not-exist" }
  }
}
```

| HTTP | `code` | Bedeutung |
|---|---|---|
| 400 | `validation_error` | Eingabe ungültig |
| 404 | `not_found` | Ressource fehlt |
| 429 | `rate_limited` | Zu viele Requests |
| 500 | `internal_error` | Server-Fehler |
