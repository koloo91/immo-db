import { extractText, getDocumentProxy } from 'unpdf'

export interface ExtractedPdfText {
  pages: string[]
  pageCount: number
  /**
   * false, wenn das PDF keinerlei Text enthält (reines Bild-/Scan-PDF).
   * Gemessen am tatsächlich extrahierten Text - nicht an /Font-Referenzen im Rohbyte-Strom:
   * moderne PDFs legen Schriften in Objekt-Streams ab, dort greift eine Byte-Heuristik daneben.
   */
  hasTextLayer: boolean
}

/**
 * Zieht den Text eines PDFs seitenweise heraus. Seitenweise deshalb, weil ein Suchtreffer
 * auf "Seite 12 des Grundbuchauszugs" zeigen soll und nicht bloß auf die Datei.
 */
export async function extractPdfPages(buffer: Buffer): Promise<ExtractedPdfText> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const result = await extractText(pdf, { mergePages: false })

  const pages = (Array.isArray(result.text) ? result.text : [String(result.text)])
    .map(page => normalizeWhitespace(page))

  return {
    pages,
    pageCount: result.totalPages ?? pages.length,
    hasTextLayer: pages.some(page => page.length > 0)
  }
}

/**
 * PDF-Textextraktion liefert oft zerrissene Zeilen und doppelte Leerzeichen.
 * Für die Suche ist kompakter Text besser - Zeilenumbrüche bleiben als Absatztrenner erhalten.
 */
function normalizeWhitespace(text: string): string {
  return (text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
