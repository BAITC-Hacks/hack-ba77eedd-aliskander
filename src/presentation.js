// Expose the team's existing rating without duplicating its weights in the browser.
import { calculateRating, fields } from './rating.js';
const extraFields = { need: ['Потребность бизнеса'], interactionFormat: ['Формат взаимодействия'] };
const questions = {
  context: 'Какая проблема возникает сейчас и кого она затрагивает?',
  need: 'Какую потребность бизнеса должно закрыть решение?',
  interactionFormat: 'Как вы будете взаимодействовать: онлайн или очно, как часто и кто будет на связи?',
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
  })), missingDetails: Object.entries(extraFields).filter(([key]) => !String(input[key] || '').trim())
    .map(([key, [label]]) => ({ key, label, hint: questions[key] })) };
}
export function clarificationQuestions(input) {
  const all = { ...fields, ...extraFields };
  const keys = Object.keys(all).filter(key => !String(input[key] || '').trim());
  for (const key of Object.keys(all)) { if (keys.length >= 3) break; if (!keys.includes(key)) keys.push(key); }
  return keys.map(key => ({ key, label: questions[key], placeholder: all[key][0] }));
}
