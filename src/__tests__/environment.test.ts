import { describe, expect, it } from 'vitest'
import { version } from '../../package.json'

describe('entorno de test', () => {
  it('resuelve el alias @/ a src/', async () => {
    const module = await import('@/test-utils/probe')

    expect(module.PROBE_PATH).toBe('src')
  })

  it('usa happy-dom como entorno', () => {
    expect(typeof document).toBe('object')
    expect(document.createElement('div').tagName).toBe('DIV')
  })

  it('deja leer el package.json del proyecto', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
