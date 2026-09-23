import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { calculateRating, fields, levelForScore } from '../src/rating.js';
import { createStore } from '../src/store.js';
import { createApp as createProtectedApp } from '../src/server.js';
const createApp=(store,ai)=>createProtectedApp(store,ai,{authorize:false});
import { createSampleData } from '../src/sample-data.js';

test('sample data: seeds two complete tasks and three proposals only when requested', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tasks-samples-'));
  const file = join(dir, 'db.json');
  try {
    const store = createStore(file, createSampleData());
    assert.equal(store.listTasks().length, 2);
    assert.equal(store.listTasks().every(task => task.score === 100), true);
    assert.equal(store.listProposals('example-demand-forecast').length, 2);
    assert.equal(store.listProposals('example-studio-booking').length, 1);

    store.createTask({ title: 'Сохранённая задача' });
    const reopened = createStore(file, createSampleData());
    assert.equal(reopened.listTasks(false).length, 3, 'Existing data must not be reseeded or overwritten');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rating: weights, empty strings, all combinations and level boundaries', () => {
  assert.equal(calculateRating({ title: 'Название' }).score, 0);
  assert.equal(calculateRating({ context: '  \n\t', data: '', contact: null }).score, 0);
  assert.equal(calculateRating({ context: 'Проблема', expectedResult: 'Результат' }).score, 35);
  assert.equal(calculateRating({ context: 'Да', expectedResult: 'Да', data: 'Да', users: 'Да', contact: 'Да' }).score, 0);
  const garbage = Object.fromEntries(Object.keys(fields).map(key => [key, 'а']));
  assert.equal(calculateRating(garbage).score, 0);
  for (const filler of ['аааааа', 'тест', 'тест тест тест', 'lorem ipsum', '---']) {
    assert.equal(calculateRating({ context: filler }).score, 0, filler);
  }
  for (const [score, level] of [[0, 'Черновик'], [39, 'Черновик'], [40, 'Рабочая'], [69, 'Рабочая'], [70, 'Готовая'], [89, 'Готовая'], [90, 'Приоритетная'], [100, 'Приоритетная']]) {
    assert.equal(levelForScore(score), level);
  }
  const entries = Object.entries(fields);
  for (let mask = 0; mask < 128; mask++) {
    const task = {};
    let expected = 0;
    const missing = [];
    entries.forEach(([key, [label, weight]], index) => {
      task[key] = mask & (1 << index) ? ' содержательное описание ' : '  ';
      if (mask & (1 << index)) expected += weight;
      else missing.push(label);
    });
    assert.deepEqual(calculateRating(task), { score: expected, level: levelForScore(expected), missingFields: missing });
  }
});

test('HTTP demo: persistence, publication, ordering, multiple proposals, manual decisions and errors', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tasks-mvp-'));
  const file = join(dir, 'db.json');
  const app = createApp(createStore(file));
  t.after(async () => {
    await new Promise((resolve, reject) => app.close(error => error ? reject(error) : resolve()));
    rmSync(dir, { recursive: true, force: true });
  });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const base = `http://127.0.0.1:${app.address().port}`;
  async function request(path, method = 'GET', body, status = 200) {
    const response = await fetch(`${base}/api${path}`, { method,
      headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, status);
    return response.json();
  }
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(`${base}/app.js`)).status, 200);
  const task = await request('/tasks', 'POST', { title: 'Задача', context: 'Проблема', expectedResult: 'Результат', score: 100, published: true }, 201);
  assert.equal(task.score, 35);
  assert.equal(task.published, false);
  assert.deepEqual(await request('/tasks'), []);
  assert.equal((await request('/tasks?all=true')).length, 1);
  const path = `/tasks/${task.id}`;
  const proposal = { teamName: 'Команда', idea: 'Идея', plan: 'План', deadline: '2 недели', status: 'selected' };
  await request(`${path}/proposals`, 'POST', proposal, 409);
  const updated = await request(path, 'PATCH', { data: 'CSV', users: 'Клиенты', contact: 'email' });
  assert.equal(updated.score, 75);
  assert.equal(updated.level, 'Готовая');
  await request(`${path}/publish`, 'POST');
  const low = await request('/tasks', 'POST', {}, 201);
  await request(`/tasks/${low.id}/publish`, 'POST',undefined,400);
  await request(`/tasks/${low.id}`,'PATCH',{title:'Новая задача',context:'Требуется описать потребность'});
  await request(`/tasks/${low.id}/publish`,'POST');
  assert.deepEqual((await request('/tasks')).map(item => item.score), [75, 20]);
  await request(path, 'PATCH', { constraints: '  ', successCriteria: 'KPI' });
  assert.equal((await request(path)).score, 90);
  await request(path, 'PATCH', { data: ' ' });
  assert.equal((await request(path)).score, 70);
  const first = await request(`${path}/proposals`, 'POST', proposal, 201);
  const second = await request(`${path}/proposals`, 'POST', { ...proposal, teamName: 'Команда 2' }, 201);
  assert.equal(first.status, 'pending');
  assert.notEqual(first.id, second.id);
  assert.equal((await request(`${path}/proposals`)).length, 2);
  assert.equal((await request(`/proposals/${first.id}/status`, 'PATCH', { status: 'selected' })).status, 'selected');
  assert.equal((await request(`${path}/proposals`))[1].status, 'pending');
  assert.equal((await request(`/proposals/${second.id}/status`, 'PATCH', { status: 'rejected' })).status, 'rejected');
  const reopened = createStore(file);
  assert.equal(reopened.getTask(task.id).score, 70);
  assert.equal(reopened.listTasks().length, 2);
  assert.deepEqual(reopened.listProposals(task.id).map(item => item.status), ['selected', 'rejected']);
  await request('/tasks/missing', 'GET', undefined, 404);
  await request('/tasks/missing/publish', 'POST', undefined, 404);
  await request('/tasks/missing/proposals', 'POST', proposal, 404);
  await request('/proposals/missing/status', 'PATCH', { status: 'selected' }, 404);
  await request(`/proposals/${first.id}/status`, 'PATCH', { status: 'automatic' }, 400);
  await request('/tasks', 'POST', { context: 42 }, 400);
  await request('/tasks', 'POST', null, 400);
  await request(path, 'PATCH', [], 400);
  await request(`${path}/proposals`, 'POST', { ...proposal, teamName: '   ' }, 400);
  const bad = await fetch(`${base}/api/tasks`, { method: 'POST', body: '{' });
  assert.equal(bad.status, 400);
  await request('/tasks', 'POST', { context: 'x'.repeat(65536) }, 413);
});
