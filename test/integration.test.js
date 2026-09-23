import readiness from '../public/readiness-engine.cjs';
import milestones from '../public/milestones.cjs';
import interviewRules from '../public/interview-rules.cjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { createStore } from '../src/store.js';
import { createApp as createProtectedApp } from '../src/server.js';
const createApp=(store,ai)=>createProtectedApp(store,ai,{authorize:false});

const adapterSource = readFileSync(new URL('../public/api-client.js', import.meta.url), 'utf8');
const autosaveSource = readFileSync(new URL('../public/draft-autosave.js', import.meta.url), 'utf8');

test('real frontend adapter: draft, existing rating, publication, proposals, selection and confirmed progress', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'most-integration-'));
  const file = join(dir, 'db.json');
  // Migration must preserve a teammate's database which predates stages.
  writeFileSync(file, JSON.stringify({ tasks: [], proposals: [] }));
  const app = createApp(createStore(file));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  const base = `http://127.0.0.1:${app.address().port}`;
  const memory = new Map();
  function adapter() {
    const window = {MostReadiness:readiness,MostMilestones:milestones,MostInterview:interviewRules};
    runInNewContext(adapterSource, { window, fetch: (path, options) => fetch(base + path, options),
      localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) } });
    return window.platformApi;
  }
  let api = adapter();
  for (const [path, type] of [['/', 'text/html'], ['/demo.html', 'text/html'], ['/styles.css', 'text/css'], ['/api-client.js', 'text/javascript'], ['/team-session.js', 'text/javascript'], ['/draft-autosave.js', 'text/javascript'], ['/demo-api.js', 'text/javascript'], ['/app.js', 'text/javascript']]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path); assert.ok(response.headers.get('content-type').includes(type));
  }
  assert.equal((await fetch(base + '/src/store.js')).status, 404);
  assert.equal((await fetch(base + '/api/rating', { method: 'POST', body: 'null' })).status, 400);
  const draft = { title: 'Прогноз продаж', company: 'Зёрна', category: 'Аналитика', deadline: '4 недели',
    problem: 'Списываем выпечку', outcome: 'Дашборд', data: 'CSV', success: 'Пять сценариев', constraints: 'Учебный проект',
    users: 'Менеджеры кофейни', contact: 'owner@example.com' };
  assert.ok((await api.getQuestions(draft.problem)).length >= 3);
  const rating = await api.rateTask(draft);
  assert.equal(rating.total, 100); assert.equal(rating.level, 'Приоритетная');
  assert.equal(rating.breakdown.find(c => c.key === 'data').max, 20);
  assert.equal(rating.breakdown.find(c => c.key === 'outcome').max, 15);
  assert.equal((await api.rateTask({ problem: 'Контекст', outcome: 'Результат' })).total, 35);
  assert.equal(await api.getDraft(), null);
  const saved = await api.saveDraft(draft);
  assert.equal((await api.listTasks()).length, 0);
  api = adapter(); // Reload frontend: server draft and ID must survive.
  assert.equal((await api.getDraft()).id, saved.id);
  assert.equal((await api.openDraft(saved.id)).contact, draft.contact);
  const published = await api.publishTask(draft);
  assert.equal(published.id, saved.id); assert.equal(published.rating.total, 100);
  assert.equal(await api.getDraft(), null);
  const listed = await api.listTasks();
  assert.equal(listed.length, 1); assert.equal(listed[0].company, 'Зёрна'); assert.equal(listed[0].deadline, '4 недели');
  await assert.rejects(api.openDraft(published.id), /уже опубликована/);
  await api.submitOffer(published.id, { team: 'Orbit', members: '3 участника', approach: 'Модель прогноза',
    plan: 'Исследование → прототип → тестирование', duration: '4 недели', contact: 'orbit@example.com', prototypeUrl: 'https://example.com' });
  await api.submitOffer(published.id, { team: 'Orbit', members: '3', approach: 'Другой подход', plan: 'План', duration: '2 недели', contact: 'orbit@example.com' });
  assert.equal((await api.listOffers(published.id)).length, 2);
  const pendingDraft = await api.saveDraft({...draft,title:'Отдельный черновик'});
  const updated = await api.updateTask(published.id,{...published,data:''});
  assert.equal(updated.rating.total,80);assert.equal(updated.id,published.id);assert.equal(updated.publishedAt,published.publishedAt);
  assert.equal((await api.getDraft()).id,pendingDraft.id);
  assert.equal((await api.listOffers(published.id)).length,2);
  await api.updateTask(published.id,published);
  const offers = await api.listOffers(published.id);
  assert.equal(offers[0].plan, 'Исследование → прототип → тестирование');
  assert.equal(offers[0].prototypeUrl, 'https://example.com');
  await assert.rejects(api.selectTeams(published.id, ['unknown']), /не найдено/);
  await api.selectTeams(published.id, ['team-orbit']);
  assert.equal((await api.getTask(published.id)).status, 'in_progress');
  await assert.rejects(api.updateTask(published.id,published), /зафиксированы/);
  await assert.rejects(api.selectTeams(published.id, []), /уже подтверждён/);
  let workspace = await api.getWorkspace('student');
  assert.equal(workspace.offers[0].status, 'selected'); assert.equal(workspace.stages.length, 3);
  const stage = workspace.stages[0];
  await api.acceptPlan(published.id);
  await assert.rejects(api.reviewStage(stage.id, true, ''), /ещё не отправлен/);
  await assert.rejects(api.submitStage(stage.id, { result: 'Готово', url: 'javascript:alert(1)' }), /ссылка/);
  await api.submitStage(stage.id, { result: 'Рабочий прототип', url: 'https://example.com' });
  await assert.rejects(api.reviewStage(stage.id, false, ''), /доработать/);
  await api.reviewStage(stage.id, false, 'Добавить фильтр');
  assert.equal((await api.getWorkspace('student')).stages[0].status, 'revision');
  await api.submitStage(stage.id, { result: 'Фильтр добавлен', url: 'https://example.com' });
  await api.reviewStage(stage.id, true, 'Принято');
  await assert.rejects(api.reviewStage(stage.id, true, ''), /уже проверен/);
  workspace = await api.getWorkspace('student');
  assert.equal(workspace.stages.filter(s => s.status === 'approved').reduce((sum, s) => sum + s.points, 0), 20);
  assert.equal(createStore(file).listStages()[0].status, 'approved');
  const closed = await api.publishTask({ ...draft, title: 'Без выбора' });
  await api.selectTeams(closed.id, []);
  assert.equal((await api.getTask(closed.id)).status, 'closed');
  await assert.rejects(api.submitOffer(closed.id, { team: 'Orbit', approach: 'Идея', plan: 'План', duration: '1 неделя' }), /завершён/);
  const multi = await api.publishTask({ ...draft, title: 'Две команды' });
  for (const teamId of ['team-orbit', 'team-vector']) {
    const response = await fetch(`${base}/api/tasks/${multi.id}/proposals`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, teamName: teamId, idea: 'Идея', plan: 'План', deadline: '3 недели' }) });
    assert.equal(response.status, 201);
  }
  await api.selectTeams(multi.id, ['team-orbit', 'team-vector']);
  assert.equal((await api.getTask(multi.id)).selectedTeamIds.length, 2);
  assert.equal((await api.getWorkspace('business')).stages.filter(s => s.taskId === multi.id).length, 6);
});

