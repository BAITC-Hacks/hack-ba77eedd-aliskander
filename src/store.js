import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { calculateRating, fields } from './rating.js';

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
export function createStore(file) {
  let state;
  try { state = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = { tasks: [], proposals: [] };
  }
  if (!Array.isArray(state.tasks) || !Array.isArray(state.proposals)) {
    throw new Error('Некорректный файл данных');
  }
  function commit(next) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2), 'utf8');
    renameSync(`${file}.tmp`, file);
    state = next;
  }
  function task(id) {
    const found = state.tasks.find(item => item.id === id);
    if (!found) throw new ApiError(404, 'Задача не найдена');
    return { ...found, ...calculateRating(found) };
  }
  const taskKeys = ['title', ...Object.keys(fields)];
  return {
    getTask: task,
    listTasks(publishedOnly = true) {
      return state.tasks.filter(item => !publishedOnly || item.published)
        .map(item => task(item.id)).sort((a, b) => b.score - a.score);
    },
    createTask(input) {
      const values = strings(input, taskKeys);
      const item = { ...Object.fromEntries(taskKeys.map(key => [key, ''])), ...values,
        id: randomUUID(), published: false };
      Object.assign(item, calculateRating(item));
      commit({ ...state, tasks: [...state.tasks, item] });
      return task(item.id);
    },
    updateTask(id, input) {
      const item = { ...task(id), ...strings(input, taskKeys) };
      Object.assign(item, calculateRating(item));
      commit({ ...state, tasks: state.tasks.map(old => old.id === id ? item : old) });
      return task(id);
    },
    publishTask(id) {
      const item = { ...task(id), published: true };
      commit({ ...state, tasks: state.tasks.map(old => old.id === id ? item : old) });
      return task(id);
    },
    createProposal(taskId, input) {
      if (!task(taskId).published) throw new ApiError(409, 'Задача еще не опубликована');
      const keys = ['teamName', 'idea', 'plan', 'deadline', 'prototypeUrl'];
      const values = strings(input, keys);
      for (const key of keys.filter(key => key !== 'prototypeUrl')) {
        if (!values[key]) throw new ApiError(400, `Заполните ${key}`);
      }
      const item = { prototypeUrl: '', ...values, id: randomUUID(), taskId, status: 'pending' };
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
      const item = { ...old, status };
      commit({ ...state, proposals: state.proposals.map(old => old.id === id ? item : old) });
      return { ...item };
    },
  };
}
