import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// The browser reaches Strapi only through the gateway, which forwards a fixed
// list of API paths and answers 404 for anything else. A page that calls a path
// missing from that list fails to load, as Office closures once did.
const root = join(import.meta.dirname, '..')

const gatewaySource = readFileSync(join(root, 'server', 'api', '[...path].ts'), 'utf8')
const allowedList = gatewaySource.match(/const allowed = new Set\(\[([^\]]*)\]\)/)
assert.ok(allowedList, 'the gateway still declares its allowed paths as `const allowed = new Set([...])`')
const allowed = new Set([...allowedList[1].matchAll(/'([a-z-]+)'/g)].map(match => match[1]))

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name)
  if (entry.isDirectory()) return sourceFiles(path)
  return /\.(vue|ts)$/.test(entry.name) ? [path] : []
})

test('every API path the app calls is forwarded by the gateway', () => {
  const used = new Map<string, string>()
  for (const file of sourceFiles(join(root, 'app'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/['"`]\/api\/([a-z-]+)/g)) {
      if (!used.has(match[1]!)) used.set(match[1]!, file.slice(root.length + 1))
    }
  }
  assert.ok(used.size > 10, 'found the app\'s API calls')
  const missing = [...used].filter(([path]) => !allowed.has(path)).map(([path, file]) => `${path} (used in ${file})`)
  assert.deepEqual(missing, [], 'add these to the allowed set in server/api/[...path].ts')
})
