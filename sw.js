/* ============================================================
   BCI service worker — caches the core shell (itinerary, home,
   leaderboard, shared css/js) so the site still opens on patchy
   signal at the course. Stale-while-revalidate: serves from cache
   first for speed, then updates the cache in the background from
   the network. Falls back to whichever page was actually being
   navigated to, if it's cached — only drops back to the itinerary
   page as a last resort if that specific page was never cached.
   ============================================================ */
var CACHE_NAME='bci-cache-v121';
var CORE_ASSETS=[
  '2027.html',
  'index.html',
  'leaderboard.html',
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
        // The specific page being navigated to was never cached (e.g. a
        // first-ever visit while offline) — fall back to the itinerary
        // page as a last resort rather than showing nothing at all.
        if(isNavigate)return caches.match('2027.html');
        return undefined;
      });
      return cached||network;
    })
  );
});

/* ---------- push notifications ---------- */
self.addEventListener('push',function(e){
  var raw=e.data?e.data.text():'[[no e.data]]';
  var parsed=null;
  try{parsed=JSON.parse(raw);}catch(err){parsed=null;}
  /* FCM sometimes nests our fields one level deeper under a "data" key —
     unwrap it if present, otherwise use the top level as-is. */
  var payload=(parsed&&parsed.data&&typeof parsed.data==='object')?parsed.data:parsed;

  var title,body;
  if(payload&&typeof payload.title==='string'&&payload.title.length>0){
    title=payload.title;
    body=(typeof payload.body==='string'&&payload.body.length>0)?payload.body:'[[empty body field]]';
  } else {
    /* SW-DIAG: this prefix can never appear by accident — if you see it,
       the payload arrived but didn't have a usable title field even after unwrapping */
    title='SW-DIAG2: '+(parsed?('top='+JSON.stringify(Object.keys(parsed))):'JSON.parse failed');
    body='raw: '+raw.slice(0,180);
  }
  var options={
    body:body,
    icon:'icon-192.png',
    badge:'icon-192.png',
    data:{url:(payload&&payload.url)||'leaderboard.html'}
  };
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
