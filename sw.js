'use strict';
const CACHE_NAME = 'goodday-public-book-v11';
const SHELL = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest', './favicon.svg',
  './output/pdf/goodday-book.pdf',
  './books/goodday-book.md',
  './books/mini-book-assets/goodday-sign-in-crop.png',
  './books/mini-book-assets/servicenow/business-application-service-relationships.png',
  './books/mini-book-assets/servicenow/unified-ea-service-map.png',
  './books/mini-book-assets/redacted/adult-completion-review.png',
  './books/mini-book-assets/redacted/ai-story-draft.png',
  './books/mini-book-assets/redacted/ai-usage-audit.png',
  './books/mini-book-assets/redacted/chore-setup.png',
  './books/mini-book-assets/redacted/csdm-relationships.png',
  './books/mini-book-assets/redacted/cmdb-workspace-topology.png',
  './books/mini-book-assets/redacted/deployment-architecture.png',
  './books/mini-book-assets/redacted/dim-integration-inventory.png',
  './books/mini-book-assets/redacted/ea-business-application.png',
  './books/mini-book-assets/redacted/feedback-inbox.png',
  './books/mini-book-assets/redacted/feedback-submission.png',
  './books/mini-book-assets/redacted/goodday-google-signin.png',
  './books/mini-book-assets/redacted/goodday-ai-proposal-redacted.png',
  './books/mini-book-assets/redacted/goodday-overview-redacted.png',
  './books/mini-book-assets/redacted/image-generation-approval.png',
  './books/mini-book-assets/redacted/image-generation-private-preview.png',
  './books/mini-book-assets/redacted/member-submission.png',
  './books/mini-book-assets/redacted/mcp-region-consent.png',
  './books/mini-book-assets/redacted/mcp-tool-permissions.png',
  './books/mini-book-assets/redacted/reward-request-pending.png',
  './books/mini-book-assets/redacted/reward-request.png',
  './books/mini-book-assets/redacted/system-monitor.png'
];
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (name) { return (name.startsWith('goodday-field-notes-') || name.startsWith('goodday-public-book-')) && name !== CACHE_NAME; }).map(function (name) { return caches.delete(name); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(function () {
        if (request.mode === 'navigate') return cache.match(new URL('./index.html', self.registration.scope).href);
        return new Response('Offline', { status: 504, statusText: 'Offline' });
      });
    });
  }));
});
