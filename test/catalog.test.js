import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import catalog from '../public/catalog-engine.cjs';
import fixtures from '../public/catalog-demo.cjs';
import matchDemo from '../public/match-demo.cjs';
import { createStore } from '../src/store.js';
import { createApp } from '../src/server.js';
const now=Date.UTC(2026,8,23,12);
const base={...matchDemo.task,published:true,publishedAt:'2026-09-22T12:00:00.000Z',applicationDeadline:'2026-09-28',durationWeeks:'3',teamSize:'2-3',workFormat:'Remote',score:90};
const tasks=[{...base,id:'a',title:'React dashboard',company:'Nova',applicantsCount:8},{...base,id:'b',title:'API для доставки',category:'Backend',requiredSkills:'Python, FastAPI, PostgreSQL',difficulty:'Hard',workFormat:'On-site',durationWeeks:'6',teamSize:'4-5',applicantsCount:2,publishedAt:'2026-09-23T10:00:00.000Z'},{...base,id:'c',title:'Форма записи',category:'Frontend',difficulty:'Easy',durationWeeks:'0.5',teamSize:'1',applicantsCount:0,applicationDeadline:'2026-09-24'}];
const context={now,student:matchDemo.student,savedIds:['a']};

test('catalog combines token search, multi filters, all selected skills, saved and recommendations',()=>{
  const result=catalog.query(tasks,'search=React+dashboard&category=fullstack,backend&skills=reactjs,postgres&difficulty=medium&duration=2-4&teamSize=2-3&workFormat=remote&status=open&minMatch=75&recommended=true&saved=true',context);
  assert.deepEqual(result.items.map(t=>t.id),['a']); assert.equal(result.items[0].matchScore,87); assert.equal(result.items[0].isSaved,true);
  assert.equal(catalog.query(tasks,{search:'nova',skills:'Docker'},context).pagination.total,1);
  assert.equal(catalog.query(tasks,{skills:'React,Python'},context).pagination.total,0);
  assert.equal(catalog.query(tasks,{category:'frontend,backend'},context).pagination.total,2);
  assert.equal(catalog.query(tasks,{status:'closing'},context).pagination.total,3);
  assert.equal(catalog.query(tasks,{search:'несуществующая задача'},context).pagination.total,0);
});

test('query round trip retains independent filters and safely bounds paging',()=>{
  const q=catalog.parse('search=React+dashboard&category=backend,frontend&skills=Spring+Boot,Docker&difficulty=hard&duration=4-8&teamSize=4-5&workFormat=hybrid&status=new&minMatch=90&saved=true&recommended=true&sort=duration&page=3&limit=12&readiness=70-89');
  assert.deepEqual(catalog.parse(catalog.serialize(q)),q);
  assert.equal(catalog.parse('page=-1&limit=1000&sort=bad&minMatch=nan').page,1);
  assert.equal(catalog.parse('limit=1000').limit,48);assert.equal(catalog.parse('category=not-real&difficulty=extreme').category.length,0);
  assert.equal(catalog.query(tasks,{saved:true},context).pagination.total,1);
});

test('sorts are deterministic, missing values go last, and pagination has no duplicates',()=>{
  for(const [sort,first] of [['newest','b'],['popular','a'],['deadline','c'],['difficulty','c'],['duration','c']]) assert.equal(catalog.query(tasks,{sort},context).items[0].id,first,sort);
  const matched=catalog.query(tasks,{},context);assert.equal(matched.sort,'match');assert.ok(matched.items.every((t,i,a)=>!i||a[i-1].matchScore>=t.matchScore));
  const anonymous=catalog.query(tasks,{sort:'match'},{now});assert.equal(anonymous.sort,'newest');assert.ok(anonymous.items.every(t=>t.matchScore===null));
  const incomplete=catalog.query(tasks,{}, {now,student:{skills:['React']}});assert.equal(incomplete.matchAvailable,false);
  const data=fixtures.build(now).tasks;
  const first=catalog.query(data,{page:1,limit:12},{now}), second=catalog.query(data,{page:2,limit:12},{now});
  assert.equal(first.items.length,12);assert.equal(first.pagination.hasMore,true);assert.equal(second.items.length,8);assert.equal(second.pagination.hasMore,false);
  assert.equal(new Set([...first.items,...second.items].map(t=>t.id)).size,20);
  const withUnknown=[...tasks,{id:'unknown',published:true,title:'Без сведений'}];
  for(const sort of ['newest','deadline','difficulty','duration'])assert.equal(catalog.query(withUnknown,{sort},context).items.at(-1).id,'unknown');
});

