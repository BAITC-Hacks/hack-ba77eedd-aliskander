/* Pure catalog rules shared by the Node API and standalone demo. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./match-engine.cjs'));
  else root.MostCatalog = factory(root.MostMatch);
})(typeof window === 'object' ? window : globalThis, function (match) {
  'use strict';
  const categories = [['frontend','Frontend'],['backend','Backend'],['fullstack','Fullstack'],['mobile','Mobile'],['ai-ml','AI / ML'],['data-science','Data Science'],['ui-ux','UI / UX'],['devops','DevOps'],['cybersecurity','Cybersecurity'],['other','Other']];
  const durations = [['under-1','Less than 1 week'],['1-2','1–2 weeks'],['2-4','2–4 weeks'],['4-8','1–2 months'],['8-plus','2+ months']];
  const teams = [['individual','Individual'],['2-3','2–3 students'],['4-5','4–5 students'],['5-plus','5+ students']];
  const sorts = [['match','Best Match'],['newest','Newest'],['popular','Most Popular'],['deadline','Deadline Soon'],['difficulty','Difficulty: Easy → Hard'],['duration','Duration: Shortest'],['rating','Readiness rating']];
  const standardSkills = ['React','TypeScript','Python','FastAPI','Java','Spring Boot','PostgreSQL','Docker','Figma','Machine Learning','REST API','Node.js','Kubernetes','SQL'];
  const norm = value => String(value || '').normalize('NFKC').trim().toLowerCase();
  const category = value => {
    const key = norm(value);
    const aliases = { 'веб-разработка':'fullstack','аналитика':'data-science','data science':'data-science','дизайн':'ui-ux','ui / ux':'ui-ux','ui/ux':'ui-ux','ии и автоматизация':'ai-ml','ai':'ai-ml','ai / ml':'ai-ml','ai/ml':'ai-ml','исследования':'other' };
    return aliases[key] || (categories.some(([k]) => k === key) ? key : 'other');
  };
  const list = value => Array.isArray(value) ? value.map(String).map(s=>s.trim()).filter(Boolean) : String(value || '').split(/[,\n]/).map(s=>s.trim()).filter(Boolean);
  const unique = values => [...new Set(values)];
  const skillLabel = value => standardSkills.find(s=>match.canonical(s)===match.canonical(value)) || value;
  const number = value => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const day = 86400000;
  function deadlineTime(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const time = Date.parse(value + 'T23:59:59.999Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value ? time : null;
  }
  function canApply(task, now = Date.now()) {
    const published = typeof task.published === 'boolean' ? task.published : task.status === 'published';
    const end = deadlineTime(task.applicationDeadline);
    return published && !task.selectionDone && (end === null || end >= now);
  }
  function durationWeeks(task) {
    const explicit = number(task.durationWeeks);
    if (explicit !== null && explicit > 0) return explicit;
    const text = norm(task.deadline || task.duration);
    const found = text.match(/(\d+(?:[.,]\d+)?)\s*(?:[–—-]\s*(\d+(?:[.,]\d+)?)\s*)?(недел[а-яё]*|weeks?|дн[а-яё]*|день|days?|месяц[а-яё]*|months?)/u);
    if (!found) return null;
    const amount = Number((found[2] || found[1]).replace(',','.'));
    return amount * (/day|дн|день/u.test(found[3]) ? 1/7 : /month|месяц/u.test(found[3]) ? 4 : 1);
  }
  function teamRange(task) {
    const text = String(task.teamSize || task.recommendedTeamSize || '');
    if (/^individual$/i.test(text)) return [1,1];
    const found = text.match(/^(\d+)(?:\s*[-–]\s*(\d+))?(\+)?$/);
    return found ? [Number(found[1]), found[3] ? Infinity : Number(found[2] || found[1])] : null;
  }
  function profileReady(student) { try { const p = match.profile(student || {}); return p.skills.length > 0 && Boolean(p.level); } catch { return false; } }
  function defaults() { return { search:'', category:[], skills:[], difficulty:[], duration:[], teamSize:[], workFormat:[], status:[], readiness:[], minMatch:'', recommended:false, saved:false, sort:'', page:1, limit:12 }; }
  function parse(input) {
    const params = typeof input === 'string' ? new URLSearchParams(input.replace(/^\?/,'')) : input;
    const get = key => params?.get ? params.get(key) : params?.[key];
    const state = defaults();
    state.search = String(get('search') || '').trim().slice(0,200);
    const allowed = { category:categories.map(([k])=>k), difficulty:['easy','medium','hard'], duration:durations.map(([k])=>k), teamSize:teams.map(([k])=>k), workFormat:['remote','hybrid','on-site'], status:['open','closing','new'], readiness:['0-39','40-69','70-89','90-100'] };
    for (const [key, values] of Object.entries(allowed)) state[key] = unique(list(get(key)).map(norm).filter(v=>values.includes(v)));
    state.skills = unique(list(get('skills')).slice(0,30).map(s=>skillLabel(s.slice(0,100))));
    state.minMatch = ['60','75','90'].includes(String(get('minMatch'))) ? String(get('minMatch')) : '';
    state.saved = get('saved') === true || get('saved') === 'true';
    state.recommended = get('recommended') === true || get('recommended') === 'true';
    state.sort = sorts.some(([k])=>k===get('sort')) ? get('sort') : '';
    const page = Number(get('page')), limit = Number(get('limit'));
    state.page = Number.isInteger(page) && page > 0 ? Math.min(page,10000) : 1;
    state.limit = Number.isInteger(limit) && limit > 0 ? Math.min(limit,48) : 12;
    return state;
  }
  function serialize(state) {
    const p = new URLSearchParams();
    for (const key of ['search','category','skills','difficulty','duration','teamSize','workFormat','status','readiness','minMatch','sort']) {
      const value = Array.isArray(state[key]) ? state[key].join(',') : state[key]; if (value) p.set(key,value);
    }
    for (const key of ['saved','recommended']) if (state[key]) p.set(key,'true');
    if (state.page > 1) p.set('page',state.page);
    if (state.limit !== 12) p.set('limit',state.limit);
    return p.toString();
  }
  function enrich(task, { student=null, savedIds=[], now=Date.now(), matchAvailable=profileReady(student) } = {}) {
    const end = deadlineTime(task.applicationDeadline), created = Date.parse(task.publishedAt || task.createdAt || '');
    const skills = list(task.requiredSkills), open = canApply(task,now);
    let result = null;
    if (matchAvailable) { try { result = match.calculate(student, task); } catch (_) {} }
    const daysLeft = end === null ? null : Math.max(0,Math.ceil((end-now)/day));
    return { ...task, requiredSkills: skills, categoryKey:category(task.category), durationWeeks:durationWeeks(task), teamRange:teamRange(task),
      workFormatKey: norm(task.workFormat), shortDescription: task.context || task.problem || '',
      applicantsCount: Number(task.applicantsCount) || 0, isSaved:savedIds.includes(task.id),
      matchScore: result?.matchScore ?? null, matchLabel: result?.label || '', matchResult:result,
      canApply:open, daysLeft, isExpired:end !== null && end < now,
      isNew:open && Number.isFinite(created) && created <= now && now-created <= 7*day,
      isClosingSoon:open && end !== null && end-now <= 7*day, isPopular:Number(task.applicantsCount) >= 5,
      isFeatured:task.featured === true, matchAvailable };
  }
  const inDuration = (n,key) => n !== null && ({'under-1':n<1,'1-2':n>=1&&n<=2,'2-4':n>2&&n<=4,'4-8':n>4&&n<=8,'8-plus':n>8})[key];
  const inTeam = (r,key) => r && ({individual:r[0]===1&&r[1]===1,'2-3':r[0]<=3&&r[1]>=2,'4-5':r[0]<=5&&r[1]>=4,'5-plus':r[1]>=5})[key];
  function query(tasks, rawQuery, context={}) {
    const q = parse(rawQuery), now = context.now ?? Date.now(), ready = profileReady(context.student);
    const published = tasks.filter(t => typeof t.published === 'boolean' ? t.published : t.status !== 'draft');
    const facets = { skills: unique([...standardSkills,...published.flatMap(t=>list(t.requiredSkills).map(skillLabel))]).sort((a,b)=>a.localeCompare(b)) };
    const words = norm(q.search).split(/\s+/).filter(Boolean);
    let items = published.filter(t => {
      const skillKeys = list(t.requiredSkills).map(match.canonical);
      const haystack = norm([t.title,t.context||t.problem,t.company,t.category,...list(t.requiredSkills)].join(' '));
      return words.every(w=>haystack.includes(w)) && (!q.category.length || q.category.includes(category(t.category))) &&
        q.skills.every(s=>skillKeys.includes(match.canonical(s))) && (!q.difficulty.length || q.difficulty.includes(norm(t.difficulty))) &&
        (!q.duration.length || q.duration.some(d=>inDuration(durationWeeks(t),d))) && (!q.teamSize.length || q.teamSize.some(k=>inTeam(teamRange(t),k))) &&
        (!q.workFormat.length || q.workFormat.includes(norm(t.workFormat))) && (!q.readiness.length || q.readiness.some(range=> { const [lo,hi]=range.split('-').map(Number); const score=t.score??t.rating?.total??0; return score>=lo&&score<=hi; }));
    }).map(t=>enrich(t,{...context,now,matchAvailable:ready})).filter(t =>
      (!q.saved || t.isSaved) && (!q.status.length || q.status.some(s=>s==='open'?t.canApply:s==='closing'?t.isClosingSoon:t.isNew)) &&
      (!(q.minMatch || q.recommended) || (t.matchScore !== null && t.matchScore >= Math.max(Number(q.minMatch)||0,q.recommended?75:0))));
    const sort = (q.sort || (ready?'match':'newest')) === 'match' && !ready ? 'newest' : q.sort || (ready?'match':'newest');
    const date = t => Number.isFinite(Date.parse(t.publishedAt || t.createdAt)) ? Date.parse(t.publishedAt || t.createdAt) : -Infinity;
    const cmp = (a,b) => {
      if (sort === 'match') return (b.matchScore ?? -1)-(a.matchScore ?? -1);
      if (sort === 'popular') return b.applicantsCount-a.applicantsCount;
      if (sort === 'deadline') return (!a.canApply?Infinity:deadlineTime(a.applicationDeadline)??Infinity)-(!b.canApply?Infinity:deadlineTime(b.applicationDeadline)??Infinity);
      if (sort === 'difficulty') return ({Easy:1,Medium:2,Hard:3}[a.difficulty]??4)-({Easy:1,Medium:2,Hard:3}[b.difficulty]??4);
      if (sort === 'duration') return (a.durationWeeks??Infinity)-(b.durationWeeks??Infinity);
      if (sort === 'rating') return (b.score??b.rating?.total??0)-(a.score??a.rating?.total??0);
      return date(b)-date(a);
    };
    items.sort((a,b)=>cmp(a,b)||date(b)-date(a)||String(a.id).localeCompare(String(b.id)));
    const total = items.length, start = (q.page-1)*q.limit;
    return { items:items.slice(start,start+q.limit), pagination:{page:q.page,limit:q.limit,total,hasMore:start+q.limit<total}, facets, matchAvailable:ready, sort };
  }
  function validateFields(value) {
    const fail = message => { const e = new Error(message); e.status=400; throw e; };
    if (value.applicationDeadline && deadlineTime(value.applicationDeadline)===null) fail('Некорректная дата приёма заявок');
    if (value.durationWeeks && !(number(value.durationWeeks)>0 && number(value.durationWeeks)<=104)) fail('Длительность: от 0 до 104 недель');
    if (value.teamSize && !['1','2-3','4-5','5+'].includes(value.teamSize)) fail('Некорректный размер команды');
    if (value.workFormat && !['Remote','Hybrid','On-site'].includes(value.workFormat)) fail('Некорректный формат участия');
  }
  return Object.freeze({ categories,durations,teams,sorts,standardSkills,defaults,parse,serialize,query,enrich,canApply,deadlineTime,durationWeeks,teamRange,profileReady,validateFields });
});
