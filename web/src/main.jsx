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
  'scheduled-update': 'Start update cycle'
};

const rate = value => {
  const amount = Number(value || 0);
  if (amount >= 1024) return `${(amount / 1024).toFixed(1)} MB/s`;
  return `${amount.toFixed(1)} KB/s`;
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
      <h1>Server Manager</h1>
      <p className="muted">Enter the dashboard passphrase.</p>
      <label>Passphrase<input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button>Enter the wilds</button>
    </form>
  </main>;
}

function Setup({ setupInfo }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [form, setForm] = useState({
    installRoot: 'C:\\DragonWildsServer',
    backupRoot: 'C:\\ProgramData\\DragonWildsSM\\backups',
    steamCmdPath: 'C:\\steamcmd\\steamcmd.exe',
    gamePort: 7777,
    webPort: Number(window.location.port) || 8787,
    bindAddress: '0.0.0.0',
    remoteAddress: 'LocalSubnet',
    serverName: 'My Dragonwilds Server',
    worldName: 'Dragonwilds',
    ownerId: '',
    public: true,
    platformPolicy: 'Crossplay',
    maxPlayers: 6,
    worldPassword: '',
    adminPassword: '',
    dashboardPassword: '',
    updateCheckHours: 1,
    updateGraceMinutes: 10,
    managerTitle: 'Dragonwilds Server',
    managerSubtitle: 'Dedicated server command center',
    hostDisplayName: 'Windows Server',
    accentColor: '#d9aa50',
    skipServerInstall: Boolean(setupInfo?.serverConfigured),
    ...(setupInfo?.defaults || {})
  });
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await request('/api/setup', { method: 'POST', body: JSON.stringify(form) });
      setComplete(true);
      const target = `${window.location.protocol}//${window.location.hostname}:${result.webPort}`;
      setTimeout(() => { window.location.href = target; }, 12000);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  if (complete) return <main className="login-shell"><section className="login-panel">
    <div className="crest">DW</div>
    <p className="eyebrow">Setup complete</p>
    <h1>Realm created</h1>
    <p className="muted">The manager is applying firewall rules and restarting. Reconnecting shortly...</p>
  </section></main>;

  return <main className="setup-shell" style={{ '--accent': form.accentColor }}>
    <header className="setup-header">
      <div><p className="eyebrow">First-run setup</p><h1>Build your Dragonwilds server</h1></div>
      <span>Step {step} of 3</span>
    </header>
    <div className="setup-progress"><i className={step >= 1 ? 'done' : ''} /><i className={step >= 2 ? 'done' : ''} /><i className={step >= 3 ? 'done' : ''} /></div>

    {step === 1 && <section className="panel form-grid">
      <div className="panel-title wide"><p className="eyebrow">Storage and network</p><h3>Where should everything live?</h3><p className="muted">Choose separate locations for the game, SteamCMD, and backups.</p></div>
      <label className="check wide"><input type="checkbox" checked={form.skipServerInstall} onChange={e => update('skipServerInstall', e.target.checked)} /> Server is already installed and configured; skip SteamCMD installation</label>
      {form.skipServerInstall && <p className="existing-note wide">Existing installation detected. Setup will preserve the game files and only apply manager, dashboard, firewall, and scheduled-task configuration.</p>}
      <label>Game install location<input value={form.installRoot} onChange={e => update('installRoot', e.target.value)} /></label>
      <label>Backup location<input value={form.backupRoot} onChange={e => update('backupRoot', e.target.value)} /></label>
      <label>SteamCMD executable<input value={form.steamCmdPath} onChange={e => update('steamCmdPath', e.target.value)} /></label>
      <label>Game UDP port<input type="number" min="1" max="65535" value={form.gamePort} onChange={e => update('gamePort', Number(e.target.value))} /></label>
      <label>Dashboard TCP port<input type="number" min="1" max="65535" value={form.webPort} onChange={e => update('webPort', Number(e.target.value))} /></label>
      <label>Dashboard bind address<input value={form.bindAddress} onChange={e => update('bindAddress', e.target.value)} /></label>
      <label className="wide">Dashboard firewall scope<input value={form.remoteAddress} onChange={e => update('remoteAddress', e.target.value)} /><small>Use LocalSubnet for LAN-only access, or a specific CIDR/IP range.</small></label>
    </section>}

    {step === 2 && <section className="panel form-grid">
      <div className="panel-title wide"><p className="eyebrow">Realm identity</p><h3>Configure the game server</h3></div>
      <label>Server name<input value={form.serverName} onChange={e => update('serverName', e.target.value)} /></label>
      <label>World name<input value={form.worldName} onChange={e => update('worldName', e.target.value)} /></label>
      <label>Owner SteamID64<input inputMode="numeric" placeholder="Optional 17-digit ID" value={form.ownerId} onChange={e => update('ownerId', e.target.value)} /></label>
      <label>World password<input type="password" value={form.worldPassword} onChange={e => update('worldPassword', e.target.value)} /></label>
      <label>Admin password<input type="password" value={form.adminPassword} onChange={e => update('adminPassword', e.target.value)} /></label>
      <label>Dashboard password<input type="password" minLength="8" value={form.dashboardPassword} onChange={e => update('dashboardPassword', e.target.value)} /></label>
      <label>Update check interval (hours)<input type="number" min="1" max="24" value={form.updateCheckHours} onChange={e => update('updateCheckHours', Number(e.target.value))} /></label>
      <label>Update warning (minutes)<input type="number" min="0" max="60" value={form.updateGraceMinutes} onChange={e => update('updateGraceMinutes', Number(e.target.value))} /></label>
      <label>Allowed platforms<select value={form.platformPolicy} onChange={e => update('platformPolicy', e.target.value)}><option>Crossplay</option><option>PC</option><option>PlayStation</option><option>Xbox</option><option>Nintendo</option></select></label>
      <label>Player cap<input type="number" min="1" max="6" value={form.maxPlayers} onChange={e => update('maxPlayers', Number(e.target.value))} /></label>
      <label className="check wide"><input type="checkbox" checked={form.public} onChange={e => update('public', e.target.checked)} /> Show in the public Dragonwilds server list</label>
    </section>}

    {step === 3 && <section className="panel form-grid">
      <div className="panel-title wide"><p className="eyebrow">Dashboard identity</p><h3>Make it yours</h3></div>
      <label>Dashboard title<input value={form.managerTitle} onChange={e => update('managerTitle', e.target.value)} /></label>
      <label>Host display name<input value={form.hostDisplayName} onChange={e => update('hostDisplayName', e.target.value)} /></label>
      <label className="wide">Dashboard subtitle<input value={form.managerSubtitle} onChange={e => update('managerSubtitle', e.target.value)} /></label>
      <label>Accent color<input className="color-input" type="color" value={form.accentColor} onChange={e => update('accentColor', e.target.value)} /></label>
      <div className="setup-summary">
        <b>{form.managerTitle}</b>
        <span>{form.serverName} · UDP {form.gamePort}</span>
        <span>{form.installRoot}</span>
        <span>Backups: {form.backupRoot}</span>
      </div>
    </section>}

    {error && <div className="notice error">{error}</div>}
    <footer className="setup-actions">
      <button className="secondary" disabled={step === 1 || busy} onClick={() => setStep(current => current - 1)}>Back</button>
      {step < 3
        ? <button onClick={() => setStep(current => current + 1)}>Continue</button>
        : <button disabled={busy} onClick={submit}>{busy ? 'Installing server...' : 'Install and launch'}</button>}
    </footer>
    {busy && <p className="setup-warning">SteamCMD may take several minutes. Keep this page open.</p>}
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
  const [setupRequired, setSetupRequired] = useState(null);
  const [setupInfo, setSetupInfo] = useState(null);
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
  useEffect(() => {
    request('/api/setup/status')
      .then(result => {
        setSetupInfo(result);
        setSetupRequired(result.required);
        if (!result.required) refresh();
      })
      .catch(failure => setMessage(failure.message));
  }, []);
  useEffect(() => {
    if (!authenticated) return undefined;
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [authenticated]);
  useEffect(() => {
    if (config?.managerTitle) document.title = config.managerTitle;
  }, [config?.managerTitle]);

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
      if (response.managerRestarting) {
        const target = `${window.location.protocol}//${window.location.hostname}:${response.webPort}`;
        setMessage(`Configuration saved. Dashboard is restarting at ${target}...`);
        setTimeout(() => { window.location.href = target; }, 12000);
      } else {
        await refresh();
      }
    } catch (failure) {
      setMessage(failure.message);
    } finally {
      setBusy('');
    }
  };

  if (setupRequired === null) return <main className="loading">Checking installation...</main>;
  if (setupRequired) return <Setup setupInfo={setupInfo} />;
  if (authenticated === null) return <main className="loading">Opening clan gate...</main>;
  if (!authenticated) return <Login onLogin={refresh} />;

  const update = (field, value) => setConfig(current => ({ ...current, [field]: value }));
  const online = status?.running;
  const playerText = players?.supported ? `${players.currentPlayers} / ${players.maxPlayers}` : `? / ${config.maxPlayers}`;
  const updateText = updateStatus?.status === 'unknown' ? 'Not checked yet' : updateStatus?.message;
  const deadline = updateStatus?.deadline ? new Date(updateStatus.deadline).toLocaleTimeString() : null;

  return <main className="shell" style={{ '--accent': config.accentColor }}>
    <header className="topbar">
      <div className="brand">
        <div className="crest small">DW</div>
        <div>
          <p className="eyebrow">RuneScape: Dragonwilds</p>
          <h1>{config.managerTitle}</h1>
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
        <p>{config.managerSubtitle}. Public listing is <b>{config.public ? 'enabled' : 'hidden'}</b>; player monitoring is {players?.supported ? 'active' : 'unavailable'}.</p>
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
          <Stat label="Public session" value={status.SessionReady ? 'Listed' : 'Starting'} detail={status.SessionReady ? `Search exact world: ${config.worldName}${status.JoinCode ? ` · code ${status.JoinCode}` : ''}` : 'Waiting for EOS session registration'} tone={status.SessionReady ? 'good' : 'bad'} />
          <Stat label="World save" value={status.SaveSize ? `${Math.ceil(status.SaveSize / 1024)} KB` : 'None'} detail={status.SaveUpdated ? new Date(status.SaveUpdated).toLocaleString() : 'No save found'} />
        </div>
      </div>
      <div className="panel">
        <div className="panel-title"><p className="eyebrow">{config.hostDisplayName}</p><h3>Dragonwilds process</h3></div>
        <div className="resource-list">
          <div className="resource-row"><span>CPU</span><b>{status.ServerCpuPercent}%</b><div className="meter"><i style={{ width: `${Math.min(status.ServerCpuPercent || 0, 100)}%` }} /></div></div>
          <div className="resource-row"><span>Memory</span><b>{status.ServerMemoryMB} MB</b><div className="meter"><i style={{ width: `${Math.min(status.ServerMemoryPercent || 0, 100)}%` }} /></div><small>{status.ServerPrivateMemoryMB} MB private</small></div>
          <div className="resource-row split"><span>Disk I/O</span><b>R {rate(status.ServerDiskReadKBps)} · W {rate(status.ServerDiskWriteKBps)}</b></div>
          <div className="resource-row split"><span>Network I/O</span><b>{rate(status.ServerNetworkIOKBps)}</b><small>Process socket/other I/O</small></div>
          <div className="resource-row split"><span>Runtime</span><b>{status.ServerThreads} threads · {status.ServerHandles} handles</b></div>
        </div>
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
      <label>Game UDP port<input type="number" min="1" max="65535" value={config.gamePort} onChange={e => update('gamePort', Number(e.target.value))} /></label>
      <label>Allowed platforms<select value={config.platformPolicy} onChange={e => update('platformPolicy', e.target.value)}><option>Crossplay</option><option>PC</option><option>PlayStation</option><option>Xbox</option><option>Nintendo</option></select></label>
      <label>Player cap<input type="number" min="1" max="6" value={config.maxPlayers} onChange={e => update('maxPlayers', Number(e.target.value))} /></label>
      <label>World password<input type="password" placeholder="Leave blank to keep current" value={config.worldPassword} onChange={e => update('worldPassword', e.target.value)} /></label>
      <label>Admin password<input type="password" placeholder="Leave blank to keep current" value={config.adminPassword} onChange={e => update('adminPassword', e.target.value)} /></label>
      <label>Owner SteamID64<input inputMode="numeric" placeholder="17-digit SteamID64" value={config.ownerId} onChange={e => update('ownerId', e.target.value)} /></label>
      <label>Backup location<input required value={config.backupRoot} onChange={e => update('backupRoot', e.target.value)} /></label>
      <label>Dashboard title<input required value={config.managerTitle} onChange={e => update('managerTitle', e.target.value)} /></label>
      <label>Dashboard subtitle<input required value={config.managerSubtitle} onChange={e => update('managerSubtitle', e.target.value)} /></label>
      <label>Host display name<input required value={config.hostDisplayName} onChange={e => update('hostDisplayName', e.target.value)} /></label>
      <label>Accent color<input className="color-input" type="color" value={config.accentColor} onChange={e => update('accentColor', e.target.value)} /></label>
      <label>Update interval (hours)<input type="number" min="1" max="24" value={config.updateCheckHours} onChange={e => update('updateCheckHours', Number(e.target.value))} /></label>
      <label>Update grace period (minutes)<input type="number" min="0" max="60" value={config.updateGraceMinutes} onChange={e => update('updateGraceMinutes', Number(e.target.value))} /></label>
      <label>Dashboard TCP port<input type="number" min="1" max="65535" value={config.webPort} onChange={e => update('webPort', Number(e.target.value))} /></label>
      <label>Dashboard bind address<input value={config.bindAddress} onChange={e => update('bindAddress', e.target.value)} /></label>
      <label className="wide">Dashboard firewall scope<input value={config.remoteAddress} onChange={e => update('remoteAddress', e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={config.public} onChange={e => update('public', e.target.checked)} /> Show in public Dragonwilds listing</label>
      <div className="facts wide">
        <div><span>Game install</span><code>{config.installRoot}</code></div>
        <div><span>Backups</span><code>{config.backupRoot}</code></div>
        <div><span>Executable</span><code>{config.executablePath}</code></div>
        <div><span>SteamCMD</span><code>{config.steamCmdPath}</code></div>
        <div><span>Policy</span><code>UDP {config.gamePort} · {config.platformPolicy} · {config.maxPlayers} player cap</code></div>
      </div>
      <button className="wide" disabled={!!busy}>{busy === 'save' ? 'Saving...' : 'Save and rekindle'}</button>
    </form>}

    {tab === 'maintenance' && <section className="dashboard-grid">
      <div className="panel">
        <div className="panel-title"><p className="eyebrow">SteamCMD</p><h3>Scheduled updating</h3></div>
        <p className="muted">Automatic checks run every {config.updateCheckHours} hour(s). When a build lands, the task waits {config.updateGraceMinutes} minute(s), then shuts down, updates, validates, and restarts.</p>
        <p className="status-line">{updateText}</p>
        {deadline && <p className="countdown">Grace window ends {deadline}</p>}
        <div className="button-row">
          <button disabled={!!busy} onClick={() => action('scheduled-update')}>{busy === 'scheduled-update' ? 'Starting...' : `Start ${config.updateGraceMinutes}-minute update`}</button>
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
