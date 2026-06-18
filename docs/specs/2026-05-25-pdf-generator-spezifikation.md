# Spezifikation: PDF-Generator mit Template-Verwaltung

**Version:** 1.1  
**Datum:** 25. Mai 2026  
**Status:** Entwurf  
**Bezug:** Erweiterungsmodul zum Buchhaltungs-System (siehe `docs/buchhaltungssystem-spezifikation.md`)

---

## 1. Überblick

Diese Spezifikation beschreibt einen serverseitigen Dokumentengenerator auf Basis von Puppeteer (Cloud Functions) mit Handlebars als Template-Engine, sowie das zugehörige Angular-Frontend zur Verwaltung der Templates und zur Auslösung der Generierung.

### 1.1 Komponentenübersicht

```
┌─────────────────────────┐         ┌──────────────────────────────────┐
│  Angular Frontend       │         │  Firebase Backend                │
│                         │         │                                  │
│  ┌───────────────────┐  │  HTTPS  │  ┌──────────────────────────┐  │
│  │ Template-Admin    │──┼─────────┼─▶│ Firestore                │  │
│  │ (CRUD-UI)         │  │         │  │  templates/{id}          │  │
│  └───────────────────┘  │         │  │  templates/{id}/versions │  │
│                         │         │  └──────────────────────────┘  │
│  ┌───────────────────┐  │         │                                  │
│  │ <pdf-button>      │──┼Callable─┼─▶│ Cloud Function           │  │
│  │  Widget           │  │         │  │  generateDocument        │  │
│  └───────────────────┘  │         │  │  (Puppeteer + HBS)       │  │
│                         │         │  └──────────────┬───────────┘  │
│  ┌───────────────────┐  │ Signed  │                 │              │
│  │ PDF Viewer Modal  │◀─┼─ URL ───┤  ┌──────────────▼───────────┐  │
│  └───────────────────┘  │         │  │ Cloud Storage            │  │
│                         │         │  │  assets/...              │  │
│  ┌───────────────────┐  │         │  │  generated-docs/...      │  │
│  │ CMS Page          │──┼Callable─┼─▶│ (rendered HTML input)    │  │
│  │ Print Action      │  │         │  └──────────────────────────┘  │
│  └───────────────────┘  │         │                                  │
└─────────────────────────┘         └──────────────────────────────────┘
```

### 1.2 Zielsetzung

- Zentrale Verwaltung wiederverwendbarer Dokumentvorlagen (Rechnungen, Spesenberichte, Berichte).
- Trennung von Layout (Template), Daten (Payload) und Code (Cloud Function).
- Versionierung von Templates für Nachvollziehbarkeit und Audit-Trail.
- Einheitliche, hochwertige PDF/DOCX/HTML-Generierung via Headless Chrome.
- Einfache Einbindung in beliebige Angular-Komponenten via Button-Widget.
- Druckfunktion für CMS-Seiten ohne separates Template.

### 1.3 Abgrenzung

- Keine WYSIWYG-Bearbeitung der Templates in dieser Iteration (HTML/Handlebars-Quellcode-Editor mit Vorschau).
- Keine clientseitige Dokumentgenerierung (Privacy, Layout-Konsistenz, Schutz von Templates).
- Kein integrierter E-Mail-Versand: die Cloud Function bleibt auf Generierung fokussiert. Der E-Mail-Versand erfolgt clientseitig über den bestehenden Mailgun-Cloud-Function-Transport (siehe Abschnitt 8.4).
- Elektronische Signatur (DeepSign-Integration) ist als Folgeprojekt vorgesehen (Abschnitt 11).

---

## 2. Akteure und Rollen

| Rolle | Berechtigungen |
| :---- | :---- |
| `contentAdmin` | Templates erstellen, bearbeiten, löschen, veröffentlichen; Assets verwalten |
| Authentifizierter Benutzer | PDFs/DOCX/HTML auf Basis veröffentlichter Templates generieren |
| Buchhalter / Anwender | PDF-Button in Anwendungs-UI nutzen, generierte Dokumente herunterladen |

Die Rolle `contentAdmin` entspricht dem bestehenden `contentAdmin`-Rollenfeld in `UserModel.roles`. Es wird **keine neue Rolle** eingeführt.

