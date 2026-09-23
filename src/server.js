import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createStore, ApiError } from './store.js';
import { describeRating, describeAIRating, clarificationQuestions } from './presentation.js';
import { createAIService } from './ai.js';
import { createSampleData } from './sample-data.js';
import { calculateMatch, explanationFacts } from './match.js';
import { createAuth } from './auth.js';

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

export function createApp(store, ai = createAIService(), { authorize = true } = {}) {
  const auth = createAuth(store);
  return createServer(async (request, response) => {
    function json(status, value) {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(value));
    }
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      const method = request.method;
      const user = auth.user(request);
      function requireRole(role) {
        if (!authorize) return;
        if (!user) throw new ApiError(401, 'Войдите в аккаунт, чтобы продолжить');
        if (role && user.role !== role) throw new ApiError(403, 'Действие недоступно для вашей роли');
      }
      function owner(id) {
        requireRole('business');
        const value = store.getTask(id);
        if (authorize && value.ownerId !== user.id) throw new ApiError(403, 'Это задача другой компании');
        return value;
      }
      function readable(id) {
        const value = store.getTask(id);
        if (authorize && !value.published && value.ownerId !== user?.id) throw new ApiError(404, 'Задача не найдена');
        return value;
      }
      if (!['GET','HEAD'].includes(method) && request.headers.origin && request.headers.origin !== `${request.socket.encrypted?'https':'http'}://${request.headers.host}`) throw new ApiError(403,'Запрос с другого сайта запрещён');
      const account = path.match(/^\/api\/auth\/(register|login|logout|session)$/);
      if (account && ((account[1] === 'session' && method === 'GET') || (account[1] !== 'session' && method === 'POST'))) return json(200,await auth.handle(request,response,account[1],method==='POST'?await body(request):{}));
      if (method === 'GET' && ['/', '/index.html', '/demo.html', '/review-editor.js', '/readiness-engine.cjs', '/interview-rules.cjs', '/milestones.cjs', '/auth-ui.js', '/case-data.js', '/case.html', '/prototype.html', '/app.js', '/match-engine.cjs', '/match-demo.cjs', '/match-ui.js', '/catalog-engine.cjs', '/catalog-demo.cjs', '/catalog-components.js', '/catalog-page.js', '/api-client.js', '/ai-flow.js', '/ai-components.js', '/demo-ai.js', '/team-session.js', '/demo-api.js', '/draft-autosave.js', '/styles.css'].includes(path)) {
        const file = path === '/' ? 'index.html' : path.slice(1);
        response.writeHead(200, { 'Content-Type': (file.endsWith('.js') || file.endsWith('.cjs')) ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
        return response.end(readFileSync(new URL(file, publicDir)));
      }
      if (method === 'POST' && ['/api/match', '/api/match/explain'].includes(path)) {
        const match = calculateMatch(await body(request));
        if (path.endsWith('/explain')) {
          requireRole();
          try { match.explanation = await ai.explainMatch(explanationFacts(match)); match.explanationSource = 'OpenAI'; }
          catch { match.explanationNotice = 'AI-пояснение сейчас недоступно. Показан расчёт по критериям.'; }
        }
        return json(200, match);
      }
      const savedRoute = path.match(/^\/api\/students\/([^/]+)\/saved\/([^/]+)$/);
      if (savedRoute && method === 'PUT') {
        requireRole('student');
        const input = await body(request);
        let studentId, taskId;
        try { studentId=decodeURIComponent(savedRoute[1]); taskId=decodeURIComponent(savedRoute[2]); } catch { throw new ApiError(400,'Некорректный идентификатор'); }
        if(authorize && studentId!==user.id)throw new ApiError(403,'Чужой профиль недоступен');
        return json(200,store.setSavedTask(studentId,taskId,input?.saved));
      }
      const studentRoute = path.match(/^\/api\/students\/([^/]+)\/profile$/);
      if (studentRoute) {
        requireRole('student');
        let id;
        try { id = decodeURIComponent(studentRoute[1]); } catch { throw new ApiError(400, 'Некорректный идентификатор'); }
        if(authorize && id!==user.id)throw new ApiError(403,'Чужой профиль недоступен');
        if (method === 'GET') return json(200, store.getStudentProfile(id));
        if (method === 'PUT') return json(200, store.saveStudentProfile(id, await body(request)));
      }
      if (method === 'GET' && path === '/api/ai/status') return json(200, ai.status());
      if (method === 'POST' && path === '/api/ai/interview') { requireRole('business'); return json(200, await ai.turn(await body(request))); }
      if (method === 'POST' && path === '/api/quality') {
        requireRole('business');
        if(!ai.status().configured)throw new ApiError(503,'Проверка AI пока недоступна. Рейтинг полноты работает без неё.');
        const review=await describeAIRating(await body(request),ai);
        return json(200,{source:'OpenAI',suggestions:review.breakdown.map(({key,label,hint})=>({key,label,hint}))});
      }
      if (method === 'POST' && ['/api/rating', '/api/questions'].includes(path)) {
        const input = await body(request);
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'Ожидается JSON-объект');
        return json(200, path === '/api/rating' ? describeRating(input) : clarificationQuestions(input));
      }
      if (method === 'GET' && path === '/api/stages') { requireRole(); return json(200, store.listStages().filter(s=>!authorize || (user.role==='student'?s.teamId===user.id:store.getTask(s.taskId).ownerId===user.id))); }
      const agreement=path.match(/^\/api\/tasks\/([^/]+)\/plan\/accept$/);
      if(agreement && method==='POST') { requireRole('student'); const input=await body(request); return json(200,store.acceptPlan(agreement[1],authorize?user.id:input.teamId)); }
      const selection = path.match(/^\/api\/tasks\/([^/]+)\/selection$/);
      if (selection && method === 'POST') {
        owner(selection[1]);
        const input = await body(request);
        return json(200, input && Object.hasOwn(input, 'proposalIds') ? store.selectProposals(selection[1], input.proposalIds) : store.selectTeams(selection[1], input?.teamIds));
      }
      const stage = path.match(/^\/api\/stages\/([^/]+)\/(submit|review)$/);
      if (stage && method === 'POST') {
        const value=store.getStage(stage[1]);
        if(stage[2]==='review')owner(value.taskId);
        else {requireRole('student');if(authorize&&value.teamId!==user.id)throw new ApiError(403,'Это этап другой команды');}
        const input = await body(request);
        return json(200, stage[2] === 'submit' ? store.submitStage(stage[1], input) : store.reviewStage(stage[1], input));
      }
      if (path === '/api/tasks') {
        if (method === 'GET') {
          if (url.searchParams.get('all') === 'true') { requireRole(); return json(200,store.listTasks(false).filter(t=>!authorize || (user.role==='business'?t.ownerId===user.id:t.published))); }
          if (!url.search) return json(200,store.listTasks());
          return json(200,store.queryCatalog(url.searchParams,authorize?(user?.role==='student'?user.id:null):url.searchParams.get('studentId')));
        }
        if (method === 'POST') { requireRole('business'); return json(201, store.createTask(await body(request),user?.id)); }
      }
      const task = path.match(/^\/api\/tasks\/([^/]+)(?:\/(publish|proposals))?$/);
      if (task) {
        const [, id, action] = task;
        if (!action && method === 'GET') { readable(id); return json(200,store.getCatalogTask(id,authorize?(user?.role==='student'?user.id:null):url.searchParams.get('studentId'))); }
        if (!action && method === 'PATCH') { owner(id); return json(200, store.updateTask(id, await body(request))); }
        if (action === 'publish' && method === 'POST') { owner(id); return json(200, store.publishTask(id)); }
        if (action === 'proposals' && method === 'GET') { const value=readable(id); return json(200, store.listProposals(id).filter(p=>!authorize || value.ownerId===user?.id || (user?.role==='student'&&p.teamId===user.id))); }
        if (action === 'proposals' && method === 'POST') { requireRole('student'); const input=await body(request); return json(201, store.createProposal(id,authorize?{...input,teamId:user.id,teamName:user.name}:input)); }
      }
      const proposal = path.match(/^\/api\/proposals\/([^/]+)\/status$/);
      if (proposal && method === 'PATCH') {
        owner(store.getProposal(proposal[1]).taskId);
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
