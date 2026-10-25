import { useThemeStore } from '../store/theme.js'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import Badge from '../components/ui/Badge.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import Dialog from '../components/ui/Dialog.jsx'
import Popover from '../components/ui/Popover.jsx'
import Tooltip from '../components/ui/Tooltip.jsx'

export default function DesignPreview() {
  const { preference, setPreference } = useThemeStore()
  return (
    <div className="min-h-full p-8 space-y-8 bg-[var(--bg)] text-[var(--text)]">
      <h1 className="text-2xl font-semibold">Design Preview</h1>
      <div className="flex gap-2">
        {['light', 'dark', 'system'].map((p) => (
          <Button key={p} variant={preference === p ? 'primary' : 'secondary'} onClick={() => setPreference(p)}>{p}</Button>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Buttons</h2>
        <div className="flex gap-2 flex-wrap">
          <Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Inputs</h2>
        <Input placeholder="Type here" />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Avatars</h2>
        <div className="flex gap-3">
          <Avatar name="Ama Kofi" size={40} online /><Avatar name="K" size={40} />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Badges & Skeletons</h2>
        <Badge>3</Badge>
        <Skeleton className="h-6 w-32 mt-2" />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Tooltip & Popover</h2>
        <Tooltip label="Tooltip text"><Button variant="secondary">Hover me</Button></Tooltip>
        <Popover trigger={<Button variant="secondary">Open popover</Button>}>
          <p className="text-sm">Popover content</p>
        </Popover>
      </section>
    </div>
  )
}
