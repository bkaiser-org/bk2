# Spezifikation: Expense-Feature

**Version:** 1.0 **Datum:** 25\. Mai 2026 **Status:** Entwurf **Bezug:** Erweiterungsmodul zum Buchhaltungs-System (siehe Hauptspezifikation)

---

## 1\. Überblick

Das Expense-Feature erlaubt es Mitarbeitenden, Auslagen (Spesen, ausgelegte Rechnungen) mit Belegen einzureichen. Das System erfasst die wichtigsten Daten manuell, liest die Belege per OCR aus, validiert die Eingaben gegen die ausgelesenen Werte und erzeugt im Erfolgsfall automatisch eine Buchung im Buchhaltungssystem.

### 1.1 Zielsetzung

- Schnelle, mobile Erfassung von Auslagen mit minimalem Aufwand.  
- Hohe Datenqualität durch OCR-gestützte Validierung.  
- Nahtlose Integration in die doppelte Buchhaltung.  
- Speicherung der IBAN als wiederverwendbare Bankverbindung im Benutzerprofil.

### 1.2 Abgrenzung

- Kein eigenes Genehmigungs-Workflow-Modul in dieser Iteration (offener Punkt, siehe Kapitel 9).  
- Keine Reisekostenabrechnung mit Pauschalen (Kilometergeld, Tagespauschalen) – Folgeprojekt.  
- Keine Kreditkartenintegration in dieser Iteration.

---

## 2\. Akteure und Rollen

| Rolle | Berechtigungen |
| :---- | :---- |
| Mitarbeiter (Erfasser) | Eigene Expenses erfassen, eigene Belege hochladen, eigene IBANs verwalten |
| Buchhalter | Alle Expenses einsehen, OCR-Ergebnisse prüfen, Buchungen kontrollieren |
| Administrator | Konfiguration: Standard-Konten, OCR-Anbieter, Toleranzgrenzen |

---

## 3\. Funktionale Anforderungen

### 3.1 Formularfelder

Das Erfassungsformular enthält die folgenden Pflichtfelder:

| Feld | Typ | Validierung | Bemerkung |
| :---- | :---- | :---- | :---- |
| `abstract` | String (max. 200 Zeichen) | Nicht leer, min. 3 Zeichen | Betreff / kurze Beschreibung |
| `gesamtbetrag` | Decimal(12,2) | \> 0, max. 9'999'999.99 | Inkl. MWST, in Originalwährung |
| `waehrung` | ISO-4217-Code | Whitelist erlaubter Währungen | Default: CHF |
| `iban` | String | IBAN-Prüfziffer (MOD-97), Format pro Land | Vorschlag: Favoriten-IBAN aus Profil |
| `belege` | Datei-Upload (1..n) | PDF, JPG, PNG, HEIC; max. 20 MB pro Datei; max. 10 Dateien | Mindestens ein Beleg erforderlich |

Optionale Felder:

| Feld | Typ | Bemerkung |
| :---- | :---- | :---- |
| `kategorie` | Auswahl | z.B. Reise, Verpflegung, Material; mappt auf Aufwandskonto |
| `kostenstelle` | Auswahl | Sofern Kostenstellen aktiv |
| `notiz` | Text | Interner Kommentar |

### 3.2 IBAN-Behandlung

#### 3.2.1 Vorschlag aus Profil

- Beim Öffnen des Formulars wird die als `favorite` markierte IBAN aus den Profil-Adressen des angemeldeten Benutzers vorausgefüllt.  
- Ein Dropdown bietet alle weiteren gespeicherten IBANs des Benutzers an.  
- Über "+ Neue IBAN" kann eine neue IBAN eingegeben werden.

#### 3.2.2 Speicherung als Profil-Adresse

- Beim Klick auf "OK" wird die IBAN im Profil des Benutzers als Adresse mit `type = bankaccount` gespeichert, sofern sie dort noch nicht existiert.  
- Eindeutigkeit pro Benutzer: gleiche IBAN wird nicht doppelt gespeichert (Normalisierung: Whitespace entfernen, Grossbuchstaben).  
- Erste IBAN des Benutzers wird automatisch als `favorite = true` markiert.  
- Bei nachfolgenden IBANs bleibt die bestehende Favoriten-Markierung erhalten, ausser der Benutzer ändert sie explizit.

#### 3.2.3 Datenmodell Profil-Adresse

