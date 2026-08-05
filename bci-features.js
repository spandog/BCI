/* ============================================================
   BCI shared features — golf ball (mouse + touch), fairway
   scroll progress bar, divot tap ripple, haptic buzz + flag-plant
   on live score events, and scorecard-flip pull-to-refresh.
   Include after live-tracker.js on every page:
   <script src="bci-features.js"></script>
   ============================================================ */
(function(){
  var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isCoarse=window.matchMedia('(pointer: coarse)').matches;

  /* ---------- fairway scroll progress bar ---------- */
  (function fairway(){
    var bar=document.createElement('div');
    bar.id='bci-fairway';
    bar.innerHTML='<div id="bci-fairway-fill"></div><div id="bci-fairway-ball"></div>';
    document.body.appendChild(bar);
    var fill=document.getElementById('bci-fairway-fill');
    var marker=document.getElementById('bci-fairway-ball');
    function update(){
      var h=document.documentElement;
      var scrollTop=h.scrollTop||document.body.scrollTop;
      var height=(h.scrollHeight-h.clientHeight)||1;
      var pct=Math.min(100,Math.max(0,(scrollTop/height)*100));
      fill.style.width=pct+'%';
      marker.style.left=pct+'%';
    }
    document.addEventListener('scroll',update,{passive:true});
    window.addEventListener('resize',update);
    update();
  })();

  /* ---------- golf ball, mouse hover or touch drag ---------- */
  if(!reduceMotion)(function ball(){
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
      if(e.pointerType==='mouse'){ wake(e.clientX,e.clientY,null); }
      else { wake(e.clientX,e.clientY,700); }
    },{passive:true});

    window.addEventListener('pointerdown',function(e){
      if(e.pointerType!=='mouse'){ wake(e.clientX,e.clientY,700); }
    },{passive:true});

    document.addEventListener('mouseleave',function(){
      if(!isCoarse){ wrap.style.opacity='0'; active=false; }
    });

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
})();
