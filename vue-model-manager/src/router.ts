import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'Instances',
    component: () => import('@/views/ModelList.vue'),
    meta: { title: 'Model Instances' },
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
    path: '/compare',
    name: 'Compare',
    component: () => import('@/views/CompareView.vue'),
    meta: { title: 'Compare' },
  },
  {
    path: '/rankings',
    name: 'Rankings',
    component: () => import('@/views/RankingsView.vue'),
    meta: { title: 'Rankings (Free)' },
  },
  {
    path: '/rankings-paid',
    name: 'RankingsPaid',
    component: () => import('@/views/RankingsPaidView.vue'),
    meta: { title: 'Rankings (Paid)' },
  },
  {
    path: '/model/:slug',
    name: 'ModelDetail',
    component: () => import('@/views/ModelList.vue'),
    meta: { title: 'Model' },
  },
  {
    path: '/supermodels',
    name: 'Models',
    component: () => import('@/views/SuperModels.vue'),
    meta: { title: 'Super Models' },
  },
  {
    path: '/providers',
    name: 'Providers',
    component: () => import('@/views/Providers.vue'),
    meta: { title: 'Providers' },
  },
  // Redirect old routes
  { path: '/issues-timeline', redirect: '/issues' },
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
