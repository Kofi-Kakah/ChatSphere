import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/auth.js'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Avatar from '../../components/ui/Avatar.jsx'

export default function Profile() {
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)
  const accessToken = useAuthStore((s) => s.accessToken)
  const [form, setForm] = useState({ displayName: '', bio: '', username: '' })
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (user) setForm({ displayName: user.displayName || '', bio: user.bio || '', username: user.username || '' })
  }, [user])

  async function save(e) {
    e.preventDefault()
    try {
      const data = await api('/users/me', { method: 'PATCH', body: JSON.stringify(form) })
      setAuth(data.user, accessToken)
      setMsg('Saved')
    } catch (err) { setMsg(err.message) }
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-[var(--bg)] p-6">
      <form onSubmit={save} className="w-96 space-y-3 p-6 rounded-[14px] bg-[var(--surface)] border border-[var(--border)]">
        <div className="flex items-center gap-3">
          <Avatar name={user?.displayName || ''} size={56} src={user?.avatarUrl} />
        </div>
        <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Display name" />
        <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Username" />
        <Input value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Bio" />
        {msg && <p className="text-sm text-[var(--text-muted)]">{msg}</p>}
        <Button type="submit" className="w-full">Save</Button>
      </form>
    </div>
  )
}
