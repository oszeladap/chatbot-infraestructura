import { useState, useEffect, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import './AdminPanel.css'

const ROLES = ['assistant_user', 'viewer', 'admin']

function rolePillClass(role) {
  if (!role) return 'sin-rol'
  return role
}

function fmtDate(ms) {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AdminPanel() {
  const { apiFetch }       = useApi()
  const { firebaseUser }   = useAuth()

  const [users,     setUsers]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [filter,    setFilter]    = useState('all')
  const [pending,   setPending]   = useState({})   // uid → selected role string
  const [saving,    setSaving]    = useState({})    // uid → bool
  const [deleting,  setDeleting]  = useState({})    // uid → bool
  const [toast,     setToast]     = useState(null)  // { msg, type }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/admin/users')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setUsers(data.users ?? [])
    } catch (err) {
      showToast(`Error al cargar usuarios: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  useEffect(() => { loadUsers() }, [loadUsers])

  const applyRole = async (uid) => {
    const role = pending[uid]
    setSaving(s => ({ ...s, [uid]: true }))
    try {
      const res = await apiFetch(`/admin/users/${uid}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: role === '' ? null : role }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `HTTP ${res.status}`)
      }
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role: role || null } : u))
      setPending(p => { const n = { ...p }; delete n[uid]; return n })
      showToast('Rol actualizado correctamente.')
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error')
    } finally {
      setSaving(s => ({ ...s, [uid]: false }))
    }
  }

  const deleteUser = async (uid, email) => {
    if (!confirm(`¿Eliminar definitivamente la cuenta de ${email}?`)) return
    setDeleting(d => ({ ...d, [uid]: true }))
    try {
      const res = await apiFetch(`/admin/users/${uid}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `HTTP ${res.status}`)
      }
      setUsers(prev => prev.filter(u => u.uid !== uid))
      showToast(`Usuario ${email} eliminado.`)
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error')
    } finally {
      setDeleting(d => ({ ...d, [uid]: false }))
    }
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.display_name ?? '').toLowerCase().includes(q)
    const matchFilter = filter === 'all' ||
      (filter === 'sin-rol' ? !u.role : u.role === filter)
    return matchSearch && matchFilter
  })

  return (
    <div className="admin-root">

      {/* Toolbar */}
      <div className="admin-toolbar">
        <input
          className="admin-search"
          placeholder="Buscar usuario…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="admin-filter" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">Todos los roles</option>
          <option value="admin">Admin</option>
          <option value="assistant_user">Assistant user</option>
          <option value="viewer">Viewer</option>
          <option value="sin-rol">Sin rol</option>
        </select>
        <span className="admin-count">{filtered.length} usuario{filtered.length !== 1 ? 's' : ''}</span>
        <button className="btn-apply" onClick={loadUsers} disabled={loading}>
          {loading ? '…' : 'Actualizar'}
        </button>
      </div>

      {/* Table */}
      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading">
            <span className="spinner" />
            Cargando usuarios…
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Correo</th>
                <th>Rol actual</th>
                <th className="col-created">Creado</th>
                <th className="col-last">Último acceso</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: '#94A3B8', padding: '32px' }}>
                    No se encontraron usuarios.
                  </td>
                </tr>
              )}
              {filtered.map(u => {
                const isMe      = u.uid === firebaseUser?.uid
                const isSaving  = saving[u.uid]
                const isDeleting = deleting[u.uid]
                const pendingRole = pending[u.uid]
                const currentRole = pendingRole !== undefined ? pendingRole : (u.role ?? '')
                const roleChanged = pendingRole !== undefined && pendingRole !== (u.role ?? '')

                return (
                  <tr key={u.uid}>
                    <td>{u.display_name || <span style={{ color: '#94A3B8' }}>—</span>}</td>
                    <td>
                      {u.email}
                      {isMe && <span style={{ marginLeft: 6, fontSize: '.68rem', color: '#94A3B8' }}>(tú)</span>}
                    </td>
                    <td>
                      <span className={`role-pill ${rolePillClass(u.role)}`}>
                        {u.role ?? 'sin rol'}
                      </span>
                    </td>
                    <td className="col-created">{fmtDate(u.created_at)}</td>
                    <td className="col-last">{fmtDate(u.last_sign_in)}</td>
                    <td>
                      <div className="admin-actions">
                        <select
                          className="role-select"
                          value={currentRole}
                          disabled={isSaving || isDeleting}
                          onChange={e => setPending(p => ({ ...p, [u.uid]: e.target.value }))}
                        >
                          <option value="">Sin rol</option>
                          {ROLES.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <button
                          className="btn-apply"
                          disabled={!roleChanged || isSaving || isDeleting}
                          onClick={() => applyRole(u.uid)}
                        >
                          {isSaving ? '…' : 'Aplicar'}
                        </button>
                        <button
                          className="btn-delete"
                          disabled={isMe || isSaving || isDeleting}
                          onClick={() => deleteUser(u.uid, u.email)}
                          title={isMe ? 'No puedes eliminarte a ti mismo' : 'Eliminar usuario'}
                        >
                          {isDeleting ? '…' : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  )
}