test('autosave preserves newer edits, retries failures and flushes before publication', async () => {
  const window = {MostReadiness:readiness,MostMilestones:milestones,MostInterview:interviewRules};
  runInNewContext(autosaveSource, { window, setTimeout, clearTimeout });
  const writes = []; let release;
  const saver = window.createDraftAutosave({ delay: 60000, save: async draft => {
    writes.push(draft); if (writes.length === 1) await new Promise(resolve => { release = resolve; });
  } });
  saver.update({ title: 'Старый текст' }); const first = saver.flush(); await Promise.resolve();
  saver.update({ title: 'Новый текст' }); const second = saver.flush(); release();
  await Promise.all([first, second]);
  assert.equal(writes.map(w => w.title).join('|'), 'Старый текст|Новый текст');
  assert.equal(saver.dirty(), false); saver.reset();
  let fail = true;
  const retry = window.createDraftAutosave({ delay: 60000, save: async () => { if (fail) throw new Error('offline'); } });
  retry.update({ title: 'Черновик' }); await assert.rejects(retry.flush(), /offline/);
  assert.equal(retry.status, 'error'); assert.equal(retry.dirty(), true);
  fail = false; await retry.flush(); assert.equal(retry.status, 'saved'); retry.reset();
});


test('requirements: repeated offers from different teams and independent manual decisions', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'most-requirements-'));
  const app = createApp(createStore(join(dir, 'db.json')));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  const base = `http://127.0.0.1:${app.address().port}`;
  const memory = new Map();
  const window = {MostReadiness:readiness,MostMilestones:milestones,MostInterview:interviewRules};
  const context = { window, fetch: (path, options) => fetch(base + path, options),
    localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) } };
  runInNewContext(readFileSync(new URL('../public/team-session.js', import.meta.url), 'utf8'), context);
  runInNewContext(adapterSource, context);
  const api = window.platformApi;
  const draft = { title: 'Полная карточка', problem: 'Текущий контекст', need: 'Снизить расходы', users: 'Менеджеры',
    data: 'CSV', constraints: 'Без персональных данных', outcome: 'Прототип', success: 'Проверка сценариев', contact: 'owner@example.com', interactionFormat: 'Онлайн каждую пятницу' };
  const task = await api.publishTask(draft);
  assert.equal((await api.getTask(task.id)).need, draft.need);
  assert.equal((await api.getTask(task.id)).interactionFormat, draft.interactionFormat);
  const details = await api.rateTask({ problem: 'Контекст' });
  assert.equal(details.missingDetails.map(d => d.key).join(','), 'need,interactionFormat');
  const input = { members: '3 участника', approach: 'Идея', plan: 'План', duration: '2 недели', contact: 'team@example.com' };
  const orbit = [];
  for (let i = 0; i < 12; i++) orbit.push(await api.submitOffer(task.id, { ...input, approach: 'Вариант ' + i }));
  window.platformTeam.set('Новая команда');
  const other = await api.submitOffer(task.id, { ...input, approach: 'Другая идея', prototypeUrl: 'https://example.com/demo' });
  assert.equal(other.team, 'Новая команда'); assert.notEqual(other.teamId, orbit[0].teamId);
  assert.equal((await api.getWorkspace('student')).offers.length, 1);
  window.platformTeam.set('Orbit');
  assert.equal((await api.getWorkspace('student')).offers.length, 12);
  assert.equal((await api.listOffers(task.id)).length, 13);
  assert.ok((await api.listOffers(task.id)).every(o => o.status === 'pending'));
  assert.equal((await api.getWorkspace('business')).stages.length, 0, 'No automatic team assignment');
  await api.decideOffer(orbit[0].id, 'selected');
  await api.decideOffer(orbit[1].id, 'declined');
  let offers = await api.listOffers(task.id);
  assert.equal(offers.find(o => o.id === orbit[0].id).status, 'selected');
  assert.equal(offers.find(o => o.id === orbit[1].id).status, 'declined');
  assert.equal(offers.find(o => o.id === orbit[2].id).status, 'pending');
  await api.decideOffer(orbit[1].id, 'selected'); // Business can reconsider before confirmation.
  await api.selectOffers(task.id, [orbit[0].id, orbit[1].id, other.id]);
  offers = await api.listOffers(task.id);
  assert.equal(offers.filter(o => o.status === 'selected').length, 3);
  assert.equal(offers.filter(o => o.status === 'declined').length, 10);
  const workspace = await api.getWorkspace('business');
  assert.equal(workspace.stages.length, 6, 'One three-stage plan per selected team, even with two selected proposals');
  await assert.rejects(api.decideOffer(orbit[0].id, 'declined'), /уже подтверждён/);
});