ProfileAddress {

  id: UUID

  user\_id: UUID

  type: enum {postal, email, phone, bankaccount}

  value: string           // IBAN im normalisierten Format

  bic: string?            // optional, aus IBAN-Land ableitbar

  label: string?          // z.B. "Privatkonto UBS"

  is\_favorite: boolean

  created\_at: timestamp

  updated\_at: timestamp

}

### 3.3 Beleg-Upload

- Auswahl aus Dateisystem (Desktop) oder Aufnahme via Kamera (Mobile).  
- Mehrfach-Upload (mehrere Belege pro Expense, z.B. Rechnung \+ Quittung).  
- Sofortige Vorschau (Thumbnail) im Formular mit Möglichkeit zum Entfernen vor dem Absenden.  
- Speicherung im Dokumentenspeicher mit eindeutiger Referenz; Verknüpfung zur späteren Buchung.

### 3.4 Verarbeitung beim Klick auf "OK"

Die Verarbeitung erfolgt in dieser Reihenfolge. Bei einem Fehler in einem Schritt werden die nachfolgenden Schritte nicht ausgeführt, bereits erfolgte Schritte werden in einer Transaktion zurückgerollt (siehe Kapitel 5).

#### Schritt 1: Formularvalidierung (clientseitig \+ serverseitig)

- Pflichtfelder gefüllt, IBAN-Prüfziffer korrekt, Betrag \> 0, mindestens ein Beleg.  
- Bei Fehler: Inline-Fehlermeldungen am jeweiligen Feld, kein Submit.

#### Schritt 2: IBAN im Profil speichern

- Prüfung, ob die IBAN bereits als `ProfileAddress` mit `type = bankaccount` existiert.  
- Falls nein: Neuer Eintrag wird erstellt.  
- Falls ja: Bestehender Eintrag bleibt unverändert (kein Update von `label` oder `is_favorite`).

#### Schritt 3: Dokumente hochladen

- Upload aller Belege in den Dokumentenspeicher.  
- Jeder Beleg erhält eine eindeutige `document_id` und einen Content-Hash (SHA-256) zur Duplikatserkennung.  
- Metadaten: Dateiname, Mime-Type, Grösse, Upload-Zeitpunkt, Benutzer.

#### Schritt 4: OCR-Auslesung

Aus den Belegen werden folgende Felder extrahiert:

| Feld | Quelle | Bemerkung |
| :---- | :---- | :---- |
| `rechnungsdatum` | OCR | Datum der Rechnungsstellung; bei Quittungen Verkaufsdatum |
| `rechnungsbetrag` | OCR | Bruttobetrag inkl. MWST je Beleg |
| `betreff_ocr` | OCR | Lieferant/Geschäft \+ ggf. Rechnungsnummer |
| `mwst_betrag` | OCR (optional) | Für spätere MWST-Verbuchung |
| `mwst_satz` | OCR (optional) | Wenn auf dem Beleg erkennbar |
| `waehrung_ocr` | OCR | Falls abweichend von Formular |

- Bei mehreren Belegen wird pro Beleg ausgelesen; die einzelnen `rechnungsbetrag`\-Werte werden summiert.  
- Vertrauenswert (`confidence`) pro Feld wird gespeichert; Werte unter einem konfigurierbaren Schwellwert (Default: 0.7) werden zur manuellen Prüfung markiert.

#### Schritt 5: Betrags-Validierung

- Berechnung: `sum_belege = Σ rechnungsbetrag aller Belege`  
- Vergleich mit dem im Formular eingegebenen `gesamtbetrag`.  
- **Toleranz:** ± CHF 0.05 pro Beleg (Rundungsdifferenzen), konfigurierbar.  
- Bei Differenz **innerhalb** der Toleranz: Verarbeitung läuft weiter; die Differenz wird auf einem Rundungsdifferenz-Konto gebucht.  
- Bei Differenz **ausserhalb** der Toleranz: Fehler wird zurückgegeben (siehe 3.5).

#### Schritt 6: Buchung in der Buchhaltung erzeugen

Die Buchung wird gemäss den Regeln der Hauptspezifikation (doppelte Buchhaltung, MWST, Multi-Currency) erzeugt:

| Soll | Haben | Betrag | Bemerkung |
| :---- | :---- | :---- | :---- |
| Aufwandskonto (aus Kategorie oder Standard) | Verbindlichkeiten gegenüber Mitarbeiter | Netto-Betrag | Aufwandsbuchung |
| Vorsteuer-Konto | Verbindlichkeiten gegenüber Mitarbeiter | MWST-Betrag | Falls MWST ausgewiesen |

