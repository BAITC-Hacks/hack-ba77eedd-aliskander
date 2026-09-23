/* One transparent completeness scale for server, editor and offline demo. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MostReadiness = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  const fields = {
    context: ['Контекст и проблема', 20, 'Что сейчас не работает и кого это затрагивает?'],
    data: ['Данные и материалы', 20, 'Какие материалы, данные или доступы получит команда?'],
    expectedResult: ['Ожидаемый результат', 15, 'Что именно команда должна передать бизнесу?'],
    successCriteria: ['Критерии приёмки', 15, 'Как вы проверите результат: показатель или сценарий?'],
    constraints: ['Ограничения', 10, 'Укажите сроки, бюджет, ограничения по технологиям.'],
    users: ['Пользователи', 10, 'Кто и в какой ситуации будет использовать решение?'],
    contact: ['Контакт бизнеса', 10, 'Как команда свяжется с ответственным человеком?']
  };
  const filled = value => typeof value === 'string' && Boolean(value.trim()) && !/^(?:пока\s+)?(?:не знаю|не определено|не определён|не указан[оы]?|уточняется|обсудим|tbd|n\/a|[-—?.]+)[.!]?$/i.test(value.trim());
  const levelForScore = score => score < 40 ? 'Черновик' : score < 70 ? 'Рабочая' : score < 90 ? 'Готовая' : 'Приоритетная';
  function describe(input = {}) {
    const breakdown = Object.entries(fields).map(([key, [label, max, hint]]) => ({ key, label, max, hint, points: filled(input[key]) ? max : 0 }));
    const score = breakdown.reduce((sum, item) => sum + item.points, 0);
    return { score, level: levelForScore(score), breakdown, assessmentSource: 'completeness',
      missingFields: breakdown.filter(item => item.points < item.max).map(item => item.label),
      missingDetails: [['need','Потребность бизнеса','Какую потребность закрывает решение?'], ['interactionFormat','Формат взаимодействия','Как часто и каким способом вы будете общаться?']]
        .filter(([key]) => !filled(input[key])).map(([key,label,hint]) => ({key,label,hint})) };
  }
  return Object.freeze({ fields, filled, levelForScore, describe });
});
