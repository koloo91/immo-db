// Dokumenttyp-spezifische Analyse-Prompts.
// Das äußere JSON-Schema (summary / extracted / riskAssessment) bleibt über alle Typen
// identisch, damit apply.post.ts und die UI unverändert weiterarbeiten können.
// Unterschiedlich ist nur, worauf die Analyse ihren Schwerpunkt legt.

export const DOC_TYPE_LABELS: Record<string, string> = {
  expose: 'Exposé',
  bplan: 'Bebauungsplan',
  kataster: 'Katasterauszug / Flurkarte',
  grundbuch: 'Grundbuchauszug',
  altlasten: 'Altlasten- / Bodengutachten',
  sonstiges: 'Sonstiges Dokument'
}

const FOCUS_BY_TYPE: Record<string, string> = {
  expose: `SCHWERPUNKT EXPOSÉ:
- Kaufpreis, Provision, Fläche, Preis pro m², Zuschnitt und Lage exakt erfassen.
- Angaben zu Baurecht (B-Plan-Nummer, §34/§35 BauGB), GRZ/GFZ, Bauweise, Geschossigkeit.
- Erschließungsstatus (Strom, Wasser, Abwasser, Gas, Glasfaser, Straße) und wer die Beiträge trägt.
- Makler-/Anbieterdaten inkl. Provisionshöhe.
- Achte auf Marketing-Sprache, die harte Fakten verschleiert ("baureif" ohne B-Plan-Nachweis,
  "voll erschlossen" ohne Angabe zu offenen Erschließungsbeiträgen). Solche Unschärfen
  gehören als Risiko in die Bewertung.`,

  grundbuch: `SCHWERPUNKT GRUNDBUCHAUSZUG:
- Bestandsverzeichnis: Flurstücke, Gemarkung, Flur, Zähler/Nenner, amtliche Größe.
- ABTEILUNG II vollständig auswerten: Wegerechte, Leitungsrechte, Geh- und Fahrtrechte,
  Nießbrauch, Wohnrechte, Vorkaufsrechte, Reallasten, Sanierungs-/Umlegungsvermerke,
  Zwangsversteigerungsvermerke, Baulasten-Hinweise, Erbbaurechte.
- ABTEILUNG III: Grundschulden, Hypotheken, Höhe und Gläubiger — und ob eine Löschung
  zum Verkauf zugesichert ist.
- Jede Eintragung in Abt. II ist potenziell wertmindernd oder bebauungshindernd und MUSS
  in "risks" einzeln mit ihrer laufenden Nummer auftauchen.
- Der Kaufpreis steht hier normalerweise nicht drin: askingPrice/pricePerSqm dann null lassen.`,

  bplan: `SCHWERPUNKT BEBAUUNGSPLAN:
- Art der baulichen Nutzung (WA, WR, MI, GE …) und was konkret zulässig ist.
- Maß der baulichen Nutzung: GRZ, GFZ, Zahl der Vollgeschosse, Trauf- und Firsthöhe.
- Bauweise (offen/geschlossen), überbaubare Grundstücksfläche / Baufenster, Baugrenzen und Baulinien.
- Festsetzungen zu Dachform, Dachneigung, Stellplätzen, Einfriedungen.
- Grünflächen, Pflanzgebote, Ausgleichsflächen, Erhaltungssatzungen, Leitungsrechte.
- Immissionsschutz-Festsetzungen (Lärmpegelbereiche) und Flächen für Versorgungsanlagen.
- Einschränkungen, die das Bauvorhaben spürbar begrenzen, gehören in "risks".
- Kaufpreis ist hier nicht enthalten: askingPrice null lassen.`,

  kataster: `SCHWERPUNKT KATASTERAUSZUG / FLURKARTE:
- Flurstückskennzeichen (20-stellig), Gemarkung, Gemarkungsschlüssel, Flur, Zähler/Nenner.
- Amtliche Fläche in m² und tatsächliche Nutzungsart laut ALKIS.
- Zuschnitt, Grenzverlauf, Erschließung zur öffentlichen Straße, Zuwegung.
- Ob das Grundstück aus mehreren Flurstücken besteht und ob eine Teilung nötig wäre.
- Hinweise auf angrenzende Nutzungen (Gewerbe, Landwirtschaft, Bahn), die stören können.
- Kaufpreis ist hier nicht enthalten: askingPrice null lassen.`,

  altlasten: `SCHWERPUNKT ALTLASTEN / BODENGUTACHTEN:
- Eintragungen im Altlasten- oder Verdachtsflächenkataster, Aktenzeichen, Status.
- Kampfmittelverdacht (in Brandenburg regelmäßig relevant) und ob eine Freigabe vorliegt.
- Bodenklassen, Tragfähigkeit, Gründungsempfehlung, Aushub- und Entsorgungskosten.
- Grundwasserstand, Schichtenwasser, Versickerungsfähigkeit, Radon.
- Empfohlene weitere Untersuchungen und deren grobe Kostenfolge.
- Jeder Befund mit Kostenfolge gehört als eigener Punkt in "risks".
- Kaufpreis ist hier nicht enthalten: askingPrice null lassen.`,

  sonstiges: `SCHWERPUNKT ALLGEMEIN:
- Ermittle zunächst selbst, um welche Art Dokument es sich handelt, und benenne das im "summary".
- Extrahiere alles, was für die Kaufentscheidung eines Baugrundstücks relevant ist.
- Trage nur ein, was wirklich im Dokument steht — rate nichts.`
}

