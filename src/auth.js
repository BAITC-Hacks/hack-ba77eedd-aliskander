import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from './store.js';
const scrypt = promisify(scryptCallback);
const publicUser = ({id, login, name, role}) => ({id, login, name, role});
export function createAuth(store) {
  const sessions = new Map(), attempts = new Map();
  const ttl = 12 * 60 * 60 * 1000;
  function token(request) { return request.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('most_session='))?.slice(13); }
  function user(request) {
    const key = token(request), session = sessions.get(key);
    if (!session) return null;
    if (session.expires < Date.now()) { sessions.delete(key); return null; }
    return session.user;
  }
  function cookie(request, value, age) { return `most_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${request.socket.encrypted ? '; Secure' : ''}`; }
  async function handle(request, response, action, input = {}) {
    if (action === 'logout') { sessions.delete(token(request)); response.setHeader('Set-Cookie',cookie(request,'',0)); return {user:null}; }
    if (action === 'session') return {user:user(request)};
    const login = typeof input?.login === 'string' ? input.login.trim().toLowerCase() : '';
    if (!/^[a-z0-9_.@-]{3,100}$/.test(login) || typeof input.password !== 'string' || input.password.length<8 || input.password.length>128) throw new ApiError(400,'Логин: 3–100 латинских символов. Пароль: 8–128 символов.');
    const now = Date.now(), ip = request.socket.remoteAddress || 'local';
    for (const [key,value] of attempts) if(now-value.since>600000)attempts.delete(key);
    const attempt=attempts.get(ip)||{count:0,since:now};
    if(attempt.count>=30)throw new ApiError(429,'Слишком много попыток входа. Повторите через 10 минут.');
    attempt.count++;attempts.set(ip,attempt);
    let account=store.findAccount(login);
    if(action==='register') {
      if(account)throw new ApiError(409,'Этот логин уже занят');
      if(!['business','student'].includes(input.role) || typeof input.name!=='string' || !input.name.trim() || input.name.length>80)throw new ApiError(400,'Укажите роль и название компании или команды');
      const salt=randomBytes(16).toString('hex');
      const hash=Buffer.from(await scrypt(input.password,salt,64)).toString('hex');
      account=store.createAccount({id:randomUUID(),login,name:input.name.trim(),role:input.role,salt,hash});
    } else {
      const hash=Buffer.from(await scrypt(input.password,account?.salt||'missing-account',64));
      if(!account || !timingSafeEqual(hash,Buffer.from(account.hash,'hex')))throw new ApiError(401,'Неверный логин или пароль');
    }
    for(const [key,value] of sessions)if(value.expires<now)sessions.delete(key);
    sessions.delete(token(request));
    const key=randomBytes(32).toString('hex'), identity=publicUser(account);
    sessions.set(key,{user:identity,expires:now+ttl});
    response.setHeader('Set-Cookie',cookie(request,key,ttl/1000));
    return {user:identity};
  }
  return { user, handle };
}
