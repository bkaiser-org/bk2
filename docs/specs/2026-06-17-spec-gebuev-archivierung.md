# Spezifikation: GeBüV-Archivierung – Dokumente und Jahresabschluss-Paket

**Version:** 0.2 (Entwurf)
**Kontext:** Firebase / Firestore / Cloud Functions / Google Cloud Storage
**Zweck:** Revisionssichere, GeBüV-konforme Archivierung im WORM-GCS-Archiv (10 Jahre, unveränderbar). Die Spezifikation deckt **zwei komplementäre Mechanismen** ab:

- **Teil A – Tag-basierte Dokumentarchivierung:** Einzeldokumente mit Tag `archive` in der Firestore-Collection `documents` werden laufend automatisch ins Archiv kopiert (Buchungsbelege, Verträge, geschäftsrelevante Korrespondenz).
- **Teil B – Jahresabschluss-Paket:** Pro abgeschlossenem Geschäftsjahr wird ein vollständiges, in sich auswertbares Archiv-Paket erzeugt: signierte Jahresrechnung, Geschäfts-/Revisionsbericht, Haupt- und Nebenbücher, vollständiges Journal sowie ein **strukturierter Export der Buchungsdaten inkl. lückenloser Prüfspur** (Buchung ↔ Beleg).

**Rechtlicher Hintergrund (Begründung Teil B):** GeBüV/OR verlangen mehr als den Jahresabschluss. Aufbewahrungspflichtig sind Geschäftsbücher (Hauptbuch + Nebenbücher), sämtliche Buchungsbelege sowie Geschäfts- und Revisionsbericht (Art. 958f OR). Ein Buchungsbeleg ist jede Aufzeichnung, die nötig ist, um den einer Buchung zugrunde liegenden Geschäftsvorfall nachzuvollziehen und zu **rekonstruieren** (Art. 957a Abs. 3 OR). Daraus folgt: Die strukturierten Buchungs-Records sind selbst Teil der Geschäftsbücher und müssen revisionssicher und über 10 Jahre **applikationsunabhängig lesbar** archiviert werden – die lückenlose Prüfspur von der Jahresrechnung zur einzelnen Buchung und zum Beleg muss erhalten bleiben.

---

# TEIL A – Tag-basierte Dokumentarchivierung

## 1. Geltende Entscheidungen (Vorgaben)

| Thema | Entscheidung |
|---|---|
| Fristbeginn Retention | Pro Objekt, **ab Upload** (= `uploadedAt`/`createdAt` des Quelldokuments) |
| Echtheitsnachweis | **SHA-256-Hash** in Firestore, keine qualifizierte Signatur |
| Mandantentrennung | **Gemeinsamer Bucket** mit Pfad-Präfix pro Tenant |
| DSG-Löschpflicht | Konfliktfall dokumentiert; **Archiv wird nie gelöscht** (gesetzliche Aufbewahrung geht vor) |
| Altdaten | Keine; ausschliesslich **expliziter Upload** ab Einführung |
| Revisor | Verfahrensdokumentation wird erstellt, **keine vorgängige Abstimmung** |

---

## 2. Architektur-Überblick

```
┌────────────────────┐     onWrite Trigger     ┌──────────────────────┐
│  Firestore          │ ──────────────────────▶ │  Cloud Function       │
│  collection         │                          │  archiveDocument      │
│  `documents`        │ ◀──────────────────────  │  (writeback status)   │
└────────────────────┘     archive.status        └──────────┬───────────┘
                                                             │ copy + retention
                                                             ▼
                          ┌───────────────────────────────────────────────┐
                          │  GCS Archiv-Bucket (Object Retention aktiv)     │
                          │  gs://gebuev-archive/{tenantId}/{YYYY}/...       │
                          │  je Objekt: retainUntil = uploadedAt + 10J,      │
                          │  mode = LOCKED                                   │
                          └───────────────────────────────────────────────┘
```

Quelle der Datei ist der bestehende Storage-Pfad des Dokuments (Arbeitskopie, weiterhin editier-/löschbar). Die Archivkopie ist die unveränderbare GeBüV-Kopie.

---

## 3. Datenmodell

### 3.1 Bestehendes `Document`-Model (relevante Felder)

