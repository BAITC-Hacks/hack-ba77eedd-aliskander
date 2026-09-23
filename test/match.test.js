import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import engine from '../public/match-engine.cjs';
import demo from '../public/match-demo.cjs';
import { createStore } from '../src/store.js';
import { createApp } from '../src/server.js';
import { createAIService } from '../src/ai.js';
const copy = value => structuredClone(value);

test('Match demo is deterministically 87 from the exact five weighted criteria', () => {
  const result = engine.calculate(demo.student, demo.task);
  assert.equal(result.matchScore, 87); assert.equal(result.label, 'Strong Match');
  assert.deepEqual(result.breakdown, { skills: 80, experience: 92, interest: 100, difficulty: 90, availability: 100 });
  assert.equal(Math.round(Object.entries(result.weights).reduce((n,[k,w]) => n + result.breakdown[k]*w/100, 0)), result.matchScore);
  assert.deepEqual(result.missingSkills, ['Docker']); assert.equal(result.evidence.relevantProjects, 2);
  for (let i = 0; i < 10; i++) assert.deepEqual(engine.calculate(copy(demo.student), copy(demo.task)), result);
  const before = JSON.stringify(demo); engine.calculate(demo.student, demo.task); assert.equal(JSON.stringify(demo), before);
});

test('skill aliases, case and duplicates do not inflate score or confuse JS with Java', () => {
  const result = engine.calculate({ skills: [' react ', 'React.js', 'TS', 'Postgres', 'restful api', 'JS'] }, { requiredSkills: ['React', 'reactjs', 'TypeScript', 'PostgreSQL', 'REST API', 'Java'] });
  assert.equal(result.breakdown.skills, 80); assert.equal(result.matchedSkills.length, 4); assert.deepEqual(result.missingSkills, ['Java']);
  assert.equal(engine.calculate({ experience: ['JavaScript and React Native'] }, { requiredSkills: ['Java'] }).breakdown.experience, 0);
  assert.equal(engine.calculate({ experience: ['Used C++ and C#'] }, { requiredSkills: ['C++', 'C#'] }).breakdown.experience, 40);
});

test('missing data is explicit, URLs alone give no experience and incomplete projects give no project bonus', () => {
  const empty = engine.calculate({}, {}); assert.equal(empty.matchScore, 0); assert.equal(empty.breakdown.skills, 0); assert.ok(empty.missingData.length >= 5);
  const student = { skills: ['React'], githubUrl: 'https://github.com/example', portfolioUrl: 'https://example.com', projects: [{ title: 'CRM', category: 'Fullstack', skills: ['React'], completed: false }] };
  assert.equal(engine.calculate(student, demo.task).breakdown.experience, 0);
  student.projects[0].completed = true;
  const one = engine.calculate(student, demo.task); student.projects.push(copy(student.projects[0]));
  assert.equal(engine.calculate(student, demo.task).breakdown.experience, one.breakdown.experience);
  assert.equal(one.evidence.relevantProjects, 1);
  assert.ok(empty.recommendations.every(s => !/\d+%/.test(s)));
});

test('difficulty preferences, hours, score ranges and validation are bounded', () => {
  const target = { requiredSkills: ['React'], category: 'Frontend', difficulty: 'Hard', requiredHours: 10 };
  assert.equal(engine.calculate({ level: 'Beginner', availabilityHours: 5 }, target).breakdown.difficulty, 10);
  assert.equal(engine.calculate({ level: 'Advanced', availabilityHours: 15 }, target).breakdown.availability, 100);
  assert.equal(engine.calculate({ level: 'Advanced', availabilityHours: 0 }, target).breakdown.availability, 0);
  assert.equal(engine.calculate({ level: 'Advanced', preferredDifficulty: 'Easy' }, target).breakdown.difficulty, 70);
  for (const [score,label] of [[0,'Low Match'],[39,'Low Match'],[40,'Partial Match'],[59,'Partial Match'],[60,'Good Match'],[74,'Good Match'],[75,'Strong Match'],[89,'Strong Match'],[90,'Excellent Match'],[100,'Excellent Match']]) assert.equal(engine.labelFor(score), label);
  for (const hours of [-1, 169, 'ten', Infinity]) assert.throws(() => engine.calculate({ availabilityHours: hours }, target));
  for (const malformed of [{ skills: [1] }, { level: 'Expert' }, { githubUrl: 'javascript:alert(1)' }, { projects: [{ completed: 'true' }] }]) assert.throws(() => engine.profile(malformed));
  for (const level of ['', 'Beginner','Intermediate','Advanced']) for (const difficulty of ['', 'Easy','Medium','Hard']) for (const hours of [null,0,5,168]) {
    const r = engine.calculate({ ...demo.student, level, availabilityHours: hours }, { ...demo.task, difficulty });
    assert.ok(r.matchScore >= 0 && r.matchScore <= 100 && Number.isInteger(r.matchScore));
  }
});

