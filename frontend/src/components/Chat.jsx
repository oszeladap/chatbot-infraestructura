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
async function exportPDF(messages) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const pageW  = doc.internal.pageSize.getWidth()
  const pageH  = doc.internal.pageSize.getHeight()
  const margin = 48
  const maxW   = pageW - margin * 2
  let y        = margin

  // Header band
  doc.setFillColor(21, 101, 160)
  doc.rect(0, 0, pageW, 64, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Asistente de Transporte · Perú', margin, 38)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Exportado el ${new Date().toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric' })}`, margin, 54)

  y = 90

  messages.forEach((msg, idx) => {
    const isUser = msg.role === 'user'
    const label  = isUser ? 'Usuario' : 'Asistente'
    const color  = isUser ? [21, 101, 160] : [45, 106, 79]

    // Label
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...color)
    doc.text(label.toUpperCase(), margin, y)
    y += 14

    // Bubble background
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(15, 23, 42)
    const lines = doc.splitTextToSize(msg.content ?? '', maxW - 16)
    const bh    = lines.length * 14 + 16

    doc.setFillColor(...(isUser ? [219, 234, 254] : [241, 245, 249]))
    doc.roundedRect(margin, y - 4, maxW, bh, 6, 6, 'F')
    doc.text(lines, margin + 8, y + 10)
    y += bh + 16

    // Page break
    if (y > pageH - margin && idx < messages.length - 1) {
      doc.addPage()
      y = margin
    }
  })

  // Footer
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text('Transporte Perú — Asistente inteligente de viajes', margin, pageH - 24)

  doc.save('conversacion-transporte-peru.pdf')
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
              <button className="btn-header" onClick={() => exportPDF(messages)} title="Exportar conversación a PDF">
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