```typescript
interface Document {
  id: string;
  tenantIds: string[];        // Mandantenzuordnung
  filename: string;
  url: string;                // Download-/Storage-Referenz der Arbeitskopie
  mimeType: string;
  hash: string;               // SHA-256 (hex), beim Upload berechnet
  tags: DocumentTag[];        // enthält ggf. 'archive'
  createdAt: Timestamp;
  uploadedAt?: Timestamp;     // massgeblich für Fristbeginn
  // ...
}
```

### 3.2 Erweiterung: Archiv-Status (writeback durch Function)

```typescript
interface DocumentArchive {
  status: 'pending' | 'archived' | 'failed';
  archivedAt?: Timestamp;
  archivePath?: string;        // gs://gebuev-archive/{tenantId}/{YYYY}/{id}_{hash8}.{ext}
  archiveGeneration?: string;  // GCS object generation (eindeutige Version)
  retainUntil?: Timestamp;     // uploadedAt + 10 Jahre
  hashVerified?: boolean;      // SHA-256 Quelle == archivierte Kopie
  error?: string;              // bei status 'failed'
  attempts?: number;
}

// ergänzt im Document:
interface Document {
  // ...
  archive?: DocumentArchive;
}
```

> Das `archive`-Feld ist die **Idempotenz- und Audit-Spur** auf Applikationsebene. Der eigentliche, manipulationssichere Audit-Trail liegt zusätzlich in den Cloud Audit Logs (Data Access Logs).

---

## 4. Trigger-Bedingungen

**Trigger:** `onDocumentWritten('documents/{docId}')` (Cloud Functions v2, Firestore).

`onWrite` (nicht nur `onCreate`), da der Tag `archive` auch **nachträglich** per Update gesetzt werden kann.

Die Function verarbeitet das Dokument **genau dann**, wenn alle folgenden Bedingungen erfüllt sind:

1. Im After-State enthält `tags` den Wert `archive`.
2. `archive.status` ist **nicht** `archived` (noch nicht erfolgreich archiviert).
3. Das Dokument hat eine gültige Quell-Referenz (Storage-Pfad), `hash`, `mimeType`, mindestens eine `tenantIds`-Zuordnung und `uploadedAt`.

Andernfalls: **No-op** (sauberer Early Return, kein Fehler).

Optional früh entschärfen: Wenn `archive.status === 'pending'` und `attempts` ein Limit erreicht, nicht endlos neu starten (siehe §6).

---

## 5. Ablauf der Cloud Function

```
1. Trigger-Filter prüfen (§4). Falls nicht erfüllt → return.
2. Idempotenz-Lock setzen:
   Firestore-Transaktion: lese archive.status.
   - bereits 'archived'      → return (No-op)
   - bereits 'pending'       → return (Doppellauf vermeiden) *
   - sonst                   → setze archive.status = 'pending', attempts++ 
3. Quellobjekt-Metadaten lesen (Storage): existence, size, gespeicherter hash.
4. Ziel-Pfad bestimmen (deterministisch, §7.2).
5. Existiert Zielobjekt bereits (aus früherem Teil-Lauf)?
   - ja  → Schritt 6 überspringen, mit Verifikation fortfahren
   - nein → kopieren (Server-side copy innerhalb GCS, kein Download nötig)
6. Objekt-Retention auf Zielobjekt setzen:
   retainUntil = uploadedAt + 10 Jahre, mode = LOCKED.
7. Hash-Verifikation (§8): SHA-256 der Archivkopie == Document.hash?
8. Firestore writeback:
   archive = { status:'archived', archivedAt, archivePath, archiveGeneration,
               retainUntil, hashVerified:true }
9. Bei jedem Fehler: archive.status='failed', archive.error=<msg>; werfen → Retry.
```

\* Hängengebliebene `pending`-Zustände werden durch ein Timeout-/Reconcile-Verfahren bereinigt (§6).

### 5.1 Function-Skelett (TypeScript, illustrativ)

