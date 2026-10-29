import { BlockList, isIP } from 'node:net'

export type PlatformHeaders = { vercelForwardedFor?: string, realIP?: string }

const normalize = (value: string) => value.startsWith('::ffff:') && isIP(value.slice(7)) === 4 ? value.slice(7) : value

// Only an explicitly trusted network peer may supply a forwarding chain.
// The `vercel` configuration trusts the edge-set headers instead, because Vercel overwrites them on every request.
export function trustedClientIP(peer: string, forwarded: string, configuration: string, platform: PlatformHeaders = {}): string {
  if (configuration.trim().toLowerCase() === 'vercel') {
    for (const header of [platform.vercelForwardedFor, platform.realIP]) {
      const candidate = (header || '').split(',').map(value => normalize(value.trim())).find(value => isIP(value))
      if (candidate) return candidate
    }
    const current = normalize(peer)
    return isIP(current) ? current : 'unknown'
  }
  const ranges = new BlockList()
  for (const entry of configuration.split(',').map(value => value.trim()).filter(Boolean)) {
    const [address, prefix] = entry.split('/')
    const family = isIP(address || '')
    if (!family) continue
    try {
      if (prefix === undefined) ranges.addAddress(address!, family === 4 ? 'ipv4' : 'ipv6')
      else ranges.addSubnet(address!, Number(prefix), family === 4 ? 'ipv4' : 'ipv6')
    } catch { /* An invalid configuration entry never grants trust. */ }
  }
  const trusted = (value: string) => {
    const normalized = normalize(value), family = isIP(normalized)
    return Boolean(family && ranges.check(normalized, family === 4 ? 'ipv4' : 'ipv6'))
  }
  let current = normalize(peer)
  if (!isIP(current)) return 'unknown'
  if (!trusted(current)) return current
  const chain = forwarded.split(',').map(value => normalize(value.trim()))
  if (chain.some(value => !isIP(value))) return current
  for (let index = chain.length - 1; index >= 0 && trusted(current); index--) current = chain[index]!
  return current
}
