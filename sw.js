// Guarda la app en el teléfono para que abra sin señal. Cambiar VERSION en cada actualización.
const VERSION='remitos-v10';
const BASE=['./','index.html','conexion.js','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(BASE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.hostname.endsWith('google.com')||u.hostname.endsWith('googleusercontent.com'))return; // datos: siempre a internet
  if(u.origin===location.origin){ // la app: primero internet (para tomar actualizaciones), si no hay señal la copia guardada
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(VERSION).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))));return}
  // librerías externas (PDF, letras): la copia guardada si existe
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const c=res.clone();caches.open(VERSION).then(x=>x.put(e.request,c));return res})))
});
