import { createI18n } from 'vue-i18n'
import type { I18n } from 'vue-i18n'
import catalogo from '@/i18n/locales/es'
import type { MessageCatalog } from '@/i18n/locales/es'
import { datetimeFormats, numberFormats } from '@/i18n/locales/es'

/** Único marcador con el que se sustituye cada mensaje para detectar texto literal. */
export const MARKER = '◦'

/**
 * Instancia de `vue-i18n` para los tests de componentes: locale `es`, formatos del catálogo y
 * `globalInjection` activo para que `$t`/`$n`/`$d` funcionen en el template.
 */
export function createTestI18n(messages: MessageCatalog = catalogo): I18n {
  return createI18n({
    legacy: false,
    locale: 'es',
    fallbackLocale: 'es',
    globalInjection: true,
    missingWarn: false,
    fallbackWarn: false,
    messages: { es: messages },
    numberFormats: { es: numberFormats.es },
    datetimeFormats: { es: datetimeFormats.es },
  })
}

/** Misma forma que el catálogo con cada mensaje sustituido por `MARKER`. */
export function markerMessages(): MessageCatalog {
  return mapLeaves(catalogo, MARKER)
}

function mapLeaves(value: unknown, marker: string): MessageCatalog {
  if (Array.isArray(value)) {
    return value.map((entry) => mapLeaves(entry, marker)) as unknown as MessageCatalog
  }

  if (typeof value === 'object' && value !== null) {
    const copy: Record<string, unknown> = {}

    for (const key of Object.keys(value)) {
      copy[key] = mapLeaves((value as Record<string, unknown>)[key], marker)
    }

    return copy as unknown as MessageCatalog
  }

  return marker as unknown as MessageCatalog
}
