import { GoogleGenAI } from '@google/genai'
import { buildDocumentPrompt, DOC_TYPE_LABELS } from './geminiPrompts'

export function getGeminiClient(): GoogleGenAI | null {
  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return null
  }
  return new GoogleGenAI({ apiKey })
}

export function getGeminiModel(): string {
  const config = useRuntimeConfig()
  return config.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash'
}

/**
 * Parst die JSON-Antwort des Modells und räumt eventuelle Markdown-Codefences weg.
 */
function parseJsonResponse(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(cleaned)
  }
}

/**
 * Das Modell hält sich nicht immer an die vorgegebene Form: offene Fragen kommen mal als
 * String, mal als {question: "..."}, Risiken mal als Objekt, mal als blanker String.
 * Hier wird beides auf eine feste Form gebracht, damit UI und Folge-Prompts sich darauf
 * verlassen können.
 */
function toStringList(value: any): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(entry => {
      if (typeof entry === 'string') return entry.trim()
      if (entry && typeof entry === 'object') {
        const candidate = entry.question ?? entry.title ?? entry.text ?? entry.frage
        if (typeof candidate === 'string') return candidate.trim()
      }
      return ''
    })
    .filter(Boolean)
}

function toItemList(value: any, defaultSeverity?: string): Array<Record<string, any>> {
  if (!Array.isArray(value)) return []
  return value
    .map(entry => {
      if (typeof entry === 'string') {
        const item: Record<string, any> = { title: entry.trim() }
        if (defaultSeverity) item.severity = defaultSeverity
        return item
      }
      if (entry && typeof entry === 'object') {
        const title = entry.title ?? entry.risk ?? entry.text ?? entry.name
        if (typeof title !== 'string' || !title.trim()) return null
        const item: Record<string, any> = { ...entry, title: title.trim() }
        if (defaultSeverity && !item.severity) item.severity = defaultSeverity
        return item
      }
      return null
    })
    .filter((entry): entry is Record<string, any> => !!entry)
}

export async function analyzeDocumentWithGemini(pdfBuffer: Buffer, fileName: string, docType: string) {
  const client = getGeminiClient()
  const modelName = getGeminiModel()

  if (!client) {
    // Fallback when no API Key is configured
    return {
      isSimulated: true,
      summary: `[Simulierte Analyse für ${fileName} (${DOC_TYPE_LABELS[docType] || docType})]: Kein GEMINI_API_KEY in .env hinterlegt. Trage deinen API-Key in den Einstellungen oder in der .env ein, um die Live-Analyse zu aktivieren.`,
      extracted: {
        title: fileName.replace(/\.[^/.]+$/, ''),
        address: 'Musterstraße 12, Potsdam',
        askingPrice: null,
        areaSqm: null,
        pricePerSqm: null,
        flurstueck: {
          gemarkung: 'Potsdam',
          flur: null,
          zaehler: null,
          nenner: null,
          kennzeichen: null
        },
        buildingLaw: 'B-Plan',
        grz: 0.25,
        gfz: 0.5,
        developmentStatus: 'erschlossen',
        broker: {
          name: '',
          company: '',
          email: '',
          phone: ''
        }
      },
      riskAssessment: {
        risks: [
          'Erschließungsbeiträge nach KAG noch ungeklärt',
          'Altlastenverdachtskataster nicht im Exposé erwähnt',
          'Baulastenverzeichnis muss beim Landkreis eingesehen werden'
        ],
        positives: [
          'Gute Lage und Zuschnitt',
          'Wohnbebauung grundsätzlich zulässig'
        ],
        openQuestionsForBroker: [
          'Liegen noch offene Erschließungsbeiträge vor?',
          'Gibt es Eintragungen im Baulastenverzeichnis?',
          'Liegt ein aktueller Grundbuchauszug (Abt. II) vor?'
        ]
      }
    }
  }

  const prompt = buildDocumentPrompt(fileName, docType)

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfBuffer.toString('base64')
              }
            },
            {
              text: prompt
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    })

    const parsed = parseJsonResponse(response.text || '')
    return {
      isSimulated: false,
      ...parsed,
      // Die Dokument-Ansicht rendert diese Listen als reinen Text.
      riskAssessment: {
        ...(parsed.riskAssessment || {}),
        risks: toStringList(parsed.riskAssessment?.risks),
        positives: toStringList(parsed.riskAssessment?.positives),
        openQuestionsForBroker: toStringList(parsed.riskAssessment?.openQuestionsForBroker)
      }
    }
  } catch (err: any) {
    console.error('Gemini Analysis Error:', err)
    throw new Error(`Fehler bei der Gemini-Analyse: ${err.message}`)
  }
}

