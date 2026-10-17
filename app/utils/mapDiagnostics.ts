export function mapBindingDiagnostics(properties: { building?: string }[], directory: { order: number; name: string }[], modelOrders: number[], resolve: (name: string) => { order: number; name: string } | null) {
  const unresolved: string[] = [], ambiguous: string[] = []
  for (const name of new Set(properties.map(property => property.building).filter((name): name is string => !!name))) {
    const match = resolve(name)
    if (!match) unresolved.push(name)
    else if (directory.filter(entry => entry.name === match.name).length > 1) ambiguous.push(name)
  }
  return { unresolved, ambiguous, directoryOnly: directory.filter(entry => !modelOrders.includes(entry.order)).map(entry => entry.order), modelOnly: modelOrders.filter(order => !directory.some(entry => entry.order === order)) }
}
