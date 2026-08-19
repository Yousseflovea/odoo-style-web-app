/* TaskDesk responsive interaction layer */
(() => {
  'use strict';

  const phoneMQ = window.matchMedia('(max-width: 767px)');
  const tabletMQ = window.matchMedia('(min-width: 768px) and (max-width: 1100px)');
  let resizeTimer = null;

  function setDeviceClass(){
    document.documentElement.dataset.device = phoneMQ.matches ? 'phone' : (tabletMQ.matches ? 'tablet' : 'desktop');
  }

  function syncSidebarBackdrop(){
    const shell = document.querySelector('.app-shell');
    if(!shell) return;
    let backdrop = shell.querySelector('.mobile-sidebar-backdrop');
    if(!backdrop){
      backdrop = document.createElement('div');
      backdrop.className = 'mobile-sidebar-backdrop';
      const body = shell.querySelector('.body');
      if(body) shell.insertBefore(backdrop, body);
      backdrop.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.remove('open');
        backdrop.classList.remove('show');
        try{ if(typeof state !== 'undefined') state.sidebar = false; }catch{}
      });
    }
    const open = document.querySelector('.sidebar')?.classList.contains('open');
    backdrop.classList.toggle('show', !!open);
    const menu = document.getElementById('menu-btn');
    if(menu && !menu.dataset.responsiveBound){
      menu.dataset.responsiveBound = '1';
      menu.addEventListener('click', () => setTimeout(syncSidebarBackdrop, 0));
    }
  }

  function enhanceBottomNav(){
    const nav = document.querySelector('.mobile-bottom');
    if(!nav || nav.querySelector('.mobile-create-fab')) return;
    const create = document.createElement('button');
    create.className = 'mobile-create-fab';
    create.type = 'button';
    create.setAttribute('aria-label', (typeof prefs !== 'undefined' && prefs.lang === 'ar') ? 'تاسك جديد' : 'New Task');
    create.innerHTML = '<strong>＋</strong><span>New</span>';
    create.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if(typeof taskModal === 'function') taskModal();
    });
    const nodes = [...nav.children];
    if(nodes.length >= 2) nav.insertBefore(create, nodes[2]); else nav.append(create);
  }

  function labelResponsiveTables(){
    document.querySelectorAll('table.o-list').forEach(table => {
      const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
      table.querySelectorAll('tbody tr').forEach(row => {
        [...row.children].forEach((cell, i) => {
          if(!cell.dataset.label) cell.dataset.label = headers[i] || '';
        });
      });
    });
  }

  function enhanceKanbanTouch(){
    if(!phoneMQ.matches) return;
    document.querySelectorAll('.kanban-card[data-card]').forEach(card => {
      if(card.querySelector('.mobile-stage-select')) return;
      const id = card.dataset.card;
      let current = '';
      try{ current = (typeof tasks !== 'undefined' ? tasks.find(x => x.id === id)?.status : '') || ''; }catch{}
      const select = document.createElement('select');
      select.className = 'mobile-stage-select';
      select.setAttribute('aria-label', (typeof prefs !== 'undefined' && prefs.lang === 'ar') ? 'تغيير الحالة' : 'Change stage');
      const stages = (typeof STAGES !== 'undefined' ? STAGES : ['NEW','IN_PROGRESS','WAITING','BLOCKED','RESOLVED','CLOSED']);
      select.innerHTML = stages.map(s => `<option value="${s}" ${s===current?'selected':''}>${typeof stageLabel==='function'?stageLabel(s):s}</option>`).join('');
      ['click','pointerdown','touchstart'].forEach(evt => select.addEventListener(evt, e => e.stopPropagation(), {passive:true}));
      select.addEventListener('change', async e => {
        e.stopPropagation();
        select.disabled = true;
        try{
          if(typeof rest !== 'function') return;
          await rest('tasks', `id=eq.${id}`, {method:'PATCH', body:{status:select.value, updated_by:me.id}});
          if(typeof loadData === 'function') await loadData();
          if(typeof renderKanbanBody === 'function') renderKanbanBody();
          if(typeof toast === 'function') toast((typeof prefs!=='undefined'&&prefs.lang==='ar')?'تم تغيير الحالة':'Stage updated');
        }catch(err){
          if(typeof toast === 'function') toast(err.message || String(err));
          select.disabled = false;
        }
      });
      card.append(select);
    });
  }

  function enhanceCalendarAgenda(){
    if(!phoneMQ.matches) return;
    const body = document.getElementById('calendar-body');
    if(!body || body.querySelector('.mobile-agenda')) return;
    let all = [];
    try{ all = [...tasks].filter(x => x.due_date && !['CLOSED','CANCELLED'].includes(x.status)); }catch{}
    all.sort((a,b) => String(a.due_date).localeCompare(String(b.due_date)));
    const agenda = document.createElement('section');
    agenda.className = 'mobile-agenda';
    const rows = all.slice(0,8);
    if(!rows.length){
      agenda.innerHTML = `<div class="o-card panel subtle">${(typeof prefs!=='undefined'&&prefs.lang==='ar')?'لا توجد مواعيد قادمة':'No upcoming deadlines'}</div>`;
    }else{
      agenda.innerHTML = rows.map(task => {
        const d = new Date(task.due_date + 'T12:00:00');
        const day = d.getDate();
        const month = d.toLocaleDateString((typeof prefs!=='undefined'&&prefs.lang==='ar')?'ar-KW':'en-GB',{month:'short'});
        return `<article class="agenda-card" data-agenda-task="${task.id}"><div class="agenda-date"><span>${month}</span><b>${day}</b></div><div><div class="agenda-title">${typeof esc==='function'?esc(task.title):task.title}</div><div class="subtle">${typeof stageLabel==='function'?stageLabel(task.status):task.status}</div></div><span class="priority-pill p-${String(task.priority||'LOW').toLowerCase()}">${typeof priorityLabel==='function'?priorityLabel(task.priority):task.priority}</span></article>`;
      }).join('');
    }
    body.prepend(agenda);
    agenda.querySelectorAll('[data-agenda-task]').forEach(el => el.addEventListener('click', () => {
      try{ state.selected = el.dataset.agendaTask; renderPage(); }catch{}
    }));
  }

  function keepModalBodyLocked(){
    document.body.classList.toggle('modal-open', !!document.querySelector('.modal-backdrop'));
  }

  function enhance(){
    setDeviceClass();
    syncSidebarBackdrop();
    enhanceBottomNav();
    labelResponsiveTables();
    enhanceKanbanTouch();
    enhanceCalendarAgenda();
    keepModalBodyLocked();
  }

  const observer = new MutationObserver(() => requestAnimationFrame(enhance));
  const start = () => {
    observer.observe(document.getElementById('app') || document.body, {childList:true,subtree:true});
    observer.observe(document.body, {childList:true});
    enhance();
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(enhance, 90);
  }, {passive:true});
  window.addEventListener('orientationchange', () => setTimeout(enhance, 120), {passive:true});
})();
