import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { useTheme } from '../hooks/useTheme'
import { AuthLayout, Field, SubmitBtn, FormError } from '../components/AuthLayout'

export default function RegisterPage() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore(s => s.setAuth)
  const [username, setUsername] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPass]     = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const T = useTheme()

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const data = await api.post('/api/auth/register', { username, email, password })
      setAuth(data.token, data.uid, data.username)
      navigate('/onboarding')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Create account">
      <form onSubmit={submit}>
        <Field label="Username" type="text" value={username}
               onChange={e => setUsername(e.target.value)} required />
        <Field label="Email" type="email" value={email}
               onChange={e => setEmail(e.target.value)} required />
        <Field label="Password (min 8 chars)" type="password" value={password}
               onChange={e => setPass(e.target.value)} required />
        {error && <FormError>{error}</FormError>}
        <SubmitBtn loading={loading}>Create account</SubmitBtn>
      </form>
      <p style={{ marginTop: 16, fontSize: 13, color: T.ink3, textAlign: 'center' }}>
        Have an account? <Link to="/login" style={{ color: '#0070f3' }}>Sign in</Link>
      </p>
    </AuthLayout>
  )
}
