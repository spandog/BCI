/* ============================================================
   BCI service worker — caches the core shell (itinerary, home,
   shared css/js) so the site still opens on patchy signal at
   the course. Stale-while-revalidate: serves from cache first
   for speed, then updates the cache in the background from the
   network. Falls back to the cached itinerary page if a page
   navigation fails entirely offline.
   ============================================================ */
var CACHE_NAME='bci-cache-v47';
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
  var raw=e.data?e.data.text():'';
  var data=null;
  try{data=JSON.parse(raw);}catch(err){data=null;}

  var title,options;
  if(data&&(data.title||data.body)){
    title=data.title||'Book Club Invitational';
    options={
      body:data.body||'',
      icon:'icon-192.png',
      badge:'icon-192.png',
      data:{url:data.url||'leaderboard.html'}
    };
  } else {
    /* diagnostic fallback — shows exactly what arrived so we can see what's wrong,
       instead of hiding it behind a generic message */
    title='[debug] payload did not parse as expected';
    options={
      body:raw?raw.slice(0,180):'(e.data was empty)',
      icon:'icon-192.png',
      badge:'icon-192.png',
      data:{url:'leaderboard.html'}
    };
  }
  e.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',function(e){
  e.notification.close();
  var url=(e.notification.data&&e.notification.data.url)||'leaderboard.html';
  var targetPath;
  try{targetPath=new URL(url,self.location.origin).origin+new URL(url,self.location.origin).pathname;}
  catch(err){targetPath=url.split('?')[0].split('#')[0];}

  e.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
      for(var i=0;i<list.length;i++){
        var client=list[i];
        var clientPath=client.url.split('?')[0].split('#')[0];
        if(clientPath===targetPath&&'focus' in client){
          client.postMessage({type:'bci-notification-click',url:url});
          return client.focus();
        }
      }
      if(clients.openWindow)return clients.openWindow(url);
    })
  );
});
