/* ============================================================
   BCI service worker — caches the core shell (itinerary, home,
   leaderboard, shared css/js) so the site still opens on patchy
   signal at the course. Page navigations are network-first — always
   the live version when online, cache only as an offline fallback.
   Everything else (css/js/images) is stale-while-revalidate: served
   from cache first for speed, updated in the background.
   ============================================================ */
var CACHE_NAME='bci-cache-v180';
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

  if(isNavigate){
    /* Page loads always prefer the live network version when it's
       available — the cache here is purely an offline fallback, not a
       way to deliberately show yesterday's page while the real one
       loads quietly behind it. Previously this used cache-first for
       navigations too, which meant every page update was one reload
       behind on a normal connection, not just when offline. */
    e.respondWith(
      fetch(e.request).then(function(resp){
        if(resp&&resp.status===200&&resp.type==='basic'){
          var copy=resp.clone();
          caches.open(CACHE_NAME).then(function(cache){cache.put(e.request,copy);});
        }
        return resp;
      }).catch(function(){
        return caches.match(e.request).then(function(cached){
          return cached||caches.match('2027.html');
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function(cached){
      var network=fetch(e.request).then(function(resp){
        if(resp&&resp.status===200&&resp.type==='basic'){
          var copy=resp.clone();
          caches.open(CACHE_NAME).then(function(cache){cache.put(e.request,copy);});
        }
        return resp;
      }).catch(function(){
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
  /* FCM delivers our title/body nested under a "notification" key in
     practice — this was previously only checking a "data" key, which
     real messages never actually use, so every push fell through to
     the diagnostic branch below instead of showing the real text.
     Still checks "data" too, and falls back to the top level, in case
     a message ever arrives shaped either of those other ways. */
  var payload=parsed;
  if(parsed){
    if(parsed.notification&&typeof parsed.notification==='object')payload=parsed.notification;
    else if(parsed.data&&typeof parsed.data==='object')payload=parsed.data;
  }

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
    data:{url:(payload&&(payload.click_action||payload.url))||'leaderboard.html'}
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
