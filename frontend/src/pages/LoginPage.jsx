import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { useTheme } from '../hooks/useTheme'
import { AuthLayout, Field, SubmitBtn, FormError } from '../components/AuthLayout'

const OAUTH_ERRORS = {
  state_mismatch:       'Sign-in session expired. Please try again.',
  no_verified_email:    'Your GitHub account has no verified email.',
  token_exchange_failed:'GitHub rejected the sign-in attempt.',
  user_fetch_failed:    'Could not load your GitHub profile.',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore(s => s.setAuth)
  const [email, setEmail]     = useState('')
  const [password, setPass]   = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState({ github: false })
  const T = useTheme()

  useEffect(() => {
    // Pick up JWT from the OAuth redirect (`/login#token=…&uid=…&username=…`).
    if (window.location.hash && window.location.hash.length > 1) {
      const p = new URLSearchParams(window.location.hash.slice(1))
      const token = p.get('token')
      const uid   = p.get('uid')
      const uname = p.get('username')
      if (token && uid && uname) {
        setAuth(token, Number(uid), uname)
        history.replaceState(null, '', '/chat')
        navigate('/chat', { replace: true })
        return
      }
    }
    // Show a readable error when the OAuth backend redirected with ?error=…
    const q = new URLSearchParams(window.location.search)
    const err = q.get('error')
    if (err) {
      setError(OAUTH_ERRORS[err] || `GitHub sign-in failed: ${err}`)
      history.replaceState(null, '', '/login')
    }
  }, [navigate, setAuth])

  useEffect(() => {
    fetch('/api/auth/providers')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setProviders(d))
      .catch(() => {})
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.post('/api/auth/login', { email, password })
      setAuth(data.token, data.uid, data.username)
      navigate('/chat')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Sign in">
      <form onSubmit={submit}>
        <Field label="Email" type="email" value={email}
               onChange={e => setEmail(e.target.value)} required />
        <Field label="Password" type="password" value={password}
               onChange={e => setPass(e.target.value)} required />
        {error && <FormError>{error}</FormError>}
        <SubmitBtn loading={loading}>Sign in</SubmitBtn>
      </form>

      {providers.github && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                        margin: '18px 0 12px', color: T.ink4, fontSize: 12 }}>
            <div style={{ flex: 1, height: 1, background: T.line }} />
            or
            <div style={{ flex: 1, height: 1, background: T.line }} />
          </div>
          <a href="/api/auth/github/start"
             style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 8, width: '100%', padding: '10px 0', fontSize: 14,
                      fontWeight: 500, background: '#24292f', color: '#fff',
                      border: 'none', borderRadius: 7, cursor: 'pointer',
                      textDecoration: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
            </svg>
            Sign in with GitHub
          </a>
        </>
      )}

      <p style={{ marginTop: 16, fontSize: 13, color: T.ink3, textAlign: 'center' }}>
        No account? <Link to="/register" style={{ color: '#0070f3' }}>Register</Link>
      </p>
    </AuthLayout>
  )
}
