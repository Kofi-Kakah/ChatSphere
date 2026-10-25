import { createHmac } from 'node:crypto'

const TTL_MS = 60 * 60 * 1000

export function signFileUrl(fileId, secret) {
  const exp = Date.now() + TTL_MS
  const sig = createHmac('sha256', secret).update(`${fileId}:${exp}`).digest('hex')
  return { exp, sig }
}

export function verifyFileUrl(fileId, exp, sig, secret) {
  if (Number(exp) < Date.now()) return false
  const expected = createHmac('sha256', secret).update(`${fileId}:${exp}`).digest('hex')
  return expected === sig
}
