// IT Pulse prototype: real feeds and remote push are intentionally not enabled yet.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('Service worker registration failed:', err));
  });
}
