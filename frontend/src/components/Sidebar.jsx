export default function Sidebar({ messages }) {
  if (!messages.length) {
    return <div style={{ padding: '16px 18px', color: '#475569', fontSize: '.85rem' }}>Sin mensajes aún</div>
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {messages.map((msg, i) => (
        <div key={i} style={{
          padding: '10px 18px',
          borderBottom: '1px solid #1e293b',
          cursor: 'default',
        }}>
          <span style={{
            fontSize: '.68rem',
            fontWeight: 700,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: msg.role === 'user' ? '#60a5fa' : '#34d399',
          }}>
            {msg.role === 'user' ? 'Tú' : 'Asistente'}
          </span>
          <p style={{
            fontSize: '.8rem',
            color: '#94a3b8',
            marginTop: 3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {(msg.content ?? '').slice(0, 60)}
            {(msg.content ?? '').length > 60 ? '…' : ''}
          </p>
        </div>
      ))}
    </div>
  )
}
