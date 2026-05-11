import { useState, useEffect, useRef, useCallback } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'
import Sidebar from './Sidebar'
import MessageBubble from './MessageBubble'
import './Chat.css'

export default function Chat() {
  const { firebaseUser, role } = useAuth()
  const { apiFetch }           = useApi()

  const [messages,        setMessages]        = useState([])
  const [historyMessages, setHistoryMessages] = useState([])
  const [input,           setInput]           = useState('')
  const [typing,          setTyping]          = useState(false)
  const [sidebarOpen,     setSidebarOpen]     = useState(true)

  const endRef   = useRef(null)
  const inputRef = useRef(null)

  const email = firebaseUser?.email ?? firebaseUser?.displayName ?? 'Usuario'

  // -------------------------------------------------------------------------
  // Load conversation history
  // -------------------------------------------------------------------------
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

  // Scroll to bottom whenever messages or typing change
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, typing])

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------
  const sendMessage = async (e) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || typing) return

    setMessages(prev => [...prev, { role: 'user', content: text }])
    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = '42px'
    }
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
      console.error('[sendMessage]', err)
    }
  }

  // -------------------------------------------------------------------------
  // Clear history
  // -------------------------------------------------------------------------
  const clearHistory = async () => {
    if (!confirm('¿Borrar todo el historial de esta sesión?')) return
    try {
      const res = await apiFetch('/history', { method: 'DELETE' })
      if (res.ok) {
        setMessages([])
        setHistoryMessages([])
      }
    } catch (err) {
      alert(`No se pudo borrar el historial: ${err.message}`)
    }
  }

  // -------------------------------------------------------------------------
  // Auto-resize textarea
  // -------------------------------------------------------------------------
  const handleInputChange = (e) => {
    setInput(e.target.value)
    const ta = inputRef.current
    if (ta) {
      ta.style.height = '42px'
      ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="chat-root">

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-header">Historial</div>
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

          <span className="chat-title">Asistente de Transporte · Perú</span>

          <div className="header-right">
            <span className="user-name">{email}</span>
            <span className={`role-badge role-${role ?? 'none'}`}>{role ?? 'sin rol'}</span>
            {role === 'assistant_user' && (
              <button className="btn-outline" onClick={clearHistory}>Limpiar</button>
            )}
            <button className="btn-outline" onClick={() => signOut(auth)}>Salir</button>
          </div>
        </header>

        {/* Messages */}
        <div className="messages-area">
          {messages.length === 0 && !typing && (
            <div className="empty-state">
              <strong>Bienvenido</strong>
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
          <button className="btn-send" type="submit" disabled={typing || !input.trim()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                 strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>

      </div>
    </div>
  )
}
