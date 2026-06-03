import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue'),
    meta: { title: 'Dashboard' },
  },
  {
    path: '/author',
    name: 'Author',
    component: () => import('@/views/Author.vue'),
    meta: { title: 'Author' },
  },
  {
    path: '/family',
    name: 'Family',
    component: () => import('@/views/Family.vue'),
    meta: { title: 'Family' },
  },
  {
    path: '/models',
    name: 'SuperModels',
    component: () => import('@/views/SuperModels.vue'),
    meta: { title: 'Super' },
  },
  {
    path: '/master/:id',
    redirect: (to: { params: Record<string, string | string[]> }) => `/super/${to.params.id}`,
  },
  {
    path: '/super/:id',
    name: 'SuperModel',
    component: () => import('@/views/SuperModel.vue'),
    meta: { title: 'SuperModel' },
  },
  {
    path: '/all',
    name: 'All',
    component: () => import('@/views/All.vue'),
    meta: { title: 'All' },
  },
  {
    path: '/free',
    name: 'Free',
    component: () => import('@/views/Free.vue'),
    meta: { title: 'Free' },
  },
  {
    path: '/paid',
    name: 'Paid',
    component: () => import('@/views/Paid.vue'),
    meta: { title: 'Paid' },
  }, 
  {
    path: '/issues',
    name: 'Issues',
    component: () => import('@/views/Issues.vue'),
    meta: { title: 'Issues' },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0, left: 0 }),
})

const BASE_TITLE = 'GrabFreeModels'
router.afterEach((to) => {
  const page = to.meta?.title as string | undefined
  document.title = page ? `${page} — ${BASE_TITLE}` : BASE_TITLE
})

export default router
