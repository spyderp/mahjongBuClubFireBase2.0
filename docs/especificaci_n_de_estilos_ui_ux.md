# 🀄 Documento de Especificación de Estilos y Diseño UI/UX (Fase 4)

**Proyecto:** MahjongBu Club  
**Stack:** Vue 3 + Tailwind CSS + Firebase  
**Versión:** 1.0.0 (Fase 4 - Rediseño de Interfaz)

---

## 1. Visión General del Rediseño

El objetivo de este rediseño es transformar la interfaz de **MahjongBu Club** en un entorno visual moderno, elegante e intuitivo inspirado en los salones de Riichi Mahjong contemporáneos ("Neo-Sheng / Dark Modern").

### Principios Clave de UI/UX:

1. **Contraste y Legibilidad:** Transición de un fondo azul/gris opaco a un modo oscuro profundo (`slate-950`) con tarjetas tipo _Glassmorphism_ y contraste tipográfico claro.
2. **Jerarquía Visual Clara:** Separación estructurada entre la navegación global y las acciones clave (crear partidas, registrar jugadores).
3. **Optimización de Entrada de Datos:** Reemplazo de tablas de texto denso por tableros visuales interactivos con selectores de fichas, badges táctiles y contadores numéricos claros.
4. **Tipografía Tabular:** Uso de fuentes de ancho fijo (monospaced) para puntuaciones y números, evitando saltos visuales al actualizar marcadores en tiempo real.

---

## 2. Sistema de Diseño & Tokens de Tailwind CSS

### 2.1 Paleta de Colores (`tailwind.config.js`)

```javascript
// tailwind.config.js
module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Fondos y Superficies
        bg: {
          main: "#090d16", // Slate 950 enriquecido
          card: "#111827", // Gray 900
          hover: "#1f2937", // Gray 800
        },
        // Accent Colors (Temáticos Mahjong)
        mahjong: {
          red: "#E63946", // Riichi / Akadora Red / Acciones destructivas
          green: "#10B981", // Jade / Victorias / Botón principal Tsumo
          gold: "#F59E0B", // Ámbar / Rankings / 1er Lugar
          blue: "#3B82F6", // Azul primario / Acciones de formulario
        },
        // Posiciones / Vientos
        wind: {
          east: "#EF4444", // Este (Oya/Dealer) - Red
          south: "#3B82F6", // Sur - Blue
          west: "#10B981", // Oeste - Green
          north: "#8B5CF6", // Norte - Purple
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"], // Para marcadores y puntos
        display: ["Outfit", "sans-serif"],
      },
      boxShadow: {
        "glow-red": "0 0 15px -3px rgba(230, 57, 70, 0.4)",
        "glow-green": "0 0 15px -3px rgba(16, 185, 129, 0.4)",
        "glow-blue": "0 0 15px -3px rgba(59, 130, 246, 0.4)",
        "glow-gold": "0 0 15px -3px rgba(245, 158, 11, 0.4)",
      },
    },
  },
  plugins: [],
};
```

---

## 3. Especificación de Componentes Vue

### 3.1 Header / Barra de Navegación

- **Layout:** `flex justify-between items-center px-6 py-4 bg-bg-card/80 backdrop-blur-md border-b border-slate-800`
- **Izquierda:** Logo `MahjongBu Club` en fuente _Display_ negrita + Enlaces de navegación (`Panel`, `Partidas`, `Jugadores`, `Estadísticas`, `Ranking`).
- **Derecha:**
  - Botones CTA con brillo suave (_Glow buttons_):
    - `+ Nueva Partida` (Verde Jade / `bg-mahjong-green`)
    - `+ Nuevo Jugador` (Azul / `bg-mahjong-blue`)
    - `+ Nueva Temporada` (Dorado / `bg-mahjong-gold`)
  - Avatar de usuario + Enlace "Cerrar sesión".

---

### 3.2 Panel de Control / Dashboard

#### 3.2.1 Tarjetas de Métricas (KPI Cards)

