// Minimalistischer MIME-Parser für .eml-Dateien.
// Bewusst ohne zusätzliche Dependency: wir brauchen nur den Klartext-Body,
// ein paar Header und die Dateianhänge. Der Feinschliff (Absender erkennen,
// Zitate abtrennen) passiert danach ohnehin im Modell.

export interface EmlAttachment {
  fileName: string
  mimeType: string
  data: Buffer
}

export interface ParsedEml {
  headerText: string // "Von: ... / An: ... / Betreff: ..." als Vorspann für das Modell
  bodyText: string
  subject: string | null
  from: string | null
  to: string | null
  date: string | null
  attachments: EmlAttachment[]
}

interface MimePart {
  headers: Record<string, string>
  body: Buffer
}

function splitHeadersAndBody(raw: string): { headers: Record<string, string>, body: string } {
  const separator = raw.search(/\r?\n\r?\n/)
  const headerBlock = separator === -1 ? raw : raw.slice(0, separator)
  const body = separator === -1 ? '' : raw.slice(separator).replace(/^\r?\n\r?\n/, '')

  // Gefaltete Header-Zeilen (Fortsetzung beginnt mit Whitespace) wieder zusammenziehen
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, ' ')
  const headers: Record<string, string> = {}
  for (const line of unfolded.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/)
    if (match) {
      headers[match[1].toLowerCase()] = match[2].trim()
    }
  }

  return { headers, body }
}

function decodeQuotedPrintable(input: string): Buffer {
  const withoutSoftBreaks = input.replace(/=\r?\n/g, '')
  const bytes: number[] = []
  for (let i = 0; i < withoutSoftBreaks.length; i++) {
    const char = withoutSoftBreaks[i]
    if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(withoutSoftBreaks.substr(i + 1, 2))) {
      bytes.push(parseInt(withoutSoftBreaks.substr(i + 1, 2), 16))
      i += 2
    } else {
      bytes.push(char.charCodeAt(0) & 0xff)
    }
  }
  return Buffer.from(bytes)
}

function decodeBody(body: string, encoding: string): Buffer {
  const enc = (encoding || '7bit').toLowerCase()
  if (enc === 'base64') return Buffer.from(body.replace(/\s/g, ''), 'base64')
  if (enc === 'quoted-printable') return decodeQuotedPrintable(body)
  return Buffer.from(body, 'binary')
}

function charsetOf(contentType: string): BufferEncoding {
  const match = contentType.match(/charset="?([^";\s]+)"?/i)
  const charset = (match?.[1] || 'utf-8').toLowerCase()
  if (charset === 'utf-8' || charset === 'utf8') return 'utf8'
  if (charset === 'us-ascii' || charset === 'ascii') return 'ascii'
  // iso-8859-1 / windows-1252 liegen nah genug an latin1
  return 'latin1'
}

/** Dekodiert RFC-2047-Header wie =?UTF-8?Q?Betreff=20mit=20Umlaut?= */
function decodeHeaderValue(value: string): string {
  if (!value) return value
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_full, charset, mode, text) => {
    try {
      const buffer = mode.toUpperCase() === 'B'
        ? Buffer.from(text, 'base64')
        : decodeQuotedPrintable(String(text).replace(/_/g, ' '))
      return buffer.toString(charsetOf(`charset=${charset}`))
    } catch {
      return text
    }
  }).replace(/\?=\s+=\?/g, '').trim()
}

function fileNameOf(headers: Record<string, string>): string | null {
  const disposition = headers['content-disposition'] || ''
  const contentType = headers['content-type'] || ''
  const match = disposition.match(/filename\*?="?([^";]+)"?/i) || contentType.match(/name\*?="?([^";]+)"?/i)
  return match?.[1] ? decodeHeaderValue(match[1].trim()) : null
}

/** Zerlegt einen multipart-Body rekursiv in seine Einzelteile. */
function collectParts(headers: Record<string, string>, body: string, out: MimePart[]) {
  const contentType = headers['content-type'] || 'text/plain'

  if (!/^multipart\//i.test(contentType)) {
    out.push({ headers, body: decodeBody(body, headers['content-transfer-encoding'] || '') })
    return
  }

  const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i)
  if (!boundaryMatch) {
    out.push({ headers, body: decodeBody(body, headers['content-transfer-encoding'] || '') })
    return
  }

  const boundary = `--${boundaryMatch[1]}`
  const segments = body.split(boundary)
  // Erstes Segment ist die Präambel, letztes der Abschluss "--"
  for (const segment of segments.slice(1)) {
    if (/^--/.test(segment.trim()) || !segment.trim()) continue
    const child = splitHeadersAndBody(segment.replace(/^\r?\n/, ''))
    collectParts(child.headers, child.body, out)
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function parseEml(raw: Buffer): ParsedEml {
  const { headers, body } = splitHeadersAndBody(raw.toString('binary'))

  const parts: MimePart[] = []
  collectParts(headers, body, parts)

  let plain = ''
  let html = ''
  const attachments: EmlAttachment[] = []

  for (const part of parts) {
    const contentType = part.headers['content-type'] || 'text/plain'
    const disposition = part.headers['content-disposition'] || ''
    const fileName = fileNameOf(part.headers)
    const isAttachment = /attachment/i.test(disposition) || (!!fileName && !/^text\/(plain|html)/i.test(contentType))

    if (isAttachment && fileName && part.body.length > 0) {
      attachments.push({
        fileName,
        mimeType: (contentType.split(';')[0] || 'application/octet-stream').trim().toLowerCase(),
        data: part.body
      })
      continue
    }

    if (/^text\/plain/i.test(contentType) && !plain) {
      plain = part.body.toString(charsetOf(contentType))
    } else if (/^text\/html/i.test(contentType) && !html) {
      html = part.body.toString(charsetOf(contentType))
    }
  }

  const subject = headers.subject ? decodeHeaderValue(headers.subject) : null
  const from = headers.from ? decodeHeaderValue(headers.from) : null
  const to = headers.to ? decodeHeaderValue(headers.to) : null
  const date = headers.date || null

  const bodyText = (plain || (html ? htmlToText(html) : '')).trim()

  const headerText = [
    from ? `Von: ${from}` : null,
    to ? `An: ${to}` : null,
    date ? `Datum: ${date}` : null,
    subject ? `Betreff: ${subject}` : null
  ].filter(Boolean).join('\n')

  return { headerText, bodyText, subject, from, to, date, attachments }
}
