import { useState } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../firebase'
import './Login.css'

const ERRORS = {
  'auth/invalid-email':          'Correo electrónico inválido.',
  'auth/user-not-found':         'No existe una cuenta con ese correo.',
  'auth/wrong-password':         'Contraseña incorrecta.',
  'auth/invalid-credential':     'Credenciales incorrectas. Verifica tu correo y contraseña.',
  'auth/email-already-in-use':   'Ya existe una cuenta con ese correo.',
  'auth/weak-password':          'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests':      'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Error de red. Verifica tu conexión.',
  'auth/unauthorized-domain':    'Dominio no autorizado en Firebase.',
  'auth/popup-closed-by-user':   null,
}

function friendlyError(code) {
  const msg = ERRORS[code]
  if (msg === null) return null
  return msg ?? `Error inesperado (${code}).`
}

/* ── Inca Sun (Inti) SVG ── */
function IntiSun({ size = 56 }) {
  const rays = Array.from({ length: 16 }, (_, i) => i)
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <radialGradient id="sunGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#E8B84B"/>
        </radialGradient>
      </defs>
      {/* Rays */}
      {rays.map((i) => {
        const angle = (i * 360) / 16
        const rad   = (angle * Math.PI) / 180
        const isWavy = i % 2 === 1
        const x1 = 50 + Math.cos(rad) * 24
        const y1 = 50 + Math.sin(rad) * 24
        const x2 = 50 + Math.cos(rad) * 46
        const y2 = 50 + Math.sin(rad) * 46
        return isWavy ? (
          <path key={i}
            d={`M ${x1} ${y1} Q ${50 + Math.cos(rad + 0.25) * 35} ${50 + Math.sin(rad + 0.25) * 35} ${x2} ${y2}`}
            stroke="#E8B84B" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        ) : (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#E8B84B" strokeWidth="3" strokeLinecap="round"/>
        )
      })}
      {/* Circle */}
      <circle cx="50" cy="50" r="20" fill="url(#sunGrad)"/>
      {/* Face */}
      <circle cx="44" cy="47" r="2.5" fill="#8B5E00"/>
      <circle cx="56" cy="47" r="2.5" fill="#8B5E00"/>
      <path d="M 44 55 Q 50 60 56 55" stroke="#8B5E00" strokeWidth="2"
            strokeLinecap="round" fill="none"/>
    </svg>
  )
}

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [nombre,   setNombre]   = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [mode,     setMode]     = useState('login')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (mode === 'register' && !nombre.trim()) {
      setError('Por favor ingresa tu nombre completo.')
      return
    }
    setLoading(true)
    try {
      if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        if (nombre.trim()) {
          await updateProfile(cred.user, { displayName: nombre.trim() })
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      const msg = friendlyError(err.code)
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    setLoading(true)
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (err) {
      const msg = friendlyError(err.code)
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-root">
      <div className="login-card">

        <div className="login-logo">
          <IntiSun size={60} />
        </div>

        <h1 className="login-title">Transporte Perú</h1>
        <p className="login-subtitle">Asistente inteligente de viajes</p>

        <div className="login-tagline">
          <span>✈ Vuelos</span>&nbsp;·&nbsp;
          <span>🚌 Buses</span>&nbsp;·&nbsp;
          <span>🚂 Trenes</span>&nbsp;·&nbsp;
          <span>🌤 Clima</span>
        </div>

        <button className="btn-google" onClick={handleGoogle} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          Continuar con Google
        </button>

        <div className="divider"><span>o</span></div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <label className="field-label" htmlFor="l-nombre">Nombre completo</label>
              <input id="l-nombre" className="field-input" type="text" value={nombre}
                onChange={e => setNombre(e.target.value)} placeholder="Tu nombre completo"
                required maxLength={100} autoComplete="name"/>
            </>
          )}

          <label className="field-label" htmlFor="l-email">Correo electrónico</label>
          <input id="l-email" className="field-input" type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com"
            required autoComplete="email"/>

          <label className="field-label" htmlFor="l-pass">Contraseña</label>
          <input id="l-pass" className="field-input" type="password" value={password}
            onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            required minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/>

          {error && <p className="login-error">{error}</p>}

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Cargando…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>
        </form>

        <button className="link-toggle"
          onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); setNombre('') }}>
          {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Ingresar'}
        </button>

        {/* Peru destination icons */}
        <div className="peru-icons">
          {[['🗿','Machu Picchu'],['🌊','Paracas'],['🌿','Amazonía'],['🏔','Andes'],['🏙','Lima']].map(([icon, label]) => (
            <div key={label} className="peru-icon-item">
              <span style={{ fontSize: '1.3rem' }}>{icon}</span>
              {label}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