test('duration/team boundaries, date validation and deadline closure are explicit',()=>{
  assert.equal(catalog.durationWeeks({deadline:'2–3 weeks'}),3);assert.equal(catalog.durationWeeks({deadline:'3 дня'}),3/7);assert.equal(catalog.durationWeeks({deadline:'2 месяца'}),8);
  for(const [weeks,range] of [[0.5,'under-1'],[1,'1-2'],[2,'1-2'],[3,'2-4'],[4,'2-4'],[6,'4-8'],[8,'4-8'],[9,'8-plus']])assert.equal(catalog.query([{...base,durationWeeks:String(weeks)}],{duration:range},{now}).pagination.total,1);
  assert.equal(catalog.query([{...base,teamSize:'4-5'}],{teamSize:'5-plus'},{now}).pagination.total,1);
  assert.equal(catalog.canApply({...base,applicationDeadline:'2026-09-22'},now),false);
  assert.equal(catalog.canApply({...base,applicationDeadline:'2026-09-23'},now),true);
  assert.equal(catalog.canApply({...base,selectionDone:true},now),false);
  assert.equal(catalog.deadlineTime('2026-02-30'),null);
  assert.throws(()=>catalog.validateFields({applicationDeadline:'2026-02-30'}));
  assert.throws(()=>catalog.validateFields({workFormat:'anywhere'}));
  const expired=catalog.enrich({...base,applicationDeadline:'2026-09-22'},context);assert.equal(expired.isExpired,true);assert.equal(expired.isClosingSoon,false);
  assert.equal(catalog.query([{...base,published:false}],{},context).pagination.total,0);
});