**Rate-Limiting:**
- Reguläre Benutzer: maximal 1 Dokument pro 5 Minuten.
- Benutzer mit `contentAdmin`- oder `admin`-Rolle: maximal 1 Dokument pro Minute.
- Bei Überschreitung: `resource-exhausted`-Fehler mit `retryAfterSeconds`-Hinweis.

---

## 3. Backend: Cloud Function `generateDocument`

### 3.1 Aufruf

- **Typ:** Firebase HTTPS Callable Function
- **Region:** `europe-west6` (Zürich) — Datenresidenz Schweiz
- **Generation:** Cloud Functions Gen 2
- **Authentifizierung:** Pflicht; `context.auth` muss gesetzt sein, sonst `unauthenticated`-Fehler

### 3.2 Request-Schema

```typescript
interface GenerateDocumentRequest {
  // Modus A: Template-basiert (Buchhaltung, Expenses, etc.)
  templateId?: string;           // Firestore-ID des Templates
  templateVersion?: number;      // Optional, default: published version
  payload?: Record<string, any>; // Daten für die Template-Variablen

  // Modus B: Raw-HTML (CMS-Seiten-Druck, siehe Abschnitt 9)
  html?: string;                 // Direkt übergebenes HTML; templateId entfällt

  options?: {
    outputFormat?: 'pdf' | 'docx' | 'html';  // Default: 'pdf'
    format?: 'A4' | 'A5' | 'Letter';         // Default: 'A4' (nur PDF)
    orientation?: 'portrait' | 'landscape';  // Default: 'portrait' (nur PDF)
    margin?: {
      top?: string; bottom?: string; left?: string; right?: string;
    };
    filename?: string;           // Default: <templateName>-<timestamp>.<ext>
    storageMode?: 'persist' | 'ephemeral'; // Default: 'persist'
    metadata?: {
      entityType?: string;       // z.B. "invoice", "expense", "cmsPage"
      entityId?: string;
    };
    // Schriftarten (CSS @font-face im Template-CSS oder im übergebenen HTML)
    // Keine separate Upload-API; Fonts werden über CSS-Integration eingebunden
    // (siehe Abschnitt 4.6)
  };
}
```

Genau eines von `templateId` oder `html` muss gesetzt sein; beide oder keins führt zu `invalid-argument`.

### 3.3 Response-Schema

```typescript
interface GenerateDocumentResponse {
  url: string;            // Signed URL, gültig 1 Stunde
  storagePath: string;    // Pfad in Cloud Storage
  filename: string;
  sizeBytes: number;
  outputFormat: 'pdf' | 'docx' | 'html';
  generatedAt: string;    // ISO 8601
  templateVersion?: number; // Fehlt bei html-Modus
  generationId: string;   // UUID für Audit-Trail
}
```

### 3.4 Verarbeitungsablauf

**Modus A — Template-basiert:**

1. Authentifizierung und Autorisierung prüfen; Rate-Limit auswerten.
2. Template laden; bei fehlendem `templateVersion` die publizierte Version verwenden.
3. Payload gegen `payloadSchema` validieren (falls definiert).
4. Handlebars kompilieren (In-Memory-Cache, Schlüssel: `templateId@version`).
5. Asset-URLs auflösen und in den Payload injizieren.
6. Template rendern → HTML-String.
7. Weiter mit Schritt 8.

**Modus B — Raw-HTML:**

1. Authentifizierung und Autorisierung prüfen; Rate-Limit auswerten.
2. HTML-String sanitieren (externe `<script>`-Tags entfernen).
3. Weiter mit Schritt 8.

**Gemeinsame Schritte:**

8. Puppeteer-Browser-Instance wiederverwenden (eine pro Function-Instance).
9. `page.setContent(html, { waitUntil: 'networkidle0' })`.
10. Je nach `outputFormat`:
    - **pdf:** `page.pdf(...)` mit den angegebenen Optionen.
    - **docx:** HTML-zu-DOCX-Konvertierung via `html-docx-js` nach dem Puppeteer-Schritt.
    - **html:** Den gerenderten HTML-String direkt speichern (kein Puppeteer-PDF-Schritt).
