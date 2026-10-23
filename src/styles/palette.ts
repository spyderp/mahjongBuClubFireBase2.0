/**
 * T84 · Paleta de series para las gráficas (RF-17). Declarada una sola vez en el proyecto y
 * consumida por `components/charts/*`; ningún componente redeclara colores (AGENT.md → Gráficas).
 *
 * T16 · RF-35.7. Son los **mismos colores que los tokens del tema** (`styles/main.css`): el canvas
 * no resuelve `var(--…)`, así que la paleta lleva el valor, y `styles.test.ts` comprueba que no se
 * separen. Si cambia un token del tema, cambia aquí.
 */
export const chartPalette: readonly string[] = ['#e63946', '#10b981', '#f59e0b', '#3b82f6']

/** Color de serie del índice pedido, con vuelta cero para cuando hay más series que colores. */
export function chartColorOf(index: number): string {
  return chartPalette[index % chartPalette.length] ?? chartPalette[0] ?? '#e63946'
}
