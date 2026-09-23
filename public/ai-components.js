/* Reusable view fragments and the structured AI-to-editor mapping. */
(() => {
  const lines = value => String(value || '').split('\n').map(s => s.trim()).filter(Boolean);
  const tags = value => String(value || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  const taskFromDraft = draft => ({
    title: draft.title || 'Черновик задачи', problem: draft.problem || '', goal: draft.need || '', targetUsers: lines(draft.users), requirements: lines(draft.requirements),
    expectedResult: draft.outcome || '', acceptanceCriteria: lines(draft.success), requiredSkills: tags(draft.requiredSkills),
    difficulty: draft.difficulty || null, estimatedDuration: draft.deadline || '', recommendedTeamSize: draft.recommendedTeamSize ? Number(draft.recommendedTeamSize) : null,
    data: draft.data || '', constraints: draft.constraints || '', contact: draft.contact || '', interactionFormat: draft.interactionFormat || '',
    missingInfo: lines(draft.aiMissingInfo), assumptions: lines(draft.aiAssumptions)
  });
  const applyTask = (draft, task) => Object.assign(draft, {
    title: task.title, problem: task.problem, need: task.goal, users: task.targetUsers.join('\n'), requirements: task.requirements.join('\n'),
    outcome: task.expectedResult, success: task.acceptanceCriteria.join('\n'), requiredSkills: task.requiredSkills.join(', '), difficulty: task.difficulty || '',
    deadline: task.estimatedDuration, recommendedTeamSize: task.recommendedTeamSize == null ? '' : String(task.recommendedTeamSize),
    data: task.data, constraints: task.constraints, contact: task.contact, interactionFormat: task.interactionFormat,
    aiMissingInfo: task.missingInfo.join('\n'), aiAssumptions: task.assumptions.join('\n')
  });
  function session(draft) {
    try { const parsed = JSON.parse(draft.aiSession || 'null'); if (parsed && parsed.version === 1 && Array.isArray(parsed.answers) && Array.isArray(parsed.questions)) return parsed; } catch (_) {}
    return { version: 1, description: draft.problem || '', answers: [], questions: [], compose: '', summary: '', generated: false, demo: false, previousTask: null };
  }
  window.MostAIComponents = {
    lines, tags, taskFromDraft, applyTask, session,
    progress(step) {
      return `<ol class="ai-progress" aria-label="Этапы создания задачи">${['Describe', 'AI Interview', 'Generated Task', 'Review & Publish'].map((label, i) => `<li class="${step === i + 1 ? 'current' : step > i + 1 ? 'done' : ''}" ${step === i + 1 ? 'aria-current="step"' : ''}><span>${step > i + 1 ? '✓' : i + 1}</span>${label}</li>`).join('')}</ol>`;
    },
    loading(label, detail) { return `<div class="ai-loading" role="status" aria-live="polite"><div class="ai-orb">✦</div><h3>${label}</h3><p class="muted">${detail}</p><div class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></div><div class="ai-skeleton"></div><div class="ai-skeleton short"></div></div>`; },
    skillTags(draft, h) { return `<div class="skill-tags">${tags(draft.requiredSkills).map(tag => `<span>${h(tag)}</span>`).join('') || '<span class="muted">Навыки пока не определены</span>'}</div>`; },
    notes(draft, h) { return [ ['aiAssumptions', 'Предположения и рекомендации — проверьте'], ['aiMissingInfo', 'Нужно уточнить'] ].map(([key, title]) => draft[key] ? `<details class="ai-notes" open><summary>${title}</summary><ul>${lines(draft[key]).map(value => `<li>${h(value)}</li>`).join('')}</ul></details>` : '').join(''); }
  };
})();
