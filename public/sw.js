// OneUco service worker — push ONLY (re-engagement batch, 2026-11-11).
//
// Deliberately NO fetch handler and NO caching: the app must never be
// served stale by a worker we shipped. This worker exists so browsers
// can deliver Web Push notifications (matches, messages, follow
// requests) and route a tap back into the app. On iOS, notifications
// only arrive when OneUco is installed to the Home Screen (iOS 16.4+).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = {};
  }
  const title = payload.title || "OneUco";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const win of windows) {
          if ("focus" in win) {
            if ("navigate" in win) {
              win.navigate(target).catch(() => {});
            }
            return win.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
