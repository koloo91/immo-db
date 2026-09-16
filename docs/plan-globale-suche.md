# Plan: Globale Suche über Exposés, Mailverlauf und Analysen

## Kontext

Das Tool verwaltet aktuell 4 Grundstücke in einer 128 KB großen SQLite-Datei. Nicht die Menge
ist das Problem, sondern die Tiefe: **Inhalte aus Exposés, Mailverlauf und KI-Analysen sind für
die Suche vollständig unsichtbar.**

Heute durchsucht `PropertyComparisonTable.vue` clientseitig fünf Felder per `.includes()` —
Titel, Adresse, Maklername, Maklerfirma, Flurstückskennzeichen. Nicht durchsuchbar sind:
Dokumentinhalte, der komplette Mailverlauf (`communications.bodyText`), KI-Zusammenfassungen,
Risikobewertungen, Gesamtanalysen, Checklisten und Notizen. Die Frage „In welcher Mail stand
nochmal was zur Erschließung?" ist unbeantwortbar.

**Ziel:** Eine Suche über alles, die zur *Fundstelle* springt — Seite 12 des Grundbuchauszugs,
die Mail vom 12.03. — nicht nur zum Grundstück.

Nicht Teil dieser Runde: der Vergleich von Grundstücken. Bewusst vertagt, bis die Suche im
Alltag benutzt wird.

---

## Vorab gemessen

Drei Annahmen wurden vor dem Plan überprüft; zwei davon haben ihn verändert:

| Messung | Ergebnis | Folge |
|---|---|---|
| Textebene der Liegenschaftskarte | **1252 Zeichen** echter Text (Flurstück 591, Gemarkung Kummersdorf, Katasterbehörde …) | Frühere Einschätzung „reines Scan-PDF" war falsch. Textextraktion trägt weiter als angenommen. |
| `pdf-parse` unter Bun | läuft, liefert aber **einen** Textblock ohne Seitengrenzen | Nicht geeignet für Treffer auf Seitenebene |
| `unpdf` unter Bun | liefert **seitenweisen** Text (`mergePages: false`), zog auch den Kartentext | **Bibliothek der Wahl** |

Offen und im ersten Schritt zu prüfen: Meilisearchs Tippfehlertoleranz bei deutschen Komposita
(greift voreingestellt erst ab bestimmter Wortlänge — an echten Behördenwörtern testen).

---

## Entscheidungen

| | |
|---|---|
| Engine | Meilisearch |
| Trefferebene | gemischt: Grundstück · Dokumentseite · E-Mail · Analyse |
| Textquelle | `unpdf`, seitenweise. Kein OCR. |
| Bild-PDFs ohne Textebene | als „Scan — nicht volltextdurchsuchbar" markieren, stattdessen KI-Summary indexieren |
| Queue | BullMQ + Redis für Extraktion und Gemini-Analyse; Index-Write direkt im Job |
| Worker | im Nitro-Prozess (Nitro-Plugin) |
| Betrieb | `compose.yml` mit Redis, Meilisearch, FlareSolverr |
| UX | ⌘K-Palette, Treffer nach Typ gruppiert |
| Ausfall | ehrlich melden, nie als „nichts gefunden" tarnen |

---

## Umsetzung

### 1. Infrastruktur

**`compose.yml`** (neu, Projektwurzel) — Redis, Meilisearch, FlareSolverr; alle mit
`restart: unless-stopped` und benannten Volumes (`meili_data`, `redis_data`), damit die
7-Tage-Lücke wie bei FlareSolverr nicht wieder passiert. geobasis bleibt außen vor
(lokales Binary).

**`nuxt.config.ts`** — `runtimeConfig` um `redisUrl`, `meilisearchUrl`, `meilisearchKey`
erweitern, Muster wie beim bestehenden `geobasisUrl`. Dazu `.env.example`.

Neue Abhängigkeiten: `unpdf`, `meilisearch`, `bullmq`, `ioredis`.

### 2. Schema (`server/database/schema.ts`)

Neue Tabelle `documentPages` — Träger der seitengenauen Treffer:
```
id, documentId (cascade), propertyId (cascade), pageNumber, text, createdAt
```

`documents` additiv erweitern:
```
pageCount, hasTextLayer (0/1), textStatus ('pending'|'done'|'none'|'error'), textExtractedAt
```
`textStatus: 'none'` trägt die Scan-Markierung für die Oberfläche.

Migration additiv: `bunx drizzle-kit push` (bestehende Daten bleiben, wie bei der Mail-Runde).

### 3. Textextraktion (`server/utils/pdfText.ts`, neu)

