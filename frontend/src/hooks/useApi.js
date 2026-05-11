import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export function useApi() {
  const { getToken } = useAuth()

  const apiFetch = async (path, options = {}) => {
    const token = await getToken()

    let res
    try {
      res = await fetch(`${API_BASE}${path}`, {
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

    if (res.status === 401) {
      sessionStorage.removeItem('firebase_token')
      window.location.reload()
      throw new Error('AUTH_401: Token rechazado por el servidor.')
    }

    return res
  }

  return { apiFetch }
}
