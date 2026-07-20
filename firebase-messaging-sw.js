/* eslint-disable no-undef */
/**
 * Service Worker FCM — arrière-plan pour les notifications Web Needs.
 * Même config que le client (Firebase JS compat 8).
 */
importScripts("https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js");
importScripts("https://www.gstatic.com/firebasejs/8.10.0/firebase-messaging.js");

firebase.initializeApp({
  apiKey: "AIzaSyAQQSVZx38jeI-8-OL-sfaDSxElqrOTJOU",
  authDomain: "needs-ae86d.firebaseapp.com",
  projectId: "needs-ae86d",
  storageBucket: "needs-ae86d.firebasestorage.app",
  messagingSenderId: "253900994407",
  appId: "1:253900994407:web:55168e1b73c878761de1c2"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const title = (payload.notification && payload.notification.title) || "Needs";
  const body = (payload.notification && payload.notification.body) || "";
  const options = {
    body: body,
    icon: "/favicon.png",
    badge: "/favicon.png",
    data: payload.data || {}
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
