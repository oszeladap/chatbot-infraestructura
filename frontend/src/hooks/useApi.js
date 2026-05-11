import { useCallback } from 'react'
import { signOut } from 'firebase/auth'
import { useAuth } from '../context/AuthContext'
import { auth } from '../firebase'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export function useApi() {
  const { firebaseUser } = useAuth()

  // useCallback keeps apiFetch reference stable between renders.
  // Without this, any component with apiFetch in a useCallback/useEffect dep
  // would re-run on every render, creating infinite loops.
  const apiFetch = useCallback(async (path, options = {}) => {
    if (!firebaseUser) throw new Error('AUTH_NULL: Sin usuario autenticado.')

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
        throw new Error(`NETWORK: No se pudo contactar con el servidor — ${err.message}`)
      }
    }

    let res = await doRequest(false)

    // 401 → token inválido o expirado → cerrar sesión (va al login, sin bucle)
    if (res.status === 401) {
      await signOut(auth)
      throw new Error('Sesión expirada. Inicia sesión nuevamente.')
    }

    // 403 → el claim de rol puede estar desactualizado → forzar refresh y reintentar una vez
    if (res.status === 403) {
      res = await doRequest(true)
      if (res.status === 401) {
        await signOut(auth)
        throw new Error('Sesión expirada. Inicia sesión nuevamente.')
      }
    }

    return res
  }, [firebaseUser])

  return { apiFetch }
}
