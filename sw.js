/* ============================================================
   BCI service worker — caches the core shell (itinerary, home,
   shared css/js) so the site still opens on patchy signal at
   the course. Stale-while-revalidate: serves from cache first
   for speed, then updates the cache in the background from the
   network. Falls back to the cached itinerary page if a page
   navigation fails entirely offline.
   ============================================================ */
var CACHE_NAME='bci-cache-v42';
var CORE_ASSETS=[
  '2027.html',
  'index.html',
  'theme-coastal.css',
  'bci-features.js',
  'live-tracker.js',
  'hero-gallery.js',
  'manifest.json'
];

self.addEventListener('install',function(e){
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache){return cache.addAll(CORE_ASSETS);})
      .then(function(){return self.skipWaiting();})
  );
});

self.addEventListener('activate',function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(keys.filter(function(k){return k!==CACHE_NAME;}).map(function(k){return caches.delete(k);}));
      })
      .then(function(){return self.clients.claim();})
  );
});

self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  var isNavigate=e.request.mode==='navigate';

  e.respondWith(
    caches.match(e.request).then(function(cached){
      var network=fetch(e.request).then(function(resp){
        if(resp&&resp.status===200&&resp.type==='basic'){
          var copy=resp.clone();
          caches.open(CACHE_NAME).then(function(cache){cache.put(e.request,copy);});
        }
        return resp;
      }).catch(function(){
        if(cached)return cached;
        if(isNavigate)return caches.match('2027.html');
        return undefined;
      });
      return cached||network;
    })
  );
});

/* ---------- push notifications ---------- */
self.addEventListener('push',function(e){
  var data={};
  try{data=e.data?e.data.json():{};}catch(err){data={title:'Book Club Invitational',body:e.data?e.data.text():''};}
  var title=data.title||'Book Club Invitational';
  var options={
    body:data.body||'',
    icon:'icon-192.png',
    badge:'icon-192.png',
    data:{url:data.url||'leaderboard.html'}
  };
  e.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',function(e){
  e.notification.close();
  var url=(e.notification.data&&e.notification.data.url)||'leaderboard.html';
  e.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
      for(var i=0;i<list.length;i++){
        if(list[i].url.indexOf(url)!==-1&&'focus' in list[i])return list[i].focus();
      }
      if(clients.openWindow)return clients.openWindow(url);
    })
  );
});
