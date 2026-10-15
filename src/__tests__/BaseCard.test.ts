import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseCard from '@/components/ui/BaseCard.vue'

describe('T74 · BaseCard', () => {
  it('envuelve el slot en una tarjeta', () => {
    const wrapper = mount(BaseCard, { slots: { default: 'Contenido' } })
    const card = wrapper.find('div')

    expect(card.text()).toBe('Contenido')
    expect(card.classes()).toContain('bg-mahjong-surface')
  })
})
