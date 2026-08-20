(() => {
  'use strict';
  function polish(){
    const cp=document.querySelector('.control-panel');
    if(cp) cp.classList.toggle('record-mode',!!document.querySelector('.form-sheet-wrap'));
  }
  function loadTelegramAdmin(){
    if(document.querySelector('script[data-taskdesk-telegram-admin]')) return;
    const s=document.createElement('script');
    s.src='./telegram-admin.js?v=2e6ae74e';
    s.dataset.taskdeskTelegramAdmin='1';
    document.head.appendChild(s);
  }
  const root=document.getElementById('app');
  if(root){new MutationObserver(()=>requestAnimationFrame(polish)).observe(root,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{polish();loadTelegramAdmin();});else{polish();loadTelegramAdmin();}
})();
