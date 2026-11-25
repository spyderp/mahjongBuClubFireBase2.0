# MahjongBuClub

Sistema de registro, puntuación y ranking para un **club de Mahjong Riichi**.

> **Estado:** versión **beta**. Aunque el repositorio lleva el sufijo "2.0", este no es realmente el segundo lanzamiento del producto: hubo un proyecto anterior que fue la versión **1.0**. Esta es una reescritura desde cero, aún en desarrollo activo y no lista para producción.

## ¿Qué es este proyecto?

**MahjongBuClub** es una aplicación web (SPA) para llevar las estadísticas de un club de Mahjong estilo Riichi. Permite:

- Registrar jugadores y temporadas.
- Capturar partidas turno a turno (`tonpuusen` y `hanchan`).
- Calcular el valor de cada mano según las reglas de puntuación del club (han, fu, dora, yaku, yakuman, uma, chombo, etc.).
- Consultar rankings de temporada con desempate por victorias, segundas posiciones y orden alfabético.
- Ver gráficas de evolución de puntuación, desglose de posiciones y yaku más frecuentes.

El proyecto está **construido desde cero**, sin código heredado que migrar.

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Lenguaje | TypeScript ~5.9.x |
| Framework | Vue 3.5 (Composition API, `<script setup>`) |
| Build / Bundler | Vite 8 |
| Rutas | Vue Router 5 |
| Estado global | Pinia 4 |
| Caché de servidor | @pinia/colada |
| Base de datos / Auth | Firebase 12 (Firestore, Authentication) |
| Estilos | Tailwind CSS 4 |
| Gráficas | Chart.js 4 |
| Internacionalización | vue-i18n 11 (español) |
| Pruebas | Vitest 5 + happy-dom + @vue/test-utils |
| Lint / Formato | ESLint 10 + Prettier 3 |

## Cómo se desarrolló

Este proyecto se construyó siguiendo **Spec-Driven Development (SDD)**:

1. **Primero la spec**: antes de escribir código, se lee y se acuerda la especificación activa en `specs/` y la `docs/constitution.md`.
2. **Tareas verificables**: cada funcionalidad se divide en tareas con requisitos funcionales (RF) y un "hecho cuando" comprobable.
3. **Dominio puro y testeado**: la lógica de negocio (cálculo de puntuación, uma, ranking, agregaciones) vive en `src/domain/` como funciones puras, con **100 % de cobertura de pruebas** obligatoria.
4. **Arquitectura por capas**: `pages → components → composables → queries → data → firebase`, con `domain/` aislado de frameworks y Firebase.
5. **Calidad bloqueante**: antes de dar cualquier tarea por terminada deben pasar en orden: `typecheck`, `lint`, `test` y `format:check`.

Además, el desarrollo de este SPA contó con el apoyo de **Inteligencia Artificial de código abierto**, que colaboró en la generación de código, revisión de lógica de dominio, redacción de especificaciones y pruebas.

## Comandos disponibles

```bash
npm install          # Instala dependencias
npm run dev          # Servidor de desarrollo con HMR
npm run build        # Typecheck + build de producción (vite build)
npm run preview      # Sirve la build localmente
npm run typecheck    # vue-tsc (typecheck sin emitir)
npm run lint         # ESLint (solo check)
npm run lint:fix     # ESLint con autocorrección
npm run format       # Prettier sobre src/
npm run format:check # Prettier check
npm run test         # Vitest (una pasada)
npm run test:watch   # Vitest en modo watch
npm run test:coverage# Cobertura con umbrales de domain/
```

## Estructura destacada

```
src/
├── __tests__/       # Pruebas (una por módulo)
├── app/             # Bootstrap: main, router, pinia, firebase
├── components/      # UI, formularios, gráficas, layout
├── composables/     # usePlayers, useSeasons, useGames, useRankings...
├── data/            # Repositorios (única capa que importa firebase/*)
├── domain/          # Lógica pura: reglas, puntuación, ranking, stats
├── i18n/            # Locales (español)
├── pages/           # Páginas de la aplicación
├── queries/         # Key factories y opciones de @pinia/colada
├── stores/          # session.ts, preferences.ts (solo dos stores)
└── test-utils/      # Helpers y mocks
```

## Documentación interna

- `docs/domain.md` — Modelo de dominio, reglas de puntuación y desviaciones del reglamento de referencia.
- `docs/constitution.md` — Principios no negociables del desarrollo (SDD).
- `AGENT.md` — Convenciones de arquitectura, stack y comandos para el equipo.

## Licencia

Proyecto privado del club.