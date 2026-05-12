import { useMemo } from 'react'

// ── Section detection ─────────────────────────────────────────────────────────
const SECTIONS = [
  {
    icon: '✈️', label: 'Transporte',
    color: '#1565A0', bg: '#EFF6FF',
    rx: /vuelo|aerolin|latam|sky|avianca|jetsmart|bus\b|cruz del sur|oltursa|tepsa|aeropuerto|terminal|boleto|pasaje/i,
  },
  {
    icon: '🏨', label: 'Hospedaje',
    color: '#2D6A4F', bg: '#F0FDF4',
    rx: /hotel|hostal|hospedaje|alojamiento|habitaci|lodge|resort|airbnb/i,
  },
  {
    icon: '🍽️', label: 'Alimentación y Movilidad',
    color: '#B45309', bg: '#FFFBEB',
    rx: /restaurante|comida|almuerzo|desayuno|cena|plato|gastronomia|taxi|mototaxi|uber|transporte local/i,
  },
  {
    icon: '🗺️', label: 'Turismo',
    color: '#6D28D9', bg: '#F5F3FF',
    rx: /museo|plaza|parque|iglesia|catedral|ruinas|machu picchu|tour\b|excursion|mirador|atraccion|visitar/i,
  },
  {
    icon: '☁️', label: 'Clima',
    color: '#0E7490', bg: '#ECFEFF',
    rx: /clima|temperatura|lluvia|sol\b|calor|fr[ií]o|humedad|viento|pron[oó]stico|meteorolog/i,
  },
]

function detectSection(text) {
  const sample = text.toLowerCase().slice(0, 800)
  for (const s of SECTIONS) {
    if (s.rx.test(sample)) return s
  }
  return null
}

// ── Inline markdown renderer ──────────────────────────────────────────────────
const INLINE_RX = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[Fuente:\s*[^\]\n]+\]|\[[^\]\n]+\]\([^)\n]+\))/g

function renderInline(text) {
  const parts = []
  let lastIdx = 0, i = 0, match
  INLINE_RX.lastIndex = 0
  while ((match = INLINE_RX.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index))
    const m = match[0]
    if (m.startsWith('**'))        parts.push(<strong key={i++}>{m.slice(2, -2)}</strong>)
    else if (m.startsWith('*'))    parts.push(<em key={i++}>{m.slice(1, -1)}</em>)
    else if (m.startsWith('`'))    parts.push(<code key={i++} className="md-code">{m.slice(1, -1)}</code>)
    else if (m.startsWith('[Fuente:')) {
      const url = m.slice(8, -1).trim()
      parts.push(<a key={i++} href={url} target="_blank" rel="noreferrer" className="md-source">🔗 Fuente</a>)
    } else {
      const txt = (m.match(/\[([^\]]+)\]/) || [])[1] ?? ''
      const url = (m.match(/\(([^)]+)\)/) || [])[1] ?? '#'
      parts.push(<a key={i++} href={url} target="_blank" rel="noreferrer" className="md-link">{txt}</a>)
    }
    lastIdx = match.index + m.length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts.length ? parts : [text]
}

// ── Block markdown parser ─────────────────────────────────────────────────────
function isSepRow(line) {
  const t = line.trim()
  return t.startsWith('|') && t.split('|').slice(1, -1).every(c => /^[\s:-]+$/.test(c))
}

