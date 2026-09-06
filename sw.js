// Minimal service worker whose only job is to catch the POST request that
// Android sends when the user shares photos from the Gallery app into this
// PWA (see manifest.json "share_target"). It stashes the shared files in a
// small IndexedDB "mailbox" and redirects to the app, which picks them up
// on load — see the `checkSharedPhotos()` logic in index.html.

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

function openInboxDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('photobook-share-inbox', 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('incoming', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e);
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if(event.request.method === 'POST' && url.pathname === '/share-target/'){
    event.respondWith((async () => {
      try{
        const formData = await event.request.formData();
        const files = formData.getAll('photos');
        const db = await openInboxDB();
        // Store raw bytes (ArrayBuffer) rather than the File/Blob object
        // itself — ArrayBuffers survive the trip from this service worker
        // context to the page's IndexedDB read far more reliably than a
        // live Blob reference does.
        const records = await Promise.all(files.map(async f => ({
          buf: await f.arrayBuffer(),
          type: f.type || 'image/jpeg',
          name: f.name || 'photo.jpg',
          addedAt: Date.now()
        })));
        await new Promise((resolve, reject) => {
          const tx = db.transaction('incoming', 'readwrite');
          const store = tx.objectStore('incoming');
          records.forEach(r => store.add(r));
          tx.oncomplete = resolve;
          tx.onerror = reject;
        });
      }catch(err){
        console.error('share-target: échec de réception des photos', err);
      }
      return Response.redirect('/index.html?shared=1', 303);
    })());
  }
});
