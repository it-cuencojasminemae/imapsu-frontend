import assert from 'node:assert/strict'
import test from 'node:test'
import { trustedClientIP } from '../server/utils/trusted-proxy.ts'

test('forwarded IPs require explicit peer trust and stop at the first untrusted hop', () => {
  assert.equal(trustedClientIP('192.0.2.1', '203.0.113.1', ''), '192.0.2.1')
  assert.equal(trustedClientIP('127.0.0.1', '203.0.113.1, 10.0.0.5', '127.0.0.1,10.0.0.0/8'), '203.0.113.1')
  assert.equal(trustedClientIP('127.0.0.1', '203.0.113.1, 192.0.2.5', '127.0.0.1'), '192.0.2.5')
  assert.equal(trustedClientIP('::ffff:127.0.0.1', 'spoofed', '127.0.0.1'), '127.0.0.1')
})

test('vercel mode reads the edge-set headers and ignores x-forwarded-for', () => {
  const vercel = (peer: string, forwarded: string, vercelForwardedFor?: string, realIP?: string) => trustedClientIP(peer, forwarded, 'vercel', { vercelForwardedFor, realIP })
  assert.equal(vercel('10.0.0.1', '198.51.100.9', '203.0.113.7', '203.0.113.8'), '203.0.113.7')
  assert.equal(vercel('10.0.0.1', '', 'garbage, 203.0.113.7'), '203.0.113.7')
  assert.equal(vercel('10.0.0.1', '', '2001:db8::1'), '2001:db8::1')
  assert.equal(vercel('10.0.0.1', '198.51.100.9', 'spoofed', '203.0.113.8'), '203.0.113.8')
  assert.equal(vercel('::ffff:10.0.0.1', '198.51.100.9'), '10.0.0.1')
  assert.equal(vercel('', '198.51.100.9', '', 'nonsense'), 'unknown')
  assert.equal(trustedClientIP('10.0.0.1', '', ' Vercel ', { vercelForwardedFor: '203.0.113.7' }), '203.0.113.7')
})

test('vercel headers are ignored outside vercel mode', () => {
  assert.equal(trustedClientIP('192.0.2.1', '', '127.0.0.1', { vercelForwardedFor: '203.0.113.7', realIP: '203.0.113.8' }), '192.0.2.1')
  assert.equal(trustedClientIP('127.0.0.1', '203.0.113.1', '127.0.0.1', { vercelForwardedFor: '198.51.100.1' }), '203.0.113.1')
})
