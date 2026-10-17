import { BlockList, isIP } from 'node:net'

// Only an explicitly trusted network peer may supply a forwarding chain.
export function trustedClientIP(peer: string, forwarded: string, configuration: string): string {
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
  const normalize = (value: string) => value.startsWith('::ffff:') && isIP(value.slice(7)) === 4 ? value.slice(7) : value
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
