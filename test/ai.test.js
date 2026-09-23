import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { createAIService, validateInput, validateOutput, responseSchema, readinessSchema } from '../src/ai.js';
import { createStore } from '../src/store.js';
import { createApp } from '../src/server.js';

const description = 'Нам нужен Telegram-бот для записи клиентов в барбершоп. Срок — 3 недели.';
const question = key => ({ id: key, key, label: 'Уточните ' + key, chips: ['Первый вариант', 'Второй вариант'] });
const interview = { status: 'interview', summary: 'Уточним детали', questions: ['goal', 'requirements', 'successCriteria'].map(question), task: null };
const generated = { title: 'Бот записи', problem: description, goal: 'Упростить запись', targetUsers: ['Клиенты'], requirements: ['Выбор времени'],
  expectedResult: 'Рабочий прототип', acceptanceCriteria: ['Запись сохраняется'], requiredSkills: ['Telegram Bot API'], difficulty: 'Medium',
  estimatedDuration: '3 недели', recommendedTeamSize: 2, data: '', constraints: '', contact: '', interactionFormat: '',
  missingInfo: ['Контакт бизнеса'], assumptions: ['Навыки и размер команды — рекомендации для проверки'] };
const ready = { status: 'ready', summary: 'Карточка готова к проверке', questions: [], task: generated };
const response = result => ({ ok: true, status: 200, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }) });

test('AI input validation rejects empty/short descriptions and duplicate answers', () => {
  for (const input of [null, {}, { action: 'analyze', description: '' }, { action: 'analyze', description: 'Бот' }]) assert.throws(() => validateInput(input));
  assert.throws(() => validateInput({ action: 'answer', description, answers: [1] }));
  assert.throws(() => validateInput({ action: 'answer', description, answers: [0, 1].map(() => ({ key: 'goal', question: 'Цель?', answer: 'Запись' })) }));
});

test('OpenAI request uses strict JSON schema and all previous answers without exposing credentials', async () => {
  let sent;
  const service = createAIService({ apiKey: 'test-not-a-real-key', fetchImpl: async (url, options) => { sent = { url, options }; return response(interview); } });
  const result = await service.turn({ action: 'analyze', description });
  assert.equal(result.provider, 'OpenAI'); assert.equal(result.questions.length, 3);
  assert.equal(sent.url, 'https://api.openai.com/v1/responses');
  const payload = JSON.parse(sent.options.body);
  assert.equal(payload.store, false); assert.equal(payload.text.format.strict, true);
  assert.deepEqual(payload.text.format.schema, responseSchema);
  assert.equal(JSON.parse(payload.input).description, description);
  assert.ok(!JSON.stringify(result).includes('test-not-a-real-key'));
  const answers = [{ key: 'goal', question: 'Цель?', answer: 'Сократить ручную работу' }];
  const next = createAIService({ apiKey: 'test', fetchImpl: async (_, options) => { sent = JSON.parse(options.body); return response({ ...interview, questions: ['requirements', 'successCriteria'].map(question) }); } });
  await next.turn({ action: 'answer', description, answers });
  assert.deepEqual(JSON.parse(sent.input).answers, answers);
  assert.equal(JSON.parse(sent.input).description, description);
});

test('AI output rejects repeated questions, fabricated schema shapes and invalid recommendations', () => {
  const input = validateInput({ action: 'answer', description, answers: [{ key: 'goal', question: 'Цель?', answer: 'Запись' }] });
  assert.throws(() => validateOutput(interview, input), /повторил/);
  assert.throws(() => validateOutput({ ...interview, questions: [question('a')] }, validateInput({ action: 'analyze', description })), /завершить/);
  assert.throws(() => validateOutput({ ...ready, task: { ...generated, recommendedTeamSize: 100 } }, input), /карточку/);
  assert.throws(() => validateOutput({ ...ready, task: { ...generated, requirements: 'not an array' } }, input), /карточку/);
  assert.equal(validateOutput(ready, input).task.title, 'Бот записи');
});

