/* Catalog state, URL synchronization and cancellable, paged requests. */
(() => {
  window.createTaskCatalogPage = ({api,app,state,h,toast}) => {
    const model=window.MostCatalog, views=window.createCatalogComponents(h);
    const knownTasks=new Map(), saving=new Set();
    let active=null, aborter=null, searchTimer=null, generation=0;
    let lastCatalog='#catalog';
    try { const saved=sessionStorage.getItem('most-catalog-url'); if(saved?.startsWith('#catalog'))lastCatalog=saved; } catch (_) {}
    const currentId=()=>window.platformTeam.current.id;
    function dispose() { generation++; clearTimeout(searchTimer); aborter?.abort(); active=null; }
    function url(q,replace=false) { const query=model.serialize(q); lastCatalog='#catalog'+(query?'?'+query:''); history[replace?'replaceState':'pushState'](null,'',lastCatalog); try { sessionStorage.setItem('most-catalog-url',lastCatalog); } catch (_) {} }
    function countFilters(q) { return ['category','skills','difficulty','duration','teamSize','workFormat','status','readiness'].reduce((n,k)=>n+q[k].length,0)+Number(Boolean(q.minMatch))+Number(q.saved)+Number(q.recommended); }
    function sync(a) {
      document.querySelector('#catalog-active-filters').innerHTML=views.activeChips(a.q);
      document.querySelector('#filter-count').textContent=countFilters(a.q)||'';
      const filters=document.querySelector('#catalog-filters');
      filters.querySelectorAll('[data-filter]').forEach(input=> { const key=input.dataset.filter; if (input.type==='checkbox') input.checked=Array.isArray(a.q[key])?a.q[key].includes(input.value):Boolean(a.q[key]); else input.value=a.q[key]; });
      document.querySelector('#catalog-sort').value=a.q.sort||a.effectiveSort||'newest';
    }
    function change(patch, {replace=false,clear=false}={}) {
      const a=active; if(!a)return;
      clearTimeout(searchTimer);
      const search=document.querySelector('#catalog-search');
      a.q=clear?model.defaults():{...a.q,search:search.value.trim(),...patch,page:1};
      if(clear || Object.hasOwn(patch,'search'))search.value=a.q.search;
      sync(a);url(a.q,replace);load(a,false);
    }
    async function load(a,append=false) {
      aborter?.abort(); aborter=new AbortController(); const token=++generation;
      const valid=()=>active===a && token===generation && a.ticket===state.ticket && a.team===currentId();
      const grid=document.querySelector('#catalog-grid'),error=document.querySelector('#catalog-error');
      error.hidden=true;grid.setAttribute('aria-busy','true');
      if(!append) { document.querySelector('#catalog-count').textContent='Обновляем результаты…'; a.items=[];grid.innerHTML=views.TaskSkeleton();document.querySelector('#catalog-pagination').innerHTML=''; }
      else { const button=document.querySelector('#load-more-tasks'); if(button){button.disabled=true;button.textContent='Загружаем…';} }
      try {
        const result=await api.listCatalog(model.serialize(a.q),a.student,aborter.signal);
        if(!valid())return;
        a.effectiveSort=result.sort;
        if(!a.q.sort || (a.q.sort==='match' && !result.matchAvailable)){a.q.sort=result.sort;url(a.q,true);}
        a.items=append?[...a.items,...result.items.filter(t=>!a.items.some(old=>old.id===t.id))]:result.items;
        a.items.forEach(task=>knownTasks.set(task.id,task));
        a.pagination=result.pagination;
        grid.innerHTML=a.items.length?a.items.map(t=>views.TaskCard(t,a.student)).join(''):views.EmptyState(a.q);
        document.querySelector('#catalog-count').textContent=`${result.pagination.total} tasks found`;
        document.querySelector('#catalog-mode').textContent=a.student?(result.matchAvailable?'Match рассчитан по вашему профилю':'Заполните навыки и уровень в профиле для Match'):'Все опубликованные задачи';
        document.querySelector('#show-filter-results').textContent=`Показать ${result.pagination.total} задач`;
        document.querySelector('#catalog-sort').value=result.sort;
        if(!a.facetsReady){ document.querySelector('#catalog-filters').innerHTML=views.TaskFilters(a.q,result.facets,a.student); a.facetsReady=true; }
        sync(a);
        document.querySelector('#catalog-pagination').innerHTML=`<p>Показано ${a.items.length} из ${result.pagination.total}</p>${result.pagination.hasMore?'<button class="btn secondary" type="button" id="load-more-tasks">Load More ↓</button>':''}${a.startedPage>1?'<button type="button" class="catalog-clear" id="catalog-first-page">К первой странице</button>':''}`;
        document.querySelector('#load-more-tasks')?.addEventListener('click',()=>{a.q.page++;url(a.q);load(a,true);});
        document.querySelector('#catalog-first-page')?.addEventListener('click',()=>{a.startedPage=1;change({});});
      } catch(err) {
        if(!valid()||err.name==='AbortError')return;
        if(append)a.q.page=Math.max(1,a.q.page-1);
        url(a.q,true);
        if(!append)grid.innerHTML='';
        document.querySelector('#catalog-count').textContent='Не удалось загрузить задачи';
        error.hidden=false;error.innerHTML=`<div class="catalog-fetch-error"><strong>Попробуем ещё раз?</strong><p>${h(err.message||'Ошибка загрузки')}</p><button class="btn secondary small" type="button" id="retry-catalog">Повторить</button></div>`;
        document.querySelector('#retry-catalog').onclick=()=>{if(append)a.q.page++;load(a,append);};
        const button=document.querySelector('#load-more-tasks'); if(button){button.disabled=false;button.textContent='Load More ↓';}
      } finally {if(valid())grid.setAttribute('aria-busy','false');}
    }
    async function render(query,ticket) {
      dispose();
      const a={q:model.parse(query),ticket,student:state.role==='student',team:currentId(),items:[],facetsReady:false};a.startedPage=a.q.page;active=a;url(a.q,true);
      app.innerHTML=views.TaskCatalogPage(a.q,a.student);sync(a);
      document.querySelector('#catalog-search').oninput=event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>change({search:event.target.value.trim()}),400);};
      document.querySelector('#catalog-sort').onchange=event=>change({sort:event.target.value});
      const filterRoot=document.querySelector('#catalog-filters');
      filterRoot.addEventListener('change',event=>{
        const input=event.target.closest('[data-filter]');if(!input)return;const key=input.dataset.filter;
        const next=Array.isArray(a.q[key])?(input.checked?[...a.q[key],input.value]:a.q[key].filter(v=>v!==input.value)):input.type==='checkbox'?input.checked:input.value;
        change({[key]:next});
      });
      filterRoot.addEventListener('input',event=>{if(event.target.id!=='skill-filter-search')return;const term=event.target.value.toLowerCase();filterRoot.querySelectorAll('[data-skill-label]').forEach(label=>{label.hidden=!label.dataset.skillLabel.includes(term);});});
      const dialog=document.querySelector('#catalog-filter-dialog');
      document.querySelector('#open-catalog-filters').onclick=()=>{document.querySelector('#catalog-mobile-filter-host').appendChild(filterRoot);dialog.showModal();};
      const close=()=>dialog.close();
      document.querySelector('#close-catalog-filters').onclick=close;document.querySelector('#show-filter-results').onclick=close;
      dialog.addEventListener('close',()=>{const host=document.querySelector('#catalog-filter-host');if(host && active===a)host.appendChild(filterRoot);});
      await load(a);
    }
    app.addEventListener('click',async event=>{
      if(event.target.closest('[data-clear-filters]')){event.preventDefault();change({}, {clear:true});return;}
      const chip=event.target.closest('[data-remove-filter]');
      if(chip && active){const key=chip.dataset.removeFilter;change({[key]:Array.isArray(active.q[key])?active.q[key].filter(v=>v!==chip.dataset.value):['saved','recommended'].includes(key)?false:''});return;}
      const button=event.target.closest('[data-save-task]');if(!button)return;
      event.preventDefault();event.stopPropagation();
      const task=knownTasks.get(button.dataset.saveTask);if(!task||saving.has(task.id))return;
      const ticket=state.ticket,team=currentId();saving.add(task.id);button.disabled=true;
      try {
        const result=await api.saveTask(task.id,!task.isSaved);task.isSaved=result.isSaved;
        if(ticket!==state.ticket||team!==currentId())return;
        document.querySelectorAll('[data-save-task]').forEach(node=>{if(node.dataset.saveTask===task.id)node.outerHTML=views.SavedButton(task,true);});
        toast(result.isSaved?'Задача сохранена':'Задача удалена из сохранённых');
        if(active?.q.saved)change({});
      }catch(error){if(ticket===state.ticket)toast(error.message);}
      finally{saving.delete(task.id);if(button.isConnected)button.disabled=false;}
    });
    function detail(task,student) {
      knownTasks.set(task.id,task);
      return `<section class="catalog-detail-summary"><div><span class="eyebrow muted">Условия участия</span><strong class="apply-state ${task.canApply!==false?'open':'closed'}">${task.canApply!==false?'● Приём открыт':'○ Приём завершён'}</strong></div>${views.SavedButton(task,student)}<dl><div><dt>Duration</dt><dd>${h(task.deadline||'Уточняется')}</dd></div><div><dt>Team</dt><dd>${h(views.teamText(task))}</dd></div><div><dt>Format</dt><dd>${h(task.workFormat||'Уточняется')}</dd></div><div><dt>Applicants</dt><dd>${task.applicantsCount||0} команд</dd></div><div><dt>Application deadline</dt><dd>${h(views.deadlineText(task))}${task.applicationDeadline?` · ${h(task.applicationDeadline)}`:''}</dd></div></dl>${student?`<button class="btn small" type="button" data-match-apply="${h(task.id)}" ${task.canApply===false?'disabled':''}>${task.canApply===false?'Apply closed':'Apply →'}</button>`:''}</section>`;
    }
    return {render,dispose,detail,back:()=>lastCatalog};
  };
})();
