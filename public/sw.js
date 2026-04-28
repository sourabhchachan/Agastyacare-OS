const CACHE_NAME = "ac-hos-v1";
const QUEUE_CACHE_KEY = "/";
const OFFLINE_ACTIONS_DB = "ac-hos-offline-actions";
const STORE = "actions";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(QUEUE_CACHE_KEY)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === "GET" && url.origin === self.location.origin && url.pathname === "/") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(QUEUE_CACHE_KEY, copy));
          return response;
        })
        .catch(() => caches.match(QUEUE_CACHE_KEY))
    );
    return;
  }

  if (
    event.request.method === "POST" &&
    url.origin === self.location.origin &&
    url.pathname.startsWith("/api/items/")
  ) {
    event.respondWith(
      fetch(event.request.clone()).catch(async () => {
        const body = await event.request.clone().text();
        await queueAction({
          url: url.pathname,
          body,
          headers: { "Content-Type": event.request.headers.get("Content-Type") || "application/json" },
          ts: Date.now(),
        });
        await self.registration.sync?.register("sync-item-actions");
        return new Response(JSON.stringify({ queuedOffline: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      })
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-item-actions") {
    event.waitUntil(flushQueuedActions());
  }
});

async function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_ACTIONS_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueAction(action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(action);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function listActions() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearActions() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function flushQueuedActions() {
  const actions = await listActions();
  if (!actions.length) return;
  for (const action of actions) {
    const res = await fetch(action.url, {
      method: "POST",
      headers: action.headers,
      body: action.body,
    });
    if (!res.ok) {
      throw new Error("sync failed");
    }
  }
  await clearActions();
}
