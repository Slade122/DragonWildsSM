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
const stateRoot = path.join(programData, 'DragonWildsSM');
const authPath = path.join(stateRoot, 'config', 'WebUiAuth.json');
const configPath = path.join(stateRoot, 'config', 'ServerConfig.psd1');
const secretPath = path.join(stateRoot, 'config', 'ServerSecrets.psd1');
const updateStatusPath = path.join(stateRoot, 'update-status.json');
const scripts = path.join('C:\\DragonWildsSM', 'scripts');
const gameRoot = 'C:\\DragonWildsServer\\RSDragonwilds';
const backupRoot = path.join(stateRoot, 'backups');
const app = express();
app.use(express.json({ limit: '8kb' }));

const hash = (value, salt) => crypto.pbkdf2Sync(value, salt, 210000, 64, 'sha1').toString('hex');
const readAuth = async () => JSON.parse((await fs.readFile(authPath, 'utf8')).replace(/^\uFEFF/, ''));
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
const clean = (value) => String(value ?? '').replace(/'/g, "''").replace(/[\r\n]/g, '').trim();
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
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', `$data = Import-PowerShellDataFile -LiteralPath '${file}'; $data | ConvertTo-Json -Compress`], { windowsHide: true });
  return JSON.parse(stdout);
};
const ps = async (command) => {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true, timeout: 30 * 1000 });
  return stdout.trim();
};
const overview = async () => {
  const status = await health();
  const command = [
    `$gameRoot = '${gameRoot}'`,
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
const recentLogs = async () => {
  const command = `$password = (Import-PowerShellDataFile -LiteralPath '${secretPath}').WorldPassword; $log = Get-ChildItem -LiteralPath '${gameRoot}\\Saved\\Logs' -Filter '*.log' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; Get-Content -LiteralPath $log.FullName -Tail 100 | ForEach-Object { if ($password) { $_.Replace($password, '[REDACTED]') } else { $_ } } | ConvertTo-Json -Compress`;
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
const createBackup = async () => {
  await invoke('Stop-DragonWildsServer.ps1');
  try {
    const name = `DragonWilds-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    await fs.mkdir(backupRoot, { recursive: true });
    await ps(`Compress-Archive -LiteralPath '${gameRoot}\\Saved\\SaveGames' -DestinationPath '${path.join(backupRoot, name)}' -CompressionLevel Optimal -Force`);
    return name;
  } finally {
    await invoke('Start-DragonWildsServer.ps1');
  }
};
const writeConfig = async (config, secrets) => {
  const content = `@{\n    AppId = ${config.AppId}\n    InstallRoot = '${clean(config.InstallRoot)}'\n    SteamCmdPath = '${clean(config.SteamCmdPath)}'\n    ServerExecutableRelativePath = '${clean(config.ServerExecutableRelativePath)}'\n    GamePort = ${Number(config.GamePort)}\n    Public = ${config.Public ? 1 : 0}\n    ServerName = '${clean(config.ServerName)}'\n    WorldName = '${clean(config.WorldName)}'\n    LogRetentionDays = ${Number(config.LogRetentionDays)}\n}\n`;
  const secretContent = `@{\n    OwnerId = '${clean(secrets.OwnerId)}'\n    AdminPassword = '${clean(secrets.AdminPassword)}'\n    WorldPassword = '${clean(secrets.WorldPassword)}'\n}\n`;
  await fs.writeFile(configPath, content, 'utf8');
  await fs.writeFile(secretPath, secretContent, 'utf8');
};

app.post('/api/login', async (request, response) => {
  const auth = await readAuth();
  if (!request.body?.password || !crypto.timingSafeEqual(Buffer.from(hash(request.body.password, auth.salt), 'hex'), Buffer.from(auth.hash, 'hex'))) return response.status(401).json({ error: 'Invalid password.' });
  const token = crypto.randomBytes(32).toString('base64url');
  session.set(token, Date.now() + 12 * 60 * 60 * 1000);
  response.setHeader('Set-Cookie', `dwsm=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
  response.json({ ok: true });
});
app.post('/api/logout', requireAuth, (request, response) => { session.delete(cookie(request)); response.setHeader('Set-Cookie', 'dwsm=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); response.json({ ok: true }); });
app.get('/api/status', requireAuth, async (_, response) => response.json(await health()));
app.get('/api/overview', requireAuth, async (_, response) => response.json(await overview()));
app.get('/api/logs', requireAuth, async (_, response) => response.json(await recentLogs()));
app.get('/api/player-query', requireAuth, async (_, response) => {
  const config = await dataFile(configPath);
  response.json(await playerQuery(config.GamePort));
});
app.get('/api/update-status', requireAuth, async (_, response) => response.json(await updateStatus()));
app.get('/api/config', requireAuth, async (_, response) => {
  const config = await dataFile(configPath); const secrets = await dataFile(secretPath);
  response.json({ serverName: config.ServerName, worldName: config.WorldName, public: Boolean(config.Public), gamePort: config.GamePort, installRoot: config.InstallRoot, steamCmdPath: config.SteamCmdPath, executablePath: path.join(config.InstallRoot, config.ServerExecutableRelativePath), platformPolicy: 'Crossplay', maxPlayers: 6, worldPassword: '', adminPassword: '' });
});
app.put('/api/config', requireAuth, async (request, response) => {
  const config = await dataFile(configPath); const secrets = await dataFile(secretPath);
  const next = request.body || {};
  if (!clean(next.serverName) || !clean(next.worldName)) return response.status(400).json({ error: 'Server and world names are required.' });
  config.ServerName = clean(next.serverName); config.WorldName = clean(next.worldName); config.Public = next.public ? 1 : 0;
  if (next.worldPassword) secrets.WorldPassword = clean(next.worldPassword);
  if (next.adminPassword) secrets.AdminPassword = clean(next.adminPassword);
  await invoke('Stop-DragonWildsServer.ps1'); await writeConfig(config, secrets); await invoke('Start-DragonWildsServer.ps1');
  response.json({ message: 'Configuration saved and server restarted.' });
});
app.post('/api/actions/:action', requireAuth, async (request, response) => {
  if (request.params.action === 'backup') {
    const backup = await createBackup();
    return response.json({ message: `World backup created: ${backup}` });
  }
  if (request.params.action === 'check-update') {
    const output = await invoke('Get-DragonWildsUpdateStatus.ps1');
    const status = JSON.parse(output);
    await fs.writeFile(updateStatusPath, JSON.stringify({ ...status, status: status.updateAvailable ? 'available' : 'current', message: status.updateAvailable ? `Update available: ${status.installedBuildId} -> ${status.remoteBuildId}.` : `Installed build ${status.installedBuildId} is current.` }, null, 2), 'utf8');
    return response.json({ message: status.updateAvailable ? 'Update available.' : 'Server is current.' });
  }
  if (request.params.action === 'scheduled-update') {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(scripts, 'Invoke-ScheduledUpdate.ps1'), '-GraceMinutes', '10'], { windowsHide: true });
    return response.json({ message: 'Update check started. If an update exists, restart happens in 10 minutes.' });
  }
  const commands = { start: ['Start-DragonWildsServer.ps1'], stop: ['Stop-DragonWildsServer.ps1'], restart: ['Stop-DragonWildsServer.ps1', 'Start-DragonWildsServer.ps1'], update: ['Update-DragonWildsServer.ps1'] };
  const sequence = commands[request.params.action]; if (!sequence) return response.status(404).json({ error: 'Unknown action.' });
  for (const command of sequence) await invoke(command);
  response.json({ message: `${request.params.action[0].toUpperCase()}${request.params.action.slice(1)} complete.` });
});
app.use(express.static(path.join(root, 'dist')));
app.get('*splat', (_, response) => response.sendFile(path.join(root, 'dist', 'index.html')));
app.listen(8787, '0.0.0.0', () => console.log('DragonWilds Manager listening on port 8787.'));