function parseMarkdown(text) {
  const lines = text.split('\n')
  const out = []
  let i = 0, k = 0
  const K = () => k++

  while (i < lines.length) {
    const raw  = lines[i]
    const line = raw.trim()
    if (!line) { i++; continue }

    // Table
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        if (!isSepRow(lines[i])) rows.push(lines[i].trim())
        i++
      }
      if (rows.length >= 2) {
        const cells = r => r.split('|').slice(1, -1).map(c => c.trim())
        const [hdr, ...body] = rows
        out.push(
          <div key={K()} className="md-table-wrap">
            <table className="md-table">
              <thead><tr>{cells(hdr).map((h, j) => <th key={j}>{renderInline(h)}</th>)}</tr></thead>
              <tbody>
                {body.map((r, ri) => (
                  <tr key={ri}>{cells(r).map((c, ci) => <td key={ci}>{renderInline(c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // Unordered list
    if (/^[-*•]\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*•]\s/.test(lines[i]) && lines[i].trim()) {
        items.push(<li key={i}>{renderInline(lines[i].trim().replace(/^[-*•]\s/, ''))}</li>)
        i++
      }
      out.push(<ul key={K()} className="md-ul">{items}</ul>)
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim()) && lines[i].trim()) {
        items.push(<li key={i}>{renderInline(lines[i].trim().replace(/^\d+\.\s*/, ''))}</li>)
        i++
      }
      out.push(<ol key={K()} className="md-ol">{items}</ol>)
      continue
    }

    // Headings
    const h3m = line.match(/^###\s+(.+)/)
    const h2m = line.match(/^##\s+(.+)/)
    const h1m = line.match(/^#\s+(.+)/)
    if (h1m) { out.push(<h2 key={K()} className="md-h1">{renderInline(h1m[1])}</h2>); i++; continue }
    if (h2m) { out.push(<h3 key={K()} className="md-h2">{renderInline(h2m[1])}</h3>); i++; continue }
    if (h3m) { out.push(<h4 key={K()} className="md-h3">{renderInline(h3m[1])}</h4>); i++; continue }

    // Blockquote
    if (line.startsWith('>')) {
      out.push(<blockquote key={K()} className="md-quote">{renderInline(line.slice(1).trim())}</blockquote>)
      i++; continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line)) {
      out.push(<hr key={K()} className="md-hr" />)
      i++; continue
    }

    // Paragraph
    out.push(<p key={K()} className="md-p">{renderInline(line)}</p>)
    i++
  }

  return out
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MessageBubble({ role, content, usedSearch = false, isError = false, images = null }) {
  const time    = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const isUser  = role === 'user'
  const section = useMemo(
    () => (!isUser && !isError ? detectSection(content ?? '') : null),
    [isUser, isError, content],
  )
  const parsed = useMemo(
    () => (!isUser ? parseMarkdown(content ?? '') : null),
    [isUser, content],
  )

  const bubbleStyle = (section && !isError && !isUser)
    ? { background: section.bg, borderColor: section.color }
    : {}

  // Build image list: plaza first, then top, then extras (max 4)
  const imgList = images
    ? [images.plaza, images.top, ...(images.extras ?? [])].filter(Boolean).slice(0, 4)
    : []

  return (
    <div className={`bubble-row ${role}`}>

      {/* Section chip — only for assistant messages with detected topic */}
      {section && (
        <div className="bubble-chip" style={{ color: section.color, borderColor: section.color + '55' }}>
          <span>{section.icon}</span>
          <span>{section.label}</span>
        </div>
      )}

      <div className={`bubble${isError ? ' bubble-error' : ''}`} style={bubbleStyle}>
        {isUser
          ? <p className="bubble-user-text">{content}</p>
          : <div className="bubble-md">{parsed}</div>
        }
      </div>

      {/* Destination image gallery (assistant only) */}
      {!isUser && !isError && imgList.length > 0 && (
        <div className="bubble-img-gallery">
          {imgList.map((img, i) => (
            <div key={i} className="bubble-img-item">
              <img src={img.data} alt={img.title} className="bubble-img" loading="lazy" />
              <span className="bubble-img-cap">{img.title}</span>
            </div>
          ))}
        </div>
      )}

      <div className="bubble-meta">
        <span>{time}</span>
        {usedSearch && <span className="badge-search">🔍 Búsqueda web</span>}
        {isError && <span className="badge-error">Error</span>}
      </div>
    </div>
  )
}
