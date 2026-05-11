export default function MessageBubble({ role, content, usedSearch = false, isError = false }) {
  const time = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`bubble-row ${role}`}>
      <div className={`bubble${isError ? ' bubble-error' : ''}`}>
        <pre className="bubble-text">{content}</pre>
      </div>
      <div className="bubble-meta">
        <span>{time}</span>
        {usedSearch && <span className="badge-search">Búsqueda web</span>}
      </div>
    </div>
  )
}