```typescript
export const archiveDocument = onDocumentWritten('documents/{docId}', async (event) => {
  const after = event.data?.after.data() as Document | undefined;
  if (!after) return;                                   // gelöscht → ignorieren

  if (!after.tags?.includes('archive')) return;          // kein Archiv-Tag
  if (after.archive?.status === 'archived') return;      // bereits archiviert
  if (!after.hash || !after.uploadedAt || !after.tenantIds?.length) {
    return; // unvollständig – optional als 'failed' markieren
  }

  const docRef = event.data!.after.ref;

  // Idempotenz-Lock
  const proceed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const a = snap.data()?.archive;
    if (a?.status === 'archived' || a?.status === 'pending') return false;
    tx.update(docRef, {
      'archive.status': 'pending',
      'archive.attempts': FieldValue.increment(1),
    });
    return true;
  });
  if (!proceed) return;

  try {
    const dest = buildArchivePath(after);               // §7.2
    await copyToArchive(after, dest);                    // server-side copy
    const retainUntil = addYears(after.uploadedAt.toDate(), 10);
    await setObjectRetention(dest, retainUntil, 'LOCKED');
    const ok = await verifySha256(dest, after.hash);     // §8
    await docRef.update({
      archive: {
        status: 'archived',
        archivedAt: FieldValue.serverTimestamp(),
        archivePath: `gs://${ARCHIVE_BUCKET}/${dest}`,
        retainUntil: Timestamp.fromDate(retainUntil),
        hashVerified: ok,
      },
    });
  } catch (err) {
    await docRef.update({
      'archive.status': 'failed',
      'archive.error': String(err),
    });
    throw err;                                            // → automatischer Retry
  }
});
```

---

## 6. Idempotenz & Fehlerbehandlung

- **At-least-once:** Firestore-Trigger feuern garantiert mind. einmal, u. U. mehrfach. Schutz über (a) Status-Lock in Transaktion und (b) **deterministischen Ziel-Pfad** inkl. Hash – ein zweiter Lauf erkennt das existierende, retention-gesperrte Objekt und überschreibt es nicht.
- **WORM-Sicherheit:** Da das Zielobjekt nach Schritt 6 `LOCKED` ist, ist ein versehentliches Überschreiben technisch unmöglich – die Function darf bei erneutem Lauf das Objekt nicht re-kopieren (Existenzprüfung in Schritt 5).
- **Retry-Strategie:** Function wirft bei Fehler → Cloud Functions retried (mit Backoff). `attempts`-Zähler begrenzt Endlosschleifen.
- **Reconcile-Job (geplant):** Scheduled Function, die `archive.status == 'pending'` mit `archivedAt`-Alter über Schwelle X oder `failed`-Status findet und meldet/erneut anstösst.
- **Alerting:** Bei `failed` Cloud-Logging-Eintrag + Alert (z. B. via Error Reporting / Pub/Sub Benachrichtigung).

---

## 7. GCS-Archiv-Konfiguration

### 7.1 Bucket

Da Retention **pro Objekt ab Upload** gilt (nicht bucketweit fix), muss der Bucket mit **Object Retention** erstellt werden:

```bash
# Bucket mit Object-Retention-Fähigkeit erstellen
gcloud storage buckets create gs://gebuev-archive \
  --location=europe-west6 \           # Zürich, Datenresidenz CH
  --uniform-bucket-level-access \
  --enable-per-object-retention

