import { useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export function useApi() {
  const { firebaseUser } = useAuth()

  // useCallback keeps apiFetch reference stable between renders,
  // preventing useEffect / useCallback deps from triggering on every render.
  const apiFetch = useCallback(async (path, options = {}) => {
    if (!firebaseUser) throw new Error('Sin sesión activa.')

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
        throw new Error(`No se pudo contactar con el servidor — ${err.message}`)
      }
    }

    let res = await doRequest(false)

    // 403 → el claim de rol puede estar desactualizado → refrescar token y reintentar UNA vez
    if (res.status === 403) {
      res = await doRequest(true)
    }

    // Nunca llamar signOut() aquí: un error del servidor no debe cerrar la sesión de Firebase.
    // Los componentes reciben el response y muestran el error apropiado.
    return res
  }, [firebaseUser])

  return { apiFetch }
}
