import type { RouteRecordRaw } from 'vue-router'

/**
 * T85 a T90 · Rutas de la aplicación (AGENT.md → Bootstrap): layout en la raíz con las páginas
 * perezosas como hijas. Las acciones de captura y administración llevan `meta.requiresAuth`
 * (RF-15.1, RF-15.2); las consultas son públicas (RF-14.1).
 */
export const routes: readonly RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/components/layout/AppLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('@/pages/DashboardPage.vue') },
      { path: 'partidas', name: 'games', component: () => import('@/pages/GamesPage.vue') },
      {
        path: 'partidas/nueva',
        name: 'gameForm',
        component: () => import('@/pages/GamesPage.vue'),
        props: { creating: true },
        meta: { requiresAuth: true },
      },
      {
        path: 'partidas/:gameId',
        name: 'gameDetail',
        component: () => import('@/pages/GameDetailPage.vue'),
        props: true,
      },
      { path: 'jugadores', name: 'players', component: () => import('@/pages/PlayersPage.vue') },
      {
        path: 'jugadores/nuevo',
        name: 'playerForm',
        component: () => import('@/pages/PlayersPage.vue'),
        props: { creating: true },
        meta: { requiresAuth: true },
      },
      { path: 'temporadas', name: 'seasons', component: () => import('@/pages/SeasonsPage.vue') },
      {
        path: 'temporadas/nueva',
        name: 'seasonForm',
        component: () => import('@/pages/SeasonsPage.vue'),
        props: { creating: true },
        meta: { requiresAuth: true },
      },
      { path: 'estadisticas', name: 'stats', component: () => import('@/pages/StatsPage.vue') },
      { path: 'ranking', name: 'rankings', component: () => import('@/pages/RankingsPage.vue') },
      { path: 'sesion', name: 'login', component: () => import('@/pages/LoginPage.vue') },
    ],
  },
]
