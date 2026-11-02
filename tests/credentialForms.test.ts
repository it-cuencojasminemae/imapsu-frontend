import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Until Vue attaches @submit.prevent the browser submits the form natively, and
// a form with no method sends a GET that puts every named field in the URL.
const appDir = fileURLToPath(new URL('../app/', import.meta.url))
const sensitive = /type="password"|'password'|autocomplete="[a-z-]*password"|one-time-code/
const forms = readdirSync(appDir, { recursive: true, encoding: 'utf8' })
  .filter(file => file.endsWith('.vue'))
  .flatMap((file) => {
    const source = readFileSync(join(appDir, file), 'utf8')
    return [...source.matchAll(/<form\b((?:[^>"]|"[^"]*")*)>([\s\S]*?)<\/form>/g)]
      .map(([, attributes, body]) => ({ file, attributes, body }))
  })
  .filter(form => sensitive.test(form.body))

test('forms that carry a password or code post instead of falling back to GET', () => {
  for (const name of ['login.vue', 'register.vue', 'forgot-password.vue', 'verify-email.vue', 'AccountPassword.vue', 'AccountSecurity.vue', 'ReauthenticationDialog.vue']) {
    assert.ok(forms.some(form => form.file.endsWith(name)), `${name} should have a credential form`)
  }
  for (const form of forms) assert.match(form.attributes, /\bmethod="post"/, `${form.file} has a credential form without method="post"`)
})