export function buildDocumentPrompt(fileName: string, docType: string): string {
  const label = DOC_TYPE_LABELS[docType] || DOC_TYPE_LABELS.sonstiges
  const focus = FOCUS_BY_TYPE[docType] || FOCUS_BY_TYPE.sonstiges

  return `Du bist ein erfahrener deutscher Sachverständiger und Immobilienanalyst für Baugrundstücke.
Analysiere das angehängte Dokument (${fileName}), es handelt sich um: ${label}.

${focus}

GRUNDREGELN:
- Erfinde keine Werte. Was nicht im Dokument steht, ist null bzw. wird weggelassen.
- Beziehe dich in Risiken und offenen Fragen möglichst konkret auf das Dokument
  (Seitenzahl, laufende Nummer, Paragraf), damit man es nachschlagen kann.
- Schreibe alle Texte auf Deutsch.

Antworte AUSSCHLIESSLICH als gültiges JSON in genau dieser Struktur:
{
  "summary": "Prägnante deutsche Zusammenfassung (2-4 Sätze), beginnend mit der Dokumentart",
  "extracted": {
    "title": "Titel oder Bezeichnung des Grundstücks oder null",
    "address": "Straße, Hausnummer, PLZ, Ort oder null",
    "askingPrice": 123000,
    "areaSqm": 650,
    "pricePerSqm": 250,
    "flurstueck": {
      "gemarkung": "Name der Gemarkung oder null",
      "flur": 1,
      "zaehler": 123,
      "nenner": null,
      "kennzeichen": "20-stelliges Kennzeichen oder null"
    },
    "buildingLaw": "z. B. 'B-Plan Nr. 12', '§34 BauGB', '§35 Außenbereich' oder null",
    "grz": 0.2,
    "gfz": 0.4,
    "developmentStatus": "voll erschlossen / teilerschlossen / unerschlossen oder null",
    "broker": {
      "name": null,
      "company": null,
      "email": null,
      "phone": null
    }
  },
  "riskAssessment": {
    "risks": ["Konkretes Risiko mit Fundstelle im Dokument", "..."],
    "positives": ["Belastbarer Vorteil aus dem Dokument", "..."],
    "openQuestionsForBroker": ["Präzise Frage an den Makler/Eigentümer", "..."]
  }
}`
}