test('catalog filters readiness boundaries together with topic and search', async () => {
  const { default: catalog } = await import('../public/catalog-engine.cjs');
  const tasks = [0,39,40,69,70,89,90,100].map(score=>({id:'task-'+score,title:'Задача '+score,company:'Компания',context:'Контекст',published:true,category:score===100?'Дизайн':'Аналитика',score}));
  for(const readiness of ['0-39','40-69','70-89','90-100']) assert.equal(catalog.query(tasks,{readiness}).pagination.total,2);
  assert.equal(catalog.query(tasks,{readiness:'90-100',category:'ui-ux'}).items[0].title,'Задача 100');
  assert.equal(catalog.query(tasks,{search:'нет такой задачи'}).pagination.total,0);
  assert.equal(catalog.query(tasks,{}).pagination.total,8);
});

test('offline demo supports the same repeated-offer decisions as the live adapter', async () => {
  const memory = new Map();
  const window = {MostReadiness:readiness,MostMilestones:milestones,MostInterview:interviewRules};
  const context = { window, URL, setTimeout: callback => setTimeout(callback, 0),
    localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) } };
  runInNewContext(readFileSync(new URL('../public/team-session.js', import.meta.url), 'utf8'), context);
  runInNewContext(readFileSync(new URL('../public/match-engine.cjs', import.meta.url), 'utf8'), context);
  runInNewContext(readFileSync(new URL('../public/demo-api.js', import.meta.url), 'utf8'), context);
  const api = window.platformApi;
  const a = await api.submitOffer('task-1', { approach: 'Новый вариант', plan: 'План', duration: 'Неделя' });
  const b = await api.submitOffer('task-1', { approach: 'Другой вариант', plan: 'План', duration: 'Неделя' });
  assert.notEqual(a.id, b.id);
  await api.decideOffer(a.id, 'selected');
  await api.decideOffer(b.id, 'declined');
  await api.selectOffers('task-1', [a.id]);
  const offers = await api.listOffers('task-1');
  assert.equal(offers.filter(o => o.status === 'selected').length, 1);
  assert.equal(offers.find(o => o.id === b.id).status, 'declined');
  assert.equal((await api.getWorkspace('student')).stages.length, 3);
  window.platformTeam.set('Другие студенты');
  const other = await api.submitOffer('task-2', { approach: 'Сайт', plan: 'План', duration: 'Неделя' });
  assert.equal(other.team, 'Другие студенты');
  assert.equal((await api.getWorkspace('student')).offers.length, 1);
});
