(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MostMilestones = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  const defaults = task => [
    {title:'Согласование решения', criteria:'Схема решения и список функций согласованы с бизнесом; описаны данные и ограничения.', points:20},
    {title:'Рабочий прототип', criteria:(task.expectedResult || task.outcome) ? 'Передать результат: '+String(task.expectedResult||task.outcome).slice(0,1400) : 'Основной пользовательский сценарий работает; передана ссылка и инструкция проверки.', points:30},
    {title:'Проверка и передача', criteria:(task.successCriteria || task.success) ? 'Проверить результат: '+String(task.successCriteria||task.success).slice(0,1400) : 'Пройдены согласованные сценарии приёмки; переданы исходники и инструкция.', points:50}
  ];
  function parse(value, task = {}) {
    let plan;
    try { plan = value ? (typeof value === 'string' ? JSON.parse(value) : value) : defaults(task); }
    catch { throw new Error('Некорректный план этапов'); }
    if (!Array.isArray(plan) || plan.length < 2 || plan.length > 3) throw new Error('Нужно 2–3 этапа');
    const result = plan.map(p => {
      if (!p || typeof p.title !== 'string' || !p.title.trim() || p.title.length>150 || typeof p.criteria !== 'string' || p.criteria.trim().length<10 || p.criteria.length>1500 || !Number.isInteger(p.points) || p.points<1 || p.points>99) throw new Error('У каждого этапа нужны название, критерий приёмки и баллы');
      return {title:p.title.trim(),criteria:p.criteria.trim(),points:p.points};
    });
    if (result.reduce((n,p)=>n+p.points,0)!==100) throw new Error('Сумма баллов за этапы должна быть 100');
    return result;
  }
  return { defaults, parse };
});
