import assert from 'node:assert/strict'
import test from 'node:test'
import { trustedClientIP } from '../server/utils/trusted-proxy.ts'

test('forwarded IPs require explicit peer trust and stop at the first untrusted hop', () => {
  assert.equal(trustedClientIP('192.0.2.1', '203.0.113.1', ''), '192.0.2.1')
  assert.equal(trustedClientIP('127.0.0.1', '203.0.113.1, 10.0.0.5', '127.0.0.1,10.0.0.0/8'), '203.0.113.1')
  assert.equal(trustedClientIP('127.0.0.1', '203.0.113.1, 192.0.2.5', '127.0.0.1'), '192.0.2.5')
  assert.equal(trustedClientIP('::ffff:127.0.0.1', 'spoofed', '127.0.0.1'), '127.0.0.1')
})
