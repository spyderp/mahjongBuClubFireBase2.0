/**
 * T84 · Paleta de series para las gráficas (RF-17). Declarada una sola vez en el proyecto y
 * consumida por `components/charts/*`; ningún componente redeclara colores (AGENT.md → Gráficas).
 */
export const chartPalette: readonly string[] = ['#e5484d', '#30a46c', '#f5a623', '#0091ff']

/** Color de serie del índice pedido, con vuelta cero para cuando hay más series que colores. */
export function chartColorOf(index: number): string {
  return chartPalette[index % chartPalette.length] ?? chartPalette[0] ?? '#e5484d'
}
