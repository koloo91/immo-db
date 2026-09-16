# ImmoDB AI &bull; Grundstücks-Tracker & KI-Analyse

Eine moderne Webanwendung zur Verwaltung, Recherche, KI-gestützten Analyse und zum Vergleich von Grundstücken &ndash; speziell optimiert für **Brandenburg** durch Anbindung an [geobasis-cli](file:///Users/patrick/dev/projects/geobasis-cli) (amtliche ALKIS-Katasterdaten & BORIS-Bodenrichtwerte) und **Google Gemini 2.5**.

---

## ✨ Features

- 📋 **Pipeline (Kanban-Board):** Verfolge Grundstücke über den gesamten Prozess (*Neu entdeckt* &rarr; *Makler kontaktiert* &rarr; *Unterlagen angefordert* &rarr; *In Prüfung / B-Plan Check* &rarr; *Besichtigung* &rarr; *Angebot abgegeben* &rarr; *Gekauft* / *Archiv*).
- 📊 **Vergleichsmatrix:** Interaktive Tabelle aller Grundstücke mit Sortierung und Filterung nach Kaufpreis, Fläche, Preis/m², BORIS-Bodenrichtwert, prozentualer Abweichung und Bebaubarkeit (GRZ/GFZ).
- 🗺️ **GIS-Kartenintegration:**
  - Gesamtübersicht aller Grundstücke mit Markern auf OpenStreetMap oder Luftbild/Satellit.
  - Detailkarte mit **amtlichem Flurstück-Polygon (GeoJSON)** aus dem Liegenschaftskataster Brandenburg (LGB).
- 📈 **BORIS-Preisentwicklung (2010–2026):** Visuelle Darstellung der historischen Bodenrichtwert-Entwicklung und Wertsteigerung.
- 📧 **E-Mail-Verlauf mit Threads:**
  - **Mail einfügen:** Rohtext aus Outlook/Gmail hineinkopieren oder die **.eml-Datei ablegen** &ndash; Gemini erkennt Absender, Empfänger, Betreff, Datum und den reinen Nachrichtentext.
  - Aus der Mail gezogene **Zusagen** ("Makler reicht den B-Plan bis Freitag nach"), **harte Fakten mit Belegzitat** (z. B. Preissenkung) und **Checklisten-Updates** werden als ankreuzbare Vorschläge angeboten &ndash; nichts wird ungefragt übernommen.
  - Nachrichten gruppieren sich automatisch zu Threads (`AW:`, `Re:`, `Fwd:`, `WG:` werden normalisiert).
  - **PDF-Anhänge aus der .eml** landen direkt am richtigen Mail-Eintrag; nachträglich lassen sich weitere PDFs an jede Mail hängen.
  - KI-Entwürfe werden als **Entwurf** abgelegt (mit `mailto:`-Link und "Als gesendet markieren"), statt im Notizfeld zu verschwinden.
- 🤝 **Makler & Unterlagen:**
  - Kontaktdatenbank mit Schnellaktionen (Anrufen, Mail schreiben).
  - Unterlagen-Checkliste (Grundbuch, B-Plan, Katasterauszug, Altlasten, Erschließung).
  - **KI-Makler-Anfrage:** Generiert eine formelle E-Mail für ausstehende Unterlagen &ndash; inklusive der offenen Fragen aus der KI-Gesamtanalyse.
  - Chronologische Timeline für Telefonate, Termine und Notizen inkl. Fristen/Wiedervorlage.
- 🤖 **KI-Dokumentenanalyse mit Gemini:**
  - **Multi-File Drag & Drop**; der Upload ist sofort fertig, die Analyse läuft im Hintergrund (Status: wartet &rarr; läuft &rarr; fertig/Fehler mit "Erneut versuchen").
  - **Duplikaterkennung per SHA-256** &ndash; dasselbe PDF wird nicht zweimal abgelegt.
  - **Dokumenttyp-spezifische Prompts:** Ein Grundbuchauszug wird nach Abt. II/III ausgewertet, ein B-Plan nach Festsetzungen und Baufenster, ein Altlastengutachten nach Kampfmittel- und Bodenrisiken &ndash; statt einem Einheitsprompt für alles.
  - 1-Klick-Übernahme der extrahierten Daten in das Grundstück; Kategorie nachträglich änderbar (löst Neuanalyse mit passendem Prompt aus).
  - Sichtbare Herkunft: "aus E-Mail von makler@… vom 12.03."
  - **Interaktiver Q&A Chat** mit den hochgeladenen Dokumenten des Grundstücks.
- 🧠 **KI-Gesamtanalyse (versioniert):**
  - Fasst alle Dokumentanalysen, den Mailverlauf und die BORIS-/ALKIS-Daten zu **einer** Einschätzung zusammen: Score 0&ndash;100, Fazit, deduplizierte Risiken mit Fundstelle, Chancen, offene Fragen.
  - **Preiseinordnung** gegen den amtlichen Bodenrichtwert inkl. Begründung.
  - Jede Analyse bleibt als Version erhalten &ndash; der Verlauf zeigt Änderungen wie "Preis 420.000 € → 389.000 €, Score 61 → 68".
  - Der Score erscheint als sortierbare Spalte in der Vergleichsmatrix und als Badge auf den Kanban-Karten.
- 🔗 **URL-Import aus Inseraten:**
  - Liest Exposés von ImmobilienScout24, immowelt, Kleinanzeigen &amp; Co. per KI aus (Preis, Fläche, Baurecht, Makler, Bilder).
  - **Erkennt Bot-Schutzseiten** aller gängigen Anbieter (ImmoScout-eigene Wall mit HTTP 401, Cloudflare, DataDome, Incapsula, PerimeterX) und bricht mit klarer Meldung ab, statt die Fehlerseite als Grundstück anzulegen.
  - Weiß, bei welchen Portalen FlareSolverr etwas ausrichtet, und überspringt es sonst &ndash; das spart bis zu 65 s Wartezeit pro Fehlversuch und vermeidet falsche Ratschläge in der Fehlermeldung.
  - **Automatischer Retry** (3 Versuche mit Backoff): die Portale lassen denselben Link mal durch und mal nicht &ndash; ein einzelner Fehlversuch bedeutet noch kein blockiertes Inserat.
  - Warnt, wenn eine Seite zwar abrufbar war, aber weder Preis noch Fläche, Adresse oder Bilder enthielt (z. B. bei einer Suchergebnisliste statt eines Exposés).
  - Tracking-Parameter (`utm_*`, `#/`) werden vor dem Abruf entfernt.
- 🔎 **Globale Suche (⌘K):**
  - Durchsucht **Exposé-Volltext, kompletten Mailverlauf, KI-Analysen und Stammdaten** in einem Feld.
  - Treffer zeigen die **Fundstelle**, nicht nur das Grundstück: „Seite 2 des Bebauungsplans" statt „irgendwo hier drin".
  - Beim Upload wird der PDF-Text **seitenweise** extrahiert (`unpdf`, lokal, ohne API-Kosten).
  - Bild-PDFs ohne Textebene werden als „Scan &ndash; nicht volltextdurchsuchbar" markiert und über ihre KI-Zusammenfassung indexiert, statt still zu verschwinden.
  - Tippfehlertoleranz und Präfixsuche (`Liegenschaft` &rarr; Liegenschaftskarte, `Bauvorhabn` &rarr; Bauvorhaben) sowie fachliche Synonyme (`Erschließung` &harr; `erschlossen`, `GRZ` &harr; `Grundflächenzahl`, `B-Plan` &harr; `Bebauungsplan`).
  - Fällt der Suchdienst aus, sagt die Palette das &ndash; statt eine leere Trefferliste zu zeigen, die wie „nichts gefunden" aussieht.
- ⚙️ **Verarbeitungs-Queue (BullMQ + Redis):**
  - Textextraktion, KI-Analyse und Indexierung laufen als Job mit Wiederholung und Backoff.
  - **Übersteht Serverneustarts:** ein bei Absturz unterbrochenes Dokument wird beim nächsten Start automatisch wiederaufgenommen, statt dauerhaft auf „Analyse läuft" hängenzubleiben.
- 📉 **Preistracking & Offline-Erkennung:**
  - Prüft die hinterlegten Inserate täglich (7 Uhr) und holt beim Start nach, was länger als 20 Stunden zurückliegt &ndash; auch wenn das Werkzeug nicht durchgehend läuft.
  - **Drei Zustände statt zwei:** geprüft/online, geprüft/gelöscht, oder *nicht prüfbar*. Ein blockierter Abruf gilt nie als „Inserat weg" &ndash; gemessen liefern gelöschtes und blockiertes Inserat byte-identische Antworten.
  - Preisänderungen werden **vorgeschlagen, nicht übernommen**: Meldung am Grundstück mit einem Klick zum Bestätigen. So kann kein Parser-Ausrutscher still den Wert verfälschen, an dem Preis/m², Vergleich, Nebenkosten und KI-Score hängen.
  - Zeitleiste aller Änderungen mit Delta und Quelle (automatisch / von Hand / aus E-Mail), plus „seit X Tagen beobachtet".
  - Badges in Kanban und Vergleichstabelle, damit man nicht jeden Eintrag einzeln öffnen muss.
  - **Ohne KI-Kosten:** der Tageslauf liest Preis und Titel portalspezifisch aus (immowelt über JSON-LD/og:title, Kleinanzeigen über das Preis-Element) &ndash; der volle Gemini-Sync bleibt ein manueller Knopf und überschreibt nichts nebenbei.
  - ImmobilienScout24 lässt keine automatische Prüfung zu; dort trägst du den Preis mit einem Klick von Hand nach, der Verlauf ist derselbe.
- 💰 **Kaufnebenkosten-Rechner:** Automatische Kalkulation von Grunderwerbsteuer (BB 6,5 %), Notar/Grundbuch (2,0 %) und Maklerprovision.

---

## 🛠 Tech-Stack

- **Framework:** [Nuxt 4](https://nuxt.com/) (Vue 3, TypeScript, Script Setup)
- **UI & Design:** [DaisyUI 5](https://daisyui.com/) + Tailwind CSS v4
- **Icons:** `@nuxt/icon` (Lucide Icons Offline-Bundle)
- **Datenbank & ORM:** SQLite (`better-sqlite3` / `bun:sqlite`) + [Drizzle ORM](https://orm.drizzle.team/)
- **Karten:** [Leaflet](https://leafletjs.com/) mit GeoJSON & OpenStreetMap / Satelliten-Layer
- **Geodaten-Dienst:** [`geobasis-cli`](file:///Users/patrick/dev/projects/geobasis-cli) REST-Daemon (`geobasis serve`)
- **KI-Engine:** `@google/genai` (Gemini 2.5 Flash Multimodal)
- **Suche:** [Meilisearch](https://www.meilisearch.com/) (Index), [BullMQ](https://bullmq.io/) + Redis (Job-Queue), [`unpdf`](https://github.com/unjs/unpdf) (PDF-Volltext seitenweise)
- **E-Mail-Import:** eigener MIME-/.eml-Parser (`server/utils/emlParser.ts`, ohne Zusatz-Dependency) mit quoted-printable-, Base64- und RFC-2047-Dekodierung

---

## 🚀 Schnellstart

### 1. Abhängigkeiten installieren
```bash
bun install
# oder
npm install
```

### 2. Umgebungsvariablen einrichten (Optional für KI)
Kopiere die `.env.example`:
```bash
cp .env.example .env
```
Trage deinen Gemini API Key ein:
```env
GEMINI_API_KEY=dein_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
GEOBASIS_URL=http://127.0.0.1:8080
# Eigene Adresse - hilft der KI, ein- von ausgehenden Mails zu unterscheiden
OWN_EMAIL=deine@adresse.de
```

> Ohne `GEMINI_API_KEY` läuft alles weiter im Simulationsmodus: Mails werden per Header-Heuristik
> zerlegt, .eml-Anhänge weiterhin korrekt extrahiert, Analysen als "simuliert" gekennzeichnet.

> **Zum URL-Import:** ImmobilienScout24 blockiert Server-Abrufe mit einer eigenen Bot-Wall
> (HTTP 401, „Ich bin kein Roboter"). Das ist **keine** Cloudflare-Challenge &ndash; FlareSolverr
> meldet dort „Challenge not detected" und reicht die Schutzseite unverändert durch, hilft also
> nicht. Der Import überspringt FlareSolverr für IS24 deshalb und bricht direkt mit einer klaren
> Meldung ab; **IS24-Exposés legst du manuell an oder lädst das Exposé-PDF hoch** &ndash; die KI
> zieht die Daten dann daraus. immowelt und Kleinanzeigen funktionieren per URL-Import,
> mit FlareSolverr (Schritt 3b) noch zuverlässiger.

### 3. Geobasis REST-Daemon starten (Brandenburg Kataster & BORIS)
In einem separaten Terminal:
```bash
/Users/patrick/dev/projects/geobasis-cli/geobasis serve
# Läuft auf http://127.0.0.1:8080
```

### 3b. Fremddienste starten (Suche, Queue, FlareSolverr)
```bash
docker compose up -d
```
Startet Meilisearch (Suchindex, Port 7700), Redis (Job-Queue, **Port 6380**) und FlareSolverr
(Port 8191) mit `restart: unless-stopped`, damit sie Neustarts überleben.

Ohne diese Dienste läuft die App weiter, aber die ⌘K-Suche meldet sich als nicht verfügbar
und hochgeladene Dokumente werden erst beim nächsten Serverstart verarbeitet.
Den Status siehst du unter **Dienste & API**.

FlareSolverr hilft bei Cloudflare-Challenges (u. a. immowelt); bei ImmobilienScout24 bringt
es nichts und wird automatisch übersprungen.

### 4. Datenbankschema anlegen/aktualisieren
```bash
bunx drizzle-kit push
```

### 5. Nuxt 4 Entwicklungsserver starten
```bash
npm run dev
# oder
bun run dev
```

Die Anwendung steht nun unter **http://localhost:3000** bereit &ndash; die globale Suche
erreichst du mit **⌘K** (bzw. Strg+K).
Demo-Grundstücke aus Potsdam und Werder (Havel) mit echten Kataster- und BORIS-Daten sind bereits in der Datenbank hinterlegt!
