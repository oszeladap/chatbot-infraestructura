import { createContext, useContext, useEffect, useState } from 'react'
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
        const token  = await user.getIdToken(true)
        const claims = decodeJwt(token)
        setFirebaseUser(user)
        setRole(claims.role ?? null)
        sessionStorage.setItem('firebase_token', token)
      } else {
        setFirebaseUser(null)
        setRole(null)
        sessionStorage.removeItem('firebase_token')
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const getToken = async () => {
    if (!firebaseUser) throw new Error('AUTH_NULL: Sin usuario autenticado. Recarga la página.')
    return firebaseUser.getIdToken(false)
  }

  return (
    <AuthContext.Provider value={{ firebaseUser, role, loading, getToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