/**
 * Zerlegt eine eingefügte oder als .eml hochgeladene E-Mail in strukturierte Felder
 * und zieht daraus die für die Grundstücksakte relevanten Schlüsse.
 * Schreibt nichts in die Datenbank - das Ergebnis wird dem Nutzer zur Bestätigung vorgelegt.
 */
export async function parseEmailWithGemini(
  rawText: string,
  propertyContext: {
    title?: string
    address?: string
    brokerEmail?: string | null
    brokerName?: string | null
    ownEmail?: string | null
    checklistTitles?: string[]
  }
) {
  const client = getGeminiClient()
  const modelName = getGeminiModel()

  if (!client) {
    // Heuristischer Fallback ohne API-Key: Header-Zeilen grob auslesen.
    const grab = (labels: string[]) => {
      for (const label of labels) {
        const match = rawText.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im'))
        if (match?.[1]) return match[1].trim()
      }
      return null
    }
    const emailIn = (value: string | null) => value?.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || null

    const from = grab(['From', 'Von', 'Absender'])
    const to = grab(['To', 'An', 'Empfänger'])
    const subject = grab(['Subject', 'Betreff'])

    return {
      isSimulated: true,
      subject: subject || 'E-Mail ohne Betreff',
      fromAddress: emailIn(from) || propertyContext.brokerEmail || null,
      toAddress: emailIn(to) || propertyContext.ownEmail || null,
      occurredAt: null,
      direction: 'inbound',
      bodyText: rawText.trim(),
      summary: '[Kein GEMINI_API_KEY aktiv] Die Mail wurde unverändert übernommen. Betreff, Absender und Datum bitte im Formular prüfen und ergänzen.',
      insights: {
        commitments: [],
        facts: [],
        checklistUpdates: [],
        suggestedFollowUpDate: null,
        openQuestions: []
      }
    }
  }

  const prompt = `Du bist Assistent für eine Grundstücksakte. Der Nutzer hat den Rohtext einer E-Mail
aus seinem Mailprogramm eingefügt (oder eine .eml-Datei hochgeladen). Zerlege sie in strukturierte Felder.

KONTEXT ZUM GRUNDSTÜCK:
- Titel: ${propertyContext.title || 'unbekannt'}
- Adresse: ${propertyContext.address || 'unbekannt'}
- Bekannter Makler: ${propertyContext.brokerName || 'unbekannt'} <${propertyContext.brokerEmail || 'unbekannt'}>
- Eigene Adresse des Nutzers: ${propertyContext.ownEmail || 'unbekannt'}
- Vorhandene Checklisten-Punkte: ${(propertyContext.checklistTitles || []).join(' | ') || 'keine'}

REGELN:
- "direction" ist "inbound", wenn die Mail beim Nutzer eingegangen ist (Absender = Makler),
  und "outbound", wenn der Nutzer sie geschrieben hat.
- "occurredAt" ist das Datum der Mail als ISO-8601-String mit Zeitzone, falls erkennbar, sonst null.
- "bodyText" ist der reine Nachrichtentext OHNE Header-Zeilen und OHNE zitierten Vorgängertext.
- "commitments" sind konkrete Zusagen mit Bezug zu wem und bis wann
  (z. B. "Makler sendet Grundbuchauszug bis Freitag").
- "facts" sind harte Grundstücksdaten, die die Mail nennt. Erlaubte "field"-Werte:
  askingPrice, areaSqm, pricePerSqm, buildingLaw, grz, gfz, developmentStatus, address.
  "quote" ist der wörtliche Satz aus der Mail, der den Wert belegt.
- "checklistUpdates" nur für Punkte, die wirklich in der obigen Liste stehen; "status" ist
  "received" (Unterlage lag bei oder wurde geschickt), "requested" (wurde angefordert)
  oder "not_applicable". Bei leerer Liste ein leeres Array zurückgeben.
- "suggestedFollowUpDate" nur setzen, wenn die Mail eine Frist, einen Termin oder eine
  Zusage mit Zeitbezug enthält (ISO-Datum JJJJ-MM-TT), sonst null.
- Erfinde nichts. Fehlende Angaben sind null bzw. leere Arrays.

ROHTEXT DER E-MAIL:
"""
${rawText.slice(0, 60000)}
"""

Antworte AUSSCHLIESSLICH als gültiges JSON:
{
  "subject": "Betreff der Mail",
  "fromAddress": "absender@example.de",
  "toAddress": "empfaenger@example.de",
  "occurredAt": "2026-03-12T09:24:00+01:00",
  "direction": "inbound",
  "bodyText": "Reiner Nachrichtentext...",
  "summary": "Ein bis zwei Sätze, worum es in der Mail geht",
  "insights": {
    "commitments": ["..."],
    "facts": [{ "field": "askingPrice", "value": 389000, "quote": "..." }],
    "checklistUpdates": [{ "title": "Grundbuchauszug", "status": "received" }],
    "suggestedFollowUpDate": "2026-03-20",
    "openQuestions": ["..."]
  }
}`

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    })

    const parsed = parseJsonResponse(response.text || '')
    return {
      isSimulated: false,
      ...parsed,
      // Der Originaltext ist die verlässlichere Quelle, falls das Modell den Body verschluckt.
      bodyText: parsed.bodyText || rawText.trim()
    }
  } catch (err: any) {
    console.error('Gemini Email Parse Error:', err)
    throw new Error(`Fehler beim Auswerten der E-Mail: ${err.message}`)
  }
}

