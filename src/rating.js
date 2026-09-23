export const fields = {
  context: ['Контекст / потребность / проблема', 20],
  data: ['Доступные данные и материалы', 20],
  expectedResult: ['Ожидаемый результат', 15],
  successCriteria: ['Критерии успеха', 15],
  constraints: ['Ограничения', 10],
  users: ['Для кого создается решение', 10],
  contact: ['Контакт и способ связи с бизнесом', 10],
};

export function levelForScore(score) {
  if (score < 40) return 'Черновик';
  if (score < 70) return 'Рабочая';
  if (score < 90) return 'Готовая';
  return 'Приоритетная';
}

export function calculateRating(task) {
  let score = 0;
  const missingFields = [];
  for (const [key, [label, weight]] of Object.entries(fields)) {
    if (typeof task[key] === 'string' && task[key].trim()) score += weight;
    else missingFields.push(label);
  }
  return { score, level: levelForScore(score), missingFields };
}