`extractPages(buffer)` über `unpdf` → `{ pages: string[], hasTextLayer: boolean }`.
`hasTextLayer` ist false, wenn die Summe aller Seitentexte leer bleibt — das ist die
verlässliche Prüfung, nicht das Zählen von Font-Referenzen (siehe Messung oben).

### 4. Queue (`server/utils/queue.ts`, `server/jobs/processDocument.ts`, neu)

Eine Queue `documents`, ein Job `process-document` mit drei Schritten, in dieser Reihenfolge:
1. Text seitenweise extrahieren → `documentPages` füllen, `textStatus` setzen
2. Gemini-Analyse (bestehende `runDocumentAnalysis` aus `server/utils/documentStore.ts` hierher verlagern)
3. Dokumentseiten in Meilisearch schreiben

Job-Optionen: `attempts: 3`, exponentielles Backoff, `removeOnComplete`.

**Damit wird ein bestehender Defekt behoben:** `storeDocument()` ruft heute
`void runDocumentAnalysis(...)` als Fire-and-Forget auf. Stirbt der Prozess dazwischen —
bei `nuxt dev` durch HMR regelmäßig —, bleibt das Dokument dauerhaft auf
`analysisStatus: 'running'`, und die Polling-Oberfläche in `app/pages/properties/[id].vue`
dreht sich endlos. Es gibt keinerlei Wiederaufnahme. Künftig übernimmt BullMQ das:
Der Job liegt in Redis, das Lock läuft ab, der neu gestartete Worker macht weiter.

### 5. Worker (`server/plugins/worker.ts`, neu)

Nitro-Plugin startet den BullMQ-Worker im selben Prozess und registriert einen
`onBeforeClose`-Hook zum sauberen Schließen. Beim Start zusätzlich:
- Dokumente mit `analysisStatus IN ('pending','running')` oder `textStatus = 'pending'` erneut einreihen
- Vollständigen Reindex anstoßen (Sekunden bei dieser Datenmenge) — das Sicherheitsnetz gegen Index-Drift

Fehlt Redis beim Start: einmal warnen, App normal weiterlaufen lassen.

### 6. Suchindex (`server/utils/search.ts`, neu)

Ein Index `immo` mit gemischten Typen. Dokumentform:
```
id            "prop:<id>" | "page:<docId>:<n>" | "mail:<commId>" | "analysis:<id>"
type          'property' | 'document_page' | 'email' | 'analysis'
propertyId    für Gruppierung und Sprungziel
propertyTitle Kontext in der Trefferliste
title         Dateiname / Betreff / Grundstückstitel
text          der durchsuchbare Inhalt
pageNumber    nur bei document_page
occurredAt    für Sortierung
```
`searchableAttributes` gewichtet (title vor text), `filterableAttributes`: `type`, `propertyId`.
Helfer: `indexProperty()`, `indexDocument()`, `indexEmail()`, `indexAnalysis()`,
`removeFromIndex()`, `reindexAll()`.

Bei Bild-PDFs (`textStatus: 'none'`) wird statt der Seiten die KI-Summary plus die
extrahierten Kennzahlen indexiert — das Dokument bleibt auffindbar, nur nicht in der Tiefe.

Einhängen in die bestehenden Schreibpfade: `emails/index.post.ts`, `communications.post.ts`,
`analysis.post.ts`, `index.put.ts`, `index.delete.ts`, `documents/[docId]/index.delete.ts`.

### 7. API

- **`server/api/search.get.ts`** — `q`, optional `type`/`propertyId`, gibt gruppierte Treffer mit
  Meilisearch-Highlights zurück. Ist Meilisearch nicht erreichbar: HTTP 503 mit klarer
  `message` (Muster wie in `server/utils/flaresolverr.ts`), **kein** leeres Ergebnis.
- **`server/api/search/reindex.post.ts`** — vollständiger Neuaufbau für den Zweifelsfall.
- **`server/api/settings/index.get.ts`** erweitern um Redis- und Meilisearch-Status,
  analog zu `geobasis` und `flaresolverr`.

### 8. Oberfläche

**`app/components/CommandPalette.vue`** (neu) — Overlay, ⌘K / Strg+K, entprellte Eingabe,
Treffer nach Typ gruppiert mit hervorgehobenem Textausschnitt, Pfeiltasten und Enter,
Sprung zum Ziel (`/properties/<id>?tab=docs&doc=<docId>&page=<n>` bzw. `…&thread=<id>`).
Ist der Dienst weg: die Fehlermeldung des Endpoints anzeigen, nicht „keine Treffer".

**`app/layouts/default.vue`** — Palette einhängen, Tastenkürzel global registrieren,
sichtbarer Auslöser im Header neben den Dienste-Badges.