test('catalog HTTP API and frontend adapter preserve old routes, persist bookmarks and reject expired applications',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'most-catalog-')),file=join(dir,'db.json');
  const store=createStore(file);store.saveStudentProfile('team-orbit',matchDemo.student);
  for(let i=0;i<15;i++){const task=store.createTask({title:'React dashboard '+i,context:'Описание CRM',company:'Nova',category:'Fullstack',requiredSkills:base.requiredSkills,difficulty:'Medium',durationWeeks:'3',teamSize:'2-3',workFormat:'Remote',applicationDeadline:i===0?'2000-01-01':'2099-10-05',requiredHours:'10'});store.publishTask(task.id);}
  const app=createApp(store);app.listen(0,'127.0.0.1');await once(app,'listening');
  t.after(async()=>{await new Promise(resolve=>app.close(resolve));rmSync(dir,{recursive:true,force:true});});
  const root=`http://127.0.0.1:${app.address().port}`;
  async function request(path,method='GET',body,status=200){const r=await fetch(root+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert.equal(r.status,status,path);return r.json();}
  assert.equal(Array.isArray(await request('/api/tasks')),true);assert.equal(Array.isArray(await request('/api/tasks?all=true')),true);
  for(const path of ['/catalog-engine.cjs','/catalog-demo.cjs','/catalog-components.js','/catalog-page.js']){const r=await fetch(root+path);assert.equal(r.status,200);assert.ok(r.headers.get('content-type').includes('javascript'));}
  const page=await request('/api/tasks?category=fullstack&skills=react,postgres&studentId=team-orbit&sort=match&page=1&limit=12');
  assert.equal(page.items.length,12);assert.equal(page.pagination.total,15);assert.ok(page.items.every(t=>t.matchScore===87));
  const target=page.items.find(t=>t.canApply),expired=store.listTasks().find(t=>t.applicationDeadline==='2000-01-01');
  await request('/api/students/team-orbit/saved/'+target.id,'PUT',{saved:true});
  assert.equal(createStore(file).queryCatalog({saved:true},'team-orbit').pagination.total,1);
  assert.equal((await request('/api/tasks?view=catalog&saved=true&studentId=team-other')).pagination.total,0);
  await request('/api/tasks/'+expired.id+'/proposals','POST',{teamName:'Orbit',teamId:'team-orbit',idea:'CRM',plan:'План',deadline:'3 недели'},409);
  for(let i=0;i<2;i++)await request('/api/tasks/'+target.id+'/proposals','POST',{teamName:'Orbit',teamId:'team-orbit',idea:'Вариант '+i,plan:'План',deadline:'3 недели'},201);
  const detail=await request('/api/tasks/'+target.id+'?studentId=team-orbit');assert.equal(detail.applicantsCount,1);assert.equal(detail.offerCount,2);assert.equal(detail.isSaved,true);
  const window={platformTeam:{current:{id:'team-orbit',name:'Orbit'}}};
  let calls=0;
  runInNewContext(readFileSync(new URL('../public/api-client.js',import.meta.url),'utf8'),{window,URLSearchParams,fetch:(path,options)=>{calls++;return fetch(root+path,options);},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}});
  const api=window.platformApi;
  const result=await api.listCatalog('saved=true&limit=12',true);assert.equal(calls,1);assert.equal(result.items.length,1);assert.equal(result.items[0].matchScore,87);assert.equal(result.items[0].problem,'Описание CRM');
  await api.saveTask(target.id,false);assert.equal((await api.listCatalog('saved=true',true)).pagination.total,0);
  await request('/api/tasks','POST',{applicationDeadline:'2026-02-30'},400);
});

test('offline catalog has 20 additional tasks and bookmarks survive reloading the adapter',async()=>{
  const memory=new Map();
  function boot(){const window={platformTeam:{current:{id:'team-orbit',name:'Orbit'}}};const ctx={window,URL,URLSearchParams,setTimeout:callback=>setTimeout(callback,0),localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)}};
    for(const name of ['match-engine.cjs','match-demo.cjs','catalog-engine.cjs','catalog-demo.cjs','demo-api.js'])runInNewContext(readFileSync(new URL('../public/'+name,import.meta.url),'utf8'),ctx);return window.platformApi;}
  let api=boot();await api.saveProfile(matchDemo.student);
  const first=await api.listCatalog('limit=12',true);assert.equal(first.items.length,12);assert.ok(first.pagination.total>=20);
  const target=first.items[0];await api.saveTask(target.id,true);api=boot();assert.equal((await api.listCatalog('saved=true',true)).items[0].id,target.id);
  const all=await api.listCatalog('limit=48',true);assert.ok(all.items.some(t=>t.applicantsCount>0));assert.ok(all.items.some(t=>t.canApply===false));assert.ok(all.items.some(t=>t.workFormat==='Remote'));
});

test('catalog cards escape input, expose saved state and hide invalid or absent Match scores',()=>{
  const window={MostCatalog:catalog};runInNewContext(readFileSync(new URL('../public/catalog-components.js',import.meta.url),'utf8'),{window});
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const views=window.createCatalogComponents(h),task=catalog.enrich({...tasks[0],title:'<img src=x onerror=alert(1)>'},context);
  const card=views.TaskCard(task,true);assert.ok(!card.includes('<img'));assert.ok(card.includes('aria-pressed="true"'));assert.ok(card.includes('87'));assert.ok(card.includes('task-card-link'));
  for(const matchScore of [null,NaN,-1,101,'87'])assert.ok(views.TaskCard({...task,matchScore},true).includes('Complete your profile'));
  assert.ok(views.EmptyState({...catalog.defaults(),saved:true}).includes('saved'));
  assert.equal((views.TaskSkeleton().match(/class="catalog-skeleton"/g)||[]).length,6);
});

