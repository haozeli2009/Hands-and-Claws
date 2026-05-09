import { useAuthStore } from '../store/authStore'

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function request(method, path, body) {
  const token = useAuthStore.getState().token
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    if (res.status === 401) useAuthStore.getState().clear()
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw Object.assign(new Error(err.detail ?? 'Request failed'), { status: res.status })
  }
  return res.json()
}

export const api = {
  post: (path, body) => request('POST', path, body),
  get:  (path)       => request('GET',  path),
}
