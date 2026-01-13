// Firebase Messaging Service Worker
// This file handles background push notifications when the app is not in focus

importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js');

// Import Firebase configuration (generated at build time from environment)
importScripts('./firebase-config.js');

// Initialize Firebase in the service worker using the generated config
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const notificationTitle = payload.notification?.title || 'New Message';
  const notificationOptions = {
    body: payload.notification?.body || 'You have unread messages',
    icon: payload.notification?.icon || '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/badge-72x72.png',
    data: payload.data,
    tag: payload.data?.channelId || 'default',
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'Open Chat' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click:', event);
  
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    // Open the app and navigate to the chat
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // If app is already open, focus it
          for (const client of clientList) {
            if (client.url.includes(self.registration.scope) && 'focus' in client) {
              return client.focus().then(() => {
                if ('navigate' in client) {
                  return client.navigate(urlToOpen);
                }
              });
            }
          }
          // Otherwise, open a new window
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});
