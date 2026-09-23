import assert from 'node:assert/strict';
import { createAIService } from '../src/ai.js';

const ai = createAIService();
assert.ok(ai.status().configured, 'OPENAI_API_KEY не задан: скопируйте .env.example в .env и перезапустите сервер');

const description = 'Нужен сервис для записи клиентов на групповые занятия. Сейчас администратор переносит заявки вручную, а клиентам нужно видеть доступные занятия и получать подтверждение записи.';
const answers = [];
let result = await ai.turn({ action: 'analyze', description, answers });
for (let turn = 0; result.status === 'interview' && answers.length < 5; turn++) {
  const question = result.questions[0];
  const safeAnswers = {
    goal: 'Сократить ручную обработку заявок и ошибки при записи.',
    targetUsers: 'Клиенты студии и администратор.',
    requirements: 'Просмотр занятий, отправка заявки и подтверждение записи.',
    successCriteria: 'Клиент проходит сценарий записи, а администратор видит новую заявку.',
    deadline: 'Не определено', data: 'Не определено', constraints: 'Не определено',
    contact: 'Не определено', interactionFormat: 'Не определено'
  };
  answers.push({ key: question.key, question: question.label, answer: safeAnswers[question.key] || 'Не определено' });
  result = await ai.turn({ action: 'answer', description, answers });
}

assert.equal(result.status, 'ready', 'Интервью не завершилось за пять ответов');
assert.equal(result.mode, 'live');
assert.equal(result.provider, 'OpenAI');
assert.equal(result.task.estimatedDuration, '', 'AI придумал срок');
assert.equal(result.task.contact, '', 'AI придумал контакт');
assert.equal(result.task.data, '', 'AI придумал доступные данные');
assert.doesNotMatch(result.task.constraints, /бюджет|руб|₽|тенге|₸|\$|€/iu, 'AI придумал бюджет');
console.log(`OpenAI live: интервью завершено за ${answers.length} ответ(а/ов), неподтверждённые факты не добавлены.`);
