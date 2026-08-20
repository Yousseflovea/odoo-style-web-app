/* TaskDesk professional reporting + PDF/print layer */
(() => {
  'use strict';

  const RS = window.tdReportState || (window.tdReportState = {
    from: '',
    to: '',
    dateField: 'start_date',
    status: '',
    priority: '',
    assignee: '',
    query: ''
  });

  function ar(){ try{return prefs.lang === 'ar';}catch{return false;} }
  function L(arText,enText){ return ar() ? arText : enText; }
  function safe(v=''){ try{return esc(v ?? '');}catch{return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));} }
  function asDateValue(task, field){
    const raw = task?.[field];
    if(!raw) return '';
    return String(raw).slice(0,10);
  }
  function displayDate(v){
    if(!v) return '—';
    try{return new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString(ar()?'ar-KW':'en-GB',{day:'2-digit',month:'short',year:'numeric'});}catch{return String(v).slice(0,10);}
  }
  function displayDateTime(v){
    if(!v) return '—';
    try{return new Date(v).toLocaleString(ar()?'ar-KW':'en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch{return String(v);}
  }
  function creatorName(task){
    try{const p=profile(task.created_by);return p?.full_name||p?.email||'—';}catch{return '—';}
  }
  function assigneeNames(task){
    try{
      const xs=assignees(task.id);
      return xs.length ? xs.map(x=>x.full_name||x.email).join(', ') : '—';
    }catch{return '—';}
  }
  function reviewerNames(task){
    try{
      const xs=reviewers(task.id);
      return xs.length ? xs.map(x=>x.full_name||x.email).join(', ') : '—';
    }catch{return '—';}
  }
  function openLike(task){return !['RESOLVED','CLOSED','CANCELLED'].includes(task.status);}

  function reportRows(){
    let arr = Array.isArray(tasks) ? [...tasks] : [];
    if(RS.from) arr = arr.filter(x => asDateValue(x,RS.dateField) && asDateValue(x,RS.dateField) >= RS.from);
    if(RS.to) arr = arr.filter(x => asDateValue(x,RS.dateField) && asDateValue(x,RS.dateField) <= RS.to);
    if(RS.status) arr = arr.filter(x => x.status === RS.status);
    if(RS.priority) arr = arr.filter(x => x.priority === RS.priority);
    if(RS.assignee) arr = arr.filter(x => {
      try{return access.some(a => a.task_id===x.id && a.user_id===RS.assignee && a.access_level==='ASSIGNEE');}catch{return false;}
    });
    if(RS.query){
      const q=RS.query.toLowerCase().trim();
      arr=arr.filter(x => [x.task_number,x.title,x.description,x.analysis,x.diagnosis,x.resolution,x.status,x.priority,assigneeNames(x),creatorName(x)].join(' ').toLowerCase().includes(q));
    }
    return arr.sort((a,b)=>Number(b.task_number||0)-Number(a.task_number||0));
  }

  function reportFilterLabel(){
    const parts=[];
    if(RS.from||RS.to) parts.push(`${displayDate(RS.from)||'—'} - ${displayDate(RS.to)||'—'}`);
    if(RS.status) parts.push(stageLabel(RS.status));
    if(RS.priority) parts.push(priorityLabel(RS.priority));
    if(RS.assignee){ const p=profile(RS.assignee); if(p) parts.push(p.full_name||p.email); }
    if(RS.query) parts.push(`“${RS.query}”`);
    return parts.length ? parts.join(' | ') : L('كل البيانات','All data');
  }

  function statusCounts(arr){
    const sts = typeof STAGES!=='undefined' ? STAGES : ['NEW','IN_PROGRESS','WAITING','BLOCKED','RESOLVED','CLOSED'];
    return Object.fromEntries(sts.map(s=>[s,arr.filter(x=>x.status===s).length]));
  }
  function priorityCounts(arr){
    const ps=['URGENT','HIGH','MEDIUM','LOW'];
    return Object.fromEntries(ps.map(p=>[p,arr.filter(x=>x.priority===p).length]));
  }
  function workloadRows(arr){
    const map=new Map();
    for(const task of arr){
      let names=[];
      try{names=assignees(task.id).map(x=>x.full_name||x.email).filter(Boolean);}catch{}
      if(!names.length) names=[L('غير مسند','Unassigned')];
      names.forEach(n=>map.set(n,(map.get(n)||0)+1));
    }
    return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
  }

  function miniBarRows(counts, labels){
    const max=Math.max(1,...Object.values(counts));
    return Object.keys(counts).map(k=>`<div class="td-report-bar-row"><span>${safe(labels(k))}</span><div class="td-report-bar"><i style="width:${Math.round((counts[k]/max)*100)}%"></i></div><b>${counts[k]}</b></div>`).join('');
  }

  function renderReports(){
    const m=document.getElementById('main');
    if(!m) return;
    m.innerHTML = cp(t('reports'),{create:false,views:false}) + `<div class="content" id="td-report-body"></div>`;
    const q=document.getElementById('global-search');
    if(q){ q.placeholder=L('ابحث داخل التقرير...','Search report data...'); q.value=RS.query; q.oninput=()=>{RS.query=q.value;renderReportBody();}; }
    const fb=document.getElementById('filter-btn'); if(fb) fb.style.display='none';
    renderReportBody();
  }
  window.renderReports = renderReports;

  function renderReportBody(){
    const body=document.getElementById('td-report-body');
    if(!body) return;
    const arr=reportRows();
    const sc=statusCounts(arr), pc=priorityCounts(arr);
    const total=arr.length, open=arr.filter(openLike).length, resolved=arr.filter(x=>x.status==='RESOLVED').length, closed=arr.filter(x=>x.status==='CLOSED').length, urgent=arr.filter(x=>['URGENT','HIGH'].includes(x.priority)).length;
    const sts=typeof STAGES!=='undefined'?STAGES:['NEW','IN_PROGRESS','WAITING','BLOCKED','RESOLVED','CLOSED'];

    body.innerHTML = `
      <section class="o-card td-report-filters">
        <div class="td-report-filter-head">
          <div><h2>${L('مركز التقارير','Reporting Center')}</h2><div class="subtle">${L('فلتر مرة واحدة وصدّر نفس النتائج بأي شكل PDF تحتاجه.','Filter once, then export the same result set in any PDF format.')}</div></div>
          <button class="btn" id="report-reset">${L('مسح الفلاتر','Reset Filters')}</button>
        </div>
        <div class="td-report-filter-grid">
          <label><span>${L('نوع التاريخ','Date Basis')}</span><select id="report-date-field">
            <option value="start_date" ${RS.dateField==='start_date'?'selected':''}>${L('تاريخ البدء','Start Date')}</option>
            <option value="created_at" ${RS.dateField==='created_at'?'selected':''}>${L('تاريخ الإنشاء','Created Date')}</option>
            <option value="due_date" ${RS.dateField==='due_date'?'selected':''}>${L('تاريخ الاستحقاق','Due Date')}</option>
            <option value="closed_at" ${RS.dateField==='closed_at'?'selected':''}>${L('تاريخ الإغلاق','Closed Date')}</option>
          </select></label>
          <label><span>${L('من','From')}</span><input id="report-from" type="date" value="${safe(RS.from)}"></label>
          <label><span>${L('إلى','To')}</span><input id="report-to" type="date" value="${safe(RS.to)}"></label>
          <label><span>${L('الحالة','Status')}</span><select id="report-status"><option value="">${L('الكل','All')}</option>${sts.map(s=>`<option value="${s}" ${RS.status===s?'selected':''}>${safe(stageLabel(s))}</option>`).join('')}</select></label>
          <label><span>${L('الأولوية','Priority')}</span><select id="report-priority"><option value="">${L('الكل','All')}</option>${['URGENT','HIGH','MEDIUM','LOW'].map(p=>`<option value="${p}" ${RS.priority===p?'selected':''}>${safe(priorityLabel(p))}</option>`).join('')}</select></label>
          <label><span>${L('المسؤول','Assignee')}</span><select id="report-assignee"><option value="">${L('الكل','All')}</option>${profiles.map(p=>`<option value="${p.id}" ${RS.assignee===p.id?'selected':''}>${safe(p.full_name||p.email||p.id)}</option>`).join('')}</select></label>
        </div>
        <div class="td-report-filter-summary"><b>${total}</b> ${L('كيس ضمن الفلتر الحالي','cases in current filter')} <span>${safe(reportFilterLabel())}</span></div>
      </section>

      <section class="td-report-actions">
        <article class="o-card td-report-action-card">
          <div class="td-report-action-icon">Σ</div><div><h3>${L('تقرير سامري','Summary Report')}</h3><p>${L('مؤشرات وحالات وأولويات وتوزيع العمل في صفحة إدارة مختصرة.','Executive KPIs, status, priority and workload overview.')}</p></div>
          <button class="btn btn-primary" data-report="summary">${L('PDF / طباعة','PDF / Print')}</button>
        </article>
        <article class="o-card td-report-action-card">
          <div class="td-report-action-icon">≡</div><div><h3>${L('تقرير تفصيلي','Detailed Report')}</h3><p>${L('جدول أفقي A4 بالتفاصيل الأساسية والمحتوى الفني لكل كيس.','A4 landscape table with operational and technical case details.')}</p></div>
          <button class="btn btn-primary" data-report="detail">${L('PDF / طباعة','PDF / Print')}</button>
        </article>
        <article class="o-card td-report-action-card">
          <div class="td-report-action-icon">▤</div><div><h3>${L('فورم لكل كيس','Case Forms')}</h3><p>${L('كل كيس يبدأ في صفحة مستقلة بفورم ثابت يشمل التفاصيل والتحليل والحل والهيستوري.','Each case starts on its own professional form page, including history.')}</p></div>
          <button class="btn btn-primary" data-report="cases">${L('PDF / طباعة','PDF / Print')}</button>
        </article>
      </section>

      <section class="td-report-kpis">
        ${[[L('إجمالي الكيسس','Total Cases'),total],[L('مفتوحة','Open'),open],[L('تم الحل','Resolved'),resolved],[L('مغلقة','Closed'),closed],[L('High / Urgent','High / Urgent'),urgent]].map(([l,n])=>`<div class="o-card td-report-kpi"><span>${l}</span><b>${n}</b></div>`).join('')}
      </section>

      <section class="td-report-grid">
        <div class="o-card td-report-panel"><h3>${L('حسب الحالة','By Status')}</h3>${miniBarRows(sc,s=>stageLabel(s))}</div>
        <div class="o-card td-report-panel"><h3>${L('حسب الأولوية','By Priority')}</h3>${miniBarRows(pc,p=>priorityLabel(p))}</div>
        <div class="o-card td-report-panel"><h3>${L('توزيع العمل','Workload')}</h3>${workloadRows(arr).length?workloadRows(arr).map(([n,c])=>`<div class="td-report-workload"><span>${safe(n)}</span><b>${c}</b></div>`).join(''):`<div class="subtle">${L('لا توجد بيانات','No data')}</div>`}</div>
      </section>

      <section class="o-card td-report-results">
        <div class="td-report-results-head"><div><h3>${L('الكيسس داخل الفلتر','Cases in Filter')}</h3><div class="subtle">${L('كل التقارير أعلاه تستخدم هذه النتائج فقط.','All export options above use exactly this result set.')}</div></div><b>${total}</b></div>
        ${reportPreviewTable(arr)}
      </section>`;

    bindReportControls();
  }

  function reportPreviewTable(arr){
    if(!arr.length) return `<div class="td-report-empty">${L('لا توجد كيسس مطابقة للفلاتر الحالية.','No cases match the current filters.')}</div>`;
    return `<div class="td-report-table-wrap"><table class="td-report-table"><thead><tr><th>#</th><th>${L('العنوان','Title')}</th><th>${L('الحالة','Status')}</th><th>${L('الأولوية','Priority')}</th><th>${L('تاريخ البدء','Start')}</th><th>${L('المسؤول','Assignee')}</th><th>${L('آخر تحديث','Updated')}</th></tr></thead><tbody>${arr.slice(0,100).map(x=>`<tr data-report-task="${x.id}"><td>${x.task_number||''}</td><td>${safe(x.title)}</td><td>${safe(stageLabel(x.status))}</td><td>${safe(priorityLabel(x.priority))}</td><td>${displayDate(x.start_date)}</td><td>${safe(assigneeNames(x))}</td><td>${displayDateTime(x.updated_at)}</td></tr>`).join('')}</tbody></table></div>${arr.length>100?`<div class="subtle td-report-limit">${L('المعاينة تعرض أول 100 كيس فقط، لكن الـPDF يشمل كل النتائج.','Preview shows the first 100 cases; PDF includes all filtered results.')}</div>`:''}`;
  }

  function bindReportControls(){
    const set=(id,key,evt='change')=>{const el=document.getElementById(id);if(el)el.addEventListener(evt,()=>{RS[key]=el.value;renderReportBody();});};
    set('report-date-field','dateField'); set('report-from','from'); set('report-to','to'); set('report-status','status'); set('report-priority','priority'); set('report-assignee','assignee');
    document.getElementById('report-reset')?.addEventListener('click',()=>{Object.assign(RS,{from:'',to:'',dateField:'start_date',status:'',priority:'',assignee:'',query:''});const q=document.getElementById('global-search');if(q)q.value='';renderReportBody();});
    document.querySelectorAll('[data-report]').forEach(btn=>btn.addEventListener('click',()=>exportReport(btn.dataset.report)));
    document.querySelectorAll('[data-report-task]').forEach(row=>row.addEventListener('click',()=>{try{state.selected=row.dataset.reportTask;renderPage();}catch{}}));
  }

  function exportReport(type){
    const arr=reportRows();
    if(!arr.length){toast(L('لا توجد بيانات للطباعة','No data to print'));return;}
    const w=window.open('','_blank');
    if(!w){toast(L('اسمح بفتح النوافذ المنبثقة لإخراج PDF','Please allow popups to export PDF'));return;}
    w.document.write(`<html><head><meta charset="utf-8"><title>TaskDesk Report</title></head><body style="font-family:Arial,sans-serif;padding:24px">${L('جاري تجهيز التقرير...','Preparing report...')}</body></html>`);
    w.document.close();
    (async()=>{
      try{
        let historyMap={};
        if(type==='cases') historyMap=await loadReportHistories(arr);
        const doc = type==='summary' ? summaryPrintDoc(arr) : type==='detail' ? detailPrintDoc(arr) : casesPrintDoc(arr,historyMap);
        w.document.open(); w.document.write(doc); w.document.close();
      }catch(e){
        w.document.open(); w.document.write(`<pre>${safe(e.message||String(e))}</pre>`); w.document.close();
        try{toast(e.message||String(e));}catch{}
      }
    })();
  }

  async function loadReportHistories(arr){
    const out={};
    const ids=arr.map(x=>x.id).filter(Boolean);
    for(let i=0;i<ids.length;i+=40){
      const batch=ids.slice(i,i+40);
      const q=`task_id=in.(${batch.join(',')})&select=id,task_id,event_type,title,details,occurred_at,created_at,created_by,is_system&order=occurred_at.asc`;
      let rows=[]; try{rows=await rest('task_history',q);}catch{rows=[];}
      for(const h of rows||[]){(out[h.task_id]||(out[h.task_id]=[])).push(h);}
    }
    return out;
  }

  function printMeta(){
    return {generatedBy:me?.full_name||me?.email||'TaskDesk',generatedAt:new Date().toLocaleString(ar()?'ar-KW':'en-GB'),filter:reportFilterLabel()};
  }
  function printCss(landscape=false){
    return `<style>
      @page{size:A4 ${landscape?'landscape':'portrait'};margin:${landscape?'8mm':'10mm'}}
      *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#1d2433;font-family:Arial,'Segoe UI',sans-serif;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{padding:0}.rpt{width:100%}.brandbar{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #714B67;padding:0 0 8px;margin-bottom:10px}.brand{display:flex;align-items:center;gap:9px}.mark{width:30px;height:30px;border-radius:7px;background:#714B67;color:#fff;display:grid;place-items:center;font-size:18px;font-weight:700}.brand h1{font-size:18px;margin:0}.muted{color:#6d7480}.meta{font-size:8px;text-align:right;line-height:1.45}.section-title{font-size:11px;color:#714B67;text-transform:uppercase;letter-spacing:.04em;margin:12px 0 6px;font-weight:700}.footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #ddd;padding-top:4px;font-size:7px;color:#777;display:flex;justify-content:space-between}
      table{width:100%;border-collapse:collapse}th{background:#714B67;color:#fff;text-align:left;font-size:7px;padding:5px 4px;border:1px solid #65425d}td{border:1px solid #d9dce2;padding:4px;vertical-align:top;line-height:1.3;word-break:break-word}tbody tr:nth-child(even){background:#f7f5f7}thead{display:table-header-group}tr{break-inside:avoid}
      .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.kpi{border:1px solid #ddd;border-radius:7px;padding:8px;background:#fafafa}.kpi b{display:block;font-size:20px;color:#714B67}.kpi span{font-size:8px;color:#5d6470}.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.box{border:1px solid #dcdfe5;border-radius:8px;padding:8px}.row{display:grid;grid-template-columns:120px 1fr 28px;gap:6px;align-items:center;margin:5px 0}.track{height:7px;background:#ececf0;border-radius:20px;overflow:hidden}.track i{display:block;height:100%;background:#714B67}.work{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:5px 0}
      .case-page{break-after:page;page-break-after:always;min-height:270mm;position:relative;padding-bottom:10mm}.case-page:last-child{break-after:auto;page-break-after:auto}.case-head{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:start;margin-bottom:8px}.case-no{font-size:24px;color:#714B67;font-weight:700}.case-title{font-size:18px;font-weight:700;margin:2px 0 4px}.pills{display:flex;gap:5px;flex-wrap:wrap}.pill{border:1px solid #bbb;border-radius:999px;padding:3px 7px;font-size:8px;background:#fafafa}.case-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:7px 0}.field{border:1px solid #dcdfe5;border-radius:6px;padding:6px;min-height:39px}.field label{display:block;font-size:7px;color:#6d7480;text-transform:uppercase;margin-bottom:3px}.field div{font-size:9px;font-weight:600}.section{border:1px solid #dcdfe5;border-radius:7px;margin-top:6px;overflow:hidden}.section h3{font-size:9px;margin:0;padding:5px 7px;background:#f3eff2;color:#714B67}.section .txt{padding:6px 7px;font-size:9px;line-height:1.35;white-space:pre-wrap}.history{font-size:8px}.history-item{display:grid;grid-template-columns:75px 110px 1fr;gap:6px;padding:4px 0;border-bottom:1px solid #eee}.history-item:last-child{border-bottom:0}
      .detail-table{table-layout:fixed}.detail-table th:nth-child(1){width:24px}.detail-table th:nth-child(2){width:95px}.detail-table th:nth-child(3){width:46px}.detail-table th:nth-child(4){width:43px}.detail-table th:nth-child(5){width:52px}.detail-table th:nth-child(6){width:72px}.detail-table th:nth-child(7){width:115px}.detail-table th:nth-child(8),.detail-table th:nth-child(9),.detail-table th:nth-child(10),.detail-table th:nth-child(11){width:150px}
    </style>`;
  }
  function printHeader(title, landscape=false){
    const m=printMeta();
    return `${printCss(landscape)}<div class="brandbar"><div class="brand"><div class="mark">✓</div><div><h1>TaskDesk</h1><div class="muted">${safe(title)}</div></div></div><div class="meta"><b>${safe(m.filter)}</b><br>${L('تم الإنشاء بواسطة','Generated by')}: ${safe(m.generatedBy)}<br>${safe(m.generatedAt)}</div></div>`;
  }

  function summaryPrintDoc(arr){
    const sc=statusCounts(arr),pc=priorityCounts(arr),wl=workloadRows(arr),total=arr.length,open=arr.filter(openLike).length,resolved=arr.filter(x=>x.status==='RESOLVED').length,closed=arr.filter(x=>x.status==='CLOSED').length,urgent=arr.filter(x=>['URGENT','HIGH'].includes(x.priority)).length;
    const sMax=Math.max(1,...Object.values(sc)), pMax=Math.max(1,...Object.values(pc));
    const body=`<div class="rpt">${printHeader(L('التقرير السامري','Summary Report'))}<div class="kpis">${[[L('إجمالي الكيسس','Total Cases'),total],[L('مفتوحة','Open'),open],[L('تم الحل','Resolved'),resolved],[L('مغلقة','Closed'),closed],[L('High / Urgent','High / Urgent'),urgent]].map(([l,n])=>`<div class="kpi"><b>${n}</b><span>${safe(l)}</span></div>`).join('')}</div><div class="two"><div><div class="section-title">${L('حسب الحالة','By Status')}</div><div class="box">${Object.keys(sc).map(s=>`<div class="row"><span>${safe(stageLabel(s))}</span><div class="track"><i style="width:${Math.round(sc[s]/sMax*100)}%"></i></div><b>${sc[s]}</b></div>`).join('')}</div></div><div><div class="section-title">${L('حسب الأولوية','By Priority')}</div><div class="box">${Object.keys(pc).map(p=>`<div class="row"><span>${safe(priorityLabel(p))}</span><div class="track"><i style="width:${Math.round(pc[p]/pMax*100)}%"></i></div><b>${pc[p]}</b></div>`).join('')}</div></div></div><div class="section-title">${L('توزيع العمل','Workload')}</div><div class="box">${wl.length?wl.map(([n,c])=>`<div class="work"><span>${safe(n)}</span><b>${c}</b></div>`).join(''):`<span class="muted">${L('لا توجد بيانات','No data')}</span>`}</div><div class="section-title">${L('أحدث الكيسس في النتيجة','Latest Cases in Result')}</div><table><thead><tr><th>#</th><th>${L('العنوان','Title')}</th><th>${L('الحالة','Status')}</th><th>${L('الأولوية','Priority')}</th><th>${L('تاريخ البدء','Start')}</th><th>${L('المسؤول','Assignee')}</th></tr></thead><tbody>${arr.slice(0,15).map(x=>`<tr><td>${x.task_number||''}</td><td>${safe(x.title)}</td><td>${safe(stageLabel(x.status))}</td><td>${safe(priorityLabel(x.priority))}</td><td>${displayDate(x.start_date)}</td><td>${safe(assigneeNames(x))}</td></tr>`).join('')}</tbody></table></div>`;
    return htmlDoc(L('TaskDesk Summary Report','TaskDesk Summary Report'),body);
  }

  function detailPrintDoc(arr){
    const body=`<div class="rpt">${printHeader(L('التقرير التفصيلي','Detailed Case Report'),true)}<table class="detail-table"><thead><tr><th>#</th><th>${L('العنوان','Title')}</th><th>${L('الحالة','Status')}</th><th>${L('الأولوية','Priority')}</th><th>${L('البدء','Start')}</th><th>${L('المسؤول','Assignee')}</th><th>${L('طلب العميل','Description')}</th><th>${L('التحليل','Analysis')}</th><th>${L('التشخيص','Diagnosis')}</th><th>${L('الحل والتنفيذ','Solution')}</th><th>${L('آخر تحديث','Updated')}</th></tr></thead><tbody>${arr.map(x=>`<tr><td>${x.task_number||''}</td><td>${safe(x.title)}</td><td>${safe(stageLabel(x.status))}</td><td>${safe(priorityLabel(x.priority))}</td><td>${displayDate(x.start_date)}</td><td>${safe(assigneeNames(x))}</td><td>${safe(x.description||'—')}</td><td>${safe(x.analysis||'—')}</td><td>${safe(x.diagnosis||'—')}</td><td>${safe(x.resolution||'—')}</td><td>${displayDateTime(x.updated_at)}</td></tr>`).join('')}</tbody></table></div>`;
    return htmlDoc(L('TaskDesk Detailed Report','TaskDesk Detailed Report'),body);
  }

  function historyUser(id){const p=profile(id);return p?.full_name||p?.email||'TaskDesk';}
  function casesPrintDoc(arr,historyMap){
    const pages=arr.map(x=>{
      const hs=(historyMap[x.id]||[]).slice(-8);
      return `<section class="case-page"><div class="brandbar"><div class="brand"><div class="mark">✓</div><div><h1>TaskDesk</h1><div class="muted">${L('تقرير كيس','Case Report')}</div></div></div><div class="meta">${L('تاريخ التقرير','Report Date')}: ${safe(new Date().toLocaleDateString(ar()?'ar-KW':'en-GB'))}<br>${L('الفلتر','Filter')}: ${safe(reportFilterLabel())}</div></div><div class="case-head"><div><div class="case-no">#${x.task_number||''}</div><div class="case-title">${safe(x.title)}</div><div class="pills"><span class="pill">${safe(stageLabel(x.status))}</span><span class="pill">${safe(priorityLabel(x.priority))}</span></div></div><div class="meta">${L('آخر تحديث','Last Updated')}<br><b>${displayDateTime(x.updated_at)}</b></div></div><div class="case-grid"><div class="field"><label>${L('تاريخ البدء','Start Date')}</label><div>${displayDate(x.start_date)}</div></div><div class="field"><label>${L('تاريخ الاستحقاق','Due Date')}</label><div>${displayDate(x.due_date)}</div></div><div class="field"><label>${L('تاريخ الإغلاق','Closed Date')}</label><div>${displayDate(x.closed_at)}</div></div><div class="field"><label>${L('أنشأها','Created By')}</label><div>${safe(creatorName(x))}</div></div><div class="field"><label>${L('المسؤول','Assignee')}</label><div>${safe(assigneeNames(x))}</div></div><div class="field"><label>${L('المراجع','Reviewer')}</label><div>${safe(reviewerNames(x))}</div></div><div class="field"><label>${L('تاريخ الإنشاء','Created')}</label><div>${displayDateTime(x.created_at)}</div></div><div class="field"><label>${L('الأولوية','Priority')}</label><div>${safe(priorityLabel(x.priority))}</div></div></div><div class="section"><h3>${L('بلاغ / طلب العميل','Client Request / Issue')}</h3><div class="txt">${safe(x.description||'—')}</div></div><div class="section"><h3>${L('التحليل','Analysis')}</h3><div class="txt">${safe(x.analysis||'—')}</div></div><div class="section"><h3>${L('التشخيص / السبب الجذري','Diagnosis / Root Cause')}</h3><div class="txt">${safe(x.diagnosis||'—')}</div></div><div class="section"><h3>${L('الحل والتنفيذ','Solution & Implementation')}</h3><div class="txt">${safe(x.resolution||'—')}</div></div><div class="section history"><h3>${L('الهيستوري','Activity History')}</h3><div class="txt">${hs.length?hs.map(h=>`<div class="history-item"><span>${displayDateTime(h.occurred_at||h.created_at)}</span><b>${safe(h.title||h.event_type||'Update')}</b><span>${safe(h.details||'')} <em class="muted">${safe(historyUser(h.created_by))}</em></span></div>`).join(''):`<span class="muted">${L('لا يوجد هيستوري مسجل','No history recorded')}</span>`}</div></div></section>`;
    }).join('');
    return htmlDoc(L('TaskDesk Case Forms','TaskDesk Case Forms'),`${printCss(false)}<div class="rpt">${pages}</div>`);
  }

  function htmlDoc(title,body){
    const dir=ar()?'rtl':'ltr';
    return `<!doctype html><html lang="${ar()?'ar':'en'}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(title)}</title></head><body>${body}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),650));<\/script></body></html>`;
  }
})();
