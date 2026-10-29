import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('.', import.meta.url))
await mkdir(dir, { recursive: true })

const files = {
  'valid.png': Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAABH0lEQVR4nO3UQW0EARTD0EHX6/AHYB4l0Gs3X6snBYHl+Hl/svf/ITwovx9RDeiA7pvexuiAbq4ho5uDk45uTqMDurmGjG4OTjq6OY0O6OYaMro5OOno5jQ6oJtryOjm4KSjm9PogG6uIaObg5OObk6jA7q5hoxuDk46ujmNDujmGjK6OTjp6OY0OqCba8jo5uCko5vT6IBuriGjm4OTjm5OowO6uYaMbg5OOro5jQ7o5hoyujk46ejmNDqgm2vI6ObgpKOb0+iAbq4ho5uDk45uTqMDurmGjG4OTjq6OY0O6OYaMro5OOno5jQ6oJtryOjm4KSjm9PogG6uIaObg5OObk6jA7q5hoxuDk46ujmNDujmGjK6OTjpaM70z/0CGmhiOk+WBLsAAAAASUVORK5CYII=',
    'base64',
  ),
  'valid.gif': Buffer.from('R0lGODlhKAAeAIAAAExpcfWeCyH5BAUAAAAALAAAAAAoAB4AAAIhjI+py+0Po5y02ouz3rz7D4biSJbmiabqyrbuC8fyTHMFADs=', 'base64'),
  'valid.pdf': Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  ),
  'valid.txt': Buffer.from('ChatSphere QA fixture.\n'),
  'valid.zip': Buffer.from('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==', 'base64'),
  'malicious.svg': Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert("xss")</script><circle cx="5" cy="5" r="4" /></svg>\n',
  ),
  'spoofed-image.png': Buffer.from('<html><script>alert("not an image")</script></html>\n'),
  'corrupt-image.jpg': Buffer.from('this is not a jpeg; magic bytes are missing\n'),
  'executable.exe': Buffer.concat([Buffer.from('MZ'), Buffer.from('ChatSphere test stub, not executable code\n')]),
}

for (const [name, contents] of Object.entries(files)) {
  await writeFile(`${dir}${name}`, contents)
}

const manifest = {
  generatedBy: 'tests/assets/generate.mjs',
  files: [
    { name: 'valid.png', expectedMime: 'image/png', purpose: 'valid image upload' },
    { name: 'valid.gif', expectedMime: 'image/gif', purpose: 'valid GIF upload' },
    { name: 'valid.pdf', expectedMime: 'application/pdf', purpose: 'valid document upload' },
    { name: 'valid.txt', expectedMime: 'text/plain', purpose: 'valid text upload' },
    { name: 'valid.zip', expectedMime: 'application/zip', purpose: 'valid archive upload' },
    { name: 'malicious.svg', expectedMime: 'image/svg+xml', purpose: 'SVG with script must be rejected' },
    { name: 'spoofed-image.png', expectedMime: 'text/html', purpose: 'extension says PNG but content is HTML; magic-byte check must reject' },
    { name: 'corrupt-image.jpg', expectedMime: 'application/octet-stream', purpose: 'truncated/invalid JPEG must be rejected' },
    { name: 'executable.exe', expectedMime: 'application/octet-stream', purpose: 'executable stub must be rejected' },
  ],
  onDemand: [
    'oversized.png (>10 MB) — generate at test time to avoid committing large binaries',
    'oversized.pdf (>25 MB) — generate at test time',
  ],
}

await writeFile(`${dir}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${Object.keys(files).length} fixtures + manifest.json to ${dir}`)
