(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MostCatalogDemo = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  const rows = [
    ['Frontend','React dashboard для отдела продаж','Nova Sales','React, TypeScript, PostgreSQL, REST API, Docker'],
    ['Backend','API для доставки заказов','Nova Logistics','Python, FastAPI, PostgreSQL, Docker'],
    ['Fullstack','Кабинет клиента для мастерской','Forma Studio','React, TypeScript, Node.js, REST API'],
    ['Mobile','Приложение для городских прогулок','Qala Walks','Flutter, Dart, REST API'],
    ['AI / ML','Поиск ответов по базе знаний','Nomad Market','Python, FastAPI, Machine Learning'],
    ['Data Science','Прогноз спроса на выпечку','Zerna Coffee','Python, SQL, Machine Learning'],
    ['UI / UX','Новый сценарий записи на занятия','Qadam Education','Figma, UX Research'],
    ['DevOps','Среда запуска учебного сервиса','Dala Cloud','Docker, Kubernetes, Linux'],
    ['Cybersecurity','Проверка доступа к внутреннему порталу','Safe Campus','Python, Linux, OWASP'],
    ['Other','Исследование покупателей экомагазина','Taza Store','Research, Excel'],
    ['Frontend','Витрина изделий местных мастеров','Oner Shop','React, TypeScript, Figma'],
    ['Backend','Сервис учёта складских остатков','Dala Logistics','Java, Spring Boot, PostgreSQL'],
    ['Fullstack','CRM Dashboard для сервисной компании','Barlyq Service','React, TypeScript, PostgreSQL, REST API, Docker'],
    ['Mobile','Трекер привычек для студентов','Campus Life','React Native, TypeScript'],
    ['AI / ML','Классификация обращений поддержки','Help Desk','Python, Machine Learning'],
    ['Data Science','Дашборд посещаемости мероприятий','Alma Events','SQL, Python, PostgreSQL'],
    ['UI / UX','Прототип личного кабинета волонтёра','Asar Volunteers','Figma, UX Research'],
    ['DevOps','Автоматическая проверка и сборка сайта','Steppe Digital','Docker, GitHub Actions'],
    ['Cybersecurity','Учебный аудит веб-приложения','Secure Lab','OWASP, JavaScript'],
    ['Other','Карта процессов малого производства','Craft Lab','Research, Excel, Figma']
  ];
  function build(now = Date.now()) {
    const days = offset => new Date(now + offset*86400000).toISOString();
    const tasks = rows.map(([category,title,company,requiredSkills], i) => ({
      id:'catalog-demo-'+String(i+1).padStart(2,'0'),ownerId:'business-1',status:'published',company,title,category,requiredSkills,
      problem:`Команда ${company} хочет улучшить ежедневную работу. Сейчас данные и заявки обрабатываются вручную; нужен понятный прототип, который можно проверить на реальных сценариях.`,
      need:'Сократить повторяющиеся действия и упростить работу пользователей',users:'Сотрудники и клиенты компании',
      requirements:'Основной пользовательский сценарий\nРабота с учебными данными\nКраткая инструкция',outcome:'Проверяемый прототип и инструкция по запуску',
      success:'Пять согласованных сценариев проходят на демонстрации',data:'Обезличенные примеры и консультация представителя бизнеса',constraints:'Учебный MVP; персональные данные не нужны',
      contact:'demo@example.com',interactionFormat:'Онлайн-встреча с куратором раз в неделю',difficulty:['Easy','Medium','Hard'][i%3],
      durationWeeks:String([0.5,2,3,6,12][i%5]),deadline:['3 дня','2 недели','3 недели','6 недель','3 месяца'][i%5],teamSize:['1','2-3','4-5','5+'][i%4],
      recommendedTeamSize:String([1,3,5,6][i%4]),workFormat:['Remote','Hybrid','On-site'][i%3],requiredHours:String([5,10,15][i%3]),
      createdAt:days(-i%12),publishedAt:days(-i%12),applicationDeadline:days([-1,2,5,10,14,21,35][i%7]).slice(0,10),
      selectedTeamIds:[],selectionDone:false,featured:i===2
    }));
    const offers = tasks.flatMap((task,i)=>Array.from({length:i%8},(_,j)=>({id:task.id+'-offer-'+j,taskId:task.id,teamId:'catalog-team-'+j,team:'Демо-команда '+(j+1),members:'2 участника',approach:'Подготовим прототип и проверим пользовательский сценарий.',plan:'Интервью → прототип → проверка',duration:'3 недели',contact:'demo@example.com',status:'pending'})));
    return {tasks,offers};
  }
  return {build};
});
