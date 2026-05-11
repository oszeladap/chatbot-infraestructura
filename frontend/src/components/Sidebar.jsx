// ── Session grouping (exported for use in Chat.jsx) ──────────────────────────
export function groupIntoSessions(messages) {
  if (!messages || messages.length === 0) return []

  const sorted = [...messages].sort(
    (a, b) => new Date(a.timestamp ?? 0) - new Date(b.timestamp ?? 0)
  )

  const groups = []
  let current = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const gapH =
      (new Date(sorted[i].timestamp ?? 0) - new Date(sorted[i - 1].timestamp ?? 0)) /
      3_600_000
    if (gapH > 3) {
      groups.push(current)
      current = [sorted[i]]
    } else {
      current.push(sorted[i])
    }
  }
  groups.push(current)

  return groups.reverse() // most-recent first
}

function fmtDate(ts) {
  if (!ts) return ''
  const d   = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date(now - 86_400_000).toDateString())
    return 'Ayer ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Sidebar({ sessions, activeIdx, onSelect, onNewChat }) {
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

      {sessions.length === 0 && (
        <div className="sidebar-empty">Sin historial aún.<br/>Empieza una consulta.</div>
      )}

      {sessions.map((session, i) => {
        const firstUser  = session.find(m => m.role === 'user')
        const preview    = (firstUser?.content ?? '').slice(0, 54)
        const userCount  = session.filter(m => m.role === 'user').length
        const dateLabel  = fmtDate(session[0]?.timestamp)

        return (
          <button
            key={i}
            className={`session-item ${activeIdx === i ? 'session-active' : ''}`}
            onClick={() => onSelect(session, i)}
          >
            <div className="session-meta">
              <span className="session-date">{dateLabel}</span>
              <span className="session-count">{userCount} consulta{userCount !== 1 ? 's' : ''}</span>
            </div>
            <p className="session-preview">
              {preview}{preview.length >= 54 ? '…' : ''}
            </p>
          </button>
        )
      })}
    </div>
  )
}
