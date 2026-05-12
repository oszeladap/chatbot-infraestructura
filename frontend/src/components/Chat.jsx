import { useState, useEffect, useRef, useCallback } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'
import Sidebar from './Sidebar'
import MessageBubble from './MessageBubble'
import AdminPanel from './AdminPanel'
import './Chat.css'

// Generate a date-based chat ID: YYYYMMDD_HHmmss_mmm
function generateChatId() {
  const n   = new Date()
  const pad = (v, d = 2) => String(v).padStart(d, '0')
  return (
    `${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}` +
    `_${pad(n.getHours())}${pad(n.getMinutes())}${pad(n.getSeconds())}` +
    `_${pad(n.getMilliseconds(), 3)}`
  )
}

// ── PDF helpers ───────────────────────────────────────────────────────────────
function cleanTxt(s) {
  const stripped = (s ?? '')
    .replace(/^#{1,6}\s*/g, '')           // strip markdown heading markers (#, ##, …)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[Fuente:[^\]]+\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  return normalizePDF(stripped)
}

// Normalizes text so jsPDF/Helvetica (WinAnsiEncoding / Latin-1) renders it correctly.
// Replaces common Unicode chars with ASCII equivalents, then strips everything
// outside Basic-Latin (U+0020-U+007E) and Latin-1 Supplement (U+00A0-U+00FF).
function normalizePDF(s) {
  return (s ?? '')
    // Smart quotes → straight quotes
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    // Dashes
    .replace(/[–—]/g, '-')
    // Ellipsis
    .replace(/…/g, '...')
    // Bullet
    .replace(/•/g, '-')
    // Arrows
    .replace(/→/g, '->').replace(/←/g, '<-')
    .replace(/⇒/g, '=>').replace(/⇐/g, '<=')
    // Math
    .replace(/×/g, 'x').replace(/÷/g, '/')
    .replace(/∞/g, 'inf').replace(/≈/g, '~')
    .replace(/≠/g, '!=').replace(/≤/g, '<=').replace(/≥/g, '>=')
    // Remove emoji and symbol blocks
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[☀-➿]/gu, '')
    .replace(/[℀-⅟]/gu, '')
    .replace(/[①-◿]/gu, '')
    // Strip markdown syntax chars that may have escaped cleanTxt
    .replace(/#/g, '')
    // Final strip: keep only Basic Latin + Latin-1 Supplement
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseBlocks(text) {
  const lines = (text ?? '').split('\n').map(l => l.replace(/\r$/, ''))
  const blocks = []
  let tableRows = null

  const flushTable = () => {
    if (tableRows) { blocks.push({ type: 'table', rows: tableRows }); tableRows = null }
  }

  for (const raw of lines) {
    const line = raw.trim()

    if (!line) { flushTable(); continue }

    if (line.startsWith('|')) {
      if (/^\|[-:\s|]+\|$/.test(line)) continue
      const cells = line.split('|').slice(1, -1).map(c => cleanTxt(c.trim()))
      if (!tableRows) tableRows = []
      tableRows.push(cells)
      continue
    }

    flushTable()

    // Skip horizontal rules (--- / *** / ___)
    if (/^[-*_]{3,}$/.test(line)) continue

    // Match headings with or without space after # markers (e.g. ##Title or ## Title)
    const hm = line.match(/^(#{1,6})\s*(.+)/)
    if (hm) { blocks.push({ type: 'heading', level: hm[1].length, text: cleanTxt(hm[2]) }); continue }

    const bm = raw.match(/^(\s*)[-*+]\s+(.+)/)
    if (bm) { blocks.push({ type: 'bullet', indent: Math.floor(bm[1].length / 2), text: cleanTxt(bm[2]) }); continue }

    const nm = raw.match(/^(\s*)\d+\.\s+(.+)/)
    if (nm) { blocks.push({ type: 'bullet', indent: Math.floor(nm[1].length / 2), text: cleanTxt(nm[2]) }); continue }

    blocks.push({ type: 'text', text: cleanTxt(line) })
  }
  flushTable()
  return blocks
}

// ── Destination / origin helpers ──────────────────────────────────────────────
const PERU_CITY_LIST = [
  'machu picchu','puerto maldonado','tingo maria',
  'cusco','lima','arequipa','trujillo','chiclayo','iquitos','piura',
  'huancayo','puno','cajamarca','tacna','ica','ayacucho','huaraz',
  'moquegua','tumbes','tarapoto','juliaca','chimbote','paracas',
  'nazca','pucallpa','sullana','huanuco','abancay',
]

function titleCaseCity(city) {
  return city.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function extractDestCity(messages) {
  // Step 1: explicit destination patterns in user messages
  const userText = messages
    .filter(m => m.role === 'user')
    .map(m => (m.content ?? '').toLowerCase())
    .join(' ')
  const destPats = [
    /(?:viajar?|ir|voy|quiero\s+(?:ir|visitar))\s+(?:a|hacia|para)\s+([\w\s]{3,30})/,
    /viaje\s+(?:a|hacia|para)\s+([\w\s]{3,25})/,
    /destino[:\s]+([\w\s]{3,20})/,
    /(?:visitar|conocer|recorrer)\s+([\w\s]{3,25})/,
  ]
  for (const pat of destPats) {
    const m = userText.match(pat)
    if (m) {
      const fragment = m[1].trim()
      const found = PERU_CITY_LIST.find(c => fragment.startsWith(c) || fragment.includes(c))
      if (found) return titleCaseCity(found)
    }
  }

  // Step 2: most-mentioned city in assistant responses (topic of discussion = destination)
  const asstText = messages
    .filter(m => m.role === 'assistant')
    .map(m => (m.content ?? '').toLowerCase())
    .join(' ')
  let topCity = '', topCount = 0
  for (const city of PERU_CITY_LIST) {
    const re = new RegExp(`\\b${city.replace(/\s+/g, '[\\s-]+')}\\b`, 'g')
    const count = (asstText.match(re) || []).length
    if (count > topCount) { topCount = count; topCity = city }
  }
  if (topCity && topCount >= 2) return titleCaseCity(topCity)

  // Step 3: fallback — first city found anywhere in text
  const allText = messages.map(m => (m.content ?? '').toLowerCase()).join(' ')
  for (const city of PERU_CITY_LIST) {
    if (allText.includes(city)) return titleCaseCity(city)
  }
  return ''
}

function safeName(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

// ── Backend image fetcher (server-side proxy, no CORS issues) ─────────────────
async function fetchBackendImages(destCity, apiFetch) {
  if (!destCity) return { plaza: null, top: null, extras: [] }
  try {
    const res = await apiFetch(`/images/${encodeURIComponent(destCity.toLowerCase())}`)
    if (!res.ok) return { plaza: null, top: null, extras: [] }
    return await res.json()
  } catch { return { plaza: null, top: null, extras: [] } }
}

// ── Route helpers ─────────────────────────────────────────────────────────────
const MANEUVER_ES = {
  depart: 'Partir desde', arrive: 'Llegar al destino',
  turn: { left: 'Girar a la izquierda', right: 'Girar a la derecha',
          'slight left': 'Doblar levemente a la izquierda', 'slight right': 'Doblar levemente a la derecha',
          uturn: 'Dar la vuelta completa' },
  continue: 'Continuar por', 'new name': 'Continuar por',
  merge: 'Incorporarse a', roundabout: 'Tomar la rotonda', 'exit roundabout': 'Salir de la rotonda',
}

const TOP_ATTRACTION = {
  'cusco': 'Machu Picchu', 'lima': 'Larco Museum', 'arequipa': 'Colca Canyon',
  'puno': 'Lake Titicaca', 'trujillo': 'Chan Chan', 'huaraz': 'Huascaran National Park',
  'iquitos': 'Amazon River', 'paracas': 'Ballestas Islands',
  'nazca': 'Nazca Lines', 'chiclayo': 'Huaca Rajada',
  'ayacucho': 'Wari Ruins', 'tarapoto': 'Ahuashiyacu Waterfall',
  'cajamarca': 'Cumbe Mayo', 'machu picchu': 'Machu Picchu',
  'huancayo': 'Mantaro Valley', 'ica': 'Huacachina',
}

async function fetchRoute(fromQ, toQ) {
  try {
    const nom = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&q='
    const [r1, r2] = await Promise.all([
      fetch(nom + encodeURIComponent(fromQ)).then(r => r.json()),
      fetch(nom + encodeURIComponent(toQ)).then(r => r.json()),
    ])
    if (!r1?.[0] || !r2?.[0]) return null
    const { lon: lon1, lat: lat1 } = r1[0]
    const { lon: lon2, lat: lat2 } = r2[0]
    // Fetch both walking and driving routes simultaneously
    const [footData, driveData] = await Promise.all([
      fetch(`https://router.project-osrm.org/route/v1/foot/${lon1},${lat1};${lon2},${lat2}?steps=true&overview=false`).then(r => r.json()),
      fetch(`https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?steps=false&overview=false`).then(r => r.json()),
    ])
    const parseSteps = (data) => {
      if (data.code !== 'Ok') return null
      const route = data.routes[0]
      const steps = (route.legs[0].steps || []).slice(0, 8)
      return {
        distance: Math.round(route.distance),
        duration: Math.round(route.duration / 60),
        steps: steps.map(s => {
          const { type, modifier } = s.maneuver
          let instr = MANEUVER_ES[type] ?? 'Continuar'
          if (typeof instr === 'object') instr = instr[modifier] ?? 'Continuar'
          const name = s.name?.trim()
          if (!['depart','arrive'].includes(type) && name) instr += ` ${name}`
          return { instr, dist: Math.round(s.distance) }
        }),
      }
    }
    return { walk: parseSteps(footData), drive: parseSteps(driveData) }
  } catch { return null }
}

// ── jsPDF route map diagram ───────────────────────────────────────────────────
function drawRouteMapDiagram(doc, x, y, w, h, fromLabel, toLabel) {
  // Map background (OSM-like beige)
  doc.setFillColor(242, 239, 233); doc.rect(x, y, w, h, 'F')
  // Road grid (white lines)
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.8)
  for (let i = 1; i <= 3; i++) doc.line(x, y + (h / 4) * i, x + w, y + (h / 4) * i)
  for (let i = 1; i <= 5; i++) doc.line(x + (w / 6) * i, y, x + (w / 6) * i, y + h)
  // Block buildings (decorative)
  doc.setFillColor(226, 222, 215)
  doc.rect(x + 8, y + 10, 20, 16, 'F')
  doc.rect(x + w - 30, y + 10, 20, 16, 'F')
  doc.rect(x + 8, y + h - 28, 20, 16, 'F')
  doc.rect(x + w - 30, y + h - 28, 20, 16, 'F')
  // Route arc (blue, parabolic)
  const ax = x + 30; const ay = y + h / 2
  const bx = x + w - 30; const by = y + h / 2
  doc.setDrawColor(21, 101, 160); doc.setLineWidth(2.8)
  const N = 24
  let px = ax, py = ay
  for (let i = 1; i <= N; i++) {
    const t = i / N
    const nx = ax + t * (bx - ax)
    const ny = ay - 4 * t * (1 - t) * Math.min(28, h * 0.38)
    doc.line(px, py, nx, ny); px = nx; py = ny
  }
  // Markers
  doc.setFillColor(21, 101, 160); doc.circle(ax, ay, 8, 'F')
  doc.setFillColor(220, 38, 38); doc.circle(bx, by, 8, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(255, 255, 255)
  doc.text('A', ax, ay + 2.5, { align: 'center' })
  doc.text('B', bx, by + 2.5, { align: 'center' })
  // Labels
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(15, 25, 65)
  const fLines = doc.splitTextToSize(fromLabel, 52); doc.text(fLines, ax, ay + 16, { align: 'center' })
  const tLines = doc.splitTextToSize(toLabel, 52);  doc.text(tLines, bx, by + 16, { align: 'center' })
  // Border + attribution
  doc.setDrawColor(180, 170, 155); doc.setLineWidth(0.5); doc.rect(x, y, w, h, 'S')
  doc.setFont('helvetica', 'italic'); doc.setFontSize(5); doc.setTextColor(150, 140, 130)
  doc.text('Esquema referencial | Clic en botones para ruta real', x + w / 2, y + h - 4, { align: 'center' })
}

function renderBlocks(doc, blocks, x, y, w, secHc, secRc, pageH, M) {
  const LH = 11.5

  for (const b of blocks) {
    if (b.type === 'heading') {
      const sz = b.level === 1 ? 10 : b.level === 2 ? 9.5 : 9
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(sz)
      const lines = doc.splitTextToSize(b.text, w - 10)
      const bH = lines.length * (sz + 3) + 8
      if (y + bH > pageH - M) { doc.addPage(); y = M }
      doc.setFillColor(...secRc)
      doc.rect(x, y, w, bH, 'F')
      doc.setTextColor(secHc[0], secHc[1], secHc[2])
      doc.text(lines, x + 5, y + sz + 2)
      y += bH + 2
    } else if (b.type === 'bullet') {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      const xb = x + 8 + b.indent * 10
      const lines = doc.splitTextToSize(b.text, w - 16 - b.indent * 10)
      const bH = lines.length * LH + 4
      if (y + bH > pageH - M) { doc.addPage(); y = M }
      doc.setTextColor(30, 40, 70)
      doc.text('-', xb, y + LH)
      doc.text(lines, xb + 8, y + LH)
      y += bH
    } else if (b.type === 'table') {
      if (!b.rows?.length) continue
      const numCols = b.rows[0].length || 1
      const colW = Math.floor(w / numCols)
      for (let ri = 0; ri < b.rows.length; ri++) {
        doc.setFontSize(8)
        let maxLines = 1
        for (const cell of b.rows[ri]) {
          const cl = doc.splitTextToSize(String(cell ?? ''), colW - 10)
          maxLines = Math.max(maxLines, cl.length)
        }
        const rowH = Math.max(maxLines * LH + 8, 20)
        if (y + rowH > pageH - M) { doc.addPage(); y = M }
        if (ri === 0) {
          doc.setFillColor(...secHc)
          doc.setTextColor(255, 255, 255)
          doc.setFont('helvetica', 'bold')
        } else {
          doc.setFillColor(...(ri % 2 === 1 ? secRc : [252, 252, 255]))
          doc.setTextColor(25, 35, 65)
          doc.setFont('helvetica', 'normal')
        }
        doc.rect(x, y, w, rowH, 'F')
        for (let ci = 0; ci < numCols; ci++) {
          const ct = doc.splitTextToSize(String(b.rows[ri][ci] ?? ''), colW - 10)
          doc.text(ct, x + ci * colW + 5, y + LH + 2)
        }
        doc.setDrawColor(200, 210, 230)
        doc.setLineWidth(0.3)
        doc.rect(x, y, w, rowH, 'S')
        for (let ci = 1; ci < numCols; ci++) {
          doc.line(x + ci * colW, y, x + ci * colW, y + rowH)
        }
        y += rowH
      }
      y += 5
    } else {
      if (!b.text) continue
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      const lines = doc.splitTextToSize(b.text, w - 8)
      const bH = lines.length * LH + 3
      if (y + bH > pageH - M) { doc.addPage(); y = M }
      doc.setTextColor(30, 40, 70)
      doc.text(lines, x + 4, y + LH)
      y += bH
    }
  }
  return y
}

// ── PDF export ────────────────────────────────────────────────────────────────
async function exportPDF(messages, userEmail, userCity = '', apiFetch = null) {
  const { jsPDF } = await import('jspdf')
  const doc   = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M  = 36
  const CW = pageW - M * 2

  function guard(y, needed = 50) {
    if (y + needed > pageH - 40) { doc.addPage(); return M }
    return y
  }

  // ── Filename con origen y destino ─────────────────────────────────────────
  const destCity = extractDestCity(messages)
  const originCity = userCity || 'Peru'
  const dateTag = new Date().toISOString().slice(0, 10)
  const pdfFilename = destCity
    ? `Detalle_viaje_${safeName(originCity)}_${safeName(destCity)}_${dateTag}.pdf`
    : `Detalle_viaje_Peru_${dateTag}.pdf`

  // ── Pre-fetch images from backend (server-side, no CORS) ─────────────────
  const imgData = apiFetch ? await fetchBackendImages(destCity, apiFetch) : { plaza: null, top: null, extras: [] }
  const allImgs = [imgData.plaza, imgData.top, ...imgData.extras].filter(Boolean)

  // ── PORTADA ──────────────────────────────────────────────────────────────
  // Azul suave — cabecera principal
  doc.setFillColor(30, 80, 150)
  doc.rect(0, 0, pageW, 78, 'F')
  // Franja dorada
  doc.setFillColor(232, 184, 75)
  doc.rect(0, 78, pageW, 5, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('SISTEMA INTELIGENTE DE VIAJES DE PERU', M, 30)
  doc.setFontSize(10)
  doc.text('Recomendaciones Personalizadas de Viaje', M, 50)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Documento generado automaticamente — uso exclusivo del usuario', M, 68)

  // Barra de metadatos
  doc.setFillColor(15, 35, 80)
  doc.rect(0, 83, pageW, 26, 'F')
  const now     = new Date()
  const dateStr = now.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  doc.setTextColor(180, 200, 240)
  doc.setFontSize(8)
  doc.text(`Fecha: ${dateStr}   Hora: ${timeStr}   Usuario: ${userEmail ?? 'N/A'}`, M, 100)

  let y = 122

  // ── SECCIONES ─────────────────────────────────────────────────────────────
  // Climate is placed 2nd so its Q/A pairs are not captured by later sections
  // (e.g. "Lugares" which matches "visitar/lugar" — common words in climate answers)
  const SECTIONS = [
    {
      title: 'COSTOS DE VIAJE EN VUELO Y BUS - COMPARATIVAS',
      sub:   'Tarifas aereas y terrestres con comparativa de operadores',
      hc: [21, 101, 160], rc: [235, 244, 255], ra: [215, 232, 255],
      rx: /vuelo|avio|aerolin|latam|sky|avianca|jetsmart|bus\b|cruz del sur|oltursa|tepsa|aeropuerto|terminal|boleto|pasaje|tarifa/i,
    },
    {
      title: 'DATOS DEL CLIMA EN CIUDAD DESTINO',
      sub:   'Condiciones meteorologicas, temperatura y recomendaciones',
      hc: [14, 116, 144], rc: [236, 254, 255], ra: [207, 250, 254],
      rx: /clima|temperatura|lluvia|sol\b|calor|fr[ií]o|humedad|viento|pron[oó]stico|meteorolog/i,
    },
    {
      title: 'COSTOS DE HOSPEDAJE — ALTERNATIVAS',
      sub:   'Opciones de alojamiento en destino con rangos de precio',
      hc: [45, 106, 79],  rc: [236, 253, 245], ra: [209, 250, 229],
      rx: /hotel|hostal|hospedaje|alojamiento|habitaci|lodge|resort|airbnb|posada/i,
    },
    {
      title: 'COSTOS DE ALIMENTACION Y TRANSPORTE LOCAL',
      sub:   'Gastronomia tipica, restaurantes y movilidad en destino',
      hc: [180, 83, 9],   rc: [255, 251, 235], ra: [254, 243, 199],
      rx: /restaurante|comida|almuerzo|desayuno|cena|plato|men[uú]|gastronomia|taxi|mototaxi|uber|combi|transporte local/i,
    },
    {
      title: 'LUGARES QUE VISITAR Y SUS COSTOS',
      sub:   'Atracciones turisticas, tours y actividades recomendadas',
      hc: [109, 40, 217], rc: [245, 243, 255], ra: [237, 233, 254],
      rx: /museo|plaza|parque|iglesia|catedral|ruinas|machu picchu|tour\b|excursion|mirador|atraccion|visitar|lugar/i,
    },
    {
      title: 'OTROS DATOS DE INTERES PARA EL TURISTA',
      sub:   'Consejos, seguridad, documentacion, moneda y recomendaciones generales',
      hc: [55, 65, 100],  rc: [248, 250, 252], ra: [241, 245, 249],
      rx: /seguridad|consejo|pasaporte|documento.*viaj|moneda|cambio.*sol|propina|vacuna|feriado|emergencia|policia|altitud|soroche|aclimat|quechua|artesani|souven|seguro.*viaj|equipaje|maleta|enchufe|voltaje|visa\b|recomendaci.*general|precauci|peligro|costumbre|traje|vestimenta/i,
    },
  ]

  // Pares pregunta/respuesta del chat activo
  const pairs = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user' && !messages[i].isError) {
      const next = messages[i + 1]
      if (next?.role === 'assistant' && !next.isError) {
        pairs.push({ q: messages[i].content ?? '', a: next.content ?? '' })
      }
    }
  }

  // Each Q/A pair appears in at most one section (first match wins)
  const usedPairIdxs = new Set()

  for (const sec of SECTIONS) {
    const hits = []
    pairs.forEach((p, idx) => {
      if (!usedPairIdxs.has(idx) && sec.rx.test(p.q + ' ' + p.a)) {
        hits.push(p)
        usedPairIdxs.add(idx)
      }
    })

    // Skip sections with no matching content — don't render header at all
    if (hits.length === 0) continue

    // Section header + subtitle must not be orphaned — keep together with first content block
    if (y + 103 > pageH - M) { doc.addPage(); y = M }

    doc.setFillColor(...sec.hc)
    doc.rect(M, y, CW, 26, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text(sec.title, M + 8, y + 17)
    y += 26

    doc.setFillColor(242, 244, 250)
    doc.rect(M, y, CW, 17, 'F')
    doc.setTextColor(80, 90, 120)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.text(sec.sub, M + 8, y + 11)
    y += 17

    for (const pair of hits) {
      const qClean = cleanTxt(pair.q)
      const qLines = doc.splitTextToSize(qClean, CW - 18)
      const qH = Math.max(qLines.length * 12 + 10, 26)

      // Keep Q + at least 50pt of answer together on same page
      if (y + qH + 50 > pageH - M) { doc.addPage(); y = M }

      doc.setFillColor(210, 218, 238)
      doc.rect(M, y, CW, qH, 'F')
      doc.setTextColor(15, 25, 65)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.text(qLines, M + 8, y + 11)
      y += qH

      // Render answer with full markdown formatting
      y = renderBlocks(doc, parseBlocks(pair.a), M + 4, y + 4, CW - 4, sec.hc, sec.rc, pageH, M)

      doc.setDrawColor(...sec.hc)
      doc.setLineWidth(0.3)
      doc.line(M, y + 4, M + CW, y + 4)
      y += 14
    }

    // ── Galería fotográfica del destino (solo en LUGARES, mín 4 fotos en 2×2) ──
    if (sec.title.includes('LUGARES') && allImgs.length > 0) {
      const showImgs = allImgs.slice(0, 4)
      const COLS = 2
      const imgW = Math.floor((CW - 8) / COLS)
      const imgH = Math.round(imgW * 0.58)
      const numRows = Math.ceil(showImgs.length / COLS)
      const galH = 18 + numRows * (imgH + 16) + 4
      if (y + galH > pageH - M) { doc.addPage(); y = M }
      const galStartY = y
      doc.setFillColor(245, 243, 255)
      doc.rect(M, galStartY, CW, galH, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(109, 40, 217)
      doc.text('GALERIA FOTOGRAFICA DEL DESTINO', M + 6, galStartY + 12)
      for (let di = 0; di < showImgs.length; di++) {
        const img = showImgs[di]
        const col = di % COLS
        const row = Math.floor(di / COLS)
        const ix = M + col * (imgW + 8)
        const iy = galStartY + 18 + row * (imgH + 16)
        try {
          const fmt = img.data.includes('image/png') ? 'PNG' : 'JPEG'
          doc.addImage(img.data, fmt, ix, iy, imgW, imgH)
          doc.setFont('helvetica', 'italic'); doc.setFontSize(6); doc.setTextColor(90, 70, 130)
          doc.text(normalizePDF(img.title), ix + imgW / 2, iy + imgH + 8, { align: 'center', maxWidth: imgW })
        } catch {}
      }
      y = galStartY + galH
    }

    y += 18
  }

  // ── Sección de ruta visual ────────────────────────────────────────────────
  if (destCity) {
    const destKey  = destCity.toLowerCase()
    const topAttr  = TOP_ATTRACTION[destKey]
    if (topAttr) {
      const fromQ   = `Plaza de Armas ${destCity} Peru`
      const toQ     = `${topAttr} ${destCity} Peru`
      const topName = normalizePDF(topAttr)

      // Header
      if (y + 200 > pageH - M) { doc.addPage(); y = M }
      doc.setFillColor(15, 35, 80); doc.rect(M, y, CW, 24, 'F')
      doc.setTextColor(232, 184, 75); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      doc.text(`COMO LLEGAR: Plaza de Armas => ${topName}`, M + 8, y + 16)
      y += 24

      // Fetch routes (walking + driving)
      const routes = await fetchRoute(fromQ, toQ)
      const walk  = routes?.walk
      const drive = routes?.drive

      // Google Maps URLs
      const gmBase  = 'https://www.google.com/maps/dir/?api=1'
      const gmFrom  = encodeURIComponent(fromQ)
      const gmTo    = encodeURIComponent(toQ)
      const walkUrl = `${gmBase}&origin=${gmFrom}&destination=${gmTo}&travelmode=walking`
      const driveUrl= `${gmBase}&origin=${gmFrom}&destination=${gmTo}&travelmode=driving`

      // Distance/time info bar
      const infoH = 20; doc.setFillColor(235, 244, 255); doc.rect(M, y, CW, infoH, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(21, 101, 160)
      const walkInfo  = walk  ? `A pie: ~${walk.duration} min (${walk.distance}m)` : 'A pie: ver Google Maps'
      const driveInfo = drive ? `Vehiculo: ~${drive.duration} min (${Math.round(drive.distance/1000*10)/10}km)` : 'Vehiculo: ver Google Maps'
      doc.text(`${walkInfo}   |   ${driveInfo}`, M + 8, y + 13)
      y += infoH + 6

      // Two-column: map diagram | step-by-step text
      const mapW  = Math.floor(CW * 0.48)
      const stW   = CW - mapW - 8
      const stX   = M + mapW + 8
      const mapH  = 118
      drawRouteMapDiagram(doc, M, y, mapW, mapH, 'Plaza de Armas', topName)

      // Steps column
      const steps = walk?.steps ?? []
      let sy = y + 2
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(15, 25, 65)
      doc.text('Pasos a pie:', stX, sy + 8); sy += 14
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(30, 40, 70)
      let stepNum = 1
      for (const step of steps.filter(s => s.dist > 0).slice(0, 7)) {
        const txt = `${stepNum}. ${normalizePDF(step.instr)}${step.dist > 5 ? ` (${step.dist}m)` : ''}`
        const ll  = doc.splitTextToSize(txt, stW - 4)
        const sH  = ll.length * 9 + 2
        if (sy + sH > y + mapH) break
        doc.text(ll, stX, sy); sy += sH
        stepNum++
      }
      y += mapH + 10

      // Clickable Google Maps buttons (two columns)
      const btnH = 22; const btnW = Math.floor((CW - 6) / 2)
      if (y + btnH > pageH - M) { doc.addPage(); y = M }

      doc.setFillColor(21, 101, 160); doc.rect(M, y, btnW, btnH, 'F')
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
      doc.text('Ruta a pie en Google Maps ->', M + 8, y + 14)
      doc.link(M, y, btnW, btnH, { url: walkUrl })

      doc.setFillColor(180, 83, 9); doc.rect(M + btnW + 6, y, btnW, btnH, 'F')
      doc.text('Ruta en vehiculo en Google Maps ->', M + btnW + 14, y + 14)
      doc.link(M + btnW + 6, y, btnW, btnH, { url: driveUrl })
      y += btnH + 16
    }
  }

  // ── PIE DE PÁGINA ─────────────────────────────────────────────────────────
  const total = doc.internal.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFillColor(30, 80, 150)
    doc.rect(0, pageH - 22, pageW, 22, 'F')
    doc.setTextColor(200, 220, 255)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text('Sistema Inteligente de Viajes de Peru  |  Documento generado automaticamente', M, pageH - 7)
    doc.text(`Pag. ${p} / ${total}`, pageW - M - 28, pageH - 7)
  }

  doc.save(pdfFilename)
}

// ── PDF Resumen Ejecutivo — Estructurado con IA ───────────────────────────────
async function exportPDFSummary(messages, userEmail, chatId, apiFetch, cachedSummary = null, userCity = '') {
  const { jsPDF } = await import('jspdf')

  // 1. Usar caché si disponible, si no llamar al backend
  let s = cachedSummary
  if (!s) {
    try {
      const res = await apiFetch('/summary', {
        method: 'POST',
        body: JSON.stringify({ chat_id: chatId }),
      })
      if (res.ok) s = await res.json()
    } catch (e) {
      console.warn('[exportPDFSummary]', e.message)
    }
  }

  // ── Filename con origen y destino ─────────────────────────────────────────
  const destCity = extractDestCity(messages)
  const originCity = userCity || 'Peru'
  const dateTag = new Date().toISOString().slice(0, 10)
  const sumFilename = destCity
    ? `Resumen_viaje_${safeName(originCity)}_${safeName(destCity)}_${dateTag}.pdf`
    : `Resumen_viaje_Peru_${dateTag}.pdf`

  const nd = 'No disponible'
  const safe = v =>
    (!v || v.toLowerCase().includes('no disponible') || v.toLowerCase().includes('not available'))
      ? nd
      : normalizePDF(v)

  if (!s) s = {
    destino: nd,
    clima:   { descripcion: nd, temperatura: nd, recomendacion: nd },
    costos:  {
      transporte:   { economico: nd, comodo: nd },
      hospedaje:    { economico: nd, comodo: nd },
      alimentacion: { economico: nd, comodo: nd },
      tours:        { economico: nd, comodo: nd },
    },
    lugares:  [],
    consejos: [],
  }

  // 2. PDF setup
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const PW  = doc.internal.pageSize.getWidth()
  const PH  = doc.internal.pageSize.getHeight()
  const M   = 32
  const CW  = PW - M * 2
  const FS  = 7.5
  const LH  = 9.5
  const now = new Date()

  let y = 0
  const br = needed => { if (y + needed > PH - 24) { doc.addPage(); y = M } }

  // ── Header (46pt + gold stripe) ──────────────────────────────────────────
  doc.setFillColor(30, 80, 150)
  doc.rect(0, 0, PW, 46, 'F')
  doc.setFillColor(232, 184, 75)
  doc.rect(0, 46, PW, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('RESUMEN EJECUTIVO DE VIAJE - PERU', M, 22)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(180, 200, 240)
  doc.text(
    `Fecha: ${now.toLocaleDateString('es-PE',{day:'2-digit',month:'long',year:'numeric'})}  |  ` +
    `Hora: ${now.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}  |  ` +
    `Usuario: ${userEmail ?? 'N/A'}`,
    M, 40
  )
  y = 60

  // ── Destino strip ─────────────────────────────────────────────────────────
  const destino = normalizePDF(s.destino || nd).toUpperCase()
  doc.setFillColor(15, 35, 80)
  doc.rect(M, y, CW, 22, 'F')
  doc.setTextColor(232, 184, 75)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(`DESTINO: ${destino}`, M + 8, y + 15)
  y += 28

  // ── Imágenes obligatorias: Plaza de Armas + Lugar Top ────────────────────
  const sumImgData = await fetchBackendImages(destCity || (s.destino !== nd ? s.destino : ''), apiFetch)
  const imgPlaza = sumImgData.plaza
  const imgTop   = sumImgData.top
  if (imgPlaza || imgTop) {
    const iH   = 96
    const iW   = Math.floor((CW - 8) / 2)
    br(iH + 28)
    doc.setFillColor(20, 35, 80); doc.rect(M, y, CW, 14, 'F')
    doc.setTextColor(232, 184, 75); doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
    doc.text('IMAGENES DEL DESTINO', M + 6, y + 10)
    y += 14
    const drawSumImg = (img, ix) => {
      if (!img?.data) return
      try {
        const fmt = img.data.includes('image/png') ? 'PNG' : 'JPEG'
        doc.addImage(img.data, fmt, ix, y, iW, iH)
        doc.setFont('helvetica', 'italic'); doc.setFontSize(6); doc.setTextColor(100, 100, 130)
        doc.text(normalizePDF(img.title), ix + iW / 2, y + iH + 7, { align: 'center', maxWidth: iW })
      } catch {}
    }
    drawSumImg(imgPlaza, M)
    drawSumImg(imgTop,   M + iW + 8)
    y += iH + 14
  }

  // ── Two-column: Clima | Lugares ───────────────────────────────────────────
  const GAP  = 8
  const LCW  = Math.floor(CW * 0.42)
  const RCW  = CW - LCW - GAP
  const LCX  = M
  const RCX  = M + LCW + GAP
  const CH   = 18   // column header bar height

  // Pre-calc clima blocks (font must be set before splitTextToSize)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FS)
  const clima = s.clima || {}
  const climaItems = [
    { lbl: 'Temperatura:', val: safe(clima.temperatura) },
    { lbl: 'Condicion:',   val: safe(clima.descripcion) },
    { lbl: 'Llevar:',      val: safe(clima.recomendacion) },
  ].filter(r => r.val !== nd)
  const climaBlocks = climaItems.map(r => ({
    lbl: r.lbl, lines: doc.splitTextToSize(r.val, LCW - 12),
  }))
  const climaContentH = climaBlocks.reduce((h, b) => h + LH + b.lines.length * LH + 3, 8)
  const colLH = CH + Math.max(climaContentH, 80)

  // Pre-calc lugares blocks
  const lugares = (s.lugares || []).slice(0, 8).map(l => normalizePDF(l)).filter(Boolean)
  const lugarBlocks = lugares.map(l => doc.splitTextToSize('- ' + l, RCW - 10))
  const lugarContentH = lugarBlocks.reduce((h, b) => h + b.length * LH + 2, 8)
  const colRH = CH + Math.max(lugarContentH, 80)

  const TWO_H = Math.max(colLH, colRH)
  br(TWO_H)

  // Draw left: Clima
  doc.setFillColor(14, 116, 144)
  doc.rect(LCX, y, LCW, CH, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('CONDICIONES CLIMATICAS', LCX + 5, y + 13)
  doc.setFillColor(236, 254, 255)
  doc.rect(LCX, y + CH, LCW, TWO_H - CH, 'F')
  let cy = y + CH + 10
  doc.setFontSize(FS)
  for (const { lbl, lines } of climaBlocks) {
    doc.setFont('helvetica', 'bold');  doc.setTextColor(14, 80, 100)
    doc.text(lbl, LCX + 5, cy);       cy += LH
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 40, 70)
    doc.text(lines, LCX + 5, cy);     cy += lines.length * LH + 3
  }
  if (climaBlocks.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setTextColor(150, 160, 180); doc.setFontSize(FS)
    doc.text('Sin informacion climatica en esta consulta.', LCX + 5, y + CH + 16)
  }

  // Draw right: Lugares
  doc.setFillColor(109, 40, 217)
  doc.rect(RCX, y, RCW, CH, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('LUGARES SUGERIDOS', RCX + 5, y + 13)
  doc.setFillColor(245, 243, 255)
  doc.rect(RCX, y + CH, RCW, TWO_H - CH, 'F')
  let ry = y + CH + 10
  doc.setFontSize(FS); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 40, 70)
  if (lugarBlocks.length > 0) {
    for (const ll of lugarBlocks) { doc.text(ll, RCX + 5, ry); ry += ll.length * LH + 2 }
  } else {
    doc.setFont('helvetica', 'italic'); doc.setTextColor(150, 160, 180)
    doc.text('Sin lugares especificados en esta consulta.', RCX + 5, ry)
  }

  y += TWO_H + 10

  // ── Comparativa de costos (table) ─────────────────────────────────────────
  br(22)
  doc.setFillColor(21, 101, 160)
  doc.rect(M, y, CW, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('COMPARATIVA DE COSTOS — ECONOMICO vs COMODO', M + 8, y + 15)
  y += 22

  const costos = s.costos || {}
  const c1W = Math.floor(CW * 0.20)
  const c2W = Math.floor(CW * 0.40)
  const c3W = CW - c1W - c2W

  const tRows = [
    ['Concepto',        'Opcion Economica',                     'Opcion Comoda'],
    ['Transporte',      safe(costos.transporte?.economico),      safe(costos.transporte?.comodo)],
    ['Hospedaje',       safe(costos.hospedaje?.economico),       safe(costos.hospedaje?.comodo)],
    ['Alimentacion',    safe(costos.alimentacion?.economico),    safe(costos.alimentacion?.comodo)],
    ['Tours / Entradas',safe(costos.tours?.economico),           safe(costos.tours?.comodo)],
  ]

  for (let ri = 0; ri < tRows.length; ri++) {
    const [lbl, eco, com] = tRows[ri]
    doc.setFont('helvetica', ri === 0 ? 'bold' : 'normal')
    doc.setFontSize(FS)
    const lblLL = doc.splitTextToSize(lbl, c1W - 6)
    const ecoLL = doc.splitTextToSize(eco, c2W - 8)
    const comLL = doc.splitTextToSize(com, c3W - 8)
    const rowH  = Math.max(lblLL.length, ecoLL.length, comLL.length) * LH + 10
    br(rowH)
    doc.setFillColor(...(ri === 0 ? [15,35,80] : ri%2===1 ? [235,244,255] : [248,250,255]))
    doc.setTextColor(...(ri === 0 ? [255,255,255] : [25,35,65]))
    doc.rect(M, y, CW, rowH, 'F')
    doc.text(lblLL, M + 4,             y + LH)
    doc.text(ecoLL, M + c1W + 4,       y + LH)
    doc.text(comLL, M + c1W + c2W + 4, y + LH)
    doc.setDrawColor(180, 200, 230); doc.setLineWidth(0.3)
    doc.rect(M, y, CW, rowH, 'S')
    doc.line(M + c1W,       y, M + c1W,       y + rowH)
    doc.line(M + c1W + c2W, y, M + c1W + c2W, y + rowH)
    y += rowH
  }
  y += 10

  // ── Consejos ─────────────────────────────────────────────────────────────
  const consejos = (s.consejos || []).slice(0, 5).map(c => normalizePDF(c)).filter(Boolean)
  if (consejos.length > 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(FS)
    const tipBlocks = consejos.map(c => doc.splitTextToSize('- ' + c, CW - 14))
    const tipsH = 22 + tipBlocks.reduce((h, l) => h + l.length * LH + 3, 8)
    br(tipsH)
    doc.setFillColor(55, 65, 100)
    doc.rect(M, y, CW, 22, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text('RECOMENDACIONES Y CONSEJOS CLAVE', M + 8, y + 15)
    y += 22
    const tipsContentH = tipBlocks.reduce((h, l) => h + l.length * LH + 3, 8)
    doc.setFillColor(248, 250, 252)
    doc.rect(M, y, CW, tipsContentH, 'F')
    y += 8
    doc.setFont('helvetica', 'normal'); doc.setFontSize(FS); doc.setTextColor(30, 40, 70)
    for (const ll of tipBlocks) { doc.text(ll, M + 6, y); y += ll.length * LH + 3 }
    y += 4
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const total = doc.internal.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFillColor(30, 80, 150)
    doc.rect(0, PH - 18, PW, 18, 'F')
    doc.setTextColor(200, 220, 255)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
    doc.text('Sistema Inteligente de Viajes de Peru  |  Resumen Ejecutivo', M, PH - 5)
    doc.text(`Pag. ${p} / ${total}`, PW - M - 28, PH - 5)
  }

  doc.save(sumFilename)
}

// ── IntiSun logo ──────────────────────────────────────────────────────────────
function IntiSun({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <radialGradient id="hSunG" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#E8B84B"/>
        </radialGradient>
      </defs>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * 45 * Math.PI) / 180
        return <line key={i}
          x1={50 + Math.cos(a)*24} y1={50 + Math.sin(a)*24}
          x2={50 + Math.cos(a)*44} y2={50 + Math.sin(a)*44}
          stroke="#E8B84B" strokeWidth="3.5" strokeLinecap="round"/>
      })}
      <circle cx="50" cy="50" r="20" fill="url(#hSunG)"/>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Chat() {
  const { firebaseUser, role } = useAuth()
  const { apiFetch }           = useApi()

  // List of chats for sidebar: [{chat_id, preview, created_at, message_count}]
  const [chatList,       setChatList]       = useState([])
  // Currently active chat ID (date-based string)
  const [chatId,         setChatId]         = useState(() => generateChatId())
  // Messages displayed in the chat area
  const [messages,       setMessages]       = useState([])
  // ID of the chat being viewed in read-only mode (null = live mode)
  const [activeChatId,   setActiveChatId]   = useState(null)
  // True when displaying a read-only historical chat
  const [isHistoryView,  setIsHistoryView]  = useState(false)

  const [input,        setInput]        = useState('')
  const [typing,       setTyping]       = useState(false)
  const [sidebarOpen,  setSidebarOpen]  = useState(window.innerWidth > 768)
  const [activeTab,    setActiveTab]    = useState('chat')
  const [summaryCache, setSummaryCache] = useState(null)
  const [userCity,     setUserCity]     = useState('')
  const [showAbout,    setShowAbout]    = useState(false)

  const endRef   = useRef(null)
  const inputRef = useRef(null)

  const email   = firebaseUser?.email ?? firebaseUser?.displayName ?? 'Usuario'
  const isAdmin = role === 'admin'
  // Abbreviated email for compact display
  const emailShort = email.includes('@') ? email.split('@')[0] : email

  // ── Fetch chat list for sidebar ───────────────────────────────────────────
  const fetchChatList = useCallback(async () => {
    try {
      const res = await apiFetch('/chats')
      if (!res.ok) return
      const data = await res.json()
      setChatList(data.chats ?? [])
    } catch (err) {
      console.warn('[fetchChatList]', err.message)
    }
  }, [apiFetch])

  useEffect(() => { fetchChatList() }, [fetchChatList])

  // Scroll to bottom whenever messages or typing change
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, typing])

  // Geolocation → reverse geocode for PDF filename origin
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lon } = pos.coords
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es`)
        .then(r => r.json())
        .then(d => {
          const city = d?.address?.city || d?.address?.town || d?.address?.county || d?.address?.state || ''
          if (city) setUserCity(city)
        })
        .catch(() => {})
    }, () => {})
  }, [])

  // Collapse sidebar on mobile resize
  useEffect(() => {
    const onResize = () => { if (window.innerWidth <= 768) setSidebarOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Select a historical chat from sidebar ─────────────────────────────────
  const selectChat = useCallback(async (selectedChatId) => {
    try {
      const res = await apiFetch(`/chats/${selectedChatId}`)
      if (!res.ok) return
      const data = await res.json()
      setMessages((data.messages ?? []).map(m => ({ role: m.role, content: m.content ?? '' })))
      setActiveChatId(selectedChatId)
      setIsHistoryView(true)
    } catch (err) {
      console.warn('[selectChat]', err.message)
    }
    if (window.innerWidth <= 768) setSidebarOpen(false)
  }, [apiFetch])

  // ── New chat ──────────────────────────────────────────────────────────────
  const newChat = useCallback(() => {
    const newId = generateChatId()
    setChatId(newId)
    setMessages([])
    setActiveChatId(null)
    setIsHistoryView(false)
    setSummaryCache(null)
    fetchChatList()
    if (window.innerWidth <= 768) setSidebarOpen(false)
  }, [fetchChatList])

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (e) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || typing) return

    setMessages(prev => [...prev, { role: 'user', content: text }])
    setInput('')
    if (inputRef.current) inputRef.current.style.height = '42px'
    setTyping(true)
    setIsHistoryView(false)
    setActiveChatId(null)

    try {
      const res = await apiFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, chat_id: chatId }),
      })
      setTyping(false)

      if (!res.ok) {
        const body   = await res.json().catch(() => ({}))
        const detail = body.detail ?? `HTTP ${res.status} ${res.statusText}`
        setMessages(prev => [...prev, { role: 'assistant', content: `Error del servidor: ${detail}`, isError: true }])
        return
      }

      const data = await res.json()
      const msgId = Date.now() + Math.random()
      const msgDestCity = extractDestCity([{ content: data.reply }])
      setMessages(prev => [...prev, {
        id: msgId,
        role: 'assistant',
        content: data.reply,
        usedSearch: data.used_search,
        images: null,
      }])

      // Fetch destination images in background (shown below message)
      if (msgDestCity) {
        apiFetch(`/images/${encodeURIComponent(msgDestCity.toLowerCase())}`)
          .then(r => r.ok ? r.json() : null)
          .then(imgJson => {
            if (imgJson) {
              setMessages(prev => prev.map(m => m.id === msgId ? { ...m, images: imgJson } : m))
            }
          })
          .catch(() => {})
      }

      // Pre-generate summary in background so PDF export is instant
      const bgChatId = chatId
      setTimeout(async () => {
        try {
          const sumRes = await apiFetch('/summary', {
            method: 'POST',
            body: JSON.stringify({ chat_id: bgChatId }),
          })
          if (sumRes.ok) setSummaryCache(await sumRes.json())
        } catch {}
      }, 800)

      // Update sidebar list: if this chat is new, add it at the top
      setChatList(prev => {
        const exists = prev.some(c => c.chat_id === chatId)
        if (exists) return prev
        return [{ chat_id: chatId, preview: text.slice(0, 80), created_at: new Date().toISOString(), message_count: 2 }, ...prev]
      })
    } catch (err) {
      setTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, isError: true }])
    }
  }

  // ── Clear all chats ───────────────────────────────────────────────────────
  const clearAllChats = async () => {
    if (!confirm('¿Borrar TODOS los chats del historial?')) return
    try {
      const res = await apiFetch('/chats', { method: 'DELETE' })
      if (res.ok) {
        setMessages([])
        setChatList([])
        setChatId(generateChatId())
        setActiveChatId(null)
        setIsHistoryView(false)
      }
    } catch (err) {
      alert(`No se pudo borrar: ${err.message}`)
    }
  }

  // ── Auto-resize textarea ──────────────────────────────────────────────────
  const handleInputChange = (e) => {
    setInput(e.target.value)
    const ta = inputRef.current
    if (ta) { ta.style.height = '42px'; ta.style.height = Math.min(ta.scrollHeight, 130) + 'px' }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="chat-root">

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        {/* User info shown inside sidebar */}
        <div className="sidebar-user-section">
          <div className="sidebar-user-avatar">{emailShort[0]?.toUpperCase()}</div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-email">{emailShort}</span>
            <span className={`role-badge role-${role ?? 'none'}`}>{role ?? 'sin rol'}</span>
          </div>
        </div>

        <div className="sidebar-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Conversaciones
        </div>

        <Sidebar
          chats={chatList}
          activeChatId={activeChatId}
          onSelect={selectChat}
          onNewChat={newChat}
        />
      </aside>

      {/* Main panel */}
      <div className="chat-main">

        {/* ── Header (single row — always visible) ── */}
        <header className="chat-header">
          {/* Hamburger — toggle sidebar / historial */}
          <button className="btn-icon" onClick={() => setSidebarOpen(o => !o)} title="Historial">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect x="2" y="4"  width="16" height="2" rx="1"/>
              <rect x="2" y="9"  width="16" height="2" rx="1"/>
              <rect x="2" y="14" width="16" height="2" rx="1"/>
            </svg>
          </button>

          <div className="chat-logo"><IntiSun size={26} /></div>

          <div className="chat-title">
            Viajes Perú
            <span className="chat-title-sub">· Sistema Inteligente</span>
          </div>

          {/* Action buttons */}
          <div className="header-right">
            {/* User info — desktop only (mobile: shown in sidebar) */}
            <span className="user-name">{email}</span>
            <span className={`role-badge role-${role ?? 'none'}`}>{role ?? 'sin rol'}</span>

            {/* Nuevo Chat */}
            <button className="btn-header" onClick={newChat} title="Nuevo chat">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5"  y1="12" x2="19" y2="12"/>
              </svg>
              <span>Nuevo</span>
            </button>

            {/* PDF buttons — only when there are messages */}
            {activeTab === 'chat' && messages.length > 0 && (
              <>
                <button className="btn-header" onClick={() => exportPDF(messages, email, userCity, apiFetch)} title="Reporte detallado PDF">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9"  y1="15" x2="15" y2="15"/>
                  </svg>
                  <span>PDF</span>
                </button>
                <button className="btn-header btn-header-gold"
                  onClick={() => exportPDFSummary(messages, email, activeChatId || chatId, apiFetch, summaryCache, userCity)}
                  title="Resumen ejecutivo PDF (max 2 hojas)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2.2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="7" y1="8"  x2="17" y2="8"/>
                    <line x1="7" y1="12" x2="14" y2="12"/>
                    <line x1="7" y1="16" x2="11" y2="16"/>
                  </svg>
                  <span>Resumen{summaryCache ? ' ✓' : ''}</span>
                </button>
              </>
            )}

            {/* Borrar todos los chats */}
            {(role === 'assistant_user' || role === 'admin') && activeTab === 'chat' && (
              <button className="btn-header" onClick={clearAllChats} title="Borrar historial">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                  <path d="M9 6V4h6v2"/>
                </svg>
                <span className="hide-xs">Limpiar</span>
              </button>
            )}

            {/* Acerca de */}
            <button className="btn-header btn-header-info" onClick={() => setShowAbout(true)} title="Acerca de">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="8.5"/>
                <line x1="12" y1="11" x2="12" y2="16"/>
              </svg>
              <span className="hide-xs">Info</span>
            </button>

            {/* Cerrar sesión */}
            <button className="btn-header" onClick={() => signOut(auth)} title="Cerrar sesión">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>Salir</span>
            </button>
          </div>
        </header>

        {/* Nav tabs */}
        <nav className="chat-nav">
          <button className={`nav-tab ${activeTab === 'chat' ? 'active' : ''}`}
                  onClick={() => setActiveTab('chat')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Chat
          </button>

          {isAdmin && (
            <button className={`nav-tab ${activeTab === 'admin' ? 'active-gold' : ''}`}
                    onClick={() => setActiveTab('admin')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Administración
            </button>
          )}
        </nav>

        {/* Content */}
        {activeTab === 'admin' && isAdmin ? (
          <AdminPanel />
        ) : (
          <>
            {/* History-view banner */}
            {isHistoryView && (
              <div className="history-banner">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                Estás viendo un chat del historial — solo lectura
                <button className="history-banner-btn" onClick={newChat}>+ Nuevo Chat</button>
              </div>
            )}

            {/* Messages area */}
            <div className="messages-area">
              {messages.length === 0 && !typing && (
                <div className="empty-state">
                  <div className="empty-state-icon">🌄</div>
                  <strong>Bienvenido — Sistema Inteligente de Viajes de Perú</strong>
                  Consulta vuelos, buses, hospedaje, clima y lugares turísticos.<br/>
                  Selecciona un chat del historial o escribe tu primera consulta.
                </div>
              )}

              {messages.map((msg, i) => <MessageBubble key={msg.id ?? i} {...msg} />)}

              {typing && (
                <div className="typing-row">
                  <div className="typing-indicator"><span/><span/><span/></div>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Input or history placeholder */}
            {!isHistoryView ? (
              <form className="input-area" onSubmit={sendMessage}>
                <textarea
                  ref={inputRef}
                  className="chat-input"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe tu consulta… (Enter para enviar, Shift+Enter nueva línea)"
                  rows={1}
                  disabled={typing}
                />
                <button className="btn-send" type="submit"
                        disabled={typing || !input.trim()} title="Enviar">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2.2"
                       strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </form>
            ) : (
              <div className="history-input-placeholder">
                <button className="btn-new-chat-lg" onClick={newChat}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5"  y1="12" x2="19" y2="12"/>
                  </svg>
                  Iniciar Nuevo Chat
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Acerca de */}
      {showAbout && (
        <div className="about-overlay" onClick={() => setShowAbout(false)}>
          <div className="about-modal" onClick={e => e.stopPropagation()}>
            <button className="about-close" onClick={() => setShowAbout(false)}>×</button>
            <div className="about-logo"><IntiSun size={42} /></div>
            <h2 className="about-title">Sistema Inteligente de Viajes de Perú</h2>
            <p className="about-desc">
              Asistente conversacional que combina IA generativa con búsqueda web en tiempo real
              para proporcionar recomendaciones personalizadas de vuelos, buses, hospedaje,
              gastronomía y turismo en el Perú con exportación de reportes PDF.
            </p>
            <div className="about-tech">
              <span>React 18</span><span>FastAPI</span><span>Mistral AI</span>
              <span>Firebase Auth</span><span>Firestore</span><span>Tavily Search</span>
              <span>Railway</span>
            </div>
            <div className="about-credits">
              <span className="about-credits-label">Desarrollado por</span>
              <strong className="about-credits-name">Oscar Zelada Pozo</strong>
              <span className="about-version">v2.1 · 2026</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
