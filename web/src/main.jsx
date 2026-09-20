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

const actionLabels = {
  start: 'Light beacon',
  restart: 'Rekindle',
  stop: 'Douse',
  update: 'Update now',
  backup: 'Seal world save',
  'check-update': 'Scout Steam',
  'scheduled-update': 'Start 10-minute update'
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

  return <main className="login-shell">
    <form className="login-panel" onSubmit={submit}>
      <div className="crest">DW</div>
      <p className="eyebrow">RuneScape: Dragonwilds</p>
      <h1>Clan Server</h1>
      <p className="muted">FarmSim25 command gate. Homies only.</p>
      <label>Passphrase<input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button>Enter the wilds</button>
    </form>
  </main>;
}

function Stat({ label, value, detail, tone = '' }) {
  return <article className="stat">
    <span>{label}</span>
    <strong className={tone}>{value}</strong>
    <small>{detail}</small>
  </article>;
}

function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [logs, setLogs] = useState([]);
  const [players, setPlayers] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [tab, setTab] = useState('overview');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const refresh = async () => {
    try {
      const [nextStatus, nextConfig, nextLogs, nextPlayers, nextUpdateStatus] = await Promise.all([
        request('/api/overview'),
        request('/api/config'),
        request('/api/logs'),
        request('/api/player-query'),
        request('/api/update-status')
      ]);
      setStatus(nextStatus);
      setConfig(nextConfig);
      setLogs(nextLogs.lines);
      setPlayers(nextPlayers);
      setUpdateStatus(nextUpdateStatus);
      setAuthenticated(true);
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
    setBusy(name);
    setMessage('');
    try {
      const response = await request(`/api/actions/${name}`, { method: 'POST' });
      setMessage(response.message);
      await refresh();
    } catch (failure) {
      setMessage(failure.message);
    } finally {
      setBusy('');
    }
  };
  const save = async (event) => {
    event.preventDefault();
    setBusy('save');
    setMessage('');
    try {
      const response = await request('/api/config', { method: 'PUT', body: JSON.stringify(config) });
      setMessage(response.message);
      await refresh();
    } catch (failure) {
      setMessage(failure.message);
    } finally {
      setBusy('');
    }
  };

  if (authenticated === null) return <main className="loading">Opening clan gate...</main>;
  if (!authenticated) return <Login onLogin={refresh} />;

  const update = (field, value) => setConfig(current => ({ ...current, [field]: value }));
  const online = status?.running;
  const playerText = players?.supported ? `${players.currentPlayers} / ${players.maxPlayers}` : `? / ${config.maxPlayers}`;
  const updateText = updateStatus?.status === 'unknown' ? 'Not checked yet' : updateStatus?.message;
  const deadline = updateStatus?.deadline ? new Date(updateStatus.deadline).toLocaleTimeString() : null;

  return <main className="shell">
    <header className="topbar">
      <div className="brand">
        <div className="crest small">DW</div>
        <div>
          <p className="eyebrow">RuneScape: Dragonwilds</p>
          <h1>{config.serverName}</h1>
        </div>
      </div>
      <div className="server-ribbon">
        <span className={`pulse ${online ? 'online' : 'offline'}`} />
        <b>{online ? 'Online' : 'Offline'}</b>
        <em>UDP {status.gamePort}</em>
        <button className="ghost" onClick={() => request('/api/logout', { method: 'POST' }).then(() => setAuthenticated(false))}>Leave</button>
      </div>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">World shard</p>
        <h2>{config.worldName}</h2>
        <p>Crossplay realm for the crew. Public listing is <b>{config.public ? 'enabled' : 'hidden'}</b>; live player query is {players?.supported ? 'working' : 'not exposed by RSDW'}.</p>
      </div>
      <div className="quick-actions">
        {['start', 'restart', 'stop'].map(name => <button key={name} className={name === 'stop' ? 'danger' : ''} disabled={!!busy} onClick={() => action(name)}>{busy === name ? 'Working...' : actionLabels[name]}</button>)}
      </div>
    </section>

    <nav className="tabs">
      {[
        ['overview', 'Overview'],
        ['realm', 'Realm'],
        ['maintenance', 'Maintenance'],
        ['logs', 'Runelog']
      ].map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}
    </nav>

    {message && <div className="notice">{message}</div>}

    {tab === 'overview' && <section className="dashboard-grid">
      <div className="panel span-2">
        <div className="panel-title"><p className="eyebrow">Camp status</p><h3>Server health</h3></div>
        <div className="stats-grid">
          <Stat label="Game server" value={online ? 'Lit' : 'Dark'} detail={online ? `PID ${status.processId}` : 'Awaiting start'} tone={online ? 'good' : 'bad'} />
          <Stat label="Players" value={playerText} detail={players?.message || 'Checking query endpoint'} />
          <Stat label="Network" value={status.portBound ? 'Bound' : 'Closed'} detail={`UDP ${status.gamePort} · ${status.firewallRulePresent ? 'firewall open' : 'firewall missing'}`} tone={status.portBound ? 'good' : 'bad'} />
          <Stat label="World save" value={status.SaveSize ? `${Math.ceil(status.SaveSize / 1024)} KB` : 'None'} detail={status.SaveUpdated ? new Date(status.SaveUpdated).toLocaleString() : 'No save found'} />
        </div>
      </div>
      <div className="panel">
        <div className="panel-title"><p className="eyebrow">Host load</p><h3>FarmSim25</h3></div>
        <div className="meter"><span style={{ width: `${Math.min(status.ServerCpuPercent || 0, 100)}%` }} /></div>
        <p className="meter-label">{status.ServerCpuPercent}% server CPU</p>
        <div className="meter"><span style={{ width: `${Math.min(status.HostMemoryUsedPercent || 0, 100)}%` }} /></div>
        <p className="meter-label">{status.ServerMemoryMB} MB server RAM · {status.DiskFreeGB} GB free</p>
      </div>
      <div className="panel">
        <div className="panel-title"><p className="eyebrow">Steam watch</p><h3>Updates</h3></div>
        <p className="muted">{updateText}</p>
        {deadline && <p className="countdown">Shutdown at {deadline}</p>}
        <button className="full" disabled={!!busy} onClick={() => action('check-update')}>{busy === 'check-update' ? 'Scouting...' : actionLabels['check-update']}</button>
      </div>
    </section>}

    {tab === 'realm' && <form className="panel form-grid" onSubmit={save}>
      <div className="panel-title wide"><p className="eyebrow">Realm settings</p><h3>Names, passwords, visibility</h3><p className="muted">Saving writes Dragonwilds config and rekindles the server.</p></div>
      <label>Server name<input required value={config.serverName} onChange={e => update('serverName', e.target.value)} /></label>
      <label>World name<input required value={config.worldName} onChange={e => update('worldName', e.target.value)} /></label>
      <label>World password<input type="password" placeholder="Leave blank to keep current" value={config.worldPassword} onChange={e => update('worldPassword', e.target.value)} /></label>
      <label>Admin password<input type="password" placeholder="Leave blank to keep current" value={config.adminPassword} onChange={e => update('adminPassword', e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={config.public} onChange={e => update('public', e.target.checked)} /> Show in public Dragonwilds listing</label>
      <div className="facts wide">
        <div><span>Install</span><code>{config.installRoot}</code></div>
        <div><span>Executable</span><code>{config.executablePath}</code></div>
        <div><span>SteamCMD</span><code>{config.steamCmdPath}</code></div>
        <div><span>Policy</span><code>UDP {config.gamePort} · {config.platformPolicy} · {config.maxPlayers} player cap</code></div>
      </div>
      <button className="wide" disabled={!!busy}>{busy === 'save' ? 'Saving...' : 'Save and rekindle'}</button>
    </form>}

    {tab === 'maintenance' && <section className="dashboard-grid">
      <div className="panel">
        <div className="panel-title"><p className="eyebrow">SteamCMD</p><h3>Scheduled updating</h3></div>
        <p className="muted">Automatic checks run hourly. When a build lands, the task waits 10 minutes, then shuts down, updates, validates, and restarts.</p>
        <p className="status-line">{updateText}</p>
        {deadline && <p className="countdown">Grace window ends {deadline}</p>}
        <div className="button-row">
          <button disabled={!!busy} onClick={() => action('scheduled-update')}>{busy === 'scheduled-update' ? 'Starting...' : actionLabels['scheduled-update']}</button>
          <button className="secondary" disabled={!!busy} onClick={() => action('update')}>{busy === 'update' ? 'Updating...' : actionLabels.update}</button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-title"><p className="eyebrow">World save</p><h3>Backup</h3></div>
        <p className="muted">Stops the server, seals SaveGames into ProgramData, then starts it again.</p>
        <button disabled={!!busy} onClick={() => action('backup')}>{busy === 'backup' ? 'Sealing...' : actionLabels.backup}</button>
      </div>
    </section>}

    {tab === 'logs' && <section className="panel logs">
      <div className="panel-title"><p className="eyebrow">Runelog</p><h3>Last 100 lines</h3><p className="muted">Refreshes every 15 seconds. Passwords are redacted.</p></div>
      <pre>{logs.join('\n')}</pre>
    </section>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
