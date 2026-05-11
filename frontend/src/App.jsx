import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/Login'
import Chat  from './components/Chat'

function AppInner() {
  const { firebaseUser, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner" />
      </div>
    )
  }

  return firebaseUser ? <Chat /> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
