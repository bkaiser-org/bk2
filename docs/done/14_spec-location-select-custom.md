# Spec: LocationSelect – Freitext-Strecke („Andere Strecke")

**Status:** Draft · **Scope:** `LocationSelectModal` + `LocationSelectStore`
**Kontext:** „Neue Fahrt erfassen" → Zielort. Erweitert die bestehende Orts-Auswahl
um eine optionale Freitext-Eingabe (Variante C: Suchfeld dient gleichzeitig als
Filter und als Freitext-Wert).

---

## 1. Ziel

Der User kann im `LocationSelectModal` neben den vordefinierten `LocationModel`-
Einträgen eine **frei beschriebene Strecke** erfassen, wenn das Ziel nicht in der
Liste steht. Die Freitext-Zeile erscheint als erster Eintrag in der Trefferliste
und übernimmt den (normalisierten) Suchbegriff als Streckenbezeichnung.

Das Feature ist **opt-in** und wird pro Modal-Aufruf über einen Konfig-Parameter
aktiviert. Ohne Aktivierung bleibt das Modal unverändert.

---

## 2. Konfiguration

| Parameter | Typ | Default | Beschreibung |
|---|---|---|---|
| `allowCustom` | `boolean` | `false` | Aktiviert den Freitext-Modus. |
| `MIN_CUSTOM_SEARCH_LENGTH` | `const number` | `4` | Mindestlänge des **normalisierten** Suchbegriffs, ab der die Freitext-Zeile erscheint. |

`MIN_CUSTOM_SEARCH_LENGTH` ist eine modulweite Konstante (kein Input). Der Aufruf
für das Logbuch/Fahrt-Formular setzt `allowCustom = true`; alle anderen Aufrufer
bleiben durch den Default unverändert.

---

## 3. Verhalten

### 3.1 Normalisierung

Vor jedem Vergleich und vor der Übernahme wird der Suchbegriff normalisiert:

```ts
// nur Whitespace zusammenfassen, Original-Casing erhalten (Anzeige-/Speicherwert)
function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

// zusätzlich lowercase (nur für Vergleiche)
function normalizeForCompare(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}
```

- `"Brünishusen  via   Insel "` → Anzeige `"Brünishusen via Insel"`.
- Die Mindestlänge prüft die Länge **nach** `normalizeWhitespace`, damit reine
  Leerzeichen nicht zählen.

### 3.2 Entscheidungslogik (drei Fälle)

Sei `q = normalizeWhitespace(searchTerm)` und
`hasExact = locations.some(l => normalizeForCompare(l.name) === normalizeForCompare(q))`.

| Fall | Bedingung | Freitext-Zeile | Liste |
|---|---|---|---|
| **Kein/Teil-Treffer** | `allowCustom && q.length ≥ 4 && !hasExact` | sichtbar (oben) | gefilterte Treffer darunter |
| **Exakter Treffer** | `hasExact` | **unterdrückt** | exakter Treffer wird angeboten |
| **Zu kurz / inaktiv** | `q.length < 4` oder `!allowCustom` | nicht sichtbar | unverändert |

**Wichtig:** Ein exakter Treffer kann **nicht** als Freitext erzwungen werden.
Damit wird vermieden, dass eine custom-Strecke ohne `bkey`/`placeId` angelegt wird,
die namensgleich zu einem vordefinierten Ort ist (Duplikat, verlorene
Statistik-Verknüpfung). Der Vergleich ist case-insensitiv und whitespace-
normalisiert (`normalizeForCompare`).

### 3.3 Empty-State

Die bestehende `bk-empty-list` wird nur noch angezeigt, wenn **keine** gefilterten
Treffer **und keine** Freitext-Zeile vorhanden sind. Liegt eine Freitext-Zeile vor,
hat der User eine Aktion und sieht keinen leeren Zustand.

---

## 4. Rückgabe-Vertrag (Breaking Change)

`dismiss(...)` liefert künftig statt eines nackten `LocationModel` einen
diskriminierten Typ. Rolle bleibt `'confirm'`; bei Abbruch unverändert
`'cancel'`/`undefined`.

```ts
export type LocationSelectResult =
  | { kind: 'predefined'; location: LocationModel }
  | { kind: 'custom'; label: string };
```

- `predefined`: bestehender Pfad, `location` ist das gewählte `LocationModel`.
- `custom`: `label` ist `normalizeWhitespace(searchTerm)` (Original-Casing).

