(() => {
  'use strict';
  function polish(){
    const cp=document.querySelector('.control-panel');
    if(cp) cp.classList.toggle('record-mode',!!document.querySelector('.form-sheet-wrap'));
  }
  const root=document.getElementById('app');
  if(root){new MutationObserver(()=>requestAnimationFrame(polish)).observe(root,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',polish);else polish();
})();
