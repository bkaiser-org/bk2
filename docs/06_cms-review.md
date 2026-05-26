# CMS Implementation Review — `cms/menu`, `cms/page`, `cms/section`

**Datum:** 2026-05-25  
**Reviewer:** Claude Sonnet 4.6  
**Scope:** `libs/cms/menu/`, `libs/cms/page/`, `libs/cms/section/`

---

## Gesamtbewertung

Die Architektur ist **solide und konsistent**. Das 4-Layer-Muster (data-access / feature / ui / util), NgRx Signal Stores, Dispatcher-Pattern und Discriminated Union Types für Sections sind gut durchgehalten. Die Implementierung ist deutlich weiter fortgeschritten als ein typisches MVP.

---

## Stärken

### Architektur
- **Dispatcher-Pattern** (`PageDispatcher`, `SectionDispatcher`) ist sauber: ein Eintrittspunkt pro Entity-Typ, `@defer` für schwere Komponenten (calendar, chart, orgchart).
- **Discriminated Union Types** für `SectionModel` sind typsicher, und `narrowSection()` + `createSection()` sind konsistente Factory/Guard-Helfer.
- **4-Layer-Trennung** (data-access → feature → ui → util) ist in allen drei Domains konsistent eingehalten.
- **Soft Deletes** (archivieren statt löschen) in allen Services — gute Entscheidung für Audit-Trail.
- **rxResource + combineLatest** im `PageStore` für Live-Updates von Page + Sections ist korrekt umgesetzt.

### i18n
- Vollständig store-driven via `I18nService.translateAll`, kein `TranslatePipe` für statische Keys — konform mit dem Pattern in CLAUDE.md.

### Forms
- Vest-Validierungen sind pro Section-Typ aufgeteilt (22+ separate Validierungsdateien). Das ist wartbar.
- `dirty + valid` Signals für die "ChangeConfirmation"-UI ist ein gutes UX-Pattern.

---

## Findings — Probleme & Lücken

### HIGH — Fehlende Funktionalität

**1. Calendar & Chart: keine Edit-UI**  
In `libs/cms/section/ui/src/lib/section.form.ts` sind die Cases `cal` und `chart` leer (nur Kommentare). Nutzer können Calendar- und Chart-Sections nur anzeigen, nicht konfigurieren.

**2. Files & Links: unvollständig**  
`FilesSection` und `LinksSection` sind im Modell definiert, aber:
- Keine Feature-Komponenten
- Nicht im `SectionDispatcher` gelistet
- Kein `createSection()`-Case

→ Diese Types existieren nur auf dem Papier.

**3. Export-Methoden sind Stubs**
```typescript
// page.store.ts & section.store.ts
async export(type: string) { console.log(...'not yet implemented'); }
```
Beide Stores haben `export()` als Placeholder ohne Implementierung.

**4. Kein Error State in den Stores**  
Keine `isError`-/`error`-Signals in `MenuStore`, `PageStore`, `SectionStore`. Wenn eine Firestore-Operation fehlschlägt, gibt es kein UI-Feedback für den Nutzer.

---

### MEDIUM — Qualitätsprobleme

**5. Fehlende Tests — kritisch**  
Nur 3 `.spec.ts`-Dateien (je eine in `menu/util`, `page/util`, `section/util`). Keine Tests für:
- Services (`MenuService`, `PageService`, `SectionService`)
- Stores (`MenuStore`, `PageStore`, `SectionStore`)
- Forms und Validierungen
- Section-Komponenten

Bei 139 Dateien und 23 Section-Typen ist das Risiko für Regressionen hoch.

**6. Keine Paginierung**  
`SectionService.searchByKeys()`, `PageList`, `MenuList` und `SectionAllList` laden immer alle Items. Mit wachsenden Datenmengen ist das ein Performance-Problem.

**7. Kein Schutz gegen zirkuläre Menü-Referenzen**  
Die `Menu`-Komponente rendert Sub-Menüs rekursiv ohne Tiefenlimit. Eine zirkuläre Referenz im Datenmodell führt zu einem Stack Overflow.

**8. `SectionForm` hat keine Vest-Validierung**  
`MenuForm` und `PageForm` verwenden Vest-Suites, aber `SectionForm` nicht — das ist inkonsistent. Die Section-Validierungen in `util/` werden in der Form nicht genutzt.

**9. Fehlende Loading Skeletons**  
Während Firestore-Daten laden (`isLoading`-Signal ist vorhanden), gibt es keine Skeleton-UI — nur ein leerer Zustand.

---

### LOW — Verbesserungspotenzial

**10. Suchindex-Qualität begrenzt**
```
menuIndex:   'n:name a:action k:bkey'
pageIndex:   'n:name k:bkey'
sectionIndex: 'n:name t:type'
```
Kein Volltext-Search, keine Fuzzy-Suche über `title`, `subTitle` oder `content`.

**11. Section-Typen `member-age` / `member-cat`**  
Stores und Komponenten existieren, aber keine Edit-Konfigurationskomponenten. Nur read-only.

**12. RAG-Section ohne Konfiguration**  
`RagSectionComponent` referenziert `model='gemini-3-flash-preview'` hardcoded. Kein Edit-UI. Wirkt wie Proof-of-Concept-Status.

**13. Blog-Layouts**  
`BlogLayoutType` (minimal/grid/classic/magazine/bento/stream) ist im Modell definiert, aber Status der 6 Layout-Varianten unklar.

**14. Magic String `@VERSION@` in `menu.store.ts`**  
`@VERSION@`-Replacement ist ein einfaches `String.replace` im Store. Besser wäre eine klare Konvention/Dokumentation oder ein dediziertes Token.

---

## Priorisierte Empfehlungen

| Priorität | Aktion |
|-----------|--------|
| HIGH | Error State (`isError`, `errorMessage`) in alle drei Stores |
| HIGH | Calendar- und Chart-Configuration-Komponenten implementieren |
| HIGH | Files & Links Section vollständig implementieren oder aus dem Modell entfernen |
| MEDIUM | Unit Tests für Services und Stores (mindestens Happy Path) |
| MEDIUM | Vest-Validierung in `SectionForm` einbinden (analog zu `MenuForm`) |
| MEDIUM | Paginierung oder Virtual Scrolling für Listen |
| MEDIUM | Zirkulären-Referenz-Schutz in der Menu-Komponente |
| LOW | Export-Implementierung (JSON / CSV) |
| LOW | Loading Skeletons |
| LOW | Volltext-Suchindex auf `title` und `content` erweitern |

---

## Statistik

| Metrik | Anzahl |
|--------|--------|
| CMS-Dateien gesamt | ~139 |
| Section-Typen im Modell | 23 |
| Davon vollständig implementiert | ~18 |
| Davon unvollständig/fehlend | ~5 (calendar edit, chart edit, files, links, rag config) |
| Test-Dateien | 3 |
| Stores mit Error-Handling | 0 |
