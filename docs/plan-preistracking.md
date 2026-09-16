# Plan: Preistracking und Offline-Erkennung für Inserate

## Kontext

Grundstücke werden über Wochen bis Monate verfolgt. In dieser Zeit ändert sich der Angebotspreis
und irgendwann verschwindet das Inserat — beides erfährt man heute nur zufällig beim manuellen
Nachsehen.

Zwei Befunde aus der Bestandsaufnahme:

**Es gibt keine Preishistorie.** `properties.askingPrice` ist ein einzelner Wert, den
`sync-url.post.ts:44` überschreibt (`updates.askingPrice = extracted.askingPrice`). Jede
bisher synchronisierte Preisänderung ist spurlos verloren. Das `priceHistoryJson` in `parcels`
enthält BORIS-Bodenrichtwerte, keine Angebotspreise.

**„Gelöscht" und „blockiert" sind auf HTTP-Ebene nicht unterscheidbar.** Gemessen:

| Abruf | Antwort |
|---|---|
| immowelt, echtes Inserat | HTTP 403 · 771 B · Titel „immowelt.de" |
| immowelt, erfundene ID | HTTP 403 · 771 B · Titel „immowelt.de" |
| ImmoScout, echtes Inserat | HTTP 401 · 4006 B · „Ich bin kein Roboter" |
| ImmoScout, erfundene ID | HTTP 401 · 4006 B · „Ich bin kein Roboter" |

