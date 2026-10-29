import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Testing.md 6.1: user content is rendered by React as text; no unsafe HTML
// sink may exist in the client source.

const SRC = resolve(process.cwd(), 'src')
const SINKS = /dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write|insertAdjacentHTML/

function sourceFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path))
    else if (/\.(jsx?|tsx?)$/.test(entry) && !/\.test\./.test(entry)) files.push(path)
  }
  return files
}

describe('unsafe HTML sinks', () => {
  it('no client source file renders user content through an HTML sink', () => {
    const offenders = []
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8')
      const match = source.match(SINKS)
      if (match) offenders.push(`${file}: ${match[0]}`)
    }
    console.log(`[xss] scanned ${sourceFiles(SRC).length} client source files; unsafe sinks: ${offenders.length}`)
    expect(offenders).toEqual([])
  })
})
