import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('@/pages/HomePage.vue') },
      { path: 'settings', name: 'settings', component: () => import('@/pages/SettingsPage.vue') },
      { path: 'projects', name: 'projects', component: () => import('@/pages/ProjectsPage.vue') },
      {
        path: 'projects/:slug',
        name: 'project',
        component: () => import('@/pages/ProjectDetailPage.vue'),
        props: true,
      },
      {
        path: 'projects/:slug/session/:id',
        name: 'session',
        component: () => import('@/pages/TranscriptReplayPage.vue'),
        props: true,
      },
      { path: 'agents', name: 'agents', component: () => import('@/pages/AgentsPage.vue') },
      { path: 'skills', name: 'skills', component: () => import('@/pages/SkillsPage.vue') },
      { path: 'plugins', name: 'plugins', component: () => import('@/pages/PluginsPage.vue') },
      { path: 'memory', name: 'memory', component: () => import('@/pages/MemoryPage.vue') },
      { path: 'backups', name: 'backups', component: () => import('@/pages/BackupsPage.vue') },
      { path: 'hooks', name: 'hooks', component: () => import('@/pages/HooksPage.vue') },
      { path: 'mcp', name: 'mcp', component: () => import('@/pages/McpPage.vue') },
      { path: 'sessions', name: 'sessions', component: () => import('@/pages/SessionsPage.vue') },
      // L'Atelier possède ses sessions, là où /sessions observe celles du CLI.
      { path: 'atelier', name: 'atelier', component: () => import('@/pages/AtelierPage.vue') },
      { path: 'usage', name: 'usage', component: () => import('@/pages/UsagePage.vue') },
      {
        path: 'diagnostic',
        name: 'diagnostic',
        component: () => import('@/pages/DiagnosticPage.vue'),
      },
      {
        path: 'maintenance',
        name: 'maintenance',
        component: () => import('@/pages/MaintenancePage.vue'),
      },
      { path: 'aide', name: 'help', component: () => import('@/pages/HelpPage.vue') },
    ],
  },

  // Always leave this as last one.
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
];

export default routes;
