import { calculateRating } from './rating.js';

const commonTask = {
  published: true,
  selectionDone: false,
  selectedTeamIds: [],
  selectedProposalIds: [],
  successCriteria: 'Решение проходит пять согласованных сценариев, а результат можно показать на итоговой демонстрации.',
  data: 'Предоставим обезличенные материалы, примеры документов и консультацию ответственного сотрудника.',
  constraints: 'Учебный проект без оплаты и персональных данных. Можно использовать открытые технологии.',
  users: 'Сотрудники компании и их клиенты.',
  contact: 'project@example.com',
  interactionFormat: 'Короткая онлайн-встреча раз в неделю и вопросы в общем чате.'
};

function task(values) {
  const item = { ...commonTask, ...values };
  return { ...item, ...calculateRating(item) };
}

/** Fresh examples for the first local launch. They are normal records after seeding. */
export function createSampleData() {
  const tasks = [
    task({
      id: 'example-demand-forecast', title: 'Прогноз спроса для локальной кофейни', company: 'Кофейня «Зёрна»',
      category: 'Аналитика', deadline: '4 недели', need: 'Снизить списания выпечки и точнее планировать ежедневные закупки.',
      context: 'Каждый вечер остаётся непроданная выпечка. Нужно понять, сколько готовить с учётом дня недели, погоды и сезонности.',
      expectedResult: 'Дашборд с прогнозом продаж на неделю и понятными рекомендациями по объёму закупки.'
    }),
    task({
      id: 'example-studio-booking', title: 'Онлайн-запись в творческую студию', company: 'Студия «Форма»',
      category: 'Веб-разработка', deadline: '3 недели', need: 'Сократить ручную работу администратора и не терять заявки клиентов.',
      context: 'Сейчас запись на мастер-классы идёт в мессенджере. Администратор переносит данные вручную, а клиент не видит свободное время.',
      expectedResult: 'Адаптивный прототип с расписанием, выбором свободного места и подтверждением записи.'
    })
  ];
  const proposals = [
    {
      id: 'example-offer-orbit', taskId: tasks[0].id, teamId: 'team-orbit', teamName: 'Orbit',
      members: '3 участника: аналитик, разработчик и дизайнер', contact: 'orbit@example.com', status: 'pending',
      idea: 'Соберём базовый прогноз по истории продаж, погоде и календарю, а рекомендации покажем в простом веб-дашборде.',
      plan: 'Очистка данных → базовая модель → проверка на отложенной выборке → дашборд и инструкция.',
      deadline: '4 недели', prototypeUrl: ''
    },
    {
      id: 'example-offer-vector', taskId: tasks[0].id, teamId: 'team-vector', teamName: 'Вектор',
      members: '4 участника: два аналитика, Python-разработчик и UX-дизайнер', contact: 'vector@example.com', status: 'pending',
      idea: 'Начнём с интервью с бариста, сравним несколько моделей и добавим объяснение факторов, влияющих на спрос.',
      plan: 'Интервью → анализ данных → сравнение моделей → тестирование рекомендаций вместе с управляющим.',
      deadline: '3 недели', prototypeUrl: ''
    },
    {
      id: 'example-offer-pixel', taskId: tasks[1].id, teamId: 'team-pixel', teamName: 'Pixel Crew',
      members: '3 участника: UX/UI-дизайнер и два frontend-разработчика', contact: 'pixel@example.com', status: 'pending',
      idea: 'Сделаем мобильный сценарий записи за три шага и кабинет администратора с актуальным списком участников.',
      plan: 'Карта сценариев → интерактивный макет → адаптивный прототип → пользовательская проверка.',
      deadline: '3 недели', prototypeUrl: '/prototype.html?variant=grid'
    }
  ];
  return { tasks, proposals, stages: [] };
}
