# Spezifikation: Buchhaltungs-System

**Version:** 1.3  **Datum:** 25. Mai 2026  **Status:** Entwurf

**Änderungen ggü. 1.2:** Mehrmandantenfähigkeit für Buchhaltungs-Mandanten (Kap. 3.0) ergänzt; Debitorenmodul (Kap. 3.7) aufgenommen; Konfigurationsseite `aoc-accounting` (Kap. 3.8) beschrieben; offene Punkte aus v1.2 entschieden; `BookingJournalModel` in `BookingModel` umbenannt, Collection `journallogs` zu `bookings` migriert; bk2-Mappings aus v1.2 integriert.

**Änderungen ggü. 1.1:** Mapping auf bestehende bk2-Implementierung (Modelle, Features, Libs) ergänzt. Neue Entitäten (BookingLine, Period, VatCode, ExchangeRate, Asset, AssetMovement, PaymentOrder, Payment) identifiziert.

**Änderungen ggü. 1.0:** Modul Anlagenbuchhaltung (Kap. 3.5) und Zahlungsstandards ISO 20022 pain.001 (Kap. 3.6) ergänzt; Geltungsbereich, Glossar, Schnittstellen und Datenmodell entsprechend angepasst.

---

## 1. Einleitung

### 1.1 Zweck des Dokuments

Diese Spezifikation beschreibt die fachlichen und technischen Anforderungen an ein webbasiertes Buchhaltungs-System für kleine und mittlere Unternehmen (KMU) mit Sitz in der Schweiz. Das System unterstützt die doppelte Buchhaltung nach Schweizer Obligationenrecht (OR), die Schweizer Mehrwertsteuer (MWST) sowie Buchhaltung in mehreren Währungen.

### 1.2 Zielgruppe

- Kleine und mittlere Unternehmen in der Schweiz
- Treuhänder und Buchhaltungs-Dienstleister
- Vereine und Stiftungen mit Buchführungspflicht

### 1.3 Geltungsbereich

Das System deckt die operative Finanzbuchhaltung, die Debitorenverwaltung, die Anlagenbuchhaltung und den ausgehenden Zahlungsverkehr (ISO 20022 pain.001) ab. Nicht im Geltungsbereich sind: Lohnbuchhaltung, Kostenrechnung (Folgeprojekt), Lagerbuchhaltung, EBICS-Direktanbindung (Folgeprojekt), Anbindung an Lieferantenrechnungs-Plattformen (Folgeprojekt), Spesenabrechnung (separate Spezifikation).

---

## 2. Glossar

| Begriff | Bedeutung |
| :---- | :---- |
| Buchung | Einzelner Geschäftsfall mit mindestens einer Soll- und einer Habenseite |
| Konto | Element des Kontenplans, auf dem Buchungen erfasst werden |
| Kontenplan | Hierarchische Struktur aller verfügbaren Konten (z.B. KMU-Kontenrahmen) |
| Periode | Abgegrenzter Zeitraum (Monat, Quartal, Geschäftsjahr) |
| MWST | Schweizer Mehrwertsteuer (eidgenössische Steuerverwaltung ESTV) |
| Saldosteuersatz | Vereinfachtes MWST-Abrechnungsverfahren für KMU |
| ER | Erfolgsrechnung (Gewinn- und Verlustrechnung) |
| Funktionale Währung | Hauptwährung der Buchhaltung (typischerweise CHF) |
| Anlagegut | Vermögensgegenstand des Anlagevermögens mit Nutzungsdauer > 1 Jahr |
| AfA | Absetzung für Abnutzung (Abschreibung) |
| Buchwert | Anschaffungswert abzüglich kumulierter Abschreibungen |
| ISO 20022 | Internationaler Standard für Finanznachrichten (XML-basiert) |
| pain.001 | Payments Initiation: Kunde-an-Bank-Zahlungsauftrag |
| pain.002 | Payment Status Report: Bank-an-Kunde-Statusmeldung |
| camt.054 | Bank-an-Kunde Debit/Credit Notification (Avis-Meldung) |
| QR-IBAN | Spezielle IBAN für QR-Rechnungen mit Referenz |
| Buchhaltungs-Mandant | Eine Organisation (`OrgModel`), für die eine eigenständige Buchhaltung geführt wird; identifiziert durch `org.bkey` |
| Buchhaltungs-TenantId | `org.bkey` derjenigen Organisation, zu der eine Buchhaltungseinheit gehört; unabhängig vom bk2-Firebase-Tenant |

---

## 3. Funktionale Anforderungen

### 3.0 Mehrmandantenfähigkeit (Buchhaltungs-Mandanten)

#### 3.0.1 Konzept

Innerhalb eines bk2-Firebase-Tenants (z.B. `scs`) können mehrere eigenständige Buchhaltungen für verschiedene Organisationen geführt werden. Beispiel: Im Tenant `scs` existiert eine Buchhaltung für den Verein SCS (`org.bkey = 'scs'`) und eine separate Buchhaltung für den Gönnerverein GSS (`org.bkey = 'gss'`).

- Die **Buchhaltungs-TenantId** entspricht dem `org.bkey` derjenigen `OrgModel`-Instanz, zu der die Buchhaltung gehört.
- Der **Default-Buchhaltungs-Mandant** ist die `defaultOrg` des Firebase-Tenants.
- Alle Buchhaltungsdaten sind strikt nach Buchhaltungs-TenantId getrennt: Kontenplan, Buchungen, Perioden, MWST-Codes, Wechselkurse, Bankkonten, Anlagegüter, Zahlungsaufträge, Debitoren-Rechnungen, Konfiguration.

#### 3.0.2 Datenmodell-Konvention

Alle Buchhaltungsmodelle erhalten ein zusätzliches Pflichtfeld:

```
accountingTenantId: string  // = org.bkey der zugehörigen Organisation
```

Dieses Feld ergänzt das bestehende `tenants: string[]`-Feld (Firebase-Tenant-Isolation) und ermöglicht die mandantenspezifische Filterung innerhalb desselben Firebase-Tenants.

> **bk2-Mapping:** `FirestoreService`-Queries filtern künftig nach beiden Ebenen: `tenants` (arrayContains, bestehend) und `accountingTenantId` (equals, neu). Alle neuen Buchhaltungsmodelle (`BookingModel`, `BookingLineModel`, `PeriodModel`, `VatCodeModel`, `ExchangeRateModel`, `AssetModel`, `AssetMovementModel`, `PaymentOrderModel`, `PaymentModel`) implementieren dieses Feld. Bestehende Modelle, die als Buchhaltungs-Stammdaten dienen (`AccountModel`, `InvoiceModel`, `BillModel`), werden ebenfalls um `accountingTenantId` erweitert.

#### 3.0.3 UI-Konvention

