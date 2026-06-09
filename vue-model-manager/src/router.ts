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
    path: '/fine-tuners',
    name: 'FineTuners',
    component: () => import('@/views/FineTunerList.vue'),
    meta: { title: 'Fine Tuners' },
  },
  {
    path: '/fine-tuner/:id',
    name: 'FineTunerDetail',
    component: () => import('@/views/FineTunerDetail.vue'),
    meta: { title: 'Fine Tuner' },
  },
  {
    path: '/provider/:slug',
    name: 'ProviderDetail',
    component: () => import('@/views/ProviderDetail.vue'),
    meta: { title: 'Provider' },
  },
  {
    path: '/base-models',
    name: 'BaseModels',
    component: () => import('@/views/BaseModelList.vue'),
    meta: { title: 'Base Models' },
  },
  {
    path: '/base-model/:name',
    name: 'BaseModelDetail',
    component: () => import('@/views/BaseModelDetail.vue'),
    meta: { title: 'Base Model' },
  },
  {
    path: '/compare',
    name: 'Compare',
    component: () => import('@/views/CompareModels.vue'),
    meta: { title: 'Compare Models' },
  },
  {
    path: '/advanced-search',
    name: 'AdvancedSearch',
    component: () => import('@/views/AdvancedSearch.vue'),
    meta: { title: 'Advanced Search' },
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
  {
    path: '/families',
    name: 'Families',
    component: () => import('@/views/FamilyList.vue'),
    meta: { title: 'Families' },
  },
  {
    path: '/family/:name',
    name: 'FamilyDetail',
    component: () => import('@/views/FamilyDetail.vue'),
    meta: { title: 'Family' },
  },
  // Redirect old routes

{ path: '/free', redirect: '/' },
  { path: '/paid', redirect: '/' },
  { path: '/all', redirect: '/' },
  { path: '/models', redirect: '/' },
  { path: '/master/:id', redirect: '/' },
  { path: '/super/:id', redirect: '/' },
  { path: '/author', redirect: '/creators' },
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
