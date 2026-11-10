(function(){
  /* ================= CONFIG ================= */
  var SUPABASE_URL='https://ccczckdewwlpofgjigdi.supabase.co';
  var SUPABASE_ANON_KEY='sb_publishable_9ZVOAL9qqv8uaLBq-DM_iA_ODMnweui';

  /* This page's own script runs before live-tracker.js/bci-features.js
     load, so the shared-client helper needs defining here too — same
     idempotent pattern, safe regardless of which script actually runs
     first. See live-tracker.js for the full explanation. */
  window.bciGetSupabase=window.bciGetSupabase||function(url,key){
    /* If the Supabase library script itself failed to load — a blocked
       CDN, no connection, a restrictive preview sandbox — window.supabase
       won't exist at all. Fail quietly here rather than throwing, so the
       rest of the page can fall back to its "not connected" state instead
       of a script error stopping everything else on the page too. */
    if(!window.supabase||typeof window.supabase.createClient!=='function')return null;
    if(!window.__bciSbClient)window.__bciSbClient=window.supabase.createClient(url,key);
    return window.__bciSbClient;
  };
  var WIN_NOTE='First to 9\u00BD points wins the BCI';
  var POLL_MS=30000;
  /* ========================================== */

  var COURSES={1:'Pairs',2:'Singles'};
  var ADMIN_PASS='bciadmin2027';

  /* ---------- push notifications ---------- */
  /* This URL is deterministic from the Supabase project ref + function name,
     so it's already correct once the Edge Function is deployed as "send-push".
     Until it's actually deployed, calls below will just fail silently and
     get swallowed by the .catch() — nothing on the site breaks either way. */
  var PUSH_ENDPOINT='https://ccczckdewwlpofgjigdi.supabase.co/functions/v1/clever-action';
  var PUSH_SHARED_SECRET='7SjV_F5D-zpwPHUZ2uL7KLTnoxkTawiaeiTWILS6uA0';

  function sendPushEvent(type,payload){
    if(!PUSH_ENDPOINT)return;
    fetch(PUSH_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-BCI-Push-Secret':PUSH_SHARED_SECRET},
      body:JSON.stringify({type:type,payload:payload})
    }).catch(function(){/* push send failed — scores/matches are already saved regardless */});
  }
  var state={day:1,role:'scorer',scoringId:null,matches:[],lastData:''};
  var sb=null;

  var configured=SUPABASE_URL.indexOf('http')===0;
  if(configured){
    sb=window.bciGetSupabase(SUPABASE_URL,SUPABASE_ANON_KEY);
    if(!sb){
      configured=false;
      document.getElementById('config-warning').classList.add('visible');
    }
  } else {
    document.getElementById('config-warning').classList.add('visible');
  }

  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  document.getElementById('win-note').textContent=WIN_NOTE;

  /* ---------- match play maths ----------
     holes is a string like 'bwhb' where each character is one hole:
     b = Baber won it, w = Weff won it, h = halved. */
  function calc(m){
    var holes=m.holes||'';
    var b=0,w=0,n=holes.length;
    for(var i=0;i<n;i++){
      if(holes[i]==='b')b++;
      else if(holes[i]==='w')w++;
    }
    var diff=b-w,rem=18-n,abs=Math.abs(diff);
    var closed=n>0&&(abs>rem||n===18);
    var out={
      played:n,
      leader:diff>0?'baber':(diff<0?'weff':'tie'),
      manualFinal:m.status==='final'&&!closed
    };
    if(n===0&&m.status!=='final'){
      out.status='upcoming';out.score='';out.thru='';
    } else if(closed||m.status==='final'){
      out.status='final';
      out.thru=n===18?'F':String(n);
      if(diff===0)out.score='Halved';
      else if(n===18||m.status==='final'&&!closed&&abs<=rem)out.score=abs+' UP';
      else out.score=abs+'&'+rem;
    } else {
      out.status='live';
      out.thru=String(n);
      out.score=diff===0?'AS':abs+' UP';
    }
    return out;
  }

  /* ---------- nav menu ---------- */
  document.getElementById('menu-btn').addEventListener('click',function(){
    document.getElementById('menu-btn').classList.toggle('open');
    document.getElementById('dropdown').classList.toggle('open');
  });
  document.addEventListener('click',function(e){
    if(!e.target.closest('#menu-btn')&&!e.target.closest('#dropdown')){
      document.getElementById('menu-btn').classList.remove('open');
      document.getElementById('dropdown').classList.remove('open');
    }
  });

  /* ---------- day tabs ---------- */
  document.getElementById('tab-1').addEventListener('click',function(){switchDay(1);});

  document.getElementById('rc-share-btn').addEventListener('click',function(){
    var p=points();
    var baberTotal=p.baber+p.baberLive;
    var weffTotal=p.weff+p.weffLive;
    var text='Book Club Invitational \u2014 Algarve 2027\n'
      +'Blue '+fmtPts(baberTotal)+' \u2013 '+fmtPts(weffTotal)+' Green\n'
      +'First to 9\u00BD points wins the BCI';
    var url=location.origin+location.pathname;
    var btn=this;

    if(navigator.share){
      navigator.share({title:'BCI Standings',text:text,url:url}).catch(function(){});
    } else if(navigator.clipboard){
      navigator.clipboard.writeText(text+'\n'+url).then(function(){
        var original=btn.innerHTML;
        btn.innerHTML='<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg> Copied';
        setTimeout(function(){btn.innerHTML=original;},1600);
      }).catch(function(){});
    }
  });
  document.getElementById('tab-2').addEventListener('click',function(){switchDay(2);});
  function dayFormat(d){return d===1?'Better Ball':'Individual Matchplay';}

  /* ---------- day recap — a shareable image built from real results ----------
     Every figure on this card comes straight from that day's finished
     matches: the tally, the closest match, the biggest win, and whoever's
     won the most holes. Nothing here is invented or estimated. */
  function dayRecapData(day){
    var finals=state.matches.filter(function(m){return m.day===day&&m.status==='final';});
    var isPlaceholder=function(m){return /pair \d|player \d/i.test(m.baber_players||'')||/pair \d|player \d/i.test(m.weff_players||'');};
    var real=finals.filter(function(m){return !isPlaceholder(m);});

    var baberPts=0,weffPts=0;
    var margins=[];
    var holesWon={};
    real.forEach(function(m){
      var holes=m.holes||'';
      var b=0,w=0;
      for(var i=0;i<holes.length;i++){
        if(holes[i]==='b'){b++;holesWon[m.baber_players]=(holesWon[m.baber_players]||0)+1;}
        else if(holes[i]==='w'){w++;holesWon[m.weff_players]=(holesWon[m.weff_players]||0)+1;}
      }
      if(m.leader==='baber')baberPts+=1;
      else if(m.leader==='weff')weffPts+=1;
      else{baberPts+=0.5;weffPts+=0.5;}
      if(m.leader!=='tie'){
        margins.push({margin:Math.abs(b-w)+(18-holes.length),score:m.score,
          winner:m.leader==='baber'?m.baber_players:m.weff_players,
          loser:m.leader==='baber'?m.weff_players:m.baber_players});
      }
    });

    var closest=margins.length?margins.slice().sort(function(a,b2){return a.margin-b2.margin;})[0]:null;
    var biggest=margins.length?margins.slice().sort(function(a,b2){return b2.margin-a.margin;})[0]:null;
    var inFormEntries=Object.keys(holesWon).map(function(k){return {name:k,val:holesWon[k]};}).sort(function(a,b2){return b2.val-a.val;});
    var inForm=inFormEntries.length?inFormEntries[0]:null;

    return {
      played:real.length,total:finals.length,baberPts:baberPts,weffPts:weffPts,
      closest:closest,biggest:biggest,inForm:inForm,matches:real
    };
  }

  function namesFrom(str){
    return (str||'').split('&').map(function(s){return s.trim();}).filter(Boolean);
  }

  function lastNames(str){
    if(/pair \d|player \d/i.test(str||''))return 'TBC';
    return namesFrom(str).map(function(n){
      var parts=n.split(' ');
      return esc(parts[parts.length-1]);
    }).join(' &amp; ');
  }

  function renderSummaryTable(){
    var rowsEl=document.getElementById('summary-rows');
    var tallyEl=document.getElementById('summary-tally');
    if(!configured){
      rowsEl.innerHTML='<div class="empty-note">Leaderboard not connected yet.</div>';
      tallyEl.innerHTML='';
      return;
    }
    var list=dayMatches();
    if(!list.length){
      rowsEl.innerHTML='<div class="empty-note"><svg class="empty-illo" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="32" cy="54" rx="22" ry="4"/><line x1="32" y1="54" x2="32" y2="14" class="flag-part"/><path d="M32 14 48 20 32 26Z" class="flag-part" fill="currentColor"/><circle cx="46" cy="48" r="4"/></svg>No matches yet for Day '+state.day+' &mdash; '+COURSES[state.day]+'.</div>';
      tallyEl.innerHTML='';
      return;
    }
    var blueLeading=0,greenLeading=0;
    rowsEl.innerHTML=list.map(function(m){
      var c=calc(m);
      var mid;
      if(c.status==='upcoming'){
        mid='<div class="sr-thru">'+(m.tee_time?'Tee '+esc(m.tee_time):'Upcoming')+'</div>';
      } else if(c.status==='final'){
        mid='<div class="sr-margin '+(c.leader==='tie'?'tie':c.leader)+'">'+(c.leader==='tie'?'AS':esc(c.score))+'</div><div class="sr-thru">Final</div>';
        if(c.leader==='baber')blueLeading++;else if(c.leader==='weff')greenLeading++;
      } else if(c.leader==='tie'){
        mid='<div class="sr-margin tie">AS</div><div class="sr-thru">Thru '+esc(c.thru)+'</div>';
      } else {
        mid='<div class="sr-margin '+c.leader+'">'+esc(c.score)+'</div><div class="sr-thru">Thru '+esc(c.thru)+'</div>';
        if(c.leader==='baber')blueLeading++;else greenLeading++;
      }
      var baberLead=c.status!=='upcoming'&&c.leader==='baber';
      var weffLead=c.status!=='upcoming'&&c.leader==='weff';
      return '<div class="summary-row" data-id="'+esc(m.id)+'">'
        +'<div class="sr-spacer" aria-hidden="true"></div>'
        +'<div class="sr-pairing'+(baberLead?' leading lead-baber':'')+'">'+lastNames(m.baber_players)+'</div>'
        +'<div class="sr-mid">'+mid+'</div>'
        +'<div class="sr-pairing sr-right'+(weffLead?' leading lead-weff':'')+'">'+lastNames(m.weff_players)+'</div>'
        +'<button class="sr-edit" data-id="'+esc(m.id)+'" aria-label="Enter score" title="Enter score">'
          +'<svg class="icon" aria-hidden="true"><use href="#i-edit"/></svg></button>'
        +'</div>';
    }).join('');
    tallyEl.innerHTML='<span class="st-blue">Blue leading '+blueLeading+'</span><span class="st-green">Green leading '+greenLeading+'</span>';
    Array.prototype.forEach.call(rowsEl.querySelectorAll('.sr-edit'),function(btn){
      btn.addEventListener('click',function(){openScoreView(btn.dataset.id);});
    });
  }


  /* ---------- Birdie Board — open to everyone, no admin needed. Shows
     the running tally and recent log for every birdie/eagle/hole in one
     logged from the score-entry screen, right on the leaderboard itself
     rather than a separate page. */
  var BB_TYPE_LABEL={birdie:'Birdie',eagle:'Eagle',hole_in_one:'Hole in One'};

  function renderBirdieBoard(rows){
    var totals={};
    rows.forEach(function(r){totals[r.player_name]=(totals[r.player_name]||0)+Number(r.amount);});
    var entries=Object.keys(totals).map(function(name){return {name:name,total:totals[name]};})
      .sort(function(a,b){return b.total-a.total;});
    var tallyEl=document.getElementById('bb-tally');
    tallyEl.innerHTML=entries.length
      ? entries.map(function(e,i){
          return '<div class="bb-tally-row"><span class="bb-rank">'+(i+1)+'</span>'
            +'<span class="bb-name">'+esc(e.name)+'</span>'
            +'<span class="bb-amt">\u00A3'+e.total.toFixed(2).replace(/\.00$/,'')+'</span></div>';
        }).join('')
      : '<div class="bb-empty">Nothing logged yet.</div>';

    var logEl=document.getElementById('bb-log');
    var sorted=rows.slice().sort(function(a,b){return new Date(b.created_at)-new Date(a.created_at);}).slice(0,8);
    logEl.innerHTML=sorted.length
      ? sorted.map(function(r){
          return '<div class="bb-log-row"><div><div class="bb-log-who">'+esc(r.player_name)+'</div>'
            +'<div class="bb-log-what">Day '+r.day+' &middot; Hole '+r.hole+'</div></div>'
            +'<div style="display:flex;align-items:center;gap:0.4rem;">'
            +'<div class="bb-log-amt">'+(BB_TYPE_LABEL[r.achievement_type]||r.achievement_type)+'</div>'
            +'<span class="bb-log-delete" data-id="'+esc(r.id)+'" title="Remove — mislogged">&times;</span>'
            +'</div></div>';
        }).join('')
      : '<div class="bb-empty">Nothing logged yet.</div>';

    Array.prototype.forEach.call(logEl.querySelectorAll('.bb-log-delete'),function(btn){
      btn.addEventListener('click',function(){
        var id=btn.dataset.id;
        if(!confirm('Remove this entry? Use this if it was logged by mistake.'))return;
        if(!sb)return;
        sb.from('bci_kitty_log').delete().eq('id',id).then(function(res){
          if(res.error){alert('Could not remove: '+res.error.message);return;}
          if(window.bciToast)window.bciToast('Entry removed.');
          loadBirdieBoard();
        });
      });
    });
  }

  function loadBirdieBoard(){
    if(!sb)return;
    sb.from('bci_kitty_log').select('*').then(function(res){
      if(res.error||!res.data)return;
      renderBirdieBoard(res.data);
    }).catch(function(){/* best effort — the toggle still opens either way */});
  }

  document.getElementById('birdie-board-toggle').addEventListener('click',function(){
    var willOpen=!document.getElementById('birdie-board-panel').classList.contains('visible');
    document.getElementById('birdie-board-panel').classList.toggle('visible',willOpen);
    this.classList.toggle('open',willOpen);
    if(willOpen)loadBirdieBoard();
  });

  function loadImage(url){
    return new Promise(function(resolve){
      if(!url){resolve(null);return;}
      var img=new Image();
      img.crossOrigin='anonymous';
      var done=false;
      img.onload=function(){if(!done){done=true;resolve(img);}};
      img.onerror=function(){if(!done){done=true;resolve(null);}};
      img.src=url;
      // A single slow or unreachable photo should never hold up the whole
      // recap — fall back to the initials treatment for that one player
      // rather than leaving the person waiting indefinitely for a share.
      setTimeout(function(){if(!done){done=true;resolve(null);}},4000);
    });
  }

  function drawDayRecap(day){
    var data=dayRecapData(day);
    var neededNames={};
    data.matches.forEach(function(m){
      namesFrom(m.baber_players).concat(namesFrom(m.weff_players)).forEach(function(n){neededNames[n]=true;});
    });
    var names=Object.keys(neededNames);
    return Promise.all([
      document.fonts.ready,
      Promise.all(names.map(function(n){return loadImage(PLAYER_PHOTOS[n]);}))
    ]).then(function(results){
      var photoImgs={};
      names.forEach(function(n,i){photoImgs[n]=results[1][i];});

      var W=1080;
      var maxWidth=W-280;

      function wrapLines(ctx,text,font){
        ctx.font=font;
        var words=text.split(' ');
        var lines=[];
        var current='';
        words.forEach(function(word){
          var test=current?current+' '+word:word;
          if(ctx.measureText(test).width>maxWidth&&current){
            lines.push(current);
            current=word;
          } else {
            current=test;
          }
        });
        if(current)lines.push(current);
        return lines;
      }

      function drawCircle(ctx,name,cx,cy,r){
        var img=photoImgs[name];
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx,cy,r,0,Math.PI*2);
        ctx.closePath();
        ctx.clip();
        if(img){
          var side=Math.min(img.width,img.height);
          var sx=(img.width-side)/2,sy=(img.height-side)/2;
          ctx.drawImage(img,sx,sy,side,side,cx-r,cy-r,r*2,r*2);
        } else {
          ctx.fillStyle='#16291d';
          ctx.fillRect(cx-r,cy-r,r*2,r*2);
          ctx.fillStyle='#c9a84c';
          ctx.font='700 '+Math.round(r*0.85)+'px "Lora"';
          ctx.textAlign='center';
          ctx.textBaseline='middle';
          ctx.fillText(initials(name),cx,cy+1);
          ctx.textBaseline='alphabetic';
        }
        ctx.restore();
        ctx.strokeStyle='rgba(201,168,76,0.5)';
        ctx.lineWidth=1.5;
        ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
      }

      // Draws one finished match's row: each side's player photo(s),
      // their names, and the result in the middle — mirroring the same
      // compact match-row layout now used on the leaderboard itself,
      // just rendered onto canvas with real photos rather than <img> tags.
      function matchRow(ctx,y,m){
        var r=26;
        var spacing=46;
        var leftNames=namesFrom(m.baber_players);
        var rightNames=namesFrom(m.weff_players);
        var leftX=210,rightX=W-210;

        leftNames.forEach(function(n,i){
          drawCircle(ctx,n,leftX-(leftNames.length-1-i)*spacing,y,r);
        });
        rightNames.forEach(function(n,i){
          drawCircle(ctx,n,rightX+i*spacing,y,r);
        });

        ctx.textAlign='left';
        ctx.fillStyle=m.leader==='baber'?'#ffffff':'rgba(255,255,255,0.55)';
        ctx.font=(m.leader==='baber'?'700 ':'400 ')+'26px "Public Sans"';
        ctx.fillText(lastNamesPlain(m.baber_players),leftX+50,y+9);

        ctx.textAlign='right';
        ctx.fillStyle=m.leader==='weff'?'#ffffff':'rgba(255,255,255,0.55)';
        ctx.font=(m.leader==='weff'?'700 ':'400 ')+'26px "Public Sans"';
        ctx.fillText(lastNamesPlain(m.weff_players),rightX-50,y+9);

        ctx.textAlign='center';
        ctx.fillStyle='#c9a84c';
        ctx.font='700 26px "Lora"';
        ctx.fillText(m.leader==='tie'?'AS':m.score,W/2,y-6);
        ctx.fillStyle='rgba(255,255,255,0.4)';
        ctx.font='400 18px "Public Sans"';
        ctx.fillText('FINAL',W/2,y+22);

        return y+82;
      }

      function lastNamesPlain(str){
        return namesFrom(str).map(function(n){
          var parts=n.split(' ');
          return parts[parts.length-1];
        }).join(' & ');
      }

      // Draws the whole card onto whatever canvas/context is passed in,
      // returning the final y position — run once against a throwaway
      // canvas purely to measure how tall the real content needs, then
      // run again for real on a canvas sized exactly to fit it. Text
      // wrapping means the content height genuinely varies with how long
      // real player names turn out to be, so a fixed canvas size would
      // either cut things off or leave an awkward gap at the bottom.
      function draw(ctx,H){
        ctx.fillStyle='#16291d';
        ctx.fillRect(0,0,W,H);

        ctx.textAlign='center';
        ctx.fillStyle='#c9a84c';
        ctx.font='600 30px "Lora"';
        ctx.fillText('ALGARVE \u00B7 2027',W/2,110);

        ctx.fillStyle='#ffffff';
        ctx.font='800 68px "Lora"';
        ctx.fillText('Day '+day+' Recap',W/2,200);

        ctx.fillStyle='rgba(255,255,255,0.55)';
        ctx.font='400 28px "Public Sans"';
        ctx.fillText(DAY_COURSE[day]||'',W/2,245);

        ctx.strokeStyle='rgba(201,168,76,0.3)';
        ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(140,300);ctx.lineTo(W-140,300);ctx.stroke();

        ctx.fillStyle='#4a7fb5';
        ctx.font='800 90px "Lora"';
        ctx.textAlign='right';
        ctx.fillText(fmtPts(data.baberPts),W/2-30,420);
        ctx.fillStyle='#5a9c75';
        ctx.textAlign='left';
        ctx.fillText(fmtPts(data.weffPts),W/2+30,420);
        ctx.fillStyle='rgba(255,255,255,0.4)';
        ctx.font='400 32px "Public Sans"';
        ctx.textAlign='center';
        ctx.fillText('BLUE',W/2-155,420);
        ctx.fillText('GREEN',W/2+165,420);
        ctx.font='400 24px "Public Sans"';
        ctx.fillStyle='rgba(255,255,255,0.45)';
        ctx.fillText(data.played+' of '+data.total+' matches finished',W/2,475);

        var y=560;

        if(data.matches.length){
          ctx.textAlign='left';
          ctx.fillStyle='#c9a84c';
          ctx.font='600 24px "Lora"';
          ctx.fillText('MATCH RESULTS',140,y);
          y+=50;
          data.matches.forEach(function(m){
            y=matchRow(ctx,y,m);
          });
          y+=20;
          ctx.strokeStyle='rgba(201,168,76,0.3)';
          ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(140,y);ctx.lineTo(W-140,y);ctx.stroke();
          y+=50;
        }

        function section(label,value,sub){
          ctx.textAlign='left';
          ctx.fillStyle='#c9a84c';
          ctx.font='600 24px "Lora"';
          ctx.fillText(label.toUpperCase(),140,y);
          y+=48;
          var valueFont='700 34px "Lora"';
          var lines=wrapLines(ctx,value,valueFont);
          ctx.fillStyle='#ffffff';
          ctx.font=valueFont;
          lines.forEach(function(line){
            ctx.fillText(line,140,y);
            y+=40;
          });
          if(sub){
            ctx.fillStyle='rgba(255,255,255,0.5)';
            ctx.font='400 24px "Public Sans"';
            ctx.fillText(sub,140,y+2);
            y+=36;
          }
          y+=40;
        }

        if(data.closest){
          section('Closest Match',data.closest.winner+' beat '+data.closest.loser,data.closest.score);
        }
        if(data.biggest&&data.biggest!==data.closest){
          section('Biggest Win',data.biggest.winner+' beat '+data.biggest.loser,data.biggest.score);
        }
        if(data.inForm){
          section(day===1?'Best Pair':'In Form',data.inForm.name,data.inForm.val+' holes won today');
        }
        if(!data.closest&&!data.inForm){
          ctx.textAlign='center';
          ctx.fillStyle='rgba(255,255,255,0.5)';
          ctx.font='400 28px "Public Sans"';
          ctx.fillText('No matches finished yet today.',W/2,y+20);
          y+=60;
        }

        ctx.textAlign='center';
        ctx.fillStyle='rgba(255,255,255,0.35)';
        ctx.font='600 22px "Lora"';
        ctx.fillText('BOOK CLUB INVITATIONAL',W/2,y+50);

        return y+90;
      }

      var scratch=document.createElement('canvas');
      scratch.width=W;scratch.height=3000;
      var finalH=draw(scratch.getContext('2d'),3000);

      var canvas=document.createElement('canvas');
      canvas.width=W;canvas.height=finalH;
      draw(canvas.getContext('2d'),finalH);

      return new Promise(function(resolve){
        canvas.toBlob(function(blob){resolve(blob);},'image/png');
      });
    });
  }

  document.getElementById('day-recap-btn').addEventListener('click',function(){
    var btn=this;
    var day=state.day;
    btn.disabled=true;
    var original=btn.innerHTML;
    btn.innerHTML='Building recap&hellip;';

    drawDayRecap(day).then(function(blob){
      btn.disabled=false;btn.innerHTML=original;
      var file=new File([blob],'bci-day-'+day+'-recap.png',{type:'image/png'});
      if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
        navigator.share({files:[file],title:'BCI Day '+day+' Recap'}).catch(function(){});
      } else {
        var url=URL.createObjectURL(blob);
        var a=document.createElement('a');
        a.href=url;a.download='bci-day-'+day+'-recap.png';
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(function(){URL.revokeObjectURL(url);},2000);
      }
    }).catch(function(){
      btn.disabled=false;btn.innerHTML=original;
      alert('Could not build the recap image — try again.');
    });
  });

  /* Swipe left/right on the match list to move between days — the tab
     buttons still work exactly as before, this is just an additional way
     in for anyone used to swiping between tabs on a phone. Checks the
     dominant direction of the gesture so a mostly-vertical scroll never
     gets mistaken for a day switch. */
  (function(){
    var el=document.getElementById('summary-panel');
    if(!el)return;
    var startX=null,startY=null,tracking=false;
    el.addEventListener('touchstart',function(e){
      startX=e.touches[0].clientX;startY=e.touches[0].clientY;tracking=true;
    },{passive:true});
    el.addEventListener('touchend',function(e){
      if(!tracking||startX===null)return;
      tracking=false;
      var dx=e.changedTouches[0].clientX-startX;
      var dy=e.changedTouches[0].clientY-startY;
      if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.5)return;
      if(dx<0&&state.day===1)switchDay(2);
      else if(dx>0&&state.day===2)switchDay(1);
    },{passive:true});
  })();

  function switchDay(d,onDone){
    var el=document.getElementById('summary-panel');
    var direction=d>state.day?1:-1;
    var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    state.day=d;
    document.getElementById('tab-1').classList.toggle('active',d===1);
    document.getElementById('tab-2').classList.toggle('active',d===2);
    var indicator=document.getElementById('day-tab-indicator');
    if(indicator)indicator.style.transform='translateX('+(d===2?'100%':'0%')+')';
    if(reduceMotion||!el){
      renderMatches();
      renderScorer(true);
      if(onDone)onDone();
      return;
    }
    el.style.transition='opacity 0.16s ease,transform 0.16s ease';
    el.style.opacity='0';
    el.style.transform='translateX('+(direction*14)+'px)';
    setTimeout(function(){
      renderMatches();
      renderScorer(true);
      el.style.transition='none';
      el.style.transform='translateX('+(-direction*14)+'px)';
      requestAnimationFrame(function(){
        el.style.transition='opacity 0.22s ease,transform 0.22s ease';
        el.style.opacity='1';
        el.style.transform='translateX(0)';
      });
      if(onDone)onDone();
    },160);
  }

  function goToMatch(id){
    var m=findMatch(id);
    if(!m)return;
    function land(){
      requestAnimationFrame(function(){
        var row=document.querySelector('.summary-row[data-id="'+id+'"]');
        if(!row)return;
        row.scrollIntoView({behavior:'smooth',block:'center'});
        row.classList.add('just-landed');
        setTimeout(function(){row.classList.remove('just-landed');},1600);
      });
    }
    if(m.day!==state.day)switchDay(m.day,land);
    else land();
  }

  /* ---------- act on a notification deep link (?match=id or ?day=1) ---------- */
  var deepLinkPending=true;
  function handleDeepLink(){
    if(!deepLinkPending)return;
    deepLinkPending=false;
    var params=new URLSearchParams(window.location.search);
    var matchId=params.get('match');
    var day=params.get('day');
    if(matchId){
      goToMatch(matchId);
    } else if(day){
      var d=parseInt(day,10);
      if(d===1||d===2)switchDay(d);
    }
  }

  /* ---------- data ---------- */
  function loadMatches(triggerSheetCheck){
    if(!sb)return;
    sb.from('bci_matches').select('*').order('day').order('match_no').order('created_at')
      .then(function(res){
        if(res.error)throw new Error(res.error.message||'load failed');
        state.lastFetchSuccess=Date.now();
        setOfflineBanner(false);
        var fresh=JSON.stringify(res.data);
        if(fresh===state.lastData)return;
        state.lastData=fresh;
        state.matches=res.data||[];
        renderBanner();
        renderMatches();
        renderScorer(true);
        if(state.scoringId)renderScoreView();
        if(triggerSheetCheck)checkMatchSheets();
        handleDeepLink();
      })
      .catch(function(){
        // A genuine first load with nothing to show yet — there's nothing
        // useful to keep on screen, so the plain message is the best we
        // can do. But if real scores are already showing (very plausibly
        // someone mid-round who's just lost signal), leave them exactly
        // as they are rather than wiping out something still useful, and
        // show a small offline note instead.
        if(!state.matches.length){
          document.getElementById('summary-rows').innerHTML='<div class="empty-note">Could not load the leaderboard. Check the connection and refresh.</div>';
          return;
        }
        setOfflineBanner(true);
      });
  }

  function fmtTimeAgo(ts){
    var secs=Math.floor((Date.now()-ts)/1000);
    if(secs<60)return 'just now';
    var mins=Math.floor(secs/60);
    if(mins<60)return mins+' minute'+(mins===1?'':'s')+' ago';
    var hrs=Math.floor(mins/60);
    return hrs+' hour'+(hrs===1?'':'s')+' ago';
  }

  function setOfflineBanner(isOffline){
    var el=document.getElementById('offline-banner');
    if(!el)return;
    if(!isOffline){
      if(state.wasOffline){
        state.wasOffline=false;
        el.classList.add('reconnected');
        el.textContent='Back online \u2014 scores updated';
        setTimeout(function(){
          el.style.display='none';
          el.classList.remove('reconnected');
        },2500);
      } else {
        el.style.display='none';
      }
      return;
    }
    state.wasOffline=true;
    el.classList.remove('reconnected');
    el.style.display='block';
    el.textContent='Offline \u2014 showing scores as of '+(state.lastFetchSuccess?fmtTimeAgo(state.lastFetchSuccess):'last connection');
  }


  /* ---------- match day sheet — auto-generated graphic once a day's lineup is complete ---------- */
  var ROSTER=[
    {name:'James Baber',hcap:'23'},{name:'Kane Bailey',hcap:'22'},{name:'Mark Brackenridge',hcap:'21'},
    {name:'Tony Bryant',hcap:'13'},{name:'Aaron Davies',hcap:'13'},{name:'Will Dodgson',hcap:'23'},
    {name:'Matt Higgins',hcap:'25'},{name:'Brian Hinojosa',hcap:'10.0'},{name:'Rich Horsley',hcap:'23'},
    {name:'Ted Keeling',hcap:'5.6'},{name:'Louis Kelly',hcap:'11.8'},{name:'Sean Mongan',hcap:'24'},
    {name:'Dan Simkin',hcap:'5.7'},{name:'Jack Taggart',hcap:'6'},{name:'Alex Tinawi',hcap:'7.2'},
    {name:'Matt Wreford',hcap:'16'}
  ];
  var DAY_COURSE={1:'Quinta do Vale Golf Course',2:'Isla Canela Links Course'};

  function findRosterPlayer(fragment){
    fragment=(fragment||'').trim();
    if(!fragment)return null;
    var surname=fragment.split(/\s+/).pop().replace(/[^a-zA-Z'-]/g,'');
    if(!surname)return null;
    var re=new RegExp('\\b'+surname+'\\b','i');
    for(var i=0;i<ROSTER.length;i++){if(re.test(ROSTER[i].name))return ROSTER[i];}
    return null;
  }
  function resolvePlayers(str){
    return (str||'').split(/\s*(?:&|,| and )\s*/i).map(function(s){return s.trim();}).filter(Boolean).map(function(tok){
      var p=findRosterPlayer(tok);
      return p?{name:p.name,hcap:p.hcap}:{name:tok,hcap:null};
    });
  }
  function matchesForDay(day){
    return state.matches.filter(function(m){return m.day===day;});
  }
  function dayComplete(day){
    var ms=matchesForDay(day);
    if(!ms.length)return false;
    return ms.every(function(m){
      return (m.baber_players||'').trim()&&(m.weff_players||'').trim()&&(m.tee_time||'').trim();
    });
  }

  var sheetTriggered={1:false,2:false};

  function checkMatchSheets(){
    if(state.role!=='admin')return;
    [1,2].forEach(function(day){
      var complete=dayComplete(day);
      if(complete&&!sheetTriggered[day]){
        sheetTriggered[day]=true;
        downloadMatchSheet(day);
      } else if(!complete){
        sheetTriggered[day]=false;
      }
    });
  }

  async function loadCanvasFonts(){
    try{
      await Promise.all([
        document.fonts.load('700 44px Fraunces'),
        document.fonts.load('600 24px Fraunces'),
        document.fonts.load('600 15px Fraunces'),
        document.fonts.load('400 15px "IBM Plex Sans"'),
        document.fonts.load('600 14px "IBM Plex Sans"')
      ]);
    }catch(e){/* fonts unavailable — canvas falls back to system fonts */}
  }

  function groupByTeeTime(ms){
    var groups=[],map={};
    ms.forEach(function(m){
      var key=(m.tee_time||'').trim()||('_solo'+m.match_no);
      if(!map[key]){map[key]={tee_time:m.tee_time,matches:[]};groups.push(map[key]);}
      map[key].matches.push(m);
    });
    return groups;
  }

  async function buildMatchSheetCanvas(day){
    await loadCanvasFonts();
    var ms=matchesForDay(day).slice().sort(function(a,b){return a.match_no-b.match_no;});
    var groups=groupByTeeTime(ms);
    var NAVY='#16291d',SAND='#fbfaf7',SANDD='#f0ede4',RUST='#b0532b',RUSTL='#c9a84c',
        BORDER='#dcd6c8',INK='#16291d',MUTED='#5c6259',WHITE='#ffffff';
    var W=1000,HEADER=270,FOOTER=70;
    var GROUP_HEAD=38,MATCH_LABEL=24,BOX_H=118,INNER_GAP=14,GROUP_GAP=28;

    var bodyH=0;
    groups.forEach(function(g){
      bodyH+=GROUP_HEAD;
      g.matches.forEach(function(m,mi){
        bodyH+=MATCH_LABEL+BOX_H;
        if(mi<g.matches.length-1)bodyH+=INNER_GAP;
      });
      bodyH+=GROUP_GAP;
    });
    var H=HEADER+bodyH+FOOTER;
    var canvas=document.createElement('canvas');
    canvas.width=W;canvas.height=H;
    var ctx=canvas.getContext('2d');

    ctx.fillStyle=SAND;ctx.fillRect(0,0,W,H);
    ctx.fillStyle=NAVY;ctx.fillRect(0,0,W,HEADER);

    ctx.textAlign='left';ctx.fillStyle=RUST;ctx.font="700 26px Fraunces, Georgia, serif";
    ctx.fillText('B C I',40,54);

    ctx.textAlign='center';
    ctx.fillStyle=WHITE;ctx.font="700 42px Fraunces, Georgia, serif";
    ctx.fillText('BOOK CLUB INVITATIONAL',W/2,120);

    ctx.fillStyle=RUSTL;ctx.font="600 15px Fraunces, Georgia, serif";
    ctx.fillText((dayFormat(day)+'  ·  Day '+day).toUpperCase(),W/2,158);
    ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font="400 15px \"IBM Plex Sans\", Arial, sans-serif";
    ctx.fillText(DAY_COURSE[day]||'',W/2,186);

    ctx.strokeStyle=RUST;ctx.lineWidth=2;ctx.setLineDash([9,7]);
    ctx.beginPath();ctx.moveTo(0,HEADER-1);ctx.lineTo(W,HEADER-1);ctx.stroke();
    ctx.setLineDash([]);

    var boxLeft=40,boxRight=W-40,boxW=boxRight-boxLeft,mid=boxLeft+boxW/2;
    var y=HEADER;
    groups.forEach(function(g){
      ctx.textAlign='left';ctx.fillStyle=MUTED;ctx.font="600 13px \"IBM Plex Sans\", Arial, sans-serif";
      ctx.fillText(g.tee_time?('TEE  '+g.tee_time):'',boxLeft,y+24);
      y+=GROUP_HEAD;

      g.matches.forEach(function(m,mi){
        var baber=resolvePlayers(m.baber_players);
        var weff=resolvePlayers(m.weff_players);
        var boxTop=y+MATCH_LABEL;

        ctx.textAlign='left';ctx.fillStyle=RUST;ctx.font="600 14px Fraunces, Georgia, serif";
        ctx.fillText(('MATCH '+m.match_no).toUpperCase(),boxLeft,y+16);

        ctx.fillStyle=WHITE;ctx.strokeStyle=BORDER;ctx.lineWidth=1;
        roundRect(ctx,boxLeft,boxTop,boxW,BOX_H,6);ctx.fill();ctx.stroke();

        ctx.strokeStyle=BORDER;ctx.beginPath();ctx.moveTo(mid,boxTop);ctx.lineTo(mid,boxTop+BOX_H);ctx.stroke();

        drawTeamHalf(ctx,baber,boxLeft,boxTop,boxW/2,BOX_H,'left',RUST,INK,MUTED,NAVY,WHITE);
        drawTeamHalf(ctx,weff,mid,boxTop,boxW/2,BOX_H,'right',RUST,INK,MUTED,NAVY,WHITE);

        ctx.fillStyle=RUST;ctx.beginPath();ctx.arc(mid,boxTop+BOX_H/2,17,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=WHITE;ctx.font="700 12px Fraunces, Georgia, serif";ctx.textAlign='center';
        ctx.fillText('VS',mid,boxTop+BOX_H/2+4);

        y=boxTop+BOX_H+(mi<g.matches.length-1?INNER_GAP:0);
      });
      y+=GROUP_GAP;
    });

    ctx.textAlign='center';ctx.fillStyle=MUTED;ctx.font="600 12px Fraunces, Georgia, serif";
    ctx.fillText('BCINVITATIONAL.COM',W/2,H-28);

    return canvas;
  }

  function drawTeamHalf(ctx,players,x,y,w,h,align,rust,ink,muted,navy,white){
    var cx=x+w/2;
    ctx.textAlign='center';
    ctx.fillStyle=muted;ctx.font="600 11px Fraunces, Georgia, serif";
    var teamLabel=align==='left'?'BLUE TEAM':'GREEN TEAM';
    ctx.fillText(teamLabel,cx,y+22);

    var step=42;
    var startY=players.length>1?(y+h/2-16):(y+h/2+6);
    players.forEach(function(p,i){
      var ny=startY+i*step;
      ctx.fillStyle=ink;ctx.font="600 18px Fraunces, Georgia, serif";
      ctx.fillText(p.name,cx,ny);
      if(p.hcap){
        ctx.fillStyle=rust;ctx.font="400 13px \"IBM Plex Sans\", Arial, sans-serif";
        ctx.fillText('Handicap '+p.hcap,cx,ny+18);
      }
    });
  }

  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function downloadMatchSheet(day){
    buildMatchSheetCanvas(day).then(function(canvas){
      canvas.toBlob(function(blob){
        var url=URL.createObjectURL(blob);
        var a=document.createElement('a');
        a.href=url;a.download='bci-day'+day+'-match-sheet.png';
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(function(){URL.revokeObjectURL(url);},4000);
      },'image/png');
    });
  }

  function points(){
    var b=0,w=0,bLive=0,wLive=0;
    state.matches.forEach(function(m){
      var c=calc(m);
      if(c.status==='final'){
        if(c.leader==='baber')b+=1;
        else if(c.leader==='weff')w+=1;
        else {b+=0.5;w+=0.5;}
      } else if(c.status==='live'){
        if(c.leader==='baber')bLive+=1;
        else if(c.leader==='weff')wLive+=1;
        else if(c.leader==='tie'){bLive+=0.5;wLive+=0.5;}
      }
    });
    return {baber:b,weff:w,baberLive:bLive,weffLive:wLive};
  }

  function fmtPts(n){
    var whole=Math.floor(n);
    return (n%1===0.5)?(whole===0?'\u00BD':whole+'\u00BD'):String(n);
  }

  var TOTAL_POINTS=18,RETAIN_AT=9,WIN_AT=9.5;

  var lastBarPcts=null;
  /* One-time celebration the moment the BCI is actually won — a confetti
     burst and a brief announcement. Tracked in localStorage so it can only
     ever fire once for real, no matter how many times the page is
     reloaded or revisited afterwards. */
  function celebrate(winner){
    var teamName=winner==='weff'?'Green Team':'Blue Team';
    var teamColor=winner==='weff'?'#2f7d4f':'#1e5a8c';
    var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var overlay=document.createElement('div');
    overlay.id='bci-celebration';
    overlay.innerHTML=
      '<div class="bci-celebration-card">'+
        '<svg class="bci-celebration-trophy" viewBox="0 0 24 24" fill="none" stroke="'+teamColor+'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+
          '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/>'+
          '<path d="M7 6H4.2a1 1 0 0 0-1 1.1c.2 1.9 1.6 3.2 3.8 3.3M17 6h2.8a1 1 0 0 1 1 1.1c-.2 1.9-1.6 3.2-3.8 3.3"/>'+
        '</svg>'+
        '<div class="bci-celebration-ornament"><span class="cline"></span><span class="cdiamond"></span><span class="cline"></span></div>'+
        '<div class="bci-celebration-title">'+teamName+' win the BCI!</div>'+
      '</div>';
    document.body.appendChild(overlay);

    if(!reduceMotion){
      /* Genuine confetti physics rather than a straight linear fall —
         each piece gets its own three-waypoint drift and its own spin
         speed, so the fall reads as tumbling and natural rather than
         every piece moving in lockstep. A mix of rectangles and circles
         adds a bit more visual variety too. */
      var colors=['#c9a84c','#16291d',teamColor,'#ffffff'];
      for(var i=0;i<80;i++){
        var piece=document.createElement('div');
        piece.className='bci-confetti-piece';
        var isCircle=Math.random()<0.35;
        var size=6+Math.random()*5;
        piece.style.width=size+'px';
        piece.style.height=isCircle?size+'px':(size*1.7)+'px';
        piece.style.borderRadius=isCircle?'50%':'1px';
        piece.style.left=(Math.random()*100)+'vw';
        piece.style.background=colors[Math.floor(Math.random()*colors.length)];
        piece.style.animationDuration=(2.6+Math.random()*2.2)+'s';
        piece.style.animationDelay=(Math.random()*0.7)+'s';
        var baseDrift=Math.random()*100-50;
        piece.style.setProperty('--drift1',(baseDrift*0.4+(Math.random()*30-15))+'px');
        piece.style.setProperty('--drift2',(baseDrift*0.8+(Math.random()*30-15))+'px');
        piece.style.setProperty('--drift3',(baseDrift+(Math.random()*30-15))+'px');
        var spinDir=Math.random()<0.5?1:-1;
        var spinSpeed=(280+Math.random()*420)*spinDir;
        piece.style.setProperty('--spin1',(spinSpeed*0.35)+'deg');
        piece.style.setProperty('--spin2',(spinSpeed*0.7)+'deg');
        piece.style.setProperty('--spin3',spinSpeed+'deg');
        overlay.appendChild(piece);
      }
    }

    requestAnimationFrame(function(){overlay.classList.add('visible');});

    function dismiss(){
      overlay.classList.remove('visible');
      setTimeout(function(){overlay.remove();},700);
    }
    overlay.addEventListener('click',dismiss);
    setTimeout(dismiss,5500);
  }

  /* ---------- birdie / eagle fly-across ---------- */
  var BIRD_SVG='<svg viewBox="0 0 100 40" fill="currentColor"><path class="wing" d="M50 20 C 35 5, 15 5, 0 15 C 20 15, 35 18, 50 20 Z"/><path class="wing" d="M50 20 C 65 5, 85 5, 100 15 C 80 15, 65 18, 50 20 Z"/></svg>';

  function showBirdFlyer(kind,caption){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    var flyer=document.createElement('div');
    flyer.className='achievement-flyer'+(kind==='eagle'?' eagle':'');
    flyer.innerHTML=BIRD_SVG;
    document.body.appendChild(flyer);
    var cap=document.createElement('div');
    cap.className='achievement-caption'+(kind==='eagle'?' eagle':'');
    cap.textContent=caption;
    document.body.appendChild(cap);
    var duration=kind==='eagle'?1900:1550;
    setTimeout(function(){flyer.remove();cap.remove();},duration);
  }

  /* ---------- hole in one — the big moment ---------- */
  function showAceMoment(player){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      if(window.bciToast)window.bciToast('Hole in one for '+player+'!');
      return;
    }
    var overlay=document.createElement('div');
    overlay.id='ace-moment';
    overlay.innerHTML=
      '<div class="ace-glow"></div>'+
      '<div class="ace-title">ACE</div>'+
      '<div class="ace-ornament"><span class="aline left"></span><span class="adiamond"></span><span class="aline right"></span></div>'+
      '<div class="ace-sub">'+player+' holes it in one.</div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function(){overlay.classList.add('visible');});
    function dismiss(){
      overlay.classList.remove('visible');
      setTimeout(function(){overlay.remove();},700);
    }
    overlay.addEventListener('click',dismiss);
    setTimeout(dismiss,4200);
  }

  function renderPointsBar(){
    var p=points();
    var baberProj=p.baber+p.baberLive;
    var weffProj=p.weff+p.weffLive;
    var undecided=Math.max(0,TOTAL_POINTS-baberProj-weffProj);

    var baberFinalPct=(p.baber/TOTAL_POINTS)*100;
    var baberLivePct=(p.baberLive/TOTAL_POINTS)*100;
    var weffLivePct=(p.weffLive/TOTAL_POINTS)*100;
    var weffFinalPct=(p.weff/TOTAL_POINTS)*100;
    var undecidedPct=Math.max(0,100-baberFinalPct-baberLivePct-weffLivePct-weffFinalPct);

    var trophySvg='<svg class="rc-trophy" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
      +'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/>'
      +'<path d="M7 6H4.2a1 1 0 0 0-1 1.1c.2 1.9 1.6 3.2 3.8 3.3M17 6h2.8a1 1 0 0 1 1 1.1c-.2 1.9-1.6 3.2-3.8 3.3"/>'
    +'</svg>';

    // Retained/won status stays tied to LOCKED points only — a live lead
    // shouldn't be able to trigger a "you've won the BCI" state (that also
    // feeds the push notification elsewhere) before it's actually final.
    var baberRetained=p.baber>=RETAIN_AT;
    var weffWon=p.weff>=WIN_AT;
    var baberScoreLabel='<div class="rc-score" style="margin-left:12px;">'+(baberRetained?trophySvg:'')+fmtPts(baberProj)+'</div>';
    var weffScoreLabel='<div class="rc-score" style="margin-right:12px;">'+fmtPts(weffProj)+(weffWon?trophySvg:'')+'</div>';

    if((baberRetained||weffWon)&&!localStorage.getItem('bci-celebrated')){
      localStorage.setItem('bci-celebrated','1');
      celebrate(weffWon?'weff':'baber');
    }

    var html='';
    if(baberFinalPct>0){
      html+='<div class="rc-fill baber" style="width:'+baberFinalPct+'%;">'
        +(baberLivePct===0?baberScoreLabel:'')
      +'</div>';
    }
    if(baberLivePct>0){
      html+='<div class="rc-fill baber-live" style="width:'+baberLivePct+'%;">'+baberScoreLabel+'</div>';
    }
    if(undecidedPct>0){
      html+='<div class="rc-fill undecided" style="width:'+undecidedPct+'%;"></div>';
    }
    if(weffLivePct>0){
      html+='<div class="rc-fill weff-live" style="width:'+weffLivePct+'%;">'+weffScoreLabel+'</div>';
    }
    if(weffFinalPct>0){
      html+='<div class="rc-fill weff" style="width:'+weffFinalPct+'%;">'
        +(weffLivePct===0?weffScoreLabel:'')
      +'</div>';
    }
    var baberTotalPct=baberFinalPct+baberLivePct;
    var weffTotalPct=weffFinalPct+weffLivePct;
    if(baberTotalPct>0&&(undecidedPct>0||weffTotalPct>0)){
      html+='<div class="rc-seam" style="left:'+baberTotalPct+'%;"></div>';
    }
    if(weffTotalPct>0&&undecidedPct>0){
      html+='<div class="rc-seam" style="left:'+(100-weffTotalPct)+'%;"></div>';
    }
    document.getElementById('rc-bar-fills').innerHTML=html;

    if(lastBarPcts&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      var baberEl=document.querySelector('.rc-fill.baber');
      var baberLiveEl=document.querySelector('.rc-fill.baber-live');
      var undecidedEl=document.querySelector('.rc-fill.undecided');
      var weffLiveEl=document.querySelector('.rc-fill.weff-live');
      var weffEl=document.querySelector('.rc-fill.weff');
      if(baberEl)baberEl.style.width=lastBarPcts.baber+'%';
      if(baberLiveEl)baberLiveEl.style.width=lastBarPcts.baberLive+'%';
      if(undecidedEl)undecidedEl.style.width=lastBarPcts.undecided+'%';
      if(weffLiveEl)weffLiveEl.style.width=lastBarPcts.weffLive+'%';
      if(weffEl)weffEl.style.width=lastBarPcts.weff+'%';
      // force a reflow so the browser registers the starting width before
      // transitioning to the real target on the next frame — without this
      // the width change would be batched with the one above and never
      // actually animate
      document.getElementById('rc-bar-fills').offsetWidth;
      requestAnimationFrame(function(){
        if(baberEl)baberEl.style.width=baberFinalPct+'%';
        if(baberLiveEl)baberLiveEl.style.width=baberLivePct+'%';
        if(undecidedEl)undecidedEl.style.width=undecidedPct+'%';
        if(weffLiveEl)weffLiveEl.style.width=weffLivePct+'%';
        if(weffEl)weffEl.style.width=weffFinalPct+'%';
      });
    }
    lastBarPcts={baber:baberFinalPct,baberLive:baberLivePct,undecided:undecidedPct,weffLive:weffLivePct,weff:weffFinalPct};

    var footer=(p.baber+p.weff)+' / '+TOTAL_POINTS+' points played';
    if(weffWon)footer+=' &middot; Green win the BCI';
    else if(baberRetained)footer+=' &middot; Blue retain the BCI';
    document.getElementById('rc-footer').innerHTML=footer;
  }

  var lastBaberScore=null,lastWeffScore=null;
  function animateScoreNumber(el,from,to,duration){
    var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduceMotion||from===null){el.textContent=fmtPts(to);return;}
    var start=null;
    function step(ts){
      if(!start)start=ts;
      var progress=Math.min((ts-start)/duration,1);
      var eased=1-Math.pow(1-progress,3);
      var current=from+(to-from)*eased;
      el.textContent=fmtPts(Math.round(current*2)/2);
      if(progress<1)requestAnimationFrame(step);
      else el.textContent=fmtPts(to);
    }
    requestAnimationFrame(step);
  }
  function flashScoreCard(el){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    el.classList.remove('score-flash');
    void el.offsetWidth;
    el.classList.add('score-flash');
  }

  function renderBanner(){
    var p=points();
    var baberEl=document.getElementById('score-baber');
    var weffEl=document.getElementById('score-weff');
    if(lastBaberScore!==null&&p.baber!==lastBaberScore){
      animateScoreNumber(baberEl,lastBaberScore,p.baber,600);
      flashScoreCard(document.getElementById('banner-baber'));
    } else {
      baberEl.textContent=fmtPts(p.baber);
    }
    if(lastWeffScore!==null&&p.weff!==lastWeffScore){
      animateScoreNumber(weffEl,lastWeffScore,p.weff,600);
      flashScoreCard(document.getElementById('banner-weff'));
    } else {
      weffEl.textContent=fmtPts(p.weff);
    }
    lastBaberScore=p.baber;
    lastWeffScore=p.weff;
    document.getElementById('banner-baber').classList.toggle('winning',p.baber>p.weff);
    document.getElementById('banner-weff').classList.toggle('winning',p.weff>p.baber);
    renderPointsBar();
  }

  function dayMatches(){
    return state.matches.filter(function(m){return m.day===state.day;});
  }

  /* Real par/stroke-index/distance per hole from the actual course
     scorecards (Black tees at Quinta do Vale, Negras tees at Isla Canela
     Links) — Day 1 plays Quinta do Vale, Day 2 plays Isla Canela Links.
     Distances are yards — the scorecards' "(m)" column header meant
     Men's tees, not metres, the raw numbers were already yards. */
  var COURSE_PAR={
    1:[5,3,4,5,3,4,5,4,3,5,4,3,5,3,4,3,5,4],
    2:[5,4,3,4,4,4,3,5,4,4,4,3,4,3,5,4,4,5]
  };
  var COURSE_INDEX={
    1:[1,17,5,9,15,11,3,7,13,2,10,14,6,16,4,18,12,8],
    2:[3,1,11,13,7,17,15,5,9,16,2,14,4,18,8,12,10,6]
  };
  var COURSE_DIST={
    1:[518,178,445,522,153,452,568,388,214,612,417,194,548,171,441,126,515,337],
    2:[565,449,191,359,453,331,243,492,398,335,462,205,454,240,546,416,417,598]
  };

  /* Player face photos for the match-card thumbnails — same real photo
     paths already used on players.html, kept here as a lean name-only
     lookup rather than duplicating the whole player record. Admin-edited
     photos from the players page's admin panel are merged in below once
     fetched, so an updated photo shows here too, not just there. */
  var PLAYER_PHOTOS={
    'James Baber':'images/players/james-baber-face.jpg',
    'Kane Bailey':'images/players/kane-bailey-face.jpg',
    'Mark Brackenridge':'images/players/mark-brackenridge-face.jpg',
    'Tony Bryant':'images/players/tony-bryant-face.jpg',
    'Aaron Davies':'images/players/aaron-davies-face.jpg',
    'Will Dodgson':'images/players/will-dodgson-face.jpg',
    'Matt Higgins':'images/players/matt-higgins-face.jpg',
    'Brian Hinojosa':'images/players/brian-hinojosa-face.jpg',
    'Rich Horsley':'images/players/rich-horsley-face.jpg',
    'Ted Keeling':'images/players/ted-keeling-face.jpg',
    'Louis Kelly':'images/players/louis-kelly-face.jpg',
    'Sean Mongan':'images/players/sean-mongan-face.jpg',
    'Dan Simkin':'images/players/dan-simkin-face.jpg',
    'Jack Taggart':'images/players/jack-taggart-face.jpg',
    'Alex Tinawi':'images/players/alex-tinawi-face.jpg',
    'Matt Wreford':'images/players/matt-wreford-face.jpg',
    'Oscar Hinojosa':'images/players/oscar-hinojosa-face.jpg'
  };
  if(sb){
    sb.from('bci_player_photos').select('player_name,photo_url').then(function(res){
      if(res.error||!res.data)return;
      res.data.forEach(function(row){
        if(row.photo_url)PLAYER_PHOTOS[row.player_name]=row.photo_url;
      });
    }).catch(function(){/* photo overrides are best-effort — hardcoded fallbacks still show */});
  }

  function initials(name){
    var parts=name.trim().split(/\s+/);
    return ((parts[0]||'')[0]||'')+((parts[parts.length-1]||'')[0]||'');
  }

  function playerPhotosRow(pairText){
    var names=(pairText||'').split('&').map(function(s){return s.trim();}).filter(Boolean);
    if(!names.length)return '';
    return '<div class="sr-photos">'+names.map(function(n){
      var url=PLAYER_PHOTOS[n];
      return url
        ?'<img class="sr-photo" src="'+url+'" alt="'+esc(n)+'" loading="lazy" decoding="async">'
        :'<div class="sr-photo sr-photo-fallback">'+esc(initials(n))+'</div>';
    }).join('')+'</div>';
  }

  /* Small momentum sparkline — the last up to 5 holes for a live match,
     so a run of form is visible at a glance rather than only the current
     net score. Not shown for upcoming or finished matches, where it
     wouldn't add anything the score itself doesn't already say. */
  function momentumRow(holes){
    if(!holes||holes.length<2)return '';
    var recent=holes.slice(-5);
    return '<div class="momentum">'+recent.split('').map(function(ch){
      return '<span class="momentum-dot '+(ch==='b'||ch==='w'||ch==='h'?ch:'')+'"></span>';
    }).join('')+'</div>';
  }

  /* Genuine, plain sports-reporting commentary — built entirely from the
     actual hole-by-hole sequence, no AI call, no hype. Runs the sequence
     through a simple run-length breakdown (e.g. "bbw" -> a run of two
     Blue holes, then one Green hole) and narrates the last one or two
     runs as a short "before/after" story, matching how real live-text
     golf commentary reads. Falls back to a "back and forth" framing when
     the recent holes have simply been traded one apiece. */
  function ordinalWord(n){
    var words={1:'first',2:'second',3:'third',4:'fourth',5:'fifth',6:'sixth',7:'seventh',8:'eighth',9:'ninth',10:'tenth',11:'eleventh',12:'twelfth',13:'thirteenth',14:'fourteenth',15:'fifteenth',16:'sixteenth',17:'seventeenth',18:'eighteenth'};
    return words[n]||(n+'th');
  }
  function countWord(n){
    var words={1:'one',2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'nine'};
    return words[n]||String(n);
  }
  function storyTeamName(ch){ return ch==='b'?'Blue':ch==='w'?'Green':null; }
  function runLengthEncode(holes){
    var runs=[];
    for(var i=0;i<holes.length;i++){
      var ch=holes[i];
      if(runs.length&&runs[runs.length-1].side===ch){runs[runs.length-1].count++;}
      else{runs.push({side:ch,count:1,startHole:i+1});}
    }
    return runs;
  }
  function openingClauseFor(run,team){
    if(run.startHole===1){
      return run.count===1?team+' win the first hole':team+' win the first '+countWord(run.count)+' holes';
    }
    return run.count===1?team+' had won the previous hole':team+' had won '+countWord(run.count)+' in a row';
  }
  function matchStory(holes){
    if(!holes)return '';
    var runs=runLengthEncode(holes);
    if(!runs.length)return '';

    var tailRuns=runs.slice(-4);
    var isChoppy=tailRuns.length>=3&&tailRuns.every(function(r){return r.count===1&&r.side!=='h';});
    if(isChoppy){
      var lastTeamC=storyTeamName(tailRuns[tailRuns.length-1].side);
      return 'The last '+countWord(tailRuns.length)+' holes have gone back and forth, '+lastTeamC+' shading the '+ordinalWord(tailRuns[tailRuns.length-1].startHole)+'.';
    }

    var last=runs[runs.length-1];
    var prev=runs.length>1?runs[runs.length-2]:null;

    if(!prev){
      if(last.side==='h')return last.count>1?'The first '+countWord(last.count)+' holes have all been halved.':'The first hole was halved.';
      var team=storyTeamName(last.side);
      if(!team)return '';
      return last.count===1?team+' win the first hole.':team+' have won the first '+countWord(last.count)+' holes.';
    }

    if(last.side==='h'){
      var closingH=last.count===1?'the '+ordinalWord(last.startHole)+' was halved':'the last '+countWord(last.count)+' holes have been halved';
      if(prev.side!=='h'){
        return openingClauseFor(prev,storyTeamName(prev.side))+' before '+closingH+'.';
      }
      return last.count===1?'The '+ordinalWord(last.startHole)+' was halved.':'The last '+countWord(last.count)+' holes have all been halved.';
    }
    if(prev.side==='h'){
      var lt=storyTeamName(last.side);
      return lt+' have won '+(last.count===1?'the last hole':'the last '+countWord(last.count)+' holes')+' after a halve.';
    }

    var prevTeam=storyTeamName(prev.side),lastTeam=storyTeamName(last.side);
    var closingClause=last.count===1
      ?lastTeam+' hit back on the '+ordinalWord(last.startHole)
      :lastTeam+' hit back, winning the last '+countWord(last.count)+' holes';
    return openingClauseFor(prev,prevTeam)+' before '+closingClause+'.';
  }

  function holeStrip(m){
    var holes=m.holes||'';
    if(!holes.length)return '';
    var pars=COURSE_PAR[m.day]||[];
    var cells='';
    for(var i=0;i<18;i++){
      var r=holes[i]||'';
      var par=pars[i]?'<span class="hole-par">'+pars[i]+'</span>':'';
      cells+='<div class="hole-cell'+(r?' '+r:'')+'">'+(i+1)+par+'</div>';
    }
    return '<div class="hole-strip">'+cells+'</div>';
  }

  var lastMatchSignatures={};
  function renderMatches(){
    var list=dayMatches();
    var changedIds=[];
    list.forEach(function(m){
      var c=calc(m);
      var sig=c.status+'|'+c.leader+'|'+c.score+'|'+c.thru;
      if(lastMatchSignatures[m.id]!==undefined&&lastMatchSignatures[m.id]!==sig){
        changedIds.push(m.id);
      }
      lastMatchSignatures[m.id]=sig;
    });
    renderSummaryTable();
    if(changedIds.length&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      changedIds.forEach(function(id){
        var row=document.querySelector('.summary-row[data-id="'+id+'"]');
        if(row){
          row.classList.remove('row-changed-flash');
          void row.offsetWidth;
          row.classList.add('row-changed-flash');
        }
      });
    }
  }

  /* ---------- admin panel: match management only ---------- */
  function renderScorer(force){
    if(state.role!=='admin')return;
    var el=document.getElementById('edit-list');
    var list=dayMatches();

    if(!list.length){
      el.innerHTML='<div class="empty-note"><svg class="empty-illo" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="32" cy="54" rx="22" ry="4"/><line x1="32" y1="54" x2="32" y2="14" class="flag-part"/><path d="M32 14 48 20 32 26Z" class="flag-part" fill="currentColor"/><circle cx="46" cy="48" r="4"/></svg>No matches yet for Day '+state.day+'.</div>';
      return;
    }
    el.innerHTML=list.map(function(m){
      return '<div class="entry-card team-edit" data-id="'+esc(m.id)+'">'
        +'<h4>Match '+esc(m.match_no)+' &middot; '+esc(m.format)+'</h4>'
        +'<div class="entry-row">'
          +'<div class="entry-group"><label>Blue Team Players</label><input type="text" data-f="baber" value="'+esc(m.baber_players)+'"></div>'
          +'<div class="entry-group"><label>Green Team Players</label><input type="text" data-f="weff" value="'+esc(m.weff_players)+'"></div>'
          +'<div class="entry-group full"><label>Tee Time (e.g. 08:40)</label><input type="text" data-f="tee" value="'+esc(m.tee_time||'')+'"></div>'
        +'</div>'
        +'<button class="mini-btn danger" data-act="delete">Delete Match</button>'
      +'</div>';
    }).join('')
    +'<button class="entry-btn" id="saveall-btn" style="margin-top:1.25rem;">Save All Teams &amp; Times</button>';

    Array.prototype.forEach.call(el.querySelectorAll('.team-edit [data-act="delete"]'),function(btn){
      btn.addEventListener('click',function(){handleAction(btn.closest('.team-edit').dataset.id,'delete',null,btn);});
    });
    document.getElementById('saveall-btn').addEventListener('click',saveAllTeams);
  }

  function findMatch(id){
    for(var i=0;i<state.matches.length;i++)if(String(state.matches[i].id)===String(id))return state.matches[i];
    return null;
  }

  function pushUpdate(id,upd,btn){
    if(btn)btn.disabled=true;
    sb.from('bci_matches').update(upd).eq('id',id).then(function(res){
      if(btn)btn.disabled=false;
      if(res.error){alert('Could not save that. Check your connection and try again.');return;}
      loadMatches();
    });
  }

  function derived(m,holes,statusOverride){
    var c=calc({holes:holes,status:statusOverride||''});
    return {holes:holes,status:c.status,leader:c.leader,score:c.score,thru:c.thru};
  }

  /* Checks whether every real match for a day is now final, right after
     the one that was just closed — used to fire a one-off "upload your
     photos" nudge exactly when a day genuinely wraps up, not before.
     localStorage guards against the same device firing it twice; it
     can't fully prevent two different devices both closing out the
     last two matches at almost the same moment, but that's a rare,
     low-stakes edge case worth accepting rather than building real
     server-side locking for. */
  function checkDayComplete(day,justClosedId){
    var isPlaceholder=function(m){return /pair \d|player \d/i.test(m.baber_players||'')||/pair \d|player \d/i.test(m.weff_players||'');};
    var real=state.matches.filter(function(m){return m.day===day&&!isPlaceholder(m);});
    if(!real.length)return false;
    var allFinal=real.every(function(m){return m.id===justClosedId||m.status==='final';});
    if(!allFinal)return false;
    var flagKey='bci-day-'+day+'-photos-nudge-sent';
    if(localStorage.getItem(flagKey))return false;
    localStorage.setItem(flagKey,'1');
    return true;
  }

  function handleAction(id,act,card,btn){
    var m=findMatch(id);
    if(!m)return;
    var holes=m.holes||'';

    if(act==='b'||act==='w'||act==='h'){
      if(holes.length>=18)return;
      var newHoles=holes+act;
      var d=derived(m,newHoles);
      pushUpdate(id,d,btn);
      if(d.status==='final'){
        sendPushEvent('match-final',{
          matchId:id,day:m.day,matchNo:m.match_no,
          leader:d.leader,score:d.score,baber:m.baber_players,weff:m.weff_players
        });
        if(checkDayComplete(m.day,id)){
          sendPushEvent('day-photos-nudge',{day:m.day});
        }
      } else if(newHoles.length%3===0){
        var mc=calc({holes:newHoles,status:''});
        sendPushEvent('hole-milestone',{
          matchId:id,day:m.day,matchNo:m.match_no,thru:newHoles.length,
          leader:mc.leader,score:mc.score,baber:m.baber_players,weff:m.weff_players,holes:newHoles
        });
      }
    }
    else if(act==='undo'){
      if(!holes.length)return;
      pushUpdate(id,derived(m,holes.slice(0,-1)),btn);
    }
    else if(act==='concede'){
      if(!confirm('End this match at its current score? Use this for concessions or matches called early.'))return;
      var c=calc({holes:holes,status:'final'});
      pushUpdate(id,{holes:holes,status:'final',leader:c.leader,score:holes.length?c.score:'Conceded',thru:c.thru},btn);
      sendPushEvent('match-final',{
        matchId:id,day:m.day,matchNo:m.match_no,
        leader:c.leader,score:holes.length?c.score:'Conceded',baber:m.baber_players,weff:m.weff_players
      });
      if(checkDayComplete(m.day,id)){
        sendPushEvent('day-photos-nudge',{day:m.day});
      }
    }
    else if(act==='reopen'){
      pushUpdate(id,derived(m,holes),btn);
    }
    else if(act==='delete'){
      if(state.role!=='admin')return;
      if(!confirm('Delete this match completely?'))return;
      sb.from('bci_matches').delete().eq('id',id).then(function(res){
        if(res.error){alert('Could not delete that match.');return;}
        loadMatches();
      });
    }
  }

  function saveAllTeams(){
    if(state.role!=='admin')return;
    var btn=document.getElementById('saveall-btn');
    var updates=[];
    var announcements=[];
    var invalid=false;
    Array.prototype.forEach.call(document.querySelectorAll('#edit-list .team-edit'),function(card){
      var m=findMatch(card.dataset.id);
      if(!m)return;
      var baber=card.querySelector('[data-f="baber"]').value.trim();
      var weff=card.querySelector('[data-f="weff"]').value.trim();
      var tee=card.querySelector('[data-f="tee"]').value.trim();
      if(!baber||!weff){invalid=true;return;}
      var wasComplete=!!(m.baber_players&&m.weff_players&&m.tee_time);
      var willBeComplete=!!(baber&&weff&&tee);
      if(baber!==m.baber_players||weff!==m.weff_players||tee!==(m.tee_time||'')){
        updates.push(sb.from('bci_matches').update({baber_players:baber,weff_players:weff,tee_time:tee}).eq('id',m.id));
        if(!wasComplete&&willBeComplete){
          announcements.push({matchId:m.id,day:m.day,matchNo:m.match_no,tee:tee,baber:baber,weff:weff});
        }
      }
    });
    if(invalid){alert('Every match needs players for both teams. Nothing has been saved yet.');return;}
    if(!updates.length){
      btn.textContent='Nothing to save';
      setTimeout(function(){btn.textContent='Save All Teams & Times';},1500);
      return;
    }
    btn.disabled=true;btn.textContent='Saving...';
    Promise.all(updates).then(function(results){
      btn.disabled=false;btn.textContent='Save All Teams & Times';
      if(results.some(function(r){return r.error;})){
        alert('Some changes could not be saved. Check your connection and try again.');
      } else {
        window.bciToast('Saved.');
        if(announcements.length)sendPushEvent('matches-announced',{day:state.day,matches:announcements});
      }
      loadMatches(true);
    });
  }

  document.getElementById('announce-btn').addEventListener('click',function(){
    if(state.role!=='admin')return;
    var title=document.getElementById('announce-title').value.trim();
    var body=document.getElementById('announce-body').value.trim();
    if(!title||!body){alert('Add both a title and a message before sending.');return;}
    var btn=this;
    btn.disabled=true;btn.textContent='Sending...';

    if(!PUSH_ENDPOINT){
      alert('Push endpoint is not configured on this page — nothing was sent. This page may be running an old cached version; try closing the tab and reopening the leaderboard.');
      btn.disabled=false;btn.textContent='Send Now';
      return;
    }

    fetch(PUSH_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-BCI-Push-Secret':PUSH_SHARED_SECRET},
      body:JSON.stringify({type:'manual-announcement',payload:{title:title,body:body}})
    }).then(function(res){
      return res.json().catch(function(){return {};}).then(function(data){return {ok:res.ok,status:res.status,data:data};});
    }).then(function(result){
      btn.disabled=false;btn.textContent='Send Now';
      if(result.ok){
        document.getElementById('announce-title').value='';
        document.getElementById('announce-body').value='';
        alert('Sent to '+(result.data.sent||0)+' of '+(result.data.total||0)+' subscribed device(s).');
      } else {
        alert('Send failed (status '+result.status+'): '+JSON.stringify(result.data));
      }
    }).catch(function(err){
      btn.disabled=false;btn.textContent='Send Now';
      alert('Could not reach the notification service at all: '+err.message);
    });
  });

  document.getElementById('reset-btn').addEventListener('click',function(){
    if(state.role!=='admin')return;
    if(!confirm('Reset ALL scoring on both days? Every hole result will be wiped and all matches set back to upcoming. Players and tee times are kept.'))return;
    if(!confirm('Absolutely sure? This cannot be undone.'))return;
    var btn=this;
    btn.disabled=true;btn.textContent='Resetting...';
    sb.from('bci_matches')
      .update({holes:'',status:'upcoming',leader:'tie',score:'',thru:''})
      .gte('day',1)
      .then(function(res){
        btn.disabled=false;btn.textContent='Reset All Scores';
        if(res.error){alert('Could not reset. Check your connection and try again.');return;}
        loadMatches();
      });
  });

  /* ---------- per-match scoring page ---------- */
  function openScoreView(id){
    state.scoringId=id;
    document.getElementById('board-view').style.display='none';
    document.getElementById('score-view').style.display='block';
    renderScoreView();
    window.scrollTo(0,0);
  }

  function closeScoreView(){
    state.scoringId=null;
    document.getElementById('score-view').style.display='none';
    document.getElementById('board-view').style.display='';
    window.scrollTo(0,0);
  }

  function scoreRowHTML(m,c){
    var srB='',srW='',mid='';
    if(c.status==='upcoming'){
      mid='vs'+(m.tee_time?'<br>'+esc(m.tee_time):'');
    } else if(c.status==='final'){
      mid='Final';
      if(c.leader==='baber')srB='<span class="sr-score">Won '+esc(c.score)+'</span>';
      else if(c.leader==='weff')srW='<span class="sr-score">Won '+esc(c.score)+'</span>';
      else {srB='<span class="sr-score">&frac12;</span>';srW='<span class="sr-score">&frac12;</span>';}
    } else if(c.leader==='tie'){
      mid='AS<br>Thru '+c.played;
    } else {
      mid='Thru '+c.played;
      if(c.leader==='baber')srB='<span class="sr-score">'+esc(c.score)+'</span>';
      else srW='<span class="sr-score">'+esc(c.score)+'</span>';
    }
    var baberLead=c.status!=='upcoming'&&c.leader==='baber';
    var weffLead=c.status!=='upcoming'&&c.leader==='weff';
    return '<div class="score-row">'
      +'<div class="sr-side baber'+(baberLead?' leading':'')+'">'+playerPhotosRow(m.baber_players)+'<span class="sr-name">'+esc(m.baber_players)+'</span>'+srB+'</div>'
      +'<div class="sr-mid">'+mid+'</div>'
      +'<div class="sr-side weff'+(weffLead?' leading':'')+'">'+playerPhotosRow(m.weff_players)+'<span class="sr-name">'+esc(m.weff_players)+'</span>'+srW+'</div>'
    +'</div>';
  }

  var KITTY_TYPES=[['birdie','Birdie','2.50'],['eagle','Eagle','5'],['hole_in_one','Hole in One','50']];
  var kittyState={hole:null,player:null,type:null};

  function kittyToggleHTML(){
    return '<div class="kitty-toggle" id="kitty-toggle">'
      +'<svg class="icon" aria-hidden="true"><use href="#i-coin"/></svg>Log a birdie, eagle or ace'
    +'</div>';
  }

  function kittyPanelHTML(m,c){
    var names=namesFrom(m.baber_players).concat(namesFrom(m.weff_players));
    var defaultHole=c.played||1;
    var holeOptions=Array.from({length:18},function(_,i){
      return '<option value="'+(i+1)+'"'+((i+1)===defaultHole?' selected':'')+'>Hole '+(i+1)+'</option>';
    }).join('');
    return '<div class="kitty-panel" id="kitty-panel">'
      +'<div class="kitty-row-label">Which hole</div>'
      +'<select class="kitty-hole-select" id="kitty-hole-select">'+holeOptions+'</select>'
      +'<div class="kitty-row-label">Who</div>'
      +'<div class="kitty-players">'+names.map(function(n){
        return '<div class="kitty-chip" data-name="'+esc(n)+'">'+esc(n)+'</div>';
      }).join('')+'</div>'
      +'<div class="kitty-row-label">Achievement</div>'
      +'<div class="kitty-achievements">'+KITTY_TYPES.map(function(t){
        return '<div class="achievement-btn" data-type="'+t[0]+'" data-amount="'+t[2]+'">'+t[1]+'<span class="amt">\u00A3'+t[2]+'</span></div>';
      }).join('')+'</div>'
      +'<button class="kitty-submit" id="kitty-submit">Log It</button>'
      +'<div class="kitty-status" id="kitty-status"></div>'
    +'</div>';
  }

  function wireKittyPanel(m){
    var toggle=document.getElementById('kitty-toggle');
    var panel=document.getElementById('kitty-panel');
    if(!toggle||!panel)return;
    toggle.addEventListener('click',function(){
      panel.classList.toggle('visible');
    });
    Array.prototype.forEach.call(panel.querySelectorAll('.kitty-chip'),function(chip){
      chip.addEventListener('click',function(){
        Array.prototype.forEach.call(panel.querySelectorAll('.kitty-chip'),function(c2){c2.classList.remove('selected');});
        chip.classList.add('selected');
        kittyState.player=chip.dataset.name;
      });
    });
    Array.prototype.forEach.call(panel.querySelectorAll('.kitty-achievements .achievement-btn'),function(btn){
      btn.addEventListener('click',function(){
        Array.prototype.forEach.call(panel.querySelectorAll('.kitty-achievements .achievement-btn'),function(b2){b2.classList.remove('selected');});
        btn.classList.add('selected');
        kittyState.type=btn.dataset.type;
        kittyState.amount=parseFloat(btn.dataset.amount);
      });
    });
    document.getElementById('kitty-submit').addEventListener('click',function(){
      var statusEl=document.getElementById('kitty-status');
      var hole=parseInt(document.getElementById('kitty-hole-select').value,10);
      if(!kittyState.player){statusEl.textContent='Choose who made it.';statusEl.className='kitty-status error';return;}
      if(!kittyState.type){statusEl.textContent='Choose birdie, eagle, or hole in one.';statusEl.className='kitty-status error';return;}
      if(!sb){alert('Not connected — try reloading the page.');return;}
      var btn=this;
      btn.disabled=true;btn.textContent='Logging...';
      sb.from('bci_kitty_log').insert({
        player_name:kittyState.player,day:m.day,hole:hole,
        achievement_type:kittyState.type,amount:kittyState.amount
      }).then(function(res){
        btn.disabled=false;btn.textContent='Log It';
        if(res.error){
          statusEl.textContent='Could not log: '+res.error.message;
          statusEl.className='kitty-status error';
          return;
        }
        statusEl.textContent='';statusEl.className='kitty-status';
        var label=KITTY_TYPES.filter(function(t){return t[0]===kittyState.type;})[0][1];
        if(window.bciToast)window.bciToast(label+' logged for '+kittyState.player+'.');
        if(kittyState.type==='hole_in_one'){
          showAceMoment(kittyState.player);
        } else if(kittyState.type==='eagle'){
          showBirdFlyer('eagle',kittyState.player+' — Eagle');
        } else {
          showBirdFlyer('birdie',kittyState.player+' — Birdie');
        }
        sendPushEvent('kitty-achievement',{
          player:kittyState.player,day:m.day,hole:hole,
          achievementType:kittyState.type,amount:kittyState.amount
        });
        loadBirdieBoard();
        document.getElementById('kitty-panel').classList.remove('visible');
        Array.prototype.forEach.call(panel.querySelectorAll('.kitty-chip, .kitty-achievements .achievement-btn'),function(el){el.classList.remove('selected');});
        kittyState={hole:null,player:null,type:null};
      });
    });
  }

  function renderScoreView(){
    var m=findMatch(state.scoringId);
    var el=document.getElementById('score-view');
    if(!m){closeScoreView();return;}
    var c=calc(m);
    var done=c.status==='final';
    var holeNum=c.played+1;
    var pars=COURSE_PAR[m.day]||[];
    var idxs=COURSE_INDEX[m.day]||[];
    var dists=COURSE_DIST[m.day]||[];
    var holeDetail='';
    if(!done&&pars[holeNum-1]){
      holeDetail='<div class="hole-detail-card">'
        +'<div class="hd-item"><div class="hd-label">Par</div><div class="hd-val">'+pars[holeNum-1]+'</div></div>'
        +'<div class="hd-item"><div class="hd-label">Stroke Index</div><div class="hd-val">'+idxs[holeNum-1]+'</div></div>'
        +'<div class="hd-item"><div class="hd-label">Distance</div><div class="hd-val">'+dists[holeNum-1]+' yd</div></div>'
      +'</div>';
    }
    var controls=(done?'':'<div class="next-hole">Hole '+holeNum+' result</div>'+holeDetail)
        +'<div class="hole-btns">'
          +'<button class="hb baber" data-act="b"'+(done?' disabled':'')+'>Blue<br>win</button>'
          +'<button class="hb halve" data-act="h"'+(done?' disabled':'')+'>Halved</button>'
          +'<button class="hb weff" data-act="w"'+(done?' disabled':'')+'>Green<br>win</button>'
        +'</div>'
        +'<div class="mini-btns two">'
          +'<button class="mini-btn" data-act="undo"'+(c.played===0?' disabled':'')+'>Undo hole</button>'
          +'<button class="mini-btn" data-act="'+(c.manualFinal?'reopen':'concede')+'">'+(c.manualFinal?'Reopen':'End match now')+'</button>'
        +'</div>'
        +kittyToggleHTML()
        +kittyPanelHTML(m,c)
        +'<button class="entry-btn" id="sv-done" style="margin-top:1rem;">Save &amp; Back to Leaderboard</button>';

    el.innerHTML='<div class="score-view-head">'
        +'<span class="sv-title">Match '+esc(m.match_no)+' &middot; '+esc(m.format)+' &middot; Day '+esc(m.day)+'</span>'
        +'<button class="back-link" id="sv-back">&larr; Leaderboard</button>'
      +'</div>'
      +'<div class="entry-card" style="margin-top:0;">'
        +scoreRowHTML(m,c)
        +(matchStory(m.holes)?'<div class="match-story">'+esc(matchStory(m.holes))+'</div>':'')
        +holeStrip(m)
        +controls
      +'</div>';

    document.getElementById('sv-back').addEventListener('click',closeScoreView);
    var doneBtn=document.getElementById('sv-done');
    if(doneBtn)doneBtn.addEventListener('click',closeScoreView);
    Array.prototype.forEach.call(el.querySelectorAll('[data-act]'),function(btn){
      btn.addEventListener('click',function(){handleAction(state.scoringId,btn.dataset.act,null,btn);});
    });
    wireKittyPanel(m);
  }

  function applyRole(){
    if(state.role!=='admin')return;
    document.getElementById('password-gate').style.display='none';
    document.getElementById('scorer-panel').classList.add('visible');
    document.getElementById('scorer-toggle').classList.add('open');
    document.getElementById('announce-card').style.display='';
    document.getElementById('reset-card').style.display='';
    document.getElementById('day-recap-btn').style.display='';
    renderScorer(true);
  }

  /* ---------- admin password, gates Reset only — scoring itself is always open ---------- */
  document.getElementById('scorer-toggle').addEventListener('click',function(){
    var toggle=this;
    if(state.role!=='admin'){
      var g=document.getElementById('password-gate');
      var willOpen=g.style.display==='none';
      g.style.display=willOpen?'block':'none';
      toggle.classList.toggle('open',willOpen);
    } else {
      var panel=document.getElementById('scorer-panel');
      var willOpen=!panel.classList.contains('visible');
      panel.classList.toggle('visible',willOpen);
      toggle.classList.toggle('open',willOpen);
    }
  });
  document.getElementById('pw-btn').addEventListener('click',function(){
    var v=document.getElementById('pw-input').value;
    if(v===ADMIN_PASS){
      state.role='admin';
      applyRole();
    } else {
      document.getElementById('pw-error').textContent='Incorrect password.';
    }
  });
  document.getElementById('pw-input').addEventListener('keydown',function(e){
    if(e.key==='Enter')document.getElementById('pw-btn').click();
  });

  /* ---------- live updates ---------- */
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message',function(e){
      if(!e.data||e.data.type!=='bci-notification-click')return;
      try{
        var u=new URL(e.data.url,window.location.origin);
        var matchId=u.searchParams.get('match');
        var day=u.searchParams.get('day');
        if(matchId){
          history.replaceState(null,'',u.pathname+u.search);
          goToMatch(matchId);
        } else if(day){
          var d=parseInt(day,10);
          if(d===1||d===2){
            history.replaceState(null,'',u.pathname+u.search);
            switchDay(d);
          }
        }
      }catch(err){/* malformed deep link — ignore */}
    });
  }
  if(sb){
    loadMatches();
    setInterval(function(){
      if(document.visibilityState==='visible')loadMatches();
    },POLL_MS);
    document.addEventListener('visibilitychange',function(){
      if(document.visibilityState==='visible')loadMatches();
    });
    try{
      sb.channel('bci_matches_changes')
        .on('postgres_changes',{event:'*',schema:'public',table:'bci_matches'},loadMatches)
        .subscribe();
    }catch(e){/* realtime not enabled — polling covers it */}
  }

  /* ---------- brief Day 1 / Day 2 welcome ----------
     Tied to the real calendar date, not whichever tab happens to be
     selected — showing once per person per day, using localStorage
     (not sessionStorage) since this needs to persist across separate
     visits within the same day but reset on the next one. Brief,
     non-blocking, and dismisses itself — the leaderboard gets opened
     constantly during a round, so this can never be a ceremony you
     have to click through like the homepage's welcome. */
  (function(){
    var today=new Date();
    var dateStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    var DAY_INFO={'2027-04-23':{day:1,course:'Quinta do Vale'},'2027-04-24':{day:2,course:'Isla Canela'}};
    var info=DAY_INFO[dateStr];
    if(!info)return;

    var flagKey='bci-day-welcome-'+dateStr;
    if(localStorage.getItem(flagKey))return;
    localStorage.setItem(flagKey,'1');

    document.getElementById('dw-title').textContent='Welcome to Day '+info.day;
    document.getElementById('dw-sub').textContent=info.course;
    var banner=document.getElementById('day-welcome');
    setTimeout(function(){banner.classList.add('visible');},400);
    setTimeout(function(){banner.classList.remove('visible');},4000);
  })();
})();
