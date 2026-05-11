import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase'

const AuthContext = createContext(null)

function decodeJwt(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64))
  } catch {
    return {}
  }
}

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [role, setRole]                 = useState(null)
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Try to get a fresh token with the latest custom claims.
        // If this fails (network issue, etc.) we still recognise the user
        // as authenticated — just with a null role until the next refresh.
        try {
          const token  = await user.getIdToken(true)
          const claims = decodeJwt(token)
          setRole(claims.role ?? null)
          sessionStorage.setItem('firebase_token', token)
        } catch {
          setRole(null)
        }
        setFirebaseUser(user)
      } else {
        setFirebaseUser(null)
        setRole(null)
        sessionStorage.removeItem('firebase_token')
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const getToken = useCallback(async () => {
    if (!firebaseUser) throw new Error('Sin sesión activa.')
    return firebaseUser.getIdToken(false)
  }, [firebaseUser])

  return (
    <AuthContext.Provider value={{ firebaseUser, role, loading, getToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