# Versioning zusätzlich aktivieren
gcloud storage buckets update gs://gebuev-archive --versioning
```

Pro kopiertem Objekt setzt die Function anschliessend die Retention:

```
retention.mode          = LOCKED          # unwiderruflich
retention.retainUntil   = uploadedAt + 10 Jahre
```

> `LOCKED` bedeutet: weder Verkürzung noch Löschung vor Ablauf möglich – auch nicht durch Owner. Das ist die technische Erfüllung von GeBüV Art. 3.

### 7.2 Pfad-Schema (gemeinsamer Bucket, Präfix pro Tenant)

```
{tenantId}/{YYYY}/{documentId}_{hash[0:8]}.{ext}
```

Beispiel:
```
gs://gebuev-archive/tenant_abc/2026/doc_8f3a21_a1b2c3d4.pdf
```

- `{YYYY}` aus `uploadedAt`.
- `{hash[0:8]}` macht den Pfad deterministisch und kollisionssicher.
- Bei Mehrfach-Mandanten (`tenantIds.length > 1`): siehe Offene Frage 3.

---

## 8. Hash-Verifikation

- `Document.hash` (SHA-256, beim Upload berechnet) ist die Referenz.
- Nach dem Kopieren liest die Function die Archivkopie und berechnet SHA-256, Vergleich gegen `Document.hash`.
- Bei Abweichung → `archive.hashVerified = false`, `status = 'failed'`, Alert (möglicher Manipulations- oder Übertragungsfehler).
- Bei kleinen PDF-Belegen ist die Berechnung vernachlässigbar; für grosse Dateien streaming-basiert lesen, um Speicherlimit der Function zu schonen.

---

## 9. DSG-Löschkonflikt (Dokumentation)

- Buchungsbelege unterliegen der gesetzlichen 10-Jahres-Aufbewahrung (OR 958f) und sind damit dem DSG-Löschanspruch grundsätzlich **entzogen**, solange die Frist läuft.
- Konsequenz im System: Ein DSG-Löschbegehren entfernt ggf. die **Arbeitskopie** und personenbezogene Indexdaten, **nicht aber die Archivkopie**. Die Archivkopie bleibt bis `retainUntil` gesperrt.
- Dieser Konflikt und die getroffene Abwägung sind Teil der Verfahrensdokumentation (§10).

---

## 10. Sicherheit, IAM & Verfahrensdokumentation

- **IAM Least-Privilege:** Die Function-Service-Account erhält ausschliesslich `roles/storage.objectCreator` + Recht zum Setzen von Object Retention auf dem Archiv-Bucket; **kein** Lösch- oder Admin-Recht.
- **Audit-Trail:** Data Access Logs (READ/WRITE) für den Archiv-Bucket aktiviert; Export in separaten, ebenfalls retention-gesicherten Log-Bucket.
- **Verschlüsselung:** Google-managed Keys; optional CMEK (offene Frage).
- **Verfahrensdokumentation (GeBüV Art. 4):** zu erstellen, mit: Trigger-Logik, Retention-Konfiguration, Pfad-Schema, Hash-Verifikation, IAM-Konzept, Fehler-/Reconcile-Verfahren, DSG-Konflikt-Abwägung, Restore-Verfahren.

---

## 11. Offene Fragen

1. **Quell-Referenz:** Enthält `Document.url` einen direkt nutzbaren GCS-Pfad (`gs://...` oder Bucket+Objekt), oder eine tokenisierte Download-URL? Für server-side copy braucht die Function Bucket + Objektname; ggf. zusätzliches Feld `storagePath` einführen.
2. **Tag-Entfernung:** Was passiert, wenn der Tag `archive` nach erfolgter Archivierung wieder entfernt wird? Vorschlag: Archivkopie bleibt unberührt (WORM); nur `archive`-Status-Feld bleibt bestehen. Bestätigen?
3. **Mehrfach-Mandanten:** Wenn `tenantIds.length > 1` – eine Archivkopie pro Tenant-Präfix (Mehrfachablage) oder eine Kopie unter einem „primären" Tenant? Mehrfachablage ist sauberer für getrennte Mandanten-Exports, kostet aber Speicher.
4. **Fristbeginn-Feld:** `uploadedAt` ist optional im Model. Falls fehlend – Fallback auf `createdAt`, oder Dokument als `failed` markieren? Empfehlung: Fallback auf `createdAt` mit Logeintrag.
5. **Standort/Datenresidenz:** `europe-west6` (Zürich) angenommen. Bestätigen, ob CH-Residenz gefordert ist.
6. **Grosse Dateien / Timeout:** Maximale erwartete Dateigrösse? Bestimmt Function-Memory/Timeout und ob Hash-Verifikation streaming-basiert sein muss.
7. **Aufbewahrung der Arbeitskopie:** Soll die Arbeitskopie nach Archivierung irgendwann automatisch bereinigt werden (Lifecycle-Rule), oder bleibt sie dauerhaft erhalten?

---

# TEIL B – Jahresabschluss-Paket pro Geschäftsjahr

## B1. Zweck und Abgrenzung

Teil A archiviert *einzelne* Dokumente laufend. Teil B erzeugt **einmal pro abgeschlossenem Geschäftsjahr** ein vollständiges, in sich auswertbares Paket, das die Geschäftsbücher und die Prüfspur als Ganzes konserviert. Damit ist die GeBüV-Anforderung erfüllt, dass sich jeder gebuchte Geschäftsvorfall auch nach Jahren – und unabhängig von der Live-Applikation – rekonstruieren lässt.

Teil A und Teil B ergänzen sich: Die einzelnen Buchungsbelege liegen (via Teil A) bereits unveränderbar im Archiv; das Jahrespaket referenziert sie über ein Manifest und stellt die strukturierte Buchungsebene daneben.

