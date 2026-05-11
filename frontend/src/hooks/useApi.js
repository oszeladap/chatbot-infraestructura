import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export function useApi() {
  const { firebaseUser } = useAuth()

  const apiFetch = async (path, options = {}) => {
    if (!firebaseUser) throw new Error('AUTH_NULL: Sin usuario autenticado. Recarga la página.')

    const doRequest = async (forceRefresh) => {
      const token = await firebaseUser.getIdToken(forceRefresh)
      try {
        return await fetch(`${API_BASE}${path}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.headers ?? {}),
          },
        })
      } catch (err) {
        throw new Error(`NETWORK: No se pudo contactar ${API_BASE}${path} — ${err.message}`)
      }
    }

    let res = await doRequest(false)

    // On 401 → session invalid, force logout
    if (res.status === 401) {
      sessionStorage.removeItem('firebase_token')
      window.location.reload()
      throw new Error('AUTH_401: Token rechazado por el servidor.')
    }

    // On 403 → claims may be stale; force-refresh token and retry once
    if (res.status === 403) {
      res = await doRequest(true)
      if (res.status === 401) {
        sessionStorage.removeItem('firebase_token')
        window.location.reload()
        throw new Error('AUTH_401: Token rechazado por el servidor.')
      }
    }

    return res
  }

  return { apiFetch }
}