- **Diseño:** Grid responsive de 4 columnas en desktop (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`).
- **Estilo:** `bg-bg-card border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all`
- **Contenido:**
  - Etiqueta superior en tono gris neutro (`text-slate-400 text-sm`).
  - Número principal en formato grande (`text-3xl font-mono font-bold text-white`).
  - Icono descriptivo flotante a la derecha (Icono de ficha de Mahjong, trofeo, o grupo de usuarios).

#### 3.2.2 Accesos Rápidos

- Grid de tarjetas interactivas con hover activo (`hover:scale-[1.02] transition-transform cursor-pointer`).
- Iconografía clara en el centro con títulos explicativos:
  - "Ver Estadísticas Globales"
  - "Ver Ranking de Temporada"
  - "Crear Nueva Partida Rápida"
  - "Mi Perfil y Logros"

---

### 3.3 Mesa Virtual y Captura de Turnos

Esta pantalla se divide en tres secciones principales estructuradas en un layout asimétrico:

#### A. Tablero de Jugadores en Mesa (Cuadrante Izquierdo)

- **Visualización:** Tarjetas para cada uno de los 4 jugadores dispuestas en cuadrícula de 2x2.
- **Componentes por Jugador:**
  - Espacio para avatares (colocar un generico para futuro cambio) y nombre.
  - **Badge de Viento Actual:** Etiqueta distintiva con color del viento (`Este [E]`, `Sur [S]`, `Oeste [W]`, `Norte [N]`).
  - **Puntaje Actual:** Display numérico en fuente `font-mono text-2xl font-bold`.
  - **Indicador Riichi:** Toggle/Badge con efecto Neón (`glow-red`) cuando el jugador declara Riichi en la mano.

#### B. Panel de Registro de Turno Actual (Sección Central)

- **Encabezado:** Badge con número de turno y viento de ronda actual (Ejemplo: `Turno #14 - Viento Este 2`).
- **Selectores de Tipo de Resultado:**
- Badges interactivos para selección rápida: `Tsumo`, `Ron`, `Chombo`, `Draw (Ryuukyoku)`.
- Los dropdown de ganadores o perdedores solo darle el estilo predeterminado. Pero para el ganador colocarle un resaltado verde y el perdedor por ron rojo.
- **Se usara @vueform/multiselect** configurado con tags y searcheables para facilitar la busqueda de yaku (`Riichi`, `Menzen-Tsumo`, `Dora`, `Ippatsu`, etc.).
- **Controles Deslizantes (Sliders / Inputs):**
  - Contadores/Sliders para `Han` y `Fu`.
  - Desplegable de Cálculo de Puntos automático basado en las reglas de Riichi.
- **Botón Acción Principal:** Botón de gran tamaño `Guardar y Siguiente Turno +` con estilo destacado.

#### C. Historial de Turnos Anteriores (Barra Lateral Derecha)

- **Diseño:** Línea de tiempo vertical (_Timeline_) que muestra los turnos pasados de la partida.
- **Elementos por ítem:**
  - Número de turno y Viento.
  - Ganador/res y si es posible lista de yaku.
  - Variación de puntaje resultante (ejemplo: `+3,000` en verde o `-1,000` en rojo).

---

### 3.4 Panel de Estadísticas y Gráficos

- **Tabla de Clasificación:**
  - Filas estilizadas con fondo alternado suave (`odd:bg-slate-900/50 even:bg-bg-card`).
  - Posiciones destacadas: 1.º en dorado (`text-amber-400`), 2.º en plata, 3.º en bronce.
  - Nombres de jugadores como enlaces interactivos a su perfil individual.
- **Integración de Gráficos (ApexCharts / Chart.js):**
  - **Gráfico de Puntos Acumulados (Líneas):** Fondo transparente, líneas con gradientes de color que coinciden con la paleta de Tailwind.
  - **Gráfico de Posiciones (Dona):** Colores personalizados por posición (1.º Ámbar, 2.º Verde Jade, 3.º Azul, 4.º Rojo Carmesí) reemplazando los colores nativos opacos.