test('browser demo uses the identical engine, persists profiles and captures proposal Match', async () => {
  const memory = new Map();
  function browser() {
    const window = { platformTeam: { current: { id: 'team-orbit', name: 'Orbit' } } };
    const context = { window, URL, setTimeout: callback => setTimeout(callback, 0), localStorage: { getItem: k => memory.get(k) || null, setItem: (k,v) => memory.set(k,v) } };
    for (const file of ['match-engine.cjs', 'match-demo.cjs', 'demo-api.js']) runInNewContext(readFileSync(new URL('../public/' + file, import.meta.url), 'utf8'), context);
    return window;
  }
  let window = browser(), api = window.platformApi;
  await api.saveProfile(demo.student);
  const task = await api.getTask(demo.task.id);
  assert.equal((await api.matchTask(await api.getProfile(), task)).matchScore, 87);
  const proposal = await api.submitOffer(task.id, { approach: 'Прототип', plan: 'План' });
  assert.equal(proposal.matchSnapshot.matchScore, 87); assert.equal(proposal.studentProfile.name, 'Ali'); assert.equal(proposal.status, 'pending');
  await api.saveProfile({ ...demo.student, skills: ['Docker'] });
  assert.equal((await api.listOffers(task.id))[0].matchSnapshot.matchScore, 87);
  window = browser(); api = window.platformApi; assert.deepEqual(Array.from((await api.getProfile()).skills), ['Docker']);
});

test('HTTP Match, profile persistence, server snapshots and advisory scores preserve manual selection', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'most-match-')), file = join(dir, 'db.json');
  const store = createStore(file);
  const ai = createAIService({ apiKey: 'test-only', fetchImpl: async (_, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.text.format.name, 'match_explanation'); assert.equal(payload.text.format.strict, true);
    assert.ok(!('matchScore' in payload.text.format.schema.properties));
    assert.ok(!options.body.includes('test-only'));
    return { ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ explanation: 'Совпадают основные навыки. Уточните опыт Docker.', matchScore: 100 }) }] }] }) };
  } });
  const app = createApp(store, ai); app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { await new Promise(resolve => app.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.address().port}`;
  async function request(path, method = 'GET', body, status = 200) { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); assert.equal(r.status, status, path); return r.json(); }
  for (const path of ['/match-engine.cjs','/match-demo.cjs','/match-ui.js']) { const r = await fetch(base + path); assert.equal(r.status, 200); assert.ok(r.headers.get('content-type').includes('javascript')); }
  const input = { student: demo.student, task: demo.task };
  assert.equal((await request('/api/match', 'POST', input)).matchScore, 87);
  const explained = await request('/api/match/explain', 'POST', input);
  assert.equal(explained.matchScore, 87, 'LLM cannot replace score'); assert.equal(explained.explanationSource, 'OpenAI');
  await request('/api/match', 'POST', { student: { availabilityHours: -1 }, task: demo.task }, 400);
  await request('/api/match', 'POST', null, 400);
  const team = 'team-orbit';
  assert.equal((await request('/api/students/' + team + '/profile')).skills.length, 0);
  await request('/api/students/' + team + '/profile', 'PUT', demo.student);
  assert.deepEqual(createStore(file).getStudentProfile(team).skills, demo.student.skills);
  const task = store.createTask({ title: demo.task.title, context: demo.task.problem, requiredSkills: demo.task.requiredSkills, difficulty: demo.task.difficulty, requiredHours: demo.task.requiredHours, category: demo.task.category });
  store.publishTask(task.id);
  const offer = await request('/api/tasks/' + task.id + '/proposals', 'POST', { teamId: team, teamName: 'Orbit', idea: 'CRM', plan: 'План', deadline: '3 недели', matchSnapshot: { matchScore: 100 }, status: 'selected' }, 201);
  assert.equal(offer.matchSnapshot.matchScore, 87); assert.equal(offer.status, 'pending'); assert.equal(store.listStages().length, 0);
  const window = { platformTeam: { current: { id: team, name: 'Orbit' } } };
  runInNewContext(readFileSync(new URL('../public/api-client.js', import.meta.url), 'utf8'), { window, fetch: (path, options) => fetch(base + path, options), localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  const adapter = window.platformApi;
  const adaptedTask = await adapter.getTask(task.id);
  assert.equal(adaptedTask.requiredHours, '10');
  assert.equal((await adapter.matchTask(await adapter.getProfile(), adaptedTask)).matchScore, 87);
  const mappedOffer = (await adapter.listOffers(task.id))[0];
  assert.equal(mappedOffer.studentProfile.name, 'Ali'); assert.equal(mappedOffer.matchSnapshot.matchScore, 87);
  await request('/api/students/' + team + '/profile', 'PUT', {});
  assert.equal(store.listProposals(task.id)[0].matchSnapshot.matchScore, 87, 'Snapshot survives later profile edits');
  await request('/api/tasks', 'POST', { requiredHours: '-10' }, 400);
  store.selectProposals(task.id, [offer.id]);
  const stage = store.listStages()[0]; store.submitStage(stage.id, { result: 'CRM готова', url: 'https://example.com/crm' });
  assert.equal(store.getStudentProfile(team).completedTasks.length, 0);
  store.reviewStage(stage.id, { approved: true });
  assert.equal(store.getStudentProfile(team).completedTasks.length, 1);
  const withProgress = engine.calculate(store.getStudentProfile(team), demo.task);
  assert.ok(withProgress.breakdown.experience > 0); assert.equal(store.getTask(task.id).selectionDone, true);
});

test('unavailable OpenAI keeps a valid deterministic Match explanation', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'most-match-fallback-'));
  const app = createApp(createStore(join(dir, 'db.json')), createAIService({ apiKey: '' }));
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(async () => { await new Promise(resolve => app.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const response = await fetch(`http://127.0.0.1:${app.address().port}/api/match/explain`, { method: 'POST', body: JSON.stringify({ student: demo.student, task: demo.task }) });
  const match = await response.json(); assert.equal(response.status, 200); assert.equal(match.matchScore, 87); assert.equal(match.explanationSource, 'algorithm'); assert.ok(match.explanationNotice);
});