11. Dokument in Cloud Storage speichern: `generated-docs/{tenantId}/{userId}/{generationId}.<ext>`.
12. Audit-Eintrag schreiben (Abschnitt 3.8).
13. Signed URL erzeugen (TTL 1 Stunde).
14. Response zurückgeben.

Cleanup bei Fehler: halb hochgeladene Dokumente werden gelöscht; Audit-Eintrag erhält Status `failed`.

### 3.5 Konfiguration der Cloud Function

| Parameter | Wert | Begründung |
| :---- | :---- | :---- |
| Memory | 2 GB | Puppeteer/Chromium benötigt Speicher |
| Timeout | 120 Sekunden | Puffer für komplexe Dokumente |
| Min instances | 1 | Vermeidet Cold Start bei Puppeteer (ca. 3–5 s) |
| Max instances | 10 | Skaliert mit Last |
| Concurrency | 1 | Pro Instance nur eine Generierung gleichzeitig |

### 3.6 Sicherheit und Sandboxing

- Puppeteer startet mit `--no-sandbox --disable-setuid-sandbox` (notwendig in Gen 2).
- Network-Zugriffe des gerenderten Inhalts beschränkt auf:
  - `data:`-URIs (Base64-Bilder, eingebettete Fonts)
  - Eigenes Firebase-Storage-Projekt (signierte URLs)
  - Whitelist konfigurierter externer Domains (z.B. Google Fonts)
- Externe `<script>`-Tags werden vor dem Rendern entfernt.
- Handlebars-Helper laufen ohne Zugriff auf `process`, `require`, Filesystem.

### 3.7 Performance-Optimierungen

- **Browser-Reuse:** Eine persistente Puppeteer-Browser-Instance pro Function-Instance.
- **Template-Cache:** Kompilierte HBS-Templates, LRU-Eviction bei > 50 Einträgen.
- **Asset-Cache:** Signed URLs 50 Minuten gecacht.
- **Warm-Up-Endpoint:** `/warmup` für Cloud Scheduler (alle 5 Minuten).

### 3.8 Audit-Trail

```typescript
interface DocGeneration {
  id: string;
  tenantId: string;
  userId: string;
  templateId?: string;          // Fehlt bei html-Modus
  templateVersion?: number;
  outputFormat: 'pdf' | 'docx' | 'html';
  status: 'success' | 'failed';
  errorMessage?: string;
  storagePath?: string;
  sizeBytes?: number;
  durationMs: number;
  metadata?: { entityType?: string; entityId?: string };
  createdAt: Timestamp;
}
```

Collection: `docGenerations/{generationId}`. Aufbewahrungsfrist: 10 Jahre.

### 3.9 Fehlerbehandlung

| Fehlercode | Bedingung | HTTP-Code |
| :---- | :---- | :---- |
| `unauthenticated` | Nicht eingeloggt | 401 |
| `permission-denied` | Kein Recht auf Template | 403 |
| `not-found` | Template oder Version existiert nicht | 404 |
| `invalid-argument` | Payload-Validierung / falscher Modus | 400 |
| `failed-precondition` | Template ist deaktiviert oder Draft | 412 |
| `resource-exhausted` | Rate-Limit überschritten | 429 |
| `deadline-exceeded` | Generierung > Timeout | 504 |
| `internal` | Puppeteer-Fehler, Storage-Fehler | 500 |

Fehlermeldungen enthalten die `generationId` zur Support-Recherche.

---

## 4. Datenmodell: Templates

### 4.1 Firestore-Collection `templates`

```typescript
interface Template {
  id: string;
  tenantId: string;              // null = global
  name: string;
  description?: string;
  category: string;              // "invoice" | "expense" | "report" | ...
  language: 'de' | 'fr' | 'it' | 'en'; // Ein Template pro Sprache
  currentVersion: number;
  draftVersion?: number;
  status: 'draft' | 'published' | 'archived';
  payloadSchema?: object;        // JSON-Schema für Payload-Validierung
  sampleData?: object;
  defaultOptions?: {
    outputFormat?: 'pdf' | 'docx' | 'html';
    format?: string;
    orientation?: string;
    margin?: object;
  };
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}
```

