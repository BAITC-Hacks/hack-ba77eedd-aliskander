// Expose the team's existing rating without duplicating its weights in the browser.
import { calculateRating, fields } from './rating.js';
const questions = {
  context: 'Какая проблема возникает сейчас и кого она затрагивает?',
  data: 'Какие данные, материалы или доступы вы предоставите команде?',
  expectedResult: 'Что команда должна передать вам в конце работы?',
  successCriteria: 'Как вы проверите, что задача решена успешно?',
  constraints: 'Какие есть ограничения по срокам, бюджету и технологиям?',
  users: 'Кто будет пользоваться решением и в какой ситуации?',
  contact: 'Как команда сможет связаться с представителем бизнеса?'
};
export function describeRating(input) {
  return { ...calculateRating(input), breakdown: Object.entries(fields).map(([key, [label, max]]) => ({
    key, label, max, points: typeof input[key] === 'string' && input[key].trim() ? max : 0,
    hint: questions[key]
  })) };
}
export function clarificationQuestions(input) {
  // Deterministic questions, not a claim of AI generation.
  const keys = Object.keys(fields).filter(key => !String(input[key] || '').trim());
  for (const key of Object.keys(fields)) { if (keys.length >= 3) break; if (!keys.includes(key)) keys.push(key); }
  return keys.map(key => ({ key, label: questions[key], placeholder: fields[key][0] }));
}