/**
 * Gesamtbewertung eines Grundstücks: fasst alle Dokumentanalysen, den Mailverlauf
 * und die amtlichen Geodaten zu einer Einschätzung mit Score zusammen.
 */
export async function analyzePropertyOverall(input: {
  property: any
  documents: Array<{ id: string, fileName: string, docType: string, aiSummary?: string | null, aiRiskAssessmentJson?: string | null }>
  emails: Array<{ subject?: string | null, direction: string, occurredAt?: number | null, createdAt: number, summary: string, bodyText?: string | null }>
  checklist: Array<{ title: string, status: string }>
}) {
  const client = getGeminiClient()
  const modelName = getGeminiModel()

  const { property, documents, emails, checklist } = input
  const parcel = property.parcel
  const pricePerSqm = property.pricePerSqm
    || (property.askingPrice && property.areaSqm ? property.askingPrice / property.areaSqm : null)
  const boris = parcel?.borisBodenrichtwert || null
  const deviation = pricePerSqm && boris ? ((pricePerSqm - boris) / boris) * 100 : null

  if (!client) {
    const risks: string[] = []
    for (const doc of documents) {
      try {
        const assessment = doc.aiRiskAssessmentJson ? JSON.parse(doc.aiRiskAssessmentJson) : null
        for (const risk of assessment?.risks || []) risks.push(`${risk} (aus ${doc.fileName})`)
      } catch {}
    }
    const openChecklist = checklist.filter(c => c.status === 'missing' || c.status === 'requested')

    return {
      isSimulated: true,
      scoreOverall: null,
      verdict: 'Simulierte Bewertung ohne API-Key',
      summary: `[Kein GEMINI_API_KEY aktiv] Zusammengetragen wurden ${documents.length} Dokument(e), ${emails.length} E-Mail(s) und ${openChecklist.length} offene Checklisten-Punkte. Für eine echte Bewertung trage deinen Gemini-Key in den Einstellungen ein.`,
      risks: risks.map(title => ({ title, severity: 'mittel', source: 'Dokumentanalyse' })),
      opportunities: [],
      openQuestions: openChecklist.map(c => `${c.title} liegt noch nicht vor - beim Makler nachfassen.`),
      priceAssessment: {
        verdict: deviation === null ? 'nicht bewertbar' : deviation > 0 ? 'über Bodenrichtwert' : 'unter Bodenrichtwert',
        fairPricePerSqm: boris,
        deviationPercent: deviation === null ? null : Math.round(deviation * 10) / 10,
        reasoning: boris
          ? `Angebotspreis ${pricePerSqm ? Math.round(pricePerSqm) : '?'} €/m² gegenüber BORIS-Bodenrichtwert ${boris} €/m².`
          : 'Kein BORIS-Bodenrichtwert hinterlegt - Einordnung nicht möglich.'
      }
    }
  }

  const docBlock = documents.length
    ? documents.map(doc => {
        let riskLines = ''
        try {
          const assessment = doc.aiRiskAssessmentJson ? JSON.parse(doc.aiRiskAssessmentJson) : null
          const risks = assessment?.risks || []
          const positives = assessment?.positives || []
          if (risks.length) riskLines += `\n  Risiken: ${risks.join(' | ')}`
          if (positives.length) riskLines += `\n  Positiv: ${positives.join(' | ')}`
        } catch {}
        return `- [${DOC_TYPE_LABELS[doc.docType] || doc.docType}] ${doc.fileName}\n  ${doc.aiSummary || 'Keine Zusammenfassung vorhanden.'}${riskLines}`
      }).join('\n')
    : 'Bisher keine Dokumente analysiert.'

  const mailBlock = emails.length
    ? emails.map(mail => {
        const when = new Date(mail.occurredAt || mail.createdAt).toLocaleDateString('de-DE')
        const who = mail.direction === 'inbound' ? 'vom Makler' : 'an den Makler'
        return `- ${when} ${who}: ${mail.subject ? `"${mail.subject}" - ` : ''}${mail.summary}`
      }).join('\n')
    : 'Bisher kein Mailverkehr erfasst.'

  const prompt = `Du bist ein nüchterner deutscher Grundstücks-Gutachter. Bewerte das folgende
Baugrundstück als Kaufobjekt auf Basis ALLER vorliegenden Informationen.

STAMMDATEN:
- Titel: ${property.title}
- Adresse: ${property.address || 'k.A.'}
- Status im Prozess: ${property.status}
- Kaufpreis: ${property.askingPrice ? property.askingPrice.toLocaleString('de-DE') + ' €' : 'k.A.'}
- Fläche: ${property.areaSqm ? property.areaSqm + ' m²' : 'k.A.'}
- Preis pro m²: ${pricePerSqm ? Math.round(pricePerSqm) + ' €/m²' : 'k.A.'}
- Baurecht: ${property.buildingLaw || 'k.A.'} (GRZ ${property.grz ?? 'k.A.'}, GFZ ${property.gfz ?? 'k.A.'})
- Erschließung: ${property.developmentStatus || 'k.A.'}
- Notizen: ${property.notes || 'keine'}

AMTLICHE GEODATEN (ALKIS/BORIS Brandenburg):
- Flurstück: ${parcel?.flstkennz || 'k.A.'} (Gemarkung ${parcel?.gemarkungName || 'k.A.'}, Flur ${parcel?.flur ?? 'k.A.'}, Zähler ${parcel?.zaehler ?? 'k.A.'})
- Amtliche Fläche: ${parcel?.officialArea ? parcel.officialArea + ' m²' : 'k.A.'}
- BORIS-Bodenrichtwert: ${boris ? boris + ' €/m² (Stichtag ' + (parcel?.borisStichtag || 'k.A.') + ')' : 'k.A.'}
- Entwicklungszustand: ${parcel?.borisEntwicklungszustand || 'k.A.'}
- Abweichung Angebotspreis zum Bodenrichtwert: ${deviation === null ? 'nicht berechenbar' : Math.round(deviation) + ' %'}

ANALYSIERTE DOKUMENTE:
${docBlock}

MAILVERLAUF MIT DEM MAKLER:
${mailBlock}

UNTERLAGEN-CHECKLISTE:
${checklist.map(c => `- ${c.title}: ${c.status}`).join('\n') || 'keine Punkte angelegt'}

DEINE AUFGABE:
1. Fasse Risiken aus ALLEN Quellen zusammen und entferne Dopplungen: taucht dasselbe Risiko
   in mehreren Dokumenten auf, nenne es einmal und verweise in "source" auf alle Fundstellen.
2. Ordne den Kaufpreis gegen den Bodenrichtwert ein. Berücksichtige dabei Zuschnitt, Baurecht
   und Erschließungsstand - ein Aufschlag auf den Bodenrichtwert kann bei baureifem,
   voll erschlossenem Land gerechtfertigt sein.
3. Vergib einen Score von 0 bis 100 für die Attraktivität als Kaufobjekt
   (0 = Finger weg, 50 = durchschnittlich, 100 = außergewöhnlich gute Gelegenheit).
   Fehlende Unterlagen drücken den Score, weil sie das Risiko unkalkulierbar machen -
   sage das im "summary" ausdrücklich, statt Sicherheit vorzutäuschen.
4. Formuliere offene Fragen so, dass sie direkt in eine Mail an den Makler übernommen
   werden können.
5. "severity" ist "hoch", "mittel" oder "niedrig".

Antworte AUSSCHLIESSLICH als gültiges JSON:
{
  "scoreOverall": 68,
  "verdict": "Kurzes Fazit in maximal 8 Wörtern",
  "summary": "3-5 Sätze Gesamteinschätzung inklusive Hinweis auf die Belastbarkeit der Datenlage",
  "risks": [{ "title": "...", "severity": "hoch", "source": "Grundbuchauszug Abt. II lfd. Nr. 2" }],
  "opportunities": [{ "title": "...", "source": "..." }],
  "openQuestions": ["..."],
  "priceAssessment": {
    "verdict": "z. B. 'leicht über Marktniveau'",
    "fairPricePerSqm": 280,
    "deviationPercent": 12.5,
    "reasoning": "Begründung in 1-2 Sätzen"
  }
}`

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3
      }
    })

    const parsed = parseJsonResponse(response.text || '')
    return {
      isSimulated: false,
      ...parsed,
      risks: toItemList(parsed.risks, 'mittel'),
      opportunities: toItemList(parsed.opportunities),
      openQuestions: toStringList(parsed.openQuestions)
    }
  } catch (err: any) {
    console.error('Gemini Property Analysis Error:', err)
    throw new Error(`Fehler bei der Gesamtanalyse: ${err.message}`)
  }
}

