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
    meta: { title: 'Creator', navParent: '/creators' },
  },
  // Redirect old fine-tuner URLs
  { path: '/fine-tuners', redirect: '/derivatives' },
  { path: '/fine-tuner/:id', redirect: '/derivative/:id' },

  {
    path: '/derivatives',
    name: 'Derivatives',
    component: () => import('@/views/DerivativeList.vue'),
    meta: { title: 'Derivatives' },
  },
  {
    path: '/derivative/:id',
    name: 'DerivativeDetail',
    component: () => import('@/views/DerivativeDetail.vue'),
    meta: { title: 'Derivative', navParent: '/derivatives' },
  },
  {
    path: '/provider/:slug',
    name: 'ProviderDetail',
    component: () => import('@/views/ProviderDetail.vue'),
    meta: { title: 'Provider', navParent: '/providers' },
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
    meta: { title: 'Base Model', navParent: '/base-models' },
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
    path: '/benchmarks',
    name: 'Benchmarks',
    component: () => import('@/views/BenchmarksView.vue'),
    meta: { title: 'Benchmarks' },
  },
  {
    path: '/rankings',
    name: 'Rankings',
    component: () => import('@/views/RankingsView.vue'),
    meta: { title: 'Rankings (Free)' },
  },
  {
    path: '/model/:slug',
    name: 'ModelDetail',
    component: () => import('@/views/ModelDetail.vue'),
    meta: { title: 'Model', navParent: '/supermodels' },
  },
  {
    path: '/supermodels',
    name: 'Models',
    component: () => import('@/views/SuperModels.vue'),
    meta: { title: 'Super Models' },
  },
  {
    path: '/supermodel/:slug',
    name: 'SuperModelDetail',
    component: () => import('@/views/SuperModelDetail.vue'),
    meta: { title: 'Super Model', navParent: '/supermodels' },
  },
  {
    path: '/providers',
    name: 'Providers',
    component: () => import('@/views/Providers.vue'),
    meta: { title: 'Providers' },
  },
  {
    path: '/compare-providers',
    name: 'CompareProviders',
    component: () => import('@/views/CompareProviders.vue'),
    meta: { title: 'Compare Providers' },
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
    meta: { title: 'Family', navParent: '/families' },
  },
  {
    path: '/scores',
    name: 'Scores',
    component: () => import('@/views/ScoresExplorer.vue'),
    meta: { title: 'Model Scores' },
  },
  {
    path: '/providers/onboarding',
    name: 'ProviderOnboarding',
    component: () => import('@/views/ProviderOnboarding.vue'),
    meta: { title: 'Provider Onboarding', navParent: '/providers' },
  },
  {
    path: '/lineage',
    name: 'Lineage',
    component: () => import('@/views/LineageTree.vue'),
    meta: { title: 'Lineage Tree' },
  },
  {
    path: '/playground',
    name: 'Playground',
    component: () => import('@/views/ApiPlayground.vue'),
    meta: { title: 'API Playground' },
  },
  {
    path: '/tags',
    name: 'Tags',
    component: () => import('@/views/TagExplorer.vue'),
    meta: { title: 'Tag Explorer' },
  },
  {
    path: '/activity',
    name: 'Activity',
    component: () => import('@/views/ActivityFeed.vue'),
    meta: { title: 'Activity Feed' },
  },
  {
    path: '/picker',
    name: 'ModelPicker',
    component: () => import('@/views/ModelPicker.vue'),
    meta: { title: 'Model Picker' },
  },
  {
    path: '/rate-limits',
    name: 'RateLimits',
    component: () => import('@/views/RateLimitCompare.vue'),
    meta: { title: 'Rate Limits' },
  },
  {
    path: '/providers/status',
    name: 'ProviderStatus',
    component: () => import('@/views/ProviderStatusGrid.vue'),
    meta: { title: 'Provider Status', navParent: '/providers' },
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/views/AdminPanel.vue'),
    meta: { title: 'Admin' },
  },
  // Redirect old routes
  { path: '/rankings-paid', redirect: '/rankings' },
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