## B2. Paket-Inhalt

Ein Jahrespaket für Geschäftsjahr `{YYYY}` und Mandant `{tenantId}` enthält:

| Komponente | Format | GeBüV-Bezug |
|---|---|---|
| Jahresrechnung: Bilanz, Erfolgsrechnung, Anhang | **PDF/A**, signiert | Geschäftsbericht (Art. 958f); schriftlich + unterzeichnet |
| Geschäftsbericht / ggf. Lagebericht | **PDF/A**, signiert | schriftlich + unterzeichnet |
| Revisionsbericht (falls Revisionspflicht) | **PDF/A**, signiert | schriftlich + unterzeichnet |
| Hauptbuch – alle Konten mit Bewegungen und Salden | PDF/A **und** strukturiert | Geschäftsbücher |
| Journal – alle Buchungen chronologisch | PDF/A **und** strukturiert | Geschäftsbücher |
| Nebenbücher: Debitoren, Kreditoren, Lohn, Anlagen, ggf. Lager | PDF/A **und** strukturiert | Geschäftsbücher |
| **Strukturierter Buchungsdaten-Export** (Journal, Konten, Belegverknüpfung) | offenes, dokumentiertes Format (JSON/CSV/XML) | Rekonstruierbarkeit (Art. 957a Abs. 3) |
| **Beleg-Manifest** – Mapping Buchung → archivierter Beleg (`archivePath`, Hash) | JSON/CSV | lückenlose Prüfspur |
| **README / Datenschema-Doku** – Felddefinitionen, damit der Export ohne App lesbar ist | Markdown/PDF/A | Lesbarkeit über 10 Jahre (Art. 5 GeBüV) |
| **Manifest mit SHA-256 je Paket-Datei** + Gesamtsignatur | JSON | Echtheit/Vollständigkeit |

> **Doppelte Ablage (PDF/A + strukturiert):** Die PDF/A-Sicht garantiert menschliche Lesbarkeit ohne Spezialsoftware; der strukturierte Export garantiert maschinelle Auswert- und Rekonstruierbarkeit. Beide zusammen erfüllen die GeBüV-Lesbarkeitsanforderung robust.

## B3. Trigger und Ablauf

**Trigger:** Kein Firestore-onWrite, sondern ein **expliziter, kontrollierter Abschluss-Vorgang** – empfohlen als **Callable / HTTPS Cloud Function** `buildFiscalYearArchive(tenantId, fiscalYear)`, ausgelöst, wenn das Geschäftsjahr fachlich abgeschlossen und in Firestore als `closed`/`locked` markiert ist.

Begründung: Das Paket darf erst erzeugt werden, wenn keine Buchungen mehr dazukommen. Ein versehentlich zu früh erzeugtes, dann WORM-gesperrtes Paket wäre unkorrigierbar.

```
1. Vorbedingung prüfen: Geschäftsjahr-Status == 'locked'. Sonst Abbruch.
2. Idempotenz: existiert bereits ein 'sealed' Paket für {tenantId}/{YYYY}? → Abbruch.
3. Daten sammeln: alle Buchungen, Konten, Nebenbücher, Salden des Jahres.
4. Vollständigkeitsprüfung (B5): Soll-Salden == Summe Buchungen; jede Buchung
   hat Belegverknüpfung; jeder verknüpfte Beleg ist in Teil A archiviert.
5. Rendern: PDF/A der Berichte und Bücher erzeugen.
6. Export: strukturierte Daten + Beleg-Manifest + README schreiben.
7. Hashes: SHA-256 je Datei berechnen, Manifest erstellen, Gesamt-Hash bilden.
8. In Archiv-Bucket kopieren unter {tenantId}/abschluss/{YYYY}/...
9. Object-Retention setzen: retainUntil = Geschäftsjahresende + 10 Jahre, LOCKED.
10. Firestore writeback: fiscalYearArchive.status = 'sealed' (Pfad, Hashes, retainUntil).
11. Bei Fehler: status = 'failed', nichts WORM-sperren, Alert.
```

> **Fristbeginn Teil B:** Anders als bei Teil A (ab Upload) startet die 10-Jahres-Frist hier korrekt **ab Ablauf des Geschäftsjahres** (Art. 958f Abs. 1 OR) – `retainUntil = 31.12.{YYYY} + 10 Jahre` (bzw. Geschäftsjahresende). Zu dokumentieren.