- Ein Mandanten-Selektor in der Buchhaltungs-Navigation erlaubt den Wechsel zwischen verfügbaren Buchhaltungs-Mandanten.
- Der aktive Buchhaltungs-Mandant wird im `AccountingStore` (NgRx Signal Store) gehalten und steuert alle Queries der Buchhaltungs-Features.
- Benutzer sehen nur Mandanten, für die sie gemäss `UserModel.roles` berechtigt sind.

#### 3.0.4 Mandanten-Stammdaten

Jeder Buchhaltungs-Mandant hat eine eigene Konfiguration (vgl. Kap. 3.8). Die Konfiguration ist in einem `AccountingConfigModel` gespeichert (ein Dokument pro Mandant, `bkey = accountingTenantId`).

> **bk2-Mapping:** `AccountingConfigModel` — neu zu erstellen: `shared/models/accounting-config.model.ts`. Enthält alle mandantenspezifischen Einstellungen: funktionale Währung, MWST-Verfahren, MWST-Periode, Aktivierungsgrenze, Abschreibungsrhythmus, Geschäftsjahresbeginn. Collection: `accounting-configs`.

---

### 3.1 Doppelte Buchhaltung

#### 3.1.1 Buchungslogik

- Jede Buchung muss mindestens ein Soll- und ein Habenkonto enthalten.
- Summe Soll = Summe Haben (Bilanzgleichgewicht je Buchung).
- Unterstützung einfacher Buchungen (1 Soll / 1 Haben) und Sammelbuchungen (n Soll / m Haben).
- Stornierungen erfolgen ausschliesslich durch Gegenbuchung; eine echte Löschung verbuchter Belege ist nicht zulässig (Revisionssicherheit).
- Jede Buchung erhält eine eindeutige, lückenlose, fortlaufende Buchungsnummer pro Geschäftsjahr.

> **bk2-Mapping:** Das bestehende `BookingModel` (umbenannt aus `BookingJournalModel`, `shared/models/booking.model.ts`, Collection `bookings`) deckt einfache 1:1-Buchungen ab. Es wird erweitert um: `bookingNo` (fortlaufend), `periodKey` (Referenz auf `PeriodModel`), `documentKey` (Referenz auf `DocumentModel`), `status` (`'draft' | 'posted' | 'cancelled'`), `accountingTenantId`. Für n:m-Sammelbuchungen wird ein neues `BookingLineModel` eingeführt. Das bestehende Feature `finance/journal` (list/view) dient als Basis. Die Migration von Collection `journallogs` zu `bookings` ist einmalig durchzuführen.

#### 3.1.2 Kontenplan

- Vorlage: Schweizer KMU-Kontenrahmen (Käfer / Veb.ch).
- Mehrstufige Kontenhierarchie (Kontenklasse → Hauptkonto → Unterkonto).
- Anpassbarkeit: Konten können hinzugefügt, deaktiviert oder umbenannt werden.
- Kontonummern numerisch, mindestens 4-stellig, erweiterbar auf bis zu 8 Stellen.
- Konten haben einen festen Typ: Aktiv, Passiv, Aufwand, Ertrag, Neutral.
- Der Kontenplan wird mit dem bestehenden Feature `finance/account` implementiert (Model: `shared/models/account.model.ts` → `AccountModel`). Die Hierarchie ist über `AccountModel.parentKey` bereits abgebildet. Kontonummer = `AccountModel.id`. Kontotyp = `AccountModel.type` (CategoryList: `account_type`). Das Feature enthält bereits List (`account-list.ts`), Edit-Modal (`account-edit.modal.ts`), Form (`account.form.ts`) und Util (`account.util.ts`, `account.validations.ts`).
- `AccountModel` wird um `accountingTenantId` erweitert, damit pro Buchhaltungs-Mandant ein eigener Kontenplan geführt werden kann.

#### 3.1.3 Belege

- Jede Buchung verweist auf einen Beleg (Pflichtfeld).
- Belege können als PDF, JPG, PNG oder TIFF hochgeladen werden.
- Die Belege werden als documents (feature `document`, model: `shared/models/document.model.ts` → `DocumentModel`) implementiert. `DocumentModel.type = 'accounting'`. `DocumentModel.source` ist entweder `'expense'` oder `'accounting'`. Das Feature enthält bereits List, Edit, Upload und Revisions-Unterstützung (`document-list.ts`, `document-edit.modal.ts`, `document-revisions.modal.ts`).
- Eindeutige Belegnummer, suchbar und filterbar.
- Aufbewahrungsfrist: mindestens 10 Jahre, gemäss OR Art. 958f.

#### 3.1.4 Perioden und Abschluss

- Geschäftsjahr frei definierbar (Standard: Kalenderjahr).
- Monatsabschluss mit optionaler Sperrung der Periode.
- Jahresabschluss mit automatischer Eröffnungsbuchung im Folgejahr.
- Nach Abschluss einer Periode sind keine rückwirkenden Buchungen mehr möglich; Korrekturen erfolgen in der laufenden Periode.

> **bk2-Mapping:** Kein `PeriodModel` vorhanden. Neu zu erstellen: `shared/models/period.model.ts` → `PeriodModel` mit Feldern `year`, `month` (0 = Jahresperiode), `isLocked`, `lockedBy`, `lockedAt`, `accountingTenantId`. Feature: neues `finance/period` (data-access, feature, util). Konfiguration der Perioden über die Konfigurationsseite (vgl. Kap. 3.8). Das bestehende `YearConfig`-Interface (`shared/models/year-config.model.ts`) kann als UI-Hilfskonstrukt für Jahresfilter weiterverwendet werden.

---

### 3.2 Schweizer Mehrwertsteuer (MWST)

#### 3.2.1 MWST-Sätze

Das System unterstützt die aktuellen Schweizer MWST-Sätze (Stand 2024+):

| Satz | Wert | Anwendung |
| :---- | :---- | :---- |
| Normalsatz | 8.1% | Standardlieferungen und -leistungen |
| Reduzierter Satz | 2.6% | Lebensmittel, Bücher, Medikamente etc. |
| Sondersatz Beherbergung | 3.8% | Hotellerie |
| Befreit | 0% | Exporte, von der Steuer ausgenommene Leistungen |

Frühere Sätze (7.7% / 2.5% / 3.7%) müssen für rückwirkende Buchungen bis Ende 2023 weiterhin verfügbar sein. MWST-Sätze sind jahresbezogen konfigurierbar (vgl. Kap. 3.8).

#### 3.2.2 Abrechnungsverfahren

- **Von der Steuer befreit (exempt)**: Keine MWST-Abrechnung.
- **Effektive Abrechnung**: Mit Vorsteuerabzug; für die meisten KMU.
- **Saldosteuersatz**: Vereinfachtes Verfahren für berechtigte KMU.
- **Pauschalsteuersatz**: Für öffentlich-rechtliche Körperschaften.
- Wechsel zwischen den Methoden auf Geschäftsjahres-Basis.

