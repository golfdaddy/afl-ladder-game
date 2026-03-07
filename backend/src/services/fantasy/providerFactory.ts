import { FantasyProvider } from './provider'
import { MockFantasyProvider } from './mockProvider'

let providerSingleton: FantasyProvider | null = null

export function getFantasyProvider(): FantasyProvider {
  if (providerSingleton) return providerSingleton

  const providerName = (process.env.FANTASY_PROVIDER || 'mock').toLowerCase()
  switch (providerName) {
    case 'mock':
    default:
      providerSingleton = new MockFantasyProvider()
      break
  }

  return providerSingleton
}
