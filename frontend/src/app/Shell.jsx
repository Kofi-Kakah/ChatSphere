import { useState } from 'react'
import { useThemeStore } from '../store/theme.js'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import Badge from '../components/ui/Badge.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import Dialog from '../components/ui/Dialog.jsx'
import Popover from '../components/ui/Popover.jsx'
import Tooltip from '../components/ui/Tooltip.jsx'
import ToastHost, { toast } from '../components/ui/Toast.jsx'

export default function Shell() {
  const { preference, setPreference } = useThemeStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  return (
    <div className="h-full flex">
      <aside className="w-[72px] border-r border-[var(--border)] bg-[var(--surface)] flex flex-col items-center py-4 gap-4">
        <div className="w-10 h-10 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-semibold">C</div>
        <nav className="flex flex-col gap-2">
          <Button variant="ghost" onClick={() => setPreference(preference === 'dark' ? 'light' : 'dark')}>T</Button>
        </nav>
        <div className="mt-auto"><Avatar name="You" size={36} online /></div>
      </aside>
      <aside className="w-[340px] border-r border-[var(--border)] bg-[var(--surface)] p-4">
        <Input placeholder="Search" />
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-[10px] hover:bg-[var(--surface-2)]">
              <Avatar name={`User ${i}`} size={40} online={i === 1} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">User {i}</div>
                <div className="text-xs text-[var(--text-muted)] truncate">Last message preview</div>
              </div>
              <Badge>{i}</Badge>
            </div>
          ))}
        </div>
      </aside>
      <main className="flex-1 flex flex-col bg-[var(--bg)]">
        <header className="h-16 border-b border-[var(--border)] bg-[var(--surface)] flex items-center px-4 gap-3">
          <Avatar name="Active Chat" size={36} online />
          <div>
            <div className="text-sm font-semibold">Active Chat</div>
            <div className="text-xs text-[var(--text-muted)]">online</div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>Info</Button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          <div className="max-w-[60%] rounded-[16px] bg-[var(--bubble-in)] border border-[var(--border)] px-4 py-2 text-[15px]">Hello there</div>
          <div className="max-w-[60%] ml-auto rounded-[16px] bg-[var(--bubble-out)] text-white px-4 py-2 text-[15px]">Hi! How are you?</div>
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3 flex gap-2">
          <Input placeholder="Type a message" />
          <Button>Send</Button>
        </div>
      </main>
      <aside className="w-[320px] border-l border-[var(--border)] bg-[var(--surface)] p-4 hidden lg:block">
        <h3 className="text-sm font-semibold mb-2">Info panel</h3>
        <p className="text-xs text-[var(--text-muted)]">Profile, media, theme picker</p>
      </aside>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Info">
        <p className="text-sm text-[var(--text-muted)]">Panel content</p>
      </Dialog>
      <ToastHost />
    </div>
  )
}
