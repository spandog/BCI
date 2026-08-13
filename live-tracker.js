/* ============================================================
   BCI live tracker — sitewide "who's up" rolling news-ticker bar.
   Always shows every fixture for both days (Day 1: 6 matches,
   Day 2: 12 matches), reading TIED for anything not yet started.
   Include with: <script src="live-tracker.js"></script>
   Reads the same bci_matches table used by leaderboard.html.
   ============================================================ */
(function(){
  var SB_URL='https://ccczckdewwlpofgjigdi.supabase.co';
  var SB_KEY='sb_publishable_9ZVOAL9qqv8uaLBq-DM_iA_ODMnweui';
  var POLL_MS=15000;
  var SELECT='id,match_no,day,format,status,leader,score,thru,holes,baber_players,weff_players';
  var PX_PER_SEC=55;          // ticker scroll speed
  var MAX_EVENTS=14;          // how many "newsflash" events to keep in the log
  var DAY_COUNTS={1:6,2:12};  // fixed fixture list, shown even before rows exist
  var DAY2_REVEAL=new Date('2027-04-24T00:00:00'); // Day 2 fixtures hidden until this local time
  var TRIP_START=new Date('2027-04-23T00:00:00');  // before this: show a placeholder, don't even poll
  var TRIP_END=new Date('2027-04-25T00:00:00');     // from this point on: show the final winner banner

  var prevById={};           // last-seen row per match id, for diffing
  var haveBaseline=false;    // suppress event-log spam on the very first fetch
  var allFinalNotified=false;
  var eventLog=[];           // rolling list of newsflash strings, newest first

  /* ---------- styles ---------- */
  var style=document.createElement('style');
  style.textContent =
    '#bci-bottom-fixed-wrap{position:fixed;left:0;right:0;bottom:0;z-index:9993;'+
      'padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:content-box;'+
      '-webkit-transform:translateZ(0);transform:translateZ(0);'+
      '-webkit-backface-visibility:hidden;backface-visibility:hidden;'+
      'will-change:transform;isolation:isolate;}'+
    '@media(max-width:640px){'+
      '#bci-bottom-fixed-wrap{position:absolute;bottom:auto;}'+
    '}'+
    '#bci-tracker-bar{position:static;left:0;right:0;z-index:500;'+
      'background:#16291d;border-top:1px solid rgba(201,168,76,0.3);'+
      'display:none;align-items:stretch;height:42px;'+
      'font-family:"Public Sans",Arial,sans-serif;overflow:hidden;}'+
    '#bci-tracker-bar.visible{display:flex;}'+
    '#bci-tracker-bar .bt-status{font-family:"Lora",Georgia,serif;'+
      'font-size:0.62rem;letter-spacing:2px;text-transform:uppercase;font-weight:700;'+
      'color:#16291d;background:#c9a84c;padding:0 14px;flex-shrink:0;'+
      'display:flex;align-items:center;white-space:nowrap;}'+
    '#bci-tracker-bar .bt-status.pulsing{animation:bci-pulse 1.6s ease-in-out infinite;}'+
    '@keyframes bci-pulse{0%,100%{opacity:1;}50%{opacity:0.55;}}'+
    '#bci-tracker-bar .bt-viewport{flex:1;position:relative;overflow:hidden;'+
      'display:flex;align-items:center;}'+
    '#bci-tracker-bar .bt-track{position:absolute;left:0;top:0;height:100%;'+
      'display:flex;align-items:center;white-space:nowrap;will-change:transform;}'+
    '#bci-tracker-bar .bt-item{display:inline-flex;align-items:center;color:rgba(255,255,255,0.85);'+
      'font-size:0.85rem;padding:0 1.5rem;white-space:nowrap;}'+
    '#bci-tracker-bar .bt-item .gold{color:#ddc27e;font-weight:600;}'+
    '#bci-tracker-bar .bt-item .dot{color:#c9a84c;margin-right:1.5rem;}'+
    '#bci-tracker-bar a.bt-link{color:inherit;text-decoration:none;flex-shrink:0;'+
      'display:flex;align-items:center;padding:0 14px;border-left:1px solid rgba(201,168,76,0.25);'+
      'font-family:"Lora",Georgia,serif;font-size:0.6rem;letter-spacing:2px;'+
      'text-transform:uppercase;color:rgba(255,255,255,0.5);white-space:nowrap;}'+
    '#bci-tracker-bar a.bt-link:hover{color:#c9a84c;}'+
    '@media(max-width:640px){#bci-tracker-bar a.bt-link{display:none;}}'+
    '#bci-toast-stack{position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:600;'+
      'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;'+
      'width:100%;padding:0 1rem;box-sizing:border-box;}'+
    '.bci-toast{background:#16291d;border:1px solid rgba(201,168,76,0.4);border-radius:6px;'+
      'padding:0.7rem 1.1rem;font-family:"Public Sans",Arial,sans-serif;font-size:0.85rem;'+
      'color:rgba(255,255,255,0.9);box-shadow:0 8px 24px rgba(0,0,0,0.28);'+
      'opacity:0;transform:translateY(-14px);transition:opacity 0.35s ease,transform 0.35s ease;'+
      'max-width:400px;margin:0 auto;text-align:center;}'+
    '.bci-toast.show{opacity:1;transform:translateY(0);}'+
    '.bci-toast .gold{color:#ddc27e;font-weight:600;font-family:"Lora",Georgia,serif;'+
      'letter-spacing:1px;}';
  document.head.appendChild(style);

  /* ---------- shared fixed wrap, also used by bci-features.js's bottom-nav ---------- */
  function getBottomWrap(){
    var wrap=document.getElementById('bci-bottom-fixed-wrap');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.id='bci-bottom-fixed-wrap';
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  /* ---------- bar markup ---------- */
  var bar=document.createElement('div');
  bar.id='bci-tracker-bar';
  bar.innerHTML =
    '<span class="bt-status" id="bt-status">Day 1</span>'+
    '<div class="bt-viewport"><div class="bt-track" id="bt-track"></div></div>'+
    '<a class="bt-link" href="leaderboard.html">Full Leaderboard \u2192</a>';
  var bottomWrap=getBottomWrap();
  bottomWrap.insertBefore(bar,bottomWrap.firstChild);
  var track=document.getElementById('bt-track');

  /* ---------- toast markup ---------- */
  var toastStack=document.createElement('div');
  toastStack.id='bci-toast-stack';
  document.body.appendChild(toastStack);
  var toastQueue=[];
  var toastShowing=false;

  function pushToast(html){
    toastQueue.push(html);
    processToastQueue();
  }

  function processToastQueue(){
    if(toastShowing||!toastQueue.length)return;
    toastShowing=true;
    var html=toastQueue.shift();
    var el=document.createElement('div');
    el.className='bci-toast';
    el.innerHTML=html;
    toastStack.appendChild(el);
    requestAnimationFrame(function(){el.classList.add('show');});
    setTimeout(function(){
      el.classList.remove('show');
      setTimeout(function(){
        el.remove();
        toastShowing=false;
        processToastQueue();
      },350);
    },4000);
  }

  function showBar(){
    bar.classList.add('visible');
  }

  /* The wrap is position:fixed on desktop now (so the ticker stays visible
     while scrolling, same as it always did before mobile PWA quirks forced
     a different approach there) — being fixed takes it out of normal flow,
     so body needs padding-bottom to stop real content sitting behind it.
     Now applies the same way on every screen size — position:sticky turned
     out to not reliably engage at all on his real device despite computing
     correctly, so mobile now uses the identical fixed approach as desktop,
     which has been solid throughout. The notify banner is separately fixed
     too, so it always needs to clear the wrap. */
  if(window.ResizeObserver){
    var syncBottomSpacing=function(){
      var wrapH=bottomWrap.getBoundingClientRect().height;
      document.body.style.paddingBottom=wrapH+'px';
      var banner=document.getElementById('bci-notify-banner');
      if(banner)banner.style.bottom=(wrapH+12)+'px';
    };
    new ResizeObserver(syncBottomSpacing).observe(bottomWrap);
    window.addEventListener('resize',syncBottomSpacing);
  }

  /* Stop trusting native position:fixed to get this right on its own —
     confirmed across several rounds that something in how iOS handles a
     fixed element pinned right at the true bottom edge is unreliable
     specifically in installed-PWA mode, even though the exact mechanism
     isn't fully pinned down. On mobile the wrap is position:absolute
     instead (see the CSS above) — deliberately not position:fixed at all,
     since fixed is the one thing every failed attempt so far had in
     common. Absolute doesn't auto-track the viewport the way fixed does,
     so this loop does the full positioning job itself: every single
     animation frame, for as long as the page is open, it works out where
     the bottom of the currently-visible screen actually is in document
     coordinates and places the wrap exactly there. Not reacting to
     scroll/resize events (which can lag or gap during fast momentum
     scrolling) — just continuously recalculating, so there's never a
     window where it can be wrong. Desktop stays on plain position:fixed,
     already proven reliable, untouched by any of this. */
  var mobileMQ=window.matchMedia('(max-width:640px)');
  if(window.visualViewport&&mobileMQ.matches){
    var vv=window.visualViewport;
    var lastTop=null;
    var pinLoop=function(){
      if(!mobileMQ.matches){requestAnimationFrame(pinLoop);return;}
      var scrollY=window.scrollY||document.documentElement.scrollTop||0;
      var wrapH=bottomWrap.offsetHeight;
      var top=Math.round(scrollY+vv.height+vv.offsetTop-wrapH);
      if(top!==lastTop){
        bottomWrap.style.top=top+'px';
        lastTop=top;
      }
      requestAnimationFrame(pinLoop);
    };
    requestAnimationFrame(pinLoop);
  }

  function fmtPts(n){
    var whole=Math.floor(n);
    if(n%1===0.5)return whole===0?'\u00BD':whole+'\u00BD';
    return String(n);
  }
  function ordinal(n){
    var s=['th','st','nd','rd'],v=n%100;
    return n+(s[(v-20)%10]||s[v]||s[0]);
  }
  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function pushEvent(html){
    eventLog.unshift(html);
    if(eventLog.length>MAX_EVENTS)eventLog.length=MAX_EVENTS;
  }

  /* ---------- diff a single match's holes string, log newsflash events ---------- */
  function diffHoles(row,prevRow){
    var oldHoles=(prevRow&&prevRow.holes)||'';
    var newHoles=row.holes||'';
    if(newHoles.length>oldHoles.length){
      var added=newHoles.slice(oldHoles.length);
      for(var i=0;i<added.length;i++){
        var holeNo=oldHoles.length+i+1;
        var ch=added[i];
        var label=ordinal(holeNo)+' hole';
        var matchLabel='Day '+esc(row.day)+', Match '+esc(row.match_no);
        if(ch==='h'){
          pushEvent('<span class="gold">D'+esc(row.day)+' M'+esc(row.match_no)+'</span>&nbsp; the '+label+' is halved');
          pushToast('<span class="gold">'+matchLabel+'</span><br>the '+label+' is halved');
        } else {
          var winner=ch==='b'?'BLUE TEAM':'GREEN TEAM';
          pushEvent('<span class="gold">D'+esc(row.day)+' M'+esc(row.match_no)+'</span>&nbsp; '+winner+' win the '+label);
          pushToast('<span class="gold">'+winner+'</span> win the '+label+'<br>'+matchLabel);
        }
        window.dispatchEvent(new CustomEvent('bci:hole-event',{detail:{day:row.day,match_no:row.match_no}}));
      }
    }
    if(row.status==='final'&&(!prevRow||prevRow.status!=='final')){
      var line=row.leader==='tie'
        ? 'D'+esc(row.day)+' M'+esc(row.match_no)+' IS HALVED'
        : (row.leader==='baber'?'BLUE TEAM':'GREEN TEAM')+' WIN D'+esc(row.day)+' M'+esc(row.match_no)+' '+esc(row.score).toUpperCase();
      pushEvent('<span class="gold">RESULT</span>&nbsp; '+line);
      var finalMatchLabel='Day '+esc(row.day)+', Match '+esc(row.match_no);
      var toastLine=row.leader==='tie'
        ? finalMatchLabel+' is halved'
        : '<span class="gold">'+(row.leader==='baber'?'BLUE TEAM':'GREEN TEAM')+'</span> win '+finalMatchLabel+' '+esc(row.score).toUpperCase();
      pushToast(toastLine);
      window.dispatchEvent(new CustomEvent('bci:match-final',{detail:{
        label:finalMatchLabel+(row.leader==='tie'?' halved':' — '+(row.leader==='baber'?'Blue':'Green')+' win '+esc(row.score).toUpperCase())
      }}));
    }
  }

  /* ---------- full fixture line for every match of both days ---------- */
  function fixtureLine(day,n,row){
    var label='Day '+day+', Match '+n;
    var hasNames=row&&row.baber_players&&row.weff_players;

    if(!row||row.status==='upcoming'){
      if(hasNames){
        return label+': '+esc(row.baber_players)+' vs '+esc(row.weff_players);
      }
      return label+': <span class="gold">TIED</span>';
    }
    if(row.status==='live'){
      var names=row.leader==='baber'?row.baber_players:(row.leader==='weff'?row.weff_players:'');
      var txt=row.leader==='tie'
        ? 'ALL SQUARE THRU '+esc(row.thru)
        : (names?esc(names)+' ':'')+esc(row.score).toUpperCase()+' THRU '+esc(row.thru);
      return label+': '+txt;
    }
    // final
    var wtxt=row.leader==='tie'
      ? 'HALVED'
      : (row.leader==='baber'?'BLUE':'GREEN')+' WIN '+esc(row.score).toUpperCase();
    return label+': <span class="gold">'+wtxt+'</span>';
  }

  function buildFixtures(rows){
    var byDay={1:{},2:{}};
    rows.forEach(function(r){
      if(!byDay[r.day])byDay[r.day]={};
      byDay[r.day][r.match_no]=r;
    });
    var visibleDays=[1];
    if(new Date()>=DAY2_REVEAL)visibleDays.push(2);
    var items=[];
    visibleDays.forEach(function(day){
      var count=DAY_COUNTS[day]||0;
      for(var n=1;n<=count;n++){
        items.push(fixtureLine(day,n,byDay[day][n]));
      }
    });
    return items;
  }

  /* ---------- build the full ticker content ---------- */
  function buildTicker(rows){
    var finals=rows.filter(function(r){return r.status==='final';});
    var b=0,w=0;
    finals.forEach(function(r){
      if(r.leader==='baber')b+=1;
      else if(r.leader==='weff')w+=1;
      else{b+=0.5;w+=0.5;}
    });

    var totalMatches=DAY_COUNTS[1]+DAY_COUNTS[2];
    var items=[];
    items.push('<span class="gold">BABER '+fmtPts(b)+' \u2013 '+fmtPts(w)+' WEFF</span>');
    items=items.concat(buildFixtures(rows));
    eventLog.forEach(function(ev){items.push(ev);});

    if(finals.length&&finals.length===totalMatches&&rows.length===totalMatches){
      var line=b>w?'BLUE TEAM WIN THE BCI!':(w>b?'GREEN TEAM WIN THE BCI!':'THE BCI IS HALVED!');
      items.unshift('<span class="gold">\uD83C\uDFC6 '+line+'</span>');
    }
    return items;
  }

  function currentDayLabel(rows){
    var totalMatches=DAY_COUNTS[1]+DAY_COUNTS[2];
    var finals=rows.filter(function(r){return r.status==='final';}).length;
    if(finals===totalMatches&&rows.length===totalMatches)return 'Final';
    if(new Date()>=DAY2_REVEAL)return 'Day 2';
    return 'Day 1';
  }

  var scrollState={raf:null,x:0,widthOne:0,lastKey:null};

  function stopScroll(){
    if(scrollState.raf)cancelAnimationFrame(scrollState.raf);
    scrollState.raf=null;
  }

  function startScroll(){
    stopScroll();
    var w=scrollState.widthOne;
    if(!w)return;
    var last=null;
    function step(ts){
      if(last===null)last=ts;
      var dt=(ts-last)/1000;
      last=ts;
      scrollState.x-=PX_PER_SEC*dt;
      while(scrollState.x<=-w)scrollState.x+=w;
      track.style.transform='translateX('+scrollState.x+'px)';
      scrollState.raf=requestAnimationFrame(step);
    }
    scrollState.raf=requestAnimationFrame(step);
  }

  function renderTicker(items){
    if(!items.length){
      track.innerHTML='';
      stopScroll();
      scrollState.lastKey=null;
      return;
    }
    var key=items.join('|');
    if(key===scrollState.lastKey)return; // content unchanged — leave the scroll running untouched
    scrollState.lastKey=key;

    // a short list (e.g. one placeholder message) makes too narrow a belt for the
    // loop trick below to look smooth — pad it out with repeats first
    var padded=items;
    while(padded.length<12)padded=padded.concat(items);

    var htmlOne=padded.map(function(t){
      return '<span class="bt-item"><span class="dot">\u25C6</span>'+t+'</span>';
    }).join('');
    var prevX=scrollState.x;
    var prevW=scrollState.widthOne;
    track.innerHTML=htmlOne+htmlOne; // duplicate for a seamless loop
    requestAnimationFrame(function(){
      scrollState.widthOne=track.getBoundingClientRect().width/2;
      // carry over how far through the loop we already were, rather than
      // snapping back to the start every time the data refreshes
      if(prevW){
        var progress=((prevX%prevW)+prevW)%prevW;
        scrollState.x=-(progress/prevW)*scrollState.widthOne;
      } else {
        scrollState.x=0;
      }
      track.style.transform='translateX('+scrollState.x+'px)';
      startScroll();
    });
  }

  /* ---------- render bar state ---------- */
  function render(rows){
    document.getElementById('bt-status').textContent=currentDayLabel(rows);
    showBar();
    renderTicker(buildTicker(rows));
  }

  /* ---------- fetch + diff ---------- */
  function refresh(){
    var now=new Date();

    if(now<TRIP_START){
      showBar();
      document.getElementById('bt-status').textContent='';
      renderTicker(['<span class="gold">SCORES WILL BE DISPLAYED HERE</span>']);
      return; // nothing to poll for yet — no point hitting Supabase before the trip starts
    }

    fetch(SB_URL+'/rest/v1/bci_matches?select='+SELECT,{
      headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}
    }).then(function(r){return r.json();}).then(function(rows){
      if(!Array.isArray(rows))return;
      if(haveBaseline){
        rows.forEach(function(row){diffHoles(row,prevById[row.id]);});
      }
      var byId={};
      rows.forEach(function(row){byId[row.id]=row;});
      prevById=byId;
      haveBaseline=true;

      if(new Date()>=TRIP_END){
        var b=0,w=0;
        rows.filter(function(r){return r.status==='final';}).forEach(function(r){
          if(r.leader==='baber')b+=1;
          else if(r.leader==='weff')w+=1;
          else{b+=0.5;w+=0.5;}
        });
        var line=b>w?'BLUE TEAM WINS THE BCI INVITATIONAL'
          :(w>b?'GREEN TEAM WINS THE BCI INVITATIONAL':'THE BCI INVITATIONAL IS HALVED');
        showBar();
        document.getElementById('bt-status').textContent='Final';
        renderTicker(['<span class="gold">\uD83C\uDFC6 '+line+'</span>']);
        return;
      }

      render(rows);
    }).catch(function(){/* stay on last known state if the fetch fails */});
  }

  refresh();
  setInterval(refresh,POLL_MS);
  window.addEventListener('resize',function(){
    if(track.scrollWidth)scrollState.widthOne=track.getBoundingClientRect().width/2;
  });

  /* ---------- optional realtime push, on top of polling ---------- */
  (function tryRealtime(){
    if(!window.supabase){
      var s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload=subscribeRealtime;
      document.head.appendChild(s);
    } else {
      subscribeRealtime();
    }
  })();

  function subscribeRealtime(){
    try{
      var client=window.supabase.createClient(SB_URL,SB_KEY);
      client.channel('bci_tracker_'+Math.random().toString(36).slice(2))
        .on('postgres_changes',{event:'*',schema:'public',table:'bci_matches'},refresh)
        .subscribe();
    }catch(e){/* realtime unavailable — the 15s poll still covers it */}
  }

  /* ============================================================
     TEMPORARY — real-device diagnostic panel for the bottom-bar
     saga. Shows the actual numbers this device reports rather than
     what any CSS is predicting. Safe to delete this whole block
     (down to the matching })(); at the very end) once we're done
     with it — nothing else in the file depends on it.
     ============================================================ */
  function bciShowDebugPanel(){
    var panel=document.createElement('div');
    panel.id='bci-debug-panel';
    panel.style.cssText='position:fixed;top:0;left:0;right:0;z-index:999999;'+
      'background:rgba(0,0,0,0.92);color:#0f0;font-family:monospace;font-size:11px;'+
      'padding:10px;line-height:1.5;max-height:70vh;overflow-y:auto;white-space:pre-wrap;';
    document.body.appendChild(panel);

    function px(v){return v===undefined||v===null?'n/a':Math.round(v*100)/100+'px';}

    function readSafeAreaBottom(){
      var probe=document.createElement('div');
      probe.style.cssText='position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px);';
      document.body.appendChild(probe);
      var v=getComputedStyle(probe).paddingBottom;
      document.body.removeChild(probe);
      return v;
    }

    function render(){
      var wrap=document.getElementById('bci-bottom-fixed-wrap');
      var ticker=document.getElementById('bci-tracker-bar');
      var nav=document.getElementById('bci-bottomnav');
      var wrapR=wrap?wrap.getBoundingClientRect():null;
      var tickerR=ticker?ticker.getBoundingClientRect():null;
      var navR=nav?nav.getBoundingClientRect():null;
      var vv=window.visualViewport;

      var lines=[];
      lines.push('=== BCI DEBUG '+new Date().toLocaleTimeString()+' ===');
      lines.push('standalone (installed PWA): '+(window.navigator.standalone===true));
      lines.push('window.innerHeight: '+px(window.innerHeight));
      lines.push('documentElement.clientHeight: '+px(document.documentElement.clientHeight));
      lines.push('visualViewport.height: '+(vv?px(vv.height):'not supported'));
      lines.push('visualViewport.offsetTop: '+(vv?px(vv.offsetTop):'n/a'));
      lines.push('safe-area-inset-bottom (env): '+readSafeAreaBottom());
      lines.push('');
      lines.push('#bci-bottom-fixed-wrap:');
      lines.push('  computed position: '+(wrap?getComputedStyle(wrap).position:'MISSING'));
      lines.push('  rect top/bottom/h: '+(wrapR?px(wrapR.top)+' / '+px(wrapR.bottom)+' / '+px(wrapR.height):'n/a'));
      lines.push('  gap below wrap (window.innerHeight - wrap.bottom): '+(wrapR?px(window.innerHeight-wrapR.bottom):'n/a'));
      lines.push('#bci-tracker-bar rect: '+(tickerR?px(tickerR.top)+' / '+px(tickerR.bottom)+' / h='+px(tickerR.height):'n/a'));
      lines.push('#bci-bottomnav rect: '+(navR?px(navR.top)+' / '+px(navR.bottom)+' / h='+px(navR.height):'n/a (hidden on desktop)'));
      lines.push('gap between ticker bottom and nav top: '+((tickerR&&navR)?px(navR.top-tickerR.bottom):'n/a'));
      lines.push('wrap correction transform (new fix): '+(wrap?getComputedStyle(wrap).transform:'n/a'));
      lines.push('');
      lines.push('body computed paddingBottom: '+getComputedStyle(document.body).paddingBottom);
      lines.push('body scrollHeight vs innerHeight: '+px(document.body.scrollHeight)+' vs '+px(window.innerHeight));
      lines.push('window.scrollY: '+px(window.scrollY));
      lines.push('');
      lines.push('(scroll to bottom of page, this panel keeps updating)');
      panel.textContent=lines.join('\n');
    }

    render();
    window.addEventListener('resize',render);
    window.addEventListener('scroll',render);
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize',render);
      window.visualViewport.addEventListener('scroll',render);
    }
    setInterval(render,1000);
  }
  bciShowDebugPanel();
  /* ============================================================
     END TEMPORARY DIAGNOSTIC PANEL
     ============================================================ */
})();