**Mehrsprachigkeit:** Pro Sprache wird ein eigenes Template angelegt. Konvention für den Namen: `"Rechnung Standard (DE)"`, `"Facture Standard (FR)"` etc. Der `language`-Feld-Wert dient der Filterung in der UI.

### 4.2 Subcollection `templates/{id}/versions`

```typescript
interface TemplateVersion {
  version: number;
  html: string;                  // Handlebars-Template
  css?: string;                  // Wird in <style> injiziert; kann @font-face enthalten
  partials?: Record<string, string>;
  helpers?: string[];            // Whitelist registrierter Helper
  assets?: AssetReference[];
  status: 'draft' | 'published' | 'archived';
  publishedAt?: Timestamp;
  publishedBy?: string;
  changelog?: string;
  createdAt: Timestamp;
  createdBy: string;
}

interface AssetReference {
  key: string;                   // Variablenname im Template
  storagePath: string;
  mimeType: string;
}
```

### 4.3 Storage-Struktur

```
gs://<bucket>/
  assets/
    {tenantId}/
      logo.png
      letterhead.png
      fonts/
        CustomFont-Regular.woff2
  generated-docs/
    {tenantId}/
      {userId}/
        {generationId}.pdf
        {generationId}.docx
        {generationId}.html
  templates-backup/
    {tenantId}/
      {templateId}-v{version}.html
```

### 4.4 Firestore-Security-Rules

```javascript
match /templates/{templateId} {
  allow read: if request.auth != null
              && (resource.data.tenantId == null
                  || resource.data.tenantId == request.auth.token.tenantId);
  allow create, update: if request.auth != null
                           && request.auth.token.role in ['admin', 'contentAdmin']
                           && request.resource.data.tenantId == request.auth.token.tenantId;
  allow delete: if request.auth != null
                   && request.auth.token.role == 'admin';
  match /versions/{versionId} {
    allow read: if request.auth != null;
    allow create: if request.auth.token.role in ['admin', 'contentAdmin'];
    allow update: if request.auth.token.role in ['admin', 'contentAdmin']
                     && resource.data.status == 'draft';
    allow delete: if false; // Nur archivieren, nie löschen
  }
}
```

### 4.5 Whitelisted Handlebars-Helpers

| Helper | Verwendung | Beispiel |
| :---- | :---- | :---- |
| `formatMoney` | Beträge mit Schweizer Formatierung | `{{formatMoney total}}` |
| `formatDate` | Datum mit Locale | `{{formatDate date "de-CH"}}` |
| `formatIban` | IBAN in 4er-Gruppen | `{{formatIban iban}}` |
| `formatReference` | QR-Referenz in 5er-Gruppen | `{{formatReference ref}}` |
| `if`, `unless`, `each`, `with` | Standard-Handlebars | `{{#each items}}...{{/each}}` |
| `ifEquals` | Vergleich | `{{#ifEquals status "paid"}}...{{/ifEquals}}` |
| `multiply`, `add`, `subtract` | Arithmetik | `{{multiply qty price}}` |
| `assetUrl` | Asset-Referenz auflösen | `<img src="{{assetUrl 'logo'}}">` |

### 4.6 Eingebettete Schriftarten (Custom Fonts)

Schriftarten werden ausschliesslich über CSS `@font-face` eingebunden — keine separate Font-Upload-API.

**Ablauf:**
1. Font-Datei (`.woff2`) in Cloud Storage unter `assets/{tenantId}/fonts/` hochladen (über die Asset-Verwaltung im Template-Editor).
2. Im CSS-Tab des Templates eine `@font-face`-Regel mit `assetUrl` eintragen:

```css
@font-face {
  font-family: 'CustomFont';
  src: url("{{assetUrl 'font-regular'}}") format('woff2');
  font-weight: 400;
}
body { font-family: 'CustomFont', sans-serif; }
```

3. Beim Rendern löst der `assetUrl`-Helper zu einer signierten URL auf; Puppeteer lädt die Schrift über diese URL nach.

---

## 5. Frontend: Template-Administration

### 5.1 Navigation