export async function chatWithProperty(
  history: Array<{ role: 'user' | 'assistant', message: string }>,
  newQuestion: string,
  propertyData: any,
  documentsSummary: string
) {
  const client = getGeminiClient()
  const modelName = getGeminiModel()

  if (!client) {
    return `[KI-Assistent - Kein GEMINI_API_KEY aktiv]: Zum Grundstück "${propertyData.title}" (${propertyData.address || 'Keine Adresse'}): Aktuell ist kein Gemini API Key in .env konfiguriert. Bitte hinterlege deinen Key in den Einstellungen, um KI-Antworten zu erhalten. Zu deiner Frage "${newQuestion}": Im Exposé wird eine Fläche von ${propertyData.areaSqm || 'unbekannt'} m² und ein Kaufpreis von ${propertyData.askingPrice ? propertyData.askingPrice.toLocaleString('de-DE') + ' €' : 'k.A.'} angegeben.`
  }

  const systemInstruction = `Du bist ein präziser, hilfreicher Immobilien-Experte für Grundstücke und Baurecht in Deutschland/Brandenburg.
Der Nutzer stellt Fragen zu einem konkreten Grundstück und dessen hochgeladenen Dokumenten.

Grundstücksdaten:
- Titel: ${propertyData.title}
- Status: ${propertyData.status}
- Adresse: ${propertyData.address || 'Nicht angegeben'}
- Kaufpreis: ${propertyData.askingPrice ? propertyData.askingPrice + ' €' : 'k.A.'}
- Fläche: ${propertyData.areaSqm ? propertyData.areaSqm + ' m²' : 'k.A.'}
- Baurecht: ${propertyData.buildingLaw || 'k.A.'} (GRZ: ${propertyData.grz || 'k.A.'}, GFZ: ${propertyData.gfz || 'k.A.'})
- Erschließungsstatus: ${propertyData.developmentStatus || 'k.A.'}
- BORIS Bodenrichtwert: ${propertyData.parcel?.borisBodenrichtwert ? propertyData.parcel.borisBodenrichtwert + ' €/m²' : 'k.A.'}

Zusammenfassungen vorliegender Dokumente:
${documentsSummary || 'Bisher keine Dokumente hochgeladen.'}

Antworte fundiert, sachlich und auf Deutsch. Weise den Nutzer darauf hin, wenn Angaben in den Dokumenten fehlen und beim Bauamt oder Makler nachgefragt werden sollten.`

  const contents = [
    {
      role: 'user',
      parts: [{ text: systemInstruction }]
    },
    {
      role: 'model',
      parts: [{ text: 'Verstanden! Ich kenne die Daten und Dokumente des Grundstücks. Wie kann ich helfen?' }]
    }
  ]

  for (const h of history) {
    contents.push({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.message }]
    })
  }

  contents.push({
    role: 'user',
    parts: [{ text: newQuestion }]
  })

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents
    })

    return response.text || 'Keine Antwort erhalten.'
  } catch (err: any) {
    console.error('Gemini Chat Error:', err)
    throw new Error(`Fehler im KI-Chat: ${err.message}`)
  }
}

