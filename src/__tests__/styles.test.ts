import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chartPalette } from '@/styles/palette'

const ROOT = join(import.meta.dirname, '..')
const STYLES = join(ROOT, 'styles')
const COMPONENTS = join(ROOT, 'components')

const HEX_IN_STYLE = /#[0-9a-fA-F]{3,8}\b/

describe('T84 · tokens de estilos y paleta', () => {
  it('expone la paleta única de series con colores de seis dígitos', () => {
    expect(Array.isArray(chartPalette)).toBe(true)
    expect(chartPalette.length).toBeGreaterThanOrEqual(2)

    for (const color of chartPalette) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('la paleta de series se declara una sola vez en styles/palette.ts', async () => {
    const declarations: string[] = []

    for (const file of await sourceFiles()) {
      const source = await readFile(file, 'utf8')

      if (source.includes('export const chartPalette')) {
        declarations.push(file)
      }
    }

    expect(declarations).toEqual([join(STYLES, 'palette.ts')])
  })

  it('declara los tokens en @theme sin hexadecimales fuera del bloque', async () => {
    const css = await readFile(join(STYLES, 'main.css'), 'utf8')

    expect(css).toContain('@theme')
    expect(css).toMatch(/--color-[a-zA-Z0-9-]+:/)

    const before = css.slice(0, css.indexOf('@theme'))
    expect(before.match(HEX_IN_STYLE)).toBeNull()
  })

  it('ningún componente dibuja colores hexadecimales sueltos en su <style>', async () => {
    const offenders: string[] = []

    for (const file of await componentFiles()) {
      const source = await readFile(file, 'utf8')

      for (const match of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
        const block = match[1] ?? ''

        if (HEX_IN_STYLE.test(block)) {
          offenders.push(file)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})

async function sourceFiles(): Promise<string[]> {
  const result: string[] = []

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'test-utils') {
        continue
      }

      const path = join(dir, entry.name)

      if (entry.isDirectory()) {
        await walk(path)
        continue
      }

      if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) {
        result.push(path)
      }
    }
  }

  await walk(ROOT)

  return result
}

async function componentFiles(): Promise<string[]> {
  const result: string[] = []

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)

      if (entry.isDirectory()) {
        await walk(path)
        continue
      }

      if (entry.name.endsWith('.vue')) {
        result.push(path)
      }
    }
  }

  try {
    await walk(COMPONENTS)
  } catch {
    return []
  }

  return result
}
