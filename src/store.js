import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { calculateRating, fields } from './rating.js';
import { describeRating } from './presentation.js';
import catalog from '../public/catalog-engine.cjs';
import { calculateMatch, normalizeProfile, validateTaskMatchFields } from './match.js';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function strings(input, keys) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(400, 'Ожидается JSON-объект');
  }
  const result = {};
  for (const key of keys) {
    if (!Object.hasOwn(input, key)) continue;
    if (typeof input[key] !== 'string') throw new ApiError(400, `${key}: ожидается строка`);
    result[key] = input[key].trim();
  }
  return result;
}

// One server process owns this file. Commit to disk before replacing in-memory state.
export function createStore(file, initialState = { tasks: [], proposals: [], stages: [] }) {
  let state;
  try { state = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = structuredClone(initialState);
  }
  if (!Array.isArray(state.tasks) || !Array.isArray(state.proposals)) {
    throw new Error('Некорректный файл данных');
  }
  // Older databases have no stages; preserve their tasks and proposals.
  state.stages ??= [];
  state.students ??= {};
  state.savedTasks ??= {};
  if (!state.students || typeof state.students !== 'object' || Array.isArray(state.students)) throw new Error('Некорректные профили');
  if (!Array.isArray(state.stages)) throw new Error('Некорректные этапы в файле данных');
  function commit(next) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2), 'utf8');
    renameSync(`${file}.tmp`, file);
    state = next;
  }
  function task(id) {
    const found = state.tasks.find(item => item.id === id);
    if (!found) throw new ApiError(404, 'Задача не найдена');
    const proposals = state.proposals.filter(p => p.taskId === id);
    return { ...found, ...describeRating(found), canApply: catalog.canApply(found), offerCount: proposals.length, applicantsCount: new Set(proposals.map(p => p.teamId || p.id)).size };
  }
  function studentProfile(id) {
    const saved = Object.hasOwn(state.students, id) ? state.students[id] : normalizeProfile({});
    const seen = new Set();
    const completedTasks = state.stages.filter(s => s.teamId === id && s.status === 'approved' && !seen.has(s.taskId) && seen.add(s.taskId)).map(s => {
      const t = task(s.taskId);
      return { title: t.title, skills: t.requiredSkills || [], category: t.category || '', completed: true, url: s.url || '' };
    });
    return structuredClone({ ...saved, completedTasks });
  }
  function selectProposals(taskId, proposalIds) {
    const current = task(taskId);
    if (!current.published) throw new ApiError(409, 'Сначала опубликуйте задачу');
    if (current.selectionDone) throw new ApiError(409, 'Выбор уже подтверждён');
    if (!Array.isArray(proposalIds) || proposalIds.some(id => typeof id !== 'string')) throw new ApiError(400, 'proposalIds: ожидается массив строк');
    const ids = [...new Set(proposalIds)];
    const offers = state.proposals.filter(p => p.taskId === taskId);
    if (ids.some(id => !offers.some(p => p.id === id))) throw new ApiError(400, 'Предложение команды не найдено');
    const chosen = offers.filter(p => ids.includes(p.id));
    const teams = new Map(chosen.map(p => [p.teamId || p.id, p]));
    const item = { ...current, selectionDone: true, selectedTeamIds: [...teams.keys()], selectedProposalIds: ids };
    const stages = [...teams.entries()].map(([teamId, p]) => ({ id: randomUUID(), taskId, teamId, team: p.teamName,
      title: 'Демонстрация рабочего прототипа', points: 100, status: 'in_progress', result: '', url: '', feedback: '' }));
    commit({ ...state,
      tasks: state.tasks.map(t => t.id === taskId ? item : t),
      proposals: state.proposals.map(p => p.taskId === taskId ? { ...p, status: ids.includes(p.id) ? 'selected' : 'rejected' } : p),
      stages: [...state.stages, ...stages]
    });
    return task(taskId);
  }
  const taskKeys = ['title', 'company', 'category', 'deadline', 'need', 'interactionFormat', 'requirements', 'requiredSkills', 'difficulty', 'recommendedTeamSize', 'requiredHours', 'durationWeeks', 'teamSize', 'workFormat', 'applicationDeadline', 'aiSession', 'aiAssumptions', 'aiMissingInfo', ...Object.keys(fields)];
  return {
    queryCatalog(query, studentId) {
      const counts = new Map(), applicants = new Map();
      for (const p of state.proposals) { counts.set(p.taskId, (counts.get(p.taskId)||0)+1); if (!applicants.has(p.taskId)) applicants.set(p.taskId,new Set()); applicants.get(p.taskId).add(p.teamId||p.id); }
      const tasks = state.tasks.map(t=>({...t,...describeRating(t),offerCount:counts.get(t.id)||0,applicantsCount:applicants.get(t.id)?.size||0}));
      return catalog.query(tasks,query,{student:studentId?studentProfile(studentId):null,savedIds:studentId && Object.hasOwn(state.savedTasks,studentId)?state.savedTasks[studentId]:[]});
    },
    getCatalogTask(id, studentId) {
      return catalog.enrich(task(id),{student:studentId?studentProfile(studentId):null,savedIds:studentId && Object.hasOwn(state.savedTasks,studentId)?state.savedTasks[studentId]:[]});
    },
    setSavedTask(studentId, taskId, saved) {
      if (!studentId || studentId.length>100 || typeof saved !== 'boolean') throw new ApiError(400,'Некорректная закладка');
      if (!task(taskId).published) throw new ApiError(409,'Можно сохранять только опубликованные задачи');
      const ids = new Set(Object.hasOwn(state.savedTasks,studentId)?state.savedTasks[studentId]:[]);
      if (saved) ids.add(taskId); else ids.delete(taskId);
      commit({...state,savedTasks:{...state.savedTasks,[studentId]:[...ids]}});
      return {taskId,isSaved:saved};
    },
    getStudentProfile: studentProfile,
    saveStudentProfile(id, input) {
      if (typeof id !== 'string' || !id.trim() || id.length > 100) throw new ApiError(400, 'Некорректный идентификатор участника');
      const value = normalizeProfile(input);
      commit({ ...state, students: { ...state.students, [id]: value } });
      return studentProfile(id);
    },
    selectProposals,
    // Keep the earlier API compatible; the UI now selects individual proposal IDs.
    selectTeams(taskId, teamIds) {
      if (!Array.isArray(teamIds) || teamIds.some(id => typeof id !== 'string')) throw new ApiError(400, 'teamIds: ожидается массив строк');
      const offers = state.proposals.filter(p => p.taskId === taskId);
      if (teamIds.some(id => !offers.some(p => (p.teamId || p.id) === id))) throw new ApiError(400, 'Предложение команды не найдено');
      return selectProposals(taskId, offers.filter(p => teamIds.includes(p.teamId || p.id)).map(p => p.id));
    },
    listStages() { return state.stages.map(stage => ({ ...stage })); },
    submitStage(id, input) {
      const old = state.stages.find(stage => stage.id === id);
      if (!old) throw new ApiError(404, 'Этап не найден');
      if (!['in_progress', 'revision'].includes(old.status)) throw new ApiError(409, 'Этап уже отправлен или подтверждён');
      const values = strings(input, ['result', 'url']);
      if (!values.result || !values.url) throw new ApiError(400, 'Добавьте описание и ссылку на результат');
      try { if (!['https:', 'http:'].includes(new URL(values.url).protocol)) throw new Error(); }
      catch { throw new ApiError(400, 'Ожидается ссылка http:// или https://'); }
      const item = { ...old, ...values, status: 'pending' };
      commit({ ...state, stages: state.stages.map(stage => stage.id === id ? item : stage) });
      return { ...item };
    },
    reviewStage(id, input) {
      const old = state.stages.find(stage => stage.id === id);
      if (!old) throw new ApiError(404, 'Этап не найден');
      if (old.status !== 'pending') throw new ApiError(409, 'Этап уже проверен или ещё не отправлен');
      if (typeof input?.approved !== 'boolean') throw new ApiError(400, 'approved: ожидается логическое значение');
      const { feedback = '' } = strings(input, ['feedback']);
      if (!input.approved && !feedback) throw new ApiError(400, 'Укажите, что нужно доработать');
      const item = { ...old, status: input.approved ? 'approved' : 'revision', feedback };
      commit({ ...state, stages: state.stages.map(stage => stage.id === id ? item : stage) });
      return { ...item };
    },
    getTask: task,
    listTasks(publishedOnly = true) {
      return state.tasks.filter(item => !publishedOnly || item.published)
        .map(item => task(item.id)).sort((a, b) => b.score - a.score);
    },
    createTask(input) {
      const values = strings(input, taskKeys);
      validateTaskMatchFields(values);
      try { catalog.validateFields(values); } catch (error) { throw new ApiError(400,error.message); }
      const item = { ...Object.fromEntries(taskKeys.map(key => [key, ''])), ...values,
        id: randomUUID(), published: false, createdAt: new Date().toISOString() };
      Object.assign(item, calculateRating(item));
      commit({ ...state, tasks: [...state.tasks, item] });
      return task(item.id);
    },
    updateTask(id, input) {
      const values = strings(input, taskKeys);
      validateTaskMatchFields(values);
      try { catalog.validateFields(values); } catch (error) { throw new ApiError(400,error.message); }
      const item = { ...task(id), ...values };
      Object.assign(item, calculateRating(item));
      commit({ ...state, tasks: state.tasks.map(old => old.id === id ? item : old) });
      return task(id);
    },
    publishTask(id) {
      const old = task(id);
      const item = { ...old, published: true, publishedAt: old.publishedAt || new Date().toISOString() };
      commit({ ...state, tasks: state.tasks.map(old => old.id === id ? item : old) });
      return task(id);
    },
    createProposal(taskId, input) {
      if (!task(taskId).published) throw new ApiError(409, 'Задача еще не опубликована');
      if (!catalog.canApply(task(taskId))) throw new ApiError(409, 'Приём предложений завершён или дедлайн прошёл');
      const keys = ['teamName', 'idea', 'plan', 'deadline', 'prototypeUrl', 'teamId', 'members', 'contact'];
      const values = strings(input, keys);
      for (const key of ['teamName', 'idea', 'plan', 'deadline']) {
        if (!values[key]) throw new ApiError(400, `Заполните ${key}`);
      }
      const student = values.teamId ? studentProfile(values.teamId) : null;
      let matchSnapshot = null;
      // Match is advisory: legacy incomplete task metadata must never block an offer.
      if (student) { try { matchSnapshot = calculateMatch({ student, task: task(taskId) }); } catch (_) {} }
      const item = { prototypeUrl: '', ...values, id: randomUUID(), taskId, status: 'pending', studentProfile: student, matchSnapshot };
      commit({ ...state, proposals: [...state.proposals, item] });
      return { ...item };
    },
    listProposals(taskId) {
      task(taskId);
      return state.proposals.filter(item => item.taskId === taskId).map(item => ({ ...item }));
    },
    decideProposal(id, status) {
      if (!['selected', 'rejected'].includes(status)) throw new ApiError(400, 'Допустимы selected или rejected');
      const old = state.proposals.find(item => item.id === id);
      if (!old) throw new ApiError(404, 'Предложение не найдено');
      if (task(old.taskId).selectionDone) throw new ApiError(409, 'Выбор команд уже подтверждён');
      const item = { ...old, status };
      commit({ ...state, proposals: state.proposals.map(old => old.id === id ? item : old) });
      return { ...item };
    },
  };
}