export async function generateBrokerEmail(
  propertyData: any,
  brokerData: any,
  missingItems: string[],
  openQuestions: string[] = []
) {
  const client = getGeminiClient()
  const modelName = getGeminiModel()

  const brokerSalutation = brokerData?.name ? `Sehr geehrte(r) Herr/Frau ${brokerData.name}` : 'Sehr geehrte Damen und Herren'

  if (!client) {
    const questionBlock = openQuestions.length
      ? `\n\nDarüber hinaus haben sich aus der Prüfung folgende Fragen ergeben:\n${openQuestions.map(q => `- ${q}`).join('\n')}`
      : ''

    return `${brokerSalutation},

vielen Dank für die bisherigen Informationen zum Grundstück "${propertyData.title}" (${propertyData.address || ''}).

Für eine fundierte Prüfung und Vorbereitung unseres Bauvorhabens sowie der Finanzierung benötigen wir noch folgende Unterlagen:
${missingItems.map(item => `- ${item}`).join('\n')}${questionBlock}

Könnten Sie uns diese Dokumente freundlicherweise zukommen lassen oder mitteilen, bis wann diese vorliegen?

Vielen Dank im Voraus für Ihre Unterstützung!

Mit freundlichen Grüßen
`
  }

  const questionSection = openQuestions.length
    ? `\nZusätzlich sind aus der KI-Gesamtanalyse des Grundstücks diese Fragen offen geblieben:\n${openQuestions.map(q => `- ${q}`).join('\n')}\nArbeite sie als höflich formulierte Rückfragen in die Mail ein.`
    : ''

  const prompt = `Erstelle einen professionellen, freundlichen und verbindlichen E-Mail-Entwurf auf Deutsch an einen Makler/Eigentümer.
Grundstück: "${propertyData.title}" in ${propertyData.address || 'Brandenburg'}
Makler: ${brokerData?.name || 'Ansprechpartner'} (${brokerData?.company || 'Maklerbüro'})

Der Interessent benötigt folgende fehlende Unterlagen/Auskünfte:
${missingItems.map(item => `- ${item}`).join('\n')}${questionSection}

AUSGABEFORMAT - halte dich exakt daran:
- Gib NUR die E-Mail aus. Keine Vorrede wie "Hier ist ein Entwurf", keine Erklärung danach,
  keine Trennlinien, keine Markdown-Formatierung (kein **, kein #).
- Erste Zeile: "Betreff: ..." - danach eine Leerzeile, dann die Anrede.
- Schließe mit "Mit freundlichen Grüßen" und einer Leerzeile für den Namen.`

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    })

    // Falls das Modell doch eine Vorrede oder Markdown einstreut: ab "Betreff:"
    // beginnt die eigentliche Mail, Sternchen und Trennlinien fliegen raus.
    const raw = response.text || ''
    const subjectAt = raw.search(/^\s*\**Betreff\**\s*:/im)
    const body = subjectAt >= 0 ? raw.slice(subjectAt) : raw
    return body
      .replace(/^\s*[*_-]{3,}\s*$/gm, '')
      .replace(/\*\*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } catch (err: any) {
    console.error('Gemini Email Generator Error:', err)
    return `${brokerSalutation},\n\nbezugnehmend auf das Grundstück ${propertyData.title} bitten wir um Übersendung folgender Unterlagen:\n${missingItems.join('\n')}`
  }
}
