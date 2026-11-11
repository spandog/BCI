/* ============================================================
   BCI service worker — caches the core shell (itinerary, home,
   leaderboard, shared css/js) so the site still opens on patchy
   signal at the course. Page navigations are network-first — always
   the live version when online, cache only as an offline fallback.
   Everything else (css/js/images) is stale-while-revalidate: served
   from cache first for speed, updated in the background.
   ============================================================ */
var CACHE_NAME='bci-cache-v200';
var CORE_ASSETS=[
  '2027.html',
  'index.html',
  'leaderboard.html',
  'leaderboard.css',
  'leaderboard.js',
  'theme-coastal.css',
  'bci-features.js',
  'live-tracker.js',
  'hero-gallery.js',
  'manifest.json'
];

self.addEventListener('install',function(e){
  /* Each file is fetched fresh from the server, skipping the phone's own
     browser cache. Previously the install could pick up a copy the phone
     had stored minutes earlier, so a new service worker started life with
     an old bci-features.js and kept serving it. One missing file no longer
     stops the whole install either. */
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.all(CORE_ASSETS.map(function(url){
        return fetch(new Request(url,{cache:'reload'})).then(function(resp){
          if(resp&&resp.ok)return cache.put(url,resp);
        }).catch(function(){});
      }));
    }).then(function(){return self.skipWaiting();})
  );
});

self.addEventListener('activate',function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(keys.filter(function(k){return k!==CACHE_NAME&&k!=='bci-msg';}).map(function(k){return caches.delete(k);}));
      })
      .then(function(){return caches.open('bci-msg').then(function(c){return c.delete('/__bci-log');}).catch(function(){});})
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

  /* The site's own scripts, styles and manifest are network-first, checked
     against the server on every load (a quick "not modified" when nothing
     has changed), with the cached copy only used offline. Cache-first here
     is what kept phones running old code after an upload. */
  var u=new URL(e.request.url);
  if(u.origin===self.location.origin&&/\.(js|css|json)$/.test(u.pathname)){
    e.respondWith(
      fetch(new Request(e.request,{cache:'no-cache'})).then(function(resp){
        if(resp&&resp.status===200&&resp.type==='basic'){
          var copy=resp.clone();
          caches.open(CACHE_NAME).then(function(cache){cache.put(e.request,copy);});
        }
        return resp;
      }).catch(function(){
        return caches.open(CACHE_NAME).then(function(cache){return cache.match(e.request);});
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
    data:{url:(payload&&(payload.click_action||payload.url))||'leaderboard.html',title:title,body:body}
  };
  e.waitUntil(self.registration.showNotification(title,options));

});

self.addEventListener('notificationclick',function(e){
  e.notification.close();
  var d=e.notification.data||{};
  var title=d.title||e.notification.title||'';
  var body=d.body||e.notification.body||'';
  var id=String(Date.now());
  /* Always open the site's own address. Notifications can carry the bare
     domain while the app runs on www (or the other way round), and a
     mismatch made iOS treat it as a different site. */
  var url;
  try{var u0=new URL(d.url||'leaderboard.html',self.location.origin);url=self.location.origin+u0.pathname+u0.search+u0.hash;}
  catch(err){url=self.location.origin+'/leaderboard.html';}
  var withMsg;
  try{var u=new URL(url);u.searchParams.set('mt',title);u.searchParams.set('mb',body);u.searchParams.set('mi',id);withMsg=u.href;}
  catch(err){withMsg=url;}
  var targetPath=url.split('?')[0].split('#')[0];
  /* The message is also left in a small cache that the page checks
     whenever it opens or comes back to the foreground. On iPhone a
     suspended app can miss a direct message from the service worker, and
     reopening the app doesn't always pass the address through, so this is
     the route that always arrives. */
  var store=caches.open('bci-msg').then(function(c){
    return c.put('/__bci-pending-msg',new Response(JSON.stringify({id:id,title:title,body:body,url:url,t:Date.now()}),{headers:{'Content-Type':'application/json'}}));
  }).catch(function(){});

  /* If the app is already running on any page, tell every open window and
     bring it forward. The page shows the card wherever it is, with a
     button through to the right page. Moving the window to another page
     from here isn't reliable on iPhone, so it is no longer attempted. */
  e.waitUntil(store.then(function(){
    return clients.matchAll({type:'window',includeUncontrolled:true});
  }).then(function(list){
    if(list.length){
      var msg={type:'bci-notification-click',url:url,title:title,body:body,id:id};
      list.forEach(function(c){try{c.postMessage(msg);}catch(err){}});
      var best=list.filter(function(c){return c.url.split('?')[0].split('#')[0]===targetPath;})[0]||list[0];
      return 'focus' in best?best.focus():undefined;
    }
    if(clients.openWindow)return clients.openWindow(withMsg);
  }));
});
