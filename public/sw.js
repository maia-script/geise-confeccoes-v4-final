const VERSION='geise-v4.0.0';
const SHELL=`${VERSION}:shell`,IMAGES=`${VERSION}:images`,RUNTIME=`${VERSION}:runtime`;
const PRECACHE=['/','/offline.html','/manifest.webmanifest','/assets/icons/icon-192.png','/assets/icons/icon-512.png','/assets/icons/maskable-512.png','/assets/brand/logo-original.jpg','/assets/css/tokens.css','/assets/css/base.css','/assets/css/components.css','/assets/css/pages.css','/assets/css/responsive.css','/assets/js/app.js'];

self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL).then(c=>c.addAll(PRECACHE))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(![SHELL,IMAGES,RUNTIME].includes(key))await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==location.origin)return;
  // Nunca persista respostas da API em CacheStorage: elas podem conter sessão, carrinho,
  // pedidos ou dados administrativos. Em modo offline devolvemos um erro explícito.
  if(url.pathname.startsWith('/api/')){event.respondWith(apiNetworkOnly(req));return;}
  if(req.destination==='image'){event.respondWith(cacheFirst(req,IMAGES));return;}
  if(req.destination==='script'||req.destination==='style'){event.respondWith(staleWhileRevalidate(req,RUNTIME));return;}
  if(req.mode==='navigate'){event.respondWith(navigation(req));return;}
});
async function apiNetworkOnly(req){try{return await fetch(req)}catch{return new Response(JSON.stringify({error:'Sem conexão com o servidor.'}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}}
async function navigation(req){try{const response=await fetch(req);if(response.ok){const cache=await caches.open(RUNTIME);cache.put(req,response.clone());}return response}catch{const cached=await caches.match(req)||await caches.match('/');return cached||caches.match('/offline.html')}}
async function cacheFirst(req,cacheName){const cache=await caches.open(cacheName);const hit=await cache.match(req);if(hit)return hit;const response=await fetch(req);if(response.ok)cache.put(req,response.clone());return response}
async function staleWhileRevalidate(req,cacheName){const cache=await caches.open(cacheName);const hit=await cache.match(req);const network=fetch(req).then(response=>{if(response.ok)cache.put(req,response.clone());return response}).catch(()=>null);return hit||network}