Byte-identisch. Eine naive Umsetzung („Abruf fehlgeschlagen → Inserat weg") wäre eine
Fehlalarm-Maschine. Erst ein **erfolgreicher** Abruf trennt die Fälle: über FlareSolverr liefert
ein gelöschtes immowelt-Inserat den Titel „Anzeige gelöscht" und keinen Preis.

**Ziel:** Täglich prüfen, Preisänderungen nachvollziehbar festhalten, und ein verschwundenes
Inserat melden — ohne jemals zu behaupten, etwas sei weg, wenn es nur nicht abrufbar war.

---

## Vorab gemessen

| Messung | Ergebnis | Folge für den Bau |
|---|---|---|
| Preis ohne KI auslesbar? | immowelt: `RealEstateListing.name` / `og:title` enthält „Grundstück **135000 €** zum Kauf Storkow" | Täglicher Check braucht **kein** Gemini |
| Kleinanzeigen dasselbe? | **Nein** — JSON-LD nur `@type: WebSite`, `og:title` ohne Preis; Preis steht im DOM unter `id="viewad-price"` | Parser muss **portalspezifisch** sein |
| Kleinanzeigen erreichbar? | Ja, über FlareSolverr ohne Wall | Portal ist trackbar |
| Fließtext als Preisquelle? | Auf derselben immowelt-Seite stehen 135.000 € (Kaufpreis) **und** 139.820 € (vermutlich inkl. Nebenkosten) | Niemals „erste Zahl im Text" nehmen |
| ImmoScout trackbar? | Nein — harte Wall, FlareSolverr meldet „Challenge not detected" | Bleibt dauerhaft „nicht prüfbar" |

Portale im Bestand: 2 × ImmoScout24, 1 × immowelt, 1 × Kleinanzeigen.

---

## Entscheidungen

| | |
|---|---|
| Zustände | ① geprüft/lebt ② geprüft/gelöscht ③ nicht prüfbar — bei ③ **keine Aussage** |
| Offline-Erkennung | Phrase → sofort; Strukturbruch → erst beim zweiten Mal in Folge; Rückkehr dreht zurück |
| ImmoScout | wird trotz nachgewiesener Wall täglich mitversucht |
| Manuelle Erfassung | „Preis heute" / „Inserat offline" direkt am Eintrag |
| Historie | `price_observations`, Eintrag nur bei Änderung |
| Preisänderung | wird vorgeschlagen, nicht übernommen |
| Prüftiefe | leichter Check ohne KI; voller Gemini-Sync bleibt manuell |
| Zeitsteuerung | täglicher Job + Nachholen beim Start, wenn > 20 h alt |
| Abrufverhalten | geplant: ein Versuch mit Abstand · manuell: volle Wiederholung |
| Meldungen | Badge in Kanban + Vergleichstabelle, ausführlich im Detail, bestätigbar |
| Darstellung | Zeitleiste der Änderungen mit Delta und Quelle |

---

## Umsetzung

### 1. Schema (`server/database/schema.ts`)

Neue Tabelle `priceObservations` — die Preiskurve, ein Eintrag nur bei Veränderung:
```
id, propertyId (cascade), observedAt,
kind        'first_seen' | 'price_change' | 'listing_gone' | 'listing_back'
price, previousPrice, pricePerSqm
source      'auto' | 'manual' | 'email'
note
```

Neue Tabelle `listingStatus` (1:1 zum Grundstück) — der laufende Zustand, bewusst getrennt
von der Historie, damit `properties` nicht um zehn Spalten wächst:
```
propertyId (PK), portal,
state            'unknown' | 'online' | 'suspect' | 'offline' | 'unverifiable'
lastCheckedAt, lastOkAt, lastMessage, consecutiveFailures, suspectSince,
lastSeenTitle, lastSeenPrice        -- Gedächtnis für den Strukturbruch-Vergleich
firstSeenAt                          -- für "seit 47 Tagen inseriert"
pendingPrice, pendingPriceSeenAt     -- Vorschlag, der bestätigt werden will
alertAckAt                           -- bestätigte Meldung verschwindet
```

Migration additiv. **Achtung:** `drizzle-kit push` ist in dieser Codebasis bereits einmal am
Tabellen-Neubau gescheitert (es kopiert Spalten, die es noch nicht angelegt hat). Bei neuen
Tabellen unkritisch; falls doch, per `ALTER TABLE` nachziehen wie beim letzten Mal.

### 2. Portal-Adapter (`server/utils/listingCheck.ts`, neu)

Pro Portal eine Regel, weil die Preise verschieden abgelegt sind (gemessen):

- **immowelt** — `RealEstateListing.name` bzw. `og:title`, Preis per Regex aus dem Titelstring
- **Kleinanzeigen** — DOM `#viewad-price`, Fallback `.boxedarticle--price`
- **Generisch** — `og:title` + bekannte Preis-Selektoren; schlägt das fehl, gilt der Check als
  *nicht auswertbar* statt zu raten
- **ImmoScout** — erst gar kein Parsing, der Abruf scheitert vorher

Rückgabe: `{ ok, title, price, gone, reason }`.

`gone` wird gesetzt bei bekannten Formulierungen („Anzeige gelöscht", „nicht mehr verfügbar",
„Angebot wurde entfernt", …). Der Strukturbruch (Abruf ok, aber weder Titel noch Preis, obwohl
`lastSeenTitle`/`lastSeenPrice` gefüllt sind) wird **nicht** hier entschieden, sondern im Job —
er braucht den Vergleich mit dem letzten erfolgreichen Abruf.

### 3. Prüf-Job (`server/jobs/checkListing.ts`, neu)

Ablauf pro Grundstück:
1. Seite holen. Für den geplanten Lauf **ein** Versuch (neuer Parameter an
   `fetchHtmlWithFlareSolverr`, der die bestehende Retry-Schleife auf einen Durchgang begrenzt),
   für den manuellen Knopf die vollen drei.
2. Abruf fehlgeschlagen → `state = 'unverifiable'`, `lastMessage` setzen, `lastCheckedAt`
   aktualisieren. **Kein** Historieneintrag, keine Meldung. Bei ImmoScout ist das der Normalfall
   und wird als erwarteter Zustand protokolliert, nicht als Fehler.
3. Abruf ok → Adapter auswerten:
   - Phrase erkannt → `state = 'offline'`, Historieneintrag `listing_gone`
   - Titel und Preis leer, obwohl vorher vorhanden → beim ersten Mal `state = 'suspect'`
     (+ `suspectSince`), beim zweiten Mal in Folge `offline` + Historieneintrag
   - Preis gelesen und ≠ `askingPrice` → `pendingPrice` setzen, Historieneintrag `price_change`
   - War der Zustand `offline`/`suspect` und das Inserat lebt wieder → `listing_back`
   - In jedem Fall `lastSeenTitle`/`lastSeenPrice`/`lastOkAt` fortschreiben

Zwischen den Grundstücken einige Sekunden Abstand.

### 4. Zeitsteuerung (`server/utils/queue.ts`, `server/plugins/worker.ts`)

Zweite Queue `listings` mit eigenem Worker (Nebenläufigkeit 1 — die Abstände zwischen Portalen
sollen eingehalten werden). Repeatable Job täglich um 07:00 über BullMQs `repeat`-Option;
Redis behält den Zeitplan über Neustarts.

Beim Hochfahren zusätzlich: alle Grundstücke mit `adUrl`, deren `lastCheckedAt` älter als
20 Stunden ist, sofort einreihen. Ohne dieses Nachholen wäre „täglich" bei einem lokal
gestarteten Werkzeug eine Behauptung, die selten eintrifft.

### 5. API

- `server/api/properties/[id]/check-listing.post.ts` — „Jetzt prüfen", volle Wiederholungen,
  wartet auf das Ergebnis
- `server/api/properties/[id]/price.post.ts` — manuelle Erfassung (`price` oder
  `listingGone: true`), schreibt mit `source: 'manual'`
- `server/api/properties/[id]/price-alert.post.ts` — `accept` übernimmt `pendingPrice` in
  `askingPrice` (+ `pricePerSqm` neu rechnen), `dismiss` setzt nur `alertAckAt`
- `index.get.ts` und `properties/index.get.ts` um `listingStatus` und `priceObservations`
  erweitern

Der Suchindex wird nach Preisübernahme nachgezogen (`reindexProperty`), da der Preis im
Grundstücks-Dokument steht.

### 6. Oberfläche

**`app/components/PriceTimeline.vue`** (neu) — Zeitleiste der Beobachtungen:
„12.03.2026 · 420.000 € → 389.000 € (−7,4 %) · Inserat", darunter „20.03. · Inserat offline".
Kopfzeile: „seit 47 Tagen inseriert · −7,4 % seit Erfassung". Darunter die manuelle Erfassung.

**`app/pages/properties/[id].vue`** — Meldungsbanner oben:
- Preisvorschlag → „Inserat nennt jetzt 389.000 € (hinterlegt: 420.000 €)" mit *Übernehmen* /
  *Ignorieren*
- `offline` → „Inserat ist seit dem 20.03. nicht mehr auffindbar" mit *Zur Kenntnis genommen*
- `unverifiable` → ruhiger Hinweis „ImmoScout lässt keine automatische Prüfung zu · zuletzt
  erfolgreich geprüft am …" plus *Jetzt prüfen*
Dazu die Zeitleiste im Tab „Lage, Kataster & BORIS" neben der BORIS-Kurve.

**`app/components/PropertyKanban.vue`** und **`PropertyComparisonTable.vue`** — Badge pro
Grundstück: „↓ 389.000 €" (Preisvorschlag offen), „Inserat offline", oder ein unauffälliges
Zeichen für „nicht prüfbar". Nur solange nicht bestätigt.

**`app/pages/settings.vue`** — Zeitpunkt des letzten Laufs und Zähler der `listings`-Queue,
analog zur bestehenden Queue-Kachel.

---

## Verifikation

1. immowelt-Grundstück prüfen lassen → `state: 'online'`, `lastSeenPrice: 135000`,
   `firstSeenAt` gesetzt, **kein** Historieneintrag beim ersten Lauf außer `first_seen`.
2. `askingPrice` von Hand auf 150.000 € ändern, erneut prüfen → `pendingPrice: 135000`,
   Banner erscheint, Badge in Kanban und Vergleichstabelle sichtbar.
3. *Übernehmen* klicken → `askingPrice` = 135000, `pricePerSqm` neu berechnet, Banner weg,
   Historieneintrag `price_change` mit Delta, Suchindex aktualisiert.
4. Erfundene immowelt-URL eintragen und prüfen → Phrase „Anzeige gelöscht" erkannt,
   `state: 'offline'`, Historieneintrag, Banner.
5. Zurück auf die echte URL → `listing_back`, Status wieder `online`.
6. **ImmoScout-Grundstück prüfen** → `state: 'unverifiable'`, ruhiger Hinweis statt Alarm,
   **kein** Historieneintrag, im Log als erwarteter Zustand und nicht als Fehler.
7. Manuelle Erfassung am ImmoScout-Grundstück → Historieneintrag mit `source: 'manual'`,
   erscheint in der Zeitleiste.
8. Strukturbruch simulieren (Adapter liefert leeren Titel/Preis bei gefülltem `lastSeen…`)
   → erster Lauf `suspect` ohne Meldung, zweiter Lauf `offline` mit Meldung.
9. Server mit veraltetem `lastCheckedAt` starten → Nachholen greift, Prüfung läuft an.
10. Redis stoppen → Prüfungen fallen aus, die App bleibt bedienbar, Einstellungsseite zeigt es;
    nach dem Start wird nachgeholt.

---

## Risiken

- **Portal-Adapter sind zerbrechlich.** Ändert immowelt den Titelaufbau oder Kleinanzeigen die
  CSS-Klasse, liefert der Check „nicht auswertbar". Das ist gewollt (lieber nichts sagen als
  raten), führt aber ohne Aufmerksamkeit zu einer stillen Lücke — deshalb gehört
  „seit X Tagen nicht auswertbar" in den Hinweis auf der Detailseite.
