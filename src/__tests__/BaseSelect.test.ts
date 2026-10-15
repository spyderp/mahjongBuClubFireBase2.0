import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseSelect from '@/components/ui/BaseSelect.vue'

const OPTIONS = [
  { value: 'tonpuusen', label: 'Tonpuusen' },
  { value: 'hanchan', label: 'Hanchan' },
] as const

describe('T73 · BaseSelect', () => {
  it('renderiza las opciones y la seleccionada', () => {
    const wrapper = mount(BaseSelect, {
      props: { modelValue: 'hanchan', options: OPTIONS },
    })
    const options = wrapper.findAll('option').map((option) => ({
      value: option.attributes('value'),
      text: option.text(),
    }))

    expect(options).toEqual([
      { value: 'tonpuusen', text: 'Tonpuusen' },
      { value: 'hanchan', text: 'Hanchan' },
    ])
    expect(wrapper.find('select').element.value).toBe('hanchan')
  })

  it('emite update:modelValue al cambiar la selección', async () => {
    const wrapper = mount(BaseSelect, {
      props: { modelValue: 'tonpuusen', options: OPTIONS },
    })

    await wrapper.find('select').setValue('hanchan')

    expect(wrapper.emitted('update:modelValue')).toEqual([['hanchan']])
  })

  it('un placeholder se muestra como opción vacía deshabilitada', () => {
    const wrapper = mount(BaseSelect, {
      props: { modelValue: '', options: OPTIONS, placeholder: 'Elige' },
    })
    const placeholder = wrapper.findAll('option')[0]

    expect(placeholder?.text()).toBe('Elige')
    expect(placeholder?.attributes('disabled')).toBeDefined()
  })

  it('respeta el estado deshabilitado', async () => {
    const wrapper = mount(BaseSelect, {
      props: { modelValue: '', options: OPTIONS, disabled: true },
    })

    await wrapper.find('select').setValue('hanchan')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