> **bk2-Mapping:** Das Abrechnungsverfahren wird pro Buchhaltungs-Mandant und Jahr in `AccountingConfigModel` gespeichert (Feld `vatMethod: 'exempt' | 'effective' | 'net_tax_rate' | 'flat_rate'`, `vatMethodYear: number`). Konfiguration über die Konfigurationsseite (vgl. Kap. 3.8).

#### 3.2.3 Abrechnungsperioden

- Quartalsweise (Standard).
- Monatlich (auf Antrag bei ESTV).
- Halbjährlich (Saldosteuersatz-Methode).

> **bk2-Mapping:** Abrechnungsperiode in `AccountingConfigModel` als `vatPeriod: 'quarterly' | 'monthly' | 'semi-annual'`.

#### 3.2.4 MWST-Codes pro Konto

- Jedem Aufwands- und Ertragskonto kann ein Standard-MWST-Code zugewiesen werden.
- Beim Buchen wird der MWST-Code vorgeschlagen, kann aber überschrieben werden.
- MWST-Codes umfassen mindestens: Umsatz Normalsatz, Umsatz reduziert, Umsatz Sondersatz, Befreite Umsätze, Vorsteuer Material, Vorsteuer Investitionen.

> **bk2-Mapping:** `InvoiceModel.vatType` (`'included' | 'excluded' | 'exempt'`) ist eine Vereinfachung auf Rechnungsebene und reicht für volle MWST-Code-Verwaltung nicht aus. Neu zu erstellen: `shared/models/vat-code.model.ts` → `VatCodeModel` mit Feldern `code`, `rate`, `validFrom`, `validTo`, `accountKey` (Buchungskonto), `method`, `accountingTenantId`. Feature: neues `finance/vat-code` (data-access, feature, util). Konfiguration über Kap. 3.8.

#### 3.2.5 MWST-Abrechnung

- Automatische Generierung der MWST-Abrechnung im Format der ESTV.
- Export der Daten zur elektronischen Übermittlung (ESTV SuisseTax).
- Plausibilitätsprüfung vor Abschluss (Differenz zwischen Buchhaltung und MWST-Konto).
- Korrekturabrechnung (Berichtigung gemäss MWST-Gesetz Art. 72) muss unterstützt werden.

---

### 3.3 Multi-Currency

#### 3.3.1 Funktionale Währung

- Die funktionale Währung wird pro Buchhaltungs-Mandant einmalig festgelegt (Standard: CHF).
- Alle Berichte werden in funktionaler Währung dargestellt; optional kann eine Zweitwährung gewählt werden.

> **bk2-Mapping:** `MoneyModel` (`shared/models/money.model.ts`) enthält bereits `amount` (Minor Unit als Integer), `currency: CurrencyCode` (ISO 4217) und `CurrencyDefinitions`. Die funktionale Währung wird in `AccountingConfigModel` gespeichert: `functionalCurrency: CurrencyCode`.

#### 3.3.2 Fremdwährungen

- Unterstützung beliebiger ISO-4217-Währungscodes.
- Pro Konto kann eine feste Währung zugewiesen werden (typisch für Fremdwährungs-Bankkonten).
- Buchungen können in Fremdwährung erfasst werden; das System bucht parallel in Originalwährung und in funktionaler Währung.

> **bk2-Mapping:** Das neue `BookingLineModel` erhält Felder `amountFx: MoneyModel` (Originalwährung) und `amountFunctional: MoneyModel` (funktionale Währung) sowie `exchangeRateKey`.

#### 3.3.3 Wechselkurse

- Tageskurse werden täglich automatisch von der Schweizerischen Nationalbank (SNB) bezogen.
- Manuelle Kursüberschreibung pro Buchung möglich.
- Historische Kurse bleiben unveränderlich gespeichert.
- Monatsmittelkurse und ESTV-Jahresmittelkurse stehen zur Verfügung (relevant für MWST-Umrechnung).

> **bk2-Mapping:** Neu zu erstellen: `shared/models/exchange-rate.model.ts` → `ExchangeRateModel` mit Feldern `fromCurrency: CurrencyCode`, `toCurrency: CurrencyCode`, `rate`, `date`, `source` (`'snb' | 'manual'`), `rateType` (`'daily' | 'monthly_avg' | 'yearly_avg'`). Cloud Function für SNB-API-Abruf (analog bestehende Bexio-Cloud-Functions). Kein `accountingTenantId` — Wechselkurse sind mandantenübergreifend gültig.

#### 3.3.4 Bewertung zum Stichtag

- Automatische Neubewertung von Fremdwährungspositionen zum Stichtagskurs.
- Buchung der nicht realisierten Kursgewinne/-verluste auf separates Konto.
- Realisation der Kursdifferenz beim Zahlungsausgleich.

---

### 3.4 Reporting

Alle Reports stehen im Browser, als PDF und als Excel/CSV-Export zur Verfügung. Filtermöglichkeiten umfassen: Zeitraum, Buchhaltungs-Mandant, Kostenstelle (optional, Folgeprojekt), Vergleichsperiode.

#### 3.4.1 Bilanz

- Darstellung gemäss Schweizer OR Art. 959a (Mindestgliederung).
- Aktiv- und Passivseite mit Vorjahresvergleich.
- Stichtagsbezogene Auswertung zu beliebigem Datum.
- Aufklappbare Hierarchie bis zur Einzelbuchung (Drill-Down).
- Optionale Erweiterung um Stufen (z.B. Umlaufvermögen, Anlagevermögen, Fremdkapital, Eigenkapital).

> **bk2-Mapping:** Neue Sektion `finance/balance` (feature, data-access). Nutzt `AccountModel`-Hierarchie (via `flattenAccountTree` aus `finance-account-util`) und aggregierte `BookingModel`/`BookingLineModel`-Salden, gefiltert nach `accountingTenantId`.

#### 3.4.2 Erfolgsrechnung (ER)

- Produktions- oder Absatzerfolgsrechnung wählbar.
- Mindestgliederung gemäss OR Art. 959b.
- Mehrperiodenvergleich (aktueller Monat, kumuliert YTD, Vorjahr).
- Budget-Soll-Ist-Vergleich (optional).
- Stufen-Erfolgsrechnung mit Bruttogewinn, EBITDA, EBIT, Jahresgewinn.

> **bk2-Mapping:** Neue Sektion `finance/income-statement` (feature, data-access). Gleiche Datenbasis wie Bilanz.

#### 3.4.3 Cash Flow

- Indirekte Methode (ausgehend vom Jahresgewinn).
- Direkte Methode (auf Basis der Liquiditätskonten) optional.
- Gliederung gemäss Swiss GAAP FER 4 in: Betriebstätigkeit, Investitionstätigkeit, Finanzierungstätigkeit.
- Periodenvergleich Vorjahr.

> **bk2-Mapping:** Neue Sektion `finance/cash-flow` (feature, data-access).