> **Aufrufer-Anpassung:** Das Fahrt-Formular muss das Ergebnis auf `kind` prüfen
> und in sein Zielort-Feld mappen (z. B. `placeId` + `label` vs. nur `label`).
> Aufrufer, die `allowCustom` nicht setzen, erhalten ausschliesslich
> `{ kind: 'predefined' }` und können den Custom-Zweig ignorieren.

---

## 5. Änderungen am Store (`location-select.store.ts`)

**State:**

```ts
export type LocationSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  type: string;
  allowCustom: boolean;        // neu
};

export const locationInitialState: LocationSelectState = {
  searchTerm: '',
  currentUser: undefined,
  type: 'logbuch',
  allowCustom: false,          // neu
};
```

**Computed** (in eigenem `withComputed`-Block nach `filteredLocations`, da
`showCustomEntry` auf `hasExactMatch` zugreift):

```ts
withComputed((store) => ({
  customLabel: computed(() => normalizeWhitespace(store.searchTerm())),
  hasExactMatch: computed(() => {
    const q = normalizeForCompare(store.searchTerm());
    return store.locations().some(l => normalizeForCompare(l.name) === q);
  }),
})),
withComputed((store) => ({
  showCustomEntry: computed(() => {
    const q = normalizeWhitespace(store.searchTerm());
    return store.allowCustom()
      && q.length >= MIN_CUSTOM_SEARCH_LENGTH
      && !store.hasExactMatch();
  }),
})),
```

**Method:**

```ts
setAllowCustom(allowCustom: boolean) {
  patchState(store, { allowCustom });
}
```

> Hinweis: `hasExactMatch` vergleicht gegen `location.name`, nicht gegen
> `location.index` (das die Filterung nutzt). Falls vordefinierte Orte je
> namensgleich auftreten könnten, stattdessen gegen `bkey` koppeln.

---

## 6. Änderungen am Modal (`location-select.modal.ts`)

**Input + Verdrahtung:**

```ts
public allowCustom = input<boolean>(false);

constructor() {
  effect(() => this.store.setType(this.type()));
  effect(() => this.store.setCurrentUser(this.currentUser()));
  effect(() => this.store.setAllowCustom(this.allowCustom()));   // neu
}
```

**Template** – Freitext-Zeile vor der Liste, Empty-State angepasst:

```html
@if(store.showCustomEntry()) {
  <ion-list lines="none">
    <ion-item class="item" color="light" (click)="selectCustom()">
      <ion-icon name="create-outline" slot="start" />
      <ion-label>
        <p>{{ store.i18n.location_custom_use() }}</p>
        <h3>„{{ store.customLabel() }}"</h3>
      </ion-label>
    </ion-item>
  </ion-list>
}

@if(selectedLocationsCount() === 0 && !store.showCustomEntry()) {
  <bk-empty-list [message]="store.i18n.location_empty()" />
} @else {
  @for(location of filteredLocations(); track $index) { … unverändert … }
}
```

**Select-Methoden:**

```ts
public select(location: LocationModel): Promise<boolean> {
  return this.modalController.dismiss(
    { kind: 'predefined', location } satisfies LocationSelectResult, 'confirm');
}

public selectCustom(): Promise<boolean> {
  return this.modalController.dismiss(
    { kind: 'custom', label: this.store.customLabel() } satisfies LocationSelectResult, 'confirm');
}
```

---

## 7. i18n

Neue Keys in `select-i18n` (`LOCATION_SELECT_I18N_KEYS` + `LocationSelectI18n`):

| Key | DE (Vorschlag) |
|---|---|
| `location_custom_use` | „Andere Strecke verwenden" |

(Der eigentliche Streckenname kommt aus `customLabel`, nicht aus i18n.)

---

## 8. Validierung / Edge Cases

- Leerer oder reiner Whitespace-Begriff → `customLabel = ''`, Länge `0 < 4` →
  keine Freitext-Zeile.
- Trailing/Multiple Whitespace zählt nicht zur Mindestlänge (Normalisierung vor
  Längenprüfung).
- Exakter Treffer (case-insensitiv, whitespace-normalisiert) unterdrückt die
  Freitext-Zeile kompromisslos – kein „trotzdem erzwingen".
- `allowCustom = false` ⇒ Verhalten 1:1 wie bisher, Rückgabe immer
  `{ kind: 'predefined' }`.

---

## 9. Offen

- Sollen häufig genutzte Freitext-Strecken später als „zuletzt verwendet"
  gecacht oder per PIN in die `locations`-Collection promotet werden? (out of
  scope für diese Spec)
