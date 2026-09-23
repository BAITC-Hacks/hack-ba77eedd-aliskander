import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createStore, ApiError } from './store.js';
import { describeRating, describeAIRating, clarificationQuestions } from './presentation.js';
import { createAIService } from './ai.js';
import { createSampleData } from './sample-data.js';
import { calculateMatch, explanationFacts } from './match.js';

const publicDir = new URL('../public/', import.meta.url);
async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new ApiError(413, 'Слишком большой запрос');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'Некорректный JSON'); }
}

export function createApp(store, ai = createAIService()) {
  return createServer(async (request, response) => {
    function json(status, value) {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(value));
    }
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      const method = request.method;
      if (method === 'GET' && ['/', '/index.html', '/demo.html', '/app.js', '/match-engine.cjs', '/match-demo.cjs', '/match-ui.js', '/api-client.js', '/ai-flow.js', '/ai-components.js', '/demo-ai.js', '/team-session.js', '/demo-api.js', '/draft-autosave.js', '/styles.css'].includes(path)) {
        const file = path === '/' ? 'index.html' : path.slice(1);
        response.writeHead(200, { 'Content-Type': (file.endsWith('.js') || file.endsWith('.cjs')) ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
        return response.end(readFileSync(new URL(file, publicDir)));
      }
      if (method === 'POST' && ['/api/match', '/api/match/explain'].includes(path)) {
        const match = calculateMatch(await body(request));
        if (path.endsWith('/explain')) {
          try { match.explanation = await ai.explainMatch(explanationFacts(match)); match.explanationSource = 'OpenAI'; }
          catch { match.explanationNotice = 'AI-пояснение сейчас недоступно. Показан расчёт по критериям.'; }
        }
        return json(200, match);
      }
      const studentRoute = path.match(/^\/api\/students\/([^/]+)\/profile$/);
      if (studentRoute) {
        let id;
        try { id = decodeURIComponent(studentRoute[1]); } catch { throw new ApiError(400, 'Некорректный идентификатор'); }
        if (method === 'GET') return json(200, store.getStudentProfile(id));
        if (method === 'PUT') return json(200, store.saveStudentProfile(id, await body(request)));
      }
      if (method === 'GET' && path === '/api/ai/status') return json(200, ai.status());
      if (method === 'POST' && path === '/api/ai/interview') return json(200, await ai.turn(await body(request)));
      if (method === 'POST' && ['/api/rating', '/api/questions'].includes(path)) {
        const input = await body(request);
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'Ожидается JSON-объект');
        return json(200, path === '/api/rating' ? await describeAIRating(input, ai) : clarificationQuestions(input));
      }
      if (method === 'GET' && path === '/api/stages') return json(200, store.listStages());
      const selection = path.match(/^\/api\/tasks\/([^/]+)\/selection$/);
      if (selection && method === 'POST') {
        const input = await body(request);
        return json(200, input && Object.hasOwn(input, 'proposalIds') ? store.selectProposals(selection[1], input.proposalIds) : store.selectTeams(selection[1], input?.teamIds));
      }
      const stage = path.match(/^\/api\/stages\/([^/]+)\/(submit|review)$/);
      if (stage && method === 'POST') {
        const input = await body(request);
        return json(200, stage[2] === 'submit' ? store.submitStage(stage[1], input) : store.reviewStage(stage[1], input));
      }
      if (path === '/api/tasks') {
        if (method === 'GET') return json(200, store.listTasks(url.searchParams.get('all') !== 'true'));
        if (method === 'POST') return json(201, store.createTask(await body(request)));
      }
      const task = path.match(/^\/api\/tasks\/([^/]+)(?:\/(publish|proposals))?$/);
      if (task) {
        const [, id, action] = task;
        if (!action && method === 'GET') return json(200, store.getTask(id));
        if (!action && method === 'PATCH') return json(200, store.updateTask(id, await body(request)));
        if (action === 'publish' && method === 'POST') return json(200, store.publishTask(id));
        if (action === 'proposals' && method === 'GET') return json(200, store.listProposals(id));
        if (action === 'proposals' && method === 'POST') return json(201, store.createProposal(id, await body(request)));
      }
      const proposal = path.match(/^\/api\/proposals\/([^/]+)\/status$/);
      if (proposal && method === 'PATCH') {
        const input = await body(request);
        return json(200, store.decideProposal(proposal[1], input?.status));
      }
      throw new ApiError(404, 'Маршрут не найден');
    } catch (error) {
      if (!(error instanceof ApiError)) console.error(error);
      json(error.status || 500, { error: error instanceof ApiError ? error.message : 'Ошибка сохранения или сервера' });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const store = createStore(process.env.DATA_FILE || fileURLToPath(new URL('../data/db.json', import.meta.url)), createSampleData());
  const port = Number(process.env.PORT || 3000);
  createApp(store).listen(port, '127.0.0.1', () => console.log(`Demo: http://localhost:${port}`));
}
