import { defineComponent, h } from 'vue'
import type { Component } from 'vue'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'

/**
 * Harness de @pinia/colada para los tests de queries y composables: monta las
 * queries en el `setup` de un componente huésped para que `useQuery`/`useMutation`/
 * `useQueryCache` tengan contexto de inyección (constitution VI.2, capa queries).
 */
export function withColada<T>(setup: () => T): { result: T; unmount: () => void } {
  let result!: T

  const Host: Component = defineComponent({
    setup() {
      result = setup()

      return () => h('div')
    },
  })

  const pinia = createPinia()
  const wrapper = mount(Host, { global: { plugins: [pinia, PiniaColada] } })

  return { result, unmount: () => wrapper.unmount() }
}