test('AI handles missing configuration, provider errors, refusal, invalid JSON and timeout', async () => {
  const input = { action: 'analyze', description };
  const disabled = createAIService({ apiKey: '' });
  assert.equal(disabled.status().configured, false);
  await assert.rejects(disabled.turn(input), error => error.status === 503);
  for (const [fetchImpl, status] of [
    [async () => ({ ok: false, status: 429 }), 429],
    [async () => ({ ok: false, status: 401 }), 502],
    [async () => { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error; }, 504],
    [async () => ({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }) }), 422],
    [async () => ({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{' }] }] }) }), 502],
    [async () => ({ ok: true, json: async () => null }), 502],
    [async () => ({ ok: true, json: async () => ({ status: 'incomplete' }) }), 502]
  ]) await assert.rejects(createAIService({ apiKey: 'test-secret', fetchImpl }).turn(input), error => error.status === status && !error.message.includes('test-secret'));
});

test('AI readiness assessment scores the meaning of text and validates bounded partial points', async () => {
  let sent;
  const criteria = [
    { key: 'context', label: 'Контекст', max: 20, text: 'Что-то нужно улучшить' },
    { key: 'expectedResult', label: 'Результат', max: 15, text: 'Рабочий прототип личного кабинета' }
  ];
  const service = createAIService({ apiKey: 'test', fetchImpl: async (_, options) => {
    sent = JSON.parse(options.body);
    return response({ criteria: [
      { key: 'context', points: 4, hint: 'Уточните текущую проблему и затронутых пользователей.' },
      { key: 'expectedResult', points: 12, hint: 'Перечислите обязательные сценарии прототипа.' }
    ] });
  } });
  const result = await service.assessReadiness({ context: criteria[0].text }, criteria);
  assert.deepEqual(result.map(item => item.points), [4, 12]);
  assert.deepEqual(sent.text.format.schema, readinessSchema);
  assert.match(sent.instructions, /СОДЕРЖАНИЮ/);
  assert.deepEqual(JSON.parse(sent.input).criteria, criteria);

  const invalid = createAIService({ apiKey: 'test', fetchImpl: async () => response({ criteria: [
    { key: 'context', points: 21, hint: 'Подсказка' },
    { key: 'expectedResult', points: 15, hint: 'Подсказка' }
  ] }) });
  await assert.rejects(invalid.assessReadiness({}, criteria), error => error.status === 502);
});

test('AI HTTP endpoints, regeneration context and draft persistence never publish automatically', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'most-ai-'));
  const store = createStore(join(dir, 'db.json'));
  let inputs = [];
  const ai = createAIService({ apiKey: 'test', fetchImpl: async (_, options) => {
    const input = JSON.parse(JSON.parse(options.body).input); inputs.push(input);
    return response(input.action === 'analyze' ? interview : ready);
  } });
  const app = createApp(store, ai);
  t.after(async () => { await new Promise(resolve => app.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  const base = `http://127.0.0.1:${app.address().port}`;
  for (const file of ['ai-components.js', 'ai-flow.js', 'demo-ai.js']) assert.equal((await fetch(base + '/' + file)).status, 200);
  assert.equal((await fetch(base + '/.env')).status, 404);
  const config = await (await fetch(base + '/api/ai/status')).json(); assert.equal(config.configured, true); assert.ok(!('apiKey' in config));
  const turn = async data => { const r = await fetch(base + '/api/ai/interview', { method: 'POST', body: JSON.stringify(data) }); assert.equal(r.status, 200); return r.json(); };
  await turn({ action: 'analyze', description });
  await turn({ action: 'answer', description, answers: [{ key: 'goal', question: 'Цель?', answer: 'Автоматизировать запись' }] });
  const edited = { ...generated, title: 'Моя ручная правка', requirements: ['Только запись, без оплаты'] };
  await turn({ action: 'improve', description, currentTask: edited });
  await turn({ action: 'regenerate', description, currentTask: edited });
  assert.deepEqual(inputs.at(-1).currentTask, edited);
  assert.equal(store.listTasks().length, 0); assert.equal(store.listTasks(false).length, 0);
  const session = JSON.stringify({ version: 1, description, answers: inputs[1].answers, questions: interview.questions, compose: 'Неотправленный ответ' });
  const draft = store.createTask({ title: edited.title, context: description, aiSession: session, requirements: 'Только запись, без оплаты', requiredSkills: 'Python, Figma', recommendedTeamSize: '2', difficulty: 'Medium' });
  const reopened = createStore(join(dir, 'db.json')).getTask(draft.id);
  assert.equal(reopened.aiSession, session); assert.equal(reopened.requirements, 'Только запись, без оплаты'); assert.equal(reopened.published, false);
});

test('offline interview respects known details and structured draft mapping preserves edits and undo', async () => {
  const window = {};
  const context = { window, setTimeout: callback => setTimeout(callback, 0) };
  runInNewContext(readFileSync(new URL('../public/demo-ai.js', import.meta.url), 'utf8'), context);
  runInNewContext(readFileSync(new URL('../public/ai-components.js', import.meta.url), 'utf8'), context);
  let result = await window.MostAIDemo.turn({ action: 'analyze', description });
  assert.equal(result.mode, 'demo'); assert.equal(result.status, 'interview');
  assert.ok(result.questions.length >= 3 && result.questions.length <= 5);
  assert.ok(!result.questions.some(q => q.key === 'targetUsers' || q.key === 'deadline'));
  const answers = [];
  while (result.status === 'interview') {
    const q = result.questions[0]; answers.push({ key: q.key, question: q.label, answer: 'Подтверждённый ответ для ' + q.key });
    result = await window.MostAIDemo.turn({ action: 'answer', description, answers });
    assert.ok(result.questions.every(q => !answers.some(a => a.key === q.key)));
    assert.ok(answers.length <= 5);
  }
  assert.equal(result.task.estimatedDuration, '3 недели');
  assert.ok(result.task.assumptions.length);
  const ui = window.MostAIComponents;
  const draft = { company: 'Моя компания' };
  ui.applyTask(draft, result.task);
  draft.title = 'Моя ручная версия';
  const snapshot = ui.taskFromDraft(draft);
  ui.applyTask(draft, { ...result.task, title: 'Другая генерация' });
  ui.applyTask(draft, snapshot);
  assert.equal(draft.title, 'Моя ручная версия'); assert.equal(draft.company, 'Моя компания');
  draft.aiSession = JSON.stringify({ version: 1, description, answers, questions: [], compose: 'Сохранённый текст' });
  assert.equal(ui.session(draft).compose, 'Сохранённый текст');
});

test('demo keeps unknown facts missing without repeating a question', async () => {
  const window = {};
  runInNewContext(readFileSync(new URL('../public/demo-ai.js', import.meta.url), 'utf8'), { window, setTimeout: callback => setTimeout(callback, 0) });
  let result = await window.MostAIDemo.turn({ action: 'analyze', description });
  const answers = [];
  while (result.status === 'interview') {
    const q = result.questions[0]; answers.push({ key: q.key, question: q.label, answer: 'Пока не знаю' });
    result = await window.MostAIDemo.turn({ action: 'answer', description, answers });
    assert.ok(result.questions.every(q => !answers.some(a => a.key === q.key)));
    assert.ok(answers.length <= 5);
  }
  assert.equal(result.task.goal, '');
  assert.equal(result.task.requirements.length, 0);
  assert.ok(result.task.missingInfo.includes('Цель бизнеса'));
});
