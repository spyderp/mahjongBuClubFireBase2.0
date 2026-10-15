import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import BaseDialog from '@/components/ui/BaseDialog.vue'

let wrapper: VueWrapper | undefined

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  wrapper?.unmount()
})

function findDialog(): HTMLElement | null {
  return document.body.querySelector('[role="dialog"]')
}

function open(title = 'Título', props: Record<string, unknown> = {}): VueWrapper {
  wrapper = mount(BaseDialog, { props: { open: true, title, ...props } })
  return wrapper
}

describe('T74 · BaseDialog', () => {
  it('no renderiza nada mientras está cerrado', () => {
    wrapper = mount(BaseDialog, { props: { open: false, title: 'Título' } })

    expect(findDialog()).toBeNull()
  })

  it('muestra título y contenido del slot', () => {
    wrapper = mount(BaseDialog, {
      props: { open: true, title: 'Duplicado' },
      slots: { default: 'Mensaje' },
    })
    const dialog = findDialog()

    expect(dialog?.querySelector('h2')?.textContent).toBe('Duplicado')
    expect(dialog?.textContent).toContain('Mensaje')
  })

  it('el botón de cierre emite close', () => {
    const wrapper = open()

    findDialog()?.querySelector('button')?.dispatchEvent(new MouseEvent('click'))

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('cerrando con Escape emite close', () => {
    const wrapper = open()

    findDialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('haciendo clic en el fondo emite close', () => {
    const wrapper = open()

    const dialog = findDialog()
    const backdrop = dialog?.parentElement
    backdrop?.dispatchEvent(new MouseEvent('click'))

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('respeta closeOnEscape = false', () => {
    const wrapper = open('Título', { closeOnEscape: false })

    findDialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('respeta closeOnBackdrop = false', () => {
    const wrapper = open('Título', { closeOnBackdrop: false })

    const dialog = findDialog()
    const backdrop = dialog?.parentElement
    backdrop?.dispatchEvent(new MouseEvent('click'))

    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
