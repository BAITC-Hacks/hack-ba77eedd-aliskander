/* Real accounts use a server session; demo.html remains a separate sandbox. */
(() => {
  async function request(action, data) {
    const response=await fetch('/api/auth/'+action,{method:data?'POST':'GET',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
    const value=await response.json(); if(!response.ok)throw new Error(value.error); return value;
  }
  window.platformAuth={
    user:null,
    async init() {
      const result=await request('session'); this.user=result.user;
      const role=document.querySelector('.role-label'); if(role)role.hidden=true;
      const host=document.createElement('div');host.className='account-control';
      const label=document.createElement('span');label.textContent=result.user?`${result.user.role==='business'?'Бизнес':'Команда'} · ${result.user.name}`:'Гость';host.appendChild(label);
      const button=document.createElement('button');button.className='btn secondary small';button.textContent=result.user?'Выйти':'Войти';
      button.onclick=async()=>{if(!this.user){location.hash='login';return;}button.disabled=true;try{await request('logout',{});location.hash='catalog';location.reload();}catch(error){button.disabled=false;label.textContent=error.message;}};
      host.appendChild(button);document.querySelector('.header').appendChild(host);
      return result.user;
    },
    render(app,h,register=false) {
      app.innerHTML=`<section class="panel auth-panel"><span class="eyebrow muted">Мост · аккаунт</span><h1>${register?'Создайте аккаунт':'Войдите в аккаунт'}</h1><p class="muted">Бизнес управляет своими задачами. Команда отправляет предложения и результаты.</p><form id="auth-form"><label class="field">Логин<input name="login" autocomplete="username" required minlength="3" maxlength="100" pattern="[A-Za-z0-9_.@\-]{3,100}" placeholder="Например, orbit-team"></label><label class="field">Пароль<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="${register?'new-password':'current-password'}"></label>${register?'<label class="field">Название компании или команды<input name="name" required maxlength="80" autocomplete="organization"></label><label class="field">Роль<select name="role"><option value="business">Бизнес</option><option value="student">Студенческая команда</option></select></label><p class="muted">Роль фиксируется при регистрации.</p>':''}<p id="auth-error" class="error" role="alert"></p><button type="submit" class="btn wide">${register?'Создать аккаунт':'Войти'} →</button></form><p><a class="text-link" href="#${register?'login':'register'}">${register?'Уже есть аккаунт? Войти':'Создать аккаунт'}</a></p><a class="text-link muted" href="demo.html#catalog">Попробовать отдельную демонстрацию без регистрации ↗</a></section>`;
      document.querySelector('#auth-form').onsubmit=async event=>{
        event.preventDefault();const button=event.submitter;button.disabled=true;
        try{await request(register?'register':'login',Object.fromEntries(new FormData(event.currentTarget)));location.hash='workspace';location.reload();}
        catch(error){document.querySelector('#auth-error').textContent=error.message;button.disabled=false;}
      };
    }
  };
})();
