/* Shared deterministic engine: CommonJS on Node, ordinary script in the offline demo. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MostMatch = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const weights = Object.freeze({ skills: 50, experience: 20, interest: 10, difficulty: 10, availability: 10 });
  const aliases = { 'react.js': 'react', reactjs: 'react', 'node.js': 'node', nodejs: 'node', 'vue.js': 'vue', vuejs: 'vue', js: 'javascript', ts: 'typescript', postgres: 'postgresql', 'rest api': 'rest', restful: 'rest', 'restful api': 'rest', 'telegram bot api': 'telegram', 'c sharp': 'c#', 'c++': 'c++' };
  const canonical = value => { const text = value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '); return aliases[text] || text; };
  const fail = message => { const error = new Error(message); error.status = 400; throw error; };
  const obj = value => value && typeof value === 'object' && !Array.isArray(value);
  function text(value, label, limit = 1000) { if (value == null) return ''; if (typeof value !== 'string' || value.length > limit) fail(label + ': некорректный текст'); return value.trim(); }
  function list(value, label) {
    if (value == null || value === '') return [];
    if (typeof value === 'string') value = value.split(/[,\n]/);
    if (!Array.isArray(value) || value.length > 50) fail(label + ': ожидается до 50 значений');
    const seen = new Set();
    return value.map(v => text(v, label, 200)).filter(v => { const key = canonical(v); if (!key || seen.has(key)) return false; seen.add(key); return true; });
  }
  function hours(value, label) {
    if (value == null || value === '') return null;
    const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
    if (!Number.isFinite(number) || number < 0 || number > 168) fail(label + ': укажите часы от 0 до 168');
    return number;
  }
  function choice(value, choices, label) { const v = text(value, label, 50); if (v && !choices.includes(v)) fail(label + ': неизвестное значение'); return v; }
  function link(value) { const v = text(value, 'Ссылка', 1000); if (!v) return ''; try { if (['http:', 'https:'].includes(new URL(v).protocol)) return v; } catch (_) {} fail('Ссылка должна начинаться с http:// или https://'); }
  function profile(raw = {}) {
    if (!obj(raw)) fail('Ожидается профиль студента');
    const projects = raw.projects ?? [];
    if (!Array.isArray(projects) || projects.length > 30) fail('Укажите не больше 30 проектов');
    if(raw.members!=null && (!Array.isArray(raw.members)||raw.members.length>20))fail('В команде должно быть не больше 20 участников');
    const members=(raw.members||[]).map(member=>{
      if(!obj(member))fail('Некорректный участник команды');
      const name=text(member.name,'Имя участника',80); if(!name)fail('Укажите имя каждого участника');
      return {name,role:text(member.role,'Роль участника',100),skills:list(member.skills,'Навыки участника'),level:choice(member.level,['Beginner','Intermediate','Advanced'],'Уровень участника'),availabilityHours:hours(member.availabilityHours,'Часы участника')};
    });
    const result = { members, name: text(raw.name, 'Имя', 100), skills: list(raw.members?.length ? [] : raw.skills, 'Навыки'), experience: list(raw.experience, 'Опыт'),
      interests: list(raw.interests, 'Интересы'), level: choice(raw.level, ['Beginner', 'Intermediate', 'Advanced'], 'Уровень'),
      preferredDifficulty: choice(raw.preferredDifficulty, ['Easy', 'Medium', 'Hard'], 'Желаемая сложность'), availabilityHours: hours(raw.availabilityHours, 'Доступность'),
      githubUrl: link(raw.githubUrl), portfolioUrl: link(raw.portfolioUrl), githubTechnologies: list(raw.githubTechnologies, 'Технологии GitHub'),
      projects: projects.map(p => { if (!obj(p) || typeof p.completed !== 'boolean') fail('У проекта нужен статус completed'); return { title: text(p.title, 'Название проекта', 200), skills: list(p.skills, 'Технологии проекта'), category: text(p.category, 'Направление', 100), completed: p.completed, url: link(p.url) }; }) };
    if(members.length) {
      result.skills=[...new Map(members.flatMap(m=>m.skills).map(skill=>[canonical(skill),skill])).values()];
      const levels=['Beginner','Intermediate','Advanced'];
      result.level=members.every(m=>m.level)?levels[Math.min(...members.map(m=>levels.indexOf(m.level)))]:'';
      result.availabilityHours=members.every(m=>m.availabilityHours!==null)?Math.min(...members.map(m=>m.availabilityHours)):null;
    }
    return result;
  }
  function task(raw) {
    if (!obj(raw)) fail('Ожидается задача');
    return { title: text(raw.title, 'Задача', 300), requiredSkills: list(raw.requiredSkills, 'Навыки задачи'), category: text(raw.category, 'Направление', 100),
      difficulty: choice(raw.difficulty, ['Easy', 'Medium', 'Hard'], 'Сложность'), requiredHours: hours(raw.requiredHours, 'Нагрузка') };
  }
  const directions = value => {
    const key = canonical(value);
    const map = { fullstack: ['frontend', 'backend'], 'ai / ml': ['ai'], 'ui / ux': ['design'], 'веб-разработка': ['frontend', 'backend'], 'web development': ['frontend', 'backend'], 'ии и автоматизация': ['ai'], 'аналитика': ['data'], analytics: ['data'], 'data science': ['data'], 'дизайн': ['design'], 'исследования': ['research'], 'мобильная разработка': ['mobile'] };
    return map[key] || [key];
  };
  const related = (a, b) => a && b && directions(a).some(key => directions(b).includes(key));
  const containsSkill = (phrase, skill) => {
    const variants = [skill, ...Object.keys(aliases).filter(key => aliases[key] === skill)];
    const haystack = phrase.normalize('NFKC').toLowerCase();
    return variants.some(v => new RegExp('(^|[^\\p{L}\\p{N}+#])' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^\\p{L}\\p{N}+#])', 'u').test(haystack));
  };
  const labelFor = score => score >= 90 ? 'Отличное соответствие' : score >= 75 ? 'Высокое соответствие' : score >= 60 ? 'Хорошее соответствие' : score >= 40 ? 'Частичное соответствие' : 'Низкое соответствие';
  function calculate(rawStudent, rawTask) {
    const student = profile(rawStudent), target = task(rawTask);
    if (rawStudent.completedTasks != null) student.projects.push(...profile({ projects: rawStudent.completedTasks }).projects);
    const required = target.requiredSkills;
    const studentKeys = new Set(student.skills.map(canonical));
    const matchedSkills = required.filter(s => studentKeys.has(canonical(s)));
    const missingSkills = required.filter(s => !studentKeys.has(canonical(s)));
    const projectNames = new Set(), projectLinks = new Set();
    student.projects = student.projects.filter(p => {
      const key = canonical(p.title);
      if (!key || projectNames.has(key) || (p.url && projectLinks.has(p.url))) return false;
      projectNames.add(key); if (p.url) projectLinks.add(p.url); return true;
    });
    const relevantProjects = student.projects.filter(p => p.completed && (p.skills.some(s => required.some(r => canonical(r) === canonical(s))) || related(p.category, target.category)));
    const evidenceTexts = [...student.experience, ...student.githubTechnologies, ...student.projects.filter(p => p.completed).flatMap(p => p.skills)];
    const evidenceSkills = required.filter(s => evidenceTexts.some(v => containsSkill(v, canonical(s))));
    const matchingInterests = student.interests.filter(i => related(i, target.category));
    const matrix = { Beginner: { Easy: 100, Medium: 40, Hard: 10 }, Intermediate: { Easy: 100, Medium: 90, Hard: 50 }, Advanced: { Easy: 100, Medium: 100, Hard: 100 } };
    const preferenceFactor = student.preferredDifficulty && student.preferredDifficulty !== target.difficulty ? 0.7 : 1;
    const breakdown = {
      skills: required.length ? matchedSkills.length / required.length * 100 : 0,
      experience: Math.min(relevantProjects.length / 2, 1) * 60 + (required.length ? evidenceSkills.length / required.length * 40 : 0),
      interest: matchingInterests.length ? 100 : 0,
      difficulty: student.level && target.difficulty ? matrix[student.level][target.difficulty] * preferenceFactor : 0,
      availability: student.availabilityHours !== null && target.requiredHours > 0 ? Math.min(student.availabilityHours / target.requiredHours, 1) * 100 : 0
    };
    const contributions = Object.fromEntries(Object.entries(weights).map(([key, weight]) => [key, Math.round(breakdown[key] * weight) / 100]));
    const matchScore = Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + breakdown[key] * weight / 100, 0));
    const missingData = [];
    if (!required.length) missingData.push('Бизнес не указал необходимые навыки');
    if (!student.skills.length) missingData.push('Добавьте навыки в профиль');
    if (!evidenceTexts.length && !relevantProjects.length) missingData.push('Добавьте опыт и завершённые проекты');
    if (!student.interests.length || !target.category) missingData.push('Не указаны интересы или направление задачи');
    if (!student.level || !target.difficulty) missingData.push('Не указан уровень студента или сложность задачи');
    if (student.availabilityHours === null || !(target.requiredHours > 0)) missingData.push('Не указаны часы в неделю студента или задачи');
    const strengths = [];
    if (matchedSkills.length) strengths.push(`Совпало навыков: ${matchedSkills.length} из ${required.length}`);
    if (relevantProjects.length) strengths.push(`Похожих завершённых проектов: ${relevantProjects.length}`);
    if (evidenceSkills.length) strengths.push(`Технологии в указанном опыте: ${evidenceSkills.join(', ')}`);
    if (matchingInterests.length) strengths.push(`Совпадает с интересами: ${matchingInterests.join(', ')}`);
    if (breakdown.difficulty >= 75) strengths.push('Сложность подходит указанному уровню');
    if (breakdown.availability === 100) strengths.push('Указанного времени достаточно');
    const recommendations = [];
    if (missingSkills.length) recommendations.push(`Освойте ${missingSkills.join(', ')} и добавьте реальные примеры работ в профиль.`);
    if (breakdown.experience < 100) recommendations.push('Добавьте завершённые похожие проекты и технологии, с которыми работали.');
    if (breakdown.difficulty > 0 && breakdown.difficulty < 75) recommendations.push('Обсудите с бизнесом объём задачи и поддержку более опытного участника.');
    if (student.availabilityHours !== null && target.requiredHours > student.availabilityHours) recommendations.push('Обсудите нагрузку: сейчас доступно меньше часов, чем требуется.');
    recommendations.push(...missingData);
    return { task: target, matchScore, label: labelFor(matchScore), breakdown: Object.fromEntries(Object.entries(breakdown).map(([k,v]) => [k, Math.round(v * 100) / 100])), weights, contributions,
      matchedSkills, missingSkills, strengths, recommendations: [...new Set(recommendations)], missingData,
      evidence: { relevantProjects: relevantProjects.length, evidenceSkills, matchingInterests },
      explanation: required.length ? `Совпало ${matchedSkills.length} из ${required.length} ключевых навыков. Похожих завершённых проектов: ${relevantProjects.length}.${missingSkills.length ? ' Не указаны навыки: ' + missingSkills.join(', ') + '.' : ''}` : 'В задаче не указаны ключевые навыки. Оценка предварительная: дополните сведения.',
      explanationSource: 'algorithm', version: 'match-v1' };
  }
  return Object.freeze({ calculate, profile, task, canonical, labelFor, weights });
});
