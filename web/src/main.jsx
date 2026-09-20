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
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('overview');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const refresh = async () => {
    try {
      const [nextStatus, nextConfig, nextLogs] = await Promise.all([request('/api/overview'), request('/api/config'), request('/api/logs')]);
      setStatus(nextStatus); setConfig(nextConfig); setLogs(nextLogs.lines); setAuthenticated(true);
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
  const uptime = status.running ? 'RUNNING' : 'OFFLINE';
  return <main className="shell">
    <header><div className="brand"><div className="brand-mark">D</div><div><p className="eyebrow">RUNESCAPE · DRAGONWILDS</p><h1>Server Command</h1></div></div><div className="header-actions"><span className={`live ${status.running ? '' : 'offline'}`}><i /> {uptime}</span><button className="quiet" onClick={() => request('/api/logout', { method: 'POST' }).then(() => setAuthenticated(false))}>Sign out</button></div></header>
    <nav>{[['overview', 'Overview'], ['world', 'World'], ['activity', 'Activity']].map(([value, label]) => <button key={value} className={tab === value ? 'nav-active' : ''} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {message && <div className="notice">{message}</div>}
    {tab === 'overview' && <><section className="hero card"><div><p className="eyebrow">CURRENT SESSION</p><h2>{config.serverName}</h2><p className="hero-text">World <b>{config.worldName}</b> · Crossplay enabled · Public listing {config.public ? 'on' : 'off'}</p></div><div className="hero-actions">{['start', 'restart', 'stop'].map(name => <button key={name} className={name === 'stop' ? 'danger' : ''} disabled={!!busy} onClick={() => action(name)}>{busy === name ? 'Working…' : name}</button>)}</div></section>
      <section className="metric-grid">
        <article className="metric card"><p className="label">GAME SERVER</p><strong className={status.running ? 'good' : 'bad'}>{status.running ? 'Online' : 'Offline'}</strong><span>{status.running ? `Shipping process · PID ${status.processId}` : 'Start from the command deck'}</span></article>
        <article className="metric card"><p className="label">NETWORK</p><strong>UDP {status.gamePort}</strong><span>{status.portBound ? 'Listening' : 'Not listening'} · {status.firewallRulePresent ? 'Firewall open' : 'Firewall missing'}</span></article>
        <article className="metric card"><p className="label">SERVER CPU</p><strong>{status.ServerCpuPercent}%</strong><span>Dragonwilds shipping process</span></article>
        <article className="metric card"><p className="label">SERVER MEMORY</p><strong>{status.ServerMemoryMB} MB</strong><span>{status.ServerVirtualMemoryMB} MB virtual memory</span></article>
        <article className="metric card"><p className="label">SERVER STORAGE</p><strong>{status.DiskFreeGB} GB</strong><span>Free of {status.DiskTotalGB} GB on C:</span></article>
        <article className="metric card"><p className="label">WORLD SAVE</p><strong>{status.SaveSize ? `${Math.ceil(status.SaveSize / 1024)} KB` : '—'}</strong><span>{status.SaveUpdated ? `Saved ${new Date(status.SaveUpdated).toLocaleString()}` : 'No save found'}</span></article>
        <article className="metric card"><p className="label">PLAYERS</p><strong>— / {config.maxPlayers}</strong><span>Dragonwilds exposes no server-side live player query.</span></article>
      </section>
      <section className="card operations"><div><p className="eyebrow">OPERATIONS</p><h2>Command deck</h2><p>Updates validate through SteamCMD. World backups stop the server, archive saves, then restart it.</p></div><div className="button-row"><button disabled={!!busy} onClick={() => action('update')}>{busy === 'update' ? 'Updating…' : 'Update server'}</button><button className="secondary" disabled={!!busy} onClick={() => action('backup')}>{busy === 'backup' ? 'Backing up…' : 'Create backup'}</button></div></section></>}
    {tab === 'world' && <form className="card config" onSubmit={save}><div className="section-heading"><p className="eyebrow">WORLD SETTINGS</p><h2>Configure your realm</h2><p>Every setting Dragonwilds exposes through its dedicated-server configuration. Saving applies settings and restarts the server.</p></div>
      <label>Server name<input required value={config.serverName} onChange={e => update('serverName', e.target.value)} /></label>
      <label>World name<input required value={config.worldName} onChange={e => update('worldName', e.target.value)} /></label>
      <label>World password<input type="password" placeholder="Unchanged" value={config.worldPassword} onChange={e => update('worldPassword', e.target.value)} /></label>
      <label>Admin password<input type="password" placeholder="Unchanged" value={config.adminPassword} onChange={e => update('adminPassword', e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={config.public} onChange={e => update('public', e.target.checked)} /> List publicly in Dragonwilds</label>
      <div className="readonly-grid"><div><span>Install location</span><code>{config.installRoot}</code></div><div><span>Server executable</span><code>{config.executablePath}</code></div><div><span>SteamCMD</span><code>{config.steamCmdPath}</code></div><div><span>Network</span><code>Game UDP {config.gamePort} · {config.platformPolicy} · {config.maxPlayers} player build limit</code></div></div>
      <button disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save and restart'}</button>
    </form>}
    {tab === 'activity' && <section className="card logs"><div className="section-heading"><p className="eyebrow">LIVE LOG</p><h2>Server activity</h2><p>Last 100 lines. Refreshes every 15 seconds.</p></div><pre>{logs.join('\n')}</pre></section>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
