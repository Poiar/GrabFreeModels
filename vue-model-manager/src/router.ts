import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue'),
    meta: { title: 'Dashboard' },
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
  {
    path: '/master/:id',
    name: 'MasterModel',
    component: () => import('@/views/MasterModel.vue'),
    meta: { title: 'Model' },
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
