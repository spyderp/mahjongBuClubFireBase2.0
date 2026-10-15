import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import BaseButton from '@/components/ui/BaseButton.vue'

describe('T73 · BaseButton', () => {
  it('renderiza el slot y el tipo por defecto sin mutar las props', () => {
    const wrapper = mount(BaseButton, { slots: { default: 'Guardar' } })
    const button = wrapper.find('button')

    expect(button.text()).toBe('Guardar')
    expect(button.attributes('type')).toBe('button')
  })

  it('propaga el tipo y la variante a las clases', () => {
    const wrapper = mount(BaseButton, { props: { type: 'submit', variant: 'danger' } })
    const button = wrapper.find('button')

    expect(button.attributes('type')).toBe('submit')
    expect(button.classes()).toContain('bg-mahjong-negative')
  })

  it('aplica la variante primaria por defecto', () => {
    const wrapper = mount(BaseButton)
    const button = wrapper.find('button')

    expect(button.classes()).toContain('bg-mahjong-accent')
  })

  it('emite click con el evento original', async () => {
    const onClick = vi.fn()
    const wrapper = mount(BaseButton, { props: { onClick } })

    await wrapper.find('button').trigger('click')

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('un botón deshabilitado no emite click', async () => {
    const onClick = vi.fn()
    const wrapper = mount(BaseButton, { props: { disabled: true, onClick } })

    await wrapper.find('button').trigger('click')

    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(onClick).not.toHaveBeenCalled()
  })
})
