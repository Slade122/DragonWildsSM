import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import dgram from 'node:dgram';

const execFileAsync = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const programData = process.env.ProgramData || 'C:\\ProgramData';
const stateRoot = process.env.DWSM_STATE_ROOT || path.join(programData, 'DragonWildsSM');
const authPath = path.join(stateRoot, 'config', 'WebUiAuth.json');
const configPath = path.join(stateRoot, 'config', 'ServerConfig.psd1');
const secretPath = path.join(stateRoot, 'config', 'ServerSecrets.psd1');
const updateStatusPath = path.join(stateRoot, 'update-status.json');
const managerRoot = path.resolve(root, '..');
const scripts = path.join(managerRoot, 'scripts');
const app = express();
app.use(express.json({ limit: '8kb' }));
let setupRunning = false;

const hash = (value, salt) => crypto.pbkdf2Sync(value, salt, 210000, 64, 'sha1').toString('hex');
const readAuth = async () => JSON.parse((await fs.readFile(authPath, 'utf8')).replace(/^\uFEFF/, ''));
const exists = async (file) => fs.access(file).then(() => true).catch(() => false);
const session = new Map();
const cookie = (request) => request.headers.cookie?.match(/dwsm=([^;]+)/)?.[1];
const requireAuth = (request, response, next) => {
  const token = cookie(request);
  if (!token || session.get(token) < Date.now()) {
    session.delete(token);
    return response.status(401).json({ error: 'Unauthorized' });
  }
  return next();
};
const clean = (value) => String(value ?? '').replace(/[\r\n]/g, '').trim();
const psdValue = (value) => clean(value).replace(/'/g, "''");
const psLiteral = (value) => `'${String(value ?? '').replace(/'/g, "''")}'`;
const invoke = async (script, args = []) => {
  const command = path.join(scripts, script);
  const { stdout, stderr } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', command, ...args], { windowsHide: true, timeout: 30 * 60 * 1000 });
  return `${stdout}\n${stderr}`.trim();
};
const health = async () => {
  try {
    const output = await invoke('Get-DragonWildsHealth.ps1');
    return normalizeStatus(JSON.parse(output));
  } catch (error) {
    const match = error.stdout?.match(/\{[\s\S]*\}/);
    if (match) return normalizeStatus(JSON.parse(match[0]));
    throw error;
  }
};
const normalizeStatus = (status) => ({
  timestamp: status.Timestamp ?? status.timestamp,
  running: Boolean(status.Running ?? status.running),
  processId: status.ProcessId ?? status.processId ?? null,
  gamePort: status.GamePort ?? status.gamePort,
  portBound: Boolean(status.PortBound ?? status.portBound),
  firewallRulePresent: Boolean(status.FirewallRulePresent ?? status.firewallRulePresent),
  startTaskState: status.StartTaskState ?? status.startTaskState,
  watchdogTaskState: status.WatchdogTaskState ?? status.watchdogTaskState
});
const dataFile = async (file) => {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', `Import-Module Microsoft.PowerShell.Utility; $data = Import-PowerShellDataFile -LiteralPath ${psLiteral(file)}; $data | ConvertTo-Json -Compress`], { windowsHide: true });
  if (!stdout.trim()) throw new Error(`PowerShell returned no data for ${file}.`);
  return JSON.parse(stdout);
};
const readConfig = async () => {
  let config = {};
  if (await exists(configPath)) config = await dataFile(configPath);
  return {
    AppId: 4019830,
    InstallRoot: 'C:\\DragonWildsServer',
    SteamCmdPath: 'C:\\steamcmd\\steamcmd.exe',
    ServerExecutableRelativePath: 'RSDragonwilds\\Binaries\\Win64\\RSDragonwildsServer.exe',
    GamePort: 7777,
    Public: 1,
    ServerName: 'My Dragonwilds Server',
    WorldName: 'Dragonwilds',
    LogRetentionDays: 30,
    BackupRoot: path.join(stateRoot, 'backups'),
    UpdateCheckHours: 1,
    UpdateGraceMinutes: 10,
    WebPort: 8787,
    WebBindAddress: '0.0.0.0',
    WebRemoteAddress: 'LocalSubnet',
    ManagerTitle: 'Dragonwilds Server',
    ManagerSubtitle: 'Dedicated server command center',
    HostDisplayName: process.env.COMPUTERNAME || 'Windows Server',
    AccentColor: '#d9aa50',
    ...config
  };
};
const readSecrets = async () => (await exists(secretPath) ? dataFile(secretPath) : {});
const serverPaths = (config) => ({
  gameRoot: path.join(config.InstallRoot, 'RSDragonwilds'),
  backupRoot: config.BackupRoot || path.join(stateRoot, 'backups')
});
const ps = async (command) => {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true, timeout: 30 * 1000 });
  return stdout.trim();
};
const overview = async (config) => {
  const status = await health();
  const { gameRoot } = serverPaths(config);
  const command = [
    `$gameRoot = ${psLiteral(gameRoot)}`,
    `$save = Get-ChildItem -LiteralPath (Join-Path $gameRoot 'Saved\\SaveGames') -Filter '*.sav' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1`,
    `$log = Get-ChildItem -LiteralPath (Join-Path $gameRoot 'Saved\\Logs') -Filter '*.log' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1`,
    `$os = Get-CimInstance Win32_OperatingSystem`,
    `$process = Get-Process -Name 'RSDragonwildsServer-Win64-Shipping' -ErrorAction SilentlyContinue | Select-Object -First 1`,
    `$initialCpu = if ($process) { $process.CPU } else { 0 }; $processId = if ($process) { $process.Id } else { $null }; Start-Sleep -Milliseconds 500; if ($processId) { $process = Get-Process -Id $processId -ErrorAction SilentlyContinue }`,
    `$logicalProcessors = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors`,
    `$disk = Get-Volume -DriveLetter C`,
    `[pscustomobject]@{ SaveName = $save.Name; SaveSize = $save.Length; SaveUpdated = $save.LastWriteTime.ToString('o'); LogName = $log.Name; LogUpdated = $log.LastWriteTime.ToString('o'); HostMemoryUsedPercent = [math]::Round((1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)) * 100); ServerCpuPercent = if ($process) { [math]::Round((($process.CPU - $initialCpu) / 0.5 / $logicalProcessors) * 100, 1) } else { 0 }; ServerMemoryMB = if ($process) { [math]::Round($process.WorkingSet64 / 1MB, 1) } else { 0 }; ServerVirtualMemoryMB = if ($process) { [math]::Round($process.VirtualMemorySize64 / 1MB, 1) } else { 0 }; DiskFreeGB = [math]::Round($disk.SizeRemaining / 1GB, 1); DiskTotalGB = [math]::Round($disk.Size / 1GB, 1) } | ConvertTo-Json -Compress`
  ].join('; ');
  return { ...status, ...(JSON.parse(await ps(command))) };
};
const recentLogs = async (config) => {
  const { gameRoot } = serverPaths(config);
  const command = `Import-Module Microsoft.PowerShell.Utility; $password = (Import-PowerShellDataFile -LiteralPath ${psLiteral(secretPath)}).WorldPassword; $log = Get-ChildItem -LiteralPath ${psLiteral(path.join(gameRoot, 'Saved', 'Logs'))} -Filter '*.log' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; Get-Content -LiteralPath $log.FullName -Tail 100 | ForEach-Object { if ($password) { $_.Replace($password, '[REDACTED]') } else { $_ } } | ConvertTo-Json -Compress`;
  const value = JSON.parse(await ps(command));
  return { lines: Array.isArray(value) ? value : [value] };
};
const playerQuery = async (port) => new Promise((resolve) => {
  const socket = dgram.createSocket('udp4');
  const request = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]), Buffer.from('Source Engine Query\0')]);
  const done = (result) => { try { socket.close(); } catch { /* closed */ } resolve(result); };
  const timer = setTimeout(() => done({ supported: false, currentPlayers: null, maxPlayers: 6, message: 'No Steam A2S response from Dragonwilds. Live player count is not exposed by the server.' }), 750);
  socket.once('message', (message) => {
    clearTimeout(timer);
    const players = message.length > 0 ? message[message.length - 2] : null;
    const maxPlayers = message.length > 0 ? message[message.length - 1] : 6;
    done({ supported: true, currentPlayers: players, maxPlayers, message: 'Steam A2S query responded.' });
  });
  socket.send(request, port, '127.0.0.1', (error) => {
    if (error) { clearTimeout(timer); done({ supported: false, currentPlayers: null, maxPlayers: 6, message: error.message }); }
  });
});
const updateStatus = async () => {
  try {
    return JSON.parse((await fs.readFile(updateStatusPath, 'utf8')).replace(/^\uFEFF/, ''));
  } catch {
    return { status: 'unknown', message: 'No scheduled update check has run yet.' };
  }
};
const createBackup = async (config) => {
  const { gameRoot, backupRoot } = serverPaths(config);
  await invoke('Stop-DragonWildsServer.ps1');
  try {
    const name = `DragonWilds-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    await fs.mkdir(backupRoot, { recursive: true });
    await ps(`Compress-Archive -LiteralPath ${psLiteral(path.join(gameRoot, 'Saved', 'SaveGames'))} -DestinationPath ${psLiteral(path.join(backupRoot, name))} -CompressionLevel Optimal -Force`);
    return name;
  } finally {
    await invoke('Start-DragonWildsServer.ps1');
  }
};
const writeConfig = async (config, secrets) => {
  const content = `@{\n    AppId = ${config.AppId}\n    InstallRoot = '${psdValue(config.InstallRoot)}'\n    SteamCmdPath = '${psdValue(config.SteamCmdPath)}'\n    BackupRoot = '${psdValue(config.BackupRoot)}'\n    ServerExecutableRelativePath = '${psdValue(config.ServerExecutableRelativePath)}'\n    GamePort = ${Number(config.GamePort)}\n    Public = ${config.Public ? 1 : 0}\n    ServerName = '${psdValue(config.ServerName)}'\n    WorldName = '${psdValue(config.WorldName)}'\n    LogRetentionDays = ${Number(config.LogRetentionDays)}\n    UpdateCheckHours = ${Number(config.UpdateCheckHours)}\n    UpdateGraceMinutes = ${Number(config.UpdateGraceMinutes)}\n    WebPort = ${Number(config.WebPort)}\n    WebBindAddress = '${psdValue(config.WebBindAddress)}'\n    WebRemoteAddress = '${psdValue(config.WebRemoteAddress)}'\n    ManagerTitle = '${psdValue(config.ManagerTitle)}'\n    ManagerSubtitle = '${psdValue(config.ManagerSubtitle)}'\n    HostDisplayName = '${psdValue(config.HostDisplayName)}'\n    AccentColor = '${psdValue(config.AccentColor)}'\n}\n`;
  const secretContent = `@{\n    OwnerId = '${psdValue(secrets.OwnerId)}'\n    AdminPassword = '${psdValue(secrets.AdminPassword)}'\n    WorldPassword = '${psdValue(secrets.WorldPassword)}'\n}\n`;
  await fs.writeFile(configPath, content, 'utf8');
  await fs.writeFile(secretPath, secretContent, 'utf8');
};
const setSession = (response) => {
  const token = crypto.randomBytes(32).toString('base64url');
  session.set(token, Date.now() + 12 * 60 * 60 * 1000);
  response.setHeader('Set-Cookie', `dwsm=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
};

app.get('/api/setup/status', async (_, response) => {
  const config = await readConfig();
  const configured = await exists(configPath);
  const serverExecutable = path.join(config.InstallRoot, config.ServerExecutableRelativePath);
  response.json({
    required: !(await exists(authPath)),
    running: setupRunning,
    serverConfigured: configured && await exists(serverExecutable),
    defaults: {
      installRoot: config.InstallRoot,
      backupRoot: config.BackupRoot,
      steamCmdPath: config.SteamCmdPath,
      gamePort: config.GamePort,
      webPort: config.WebPort,
      bindAddress: config.WebBindAddress,
      remoteAddress: config.WebRemoteAddress,
      serverName: config.ServerName,
      worldName: config.WorldName,
      public: Boolean(config.Public),
      updateCheckHours: config.UpdateCheckHours,
      updateGraceMinutes: config.UpdateGraceMinutes,
      managerTitle: config.ManagerTitle,
      managerSubtitle: config.ManagerSubtitle,
      hostDisplayName: config.HostDisplayName,
      accentColor: config.AccentColor
    }
  });
});
app.post('/api/setup', async (request, response) => {
  if (await exists(authPath)) return response.status(409).json({ error: 'Setup is already complete.' });
  if (setupRunning) return response.status(409).json({ error: 'Setup is already running.' });

  const next = request.body || {};
  const installRoot = clean(next.installRoot);
  const backupRoot = clean(next.backupRoot);
  const steamCmdPath = clean(next.steamCmdPath);
  const serverName = clean(next.serverName);
  const worldName = clean(next.worldName);
  const ownerId = clean(next.ownerId);
  const dashboardPassword = String(next.dashboardPassword || '');
  const accentColor = clean(next.accentColor);
  const gamePort = Number(next.gamePort);
  const webPort = Number(next.webPort);
  const updateCheckHours = Number(next.updateCheckHours);
  const updateGraceMinutes = Number(next.updateGraceMinutes);
  const bindAddress = clean(next.bindAddress) || '0.0.0.0';
  const remoteAddress = clean(next.remoteAddress) || 'LocalSubnet';
  const skipServerInstall = Boolean(next.skipServerInstall);

  if (!/^[A-Za-z]:\\/.test(installRoot)) return response.status(400).json({ error: 'Game install location must be an absolute Windows drive path.' });
  if (!(/^[A-Za-z]:\\/.test(backupRoot) || /^\\\\[^\\]+\\[^\\]+/.test(backupRoot))) return response.status(400).json({ error: 'Backup location must be an absolute Windows or UNC path.' });
  if (!(/^[A-Za-z]:\\/.test(steamCmdPath) || /^\\\\[^\\]+\\[^\\]+/.test(steamCmdPath))) return response.status(400).json({ error: 'SteamCMD location must be an absolute Windows or UNC path.' });
  if (!serverName || !worldName) return response.status(400).json({ error: 'Server and world names are required.' });
  if (ownerId && !/^\d{17}$/.test(ownerId)) return response.status(400).json({ error: 'Owner ID must be a 17-digit SteamID64.' });
  if (!Number.isInteger(gamePort) || gamePort < 1 || gamePort > 65535) return response.status(400).json({ error: 'Game port must be between 1 and 65535.' });
  if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) return response.status(400).json({ error: 'Dashboard port must be between 1 and 65535.' });
  if (!/^(0\.0\.0\.0|127\.0\.0\.1|localhost|(?:\d{1,3}\.){3}\d{1,3})$/i.test(bindAddress)) return response.status(400).json({ error: 'Dashboard bind address must be an IPv4 address, localhost, or 0.0.0.0.' });
  if (!/^[A-Za-z0-9.:,\/-]+$/.test(remoteAddress)) return response.status(400).json({ error: 'Firewall scope contains unsupported characters.' });
  if (!Number.isInteger(updateCheckHours) || updateCheckHours < 1 || updateCheckHours > 24) return response.status(400).json({ error: 'Update interval must be between 1 and 24 hours.' });
  if (!Number.isInteger(updateGraceMinutes) || updateGraceMinutes < 0 || updateGraceMinutes > 60) return response.status(400).json({ error: 'Update grace period must be between 0 and 60 minutes.' });
  if (dashboardPassword.length < 8) return response.status(400).json({ error: 'Dashboard password must be at least eight characters.' });
  if (!/^#[0-9a-f]{6}$/i.test(accentColor)) return response.status(400).json({ error: 'Accent color must be a six-digit hex color.' });

  setupRunning = true;
  try {
    let config;
    if (skipServerInstall) {
      config = await readConfig();
      const executable = path.join(installRoot, config.ServerExecutableRelativePath);
      if (!(await exists(executable))) {
        return response.status(400).json({ error: `Existing server executable was not found at ${executable}.` });
      }
      config.InstallRoot = installRoot;
      config.SteamCmdPath = steamCmdPath;
      config.BackupRoot = backupRoot;
      config.GamePort = gamePort;
      config.ServerName = serverName;
      config.WorldName = worldName;
      config.UpdateCheckHours = updateCheckHours;
      config.UpdateGraceMinutes = updateGraceMinutes;
    } else {
      await invoke('Install-DragonWildsServer.ps1', [
        '-InstallRoot', installRoot,
        '-SteamCmdPath', steamCmdPath,
        '-BackupRoot', backupRoot,
        '-GamePort', String(gamePort),
        '-ServerName', serverName,
        '-WorldName', worldName,
        '-UpdateCheckHours', String(updateCheckHours),
        '-UpdateGraceMinutes', String(updateGraceMinutes)
      ]);
      config = await readConfig();
    }

    config.ManagerTitle = clean(next.managerTitle) || serverName;
    config.ManagerSubtitle = clean(next.managerSubtitle) || 'Dedicated server command center';
    config.HostDisplayName = clean(next.hostDisplayName) || process.env.COMPUTERNAME || 'Windows Server';
    config.AccentColor = accentColor;
    config.Public = next.public ? 1 : 0;
    config.WebPort = webPort;
    config.WebBindAddress = bindAddress;
    config.WebRemoteAddress = remoteAddress;
    const secrets = {
      OwnerId: ownerId,
      AdminPassword: String(next.adminPassword || ''),
      WorldPassword: String(next.worldPassword || '')
    };
    await writeConfig(config, secrets);

    const salt = crypto.randomBytes(16).toString('hex');
    await fs.writeFile(authPath, JSON.stringify({ salt, hash: hash(dashboardPassword, salt) }, null, 2), 'utf8');
    await invoke('Protect-DragonWildsConfiguration.ps1');
    await invoke('Start-DragonWildsServer.ps1');
    await invoke('Apply-DragonWildsConfiguration.ps1', ['-ScheduleManagerRestart']);
    setSession(response);
    response.json({ message: 'Installation complete.', webPort });
  } finally {
    setupRunning = false;
  }
});

app.post('/api/login', async (request, response) => {
  const auth = await readAuth();
  if (!request.body?.password || !crypto.timingSafeEqual(Buffer.from(hash(request.body.password, auth.salt), 'hex'), Buffer.from(auth.hash, 'hex'))) return response.status(401).json({ error: 'Invalid password.' });
  setSession(response);
  response.json({ ok: true });
});
app.post('/api/logout', requireAuth, (request, response) => { session.delete(cookie(request)); response.setHeader('Set-Cookie', 'dwsm=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); response.json({ ok: true }); });
app.get('/api/status', requireAuth, async (_, response) => response.json(await health()));
app.get('/api/overview', requireAuth, async (_, response) => {
  const config = await readConfig();
  response.json(await overview(config));
});
app.get('/api/logs', requireAuth, async (_, response) => {
  const config = await readConfig();
  response.json(await recentLogs(config));
});
app.get('/api/player-query', requireAuth, async (_, response) => {
  const config = await readConfig();
  response.json(await playerQuery(config.GamePort));
});
app.get('/api/update-status', requireAuth, async (_, response) => response.json(await updateStatus()));
app.get('/api/config', requireAuth, async (_, response) => {
  const config = await readConfig(); const secrets = await readSecrets();
  response.json({
    serverName: config.ServerName,
    worldName: config.WorldName,
    public: Boolean(config.Public),
    gamePort: config.GamePort,
    installRoot: config.InstallRoot,
    backupRoot: config.BackupRoot || path.join(stateRoot, 'backups'),
    steamCmdPath: config.SteamCmdPath,
    executablePath: path.join(config.InstallRoot, config.ServerExecutableRelativePath),
    platformPolicy: 'Crossplay',
    maxPlayers: 6,
    updateCheckHours: config.UpdateCheckHours ?? 1,
    updateGraceMinutes: config.UpdateGraceMinutes ?? 10,
    managerTitle: config.ManagerTitle || 'Dragonwilds Server',
    managerSubtitle: config.ManagerSubtitle || 'Dedicated server command center',
    hostDisplayName: config.HostDisplayName || process.env.COMPUTERNAME || 'Windows Server',
    accentColor: config.AccentColor || '#d9aa50',
    webPort: config.WebPort ?? 8787,
    bindAddress: config.WebBindAddress || '0.0.0.0',
    remoteAddress: config.WebRemoteAddress || 'LocalSubnet',
    ownerId: secrets.OwnerId || '',
    worldPassword: '',
    adminPassword: ''
  });
});
app.put('/api/config', requireAuth, async (request, response) => {
  const config = await readConfig(); const secrets = await readSecrets();
  const next = request.body || {};
  if (!clean(next.serverName) || !clean(next.worldName)) return response.status(400).json({ error: 'Server and world names are required.' });
  if (!(/^[A-Za-z]:\\/.test(clean(next.backupRoot)) || /^\\\\[^\\]+\\[^\\]+/.test(clean(next.backupRoot)))) return response.status(400).json({ error: 'Backup location must be an absolute Windows or UNC path.' });
  if (!/^#[0-9a-f]{6}$/i.test(clean(next.accentColor))) return response.status(400).json({ error: 'Accent color must be a six-digit hex color.' });
  if (clean(next.ownerId) && !/^\d{17}$/.test(clean(next.ownerId))) return response.status(400).json({ error: 'Owner ID must be a 17-digit SteamID64.' });
  if (!Number.isInteger(Number(next.gamePort)) || Number(next.gamePort) < 1 || Number(next.gamePort) > 65535) return response.status(400).json({ error: 'Game port must be between 1 and 65535.' });
  if (!Number.isInteger(Number(next.webPort)) || Number(next.webPort) < 1 || Number(next.webPort) > 65535) return response.status(400).json({ error: 'Dashboard port must be between 1 and 65535.' });
  if (!Number.isInteger(Number(next.updateCheckHours)) || Number(next.updateCheckHours) < 1 || Number(next.updateCheckHours) > 24) return response.status(400).json({ error: 'Update interval must be between 1 and 24 hours.' });
  if (!Number.isInteger(Number(next.updateGraceMinutes)) || Number(next.updateGraceMinutes) < 0 || Number(next.updateGraceMinutes) > 60) return response.status(400).json({ error: 'Update grace period must be between 0 and 60 minutes.' });
  if (!/^(0\.0\.0\.0|127\.0\.0\.1|localhost|(?:\d{1,3}\.){3}\d{1,3})$/i.test(clean(next.bindAddress))) return response.status(400).json({ error: 'Dashboard bind address must be an IPv4 address, localhost, or 0.0.0.0.' });
  if (!/^[A-Za-z0-9.:,\/-]+$/.test(clean(next.remoteAddress))) return response.status(400).json({ error: 'Firewall scope contains unsupported characters.' });
  config.ServerName = clean(next.serverName); config.WorldName = clean(next.worldName); config.Public = next.public ? 1 : 0;
  config.BackupRoot = clean(next.backupRoot);
  config.ManagerTitle = clean(next.managerTitle) || 'Dragonwilds Server';
  config.ManagerSubtitle = clean(next.managerSubtitle) || 'Dedicated server command center';
  config.HostDisplayName = clean(next.hostDisplayName) || process.env.COMPUTERNAME || 'Windows Server';
  config.AccentColor = clean(next.accentColor);
  const previousWebPort = Number(config.WebPort);
  const previousBindAddress = config.WebBindAddress;
  config.GamePort = Number(next.gamePort);
  config.UpdateCheckHours = Number(next.updateCheckHours);
  config.UpdateGraceMinutes = Number(next.updateGraceMinutes);
  config.WebPort = Number(next.webPort);
  config.WebBindAddress = clean(next.bindAddress);
  config.WebRemoteAddress = clean(next.remoteAddress);
  secrets.OwnerId = clean(next.ownerId);
  if (next.worldPassword) secrets.WorldPassword = clean(next.worldPassword);
  if (next.adminPassword) secrets.AdminPassword = clean(next.adminPassword);
  await invoke('Stop-DragonWildsServer.ps1');
  await writeConfig(config, secrets);
  const managerRestarting = previousWebPort !== config.WebPort || previousBindAddress !== config.WebBindAddress;
  await invoke('Apply-DragonWildsConfiguration.ps1', managerRestarting ? ['-ScheduleManagerRestart'] : []);
  await invoke('Start-DragonWildsServer.ps1');
  response.json({ message: 'Configuration saved and services updated.', webPort: config.WebPort, managerRestarting });
});
app.post('/api/actions/:action', requireAuth, async (request, response) => {
  if (request.params.action === 'backup') {
    const config = await readConfig();
    const backup = await createBackup(config);
    return response.json({ message: `World backup created: ${backup}` });
  }
  if (request.params.action === 'check-update') {
    const output = await invoke('Get-DragonWildsUpdateStatus.ps1');
    const status = JSON.parse(output);
    await fs.writeFile(updateStatusPath, JSON.stringify({ ...status, status: status.updateAvailable ? 'available' : 'current', message: status.updateAvailable ? `Update available: ${status.installedBuildId} -> ${status.remoteBuildId}.` : `Installed build ${status.installedBuildId} is current.` }, null, 2), 'utf8');
    return response.json({ message: status.updateAvailable ? 'Update available.' : 'Server is current.' });
  }
  if (request.params.action === 'scheduled-update') {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(scripts, 'Invoke-ScheduledUpdate.ps1')], { windowsHide: true });
    return response.json({ message: 'Update check started. Any available update will use the configured grace period.' });
  }
  const commands = { start: ['Start-DragonWildsServer.ps1'], stop: ['Stop-DragonWildsServer.ps1'], restart: ['Stop-DragonWildsServer.ps1', 'Start-DragonWildsServer.ps1'], update: ['Update-DragonWildsServer.ps1'] };
  const sequence = commands[request.params.action]; if (!sequence) return response.status(404).json({ error: 'Unknown action.' });
  for (const command of sequence) await invoke(command);
  response.json({ message: `${request.params.action[0].toUpperCase()}${request.params.action.slice(1)} complete.` });
});
app.use(express.static(path.join(root, 'dist')));
app.get('*splat', (_, response) => response.sendFile(path.join(root, 'dist', 'index.html')));
app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: error.message || 'Unexpected server error.' });
});
const runtimeConfig = await readConfig();
const webPort = Number(process.env.DWSM_WEB_PORT || runtimeConfig.WebPort || 8787);
const bindAddress = process.env.DWSM_BIND_ADDRESS || runtimeConfig.WebBindAddress || '0.0.0.0';
app.listen(webPort, bindAddress, () => console.log(`DragonWilds Manager listening on ${bindAddress}:${webPort}.`));
