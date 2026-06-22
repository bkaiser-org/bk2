# Spec: Vertragsverwaltung (Contract Lifecycle Management)

> Status: Entwurf · Modul: `contracts` · Stack: Angular (standalone, signals) · Ionic v8 · Firebase (Firestore, Auth, Cloud Functions) · imgix
> Bezug: erweitert die bestehende `documents` Collection und das `Document`-Modell; nutzt `persons`/`organizations`, `memberships`/`groups`, Action-Logging und das RAG/Gemini-Setup.

## 1. Ziel & Abgrenzung

Ein leichtgewichtiges Contract Lifecycle Management (CLM) für Swiss-SMB-Kontexte. Verträge werden vom Roh-Entwurf bis zur final unterzeichneten Version verwaltet, mit Fokus auf den eigentlichen Geschäftswert eines CLM: **Fristenüberwachung** (Kündigung, Verlängerung, Auslauf) statt nur Dateiablage.

**In Scope (v1):**
- Upload und Versionierung von Vertragsdokumenten über das bestehende `Document`-Modell.
- Dediziertes `Contract`-Aggregat als logische Klammer über Dokumente, Parteien und Metadaten.
- Zustandsmaschine für den Vertragslebenszyklus.
- Fristen-, Kündigungs- und Verlängerungslogik mit Reminder-Mechanismus.
- Vertragshierarchie (Nachträge / Zusatzvereinbarungen).
- Extrahierter Abstract + Tags für Suche/RAG.
- Berechtigungs- und Audit-Anforderungen (DSG/GeBüV).

**Out of Scope (v1, kandidaten für später):**
- Vollwertiger Approval-Workflow mit mehrstufigen Freigaben (siehe Offene Punkte).
- Automatische Erzeugung wiederkehrender Buchungen aus Verträgen.
- Klausel-Bibliothek / Vertragsgenerierung aus Bausteinen.
- E-Signatur-Versand (kann später an die bestehende DeepSign-Integration andocken).

## 2. Begriffsmodell

Zwei Ebenen sind sauber zu trennen:

| Ebene | Was es ist | Beispiel |
|---|---|---|
| **Dokument** (`Document`) | Eine einzelne Datei mit eigenem Datei-Status | Entwurf v0.3, Redline der Gegenpartei, finale PDF mit Unterschrift |
| **Vertrag** (`Contract`) | Die logische Vertragseinheit, die mehrere Dokumente und alle Metadaten klammert | „Mietvertrag Bootshaus 2025–2030" |

Ein `Contract` referenziert n `Document`-Einträge. Nachträge sind eigene `Contract`-Einträge mit `parentContractId` (kein verschachtelter Mega-Datensatz).

## 3. Datenmodell

### 3.1 ContractModel

Implementiert `BkModel` und `NamedModel` (Konvention wie übrige Modelle).