#### 3.4.4 Journal

- Chronologische Liste aller Buchungen im gewählten Zeitraum.
- Filter: Konto, Belegart, Betrag, Buchungstext, MWST-Code.
- Volltextsuche im Buchungstext.
- Export als CSV/Excel zur weiteren Verarbeitung.
- Anzeige Originalwährung und funktionale Währung nebeneinander.

> **bk2-Mapping:** Das bestehende Feature `finance/journal` (`journal-list.ts`, `journal-view.modal.ts`, `journal.store.ts`, `journal.service.ts`) ist die Basis. `JournalService.list()` wird auf Collection `bookings` (umbenannt von `journallogs`) umgestellt und um `accountingTenantId`-Filter sowie Fremdwährungs-Spalten erweitert.

#### 3.4.5 Kontoübersicht

- Detail aller Buchungen pro Konto im gewählten Zeitraum.
- Anfangssaldo, Bewegungen Soll/Haben, Endsaldo.
- Drill-Down auf Belegebene mit Vorschau des hinterlegten Dokuments.
- Saldenliste über alle Konten (Probebilanz) mit Summenprüfung.

> **bk2-Mapping:** Erweiterung von `finance/account` (neue Unterseite/Modal) oder neue Sektion `finance/account-detail`. Nutzt `AccountService.read()` und Buchungsabfrage nach Konto und `accountingTenantId`.

---

### 3.5 Anlagenbuchhaltung (Modul)

#### 3.5.1 Anlagenstammdaten

- Eindeutige Anlagennummer pro Buchhaltungs-Mandant, fortlaufend oder strukturiert (z.B. nach Anlagekategorie).
- Pflichtfelder: Bezeichnung, Anlagekategorie, Anschaffungsdatum, Inbetriebnahmedatum, Anschaffungswert, Nutzungsdauer (in Monaten), Abschreibungsmethode.
- Optionale Felder: Lieferant, Seriennummer, Standort, Kostenstelle, verantwortliche Person, Garantieende, interne Notizen.
- Zuordnung zu Bilanzkonto (Aktivierung) und Aufwandskonto (Abschreibung) gemäss Kontenplan.
- Verknüpfung mit Eingangsbeleg (Lieferantenrechnung) zur Nachvollziehbarkeit.

> **bk2-Mapping:** Neu zu erstellen: `shared/models/asset.model.ts` → `AssetModel` mit Feldern `assetNo`, `category`, `acquisitionDate`, `commissioningDate`, `acquisitionValue: MoneyModel`, `usefulLifeMonths`, `depreciationMethod` (`'linear' | 'declining' | 'performance' | 'immediate' | 'manual'`), `balanceAccountKey`, `expenseAccountKey`, `billKey` (Referenz auf `BillModel`), `accountingTenantId`. Optional: `vendorKey` (Referenz auf `OrgModel`), `serialNo`, `location`, `costCenter`, `responsiblePersonKey`, `warrantyEndDate`. Feature: neues `finance/asset` (data-access, feature, ui, util).

#### 3.5.2 Anlagekategorien

Vorkonfigurierte Kategorien mit Standardwerten gemäss ESTV-Merkblatt A/1995. Konfiguration über die Konfigurationsseite (vgl. Kap. 3.8):

| Kategorie | Lineare Nutzungsdauer | Degressiver Satz (ESTV) |
| :---- | :---- | :---- |
| Wohnliegenschaften | 50 Jahre | 2% |
| Geschäftsliegenschaften | 25–40 Jahre | 3–4% |
| Maschinen | 5–10 Jahre | 20–30% |
| Mobiliar und Einrichtungen | 8–10 Jahre | 25% |
| Büromaschinen, EDV-Hardware | 3–5 Jahre | 40% |
| Software | 3 Jahre | 40% |
| Fahrzeuge | 5 Jahre | 40% |
| Werkzeuge, Geschirr, Wäsche | 1–3 Jahre | 45% |

Kategorien können angepasst und erweitert werden.

> **bk2-Mapping:** Anlagekategorien werden als `AssetCategoryModel` (`shared/models/asset-category.model.ts`) pro Buchhaltungs-Mandant gespeichert. Felder: `name`, `defaultUsefulLifeMonths`, `depreciationMethod`, `decliningRate` (degressiver Prozentsatz gemäss ESTV), `interestRate` (kalkulatorischer Zinssatz, z.B. für interne Verrechnungen oder Leasingbewertung), `balanceAccountKey`, `expenseAccountKey`, `accountingTenantId`. Collection: `asset-categories`.

#### 3.5.3 Abschreibungsmethoden

- **Linear**: Gleichmässige Verteilung über die Nutzungsdauer (Standard).
- **Degressiv**: Konstanter Prozentsatz vom Restbuchwert.
- **Leistungsbezogen**: Abschreibung nach effektiver Nutzung (z.B. Kilometer, Betriebsstunden).
- **Sofortabschreibung**: Vollständige Abschreibung im Anschaffungsjahr (steuerlich für Sofortabschreibungsgüter erlaubt).
- **Manuell**: Ausserordentliche Abschreibung mit individuellem Betrag und Begründung.

Wechsel der Methode während der Nutzungsdauer ist möglich, wird aber im Audit-Trail dokumentiert.

#### 3.5.4 Aktivierungsgrenze

