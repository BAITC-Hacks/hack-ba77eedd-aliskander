import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { createStore } from '../src/store.js';
import { createApp } from '../src/server.js';
import { createAIService } from '../src/ai.js';
import readiness from '../public/readiness-engine.cjs';
import match from '../public/match-engine.cjs';
import catalog from '../public/catalog-engine.cjs';
import milestones from '../public/milestones.cjs';
import interview from '../public/interview-rules.cjs';

const complete={title:'Запись на мастер-класс',context:'Администратор вручную сверяет свободные сеансы',need:'Сократить ручную запись',users:'Клиенты и администратор',data:'Учебное расписание',constraints:'Без оплаты в первой версии',expectedResult:'Прототип записи и отмены',successCriteria:'Пять сценариев записи проходят проверку',contact:'owner@example.test',interactionFormat:'Онлайн раз в неделю',requiredSkills:'HTML, JavaScript',difficulty:'Easy',requiredHours:'8'};

test('protected accounts: ownership, independent progress approval, persistence and consistent readiness',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'most-protected-')),file=join(dir,'db.json'),store=createStore(file);
  let reviews=0;
  const ai={status:()=>({configured:true}),assessReadiness:async(_,criteria)=>{reviews++;return criteria.map(c=>({key:c.key,points:1,hint:'Уточните содержание'}));}};
  const server=createApp(store,ai);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});});
  const root=`http://127.0.0.1:${server.address().port}`;
  function client(){let cookie='';return async(path,method='GET',body,status=200)=>{
    const response=await fetch(root+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
    if(response.headers.has('set-cookie')){const value=response.headers.get('set-cookie');assert.match(value,/HttpOnly/);assert.match(value,/SameSite=Strict/);cookie=value.split(';')[0];}
    const result=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(result)}`);return result;
  };}
  const anonymous=client(),business=client(),other=client(),team=client(),secondTeam=client();
  await anonymous('/tasks','POST',complete,401);
  const owner=await business('/auth/register','POST',{login:'studio',password:'test-pass-123',name:'Студия',role:'business'});
  await other('/auth/register','POST',{login:'another',password:'test-pass-123',name:'Другая студия',role:'business'});
  const student=await team('/auth/register','POST',{login:'orbit',password:'test-pass-123',name:'Orbit',role:'student'});
  const second=await secondTeam('/auth/register','POST',{login:'vector',password:'test-pass-123',name:'Вектор',role:'student'});
  assert.ok(!JSON.stringify(owner).includes('hash'));
  await team('/tasks','POST',complete,403);
  const draft=await business('/tasks','POST',{...complete,ownerId:student.user.id},201);
  assert.equal(draft.ownerId,owner.user.id);
  await anonymous('/tasks/'+draft.id,'GET',undefined,404);
  await other('/tasks/'+draft.id,'PATCH',{title:'Чужая правка'},403);
  assert.equal((await other('/tasks?all=true')).length,0);
  const rating=await business('/rating','POST',complete);assert.equal(rating.score,100);assert.equal(reviews,0);
  const quality=await business('/quality','POST',complete);assert.equal(reviews,1);assert.ok(quality.suggestions.length);assert.equal(quality.score,undefined);
  const published=await business('/tasks/'+draft.id+'/publish','POST',{});assert.equal(published.score,rating.score);
  const listed=await anonymous('/tasks?view=catalog');assert.equal(listed.sort,'rating');assert.equal(listed.items[0].score,rating.score);
  const offer=await team('/tasks/'+draft.id+'/proposals','POST',{teamId:owner.user.id,teamName:'Forged',idea:'Сетка времени',plan:'Сценарии, прототип, проверка',deadline:'2 недели'},201);
  assert.equal(offer.teamId,student.user.id);assert.equal(offer.teamName,'Orbit');
  const otherOffer=await secondTeam('/tasks/'+draft.id+'/proposals','POST',{idea:'Список времени',plan:'Макет, реализация, приёмка',deadline:'3 недели'},201);
  assert.equal((await team('/tasks/'+draft.id+'/proposals')).length,1);
  assert.equal((await anonymous('/tasks/'+draft.id+'/proposals')).length,0);
  await secondTeam('/students/'+student.user.id+'/profile','PUT',{},403);
  await team('/proposals/'+offer.id+'/status','PATCH',{status:'selected'},403);
  await other('/tasks/'+draft.id+'/selection','POST',{proposalIds:[offer.id]},403);
  await business('/tasks/'+draft.id+'/selection','POST',{proposalIds:[offer.id,otherOffer.id]});
  const stages=await team('/stages');assert.equal(stages.length,3);assert.equal((await business('/stages')).length,6);
  const result={result:'Согласованы основные сценарии записи',url:root+'/prototype.html'};
  await team('/stages/'+stages[0].id+'/submit','POST',result,409);
  await team('/tasks/'+draft.id+'/plan/accept','POST',{});
  await team('/stages/'+stages[1].id+'/submit','POST',result,409);
  await secondTeam('/stages/'+stages[0].id+'/submit','POST',result,403);
  for(const stage of stages){
    await team('/stages/'+stage.id+'/submit','POST',result);
    await team('/stages/'+stage.id+'/review','POST',{approved:true},403);
    await other('/stages/'+stage.id+'/review','POST',{approved:true},403);
    await business('/stages/'+stage.id+'/review','POST',{approved:true});
    await business('/stages/'+stage.id+'/review','POST',{approved:true},409);
  }
  assert.equal((await team('/stages')).reduce((sum,s)=>sum+(s.status==='approved'?s.points:0),0),100);
  assert.equal((await secondTeam('/stages')).filter(s=>s.status==='approved').length,0);
  assert.equal((await team('/students/'+student.user.id+'/profile')).completedTasks.length,1);
  await business('/tasks/'+draft.id,'PATCH',{stagePlan:'[]'},409);
  const none=await business('/tasks','POST',complete,201);await business('/tasks/'+none.id+'/publish','POST',{});
  await business('/tasks/'+none.id+'/selection','POST',{proposalIds:[]});assert.equal(store.getTask(none.id).selectedTeamIds.length,0);
  await team('/auth/logout','POST',{});await team('/stages','GET',undefined,401);
  await team('/auth/login','POST',{login:'orbit',password:'wrong-pass'},401);
  await team('/auth/login','POST',{login:'orbit',password:'test-pass-123'});
  assert.equal((await team('/auth/session')).user.id,student.user.id);
  const reopened=createStore(file);assert.equal(reopened.getTask(draft.id).score,100);assert.equal(reopened.getStudentProfile(student.user.id).completedTasks.length,1);
  assert.ok(!readFileSync(file,'utf8').includes('test-pass-123'));
  for(const path of ['/case.html','/prototype.html','/review-editor.js','/auth-ui.js','/readiness-engine.cjs'])assert.equal((await fetch(root+path)).status,200,path);
});

test('AI cannot skip three questions even for a complete description',async()=>{
  const task={title:'Запись',problem:complete.context,goal:complete.need,targetUsers:['Клиенты'],requirements:['Запись'],expectedResult:complete.expectedResult,acceptanceCriteria:['Пять сценариев'],requiredSkills:[],difficulty:null,estimatedDuration:'',recommendedTeamSize:null,data:'',constraints:'',contact:'',interactionFormat:'',missingInfo:[],assumptions:[]};
  const ready={status:'ready',task,summary:'Готово',questions:[]};
  const service=createAIService({apiKey:'fake',fetchImpl:async()=>({ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(ready)}]}]})})});
  const answers=[];for(let i=0;i<3;i++){
    const turn=await service.turn({action:i?'answer':'analyze',description:complete.context,answers});
    assert.equal(turn.status,'interview');assert.ok(turn.questions.length>=3-i);
    assert.ok(turn.questions.every(q=>!answers.some(a=>a.key===q.key)));
    answers.push({key:turn.questions[0].key,question:turn.questions[0].label,answer:'Подтверждаю описанные критерии'});
  }
  assert.equal((await service.turn({action:'answer',description:complete.context,answers})).status,'ready');
  assert.equal(interview.ensureMinimum(ready,{action:'improve',answers:[]}).status,'ready');
});

test('team matching merges skills without duplication and uses honest time and level limits',()=>{
  const team=match.profile({members:[{name:'Алия',role:'Frontend',skills:['JS','HTML'],level:'Advanced',availabilityHours:20},{name:'Тимур',role:'Backend',skills:['JavaScript','SQL'],level:'Beginner',availabilityHours:8}]});
  assert.equal(team.skills.length,3);assert.equal(team.level,'Beginner');assert.equal(team.availabilityHours,8);
  assert.equal(match.calculate(team,{requiredSkills:['JavaScript','SQL','HTML'],difficulty:'Easy',requiredHours:10}).breakdown.skills,100);
  assert.equal(match.calculate(team,{requiredSkills:['JavaScript'],difficulty:'Easy',requiredHours:10}).breakdown.availability,80);
  assert.equal(match.profile({...team,members:[...team.members,{name:'Новый',skills:[]}]}).availabilityHours,null);
  assert.throws(()=>match.profile({members:[{skills:['JS']}]}),/имя/);
});

test('readiness is prominent, business cards have no student prompt, and editor has single duration and team input',()=>{
  const window={MostCatalog:catalog,MostMilestones:milestones};
  const h=value=>String(value??'').replaceAll('<','&lt;').replaceAll('"','&quot;');
  for(const file of ['catalog-components.js','review-editor.js'])runInNewContext(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),{window});
  const components=window.createCatalogComponents(h);
  const card=components.TaskCard({...complete,id:'task',score:85},false);
  assert.match(card,/Готовность задачи/);assert.match(card,/85/);assert.ok(!card.includes('href="#profile"'));
  const html=window.MostReviewEditor({}, {h,categoryField:()=>'',field:(name)=>`<input name="${name}">`});
  assert.ok(html.includes('name="deadline"'));assert.ok(!html.includes('name="durationWeeks"'));assert.ok(!html.includes('name="teamSize"'));
  assert.ok(html.includes('milestone-criteria-0'));assert.ok(html.includes('quality-result'));
  assert.equal(readiness.describe({...complete,successCriteria:'Пока не знаю'}).score,85);
});

test('teaching case is repeatable, links working prototypes and follows the three-stage demo flow',async()=>{
  const window={},memory=new Map();
  const ctx={window,URL,URLSearchParams,location:{href:'http://localhost:3000/demo.html'},setTimeout:fn=>setTimeout(fn,0),localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)}};
  for(const file of ['readiness-engine.cjs','milestones.cjs','match-engine.cjs','catalog-engine.cjs','team-session.js','case-data.js','demo-api.js'])runInNewContext(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),ctx);
  const api=window.platformApi,first=await api.startCase(),second=await api.startCase();
  assert.notEqual(first.id,second.id);assert.equal(first.rating.total,100);
  const offers=await api.listOffers(first.id);assert.equal(offers.length,2);
  assert.ok(offers.every(o=>new URL(o.prototypeUrl).pathname==='/prototype.html'));
  assert.ok(offers.every(o=>o.studentProfile.members.length===2));
  const offer=offers.find(o=>o.teamId==='team-orbit');await api.selectOffers(first.id,[offer.id]);
  let progress=(await api.getWorkspace('student')).stages.filter(s=>s.taskId===first.id);assert.equal(progress.length,3);
  await assert.rejects(api.submitStage(progress[0].id,{result:'Готово',url:offers[0].prototypeUrl}));
  await api.acceptPlan(first.id);await api.submitStage(progress[0].id,{result:'Сценарии согласованы',url:offers[0].prototypeUrl});
  await api.reviewStage(progress[0].id,true,'Принято');
  progress=(await api.getWorkspace('student')).stages.filter(s=>s.taskId===first.id);
  assert.equal(progress.filter(s=>s.status==='approved').reduce((sum,s)=>sum+s.points,0),20);
  assert.equal((await api.getProfile()).completedTasks.length,0);
  await assert.rejects(api.reviewStage(progress[0].id,true,''));
});
