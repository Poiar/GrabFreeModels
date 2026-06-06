import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'Models',
    component: () => import('@/views/ModelList.vue'),
    meta: { title: 'Models' },
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/NewDashboard.vue'),
    meta: { title: 'Dashboard' },
  },
  {
    path: '/creators',
    name: 'Creators',
    component: () => import('@/views/CreatorList.vue'),
    meta: { title: 'Creators' },
  },
  {
    path: '/creator/:id',
    name: 'CreatorDetail',
    component: () => import('@/views/CreatorDetail.vue'),
    meta: { title: 'Creator' },
  },
  {
    path: '/issues',
    name: 'Issues',
    component: () => import('@/views/Issues.vue'),
    meta: { title: 'Issues' },
  },
  {
    path: '/model/:slug',
    name: 'ModelDetail',
    component: () => import('@/views/ModelList.vue'),
    meta: { title: 'Model' },
  },
  // Redirect old routes
  { path: '/free', redirect: '/' },
  { path: '/paid', redirect: '/' },
  { path: '/all', redirect: '/' },
  { path: '/models', redirect: '/' },
  { path: '/master/:id', redirect: '/' },
  { path: '/super/:id', redirect: '/' },
  { path: '/author', redirect: '/creators' },
  { path: '/family', redirect: '/creators' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0, left: 0 }),
});

const BASE_TITLE = 'GrabFreeModels';
router.afterEach((to) => {
  const page = to.meta?.title as string | undefined;
  document.title = page ? `${page} — ${BASE_TITLE}` : BASE_TITLE;
});

router.onError((err) => {
  console.error('Router error:', err.message || err);
});

export default router;
