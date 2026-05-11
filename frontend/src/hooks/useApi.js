import { useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export function useApi() {
  const { firebaseUser } = useAuth()

  // useCallback keeps apiFetch reference stable between renders so that
  // useCallback/useEffect deps that include apiFetch don't re-trigger on
  // every render (which would create infinite request loops).
  const apiFetch = useCallback(async (path, options = {}) => {
    if (!firebaseUser) throw new Error('Sin sesión activa.')

    const buildHeaders = (token) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    })

    // First attempt with the cached token (no extra network call)
    const token = await firebaseUser.getIdToken(false)
    let res
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: buildHeaders(token),
      })
    } catch (err) {
      throw new Error(`No se pudo contactar con el servidor — ${err.message}`)
    }

    // On 401 or 403: the cached token may be stale (expired or claims not yet
    // updated). Force-refresh once and retry — this fixes the case where the
    // role claim was set after the last token was issued.
    if (res.status === 401 || res.status === 403) {
      let freshToken
      try {
        freshToken = await firebaseUser.getIdToken(true)
      } catch {
        // If refresh itself fails, return the original response
        return res
      }
      try {
        res = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers: buildHeaders(freshToken),
        })
      } catch (err) {
        throw new Error(`No se pudo contactar con el servidor — ${err.message}`)
      }
    }

    return res
  }, [firebaseUser])

  return { apiFetch }
}