Bereich unter `/admin/templates`, sichtbar für Rollen `admin` und `contentAdmin`.

### 5.2 Template-Liste

```
┌──────────────────────────────────────────────────────────────────────┐
│  Templates                                          [ + Neu erstellen]│
│                                                                       │
│  [🔍 Suche...]   Kategorie: [Alle ▾]  Sprache: [Alle ▾]  Status: [▾] │
├───────────────────────────────────────────────────────────────────────┤
│  Name             │ Kategorie  │ Version   │ Sprache │ Format │ Status│
├───────────────────┼────────────┼───────────┼─────────┼────────┼───────┤
│  Rechnung Stand.  │ invoice    │ v3        │ de      │ pdf    │ ✓Pub. │
│  QR-Bill (FR)     │ invoice    │ v2        │ fr      │ pdf    │ ✓Pub. │
│  Spesenbericht    │ expense    │ v1 (v2*)  │ de      │ pdf    │ ✎Draft│
│  Jahresbericht    │ report     │ v1        │ de      │ docx   │ ✓Pub. │
│  Mahnung Stufe 1  │ dunning    │ –         │ de      │ pdf    │ ⊗Arch.│
└───────────────────────────────────────────────────────────────────────┘
```

Funktionen: Sortierung, Volltextsuche, Filter nach Kategorie/Sprache/Status/Format. Kontext-Aktionen: Duplizieren, Archivieren, Löschen (nur wenn nie veröffentlicht).

### 5.3 Template-Editor

#### 5.3.1 Layout