- Buchungsdatum: Heutiges Datum (Erfassungsdatum). Belegdatum aus OCR wird im Buchungstext referenziert.  
- Belegnummer: Automatisch vergeben nach Mandanten-Konfiguration.  
- Buchungstext: `[abstract] – [Lieferant aus OCR] – [Rechnungsdatum]`.  
- Alle Belege (Schritt 3\) werden als Beleg-Anhänge der Buchung verknüpft (1:n).  
- Buchung erhält Status `Entwurf` und wartet auf Freigabe durch Buchhalter (sofern Vier-Augen-Prinzip aktiv), sonst direkt `gebucht`.

### 3.5 Fehlerbehandlung

| Fehler | Verhalten |
| :---- | :---- |
| Formularvalidierung | Inline-Fehler am Feld; Submit blockiert |
| IBAN-Prüfziffer ungültig | Inline-Fehler; Submit blockiert |
| Upload fehlgeschlagen (Netz, zu gross) | Dialog mit Retry-Option; partielle Uploads werden verworfen |
| OCR-Service nicht erreichbar | Warnung; Benutzer kann Felder manuell eintragen und erneut absenden, oder als "OCR pending" speichern |
| Betragsdifferenz ausserhalb Toleranz | Modal-Dialog mit Detailaufstellung: Formularbetrag vs. Summe Belege, Differenz, Auflistung pro Beleg. Optionen: "Formular korrigieren", "Belege erneut hochladen", "Manuell überstimmen mit Begründung" (nur für Buchhalter-Rolle) |
| Buchungserstellung fehlschlägt | Transaktions-Rollback (siehe Kapitel 5); Benutzer erhält Fehlermeldung mit Support-Referenz |

---

## 4\. GUI-Vorschlag

### 4.1 Wireframe

