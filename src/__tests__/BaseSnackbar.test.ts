import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BaseSnackbar from '@/components/ui/BaseSnackbar.vue'

afterEach(() => {
  vi.useRealTimers()
})

describe('T74 · BaseSnackbar', () => {
  it('muestra el mensaje y cierra con el botón', async () => {
    const wrapper = mount(BaseSnackbar, { props: { message: 'Fallo al guardar' } })

    expect(wrapper.text()).toContain('Fallo al guardar')

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('aplica el estilo visual según el tipo', () => {
    for (const [type, expected] of [
      ['info', 'border-mahjong-accent'],
      ['error', 'border-mahjong-negative'],
      ['success', 'border-mahjong-positive'],
    ] as const) {
      const wrapper = mount(BaseSnackbar, { props: { message: 'M', type } })

      expect(wrapper.find('[role="alert"]').classes()).toContain(expected)
    }
  })

  it('se cierra solo al expirar durationMs', () => {
    vi.useFakeTimers()

    const wrapper = mount(BaseSnackbar, { props: { message: 'M', durationMs: 3000 } })

    vi.advanceTimersByTime(2999)
    expect(wrapper.emitted('dismiss')).toBeUndefined()

    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('un cambio de mensaje reinicia el temporizador', async () => {
    vi.useFakeTimers()

    const wrapper = mount(BaseSnackbar, { props: { message: 'Uno', durationMs: 3000 } })

    vi.advanceTimersByTime(2000)

    await wrapper.setProps({ message: 'Dos' })
    vi.advanceTimersByTime(2999)
    expect(wrapper.emitted('dismiss')).toBeUndefined()

    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('sin durationMs emerge persistent, no se emite dismiss', () => {
    vi.useFakeTimers()

    mount(BaseSnackbar, { props: { message: 'M' } })
    vi.advanceTimersByTime(60000)

    expect(mount(BaseSnackbar, { props: { message: 'M' } }).emitted('dismiss')).toBeUndefined()
  })

  it('al desmontar cancela el temporizador pendiente', () => {
    vi.useFakeTimers()

    const wrapper = mount(BaseSnackbar, { props: { message: 'M', durationMs: 3000 } })
    wrapper.unmount()

    vi.advanceTimersByTime(3000)

    expect(wrapper.emitted('dismiss')).toBeUndefined()
  })
})
