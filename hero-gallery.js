/* ============================================================
   BCI hero photo — picks one random photo from the combined
   Marbella 2026 + Algarve 2027 galleries and sets it as the
   background of the page's .page-hero banner, with the same
   dark green overlay treatment used on the homepage hero.
   Include with: <script src="hero-gallery.js"></script>
   Reads from the same Supabase storage bucket as gallery.html.
   Fails silently (leaving the plain green background) if the
   fetch doesn't work or no images are found.
   ============================================================ */
(function(){
  var SB_URL='https://ccczckdewwlpofgjigdi.supabase.co';
  var SB_KEY='sb_publishable_9ZVOAL9qqv8uaLBq-DM_iA_ODMnweui';
  var BUCKET='bci-images';
  var FOLDERS=['algarve-2027','marbella-2026'];

  var hero=document.querySelector('.page-hero, .hero');
  if(!hero)return;

  function listFolder(folder){
    return fetch(SB_URL+'/storage/v1/object/list/'+BUCKET,{
      method:'POST',
      headers:{
        'apikey':SB_KEY,
        'Authorization':'Bearer '+SB_KEY,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({prefix:folder+'/',limit:200,sortBy:{column:'created_at',order:'desc'}})
    }).then(function(r){return r.json();})
      .then(function(data){
        if(!Array.isArray(data))return [];
        return data.filter(function(o){
          if(!o.name||o.name.indexOf('.')===0||o.name==='.emptyFolderPlaceholder')return false;
          var mimetype=(o.metadata&&o.metadata.mimetype)||'';
          var isVideo=mimetype.indexOf('video')===0||/\.(mp4|mov|webm|m4v)$/i.test(o.name);
          return !isVideo;
        }).map(function(o){
          return SB_URL+'/storage/v1/object/public/'+BUCKET+'/'+folder+'/'+o.name;
        });
      }).catch(function(){return [];});
  }

  Promise.all(FOLDERS.map(listFolder)).then(function(lists){
    var all=lists[0].concat(lists[1]);
    if(!all.length)return;
    var pick=all[Math.floor(Math.random()*all.length)];
    var img=new Image();
    img.onload=function(){
      hero.style.backgroundImage=
        'linear-gradient(rgba(32,48,59,0.82),rgba(32,48,59,0.88)),url("'+pick+'")';
      hero.style.backgroundSize='cover';
      hero.style.backgroundPosition='center center';
      hero.style.backgroundRepeat='no-repeat';
    };
    img.src=pick; // triggers onload once loaded, avoids a flash of a broken image
  }).catch(function(){/* leave the plain green background */});
})();
