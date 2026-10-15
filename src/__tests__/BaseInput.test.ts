import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import BaseInput from '@/components/ui/BaseInput.vue'

describe('T73 · BaseInput', () => {
  it('muestra el valor controlado y emite update:modelValue al escribir', async () => {
    const wrapper = mount(BaseInput, { props: { modelValue: 'Inicio' } })

    expect(wrapper.find('input').element.value).toBe('Inicio')

    await wrapper.find('input').setValue('Otro')

    expect(wrapper.emitted('update:modelValue')).toEqual([['Otro']])
  })

  it('no muta la prop: el valor sigue siendo el de fuera', async () => {
    const wrapper = mount(BaseInput, { props: { modelValue: 'fijo' } })

    await wrapper.find('input').setValue('cambiado')

    expect(wrapper.props('modelValue')).toBe('fijo')
  })

  it('aplica tipo, nombre y placeholder', () => {
    const wrapper = mount(BaseInput, {
      props: { modelValue: '', type: 'number', name: 'honba', placeholder: 'Contadores' },
    })
    const input = wrapper.find('input')

    expect(input.attributes('type')).toBe('number')
    expect(input.attributes('name')).toBe('honba')
    expect(input.attributes('placeholder')).toBe('Contadores')
  })

  it('emite blur y focus', async () => {
    const onBlur = vi.fn()
    const wrapper = mount(BaseInput, { props: { modelValue: '', onBlur } })

    await wrapper.find('input').trigger('blur')

    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('un campo deshabilitado no admite edición', async () => {
    const wrapper = mount(BaseInput, { props: { modelValue: 'x', disabled: true } })

    await wrapper.find('input').setValue('y')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  /**
   * T97 · RF-15.9: el formulario de acceso necesita `email` y `password`. Sin ellos habría que
   * escribir un `<input>` crudo en la página, saltándose la primitiva de `components/ui`.
   */
  it('admite los tipos email y password del acceso (RF-15.9)', () => {
    const wrapper = mount(BaseInput, {
      props: { modelValue: 'ana@correo.es', type: 'email', name: 'email' },
    })
    const password = mount(BaseInput, {
      props: { modelValue: '', type: 'password', name: 'password' },
    })

    // `props()` y no solo el atributo: si el tipo no estuviera declarado, Vue lo dejaría caer
    // como atributo suelto en el `<input>` y el test pasaría sin que el componente lo suporte.
    expect(wrapper.props('type')).toBe('email')
    expect(password.props('type')).toBe('password')
    expect(wrapper.find('input').attributes('type')).toBe('email')
    expect(password.find('input').attributes('type')).toBe('password')
  })

  it('reenvía autocomplete para que el navegador gestione la credencial (RF-15.9)', () => {
    const wrapper = mount(BaseInput, {
      props: { modelValue: '', type: 'email', autocomplete: 'email' },
    })

    expect(wrapper.props('autocomplete')).toBe('email')
    expect(wrapper.find('input').attributes('autocomplete')).toBe('email')
  })

  it('sin autocomplete no escribe el atributo', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', type: 'text' } })

    expect(wrapper.find('input').attributes('autocomplete')).toBeUndefined()
  })
})