- **ImmoScout erzeugt täglich zwei fehlgeschlagene Prüfungen.** Bewusst in Kauf genommen.
- **Der Strukturbruch-Check greift erst ab dem zweiten erfolgreichen Abruf**, weil er ein
  `lastSeen…` zum Vergleichen braucht. Bei neu angelegten Grundstücken also frühestens am
  zweiten Tag.
- **Automatisiertes tägliches Abfragen ist bei den Portalen laut Nutzungsbedingungen nicht
  vorgesehen.** Bei vier privat verfolgten Inseraten mit einem Versuch pro Tag ist das Volumen
  unkritisch; die Sparsamkeit ist Absicht und sollte es bleiben.


---

## Umgesetzt am 16.09.2026

Alle zehn Verifikationsschritte durchlaufen. Zwei Funde während der Umsetzung:

1. **Redis-Portkonflikt.** `immo-redis` bekam beim ersten `docker compose up` keine
   Host-Portbindung (der Lauf brach an FlareSolverr ab und der Container wurde danach
   nur wiederverwendet). Auf Port 6379 läuft bereits `allmylittleapps_redis` eines anderen
   Projekts &ndash; die BullMQ-Jobs dieser App landeten dort. Behoben: eigener Port 6380
   in `compose.yml`, `nuxt.config.ts` und `.env`. Keine Namenskollision mit den dortigen
   Queues, deren Daten sind unberührt.
2. **Umleitung auf Kategorieseiten.** Ein entferntes Kleinanzeigen-Inserat leitet auf eine
   Sammelseite um, deren Titel vorhanden ist &ndash; der Strukturbruch-Check hätte deshalb nie
   ausgelöst. Ergänzt: `isListingPage()` prüft portalspezifische Marker (`#viewad-title`,
   `Hardfacts`, JSON-LD `RealEstateListing`); fehlen sie alle, gilt die Seite als
   Umleitung und nicht als lebendes Inserat.

Geprüfter Lebenszyklus an einem echten immowelt-Inserat:
`first_seen (135.000 €) → price_change (150.000 → 135.000 €, −10 %) → listing_gone
("anzeige gelöscht") → listing_back (135.000 €)`.

Bestätigt: Der Tageslauf hat `askingPrice` bei erkannter Änderung **nicht** überschrieben;
erst das Bestätigen der Meldung setzt den Wert und rechnet `pricePerSqm` neu.
Die beiden ImmoScout-Grundstücke landeten korrekt auf `unverifiable` statt `offline`.