\<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 880" font-family="system-ui, sans-serif" font-size="13"\>

  \<defs\>

    \<style\>

      .frame { fill: \#fafafa; stroke: \#333; stroke-width: 1.5; }

      .header { fill: \#2c3e50; }

      .header-text { fill: white; font-size: 16px; font-weight: 600; }

      .label { fill: \#555; font-size: 12px; font-weight: 500; }

      .field { fill: white; stroke: \#bbb; stroke-width: 1; }

      .field-required { stroke: \#2c3e50; stroke-width: 1.5; }

      .field-text { fill: \#999; font-style: italic; }

      .field-value { fill: \#222; }

      .button-primary { fill: \#2c3e50; }

      .button-secondary { fill: white; stroke: \#2c3e50; stroke-width: 1.5; }

      .button-text-primary { fill: white; font-weight: 600; }

      .button-text-secondary { fill: \#2c3e50; font-weight: 600; }

      .helper { fill: \#777; font-size: 11px; }

      .star { fill: \#f39c12; }

      .upload-zone { fill: \#f0f0f0; stroke: \#888; stroke-width: 1.5; stroke-dasharray: 6 4; }

      .thumbnail { fill: white; stroke: \#bbb; }

      .badge { fill: \#27ae60; }

      .badge-text { fill: white; font-size: 10px; font-weight: 600; }

      .required-mark { fill: \#c0392b; font-weight: 700; }

    \</style\>

  \</defs\>

  \<\!-- App frame \--\>

  \<rect x="20" y="20" width="680" height="840" rx="12" class="frame"/\>

  \<\!-- Header \--\>

  \<rect x="20" y="20" width="680" height="56" rx="12" class="header"/\>

  \<rect x="20" y="56" width="680" height="20" class="header"/\>

  \<text x="44" y="54" class="header-text"\>Neue Auslage erfassen\</text\>

  \<text x="660" y="54" class="header-text" text-anchor="end"\>✕\</text\>

  \<\!-- Form body \--\>

  \<\!-- abstract \--\>

  \<text x="44" y="110" class="label"\>Betreff \<tspan class="required-mark"\>\*\</tspan\>\</text\>

  \<rect x="44" y="118" width="632" height="36" rx="4" class="field field-required"/\>

  \<text x="56" y="141" class="field-text"\>z.B. Geschäftsessen Kunde XY, Zürich\</text\>

  \<\!-- Betrag \+ Währung \--\>

  \<text x="44" y="180" class="label"\>Gesamtbetrag \<tspan class="required-mark"\>\*\</tspan\>\</text\>

  \<rect x="44" y="188" width="460" height="36" rx="4" class="field field-required"/\>

  \<text x="56" y="211" class="field-text"\>0.00\</text\>

  \<text x="514" y="180" class="label"\>Währung\</text\>

  \<rect x="514" y="188" width="162" height="36" rx="4" class="field"/\>

  \<text x="526" y="211" class="field-value"\>CHF ▾\</text\>

  \<\!-- IBAN \--\>

  \<text x="44" y="250" class="label"\>IBAN \<tspan class="required-mark"\>\*\</tspan\>\</text\>

  \<rect x="44" y="258" width="632" height="36" rx="4" class="field field-required"/\>

  \<text x="56" y="281" class="field-value"\>CH93 0076 2011 6238 5295 7\</text\>

  \<circle cx="640" cy="276" r="9" class="star"/\>

  \<text x="640" y="280" text-anchor="middle" fill="white" font-size="11" font-weight="700"\>★\</text\>

  \<text x="44" y="310" class="helper"\>Favorit aus Profil. ▾ Andere IBAN wählen   ·   \+ Neue IBAN eingeben\</text\>

  \<\!-- Kategorie \--\>

  \<text x="44" y="346" class="label"\>Kategorie\</text\>

  \<rect x="44" y="354" width="316" height="36" rx="4" class="field"/\>

  \<text x="56" y="377" class="field-value"\>Verpflegung ▾\</text\>

  \<\!-- Kostenstelle \--\>

  \<text x="376" y="346" class="label"\>Kostenstelle\</text\>

  \<rect x="376" y="354" width="300" height="36" rx="4" class="field"/\>

  \<text x="388" y="377" class="field-value"\>— optional — ▾\</text\>

  \<\!-- Belege Upload \--\>

  \<text x="44" y="420" class="label"\>Belege \<tspan class="required-mark"\>\*\</tspan\>\</text\>

  \<rect x="44" y="428" width="632" height="140" rx="6" class="upload-zone"/\>

  \<text x="360" y="478" text-anchor="middle" fill="\#555" font-size="14" font-weight="600"\>📎 Belege hochladen\</text\>

  \<text x="360" y="500" text-anchor="middle" class="helper"\>Foto aufnehmen · Datei wählen · per Drag \&amp; Drop ablegen\</text\>

  \<text x="360" y="518" text-anchor="middle" class="helper"\>PDF, JPG, PNG, HEIC – max. 20 MB pro Datei\</text\>

  \<\!-- Thumbnails (Beispielzustand mit zwei Belegen) \--\>

  \<g transform="translate(60, 540)"\>

    \<rect width="60" height="76" rx="4" class="thumbnail"/\>

    \<text x="30" y="42" text-anchor="middle" font-size="20"\>📄\</text\>

    \<text x="30" y="60" text-anchor="middle" font-size="9" fill="\#555"\>restaurant.pdf\</text\>

    \<circle cx="56" cy="6" r="8" fill="\#c0392b"/\>

    \<text x="56" y="10" text-anchor="middle" fill="white" font-size="10" font-weight="700"\>×\</text\>

  \</g\>

  \<g transform="translate(132, 540)"\>

    \<rect width="60" height="76" rx="4" class="thumbnail"/\>

    \<text x="30" y="42" text-anchor="middle" font-size="20"\>🧾\</text\>

    \<text x="30" y="60" text-anchor="middle" font-size="9" fill="\#555"\>taxi.jpg\</text\>

    \<circle cx="56" cy="6" r="8" fill="\#c0392b"/\>

    \<text x="56" y="10" text-anchor="middle" fill="white" font-size="10" font-weight="700"\>×\</text\>

  \</g\>

  \<\!-- Notiz \--\>

  \<text x="44" y="660" class="label"\>Notiz\</text\>

  \<rect x="44" y="668" width="632" height="60" rx="4" class="field"/\>

  \<text x="56" y="691" class="field-text"\>Interner Kommentar (optional)\</text\>

  \<\!-- Hinweisbox \--\>

  \<rect x="44" y="748" width="632" height="36" rx="4" fill="\#fef9e7" stroke="\#f1c40f" stroke-width="1"/\>

  \<text x="56" y="770" fill="\#7d6608" font-size="11"\>ℹ Beleg-Daten werden nach dem Absenden automatisch ausgelesen und mit dem Gesamtbetrag abgeglichen.\</text\>

  \<\!-- Buttons \--\>

  \<rect x="44" y="804" width="160" height="40" rx="4" class="button-secondary"/\>

  \<text x="124" y="829" text-anchor="middle" class="button-text-secondary"\>Abbrechen\</text\>

  \<rect x="516" y="804" width="160" height="40" rx="4" class="button-primary"/\>

  \<text x="596" y="829" text-anchor="middle" class="button-text-primary"\>OK – Einreichen\</text\>

\</svg\>

### 4.2 Verhalten im Detail

**Layout-Prinzipien**

- Single-Column-Layout für mobile Tauglichkeit; auf Desktop bis 720 px breit.  
- Pflichtfelder sind mit `*` und einem stärkeren Rahmen markiert.  
- Primärer Action-Button ("OK – Einreichen") rechts unten, sekundärer ("Abbrechen") links unten.

**IBAN-Feld**

- Bei Fokus erscheint ein Dropdown mit den gespeicherten IBANs des Benutzers, Favorit oben markiert mit ★.  
- Der Stern-Indikator zeigt an, dass die aktuell angezeigte IBAN der Favorit ist.  
- Eingabe-Hilfe: Automatische Formatierung mit Leerzeichen alle 4 Stellen, Grossbuchstaben.  
- Bei manueller Eingabe einer neuen IBAN: Validierung in Echtzeit; bei Erfolg ein Hinweis "Wird beim Absenden im Profil gespeichert".

**Beleg-Upload-Zone**

- Drag-&-Drop-Bereich mit deutlicher Beschriftung und Icon.  
- Auf Mobile: Buttons "Foto aufnehmen" und "Datei wählen" sichtbar.  
- Hochgeladene Belege erscheinen als Thumbnails mit Dateiname und Löschen-Button (×).  
- Während des Uploads: Fortschrittsbalken pro Datei.

**Nach Klick auf "OK"**

1. Button geht in Lade-Zustand ("Wird verarbeitet…"), Formular ist gesperrt.  
2. Status-Anzeige unter dem Button: "1/4 IBAN gespeichert", "2/4 Belege hochgeladen", "3/4 Daten werden ausgelesen", "4/4 Buchung wird erstellt".  
3. Bei Erfolg: Erfolgs-Toast "Auslage eingereicht – Buchung BL-2026-0451 erstellt", Formular schliesst.  
4. Bei Betragsdifferenz: Modal-Dialog mit Detail-Aufstellung (siehe 4.3).

### 4.3 Modal-Dialog "Betragsdifferenz"

┌─────────────────────────────────────────────────────┐

│  ⚠  Betragsdifferenz festgestellt                   │

├─────────────────────────────────────────────────────┤

│                                                     │

│  Im Formular angegeben:        CHF   142.50         │

│                                                     │

│  Aus Belegen ausgelesen:                            │

│    restaurant.pdf              CHF    95.00         │

│    taxi.jpg                    CHF    32.50         │

│  ─────────────────────────────────────────          │

│  Summe Belege:                 CHF   127.50         │

│                                                     │

│  Differenz:                    CHF    15.00         │

│  (ausserhalb Toleranz ± CHF 0.05)                   │

│                                                     │

│  Was möchten Sie tun?                               │

│                                                     │

│  \[ Formular korrigieren \]  \[ Belege erneut prüfen \] │

│                                                     │

└─────────────────────────────────────────────────────┘

---

## 5\. Transaktionalität

Die vier Schritte (IBAN speichern, Dokumente hochladen, OCR \+ Validierung, Buchung erstellen) müssen als **atomare Einheit** behandelt werden. Bei Fehler in einem Schritt:

| Schritt | Rollback-Aktion |
| :---- | :---- |
| IBAN gespeichert | Eintrag in `ProfileAddress` wird wieder gelöscht, falls neu erstellt |
| Belege hochgeladen | Dateien werden aus dem Dokumentenspeicher entfernt |
| OCR durchgeführt | OCR-Ergebnisse werden verworfen |
| Buchung erstellt | Buchung wird storniert (Gegenbuchung) gemäss Hauptspezifikation 3.1.1 |

Empfohlene Umsetzung: Saga-Pattern mit Kompensationsaktionen, da Dokumentenspeicher und OCR-Service typischerweise nicht innerhalb einer Datenbank-Transaktion liegen.

---

## 6\. Datenmodell (Erweiterung)

Expense {

  id: UUID

  user\_id: UUID

  abstract: string

  amount\_total: decimal(12,2)

  currency: string(3)

  iban: string

  category: string?

  cost\_center\_id: UUID?

  note: text?

  status: enum {draft, processing, validated, error, posted}

  booking\_id: UUID?           // Verweis auf erstellte Buchung

  created\_at: timestamp

  updated\_at: timestamp

}

ExpenseDocument {

  id: UUID

  expense\_id: UUID

  document\_id: UUID           // Verweis auf Dokumentenspeicher

  ocr\_invoice\_date: date?

  ocr\_amount: decimal(12,2)?

  ocr\_subject: string?

  ocr\_vat\_amount: decimal(12,2)?

  ocr\_vat\_rate: decimal(5,2)?

  ocr\_currency: string(3)?

  ocr\_confidence: decimal(3,2)?

  ocr\_status: enum {pending, completed, failed, manual}

}

Verknüpfungen:

- `Expense.booking_id` → `Buchung.id` (Hauptspezifikation 5.1)  
- `ExpenseDocument.document_id` → `Beleg.id` (Hauptspezifikation 3.1.3)  
- `Expense.user_id` → `User.id`  
- `ProfileAddress.user_id` → `User.id` (siehe 3.2.3)

---

## 7\. Nichtfunktionale Anforderungen

| Aspekt | Anforderung |
| :---- | :---- |
| Mobile First | Formular voll bedienbar auf Smartphones (iOS Safari, Android Chrome) |
| Performance | Formular-Submit bis Bestätigung: unter 8 Sekunden inkl. OCR (95. Perzentil) |
| Offline-Fähigkeit | Erfasste, aber nicht abgesendete Expenses werden lokal zwischengespeichert |
| OCR-Anbieter | Austauschbar via Adapter-Pattern (z.B. AWS Textract, Google Document AI, Azure Form Recognizer) |
| Datenschutz | Belege werden verschlüsselt gespeichert; OCR-Anbieter mit Hosting in der Schweiz oder EWR bevorzugt |
| Audit-Trail | Jede Aktion (Erfassung, OCR-Ergebnis, manuelle Korrektur) wird mit Benutzer und Zeitstempel protokolliert |

---

## 8\. Akzeptanzkriterien

1. Ein Benutzer kann das Formular mit allen Pflichtfeldern ausfüllen, einen Beleg hochladen und absenden.  
2. Bei Absenden wird die im Formular eingegebene IBAN in `ProfileAddress` mit `type = bankaccount` gespeichert (sofern neu).  
3. Die hochgeladenen Belege werden im Dokumentenspeicher persistiert und sind über die erstellte Buchung referenzierbar.  
4. Aus dem Beleg werden Rechnungsdatum, Rechnungsbetrag und Betreff per OCR ausgelesen und sichtbar gespeichert.  
5. Wenn die Summe der ausgelesenen Rechnungsbeträge nicht mit dem Gesamtbetrag übereinstimmt (ausserhalb Toleranz), wird der Vorgang abgebrochen und ein Fehler-Dialog angezeigt.  
6. Im Erfolgsfall existiert eine Buchung im Hauptbuch, die die Belege als Anhang referenziert und korrekt gegen die definierten Konten gebucht ist.  
7. Bei Fehler in einem der Verarbeitungsschritte wird der Gesamtvorgang zurückgerollt; es bleibt kein inkonsistenter Zwischenzustand.

---

## 9\. Offene Punkte

- Genehmigungs-Workflow: Soll vor Erstellung der Buchung eine Freigabe durch Vorgesetzte erforderlich sein?  
- Auszahlung an den Mitarbeiter: Soll aus der Verbindlichkeit automatisch eine Zahlung (pain.001, siehe Hauptspez. 3.6) erzeugt werden?  
- MWST-Behandlung bei Auslandsbelegen ohne Schweizer MWST: Welche Default-Behandlung?  
- Mehrere Währungen in einem einzelnen Expense (z.B. Beleg in EUR, Betrag im Formular in CHF)?  
- OCR-Lernschleife: Sollen manuelle Korrekturen zur Verbesserung der OCR-Erkennung genutzt werden?  
- Verhalten bei Duplikat-Erkennung (gleicher Beleg-Hash): Warnung oder Blockierung?

