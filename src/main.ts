const app = document.getElementById('app');
if (app) {
  app.innerHTML = '<h1>INTERSTELLAR CRAFT — M0</h1>';
}

if (import.meta.env.DEV) {
  window.__game = { READY: true };
  window.READY = true;
}
