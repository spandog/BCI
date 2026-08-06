/* ============================================================
   BCI shared features — golf ball (mouse + touch), divot tap
   ripple, haptic buzz + flag-plant on live score events, and
   scorecard-flip pull-to-refresh.
   Include after live-tracker.js on every page:
   <script src="bci-features.js"></script>
   ============================================================ */
(function(){
  var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isCoarse=window.matchMedia('(pointer: coarse)').matches;

  /* ---------- custom cursor: golf flag (precise) + trailing ball, mouse only ---------- */
  if(!reduceMotion&&!isCoarse)(function customCursor(){
    var flag=document.createElement('div');
    flag.id='bci-flag-cursor';
    flag.setAttribute('aria-hidden','true');
    flag.innerHTML='<svg viewBox="0 0 24 36" width="22" height="33">'+
      '<ellipse cx="12" cy="32" rx="7" ry="2.6" fill="#20303b" opacity="0.85"/>'+
      '<line x1="12" y1="30" x2="12" y2="4" stroke="#20303b" stroke-width="1.6" stroke-linecap="round"/>'+
      '<path d="M12 4 L12 15 L22 9 Z" fill="#b0532b"/></svg>';
    document.body.appendChild(flag);

    var ball=document.createElement('div');
    ball.id='bci-ball-wrap';
    ball.setAttribute('aria-hidden','true');
    ball.innerHTML='<svg viewBox="0 0 20 20" width="16" height="16">'+
      '<circle cx="10" cy="10" r="9" fill="#f7f4ea" stroke="rgba(32,48,59,0.2)" stroke-width="0.6"/>'+
      '<circle cx="6" cy="6" r="1" fill="rgba(32,48,59,0.15)"/><circle cx="10" cy="5" r="1" fill="rgba(32,48,59,0.15)"/>'+
      '<circle cx="14" cy="6" r="1" fill="rgba(32,48,59,0.15)"/><circle cx="5" cy="10" r="1" fill="rgba(32,48,59,0.15)"/>'+
      '<circle cx="10" cy="10" r="1" fill="rgba(32,48,59,0.15)"/><circle cx="15" cy="10" r="1" fill="rgba(32,48,59,0.15)"/>'+
      '<circle cx="6" cy="14" r="1" fill="rgba(32,48,59,0.15)"/><circle cx="10" cy="15" r="1" fill="rgba(32,48,59,0.15)"/>'+
      '<circle cx="14" cy="14" r="1" fill="rgba(32,48,59,0.15)"/></svg>';
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
      '<circle cx="10" cy="10" r="9" fill="#f7f4ea" stroke="rgba(32,48,59,0.2)" stroke-width="0.6"/>'+
      '<circle cx="6" cy="6" r="1" fill="rgba(32,48,59,0.15)"/><circle cx="10" cy="5" r="1" fill="rgba(32,48,59,0.15)"/>'+
      '<circle cx="14" cy="6" r="1" fill="rgba(32,48,59,0.15)"/><circle cx="5" cy="10" r="1" fill="rgba(32,48,59,0.15)"/>'+
      '<circle cx="10" cy="10" r="1" fill="rgba(32,48,59,0.15)"/><circle cx="15" cy="10" r="1" fill="rgba(32,48,59,0.15)"/>'+
      '<circle cx="6" cy="14" r="1" fill="rgba(32,48,59,0.15)"/><circle cx="10" cy="15" r="1" fill="rgba(32,48,59,0.15)"/>'+
      '<circle cx="14" cy="14" r="1" fill="rgba(32,48,59,0.15)"/></svg>';
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
    document.body.appendChild(nav);
    document.body.classList.add('bci-bottomnav-padded');
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
})();