Zwei-Spalten-Layout: links Code-Editor, rechts Live-Vorschau.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Rechnung Standard │ v3 (Draft)          [Speichern] [Veröffentlichen]│
├────────────────────────────────────────────────────────────────────── ┤
│  Metadaten │ HTML │ CSS │ Partials │ Assets │ Schema │ Beispieldaten  │
├─────────────────────────────────────┬────────────────────────────────┤
│  <!DOCTYPE html>                    │                                │
│  <html>                             │   ┌────────────────────────┐   │
│    <head>                           │   │                        │   │
│      <style>                        │   │   Vorschau             │   │
│        @font-face { ... }           │   │   (PDF/DOCX/HTML)      │   │
│      </style>                       │   │                        │   │
│    </head>                          │   │  [ngx-extended-pdf-    │   │
│    <body>                           │   │   viewer mit Sample    │   │
│      <h1>{{invoice.title}}</h1>     │   │   Data gerendert]      │   │
│      {{#each items}}                │   │                        │   │
│        <p>{{description}}</p>       │   └────────────────────────┘   │
│      {{/each}}                      │   [⟳ Vorschau aktualisieren]   │
│    </body>                          │   [⤓ Dokument herunterladen]   │
│  </html>                            │                                │
├─────────────────────────────────────┴────────────────────────────────┤
```

#### 5.3.2 Tabs

| Tab | Inhalt |
| :---- | :---- |
| **Metadaten** | Name, Beschreibung, Kategorie, Sprache, Default-Outputformat, Default-PDF-Optionen |
| **HTML** | Monaco-Editor mit HTML/Handlebars-Highlighting, Auto-Completion für Helper und Payload-Keys |
| **CSS** | CSS-Stylesheet mit `@font-face`-Support |
| **Partials** | Wiederverwendbare Snippets, Aufruf via `{{> partialName}}` |
| **Assets** | Bilder und Fonts aus Cloud Storage hochladen/verknüpfen |
| **Schema** | JSON-Schema-Editor für Payload-Validierung |
| **Beispieldaten** | JSON-Editor mit Sample-Payload für die Vorschau |

#### 5.3.3 Live-Vorschau

- Wird bei jedem Speichern und manuell via Button generiert.
- Nutzt `generateDocument` im **Preview-Modus** (`storageMode: 'ephemeral'`, kein Audit-Eintrag).
- Anzeige: `ngx-extended-pdf-viewer` für PDF (Zoom, Seitennavigation, Download); für DOCX und HTML werden die Dateien direkt zum Download angeboten.
- Render-Fehler (Handlebars-Syntaxfehler, ungültiges HTML) erscheinen in einem Fehler-Panel unter der Vorschau.

#### 5.3.4 Veröffentlichungs-Workflow

1. Benutzer bearbeitet eine Draft-Version.
2. "Speichern" persistiert den Draft.
3. "Veröffentlichen" öffnet Dialog: Pflichtfeld Changelog, Hinweis bei Breaking-Schema-Änderungen.
4. Nach Veröffentlichung: Draft wird neue `currentVersion`; alte Versionen bleiben unveränderlich.

#### 5.3.5 Versions-Historie

Seitenleiste: Versionsnummer, Status, Datum, Benutzer, Changelog. Aktionen: Vorschau, **semantischer HTML-Diff** gegen aktuelle Version (zeilenweiser Diff auf HTML-Ebene via `diff2html` oder ähnliches), Wiederherstellen als neue Draft.

---

## 6. Frontend: Dokument-Button-Widget

### 6.1 Komponente `<doc-button>`

```typescript
@Component({
  selector: 'doc-button',
  standalone: true,
})
export class DocButtonComponent {
  @Input({ required: true }) templateId!: string;
  @Input({ required: true }) payload!: Record<string, any>;
  @Input() templateVersion?: number;
  @Input() outputFormat: 'pdf' | 'docx' | 'html' = 'pdf';
  @Input() label: string = 'Dokument erstellen';
  @Input() icon: string = 'document';
  @Input() variant: 'primary' | 'secondary' | 'icon-only' = 'primary';
  @Input() filename?: string;
  @Input() options?: DocOptions;
  @Input() autoDownload: boolean = false;
  @Input() autoOpenPreview: boolean = true;  // öffnet Modal mit Vorschau
  @Input() metadata?: { entityType?: string; entityId?: string };

  @Output() generated = new EventEmitter<GenerateDocumentResponse>();
  @Output() error = new EventEmitter<Error>();
}
```

### 6.2 Verhalten beim Klick

1. Button deaktivieren + Spinner anzeigen.
2. `generateDocument` Callable aufrufen.
3. Bei Cold-Start-Erkennung (> 2 s): Toast "Dokument wird erstellt…".
4. **Bei Erfolg:**
   - Wenn `autoDownload = true`: Datei via Signed URL herunterladen.
   - Wenn `autoOpenPreview = true` (default) und Format = `pdf`: Modal mit PDF-Viewer öffnen.
   - Sonst: `generated`-Event emittieren.
5. **Bei Fehler:** Toast mit lokalisierter Fehlermeldung; `error`-Event emittieren; Button reaktivieren.

### 6.3 PDF-Vorschau-Modal

```
┌────────────────────────────────────────────────────────────────┐
│  Rechnung R-2026-0042                          [⤓ Download]  ✕ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│         ┌──────────────────────────────────────┐              │
│         │                                      │              │
│         │   [PDF-Inhalt, ngx-extended-          │              │
│         │    pdf-viewer mit Pagination,         │              │
│         │    Zoom, Suche]                       │              │
│         │                                      │              │
│         └──────────────────────────────────────┘              │
│                                                                │
│  ◀ Seite 1 von 2 ▶          Zoom: [──────────] 100%           │
│                                                                │
│                            [Schliessen]  [⤓ Download]         │
└────────────────────────────────────────────────────────────────┘
```

Für DOCX und HTML wird statt des Viewers nur der Download angeboten.

### 6.4 Service `DocGenerationService`

```typescript
@Injectable({ providedIn: 'root' })
export class DocGenerationService {
  constructor(private functions: Functions) {}

  async generate(req: GenerateDocumentRequest): Promise<GenerateDocumentResponse> {
    const callable = httpsCallable<GenerateDocumentRequest, GenerateDocumentResponse>(
      this.functions, 'generateDocument'
    );
    const result = await callable(req);
    return result.data;
  }

  async preview(templateId: string, payload: object, version?: number) {
    return this.generate({
      templateId,
      templateVersion: version,
      payload,
      options: { storageMode: 'ephemeral' }
    });
  }

  async printHtml(html: string, filename?: string): Promise<GenerateDocumentResponse> {
    return this.generate({
      html,
      options: { storageMode: 'ephemeral', filename, metadata: { entityType: 'cmsPage' } }
    });
  }
}
```

---

## 7. Nichtfunktionale Anforderungen

### 7.1 Performance

| Szenario | Ziel-Zeit (95. Perzentil) |
| :---- | :---- |
| Einfaches PDF (1 Seite, kein Asset) — Warm | < 2 Sekunden |
| Komplexes PDF (10 Seiten, mehrere Assets) — Warm | < 6 Sekunden |
| DOCX-Konvertierung — Warm | < 4 Sekunden |
| Cold Start (erste Anfrage nach Idle) | < 8 Sekunden |
| Template-Editor: Draft speichern | < 500 ms |
| Live-Vorschau aktualisieren | < 4 Sekunden |
| CMS-Seiten-Druck (Raw-HTML-Modus) | < 5 Sekunden |

### 7.2 Skalierung

- Mindestens 100 Generierungen pro Minute pro Mandant.
- Quote pro Mandant konfigurierbar (Default: 1000 Dokumente/Tag).
- Rate-Limit: reguläre Benutzer 1/5 min; `contentAdmin`/`admin` 1/min.

### 7.3 Datenschutz und Compliance

- Datenresidenz: Cloud Functions, Firestore, Storage in `europe-west6` (Zürich).
- Verschlüsselung at-rest (Cloud Storage default), TLS 1.3 in Transit.
- Generierte Dokumente: 10 Jahre für Buchungsbelege; 30 Tage für Preview-Dokumente (`ephemeral`).
- Audit-Trail (`docGenerations`) unveränderlich, 10 Jahre.

### 7.4 Internationalisierung

- Template-Editor-UI: DE, FR, IT, EN.
- Pro Sprache ein eigenes Template (Feld `language`); bei der Generierung wählt der Aufrufer das passende Template.

### 7.5 Barrierefreiheit

- `<doc-button>` und Modal: Tastatur-bedienbar, ARIA-Labels.
- Strukturierte PDFs (Tagged PDF) angestrebt, nicht für alle Templates verpflichtend.

---

## 8. Schnittstellen zu anderen Modulen

### 8.1 Buchhaltung

- Aus einer Buchung: `templateId = 'booking-voucher'`, `payload = buchungsdaten`, `metadata = { entityType: 'booking', entityId: ... }`.
- `storagePath` wird in `Beleg.path` referenziert.

### 8.2 Expense-Feature

- Spesenbericht: `templateId = 'expense-report'`.

### 8.3 QR-Bill-Rechnungen

- Template `templateId = 'invoice-qrbill'`; QR-Code wird serverseitig als Data-URL in den Payload injiziert.

### 8.4 E-Mail-Versand

Die `generateDocument`-Function bleibt auf Dokumentgenerierung fokussiert. Der E-Mail-Versand erfolgt **clientseitig** in zwei Schritten:

1. `DocGenerationService.generate(...)` aufrufen → `storagePath` und `url` erhalten.
2. Den bestehenden Mailgun-Cloud-Function-Transport aufrufen und `storagePath` (oder die Signed URL) als Anhang mitgeben.

Keine Kopplung zwischen Dokumentgenerierung und E-Mail-Versand in der Cloud Function.

---

## 9. CMS-Seiten-Druck

### 9.1 Anforderung

CMS-Seiten sollen als PDF druckbar sein, ohne für jede Seitenstruktur ein eigenes Template zu pflegen.

### 9.2 Empfohlener Ansatz: Raw-HTML-Modus

Der `generateDocument`-Endpunkt akzeptiert im `html`-Feld direkt übergebenes HTML (Modus B, Abschnitt 3.2). Die Angular-Komponente übergibt den gerenderten DOM-Inhalt der Seite.

**Implementierung im CMS:**

```typescript
// In der CMS-Page-Komponente oder einem Print-Service:
async printCurrentPage(pageTitle: string): Promise<void> {
  // 1. Druckoptimiertes HTML der aktuellen Seite erstellen
  //    Optionen: innerHTML des Page-Containers, oder dedizierter Print-Slot
  const container = document.querySelector('bk-page-content');
  const html = buildPrintHtml(pageTitle, container?.innerHTML ?? '');

  // 2. An Cloud Function übergeben
  const result = await this.docGenService.printHtml(html, `${pageTitle}.pdf`);

  // 3. Vorschau-Modal öffnen oder direkt herunterladen
}

function buildPrintHtml(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    /* Basis-Druckstile; Shadow-DOM-Styles sind hier nicht verfügbar */
    body { font-family: Arial, sans-serif; margin: 2cm; }
    img { max-width: 100%; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>${bodyContent}</body>
</html>`;
}
```

### 9.3 Einschränkungen und Hinweise

- **Shadow DOM:** Ionic-Komponenten-Styles aus dem Shadow DOM sind im exportierten HTML nicht enthalten. Der `buildPrintHtml`-Helper muss explizite Druckstile definieren oder Inline-Styles verwenden.
- **Interaktive Elemente:** Buttons, Formulare, Akkordeons sollten vor der Übergabe in ihren aufgeklappten Zustand gesetzt oder als statisches HTML gerendert werden.
- **Assets:** Alle `src`-Attribute in Bildern müssen absolute URLs sein (Firebase Storage Signed URLs), da die Cloud Function keinen Zugang zum lokalen Angular-Dev-Server hat.
- **Sicherheit:** Das HTML wird in der Cloud Function sanitiert (externe `<script>`-Tags entfernt). Kein Template-ID erforderlich; es wird kein Template in Firestore geprüft.

### 9.4 Alternative: URL-basiertes Rendering

Als Alternative kann Puppeteer direkt zu einer öffentlichen/authentifizierten Seiten-URL navigieren (`page.goto(url)`), sofern die Seite ohne clientseitige Auth zugänglich ist. Für auth-geschützte Seiten ist der Raw-HTML-Modus vorzuziehen.

---

## 10. Akzeptanzkriterien

1. Ein `contentAdmin` kann ein Template erstellen, HTML/CSS/Beispieldaten bearbeiten, eine Vorschau als PDF generieren und das Template veröffentlichen.
2. Veröffentlichte Templates erhalten eine fortlaufende Versionsnummer; alte Versionen bleiben abrufbar.
3. Versions-Vergleich zeigt einen semantischen HTML-Diff.
4. Eine Angular-Komponente kann mit `<doc-button [templateId]="..." [payload]="...">` ein Dokument generieren; nach Erfolg öffnet sich automatisch das Vorschau-Modal.
5. Das Dokument wird in Cloud Storage abgelegt; eine Signed URL wird zurückgegeben.
6. Ausgabeformate PDF, DOCX und HTML funktionieren.
7. Custom Fonts via `@font-face` in der CSS-Tab werden korrekt in PDF-Vorschau gerendert.
8. CMS-Seiten können via Raw-HTML-Modus als PDF gedruckt werden.
9. Rate-Limiting greift (regulärer User: 1/5 min; Admin: 1/min); `resource-exhausted` wird korrekt zurückgegeben.
10. Nicht authentifizierte oder nicht berechtigte Aufrufe werden mit den korrekten Fehlercodes zurückgewiesen.
11. E-Mail-Versand funktioniert clientseitig: Dokument generieren, Signed URL an Mailgun-Transport übergeben.
12. Audit-Trail-Eintrag in `docGenerations` wird bei jeder Generierung erstellt; Preview (`ephemeral`) erzeugt keinen Eintrag.

---

## 11. Folgeprojekte

### 11.1 Elektronische Signatur (DeepSign)

Nach Fertigstellung des Kernsystems: Integration mit **DeepSign** für rechtsgültige elektronische Signaturen auf generierten PDFs. Geplanter Ablauf:

1. `generateDocument` → PDF in Storage
2. Separater `signDocument`-Endpunkt übergibt das PDF an DeepSign-API (Cloud Function mit gesichertem API-Key)
3. DeepSign-Webhook aktualisiert den `docGenerations`-Eintrag mit Signatur-Status und finalem Storage-Pfad

---

## 12. Offene Punkte (Stand 25.05.2026)

*(Alle ursprünglichen offenen Punkte sind entschieden — keine offenen Punkte mehr.)*
