import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'
import Models from '@/views/Models.vue'
import Rankings from '@/views/Rankings.vue'
import Issues from '@/views/Issues.vue'

const routes = [
  { path: '/', name: 'Dashboard', component: Dashboard },
  { path: '/models', name: 'Models', component: Models },
  { path: '/rankings', name: 'Rankings', component: Rankings },
  { path: '/issues', name: 'Issues', component: Issues },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0, left: 0 }),
})

export default router
