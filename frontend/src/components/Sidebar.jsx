// ── Chat date formatting from chat_id (YYYYMMDD_HHmmss_mmm) ──────────────────
function formatChatId(chatId) {
  if (!chatId || chatId.length < 13) return chatId ?? ''
  // Parse YYYYMMDD_HHmmss
  const Y  = chatId.slice(0, 4)
  const M  = chatId.slice(4, 6)
  const D  = chatId.slice(6, 8)
  const h  = chatId.slice(9, 11)
  const m  = chatId.slice(11, 13)
  const date = new Date(`${Y}-${M}-${D}T${h}:${m}:00`)
  if (isNaN(date)) return chatId

  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return 'Hoy ' + date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now - 86_400_000)
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Ayer ' + date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  }
  return (
    date.toLocaleDateString('es', { day: '2-digit', month: 'short' }) +
    ' ' +
    date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Sidebar({ chats, activeChatId, onSelect, onNewChat }) {
  const consultaCount = (chat) => Math.floor((chat.message_count ?? 0) / 2)

  return (
    <div className="sidebar-list">
      <button className="sidebar-new-chat" onClick={onNewChat}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5"  y1="12" x2="19" y2="12"/>
        </svg>
        Nuevo Chat
      </button>

      {chats.length === 0 && (
        <div className="sidebar-empty">Sin historial aún.<br/>Empieza una consulta.</div>
      )}

      {chats.map((chat) => {
        const count   = consultaCount(chat)
        const preview = (chat.preview ?? '').slice(0, 54)
        return (
          <button
            key={chat.chat_id}
            className={`session-item ${activeChatId === chat.chat_id ? 'session-active' : ''}`}
            onClick={() => onSelect(chat.chat_id)}
          >
            <div className="session-meta">
              <span className="session-date">{formatChatId(chat.chat_id)}</span>
              <span className="session-count">
                {count} consulta{count !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="session-preview">
              {preview || '(chat vacío)'}{preview.length >= 54 ? '…' : ''}
            </p>
          </button>
        )
      })}
    </div>
  )
}
