import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

const ROOT = process.env.UPLOAD_DIR || './uploads'

export class LocalStorageProvider {
  async save(buffer, key) {
    const dir = join(ROOT, ...key.split('/').slice(0, -1))
    await mkdir(dir, { recursive: true })
    await writeFile(join(ROOT, key), buffer)
    return key
  }
  async read(key) {
    return readFile(join(ROOT, key))
  }
  async delete(key) {
    try { await unlink(join(ROOT, key)) } catch {}
  }
  url(key) { return key }
}

export function createStorageProvider() {
  return new LocalStorageProvider()
}

export function newStorageKey(prefix = 'file') {
  return `${prefix}/${randomBytes(16).toString('hex')}`
}