**`app/pages/properties/[id].vue`** — Sprungziele aus der Query auswerten (Tab öffnen,
Dokument bzw. Thread aufklappen, Seite hervorheben) und das Scan-Badge am Dokument zeigen.

**`app/pages/settings.vue`** — Redis- und Meilisearch-Kachel plus „Index neu aufbauen"-Knopf.

---

## Verifikation

1. `docker compose up -d`, dann `bun run dev` — Dienste-Seite zeigt Redis und Meilisearch grün.
2. Mehrseitiges Text-PDF hochladen → `documentPages` füllt sich seitenweise, `textStatus: 'done'`.
3. ⌘K, Suche nach einem Begriff, der **nur auf Seite 2** steht → Treffer nennt Seite 2 und springt dorthin.
4. Bild-PDF ohne Textebene hochladen → Badge „Scan", Dokument über seine KI-Summary trotzdem auffindbar.
5. Liegenschaftskarte erneut analysieren → über „Kummersdorf" und „591" auffindbar (Text ist vorhanden, gemessen).
6. Mail einfügen → sofort über einen Begriff aus dem Mailtext auffindbar.
7. **Neustart-Test:** Während laufender Analyse `bun run dev` neu starten → Job wird nach dem
   Stalled-Intervall wieder aufgenommen, Dokument landet auf `done` statt ewig auf `running`.
8. **Ausfall-Test:** `docker compose stop meilisearch` → ⌘K zeigt „Suchdienst nicht erreichbar",
   nicht „keine Treffer". Uploads laufen weiter. Nach `start` + Reindex ist alles wieder da.
9. **Drift-Test:** Meilisearch stoppen, Dokument hochladen, Meilisearch starten, App neu starten
   → das Dokument ist durch den Start-Reindex im Index.
10. Deutsche Komposita: nach „beitragsbesch" und einem Tippfehler („Erschliessung") suchen —
    falls Meilisearch danebenliegt, `typoTolerance`/`synonyms` nachziehen.

---

## Risiken

- **Meilisearchs Tippfehlertoleranz bei Komposita ist ungeprüft** (Punkt 10). Zur Einordnung:
  SQLite FTS5 mit `trigram` löst genau diesen Fall nachweislich (`"beitragsbesch"` findet
  `Erschließungsbeitragsbescheid`) und ist im vorhandenen SQLite 3.54.0 verfügbar — falls
  Meilisearch hier enttäuscht, ist das der Rückfallweg ohne zusätzlichen Dienst.
- **Vier Fremddienste** (geobasis, FlareSolverr, Redis, Meilisearch). `restart: unless-stopped`
  entschärft das, die Dienste-Seite macht Ausfälle sichtbar.
- **Gemini-Jobs laufen im Nitro-Event-Loop.** Bei Einzelnutzung unkritisch; bei mehreren
  parallelen Uploads Worker-Nebenläufigkeit begrenzen.
- **Sehr große PDFs** können viele Seitenzeilen erzeugen. Bei Bedarf Seiten über einer
  Zeichenzahl beim Indexieren stückeln.


---

## Umgesetzt am 16.09.2026

Alle zehn Verifikationsschritte durchlaufen. Drei Abweichungen vom Plan, jeweils durch eine
Messung ausgelöst:

1. **`pdf-parse` verworfen, `unpdf` genommen.** `pdf-parse` läuft unter Bun, liefert aber nur
   einen Textblock ohne Seitengrenzen. `unpdf` gibt seitenweisen Text direkt zurück.
2. **Meilisearch verbietet Doppelpunkte in Dokument-IDs.** Die IDs (`prop:…`, `page:…:1`) wurden
   komplett abgelehnt; der Index blieb leer, während das Log Erfolg meldete, weil
   `addDocuments` nur einen Task zurückgibt. Beides behoben: IDs mit `_`, und jeder
   Schreibvorgang wartet jetzt auf das Task-Ergebnis.
3. **Kein deutsches Stemming in Meilisearch.** Gemessen: Tippfehler (`Bauvorhabn`), Präfixe
   (`Liegenschaft`) und Umlaute (`Flurstuck`) funktionieren; Ableitungen wie
   `Erschließung` &harr; `erschlossen` nicht. Mit 18 fachlichen Synonymgruppen geschlossen.

Ebenfalls behoben: die Fire-and-Forget-Analyse. Ein Dokument, dessen Verarbeitung durch
`kill -9` unterbrochen wurde, stand auf `analysis_status = running` und war nach dem
Serverstart binnen 3 Sekunden fertig verarbeitet.
