// La garde d'extinction ne tient qu'à cette fonction : si elle laisse passer une
// adresse du réseau, n'importe quelle machine du salon peut éteindre AURA.

import { describe, it, expect } from 'vitest'
import { isLoopback } from '../server/net.ts'

describe('isLoopback', () => {
  it('reconnaît la boucle locale sous ses trois écritures', () => {
    expect(isLoopback('127.0.0.1')).toBe(true)
    expect(isLoopback('::1')).toBe(true)
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true)
  })

  it('accepte tout le bloc 127.0.0.0/8', () => {
    expect(isLoopback('127.0.0.53')).toBe(true)
    expect(isLoopback('127.255.255.254')).toBe(true)
  })

  it('refuse les adresses du réseau local', () => {
    expect(isLoopback('192.168.1.79')).toBe(false)
    expect(isLoopback('172.31.128.1')).toBe(false)
    expect(isLoopback('10.0.0.1')).toBe(false)
    expect(isLoopback('0.0.0.0')).toBe(false)
  })

  it('refuse ce qui ressemble à la boucle locale sans en être', () => {
    // Le piège classique : un préfixe qui n'en est pas un.
    expect(isLoopback('127.0.0.1.evil.com')).toBe(false)
    expect(isLoopback('1270.0.0.1')).toBe(false)
    expect(isLoopback('227.0.0.1')).toBe(false)
    expect(isLoopback('127.0.0')).toBe(false)
    expect(isLoopback('127.0.0.999')).toBe(false)
  })

  it("refuse l'absence d'adresse", () => {
    expect(isLoopback(undefined)).toBe(false)
    expect(isLoopback('')).toBe(false)
  })
})
