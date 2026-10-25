import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/auth.js'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      const data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, displayName, password }) })
      setAuth(data.user, data.accessToken)
      navigate('/')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-[var(--bg)]">
      <form onSubmit={submit} className="w-80 space-y-3 p-6 rounded-[14px] bg-[var(--surface)] border border-[var(--border)]">
        <h1 className="text-lg font-semibold">Register</h1>
        <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <Button type="submit" className="w-full">Create account</Button>
        <a href="/login" className="text-sm text-[var(--link-and-focus)]">Sign in</a>
      </form>
    </div>
  )
}