## B4. Pfad-Schema

```
{tenantId}/abschluss/{YYYY}/
    jahresrechnung.pdf
    geschaeftsbericht.pdf
    revisionsbericht.pdf
    hauptbuch.pdf
    journal.pdf
    nebenbuch_debitoren.pdf   (etc.)
    export/journal.json
    export/konten.json
    export/beleg-manifest.json
    export/README.md
    MANIFEST.json             (SHA-256 je Datei + Gesamt-Hash)
```

## B5. Vollständigkeit & Prüfspur (kritischer Schritt)

Vor dem Versiegeln muss die Function die **lückenlose Prüfspur** verifizieren – das ist der eigentliche GeBüV-Mehrwert gegenüber „nur Jahresabschluss":

- **Bilanzsumme/ER stimmen mit Summe der Buchungen überein** (Abschlussprobe).
- **Jede Buchung referenziert einen Beleg** (oder ist als belegloser interner Vorgang dokumentiert begründet).
- **Jeder referenzierte Beleg ist in Teil A archiviert** (`archive.status == 'archived'`); fehlende Belege werden vor dem Abschluss gemeldet, nicht stillschweigend übergangen.
- **Rückverfolgbarkeit beidseitig:** Jahresrechnung → Konto → Buchung → Beleg und zurück.

Schlägt eine dieser Prüfungen fehl → Paket wird **nicht** versiegelt, Liste der Lücken wird zurückgegeben.

## B6. Datenmodell-Erweiterung

```typescript
interface FiscalYearArchive {
  tenantId: string;
  fiscalYear: number;
  status: 'pending' | 'sealed' | 'failed';
  sealedAt?: Timestamp;
  archivePath?: string;        // gs://gebuev-archive/{tenantId}/abschluss/{YYYY}/
  packageHash?: string;        // Gesamt-SHA-256 über MANIFEST.json
  retainUntil?: Timestamp;     // Geschäftsjahresende + 10 Jahre
  completeness?: {
    balanceCheckPassed: boolean;
    bookingsWithoutVoucher: number;
    vouchersNotArchived: number;
  };
  error?: string;
}
```

## B7. Offene Fragen (Teil B)

1. **Export-Format:** JSON, CSV-pro-Tabelle oder XML für den strukturierten Buchungsexport? Empfehlung: JSON + begleitende Schema-Doku, da selbstbeschreibend und langzeittauglich. Gibt es Vorgaben deiner Revisionsstelle/Treuhänder?
2. **Beleg im Paket: Referenz vs. Kopie:** Reicht das Beleg-Manifest mit Verweis auf die Teil-A-Archivkopien, oder sollen die Belege zur vollständigen Selbst-Enthaltung **zusätzlich** ins Jahrespaket kopiert werden? Referenz spart Speicher, Kopie ist robuster gegen Pfadänderungen.
3. **Signatur der Berichte:** Wie werden Jahresrechnung/Revisionsbericht „unterzeichnet" abgelegt – qualifizierte elektronische Signatur (ZertES) oder gescanntes unterschriebenes PDF/A? OR verlangt Unterzeichnung für Geschäfts-/Revisionsbericht.
4. **PDF/A-Erzeugung:** Bestehender PDF-Generator (Puppeteer + Handlebars) auf PDF/A-Konformität (PDF/A-2b o. ä.) erweitern? Standard-Puppeteer erzeugt kein PDF/A out of the box.
5. **Nachträgliche Korrekturen:** Wenn nach Versiegelung ein Fehler im abgeschlossenen Jahr entdeckt wird – Korrektur ausschliesslich über Folgejahr-Buchung (kein Re-Sealing), korrekt? Verfahren dokumentieren.
6. **Auslöser-Berechtigung:** Wer darf `buildFiscalYearArchive` auslösen (Rolle/Recht), und braucht es ein Vier-Augen-Prinzip vor dem unwiderruflichen Versiegeln?
7. **Unterjährige Teilabschlüsse / MWST-Perioden:** Nur Jahrespaket, oder zusätzlich Quartals-/MWST-Abrechnungsbelege als eigene Pakete?

---

*Hinweis: Technisch-organisatorische Spezifikation, keine Rechtsberatung. Die abschliessende GeBüV-Beurteilung erfolgt durch die Revisionsstelle bzw. einen Treuhänder.*
