/* ============================================================
   BCI shared features — golf ball (mouse + touch), divot tap
   ripple, haptic buzz + flag-plant on live score events, and
   scorecard-flip pull-to-refresh.
   Include after live-tracker.js on every page:
   <script src="bci-features.js"></script>
   ============================================================ */
(function(){
  /* One real Supabase client shared across every script on the page —
     see live-tracker.js for the full explanation. Identical definition,
     safe either way round depending on which file actually loads first. */
  window.bciGetSupabase=window.bciGetSupabase||function(url,key){
    if(!window.__bciSbClient)window.__bciSbClient=window.supabase.createClient(url,key);
    return window.__bciSbClient;
  };
  var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isCoarse=window.matchMedia('(pointer: coarse)').matches;

  /* ---------- custom cursor: golf flag (precise) + trailing ball, mouse only ---------- */
  if(!reduceMotion&&!isCoarse)(function customCursor(){
    var flag=document.createElement('div');
    flag.id='bci-flag-cursor';
    flag.setAttribute('aria-hidden','true');
    flag.innerHTML='<svg viewBox="0 0 24 36" width="22" height="33">'+
      '<ellipse cx="12" cy="32" rx="7" ry="2.6" fill="#16291d" opacity="0.85"/>'+
      '<line x1="12" y1="30" x2="12" y2="4" stroke="#16291d" stroke-width="1.6" stroke-linecap="round"/>'+
      '<path d="M12 4 L12 15 L22 9 Z" fill="#b0532b"/></svg>';
    document.body.appendChild(flag);

    var ball=document.createElement('div');
    ball.id='bci-ball-wrap';
    ball.setAttribute('aria-hidden','true');
    ball.innerHTML='<svg viewBox="0 0 20 20" width="16" height="16">'+
      '<circle cx="10" cy="10" r="9" fill="#fbfaf7" stroke="rgba(22,41,29,0.2)" stroke-width="0.6"/>'+
      '<circle cx="6" cy="6" r="1" fill="rgba(22,41,29,0.15)"/><circle cx="10" cy="5" r="1" fill="rgba(22,41,29,0.15)"/>'+
      '<circle cx="14" cy="6" r="1" fill="rgba(22,41,29,0.15)"/><circle cx="5" cy="10" r="1" fill="rgba(22,41,29,0.15)"/>'+
      '<circle cx="10" cy="10" r="1" fill="rgba(22,41,29,0.15)"/><circle cx="15" cy="10" r="1" fill="rgba(22,41,29,0.15)"/>'+
      '<circle cx="6" cy="14" r="1" fill="rgba(22,41,29,0.15)"/><circle cx="10" cy="15" r="1" fill="rgba(22,41,29,0.15)"/>'+
      '<circle cx="14" cy="14" r="1" fill="rgba(22,41,29,0.15)"/></svg>';
    document.body.appendChild(ball);

    var mouseX=-100,mouseY=-100,ballX=-100,ballY=-100,active=false,lastTrail=0;

    function spawnTrail(x,y){
      var dot=document.createElement('div');
      dot.className='bci-trail-dot';
      dot.style.left=x+'px';dot.style.top=y+'px';
      document.body.appendChild(dot);
      setTimeout(function(){dot.remove();},450);
    }

    window.addEventListener('pointermove',function(e){
      if(e.pointerType!=='mouse')return;
      if(!active){
        active=true;
        ballX=e.clientX;ballY=e.clientY;
        document.body.classList.add('bci-custom-cursor');
        flag.style.opacity='1';ball.style.opacity='1';
      }
      mouseX=e.clientX;mouseY=e.clientY;
      flag.style.transform='translate('+mouseX+'px,'+mouseY+'px)';
    },{passive:true});

    document.addEventListener('mouseleave',function(){
      active=false;
      document.body.classList.remove('bci-custom-cursor');
      flag.style.opacity='0';ball.style.opacity='0';
    });
    document.addEventListener('mouseenter',function(){
      if(active){flag.style.opacity='1';ball.style.opacity='1';}
    });

    function loop(ts){
      if(active){
        var dx=mouseX-ballX,dy=mouseY-ballY;
        ballX+=dx*0.16;ballY+=dy*0.16;
        var dist=Math.sqrt(dx*dx+dy*dy);
        ball.style.transform='translate('+ballX+'px,'+ballY+'px) rotate('+(ballX*1.3)+'deg)';
        if(dist>4&&ts-lastTrail>70){lastTrail=ts;spawnTrail(ballX,ballY);}
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  })();

  /* ---------- golf ball trail, touch only (drag/tap) ---------- */
  if(!reduceMotion&&isCoarse)(function touchBall(){
    var wrap=document.createElement('div');
    wrap.id='bci-ball-wrap';
    wrap.setAttribute('aria-hidden','true');
    wrap.innerHTML='<svg viewBox="0 0 20 20" width="18" height="18">'+
      '<circle cx="10" cy="10" r="9" fill="#fbfaf7" stroke="rgba(22,41,29,0.2)" stroke-width="0.6"/>'+
      '<circle cx="6" cy="6" r="1" fill="rgba(22,41,29,0.15)"/><circle cx="10" cy="5" r="1" fill="rgba(22,41,29,0.15)"/>'+
      '<circle cx="14" cy="6" r="1" fill="rgba(22,41,29,0.15)"/><circle cx="5" cy="10" r="1" fill="rgba(22,41,29,0.15)"/>'+
      '<circle cx="10" cy="10" r="1" fill="rgba(22,41,29,0.15)"/><circle cx="15" cy="10" r="1" fill="rgba(22,41,29,0.15)"/>'+
      '<circle cx="6" cy="14" r="1" fill="rgba(22,41,29,0.15)"/><circle cx="10" cy="15" r="1" fill="rgba(22,41,29,0.15)"/>'+
      '<circle cx="14" cy="14" r="1" fill="rgba(22,41,29,0.15)"/></svg>';
    document.body.appendChild(wrap);

    var targetX=0,targetY=0,ballX=0,ballY=0,active=false,idleTimer=null,lastTrail=0;

    function spawnTrail(x,y){
      var dot=document.createElement('div');
      dot.className='bci-trail-dot';
      dot.style.left=x+'px';dot.style.top=y+'px';
      document.body.appendChild(dot);
      setTimeout(function(){dot.remove();},450);
    }

    function wake(x,y,fadeAfter){
      targetX=x;targetY=y;
      if(!active){ballX=x;ballY=y;}
      active=true;
      wrap.style.opacity='1';
      clearTimeout(idleTimer);
      if(fadeAfter){idleTimer=setTimeout(function(){wrap.style.opacity='0';},fadeAfter);}
    }

    window.addEventListener('pointermove',function(e){
      if(e.pointerType!=='mouse'){ wake(e.clientX,e.clientY,700); }
    },{passive:true});

    window.addEventListener('pointerdown',function(e){
      if(e.pointerType!=='mouse'){ wake(e.clientX,e.clientY,700); }
    },{passive:true});

    function loop(ts){
      if(active){
        var dx=targetX-ballX,dy=targetY-ballY;
        ballX+=dx*0.18;ballY+=dy*0.18;
        var dist=Math.sqrt(dx*dx+dy*dy);
        wrap.style.transform='translate('+ballX+'px,'+ballY+'px) rotate('+(ballX*1.3)+'deg)';
        if(dist>4&&ts-lastTrail>70){lastTrail=ts;spawnTrail(ballX,ballY);}
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  })();

  /* ---------- divot tap ripple on buttons ---------- */
  (function divot(){
    var BTN_SELECTOR='button,.entry-btn,.submit-btn,.pay-btn,.qty-btn,.size-btn,.mini-btn,'+
      '.nav-menu-btn,.submit-photo-btn,.video-play-btn,.payment-banner-btn';
    document.addEventListener('click',function(e){
      var target=e.target.closest(BTN_SELECTOR);
      if(!target)return;
      var rect=target.getBoundingClientRect();
      var cx=(typeof e.clientX==='number'&&e.clientX!==0)?e.clientX:rect.left+rect.width/2;
      var cy=(typeof e.clientY==='number'&&e.clientY!==0)?e.clientY:rect.top+rect.height/2;
      var x=cx-rect.left,y=cy-rect.top;
      if(getComputedStyle(target).position==='static')target.style.position='relative';
      target.style.overflow='hidden';
      var divotEl=document.createElement('span');
      divotEl.className='bci-divot';
      divotEl.style.left=x+'px';divotEl.style.top=y+'px';
      target.appendChild(divotEl);
      setTimeout(function(){divotEl.remove();},500);
    });
  })();

  /* ---------- flag-plant animation ---------- */
  function plantFlag(detail){
    var el=document.createElement('div');
    el.className='bci-flag-plant';
    var label=(detail&&detail.label)?detail.label:'Match final';
    el.innerHTML='<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#B0532B" '+
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
      '<path d="M12 21V4M12 4l8 3.5L12 11"/></svg><span class="bci-flag-label"></span>';
    el.querySelector('.bci-flag-label').textContent=label;
    document.body.appendChild(el);
    requestAnimationFrame(function(){el.classList.add('show');});
    setTimeout(function(){
      el.classList.remove('show');
      setTimeout(function(){el.remove();},400);
    },3200);
  }

  /* ---------- haptic buzz + flag-plant, driven by live-tracker events ---------- */
  window.addEventListener('bci:hole-event',function(){
    if(navigator.vibrate)navigator.vibrate(15);
  });
  window.addEventListener('bci:match-final',function(e){
    if(navigator.vibrate)navigator.vibrate([20,40,20]);
    plantFlag(e.detail);
  });

  /* ---------- scorecard-flip pull-to-refresh, touch only ---------- */
  if(isCoarse)(function pullRefresh(){
    var startY=null,pulling=false,triggered=false;
    var indicator=document.createElement('div');
    indicator.id='bci-pull-refresh';
    indicator.innerHTML='<div class="bci-pull-card">Turning the card&hellip;</div>';
    document.body.appendChild(indicator);

    document.addEventListener('touchstart',function(e){
      if(window.scrollY<=0){startY=e.touches[0].clientY;pulling=true;triggered=false;}
      else{startY=null;pulling=false;}
    },{passive:true});

    document.addEventListener('touchmove',function(e){
      if(!pulling||startY===null)return;
      var dy=e.touches[0].clientY-startY;
      if(dy>0){
        var pct=Math.min(1,dy/120);
        indicator.style.opacity=pct;
        indicator.style.transform='translateX(-50%) translateY('+(pct*16-10)+'px) rotateY('+(pct*180)+'deg)';
        if(dy>120&&!triggered)triggered=true;
      }
    },{passive:true});

    document.addEventListener('touchend',function(){
      if(triggered){
        indicator.style.transform='translateX(-50%) translateY(6px) rotateY(360deg)';
        setTimeout(function(){window.location.reload();},420);
      }else{
        indicator.style.opacity=0;
      }
      pulling=false;startY=null;
    },{passive:true});
  })();

  /* ---------- bottom tab bar, mobile only ---------- */
  (function bottomNav(){
    var path=(location.pathname.split('/').pop())||'index.html';
    var tabs=[
      {href:'index.html',label:'Home',match:['index.html',''],
        icon:'<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/>'},
      {href:'leaderboard.html',label:'Scores',match:['leaderboard.html'],
        icon:'<path d="M12 17.5V3.5l7 3.3-7 3.3"/><path d="M4.5 20.5c1.8-1.2 4.4-1.9 7.5-1.9s5.7.7 7.5 1.9"/>'},
      {href:'gallery.html',label:'Gallery',match:['gallery.html'],
        icon:'<path d="M3 8.5a2 2 0 0 1 2-2h2.2L8.8 4.5h6.4L16.8 6.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5z"/><circle cx="12" cy="12.5" r="3.4"/>'},
      {href:'kit.html',label:'Shop',match:['kit.html'],
        icon:'<path d="M15.7 3.5 20 5.6a1.5 1.5 0 0 1 .8 1.8l-1 3a1 1 0 0 1-1.3.6L17 10.3V19a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19v-8.7l-1.5.7a1 1 0 0 1-1.3-.6l-1-3a1.5 1.5 0 0 1 .8-1.8l4.3-2.1a3.6 3.6 0 0 0 7.4 0z"/>'}
    ];
    var nav=document.createElement('div');
    nav.id='bci-bottomnav';
    nav.innerHTML=tabs.map(function(t){
      var active=t.match.indexOf(path)!==-1;
      return '<a href="'+t.href+'"'+(active?' class="active"':'')+'>'+
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" '+
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+t.icon+'</svg>'+
        '<span>'+t.label+'</span></a>';
    }).join('');
    var bottomWrap=document.getElementById('bci-bottom-fixed-wrap');
    if(!bottomWrap){
      bottomWrap=document.createElement('div');
      bottomWrap.id='bci-bottom-fixed-wrap';
      document.body.appendChild(bottomWrap);
    }
    bottomWrap.appendChild(nav);
  })();

  /* ---------- add to calendar, any element with data-ics-date ---------- */
  (function addToCalendar(){
    function pad(n){return n<10?'0'+n:''+n;}
    function buildICS(item){
      var start=new Date(item.date+'T'+item.time+':00');
      var end=new Date(start.getTime()+(parseInt(item.duration,10)||30)*60000);
      function stamp(d){
        return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'T'+pad(d.getHours())+pad(d.getMinutes())+'00';
      }
      var now=new Date();
      var nowStamp=now.getUTCFullYear()+pad(now.getUTCMonth()+1)+pad(now.getUTCDate())+'T'+pad(now.getUTCHours())+pad(now.getUTCMinutes())+'00Z';
      var uid='bci-'+start.getTime()+'-'+Math.random().toString(36).slice(2)+'@bcinvitational.com';
      return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//BCI//Algarve 2027//EN','BEGIN:VEVENT',
        'UID:'+uid,'DTSTAMP:'+nowStamp,'DTSTART:'+stamp(start),'DTEND:'+stamp(end),
        'SUMMARY:'+item.title.replace(/,/g,'\\,'),'LOCATION:Algarve, Portugal',
        'DESCRIPTION:Book Club Invitational - Algarve 2027','END:VEVENT','END:VCALENDAR'
      ].join('\r\n');
    }
    document.addEventListener('click',function(e){
      var btn=e.target.closest('.ics-add-btn');
      if(!btn)return;
      var host=btn.closest('[data-ics-date]');
      if(!host)return;
      var item={date:host.dataset.icsDate,time:host.dataset.icsTime,
        duration:host.dataset.icsDuration,title:host.dataset.icsTitle||'BCI event'};
      var ics=buildICS(item);
      var blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a');
      a.href=url;
      a.download=item.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')+'.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function(){URL.revokeObjectURL(url);},2000);
    });
  })();

  /* ---------- offline fallback via service worker ---------- */
  if('serviceWorker' in navigator){
    window.addEventListener('load',function(){
      navigator.serviceWorker.register('sw.js').catch(function(){/* offline caching unavailable — site still works online */});
    });
  }

  /* ---------- push notifications: opt-in banner + Firebase/Supabase registration ---------- */
  (function pushNotifications(){
    if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))return;
    if(localStorage.getItem('bci_notify_dismissed')==='1')return;
    if(Notification.permission==='denied')return;
    if(Notification.permission==='granted')return;

    var FIREBASE_CONFIG={
      apiKey:'AIzaSyBHslzaSiXjCubkxoM5lQRIMaBeDM3r-h8',
      authDomain:'bci-notifications.firebaseapp.com',
      projectId:'bci-notifications',
      storageBucket:'bci-notifications.firebasestorage.app',
      messagingSenderId:'593261387998',
      appId:'1:593261387998:web:70eab1be9b6931873c624f'
    };
    var VAPID_KEY='BNMlGuHnlfoBjvJQHjAEL7WZXGIKeGwNpDwN7gVZPB8Ve-1yvoUPTBTjtZpgh51M67RWeA7olu9xQq1SWF3S2Mw';
    var SB_URL='https://ccczckdewwlpofgjigdi.supabase.co';
    var SB_KEY='sb_publishable_9ZVOAL9qqv8uaLBq-DM_iA_ODMnweui';

    function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
    function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;}
    function loadScript(src){
      return new Promise(function(resolve,reject){
        var s=document.createElement('script');
        s.src=src;s.onload=resolve;s.onerror=reject;
        document.head.appendChild(s);
      });
    }

    var needsInstallFirst=isIOS()&&!isStandalone();

    var el=document.createElement('div');
    el.id='bci-notify-banner';
    el.innerHTML=needsInstallFirst
      ? '<span>Add BCI to your Home Screen to get notified when scores update.</span>'
      : '<span>Get notified when scores update or tee times are set.</span><button id="bci-notify-btn">Enable</button>';
    var closeBtn=document.createElement('button');
    closeBtn.id='bci-notify-close';
    closeBtn.setAttribute('aria-label','Dismiss');
    closeBtn.innerHTML='&times;';
    el.appendChild(closeBtn);
    document.body.appendChild(el);

    closeBtn.addEventListener('click',function(){
      localStorage.setItem('bci_notify_dismissed','1');
      el.remove();
    });

    if(!needsInstallFirst){
      document.getElementById('bci-notify-btn').addEventListener('click',function(){
        var btn=this;
        btn.disabled=true;btn.textContent='Enabling...';
        Notification.requestPermission().then(function(perm){
          if(perm!=='granted'){
            localStorage.setItem('bci_notify_dismissed','1');
            btn.disabled=false;btn.textContent='Enable';
            return;
          }
          loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
            .then(function(){return loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');})
            .then(function(){return loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');})
            .then(function(){
              if(!window.firebase.apps.length)window.firebase.initializeApp(FIREBASE_CONFIG);
              var messaging=window.firebase.messaging();
              return navigator.serviceWorker.ready.then(function(reg){
                return messaging.getToken({vapidKey:VAPID_KEY,serviceWorkerRegistration:reg});
              });
            })
            .then(function(token){
              var sb=window.bciGetSupabase(SB_URL,SB_KEY);
              return sb.from('bci_push_subscriptions').upsert({token:token},{onConflict:'token'}).then(function(result){
                if(result.error)throw new Error(result.error.message||JSON.stringify(result.error));
                return result;
              });
            })
            .then(function(){
              localStorage.setItem('bci_notify_dismissed','1');
              el.innerHTML='<span>Notifications on \u2014 you\u2019re all set.</span>';
              setTimeout(function(){el.remove();},2500);
            })
            .catch(function(err){
              console.error('push enable failed',err);
              alert('Could not turn notifications on: '+(err&&err.message?err.message:'unknown error'));
              btn.disabled=false;btn.textContent='Enable';
            });
        });
      });
    }
  })();

  /* ---------- site-wide account widget: sign in / your name, everywhere, inline ---------- */
  (function accountWidget(){
    var nav=document.querySelector('nav');
    if(!nav)return;
    if(document.body.getAttribute('data-bci-no-account')==='true')return; // opt-out hook, unused by default

    var SUPABASE_URL='https://ccczckdewwlpofgjigdi.supabase.co';
    var SUPABASE_ANON_KEY='sb_publishable_9ZVOAL9qqv8uaLBq-DM_iA_ODMnweui';

    function loadScript(src){
      return new Promise(function(resolve,reject){
        var s=document.createElement('script');
        s.src=src;s.onload=resolve;s.onerror=reject;
        document.head.appendChild(s);
      });
    }
    function esc(s){
      return String(s==null?'':s).replace(/[&<>"']/g,function(c){
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
      });
    }

    var readyPromise=window.supabase?Promise.resolve():loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');

    readyPromise.then(function(){
      if(!window.supabase)return;
      var sb=window.bciGetSupabase(SUPABASE_URL,SUPABASE_ANON_KEY);
      var currentUser=null,currentName=null,pendingEmail=null;

      var wrap=document.createElement('div');
      wrap.id='bci-account-wrap';

      var btn=document.createElement('button');
      btn.id='bci-account-btn';
      btn.type='button';
      btn.textContent='Sign In';
      wrap.appendChild(btn);

      var panel=document.createElement('div');
      panel.id='bci-account-panel';
      panel.className='hidden';
      wrap.appendChild(panel);

      var logo=nav.querySelector('.nav-logo');
      var leftGroup=document.createElement('div');
      leftGroup.style.display='flex';
      leftGroup.style.alignItems='center';
      leftGroup.style.gap='0.75rem';
      if(logo&&logo.parentNode===nav){
        nav.insertBefore(leftGroup,logo);
        leftGroup.appendChild(logo);
      } else {
        nav.insertBefore(leftGroup,nav.firstChild);
      }
      leftGroup.appendChild(wrap);

      function renderSignedOut(){
        panel.innerHTML=
          '<p class="bci-ap-note">Sign in for kit orders and settling up — one code sent to your email, no password.</p>'+
          '<label class="bci-ap-label">Email</label>'+
          '<input type="email" id="bci-ap-email" placeholder="you@email.com">'+
          '<button class="bci-ap-btn" id="bci-ap-send">Send Me A Code</button>'+
          '<div class="bci-ap-status" id="bci-ap-status"></div>'+
          '<div id="bci-ap-code-row" class="hidden">'+
            '<label class="bci-ap-label">6-Digit Code</label>'+
            '<input type="text" inputmode="numeric" autocomplete="one-time-code" id="bci-ap-code" placeholder="123456" maxlength="10">'+
            '<button class="bci-ap-btn" id="bci-ap-verify">Verify &amp; Sign In</button>'+
          '</div>';
        document.getElementById('bci-ap-send').addEventListener('click',sendCode);
        document.getElementById('bci-ap-verify').addEventListener('click',verifyCode);
      }

      function renderSignedIn(){
        panel.innerHTML=
          '<div class="bci-ap-signedin">Signed in as <strong>'+esc(currentName||currentUser.email)+'</strong></div>'+
          '<div class="bci-ap-links">'+
            '<a href="kit.html">BCI Shop</a>'+
            '<a href="2027.html">Trip &amp; Balance</a>'+
          '</div>'+
          '<button class="bci-ap-signout" id="bci-ap-signout" type="button">Sign Out</button>';
        document.getElementById('bci-ap-signout').addEventListener('click',function(){sb.auth.signOut();});
      }

      function sendCode(){
        var email=document.getElementById('bci-ap-email').value.trim();
        var statusEl=document.getElementById('bci-ap-status');
        if(!email||email.indexOf('@')===-1){statusEl.textContent='Enter a valid email address.';statusEl.className='bci-ap-status error';return;}
        var sendBtn=document.getElementById('bci-ap-send');
        sendBtn.disabled=true;sendBtn.textContent='Sending...';
        statusEl.textContent='';statusEl.className='bci-ap-status';
        sb.auth.signInWithOtp({email:email}).then(function(res){
          sendBtn.disabled=false;sendBtn.textContent='Send Me A Code';
          if(res.error){
            statusEl.textContent='Could not send the code: '+res.error.message;
            statusEl.className='bci-ap-status error';
          } else {
            pendingEmail=email;
            statusEl.textContent='Code sent — check your email.';
            statusEl.className='bci-ap-status success';
            document.getElementById('bci-ap-code-row').classList.remove('hidden');
            document.getElementById('bci-ap-code').focus();
          }
        });
      }

      function verifyCode(){
        var code=document.getElementById('bci-ap-code').value.replace(/\D/g,'');
        var statusEl=document.getElementById('bci-ap-status');
        if(!pendingEmail){statusEl.textContent='Send yourself a code first.';statusEl.className='bci-ap-status error';return;}
        if(!code){statusEl.textContent='Enter the code from your email.';statusEl.className='bci-ap-status error';return;}
        var verifyBtn=document.getElementById('bci-ap-verify');
        verifyBtn.disabled=true;verifyBtn.textContent='Verifying...';
        sb.auth.verifyOtp({email:pendingEmail,token:code,type:'email'}).then(function(res){
          verifyBtn.disabled=false;verifyBtn.textContent='Verify & Sign In';
          if(res.error){
            statusEl.textContent='That code didn\u2019t work: '+res.error.message;
            statusEl.className='bci-ap-status error';
          }
        });
      }

      function applySession(session){
        if(session&&session.user){
          currentUser=session.user;
          btn.textContent='\u2022\u2022\u2022';
          sb.from('bci_profiles').select('name').eq('id',session.user.id).single().then(function(res){
            currentName=(res.data&&res.data.name)?res.data.name:session.user.email;
            btn.textContent=currentName.split(' ')[0];
          });
          renderSignedIn();
        } else {
          currentUser=null;currentName=null;
          btn.textContent='Sign In';
          renderSignedOut();
        }
      }

      btn.addEventListener('click',function(e){
        e.stopPropagation();
        panel.classList.toggle('hidden');
      });
      document.addEventListener('click',function(e){
        if(!wrap.contains(e.target))panel.classList.add('hidden');
      });

      sb.auth.getSession().then(function(res){applySession(res.data&&res.data.session);});
      sb.auth.onAuthStateChange(function(event,session){applySession(session);});
    }).catch(function(){/* Supabase failed to load — the rest of the site still works fine without the account widget */});
  })();

  /* ---------- site-wide scroll-reveal for card/list-row elements ----------
     Applies automatically to common repeating elements on every page — no
     class needs adding by hand anywhere. A MutationObserver (not just a
     one-time pass on load) is what makes this safe on pages like players.html
     or leaderboard.html where cards get completely rebuilt from scratch after
     load (sorting, live score updates, async photo fetches) — a plain
     querySelectorAll done once would lose the animation the moment any of
     those pages re-render their content. */
  (function(){
    if(!window.IntersectionObserver)return; // no support — content just shows normally, no animation, no harm
    var SELECTORS='.link-row,.player-card,.kit-card,.result-team,.comp-card,.entry-card,.history-item,.prizes-card';

    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){
          e.target.classList.add('bci-revealed');
          io.unobserve(e.target);
        }
      });
    },{threshold:0.1,rootMargin:'0px 0px -40px 0px'});

    function treat(el){
      if(el.classList.contains('fade-up')||el.classList.contains('bci-reveal'))return;
      el.classList.add('bci-reveal');
      var idx=el.parentNode?Array.prototype.indexOf.call(el.parentNode.children,el):0;
      el.style.transitionDelay=Math.min(Math.max(idx,0)*0.06,0.4)+'s';
      io.observe(el);
    }

    document.querySelectorAll(SELECTORS).forEach(treat);

    new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        m.addedNodes.forEach(function(node){
          if(node.nodeType!==1)return;
          if(node.matches&&node.matches(SELECTORS))treat(node);
          if(node.querySelectorAll)node.querySelectorAll(SELECTORS).forEach(treat);
        });
      });
    }).observe(document.body,{childList:true,subtree:true});
  })();

  /* ---------- quick fade-out before internal navigation ----------
     Every page already fades in on arrival (bci-page-in). This adds the
     other half — a brief fade-out right before navigating away — so moving
     between pages reads as one continuous motion rather than a hard cut.
     Deliberately narrow about what it intercepts: only same-origin links,
     no target=_blank, no modifier-clicks (people opening in a new tab),
     no downloads, no in-page anchors — anything else just navigates
     normally, untouched. */
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    document.addEventListener('click',function(e){
      if(e.defaultPrevented)return;
      var a=e.target.closest('a');
      if(!a)return;
      var href=a.getAttribute('href');
      if(!href||href.charAt(0)==='#')return;
      if(a.target&&a.target!==''&&a.target!=='_self')return;
      if(a.hasAttribute('download'))return;
      if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;
      var url;
      try{url=new URL(href,location.href);}catch(err){return;}
      if(url.origin!==location.origin)return;
      if(url.pathname===location.pathname&&url.hash)return; // in-page anchor
      e.preventDefault();
      document.body.style.transition='opacity 0.16s ease';
      document.body.style.opacity='0';
      setTimeout(function(){location.href=href;},150);
    });
  }

  /* ---------- add-to-home-screen nudge ----------
     Only for anyone not already running the installed app, and not shown
     again once dismissed once (remembered in localStorage). iOS has no
     native install prompt at all — Add to Home Screen only exists inside
     Safari's own Share sheet — so iOS gets short instructions instead of
     a button. Android/Chrome does support a native prompt, so that one
     gets a real one-tap Add button wired to it. */
  (function(){
    var isStandalone=window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches;
    if(isStandalone)return;
    if(localStorage.getItem('bci-a2hs-dismissed'))return;

    var isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
    var deferredPrompt=null;
    var banner=null;

    function positionBanner(){
      if(!banner)return;
      var wrap=document.getElementById('bci-bottom-fixed-wrap');
      var wrapH=wrap?wrap.getBoundingClientRect().height:0;
      banner.style.bottom=(wrapH+12)+'px';
    }

    function dismiss(){
      banner.classList.remove('visible');
      localStorage.setItem('bci-a2hs-dismissed','1');
      setTimeout(function(){if(banner)banner.remove();},300);
    }

    function showBanner(mode){
      banner=document.createElement('div');
      banner.id='bci-a2hs-banner';
      banner.innerHTML=
        '<div class="bci-a2hs-text">'+
          (mode==='ios'
            ?'Add BCI to your home screen \u2014 tap Share, then \u201cAdd to Home Screen\u201d'
            :'Add BCI to your home screen for the full app experience')+
        '</div>'+
        (mode==='android'?'<button class="bci-a2hs-btn" id="bci-a2hs-install">Add</button>':'')+
        '<button class="bci-a2hs-close" id="bci-a2hs-close" aria-label="Dismiss">&times;</button>';
      document.body.appendChild(banner);
      positionBanner();
      if(window.ResizeObserver){
        var wrap=document.getElementById('bci-bottom-fixed-wrap');
        if(wrap)new ResizeObserver(positionBanner).observe(wrap);
      }
      window.addEventListener('resize',positionBanner);
      requestAnimationFrame(function(){banner.classList.add('visible');});

      document.getElementById('bci-a2hs-close').addEventListener('click',dismiss);

      if(mode==='android'){
        document.getElementById('bci-a2hs-install').addEventListener('click',function(){
          if(!deferredPrompt){dismiss();return;}
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function(){
            deferredPrompt=null;
            dismiss();
          });
        });
      }
    }

    if(isIOS){
      setTimeout(function(){showBanner('ios');},2500);
    } else {
      window.addEventListener('beforeinstallprompt',function(e){
        e.preventDefault();
        deferredPrompt=e;
        setTimeout(function(){showBanner('android');},1500);
      });
    }
  })();
})();