- Konfigurierbare Aktivierungsgrenze pro Buchhaltungs-Mandant (typisch CHF 1'000 für Sofortaufwand).
- Beträge unterhalb der Grenze werden als Aufwand erfasst und nicht aktiviert.
- Komponenten-Aktivierung: Mehrere Belege können zu einem Anlagegut zusammengefasst werden (z.B. PC + Monitor + Software).

> **bk2-Mapping:** Aktivierungsgrenze in `AccountingConfigModel` als `assetCapitalizationLimit: MoneyModel`.

#### 3.5.5 Abschreibungslauf

- Monatlicher oder jährlicher Abschreibungslauf, wählbar pro Buchhaltungs-Mandant.
- Pro-rata-temporis-Berechnung im Anschaffungs- und Abgangsjahr (taggenau oder halbjährlich, konfigurierbar).
- Vorschau-Modus mit Simulation vor der Verbuchung.
- Automatische Erzeugung der Abschreibungsbuchungen mit Verweis auf das Anlagegut.
- Sperre gegen Doppelverbuchung pro Periode.

> **bk2-Mapping:** Abschreibungsrhythmus in `AccountingConfigModel` als `depreciationFrequency: 'monthly' | 'annual'`. Pro-rata-Methode als `depreciationProRata: 'daily' | 'semi-annual'`.

#### 3.5.6 Anlagenbewegungen

- **Zugang**: Aktivierung mit Verweis auf Eingangsbeleg.
- **Zuschreibung / Wertaufholung**: Erhöhung des Buchwerts bis maximal zum Anschaffungswert.
- **Ausserordentliche Abschreibung**: Wertkorrektur bei dauerhafter Wertminderung.
- **Teilabgang**: Abgang einer Komponente bei zusammengesetzten Anlagen.
- **Vollabgang (Verkauf, Verschrottung)**: Ausbuchung mit Berechnung Restbuchwert und Buchungsgewinn/-verlust.
- **Umbuchung**: Wechsel der Kostenstelle, des Standorts oder der Kategorie.

> **bk2-Mapping:** Neu zu erstellen: `shared/models/asset-movement.model.ts` → `AssetMovementModel` mit Feldern `assetKey`, `movementType` (`'addition' | 'appreciation' | 'extra_depreciation' | 'partial_disposal' | 'full_disposal' | 'transfer'`), `date`, `amount: MoneyModel`, `reason`, `bookingKey`, `accountingTenantId`. Collection: `asset-movements`.

#### 3.5.7 Anlagenspiegel

Bericht gemäss Schweizer OR Art. 959c mit folgenden Spalten je Anlagekategorie:

- Anschaffungswerte: Anfangsbestand, Zugänge, Abgänge, Umbuchungen, Endbestand
- Kumulierte Abschreibungen: Anfangsbestand, Zugänge (planmässig + ausserplanmässig), Abgänge, Endbestand
- Buchwerte: Anfangs- und Endbestand
- Vorjahresvergleich

#### 3.5.8 Weitere Reports

- **Anlagenverzeichnis**: Detailliste aller aktiven Anlagen mit Stammdaten und aktuellem Buchwert.
- **Abschreibungsplan**: Prognose der zukünftigen Abschreibungen pro Anlage über die Restnutzungsdauer.
- **Anlagenkartei**: Detailansicht je Anlage mit allen Bewegungen und Belegen.
- **Abgangsbericht**: Verkaufte und verschrottete Anlagen im Berichtszeitraum mit Gewinn/Verlust.

#### 3.5.9 Steuerliche vs. handelsrechtliche Sicht

- Parallele Bewertungsschienen: Handelsrechtlich (OR) und steuerlich (DBG/StHG) können getrennt geführt werden.
- Stille Reserven aus Abschreibungsdifferenzen werden auf separatem Konto ausgewiesen.

---

### 3.6 Zahlungsverkehr (ISO 20022 pain.001)

#### 3.6.1 Grundlagen

- Unterstützung von ISO 20022 pain.001.001.09 (aktueller Schweizer Standard gemäss Swiss Payment Standards der SIX).
- Generierung XML-konformer Zahlungsdateien für den Upload bei Schweizer Banken (e-Banking).
- Validierung der Dateien gegen das offizielle SIX-XSD-Schema vor dem Export.
- EBICS-Direktanbindung folgt in einem späteren Ausbauschritt.

> **bk2-Mapping:** XML-Generierung und XSD-Validierung erfolgen in einer Firebase Cloud Function (`apps/functions/src/`), analog zu bestehenden Integrationen (Matrix, Bexio).

#### 3.6.2 Unterstützte Zahlungsarten

Gemäss Schweizer Implementation Guidelines (SIX Business Rules):

| Typ | Anwendung |
| :---- | :---- |
| Typ 1 | Inlandzahlung in CHF mit QR-Referenz (QR-IBAN) |
| Typ 2.1 | Inlandzahlung in CHF mit Schweizer IBAN ohne Referenz |
| Typ 2.2 | SEPA-Zahlung in EUR innerhalb SEPA-Raum |
| Typ 3 | Inlandzahlung in CHF/EUR an Banken in der Schweiz/Liechtenstein |
| Typ 5 | Auslandzahlung in beliebiger Währung (SWIFT) |
| Typ 6 | Bankinterne Zahlung (z.B. Übertrag zwischen eigenen Konten) |

Das System wählt den Zahlungstyp automatisch anhand der Empfänger-IBAN, der Währung und der Referenz.

#### 3.6.3 Zahlungslauf

- **Erfassung**: Manuell oder durch Import von Kreditorenrechnungen.
- **Eingabe via QR-Rechnung**: Einlesen über Scanner, Kamera (Mobile) oder PDF-Upload; automatische Extraktion von IBAN, Betrag, Referenz, Empfänger.
- **Zahlungsvorschlag**: Automatische Selektion fälliger Rechnungen unter Berücksichtigung von Fälligkeit, Skonto, Verfügbarkeit liquider Mittel.
- **Freigabe**: Vier-Augen-Prinzip mit zwei Rollen (Erfasser, Freigeber); konfigurierbar pro Mandant und Betragslimite.
- **Erstellung pain.001**: Bündelung mehrerer Zahlungen zu einem Auftrag (PaymentInformationBlock je Belastungskonto und Ausführungsdatum).
- **Versand**: Download als XML-Datei.

> **bk2-Mapping:** Basis für Kreditorenrechnungen ist das bestehende `BillModel` (`shared/models/bill.model.ts`) mit Feature `finance/bill` (list/view bereits vorhanden). QR-Rechnungs-Parsing erfolgt in einer Cloud Function.

#### 3.6.4 Pflichtfelder pain.001

Pro Zahlung werden folgende Daten erfasst und in der XML abgebildet:

- Belastungskonto (eigene IBAN) und Belastungsdatum (RequestedExecutionDate)
- Empfänger: Name, Adresse (strukturiert oder unstrukturiert je nach Zahlungstyp)
- Empfänger-IBAN bzw. -Kontonummer
- Betrag und Währung
- Referenz: QR-Referenz, Creditor Reference (ISO 11649) oder unstrukturierter Verwendungszweck
- Spesenregelung (SLEV für SEPA, SHAR/OUR/DEBT für Auslandzahlungen)
- Eindeutige End-to-End-ID je Zahlung
- Eindeutige Message-ID je Datei

**Hinweis zur Adresspflicht:** Ab November 2025 gilt im Schweizer Zahlungsverkehr die strukturierte Adresse als Pflicht. Das System unterstützt strukturierte Adressen und warnt bei unvollständigen Daten.

> **bk2-Mapping:** `AddressModel` enthält bereits `streetName`, `streetNumber`, `zipCode`, `city`, `countryCode` (strukturierte Adresse) und `iban`. IBAN-MOD-97-Validierung als neue Util-Funktion in `finance/payment/util`.

#### 3.6.5 Statusverarbeitung (pain.002)

- Import der Bank-Status-Meldung pain.002 nach Verarbeitung.
- Abgleich der End-to-End-IDs mit den ursprünglichen Zahlungen.
- Statusanzeige je Zahlung: erfasst, freigegeben, übermittelt, akzeptiert, teilweise abgelehnt, abgelehnt.
- Bei Ablehnungen: Anzeige des Reason Codes und Möglichkeit zur Korrektur und Neuübermittlung.

#### 3.6.6 Verbuchung

- Buchung der Zahlung erfolgt erst nach Eingang der Bank-Belastung (camt.053/054), nicht bereits bei Übermittlung.
- Automatischer Abgleich zwischen pain.001-Auftrag, camt.054-Avis und camt.053-Kontoauszug über die End-to-End-ID.
- Skonti werden automatisch verbucht, wenn die Zahlung innerhalb der Skontofrist erfolgt.
- Fremdwährungszahlungen: Kursdifferenz zwischen Rechnungs- und Zahlungsdatum wird auf Kursdifferenzkonto gebucht.

#### 3.6.7 Stammdaten

- **Eigene Bankkonten**: IBAN, BIC, Bankname, Standardwährung, Verwendung (operativ, Spesen, Lohn, etc.). Benutze `shared/models/account.model.ts` → `AccountModel` (`AccountModel.id` = IBAN, `AccountModel.type` für Verwendungszweck, `accountingTenantId` für Mandantentrennung).
- **Lieferanten-Bankverbindungen**: Mehrere Bankverbindungen pro Lieferant möglich, eine als Standard markiert. Benutze `shared/models/address.model.ts` → `AddressModel` (`addressChannel = 'bankaccount'`, `iban`, `url` für BIC, `streetName`, `zipCode`, `city`, `countryCode`) in `OrgModel` (= Lieferant). `AddressModel.isFavorite` markiert die Standard-Bankverbindung.
- **Plausibilitätsprüfung**: IBAN-Prüfziffernkontrolle (MOD-97), BIC-Format, Pflichtfelder je Zahlungstyp.

---

### 3.7 Debitorenmodul

#### 3.7.1 Überblick

Das Debitorenmodul verwaltet ausgehende Kundenrechnungen. Rechnungen werden als `InvoiceModel` (`shared/models/invoice.model.ts`) in der Collection `invoices` gespeichert. Die bestehende Feature-Lib `finance/invoice` (list, edit, new, view bereits vorhanden) bildet die Basis; sie wird um die Buchhaltungsintegration erweitert.

#### 3.7.2 Rechnungserstellung

- Neue Debitorenrechnung mit Pflichtfeldern: Rechnungsempfänger (`InvoiceModel.receiver: AvatarInfo`), Rechnungsdatum, Fälligkeitsdatum, Positionen (Bezeichnung, Menge, Einheitspreis, MWST-Satz, Buchungskonto).
- Unterstützung mehrerer Rechnungspositionen je Rechnung; jede Position referenziert ein Erlöskonto aus dem Kontenplan (`accountKey`).
- Rechnungsnummer wird automatisch fortlaufend pro Geschäftsjahr und Buchhaltungs-Mandant vergeben.
- MWST-Berechnung gemäss Kap. 3.2; MWST-Typ via `InvoiceModel.vatType` (`'included' | 'excluded' | 'exempt'`).
- Währung frei wählbar; Umrechnung in funktionale Währung via `ExchangeRateModel`.

> **bk2-Mapping:** `InvoiceModel` wird um `accountingTenantId`, `bookingKey` (Referenz auf erstellte Buchung nach Zahlung) und `invoiceNo` (fortlaufende Nummer) erweitert. `InvoicePositionModel` (`shared/models/invoice-position.model.ts`) erhält zusätzlich `accountKey` (Erlöskonto) und `vatCodeKey`. Das bestehende Feature `finance/invoice` enthält bereits `invoice-new.modal.ts`, `invoice-edit.modal.ts`, `invoice-list.ts`, `invoice-view.modal.ts` und `invoice.store.ts`.

#### 3.7.3 PDF-Generierung

- Aus jeder Rechnung kann ein PDF erzeugt werden (QR-Rechnung mit Einzahlungsschein gemäss SIX-Standard, falls QR-IBAN konfiguriert).
- Die PDF-Generierung erfolgt über eine dedizierte Firebase Cloud Function (`generateInvoicePdf`), die das `InvoiceModel` und seine Positionen entgegennimmt und ein PDF zurückgibt.
- Das generierte PDF wird als `DocumentModel` (`type = 'accounting'`, `source = 'accounting'`) in Firebase Storage abgelegt und mit der Rechnung verknüpft.

> **bk2-Mapping:** Cloud Function analog zu `getMatrixCredentials` in `apps/functions/src/`. Rechnungsvorlagen (Layout, Logo, Adresse) werden aus `AccountingConfigModel` und `OrgModel` bezogen.

#### 3.7.4 Zahlungsabgleich

- Eingehende Zahlungen werden manuell oder via camt.054-Import dem offenen Debitorenposten zugeordnet.
- Bei vollständiger Zahlung: Status auf `'paid'` setzen, Buchung automatisch erstellen (Debit: Bankkonto, Kredit: Debitorenkonto).
- Teilzahlungen: verbleibender Saldo bleibt offen.
- Skonto: Differenz zwischen Rechnungsbetrag und Zahlungseingang wird automatisch auf Skontoaufwandskonto gebucht, falls Zahlung innerhalb Skontofrist.

#### 3.7.5 Mahnwesen

- Automatische Erkennung überfälliger Rechnungen (Fälligkeitsdatum überschritten, Status nicht `'paid'`).
- Manuelle Mahnstufen (1. Mahnung, 2. Mahnung, Inkasso).
- Mahnschreiben via PDF-Generierung (Cloud Function).

#### 3.7.6 Debitorenliste und Reports

- Offene-Posten-Liste mit Fälligkeit und Zahlungsstatus, gefiltert nach Buchhaltungs-Mandant.
- Debitorenalterung (Aging Report): gruppiert nach 0–30, 31–60, 61–90, >90 Tage überfällig.
- Umsatz pro Kunde im Zeitraum.

---

### 3.8 Konfiguration

#### 3.8.1 Übersicht

Die Buchhaltungskonfiguration ist über eine dedizierte Seite `aoc-accounting-config` erreichbar. Sie ist pro Buchhaltungs-Mandant getrennt und enthält mehrere thematisch gruppierte Konfigurationskarten (Cards). Die Daten werden in `AccountingConfigModel` (`shared/models/accounting-config.model.ts`, Collection `accounting-configs`, ein Dokument pro `accountingTenantId`) gespeichert.

> **bk2-Mapping:** Route: `/aoc/accounting/:accountingTenantId/config`. Komponente: `accounting-config.page.ts` in einem neuen `finance/accounting/feature`-Layer. Jede Card ist eine eigenständige UI-Komponente in `finance/accounting/ui`. Zugriff: nur mit `isAdminGuard` oder Buchhalter-Rolle.

#### 3.8.2 Card: MWST-Konfiguration

Konfigurierbar pro Buchhaltungs-Mandant:

- **MWST-Sätze pro Jahr**: Liste der gültigen Sätze (Normalsatz, Reduzierter Satz, Beherbergungssatz, Befreit) je Gültigkeitsjahr. Neue Sätze können für zukünftige Jahre erfasst werden; historische Sätze bleiben unveränderlich.
- **Abrechnungsverfahren**: Auswahl aus `'exempt' | 'effective' | 'net_tax_rate' | 'flat_rate'` (von der Steuer befreit / effektiv / Saldosteuersatz / Pauschalsteuersatz); wechselbar auf Jahresbasis.
- **Abrechnungsperiode**: Auswahl aus `'quarterly' | 'monthly' | 'semi-annual'` (Quartal / Monatlich / Halbjährlich).

#### 3.8.3 Card: Währungskonfiguration

- **Funktionale Währung**: Einmalig festlegbar (Standard: CHF); Änderung nur mit expliziter Bestätigung und nur für zukünftige Buchungen.
- **Zweitwährung** (optional): Zusätzliche Darstellungswährung in Reports.

#### 3.8.4 Card: Anlagenbuchhaltung

- **Aktivierungsgrenze**: Betrag in funktionaler Währung; Güter unterhalb der Grenze werden direkt als Aufwand erfasst.
- **Abschreibungsrhythmus**: `'monthly' | 'annual'` (monatlich / jährlich).
- **Pro-rata-Berechnung**: `'daily' | 'semi-annual'` (taggenau / halbjährlich) für Anschaffungs- und Abgangsjahr.

#### 3.8.5 Card: Anlagekategorien

Liste aller konfigurierten Anlagekategorien mit folgenden Feldern je Kategorie:

- Name der Kategorie
- Standard-Nutzungsdauer (Monate)
- Abschreibungsmethode (`'linear' | 'declining' | 'performance' | 'immediate' | 'manual'`)
- Degressiver Satz (%) für Methode `declining`
- Kalkulatorischer Zinssatz (%) für interne Verrechnungen oder Leasingbewertung
- Zugeordnetes Bilanzkonto (`balanceAccountKey` aus Kontenplan)
- Zugeordnetes Aufwandskonto (`expenseAccountKey` aus Kontenplan)

Neue Kategorien können hinzugefügt, bestehende angepasst werden. Löschung nur wenn keine Anlagegüter zugeordnet.

#### 3.8.6 Card: Perioden

- Übersicht aller Perioden (Monate und Jahresperioden) des aktuellen und vergangenen Geschäftsjahres.
- Anzeige: offen / gesperrt, mit Datum und Benutzer der Sperrung.
- Aktion: Periode sperren (nach Abschluss) oder entsperren (nur mit Admin-Berechtigung).
- Geschäftsjahresbeginn konfigurierbar (Standard: 1. Januar); Änderung erfordert explizite Bestätigung.

#### 3.8.7 Card: Sozialabgaben *(Folgeprojekt)*

- Konfiguration der Sozialabgabesätze pro Jahr (AHV, IV, EO, ALV, UVG, KTG, BVG-Sätze).
- Zuordnung zu Buchungskonten.
- Wird in einer separaten Spezifikation detailliert, sobald die Lohnbuchhaltung in den Scope aufgenommen wird.

---

## 4. Nichtfunktionale Anforderungen

### 4.1 Compliance und Recht

- Konformität mit OR Art. 957-963b (kaufmännische Buchführung).
- GeBüV-Konformität (Geschäftsbücherverordnung): Unveränderbarkeit, Nachvollziehbarkeit, Verfügbarkeit.
- Revisionssicherheit: Audit-Trail über alle Änderungen mit Benutzer, Zeitstempel und Grund.
- Aufbewahrungsfrist von 10 Jahren für alle Geschäftsunterlagen.

### 4.2 Datenschutz

- DSG-Konformität (Schweizer Datenschutzgesetz, revidiert 2023).
- Hosting in der Schweiz oder im EWR.
- Verschlüsselung in Transit (TLS 1.3) und at-rest (AES-256).

> **bk2-Mapping:** Firebase-Hosting und Firestore sind bereits konfiguriert. CSP-Regeln in `firebase.json` vorhanden.

### 4.3 Performance

- Antwortzeit für Standard-Reports unter 3 Sekunden bei bis zu 100'000 Buchungen pro Jahr.
- Buchung erfassen: unter 500 ms Bestätigung.
- Concurrency: mindestens 50 gleichzeitige Benutzer pro Mandant.

> **bk2-Mapping:** `FirestoreService` nutzt `shareReplay` für gecachte Queries. Lazy-Loading via Router-Konfiguration gemäss CLAUDE.md.

### 4.4 Benutzer und Berechtigungen

- Rollenbasiertes Berechtigungsmodell mit mindestens: Administrator, Buchhalter, Erfasser, Leser, Revisor (Read-only inkl. abgeschlossener Perioden).
- Ein Benutzer kann auf mehrere Buchhaltungs-Mandanten zugreifen (kontrolliert via Rollen).
- Zwei-Faktor-Authentifizierung (2FA) verpflichtend für Administratoren.

> **bk2-Mapping:** Rollen via `UserModel.roles` (`Roles`-Typ in `shared/models/roles.ts`). Guards: `isAuthenticatedGuard`, `isPrivilegedGuard`, `isAdminGuard`. Mandantenzugriff via `accountingTenantId` auf Modelleben und `AccountingStore`-State im Frontend.

### 4.5 Mehrsprachigkeit

- Benutzeroberfläche in Deutsch, Französisch, Italienisch und Englisch.
- Kontenpläne und Belege bleiben in der Erfassungssprache.

> **bk2-Mapping:** Transloco ist bereits konfiguriert (Default: `de`). Neue Übersetzungskeys in `apps/scs-app/src/assets/i18n/de.json` ergänzen.

### 4.6 Schnittstellen

- Import: CAMT.053/054 (Bank-Kontoauszug/Avis), pain.002 (Zahlungsstatus), CSV, Excel.
- Export: pain.001.001.09 (Zahlungsaufträge), CSV, Excel, PDF, ZIP-Archiv (für GeBüV-Archivierung).
- API: REST-Schnittstelle (OpenAPI 3.0) für Drittsysteme.
- Anbindung an ESTV SuisseTax für MWST-Übermittlung.
- EBICS-Direktanbindung: Folgeprojekt.
- Anbindung an digitale Lieferantenrechnungs-Plattformen (eBill, Peppol BIS Billing 3.0): Folgeprojekt.

> **bk2-Mapping:** Import/Export und Drittschnittstellen via Firebase Cloud Functions (`apps/functions/src/`), analog zum bestehenden Bexio-Integrations-Muster (`finance/invoice/util/bexio-invoice.util.ts`).

---

## 5. Datenmodell (Übersicht)

### 5.1 Kernentitäten

| Entität | bk2-Modell | Status |
| :---- | :---- | :---- |
| **Buchhaltungs-Mandant** | `OrgModel` (`shared/models/org.model.ts`); Konfiguration in `AccountingConfigModel` | `AccountingConfigModel` neu erstellen; `OrgModel` vorhanden |
| **Buchhaltungs-Konfiguration** | `AccountingConfigModel` — neu erstellen (`shared/models/accounting-config.model.ts`, Collection `accounting-configs`) | fehlt; enthält `functionalCurrency`, `vatMethod`, `vatPeriod`, `assetCapitalizationLimit`, `depreciationFrequency`, `fiscalYearStart` u.a. |
| **Konto** | `AccountModel` (`shared/models/account.model.ts`); Feature `finance/account` | vorhanden; ergänze `accountingTenantId` |
| **Buchung (Kopf)** | `BookingModel` (umbenannt aus `BookingJournalModel`, `shared/models/booking.model.ts`, Collection `bookings`) | vorhanden als `BookingJournalModel` / `journallogs`; umbenennen + `bookingNo`, `periodKey`, `documentKey`, `status`, `accountingTenantId` ergänzen |
| **Buchungszeile** | `BookingLineModel` — neu erstellen (`shared/models/booking-line.model.ts`) | fehlt; Felder: `bookingKey`, `accountKey`, `debitAmount: MoneyModel`, `creditAmount: MoneyModel`, `amountFx: MoneyModel`, `exchangeRateKey`, `vatCodeKey`, `accountingTenantId` |
| **Beleg** | `DocumentModel` (`shared/models/document.model.ts`); Feature `document` | vorhanden; `type = 'accounting'`, `source = 'expense' \| 'accounting'` |
| **Periode** | `PeriodModel` — neu erstellen (`shared/models/period.model.ts`) | fehlt; Feature `finance/period` neu |
| **MWST-Code** | `VatCodeModel` — neu erstellen (`shared/models/vat-code.model.ts`) | fehlt; Feature `finance/vat-code` neu |
| **MWST-Satz (historisch)** | In `AccountingConfigModel` als Liste `vatRates: VatRateEntry[]` pro Jahr | fehlt; `VatRateEntry` als Interface (kein eigenes Modell nötig) |
| **Wechselkurs** | `ExchangeRateModel` — neu erstellen (`shared/models/exchange-rate.model.ts`); nutzt `CurrencyCode` aus `shared/models/money.model.ts` | fehlt; Cloud Function für SNB-Abruf |
| **Anlagegut** | `AssetModel` — neu erstellen (`shared/models/asset.model.ts`) | fehlt; Feature `finance/asset` neu |
| **Anlagekategorie** | `AssetCategoryModel` — neu erstellen (`shared/models/asset-category.model.ts`) | fehlt; Konfiguration via Kap. 3.8.5 |
| **Anlagenbewegung** | `AssetMovementModel` — neu erstellen (`shared/models/asset-movement.model.ts`) | fehlt |
| **Bankkonto (eigen)** | `AccountModel` (`shared/models/account.model.ts`) | vorhanden; `AccountModel.id` = IBAN, `type` für Verwendungszweck, `accountingTenantId` ergänzen |
| **Lieferant** | `OrgModel` (`shared/models/org.model.ts`) | vorhanden |
| **Lieferanten-Bankverbindung** | `AddressModel` (`shared/models/address.model.ts`) mit `addressChannel = 'bankaccount'` | vorhanden; `iban`, `streetName`, `zipCode`, `city`, `countryCode`, `isFavorite` |
| **Lieferantenrechnung** | `BillModel` (`shared/models/bill.model.ts`); Feature `finance/bill` | vorhanden; `accountingTenantId` ergänzen |
| **Debitorenrechnung** | `InvoiceModel` (`shared/models/invoice.model.ts`); Feature `finance/invoice` | vorhanden; `accountingTenantId`, `bookingKey`, `invoiceNo` ergänzen |
| **Rechnungsposition** | `InvoicePositionModel` (`shared/models/invoice-position.model.ts`) | vorhanden; `accountKey`, `vatCodeKey` ergänzen |
| **Zahlungsauftrag** | `PaymentOrderModel` — neu erstellen (`shared/models/payment-order.model.ts`) | fehlt; Felder: `messageId`, `status`, `debitAccountKey`, `executionDate`, `pain001Xml`, `accountingTenantId`; Feature `finance/payment` neu |
| **Zahlung** | `PaymentModel` — neu erstellen (`shared/models/payment.model.ts`) | fehlt; Felder: `paymentOrderKey`, `billKey`, `endToEndId`, `amount: MoneyModel`, `recipientIban`, `reference`, `status`, `reasonCode`, `accountingTenantId` |

### 5.2 Integritätsregeln

- Eine Buchung ist nur gültig, wenn die Summe Soll gleich Summe Haben ist (in funktionaler Währung).
- Eine abgeschlossene Periode (`PeriodModel.isLocked = true`) kann nicht mehr verändert werden.
- Belegnummern sind innerhalb eines Geschäftsjahres pro Buchhaltungs-Mandant eindeutig.
- `accountingTenantId` ist auf allen Buchhaltungsmodellen ein Pflichtfeld und darf nach der Erstellung nicht geändert werden.
- Kontenplan, Buchungen, Bankkonten und Konfiguration sind strikt nach `accountingTenantId` getrennt; ein mandantenübergreifender Zugriff ist nur für Wechselkurse zulässig.

---

## 6. Annahmen und Abhängigkeiten

- Verfügbarkeit eines Wechselkurs-API-Dienstes (SNB oder gleichwertig).
- Schweizer KMU-Kontenrahmen als Vorlage verfügbar (Lizenz prüfen).
- Anwender hat grundlegende Kenntnisse der doppelten Buchhaltung.
- Firebase-Tenant-Konfiguration (`defaultOrg`) ist pro Deployment konfiguriert.

---

## 7. Offene Punkte

- Mehrmandanten-Konsolidierung (konsolidierte Bilanz über mehrere Buchhaltungs-Mandanten): Folgeprojekt.
- Kostenrechnung (Kostenstellen, Kostenträger): Folgeprojekt.
- EBICS-Direktanbindung: Folgeprojekt; Ausbaustufe (T, T+S, TS) noch offen.
- Anbindung an digitale Lieferantenrechnungs-Plattformen (eBill, Peppol BIS Billing 3.0): Folgeprojekt.
- Spesenabrechnung (`ExpenseModel`-Integration): separate Spezifikation; `document.source = 'expense'` ist bereits vorgesehen.
- Sozialabgaben-Konfiguration (Kap. 3.8.7): separate Spezifikation, sobald Lohnbuchhaltung in den Scope aufgenommen.
- Ausgehende QR-Rechnungen (Debitorenmodul): in Kap. 3.7 aufgenommen.
- Rechnungsvorlagen (Layout, Logo) für PDF-Generierung: detailliertes Design noch ausstehend.
- Migration `journallogs` → `bookings` und Rename `BookingJournalModel` → `BookingModel`: vor Implementierungsbeginn durchführen.
