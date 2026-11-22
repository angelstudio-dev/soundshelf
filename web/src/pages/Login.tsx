import { useState } from 'react';
import { HeadphonesIcon } from '../components/Icons.js';
import { useAuth } from '../store.js';

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo"><HeadphonesIcon size={32} /></div>
        <h1>SoundShelf</h1>
        <p>你的书库，随时随地收听</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          setLoading(true);
          setError('');
          login(username, password).catch((error: Error) => setError(error.message)).finally(() => setLoading(false));
        }}>
          <input required autoComplete="username" placeholder="用户名" value={username} onChange={(event) => setUsername(event.target.value)} />
          <input required type="password" autoComplete="current-password" placeholder="密码" value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <span className="login-error">{error}</span>}
          <button className="primary-button wide" disabled={loading} type="submit">{loading ? '登录中…' : '登录'}</button>
        </form>
        <small>首次启动请使用部署时设置的管理员账号</small>
      </div>
    </div>
  );
}
