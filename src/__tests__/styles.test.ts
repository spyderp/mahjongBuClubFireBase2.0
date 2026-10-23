import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chartPalette } from '@/styles/palette'

const ROOT = join(import.meta.dirname, '..')
const STYLES = join(ROOT, 'styles')
const COMPONENTS = join(ROOT, 'components')

const HEX_IN_STYLE = /#[0-9a-fA-F]{3,8}\b/
const COLOR_FUNCTION = /\b(?:rgb|rgba|hsl|hsla)\(/

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

/**
 * T16 · RF-35.1, RF-35.2 y RF-35.10. El documento de estilos propone una paleta, unas familias y
 * unas sombras; el tema las declara **con los nombres que ya tenían** y los valores del documento.
 * Los tokens que no existían se añaden aquí (`004-qa.md` B10).
 */
describe('T16 · los tokens del tema', () => {
  it('los tokens que ya existían conservan su nombre y cambian de valor', async () => {
    const tokens = tokenValues(await readFile(join(STYLES, 'main.css'), 'utf8'))

    for (const [name, value] of Object.entries(EXISTING_TOKENS)) {
      expect(tokens[name], `token ausente: ${name}`).toBe(value)
    }
  })

  it('el documento declara también sus colores nuevos, sus familias y sus sombras', async () => {
    const tokens = tokenValues(await readFile(join(STYLES, 'main.css'), 'utf8'))

    for (const [name, value] of Object.entries(DOCUMENT_TOKENS)) {
      expect(tokens[name], `token ausente: ${name}`).toBe(value)
    }

    expect(tokens['--font-sans']).toContain('Inter')
    expect(tokens['--font-mono']).toContain('JetBrains Mono')
    expect(tokens['--font-display']).toContain('Outfit')

    for (const name of [
      '--shadow-glow-red',
      '--shadow-glow-green',
      '--shadow-glow-blue',
      '--shadow-glow-gold',
    ]) {
      expect(tokens[name], `sombra ausente: ${name}`).toContain('15px')
    }
  })

  it('no hay ningún fichero de configuración de Tailwind en el repositorio', async () => {
    expect(await tailwindConfigFiles()).toEqual([])
  })

  it('ningún componente escribe un color fuera de los tokens del tema', async () => {
    const offenders: string[] = []

    for (const file of await vueFiles()) {
      const source = await readFile(file, 'utf8')

      // Solo comprobamos el bloque <style>; los componentes de gráficas necesitan rgb()/rgba()
      // en el script para configurar Chart.js con la paleta del tema.
      const styleBlocks = source.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? []
      for (const block of styleBlocks) {
        const styleContent = block.replace(/<style[^>]*>/, '').replace('</style>', '')
        if (HEX_IN_STYLE.test(styleContent) || COLOR_FUNCTION.test(styleContent)) {
          offenders.push(file)
          break
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('la paleta de las gráficas es la del tema', async () => {
    const tokens = tokenValues(await readFile(join(STYLES, 'main.css'), 'utf8'))
    const themeColors = Object.entries(tokens)
      .filter(([name]) => name.startsWith('--color-'))
      .map(([, value]) => value)

    for (const color of chartPalette) {
      expect(themeColors, `color fuera del tema: ${color}`).toContain(color)
    }
  })
})

/** Los tokens que el tema ya tenía antes de 004, con el valor del documento de estilos. */
const EXISTING_TOKENS: Record<string, string> = {
  '--color-mahjong-bg': '#090d16',
  '--color-mahjong-surface': '#111827',
  '--color-mahjong-border': '#1f2937',
  '--color-mahjong-text': '#ffffff',
  '--color-mahjong-muted': '#94a3b8',
  '--color-mahjong-accent': '#e63946',
  '--color-mahjong-accent-soft': '#ef4444',
  '--color-mahjong-positive': '#10b981',
  '--color-mahjong-negative': '#e63946',
  '--color-mahjong-warning': '#f59e0b',
}

/** Los colores del documento que no tenían token (`004-qa.md` B10). */
const DOCUMENT_TOKENS: Record<string, string> = {
  '--color-mahjong-green': '#10b981',
  '--color-mahjong-blue': '#3b82f6',
  '--color-mahjong-gold': '#f59e0b',
  '--color-mahjong-east': '#ef4444',
  '--color-mahjong-south': '#3b82f6',
  '--color-mahjong-west': '#10b981',
  '--color-mahjong-north': '#8b5cf6',
}

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

/** Todos los `.vue` del código de aplicación: componentes, páginas y la raíz. */
async function vueFiles(): Promise<string[]> {
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

  await walk(ROOT)

  return result
}

/** Los tokens declarados en la hoja de estilos, con su valor. */
function tokenValues(css: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const match of css.matchAll(/(--[a-zA-Z0-9-]+):\s*([^;]+);/g)) {
    const name = match[1]
    const value = match[2]

    if (name !== undefined && value !== undefined) {
      values[name] = value.trim()
    }
  }

  return values
}

/** Los ficheros de configuración de Tailwind, que Tailwind 4 no necesita. */
async function tailwindConfigFiles(): Promise<string[]> {
  const result: string[] = []

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue
      }

      const path = join(dir, entry.name)

      if (entry.isDirectory()) {
        await walk(path)
        continue
      }

      if (entry.name.startsWith('tailwind.config')) {
        result.push(path)
      }
    }
  }

  await walk(join(ROOT, '..'))

  return result
}

const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git'])