test('Match UI ignores stale calculations and opens escaped, labelled details for the current task', async () => {
  const node = { dataset: { matchTask: demo.task.id }, isConnected: true, innerHTML: '' };
  const dialogNodes = new Map();
  const dialog = { innerHTML: '', open: false, showModal() { this.open = true; }, close() { this.open = false; }, querySelector(selector) { if (!dialogNodes.has(selector)) dialogNodes.set(selector, { addEventListener() {} }); return dialogNodes.get(selector); } };
  let click, resolveMatch;
  const app = { addEventListener: (_, fn) => { click = fn; } }, state = { ticket: 1 };
  const window = { platformTeam: { current: { id: 'team-orbit', name: 'Orbit' } } };
  runInNewContext(readFileSync(new URL('../public/match-ui.js', import.meta.url), 'utf8'), {
    window, document: { querySelectorAll: selector => selector === '[data-match-task]' ? [node] : [], querySelector: selector => selector === '#match-dialog' ? dialog : null }, location: { hash: '#catalog' }
  });
  const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const ui = window.createMatchUI({ app, state, h, api: { meta: { mode: 'demo' }, getProfile: async () => demo.student, matchTask: () => new Promise(resolve => { resolveMatch = resolve; }) } });
  assert.ok(ui.slot(demo.task).includes('role="status"'));
  const task = { ...demo.task, title: '<img src=x onerror=alert(1)>' };
  const pending = ui.attach([task]); await new Promise(setImmediate); state.ticket++;
  resolveMatch(engine.calculate(demo.student, task)); await pending; assert.equal(node.innerHTML, '');
  await ui.attach([task]); assert.ok(node.innerHTML.includes('87% Match')); assert.ok(node.innerHTML.includes('Strong Match')); assert.ok(node.innerHTML.includes('⚠ Docker'));
  click({ preventDefault() {}, target: { closest: selector => selector === '[data-match-details]' ? { dataset: { matchDetails: 'task:' + task.id } } : null } });
  assert.equal(dialog.open, true); assert.ok(dialog.innerHTML.includes('Skills Match')); assert.ok(dialog.innerHTML.includes('18.4 из 20')); assert.ok(!dialog.innerHTML.includes('<img'));
  assert.ok(ui.offer(null, null, task, 'old').includes('не приложен'));
});