```typescript
export interface ContractModel extends BkModel, NamedModel {
  // --- Identität ---
  // bkey: string            (von BkModel)
  // name: string            (von NamedModel) -> Vertragsname / Titel
  contractType: ContractType;
  contractNumber?: string;   // optionale interne/laufende Nummer

  // --- Parteien (Rollen, nicht nur Verweise) ---
  parties: ContractParty[];  // mind. 2; intern + Gegenpartei(en)
  responsiblePersonId: string; // interner "Vertragsverantwortlicher" -> Reminder-Adressat

  // --- Vertragliche Kennzahlen / Fristen ---
  signingDate?: string;      // ISO 8601 date
  startDate?: string;
  endDate?: string;          // leer = unbefristet
  noticePeriod?: NoticePeriod;     // Kündigungsfrist (strukturiert, s.u.)
  nextTerminationDate?: string;    // berechnet, denormalisiert für Queries
  autoRenewal?: AutoRenewal;       // stillschweigende Verlängerung

  // --- Finanzen (optional) ---
  contractValue?: number;
  currency?: string;         // ISO 4217, Default 'CHF'
  billingCycle?: BillingCycle; // oneTime | monthly | quarterly | yearly | ...
  // optionale Buchhaltungs-Referenz (lose Kopplung in v1)
  costCenterId?: string;
  accountId?: string;

  // --- Lieferung ---
  deliverables?: Deliverable[]; // einfache Liste in v1; Subcollection als Option

  // --- Inhalt / Suche ---
  abstract?: string;         // extrahiert (Gemini); editierbar
  abstractSource?: 'ai' | 'manual';
  tags?: string[];
  category?: string;
  confidentiality: Confidentiality; // public | internal | confidential | strictlyConfidential

  // --- Dokumente & Versionierung ---
  documentRefs: ContractDocumentRef[]; // Verweise in die documents collection
  currentVersionDocKey?: string;       // welches Dokument ist die "geltende" Fassung

  // --- Signatur ---
  signatureType?: SignatureType;       // none | simple | advanced | qualified (ZertES/eIDAS)
  signatories?: Signatory[];

  // --- Hierarchie ---
  parentContractId?: string;           // für Nachträge / Verlängerungen
  relationKind?: ContractRelationKind; // amendment | renewal | annex

  // --- Lifecycle ---
  state: ContractState;

  // --- Compliance / Aufbewahrung ---
  retentionUntil?: string;   // GeBüV: i.d.R. Vertragsende + 10 Jahre
  isArchived: boolean;

  // --- Audit (Konvention: Action-Logging) ---
  // createdAt / createdBy / modifiedAt / modifiedBy via BkModel
  isDeleted?: boolean;       // Soft-Delete (kein Hard-Delete, GeBüV)
}
```

### 3.2 Unterstützende Typen

```typescript
export type ContractType =
  | 'auftrag'        // Auftrag (OR 394 ff.)
  | 'werkvertrag'    // Werkvertrag (OR 363 ff.)
  | 'mietvertrag'    // Miete (OR 253 ff.)
  | 'darlehen'       // Darlehen (OR 312 ff.)
  | 'arbeitsvertrag' // Arbeitsvertrag (OR 319 ff.)
  | 'kaufvertrag'
  | 'nda'            // Geheimhaltung
  | 'lizenz'
  | 'dienstleistung' // Rahmen-/Dienstleistungsvertrag (SLA)
  | 'sonstige';

export type ContractState =
  | 'draft'
  | 'in_review'
  | 'in_negotiation'
  | 'approved'       // intern freigegeben, noch nicht unterschrieben
  | 'signed'
  | 'active'
  | 'expiring'       // läuft bald aus (von Cloud Function gesetzt)
  | 'terminated'     // gekündigt
  | 'expired'
  | 'archived';

export interface ContractParty {
  role: 'internal' | 'counterparty' | 'guarantor' | 'other';
  refType: 'person' | 'organization';
  refKey: string;            // -> persons / organizations
  displayName: string;       // denormalisiert für Listen
}

export interface Signatory {
  partyRefKey: string;
  personId?: string;         // konkrete unterzeichnende Person
  signedAt?: string;
}

export type SignatureType = 'none' | 'simple' | 'advanced' | 'qualified';

export interface NoticePeriod {
  duration: number;          // z.B. 3
  unit: 'days' | 'weeks' | 'months';
  // Bezugspunkt der Kündigung
  to: 'anytime' | 'monthEnd' | 'quarterEnd' | 'yearEnd' | 'contractEnd';
}

export interface AutoRenewal {
  enabled: boolean;
  interval?: { duration: number; unit: 'months' | 'years' };
  // Anzahl bereits erfolgter Verlängerungen (optional, für Reporting)
  renewalsCount?: number;
}

export type BillingCycle =
  | 'oneTime' | 'monthly' | 'quarterly' | 'semiAnnually' | 'yearly';

export type Confidentiality =
  | 'public' | 'internal' | 'confidential' | 'strictlyConfidential';

export type ContractRelationKind = 'amendment' | 'renewal' | 'annex';

export interface ContractDocumentRef {
  docKey: string;            // -> documents collection
  version: string;           // z.B. "0.3", "1.0-final"
  docState: 'draft' | 'redline' | 'final' | 'signed';
  isCurrent: boolean;
  uploadedAt: string;
  uploadedBy: string;
}

export interface Deliverable {
  title: string;
  dueDate?: string;
  state: 'open' | 'inProgress' | 'delivered' | 'accepted';
  notes?: string;
}
```

