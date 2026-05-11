import { useState, useEffect, useRef, useCallback } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'
import Sidebar from './Sidebar'
import MessageBubble from './MessageBubble'
import AdminPanel from './AdminPanel'
import './Chat.css'

// ── PDF export ────────────────────────────────────────────────────────────────
function stripMd(text) {
  return (text ?? '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[Fuente:\s*([^\]]+)\]/g, '(Fuente: $1)')
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/^\s*[-*+]\s/gm, '  * ')
    .replace(/^\s*\d+\.\s/gm, '  ')
    .replace(/\|[-:\s|]+\|[\r\n]?/g, '')
    .replace(/\|/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function exportPDF(messages, userEmail) {
  const { jsPDF } = await import('jspdf')
  const doc  = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()   // 595
  const pageH = doc.internal.pageSize.getHeight()  // 842
  const M  = 36
  const CW = pageW - M * 2

  function guard(y, needed = 50) {
    if (y + needed > pageH - 40) { doc.addPage(); return M }
    return y
  }

  // ── PORTADA / CABECERA ────────────────────────────────────
  doc.setFillColor(180, 10, 30)
  doc.rect(0, 0, pageW, 78, 'F')
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
  doc.setFillColor(15, 23, 60)
  doc.rect(0, 83, pageW, 26, 'F')
  const now     = new Date()
  const dateStr = now.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  doc.setTextColor(180, 200, 240)
  doc.setFontSize(8)
  doc.text(`Fecha: ${dateStr}   Hora: ${timeStr}   Usuario: ${userEmail ?? 'N/A'}`, M, 100)

  let y = 122

  // ── SECCIONES ─────────────────────────────────────────────
  const SECTIONS = [
    {
      title: 'COSTOS DE VIAJE EN VUELO Y BUS — COMPARATIVAS',
      sub:   'Tarifas aereas y terrestres con comparativa de operadores',
      hc: [21, 101, 160], rc: [235, 244, 255], ra: [215, 232, 255],
      rx: /vuelo|avio|aerolin|latam|sky|avianca|jetsmart|bus\b|cruz del sur|oltursa|tepsa|aeropuerto|terminal|boleto|pasaje|tarifa/i,
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
      title: 'DATOS DEL CLIMA EN CIUDAD DESTINO',
      sub:   'Condiciones meteorologicas, temperatura y recomendaciones',
      hc: [14, 116, 144], rc: [236, 254, 255], ra: [207, 250, 254],
      rx: /clima|temperatura|lluvia|sol\b|calor|fr[ií]o|humedad|viento|pron[oó]stico|meteorolog/i,
    },
  ]

  // Pares pregunta/respuesta
  const pairs = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user' && !messages[i].isError) {
      const next = messages[i + 1]
      if (next?.role === 'assistant' && !next.isError) {
        pairs.push({ q: messages[i].content ?? '', a: next.content ?? '' })
      }
    }
  }

  for (const sec of SECTIONS) {
    const hits = pairs.filter(p => sec.rx.test(p.q + ' ' + p.a))

    // Cabecera de sección
    y = guard(y, 70)
    doc.setFillColor(...sec.hc)
    doc.rect(M, y, CW, 26, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text(sec.title, M + 8, y + 17)
    y += 26

    // Subtítulo
    doc.setFillColor(242, 244, 250)
    doc.rect(M, y, CW, 17, 'F')
    doc.setTextColor(80, 90, 120)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.text(sec.sub, M + 8, y + 11)
    y += 17

    if (hits.length === 0) {
      doc.setFillColor(250, 250, 253)
      doc.rect(M, y, CW, 22, 'F')
      doc.setTextColor(160, 160, 180)
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8)
      doc.text('Sin informacion disponible sobre este tema en la conversacion actual.', M + 8, y + 14)
      y += 22 + 10
      continue
    }

    for (const pair of hits) {
      // Pregunta
      const qLines = doc.splitTextToSize('> ' + pair.q, CW - 16)
      const qH = Math.max(qLines.length * 12 + 10, 24)
      y = guard(y, qH + 4)
      doc.setFillColor(215, 220, 235)
      doc.rect(M, y, CW, qH, 'F')
      doc.setTextColor(20, 30, 70)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.text(qLines, M + 8, y + 9)
      y += qH

      // Respuesta
      const aClean = stripMd(pair.a)
      const aLines = doc.splitTextToSize(aClean, CW - 16)
      const aH = Math.max(aLines.length * 11.5 + 12, 28)
      y = guard(y, aH + 4)
      doc.setFillColor(...sec.rc)
      doc.rect(M, y, CW, aH, 'F')
      doc.setTextColor(15, 20, 50)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.text(aLines, M + 8, y + 9)
      y += aH

      // Divisor de sección
      doc.setDrawColor(...sec.hc)
      doc.setLineWidth(0.4)
      doc.line(M, y, M + CW, y)
      y += 6
    }
    y += 14
  }

  // ── PIE DE PÁGINA en todas las páginas ───────────────────
  const total = doc.internal.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFillColor(21, 101, 160)
    doc.rect(0, pageH - 22, pageW, 22, 'F')
    doc.setTextColor(200, 220, 255)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text('Sistema Inteligente de Viajes de Peru  |  Documento generado automaticamente', M, pageH - 7)
    doc.text(`Pag. ${p} / ${total}`, pageW - M - 28, pageH - 7)
  }

  doc.save(`recomendaciones-viaje-peru-${now.toISOString().slice(0, 10)}.pdf`)
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
        const angle = (i * 45 * Math.PI) / 180
        const x1 = 50 + Math.cos(angle) * 24, y1 = 50 + Math.sin(angle) * 24
        const x2 = 50 + Math.cos(angle) * 44, y2 = 50 + Math.sin(angle) * 44
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#E8B84B" strokeWidth="3.5" strokeLinecap="round"/>
      })}
      <circle cx="50" cy="50" r="20" fill="url(#hSunG)"/>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Chat() {
  const { firebaseUser, role } = useAuth()
  const { apiFetch }           = useApi()

  const [messages,        setMessages]        = useState([])
  const [historyMessages, setHistoryMessages] = useState([])
  const [input,           setInput]           = useState('')
  const [typing,          setTyping]          = useState(false)
  const [sidebarOpen,     setSidebarOpen]     = useState(window.innerWidth > 768)
  const [activeTab,       setActiveTab]       = useState('chat')  // 'chat' | 'admin'

  const endRef   = useRef(null)
  const inputRef = useRef(null)

  const email    = firebaseUser?.email ?? firebaseUser?.displayName ?? 'Usuario'
  const isAdmin  = role === 'admin'

  // ── Load history ────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch('/history')
      if (!res.ok) return
      const data = await res.json()
      const msgs = data.messages ?? []
      setHistoryMessages(msgs)
      setMessages(msgs.map(m => ({ role: m.role, content: m.content ?? '' })))
    } catch (err) {
      console.warn('[loadHistory]', err.message)
    }
  }, [apiFetch])

  useEffect(() => { loadHistory() }, [loadHistory])

  // Scroll to bottom on new messages
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, typing])

  // Collapse sidebar by default on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) setSidebarOpen(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = async (e) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || typing) return

    setMessages(prev => [...prev, { role: 'user', content: text }])
    setInput('')
    if (inputRef.current) inputRef.current.style.height = '42px'
    setTyping(true)

    try {
      const res = await apiFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, session_id: null }),
      })
      setTyping(false)

      if (!res.ok) {
        const body   = await res.json().catch(() => ({}))
        const detail = body.detail ?? `HTTP ${res.status} ${res.statusText}`
        setMessages(prev => [...prev, { role: 'assistant', content: `Error del servidor: ${detail}`, isError: true }])
        return
      }

      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, usedSearch: data.used_search }])
      loadHistory()
    } catch (err) {
      setTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, isError: true }])
    }
  }

  // ── Clear history ───────────────────────────────────────────────────────────
  const clearHistory = async () => {
    if (!confirm('¿Borrar todo el historial de esta sesión?')) return
    try {
      const res = await apiFetch('/history', { method: 'DELETE' })
      if (res.ok) { setMessages([]); setHistoryMessages([]) }
    } catch (err) {
      alert(`No se pudo borrar el historial: ${err.message}`)
    }
  }

  // ── Auto-resize textarea ────────────────────────────────────────────────────
  const handleInputChange = (e) => {
    setInput(e.target.value)
    const ta = inputRef.current
    if (ta) { ta.style.height = '42px'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px' }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="chat-root">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
          Historial
        </div>
        <Sidebar messages={historyMessages} />
      </aside>

      {/* Main */}
      <div className="chat-main">

        {/* Header */}
        <header className="chat-header">
          <button className="btn-icon" onClick={() => setSidebarOpen(o => !o)} title="Mostrar/ocultar historial">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect x="2" y="4"  width="16" height="2" rx="1"/>
              <rect x="2" y="9"  width="16" height="2" rx="1"/>
              <rect x="2" y="14" width="16" height="2" rx="1"/>
            </svg>
          </button>

          <div className="chat-logo">
            <IntiSun size={28} />
          </div>

          <div className="chat-title">
            Transporte Perú
            <span className="chat-title-sub">· Asistente inteligente de viajes</span>
          </div>

          <div className="header-right">
            <span className="user-name">{email}</span>
            <span className={`role-badge role-${role ?? 'none'}`}>{role ?? 'sin rol'}</span>

            {/* PDF export — only in chat tab */}
            {activeTab === 'chat' && messages.length > 0 && (
              <button className="btn-header" onClick={() => exportPDF(messages, email)} title="Exportar conversación a PDF">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                <span>PDF</span>
              </button>
            )}

            {(role === 'assistant_user' || role === 'admin') && activeTab === 'chat' && (
              <button className="btn-header" onClick={clearHistory} title="Borrar historial">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                <span>Limpiar</span>
              </button>
            )}

            <button className="btn-header" onClick={() => signOut(auth)} title="Cerrar sesión">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>Salir</span>
            </button>
          </div>
        </header>

        {/* Nav tabs — always show Chat, show Admin only for admins */}
        <nav className="chat-nav">
          <button
            className={`nav-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Chat
          </button>

          {isAdmin && (
            <button
              className={`nav-tab ${activeTab === 'admin' ? 'active-gold' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Administración
            </button>
          )}
        </nav>

        {/* Content: Chat or Admin */}
        {activeTab === 'admin' && isAdmin ? (
          <AdminPanel />
        ) : (
          <>
            {/* Messages */}
            <div className="messages-area">
              {messages.length === 0 && !typing && (
                <div className="empty-state">
                  <div className="empty-state-icon">🌄</div>
                  <strong>Bienvenido a Transporte Perú</strong>
                  Pregúntame sobre vuelos, buses, horarios,<br/>
                  tarifas y destinos en todo el Perú.
                </div>
              )}

              {messages.map((msg, i) => (
                <MessageBubble key={i} {...msg} />
              ))}

              {typing && (
                <div className="typing-row">
                  <div className="typing-indicator">
                    <span/><span/><span/>
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Input */}
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
              <button className="btn-send" type="submit" disabled={typing || !input.trim()} title="Enviar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </form>
          </>
        )}

      </div>
    </div>
  )
}
