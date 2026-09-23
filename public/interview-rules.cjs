/* Enforce three useful questions even when a provider returns a card early. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MostInterview = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  function ensureMinimum(output, input) {
    const answers = input.answers || [];
    if (!['analyze','answer'].includes(input.action) || answers.length >= 3) return output;
    const used = new Set(answers.map(answer => answer.key));
    const pending = (output.questions || []).filter(q => !used.has(q.key));
    pending.forEach(q => used.add(q.key));
    const task = output.task || input.currentTask || {};
    const candidates = [
      ['confirm_result', task.expectedResult ? `Верно ли, что итог работы — «${task.expectedResult.slice(0, 330)}»? Что обязательно должно войти в приёмку?` : 'Что команда должна передать в конце проекта и как вы проверите результат?'],
      ['confirm_scope', 'Какое действие пользователя самое важное в первой версии? Что можно отложить?'],
      ['confirm_data', task.data ? `Можно ли предоставить команде эти материалы: «${task.data.slice(0, 330)}»? Есть ли ограничения доступа?` : 'Какие данные или материалы получит команда? Если их нет, как можно проверить прототип?'],
      ['confirm_contact', 'Кто будет принимать результат и как часто сможет отвечать на вопросы команды?'],
      ['confirm_constraints', 'Какой срок или ограничение критично для первой версии?']
    ];
    for (const [key, label] of candidates) {
      if (pending.length >= 3 - answers.length) break;
      if (!used.has(key)) { pending.push({ id:key, key, label, chips:[] }); used.add(key); }
    }
    return { ...output, status:'interview', task:null, questions:pending,
      summary:'Проверим ключевые детали перед карточкой: минимум три уточнения, затем ваше подтверждение.' };
  }
  return { ensureMinimum };
});