## 4. Persistenz (Firestore)

```
contracts/{contractId}                 -> ContractModel
documents/{docKey}                      -> Document (bestehend)
```

**Entscheidung Dokumentversionen:** in v1 als **flache Liste** `documentRefs[]` am Vertrag (einfache Redline-Historie, kein eigener Dokument-Status-Workflow). Eigene Subcollection `contracts/{id}/versions` nur, falls pro Version umfangreiche Eigen-Metadaten/Workflows nötig werden (siehe Offene Punkte).

**Entscheidung Deliverables:** in v1 als eingebettetes Array. Subcollection `contracts/{id}/deliverables` als Option, sobald Meilensteine eigene Zustände, Reminder oder Verknüpfungen zu Buchungen brauchen.

Denormalisierung: `nextTerminationDate`, `state`, `endDate`, `responsiblePersonId`, `displayName` der Parteien bewusst am Top-Level halten, damit Dashboard-Queries ohne Joins funktionieren.

## 5. Zustandsmaschine

```
draft ──► in_review ──► in_negotiation ──► approved ──► signed ──► active
  │                                                                  │
  │                                                          ┌───────┼───────┐
  │                                                          ▼       ▼       ▼
  └──────────────────────────────► (abbrechen)           expiring terminated │
                                                             │               │
                                                             ▼               ▼
                                                          expired ───────► archived
```

- Übergänge serverseitig validieren (analog Kiosk-State-Machine, `COUNTING_STATES`-Muster).
- `expiring`/`expired` werden **nicht** vom User, sondern von einer geplanten Cloud Function anhand `endDate`/`nextTerminationDate` gesetzt.
- `archived` ist Endzustand; setzt `isArchived = true`, `retentionUntil` bleibt bindend.

## 6. Fristen-, Kündigungs- & Reminder-Logik

Kern des Geschäftswerts. Mechanik:

1. **Berechnung `nextTerminationDate`** beim Speichern (Cloud Function `onWrite` oder Client + serverseitige Validierung) aus `endDate` + `noticePeriod` + `autoRenewal`.
   - Unbefristet + `noticePeriod`: nächster zulässiger Kündigungstermin ab heute.
   - Befristet ohne AutoRenewal: Reminder vor `endDate`.
   - Befristet mit AutoRenewal: Reminder vor letztmöglichem Kündigungstermin (sonst verlängert sich der Vertrag stillschweigend).
2. **Scheduled Function** (z.B. täglich): findet Verträge mit relevanten Daten in konfigurierbaren Vorlauffenstern (z.B. 90/30/7 Tage), erzeugt Notifications an `responsiblePersonId` und setzt ggf. `state = 'expiring'`.
3. **Eskalation** optional: keine Reaktion → zusätzliche Erinnerung / Hinweis an Gruppen-Admin.

Reminder-Fenster pro Vertrag überschreibbar (`reminderLeadDays?: number[]`), sonst Modul-Default.

## 7. Inhaltsextraktion (Abstract & Tags)

- Beim Upload eines `final`/`signed`-Dokuments: Text extrahieren → Gemini erzeugt `abstract` + Tag-Vorschläge (passt in bestehende RAG-Pipeline).
- `abstractSource` markiert KI- vs. manuelle Pflege; manuelle Edits gewinnen.
- Abstract + Tags + extrahierter Volltext fliessen in die Suche/RAG-Indexierung.
- Vertraulichkeit beachten: `strictlyConfidential`-Verträge ggf. von KI-Verarbeitung ausnehmen (Konfig).

