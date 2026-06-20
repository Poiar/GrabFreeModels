import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './assets/main.css';
import { useErrorConsole } from './composables/useErrorConsole';

// Install global error capture before app mounts
useErrorConsole().install();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