test('catalog controller debounces search, aborts stale requests, preserves filters and appends pages',async()=>{
  const nodes=new Map(),timers=new Map(),requests=[],historyCalls=[];let timerId=0;
  function node(key){if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',value:'',isConnected:true,handlers:{},dataset:{},setAttribute(){},querySelectorAll(){return[];},addEventListener(type,fn){this.handlers[type]=fn;},appendChild(child){child.parent=this;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}});return nodes.get(key);}
  const window={MostCatalog:catalog,platformTeam:{current:{id:'team-orbit',name:'Orbit'}}};
  const state={role:'student',ticket:1};const ctx={window,document:{querySelector:node,querySelectorAll:()=>[]},AbortController,sessionStorage:{getItem:()=>null,setItem(){}},history:{pushState:(_,__,url)=>historyCalls.push(url),replaceState:(_,__,url)=>historyCalls.push(url)},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)};
  for(const file of ['catalog-components.js','catalog-page.js'])runInNewContext(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),ctx);
  const data=fixtures.build(now).tasks;
  const api={listCatalog:(query,student,signal)=>new Promise(resolve=>requests.push({query,student,signal,resolve})),saveTask:async(id,saved)=>({taskId:id,isSaved:saved})};
  const page=window.createTaskCatalogPage({api,app:node('#app'),state,h:v=>String(v??''),toast(){}});
  const resolve=index=>requests[index].resolve(catalog.query(data,requests[index].query,context));
  const tick=()=>new Promise(setImmediate);
  const mounting=page.render('',1);assert.equal(requests.length,1);resolve(0);await mounting;assert.ok(node('#catalog-count').textContent.includes('20'));
  const input=node('#catalog-search');input.value='React';input.oninput({target:input});input.value='React dashboard';input.oninput({target:input});assert.equal(timers.size,1);assert.equal(requests.length,1);
  const callback=[...timers.values()][0];timers.clear();callback();assert.equal(requests.length,2);assert.ok(requests[1].query.includes('React+dashboard'));
  const checkbox={dataset:{filter:'category'},value:'frontend',checked:true,type:'checkbox'};
  node('#catalog-filters').handlers.change({target:{closest:()=>checkbox}});assert.equal(requests.length,3);assert.equal(requests[1].signal.aborted,true);
  resolve(1);await tick();assert.ok(!node('#catalog-count').textContent.includes('20'));
  resolve(2);await tick();assert.equal(node('#catalog-count').textContent,'1 tasks found');
  node('#catalog-sort').onchange({target:{value:'duration'}});assert.ok(requests[3].query.includes('category=frontend'));assert.ok(requests[3].query.includes('search=React+dashboard'));resolve(3);await tick();
  node('#app').handlers.click({preventDefault(){},target:{closest:selector=>selector==='[data-clear-filters]'?{}:null}});resolve(4);await tick();assert.equal(node('#catalog-count').textContent,'20 tasks found');
  node('#load-more-tasks').handlers.click();assert.ok(requests[5].query.includes('page=2'));resolve(5);await tick();assert.ok(node('#catalog-pagination').innerHTML.includes('Показано 20 из 20'));
  const difficulty={dataset:{filter:'difficulty'},value:'hard',checked:true,type:'checkbox'};node('#catalog-filters').handlers.change({target:{closest:()=>difficulty}});
  assert.ok(!requests[6].query.includes('page=2'));assert.ok(requests[6].query.includes('difficulty=hard'));resolve(6);await tick();
  node('#open-catalog-filters').onclick();assert.equal(node('#catalog-filter-dialog').open,true);assert.equal(node('#catalog-filters').parent,node('#catalog-mobile-filter-host'));
  node('#close-catalog-filters').onclick();assert.equal(node('#catalog-filters').parent,node('#catalog-filter-host'));
  assert.ok(historyCalls.at(-1).includes('difficulty=hard'));assert.equal(page.back(),historyCalls.at(-1));page.dispose();
});
