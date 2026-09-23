// Expose the team's existing rating without duplicating its weights in the browser.
import { calculateRating, fields, levelForScore } from './rating.js';
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
export async function describeAIRating(input, ai) {
  // Keep the local/demo installation usable without a configured provider. In a
  // configured environment the score below is always replaced by the AI review.
  if (!ai.status().configured) return { ...describeRating(input), assessmentSource: 'fallback' };
  const criteria = Object.entries(fields).map(([key, [label, max]]) => ({
    key, label, max, text: typeof input[key] === 'string' ? input[key].trim() : ''
  }));
  const assessed = await ai.assessReadiness(input, criteria);
  const breakdown = criteria.map(criterion => {
    const assessment = assessed.find(item => item.key === criterion.key);
    const { text: _text, ...publicCriterion } = criterion;
    return { ...publicCriterion, points: assessment.points, hint: assessment.hint };
  });
  const score = breakdown.reduce((total, item) => total + item.points, 0);
  return {
    score, level: levelForScore(score),
    missingFields: breakdown.filter(item => item.points < item.max).map(item => item.label),
    breakdown,
    assessmentSource: 'OpenAI',
    missingDetails: Object.entries(extraFields).filter(([key]) => !String(input[key] || '').trim())
      .map(([key, [label]]) => ({ key, label, hint: questions[key] }))
  };
}
export function clarificationQuestions(input) {
  const all = { ...fields, ...extraFields };
  const keys = Object.keys(all).filter(key => !String(input[key] || '').trim());
  for (const key of Object.keys(all)) { if (keys.length >= 3) break; if (!keys.includes(key)) keys.push(key); }
  return keys.map(key => ({ key, label: questions[key], placeholder: all[key][0] }));
}
