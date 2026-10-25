import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/auth.js'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) })
      setAuth(data.user, data.accessToken)
      navigate('/')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-[var(--bg)]">
      <form onSubmit={submit} className="w-80 space-y-3 p-6 rounded-[14px] bg-[var(--surface)] border border-[var(--border)]">
        <h1 className="text-lg font-semibold">Login</h1>
        <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Email or username" />
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <Button type="submit" className="w-full">Sign in</Button>
        <a href="/register" className="text-sm text-[var(--link-and-focus)]">Create account</a>
      </form>
    </div>
  )
}
