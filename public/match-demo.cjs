(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MostMatchDemo = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  return {
    student: { name: 'Ali', skills: ['React', 'TypeScript', 'PostgreSQL', 'REST API'], experience: ['React', 'REST API'], interests: ['Frontend', 'Backend'], level: 'Intermediate', preferredDifficulty: 'Medium', availabilityHours: 15,
      githubUrl: '', portfolioUrl: 'https://example.com/demo-portfolio', githubTechnologies: ['React', 'TypeScript', 'PostgreSQL', 'REST API'],
      projects: [
        { title: 'CRM для учебного проекта', skills: ['React', 'TypeScript', 'PostgreSQL', 'REST API'], category: 'Fullstack', completed: true, url: 'https://example.com/demo-crm' },
        { title: 'Сервис записи', skills: ['React', 'REST API'], category: 'Frontend', completed: true, url: '' }
      ] },
    task: { id: 'task-match-crm', title: 'CRM Dashboard', company: 'Демо · команда продаж', category: 'Fullstack', difficulty: 'Medium', requiredHours: '10',
      requiredSkills: 'React, TypeScript, PostgreSQL, REST API, Docker', deadline: '3 недели', ownerId: 'business-1', status: 'published', selectedTeamIds: [], selectionDone: false,
      problem: 'Заявки клиентов и история общения хранятся в разных таблицах. Менеджерам нужен общий обзор сделок.', need: 'Сократить ручную работу менеджеров', users: 'Менеджеры отдела продаж',
      requirements: 'Список сделок\nПоиск и фильтры\nИстория изменений', outcome: 'Рабочий прототип CRM с инструкцией запуска', success: 'Менеджер создаёт, находит и обновляет сделку в пяти согласованных сценариях.',
      data: 'Обезличенная таблица сделок и описание этапов продаж', constraints: 'Учебные данные; прототип без персональных данных', contact: 'demo@example.com', interactionFormat: 'Еженедельная демонстрация' }
  };
});
