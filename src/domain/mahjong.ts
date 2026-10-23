import type { Seat } from './types'

/**
 * Convierte un asiento absoluto al viento relativo desde la perspectiva del dealer.
 * En mahjong: dealer = Este, siguiente = Sur, siguiente = Oeste, siguiente = Norte.
 */
export function seatOfActualLocation(initialSeat: Seat, dealerLocation: Seat): Seat { // eslint-disable-line @typescript-eslint/no-unused-vars -- used in TurnForm.vue and GameDetailPage.vue
  const seatMap: Record<Seat, number> = {
    east: 0,
    south: 1,
    west: 2,
    north: 3,
  }

  const initialSeatIndex = seatMap[initialSeat]
  const dealerLocationIndex = seatMap[dealerLocation]

  // Distancia modular counter-clockwise (0-3)
  const windIndex = (initialSeatIndex - dealerLocationIndex + 4) % 4

  // windIndex is always 0-3 because of modulo 4, so this is safe
  const seats: readonly Seat[] = ['east', 'south', 'west', 'north'] as const
  return seats[windIndex] as Seat
}