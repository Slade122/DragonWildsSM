import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const request = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    try {
      await request('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
      onLogin();
    } catch (failure) {
      setError(failure.message);
    }
  };

  return <main className="login-shell"><form className="card login" onSubmit={submit}>
    <p className="eyebrow">DRAGONWILDS</p><h1>Server Manager</h1>
    <label>Dashboard password<input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
    {error && <p className="error">{error}</p>}
    <button>Sign in</button>
  </form></main>;
}

function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const refresh = async () => {
    try {
      const [nextStatus, nextConfig] = await Promise.all([request('/api/status'), request('/api/config')]);
      setStatus(nextStatus); setConfig(nextConfig); setAuthenticated(true);
    } catch (failure) {
      if (failure.message === 'Unauthorized') setAuthenticated(false);
      else setMessage(failure.message);
    }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!authenticated) return undefined;
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [authenticated]);

  const action = async (name) => {
    setBusy(name); setMessage('');
    try {
      const response = await request(`/api/actions/${name}`, { method: 'POST' });
      setMessage(response.message);
      await refresh();
    } catch (failure) { setMessage(failure.message); }
    finally { setBusy(''); }
  };
  const save = async (event) => {
    event.preventDefault(); setBusy('save'); setMessage('');
    try {
      const response = await request('/api/config', { method: 'PUT', body: JSON.stringify(config) });
      setMessage(response.message); await refresh();
    } catch (failure) { setMessage(failure.message); }
    finally { setBusy(''); }
  };

  if (authenticated === null) return <main className="loading">Checking server…</main>;
  if (!authenticated) return <Login onLogin={refresh} />;
  const update = (field, value) => setConfig(current => ({ ...current, [field]: value }));
  return <main className="shell">
    <header><div><p className="eyebrow">DRAGONWILDS</p><h1>Server Manager</h1></div><button className="quiet" onClick={() => request('/api/logout', { method: 'POST' }).then(() => setAuthenticated(false))}>Sign out</button></header>
    {message && <div className="notice">{message}</div>}
    <section className="status-grid">
      <article className="card"><p className="label">SERVER</p><strong className={status.running ? 'good' : 'bad'}>{status.running ? 'Online' : 'Offline'}</strong><span>{status.running ? `PID ${status.processId}` : 'Not running'}</span></article>
      <article className="card"><p className="label">NETWORK</p><strong className={status.portBound && status.firewallRulePresent ? 'good' : 'bad'}>UDP {status.gamePort}</strong><span>{status.portBound ? 'Listening' : 'Not listening'} · {status.firewallRulePresent ? 'Firewall open' : 'Firewall missing'}</span></article>
      <article className="card"><p className="label">WATCHDOG</p><strong className={status.watchdogTaskState === 'Ready' ? 'good' : 'bad'}>{status.watchdogTaskState}</strong><span>Checks every five minutes</span></article>
    </section>
    <section className="card controls"><h2>Controls</h2><div className="button-row">
      {['start', 'stop', 'restart', 'update'].map(name => <button key={name} className={name === 'stop' ? 'danger' : ''} disabled={!!busy} onClick={() => action(name)}>{busy === name ? 'Working…' : name}</button>)}
    </div><p>Update safely stops the server, validates through SteamCMD, then starts it again.</p></section>
    <form className="card config" onSubmit={save}><h2>Configuration</h2>
      <label>Server name<input required value={config.serverName} onChange={e => update('serverName', e.target.value)} /></label>
      <label>World name<input required value={config.worldName} onChange={e => update('worldName', e.target.value)} /></label>
      <label>World password<input type="password" placeholder="Unchanged" value={config.worldPassword} onChange={e => update('worldPassword', e.target.value)} /></label>
      <label>Admin password<input type="password" placeholder="Unchanged" value={config.adminPassword} onChange={e => update('adminPassword', e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={config.public} onChange={e => update('public', e.target.checked)} /> List publicly in Dragonwilds</label>
      <button disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save and restart'}</button>
    </form>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