## 8. Berechtigungen

- Sichtbarkeit über bestehende `memberships`/`groups`; Vertrag trägt zusätzlich `confidentiality`.
- Firestore Security Rules: Lesen nur für berechtigte Gruppe/Owner; `responsiblePersonId` und interne Parteien immer lesend.
- Mutation des `state` nur durch berechtigte Rollen; serverseitige Übergangsvalidierung.
- Personendaten in Verträgen → DSG: Zugriff minimieren, Audit-Trail führen.

## 9. Compliance (CH)

- **GeBüV**: kein Hard-Delete (`isDeleted` Soft-Delete); `retentionUntil` typ. = `endDate` + 10 Jahre; Archiv-Pakete können in die bestehende GeBüV-Archivierung (`FiscalYearArchive`/WORM) einfliessen.
- **Audit-Trail**: jede Statusänderung, jeder Upload, jede Kündigung über bestehendes Action-Logging (wer/was/wann).
- **ZertES/eIDAS**: `signatureType` dokumentiert die Rechtsqualität der Unterschrift; bei Anbindung an DeepSign synchron halten.
- **DSG**: Confidentiality + Berechtigungssteuerung; Löschkonzept respektiert Aufbewahrungspflicht (Sperren statt Löschen).

## 10. UI-Bausteine (Richtwert)

- **Vertragsliste / Dashboard**: auslaufende Verträge (nächste 90 Tage), nach Status/Typ gefiltert, Summen-Vertragswert.
- **Vertragsdetail**: Kopf (Name, Typ, Status, Parteien), Fristen-Panel, Dokumentversionen (Upload/Redline/Final), Abstract, Deliverables, Audit-Historie.
- **Upload-Dialog**: Datei → `Document` anlegen → als `ContractDocumentRef` verknüpfen, Versions-/Status-Wahl.
- **Reminder-Inbox**: anstehende Kündigungs-/Auslauffristen.

## 11. Offene Punkte

1. **Dokumentversionen**: flache Liste (v1) ausreichend, oder eigener Status-Workflow pro Version (eigene Subcollection)? — Annahme v1: flach.
2. **Buchhaltungs-Integration**: nur Referenz (`costCenterId`/`accountId`), oder sollen Verträge wiederkehrende Buchungen/Forderungen erzeugen? — Annahme v1: nur Referenz.
3. **Approval-Workflow**: reicht Status-Tracking (`in_review`/`approved`), oder mehrstufige Freigabe mit Zuständigen und Audit? — Annahme v1: Status-Tracking.
4. **Deliverables**: eingebettetes Array (v1) vs. Subcollection mit eigenem Reminder/Status.
5. **Reminder-Kanäle**: nur In-App-Notification, oder auch E-Mail/Push? Vorlauffenster modulweit oder pro Vertrag?
6. **AutoRenewal-Berechnung**: Kalender-Edge-Cases (Monatsende, Schaltjahr, „zum Quartalsende") — Bibliothek/Hilfsfunktion festlegen und mit Tests absichern.
7. **DeepSign-Kopplung**: soll v1 schon den Signatur-Status aus DeepSign zurückspielen, oder bleibt `signatureType`/`signatories` zunächst manuell?

## 12. Nächste Schritte

- [ ] Offene Punkte 1–7 entscheiden, Annahmen bestätigen oder kippen.
- [ ] `ContractModel` + Typen finalisieren, in Modell-Registry aufnehmen.
- [ ] Firestore Security Rules + Indizes (Dashboard-Queries: `state`, `nextTerminationDate`, `endDate`, `responsiblePersonId`).
- [ ] Fristen-/Reminder-Cloud-Functions spezifizieren (Berechnung + Scheduler) als eigene Detail-Spec.
- [ ] Implementierung via Claude Code nach Freigabe der Spec.
