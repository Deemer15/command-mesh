const vscode = require('vscode')
const fs = require('fs')
const path = require('path')
const http = require('http')
const os = require('os')
const { setupFrom } = require('./map-renderer')
const drawMap = require('./futuristic-renderer')
const dashboardCss = fs.readFileSync(path.join(__dirname, 'dashboard.css'), 'utf8')

const rendererSetup = setupFrom({ coreName: 'COPILOT', theme: 'dark' })

let panel
let watcher
let panelRefreshTimer
let diskWatcher
let webServer
let copilotBridge
let codexBridge
let kiroUsageBridge
let presenceBridge
const recentFileEvents = new Map()

const ignoredWorkspacePrefixes = [
  '.git/',
  '.kiro/command-mesh/',
  '.kiro/lot-map/',
  '.playwright-cli/',
  '.vscode/',
  'node_modules/',
]

function shouldIgnoreWorkspaceFile(relative) {
  const normalized = String(relative).replace(/\\/g, '/').replace(/^\.\//, '')
  return normalized === '.kiro/command-mesh'
    || normalized === '.kiro/lot-map'
    || ignoredWorkspacePrefixes.some(prefix => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))
    || /(^|\/)state\.json(?:\..*\.tmp)?$/.test(normalized)
    || /(^|\/)(?:command-mesh-preview\.png|command-mesh-\d+\.\d+\.\d+\.(?:vsix|zip))$/.test(normalized)
}

function commandMeshStateFile(root) {
  const current = path.join(root, '.kiro', 'command-mesh', 'state.json')
  const legacy = path.join(root, '.kiro', 'lot-map', 'state.json')
  if (!fs.existsSync(current) && fs.existsSync(legacy)) {
    try {
      fs.mkdirSync(path.dirname(current), { recursive: true })
      fs.copyFileSync(legacy, current)
    } catch {}
  }
  return current
}

// Read the shared state file. Returns an empty board when the file does not exist yet, and null when it
// exists but cannot be parsed (another writer is mid-write). Callers that write must skip on null, so a
// torn read never turns into an empty board that wipes everyone's counts and models.
function readState(stateFile) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let raw
    try { raw = fs.readFileSync(stateFile, 'utf8') } catch (error) {
      if (error.code === 'ENOENT') return { entries: [], counts: {} }
    }
    if (raw !== undefined) {
      try {
        const state = JSON.parse(raw)
        if (state && typeof state === 'object') return state
      } catch {}
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15)
  }
  return null
}

// Writers take turns: a read-modify-write runs while holding state.json.lock, so two writers never read
// the same old board and overwrite each other's event. Reentrant within this process. A lock older than
// 3 s is treated as abandoned. If the lock cannot be had within 2 s the write goes ahead anyway.
let stateLockDepth = 0
function withStateLock(stateFile, fn) {
  if (stateLockDepth > 0) {
    stateLockDepth++
    try { return fn() } finally { stateLockDepth-- }
  }
  const lockPath = `${stateFile}.lock`
  let owned = false
  try { fs.mkdirSync(path.dirname(stateFile), { recursive: true }) } catch {}
  const deadline = Date.now() + 2000
  while (!owned) {
    try { fs.closeSync(fs.openSync(lockPath, 'wx')); owned = true } catch (error) {
      if (error.code !== 'EEXIST') break
      try { if (Date.now() - fs.statSync(lockPath).mtimeMs > 3000) { fs.unlinkSync(lockPath); continue } } catch {}
      if (Date.now() > deadline) break
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
    }
  }
  stateLockDepth++
  try { return fn() } finally {
    stateLockDepth--
    if (owned) try { fs.unlinkSync(lockPath) } catch {}
  }
}

let lastGoodState = { entries: [], counts: {} }
function readBoard(root) {
  const stateFile = commandMeshStateFile(root)
  const fresh = readState(stateFile)
  if (fresh) lastGoodState = fresh
  const state = lastGoodState
  return {
    ...state,
    entries: (state.entries || []).map(entry => ({
      from: 'core',
      ...entry,
      provider: drawMap.providerFor(entry),
      ...(entry.status === 'run' && entry.startedAt < Date.now() - 15000
        ? { status: 'ok', endedAt: entry.endedAt || entry.startedAt }
        : {}),
      station: entry.station === 'network' ? 'web' : entry.station,
    })),
    counts: Object.fromEntries(
      Object.entries(state.counts || {}).map(([station, count]) => [station === 'network' ? 'web' : station, count]),
    ),
  }
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('commandMesh.open', () => openMap(context)))
  context.subscriptions.push(vscode.commands.registerCommand('commandMesh.openWeb', () => openWebDashboard()))
  context.subscriptions.push(vscode.workspace.onDidCreateFiles(e => recordWorkspaceFiles('created', e.files)))
  context.subscriptions.push(vscode.workspace.onDidDeleteFiles(e => recordWorkspaceFiles('deleted', e.files)))
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => recordWorkspaceFiles('saved', [document.uri])))
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => recordWorkspaceFiles('changed', [e.document.uri])))
  const startShell = vscode.window.onDidStartTerminalShellExecution
  const endShell = vscode.window.onDidEndTerminalShellExecution
  if (startShell && endShell) {
    context.subscriptions.push(startShell(e => recordShell('run', e.execution.commandLine.value)))
    context.subscriptions.push(endShell(e => recordShell(e.exitCode === 0 ? 'done' : 'failed', e.execution.commandLine.value)))
  }

  function webPage() {
    return `<!doctype html><meta charset="utf-8"><title>Command Mesh</title>
  <style>${dashboardCss}</style>
  <main><header><strong>Command Mesh</strong><span id="summary" class="dim"></span></header><section id="map"></section><section id="dashboard" class="telemetry"></section></main>
  <script>
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const PROV=['copilot','codex','kiro'];
  function stackBar(list,max,h){const segs=PROV.map(p=>{const n=list.filter(x=>(x.provider||'copilot')===p).length;return n?'<b class="seg '+p+'" style="flex:'+n+'"></b>':''}).join('');return '<i class="bar" style="height:'+Math.max(2,Math.round(list.length/max*h))+'px">'+segs+'</i>'}
  function modelsHtml(state){const m=state.models||{},parts=PROV.filter(p=>m[p]).map(p=>'<span class="m '+p+'"><b>'+p.toUpperCase()+'</b>'+esc(m[p])+'</span>');return parts.length?'<span class="models">'+parts.join('')+'</span>':'<span class="model">model pending</span>'}
  function creditsKpi(state){const u=state.usage&&state.usage.kiro;return '<div class="kpi"><span>Kiro credits</span><b class="credits">'+(u?Number(u.session).toFixed(2):'--')+'</b></div>'}
  let paused=false,filter='all',latestState,latestSvg='',selectedId='',minuteFilter=null;
  function bindMapFilters(redraw){const map=document.querySelector('#map'),sync=()=>map.querySelectorAll('[data-station]').forEach(card=>{const selected=filter===card.dataset.station;card.classList.toggle('selected',selected);card.setAttribute('aria-pressed',String(selected))}),activate=card=>{if(!card)return;filter=filter===card.dataset.station?'all':card.dataset.station;selectedId='';redraw()};map.addEventListener('click',event=>activate(event.target.closest?.('[data-station]')));map.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const card=event.target.closest?.('[data-station]');if(!card)return;event.preventDefault();activate(card)});new MutationObserver(sync).observe(map,{childList:true});sync()}
  function bindEventDisclosures(redraw){let feedScrollTop=0;const dashboard=document.querySelector('#dashboard'),decorate=()=>{const rows=dashboard.querySelectorAll('.row[data-id]');rows.forEach(row=>{const expanded=selectedId===row.dataset.id;row.classList.toggle('expanded',expanded);row.setAttribute('role','button');row.setAttribute('tabindex','0');row.setAttribute('aria-expanded',String(expanded));let toggle=row.querySelector('.row-toggle');if(!toggle){toggle=document.createElement('span');toggle.className='row-toggle';toggle.setAttribute('aria-hidden','true');row.prepend(toggle)}const symbol=expanded?'−':'+';if(toggle.textContent!==symbol)toggle.textContent=symbol});const row=dashboard.querySelector('.row.expanded'),inspector=dashboard.querySelector('.inspector');if(row&&inspector&&inspector.previousElementSibling!==row)row.after(inspector);const feed=dashboard.querySelector('.feed');if(feed&&Math.abs(feed.scrollTop-feedScrollTop)>1)feed.scrollTop=feedScrollTop},activate=event=>{const row=event.target.closest?.('.row[data-id]');if(!row)return;event.preventDefault();event.stopImmediatePropagation();selectedId=selectedId===row.dataset.id?'':row.dataset.id;redraw()};dashboard.addEventListener('scroll',event=>{if(event.target.matches?.('.feed'))feedScrollTop=event.target.scrollTop},true);dashboard.addEventListener('click',activate,true);dashboard.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;activate(event)},true);new MutationObserver(decorate).observe(dashboard,{childList:true,subtree:true});decorate()}
  function bindActivityTimeline(redraw){const dashboard=document.querySelector('#dashboard'),mainFilter=all=>filter==='all'?all:filter==='run'?all.filter(x=>x.status==='run'):filter==='ok'?all.filter(x=>x.status==='ok'):filter==='err'?all.filter(x=>x.status==='err'||x.status==='block'):all.filter(x=>x.station===filter),bucket=(all,minute,now)=>all.filter(x=>{const age=now-x.startedAt;return age>=minute*60000&&age<(minute+1)*60000}),renderFeed=now=>{if(minuteFilter===null)return;const feed=dashboard.querySelector('.feed');if(!feed)return;const visible=bucket(mainFilter(latestState.entries||[]),minuteFilter,now).slice().reverse(),signature=visible.map(x=>x.id).join('|'),current=[...feed.querySelectorAll(':scope > .row[data-id]')].map(x=>x.dataset.id).join('|');if(signature===current&&feed.dataset.minuteSignature===signature)return;feed.dataset.minuteSignature=signature;feed.innerHTML=visible.map(x=>'<div class="row '+(x.status||'')+'" data-provider="'+esc(x.provider||'')+'" data-id="'+esc(x.id)+'">'+(x.status==='run'?'●':x.status==='ok'?'·':'✕')+' '+esc(x.station)+'  '+esc(x.label)+'</div>').join('')||'<div class="timeline-empty">No events in this minute</div>'},decorate=()=>{const spark=dashboard.querySelector('.spark');if(!spark)return;let head=spark.previousElementSibling;if(!head?.classList.contains('spark-head')){head=document.createElement('div');head.className='spark-head';head.innerHTML='<span>ACTIVITY · LAST 24 MINUTES</span><span class="spark-selection">24M AGO&nbsp;&nbsp;→&nbsp;&nbsp;NOW</span>';spark.before(head)}const now=Date.now(),bars=[...spark.querySelectorAll('.bar')];bars.forEach((bar,index)=>{const minute=bars.length-1-index,count=bucket(latestState.entries||[],minute,now).length,end=new Date(now-minute*60000),start=new Date(now-(minute+1)*60000),time=d=>d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});bar.dataset.minute=String(minute);bar.dataset.count=String(count);bar.classList.toggle('active',minuteFilter===minute);bar.setAttribute('role','button');bar.setAttribute('tabindex','0');bar.setAttribute('aria-pressed',String(minuteFilter===minute));bar.setAttribute('aria-label',count+' events from '+time(start)+' to '+time(end));bar.title=count+' event'+(count===1?'':'s')+' · '+time(start)+'–'+time(end)});const selectedCount=minuteFilter===null?0:bucket(mainFilter(latestState.entries||[]),minuteFilter,now).length;head.querySelector('.spark-selection').textContent=minuteFilter===null?'24M AGO  →  NOW':(minuteFilter===0?'CURRENT MINUTE':minuteFilter+'–'+(minuteFilter+1)+' MIN AGO')+' · '+selectedCount+' EVENT'+(selectedCount===1?'':'S');renderFeed(now)},activate=bar=>{if(!bar)return;const minute=Number(bar.dataset.minute);minuteFilter=minuteFilter===minute?null:minute;selectedId='';redraw()};dashboard.addEventListener('click',event=>{if(event.target.closest?.('#reset')){minuteFilter=null;return}activate(event.target.closest?.('.bar[data-minute]'))},true);dashboard.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const bar=event.target.closest?.('.bar[data-minute]');if(!bar)return;event.preventDefault();activate(bar)},true);new MutationObserver(decorate).observe(dashboard,{childList:true});decorate()}
  function inspector(entry){if(!entry)return '';const detail=entry.detail||{};return '<div class="inspector"><h3>'+esc(detail.kind||'Event')+' · '+esc(entry.label)+'</h3><pre>'+esc(JSON.stringify({station:entry.station,status:entry.status,startedAt:new Date(entry.startedAt).toISOString(),endedAt:entry.endedAt?new Date(entry.endedAt).toISOString():undefined,duration:entry.endedAt?formatDuration(entry.endedAt-entry.startedAt):'running',...detail},null,2))+'</pre></div>'}
  function detailHtml(all){const selected=filter==='all'?all:filter==='run'?all.filter(x=>x.status==='run'):filter==='ok'?all.filter(x=>x.status==='ok'):filter==='err'?all.filter(x=>x.status==='err'||x.status==='block'):all.filter(x=>x.station===filter),dur=selected.filter(x=>x.endedAt).map(x=>x.endedAt-x.startedAt),avg=dur.length?Math.round(dur.reduce((a,b)=>a+b,0)/dur.length):0,good=selected.filter(x=>x.status==='ok').length,labels={};selected.forEach(x=>labels[x.label]=(labels[x.label]||0)+1);const top=Object.entries(labels).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>esc(x[0])+' ×'+x[1]).join(' · ')||'No activity';return '<div class="detail"><div class="detail-grid"><div class="detail-card"><span>Selected</span><b>'+esc(filter==='all'?'Entire session':filter)+'</b></div><div class="detail-card"><span>Success</span><b>'+ (selected.length?Math.round(good/selected.length*100):0)+'%</b></div><div class="detail-card"><span>Avg duration</span><b>'+formatDuration(avg)+'</b></div><div class="detail-card"><span>Latest</span><b>'+formatDuration(selected.length?Date.now()-selected[selected.length-1].startedAt:0)+' ago</b></div></div><div class="topops">TOP OPERATIONS&nbsp;&nbsp;'+top+'</div></div>'}
  function dashboard(state){latestState=state;const all=state.entries||[],e=filter==='all'?all:filter==='run'?all.filter(x=>x.status==='run'):filter==='ok'?all.filter(x=>x.status==='ok'):filter==='err'?all.filter(x=>x.status==='err'||x.status==='block'):all.filter(x=>x.station===filter),now=Date.now(),first=all[0]?.startedAt||now,mins=Math.max(1,(now-first)/60000),running=all.filter(x=>x.status==='run'),done=all.filter(x=>x.status==='ok'),errors=all.filter(x=>x.status==='err'||x.status==='block'),files=all.filter(x=>x.station==='files').length,shell=all.filter(x=>x.station==='shell').length,rate=Math.round(all.length/mins),route=[];all.slice(-12).forEach(x=>{if(route[route.length-1]!==x.station)route.push(x.station)});const buckets=Array.from({length:24},(_,i)=>all.filter(x=>now-x.startedAt>=i*60000&&now-x.startedAt<(i+1)*60000)),max=Math.max(1,...buckets.map(l=>l.length)),bars=buckets.reverse().map(l=>stackBar(l,max,28)).join(''),last=e[e.length-1],chosen=all.find(x=>x.id===selectedId),summary=last&&last.label?last.label:'Nothing is running.',model=state.model||'model pending',map=document.querySelector('#map');document.querySelector('#summary').textContent=summary;map.style.display='block';map.innerHTML=latestSvg;document.querySelector('#dashboard').innerHTML='<div class="telemetry-head"><span class="eyebrow">LIVE MAP</span>'+modelsHtml(state)+'<span class="controls"><button id="pause">'+(paused?'RESUME':'PAUSE')+'</button><button id="reset">ALL</button></span></div><div class="kpis"><div class="kpi '+(filter==='all'?'active':'')+'" data-filter="all"><span>Events</span><b>'+all.length+'</b></div><div class="kpi '+(filter==='run'?'active':'')+'" data-filter="run"><span>Active</span><b>'+running.length+'</b></div><div class="kpi '+(filter==='ok'?'active':'')+'" data-filter="ok"><span>Done</span><b>'+done.length+'</b></div><div class="kpi '+(filter==='files'?'active':'')+'" data-filter="files"><span>Files</span><b>'+files+'</b></div><div class="kpi '+(filter==='shell'?'active':'')+'" data-filter="shell"><span>Shell</span><b>'+shell+'</b></div><div class="kpi '+(filter==='err'?'active':'')+'" data-filter="err"><span>Errors</span><b class="'+(errors.length?'err':'')+'">'+errors.length+'</b></div><div class="kpi"><span>Rate</span><b>'+rate+'/min</b></div>'+creditsKpi(state)+'</div><div class="spark">'+bars+'</div><div class="route">ROUTE&nbsp;&nbsp;'+(route.length?route.map(esc).join(' → '):'No activity yet')+'</div><div class="now">'+(last?(last.status==='run'?'●':'✓')+' NOW&nbsp;&nbsp;'+esc(last.station)+' · '+esc(last.label):'Waiting for activity')+'</div>'+detailHtml(all)+inspector(chosen)+'<div class="feed">'+e.slice(-10).reverse().map(x=>'<div class="row '+(x.status||'')+'" data-provider="'+esc(x.provider||'')+'" data-id="'+esc(x.id)+'">'+(x.status==='run'?'●':x.status==='ok'?'·':'✕')+' '+esc(x.station)+'  '+esc(x.label)+'</div>').join('')+'</div>';document.querySelectorAll('[data-filter]').forEach(x=>x.onclick=()=>{filter=x.dataset.filter;dashboard(latestState)});document.querySelectorAll('[data-id]').forEach(x=>x.onclick=()=>{selectedId=x.dataset.id;dashboard(latestState)});document.querySelector('#pause').onclick=()=>{paused=!paused;dashboard(latestState)};document.querySelector('#reset').onclick=()=>{filter='all';selectedId='';dashboard(latestState)}}
  bindMapFilters(()=>dashboard(latestState));
  bindActivityTimeline(()=>dashboard(latestState));
  bindEventDisclosures(()=>dashboard(latestState));
  function formatDuration(ms){const s=Math.floor(ms/1000);return s<60?s+'s':Math.floor(s/60)+'m '+s%60+'s'}
  async function refresh(){const r=await fetch('/state?'+Date.now());const d=await r.json();if(!paused){latestSvg=d.svg||'';dashboard(d.state)}}
  refresh();setInterval(refresh,800);
  </script>`
  }

  async function openWebDashboard() {
    const folder = vscode.workspace.workspaceFolders?.[0]
    if (!folder) {
      vscode.window.showErrorMessage('Command Mesh requires an open workspace.')
      return
    }
    if (!webServer) {
      webServer = http.createServer((request, response) => {
        const board = readBoard(folder.uri.fsPath)
        if (request.url?.split('?')[0] === '/state') {
          response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          response.end(JSON.stringify({ state: board, svg: drawMap(board, Date.now(), rendererSetup) }))
          return
        }
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end(webPage())
      })
      await new Promise((resolve, reject) => {
        webServer.once('error', reject)
        webServer.listen(0, '127.0.0.1', resolve)
      })
    }
    const address = webServer.address()
    if (!address || typeof address === 'string') throw new Error('Command Mesh web server did not start.')
    await vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${address.port}/`))
  }
  const folder = vscode.workspace.workspaceFolders?.[0]
  const bridgeLock = folder ? acquireBridgeLock(folder.uri.fsPath) : undefined
  // The Kiro usage reader and presence check publish the same values from any window and only write
  // when something changes, so every window runs them. An older window holding bridge.lock can then
  // never hide them.
  if (folder) {
    kiroUsageBridge = startKiroUsageBridge(folder.uri.fsPath)
    presenceBridge = startPresenceBridge(folder.uri.fsPath, /kiro/i.test(vscode.env?.appName || ''))
    context.subscriptions.push(kiroUsageBridge)
    context.subscriptions.push(presenceBridge)
  }
  if (folder && bridgeLock) {
    context.subscriptions.push(bridgeLock)
    copilotBridge = startCopilotEventBridge(folder.uri.fsPath)
    codexBridge = startCodexEventBridge(folder.uri.fsPath)
    context.subscriptions.push(copilotBridge)
    context.subscriptions.push(codexBridge)
    diskWatcher = fs.watch(folder.uri.fsPath, { recursive: true, persistent: false }, (event, filename) => {
      if (!filename) return
      const relative = String(filename).replace(/\\/g, '/')
      if (shouldIgnoreWorkspaceFile(relative)) return
      recordFilesystemEvent(event, folder.uri.fsPath, relative)
    })
    context.subscriptions.push({ dispose: () => diskWatcher?.close() })
  }
}

function recordFilesystemEvent(action, root, relative) {
  const now = Date.now()
  const key = `${action}:${relative}`
  if (now - (recentFileEvents.get(key) || 0) < 750) return
  recentFileEvents.set(key, now)
  if (recentFileEvents.size > 500) {
    for (const [eventKey, seenAt] of recentFileEvents) {
      if (now - seenAt > 5000) recentFileEvents.delete(eventKey)
    }
  }
  const stateFile = commandMeshStateFile(root)
  appendEntries(stateFile, [{
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    station: 'files',
    label: `${action} ${relative.split('/').slice(-2).join('/')}`.slice(0, 100),
    status: 'ok',
    startedAt: now,
    endedAt: now,
  }])
}

function stateFileFor(uri) {
  const folder = vscode.workspace.getWorkspaceFolder(uri)
  return folder ? commandMeshStateFile(folder.uri.fsPath) : undefined
}

function appendEntries(stateFile, entries) {
  if (!stateFile || entries.length === 0) return
  return withStateLock(stateFile, () => appendEntriesLocked(stateFile, entries))
}

function appendEntriesLocked(stateFile, entries) {
  const state = readState(stateFile)
  if (!state) return
  const currentProvider = normalizeProvider(state.provider) || 'kiro'
  for (const rawEntry of entries) {
    const entry = { provider: currentProvider, ...rawEntry }
    state.entries = [...(state.entries || []), entry].slice(-80)
    state.counts = { ...(state.counts || {}), [entry.station]: (state.counts?.[entry.station] || 0) + 1 }
  }
  writeState(stateFile, state)
}

// Only one editor window per workspace runs the workspace-wide readers (stream bridges and disk watcher),
// so Kiro and VS Code do not record the same events twice. Returns a disposable, or undefined if another
// live window holds the lock. A lock is stale when its owner process has exited or it stopped heartbeating.
function acquireBridgeLock(root) {
  const lockFile = path.join(root, '.kiro', 'command-mesh', 'bridge.lock')
  const claim = () => {
    fs.mkdirSync(path.dirname(lockFile), { recursive: true })
    fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' })
  }
  const stale = () => {
    try {
      let held
      try { held = JSON.parse(fs.readFileSync(lockFile, 'utf8')) } catch {
        return Date.now() - fs.statSync(lockFile).mtimeMs > 30000
      }
      try { process.kill(held.pid, 0); return false } catch (error) { return error.code !== 'EPERM' }
    } catch { return false }
  }
  try { claim() } catch (error) {
    if (error.code !== 'EEXIST' || !stale()) return undefined
    try { fs.unlinkSync(lockFile); claim() } catch { return undefined }
  }
  const heartbeat = setInterval(() => {
    try { fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, at: Date.now() })) } catch {}
  }, 10000)
  heartbeat.unref?.()
  return {
    dispose() {
      clearInterval(heartbeat)
      try {
        if (JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid === process.pid) fs.unlinkSync(lockFile)
      } catch {}
    },
  }
}

// Locked read-modify-write of the board. mutate returns false to skip the write.
function updateBoard(root, mutate) {
  const stateFile = commandMeshStateFile(root)
  return withStateLock(stateFile, () => {
    const state = readState(stateFile)
    if (!state || mutate(state) === false) return
    writeState(stateFile, state)
  })
}

// Kiro writes each session to ~/.kiro/sessions/<hash>/<session id>/: session.json holds the selected
// model and workspace, and messages.jsonl gets a usage_summary record (credits used) after every turn.
// This follows the most recently active session for this workspace and publishes its model and credits.
function startKiroUsageBridge(root) {
  const sessionsRoot = path.join(os.homedir(), '.kiro', 'sessions')
  const rootKey = path.resolve(root).toLowerCase()
  const metaCache = new Map()
  let current
  let published = ''
  let stopped = false

  const sameRoot = value => { try { return path.resolve(String(value)).toLowerCase() === rootKey } catch { return false } }
  const pickSession = () => {
    let best
    let hashes = []
    try { hashes = fs.readdirSync(sessionsRoot, { withFileTypes: true }) } catch { return undefined }
    for (const hash of hashes) {
      if (!hash.isDirectory()) continue
      let sessions = []
      try { sessions = fs.readdirSync(path.join(sessionsRoot, hash.name), { withFileTypes: true }) } catch { continue }
      for (const session of sessions) {
        if (!session.isDirectory() || !session.name.startsWith('sess_')) continue
        const meta = path.join(sessionsRoot, hash.name, session.name, 'session.json')
        let stat
        try { stat = fs.statSync(meta) } catch { continue }
        let info = metaCache.get(meta)
        if (!info || info.mtimeMs !== stat.mtimeMs) {
          info = { mtimeMs: stat.mtimeMs, match: false, modelId: '' }
          try {
            const json = JSON.parse(fs.readFileSync(meta, 'utf8'))
            info.match = [...(json.workspacePaths || []), ...(json.rootPaths || [])].some(sameRoot)
            info.modelId = String(json.modelId || '')
          } catch {}
          metaCache.set(meta, info)
        }
        if (info.match && (!best || stat.mtimeMs > best.mtimeMs)) best = { dir: path.dirname(meta), mtimeMs: stat.mtimeMs, modelId: info.modelId }
      }
    }
    return best
  }
  const refreshSession = () => {
    const best = pickSession()
    if (!best) return
    if (!current || current.dir !== best.dir) current = { dir: best.dir, offset: 0, session: 0, last: 0, lastAt: 0, modelId: best.modelId }
    else current.modelId = best.modelId
  }
  const tail = () => {
    if (!current) return
    const file = path.join(current.dir, 'messages.jsonl')
    let stat
    try { stat = fs.statSync(file) } catch { return }
    if (stat.size < current.offset) Object.assign(current, { offset: 0, session: 0, last: 0, lastAt: 0 })
    if (stat.size === current.offset) return
    let chunk = ''
    try {
      const handle = fs.openSync(file, 'r')
      const buffer = Buffer.alloc(stat.size - current.offset)
      fs.readSync(handle, buffer, 0, buffer.length, current.offset)
      fs.closeSync(handle)
      chunk = buffer.toString('utf8')
    } catch { return }
    const lastNewline = chunk.lastIndexOf('\n')
    if (lastNewline < 0) return
    current.offset += Buffer.byteLength(chunk.slice(0, lastNewline + 1), 'utf8')
    for (const line of chunk.slice(0, lastNewline).split('\n')) {
      if (!line.includes('usage_summary')) continue
      try {
        const record = JSON.parse(line)
        const payload = record.payload || {}
        if (payload.type !== 'usage_summary') continue
        const used = (payload.promptTurnSummaries || [])
          .filter(summary => !summary.unit || /credit/i.test(summary.unit))
          .reduce((sum, summary) => sum + (Number(summary.usage) || 0), 0)
        const at = typeof record.timestamp === 'number' ? record.timestamp : Date.parse(record.timestamp || '')
        current.session += used
        current.last = used
        current.lastAt = Number.isFinite(at) ? at : Date.now()
      } catch {}
    }
  }
  const publish = () => {
    if (!current) return
    const usage = { session: Number(current.session.toFixed(4)), last: Number(current.last.toFixed(4)), lastAt: current.lastAt, unit: 'credits' }
    const signature = JSON.stringify([usage, current.modelId])
    if (signature === published) return
    published = signature
    updateBoard(root, state => {
      state.usage = { ...(state.usage || {}), kiro: usage }
      if (current.modelId) state.models = { ...(state.models || {}), kiro: current.modelId.slice(0, 100) }
    })
  }
  const tick = () => {
    if (stopped) return
    try { tail(); publish() } catch {}
  }

  try { refreshSession() } catch {}
  tick()
  const discovery = setInterval(() => { if (!stopped) { try { refreshSession() } catch {} tick() } }, 5000)
  const timer = setInterval(tick, 1500)
  discovery.unref?.()
  timer.unref?.()
  return { dispose() { stopped = true; clearInterval(discovery); clearInterval(timer) } }
}

// Every 10 s, checks whether Kiro, Codex and Copilot are running so the dashboard can tell an idle
// agent (open, quiet) from one that is not running at all. Writes only when something changes,
// plus a refresh every 30 s so readers can tell the result is current.
function startPresenceBridge(root, runningInKiro) {
  const { execFile } = require('child_process')
  const copilotSessions = path.join(os.homedir(), '.copilot', 'session-state')
  let stopped = false
  let published = ''
  let lastWrite = 0

  const copilotRecentlyActive = () => {
    try {
      for (const session of fs.readdirSync(copilotSessions, { withFileTypes: true })) {
        if (!session.isDirectory()) continue
        try { if (Date.now() - fs.statSync(path.join(copilotSessions, session.name, 'events.jsonl')).mtimeMs < 120000) return true } catch {}
      }
    } catch {}
    return false
  }
  const publish = processNames => {
    if (stopped) return
    const has = pattern => processNames.some(name => pattern.test(name))
    const presence = {
      kiro: runningInKiro || has(/^kiro(\.exe)?$/),
      codex: has(/^codex(\.exe)?$/),
      copilot: has(/^copilot(-runtime)?(\.exe)?$/) || copilotRecentlyActive(),
    }
    const signature = JSON.stringify(presence)
    const now = Date.now()
    if (signature === published && now - lastWrite < 30000) return
    published = signature
    lastWrite = now
    updateBoard(root, state => { state.presence = { ...presence, at: now } })
  }
  const check = () => {
    if (stopped) return
    const options = { windowsHide: true, timeout: 8000, maxBuffer: 8 * 1024 * 1024 }
    if (process.platform === 'win32') {
      execFile('tasklist', ['/fo', 'csv', '/nh'], options, (error, stdout) => {
        if (error) return
        publish(String(stdout).split(/\r?\n/).map(line => line.split('","')[0].replace(/^"/, '').toLowerCase()).filter(Boolean))
      })
    } else {
      execFile('ps', ['-A', '-o', 'comm='], options, (error, stdout) => {
        if (error) return
        publish(String(stdout).split('\n').map(line => path.basename(line.trim()).toLowerCase()).filter(Boolean))
      })
    }
  }

  check()
  const timer = setInterval(check, 10000)
  timer.unref?.()
  return { dispose() { stopped = true; clearInterval(timer) } }
}

function startCopilotEventBridge(root) {
  const sessionsRoot = path.join(os.homedir(), '.copilot', 'session-state')
  const offsets = new Map()
  const bridgeStartedAt = Date.now()
  let latestModelTime = 0
  let stopped = false

  const processFile = (file) => {
    let stat
    try { stat = fs.statSync(file) } catch { return }
    let offset = offsets.get(file)
    // Sessions that already existed when the editor started are read from their end, so reloading
    // does not replay old events with the current time. New session files are read from the start.
    if (offset === undefined) {
      offset = stat.birthtimeMs >= bridgeStartedAt ? 0 : stat.size
      offsets.set(file, offset)
    }
    if (stat.size < offset) offset = 0
    if (stat.size === offset) return

    let chunk
    try {
      const handle = fs.openSync(file, 'r')
      const buffer = Buffer.alloc(stat.size - offset)
      fs.readSync(handle, buffer, 0, buffer.length, offset)
      fs.closeSync(handle)
      chunk = buffer.toString('utf8')
    } catch { return }

    const lines = chunk.split(/\r?\n/)
    if (lines[lines.length - 1] !== '') {
      offsets.set(file, offset + Buffer.byteLength(lines.pop() || '', 'utf8'))
    } else {
      offsets.set(file, stat.size)
      lines.pop()
    }
    for (const line of lines) {
      if (!line.trim()) continue
      try { recordCopilotEvent(root, JSON.parse(line), () => latestModelTime, value => { latestModelTime = value }) } catch {}
    }
  }

  const scan = () => {
    if (stopped || !fs.existsSync(sessionsRoot)) return
    let sessions
    try { sessions = fs.readdirSync(sessionsRoot, { withFileTypes: true }) } catch { return }
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const file = path.join(sessionsRoot, session.name, 'events.jsonl')
      if (fs.existsSync(file)) processFile(file)
    }
  }

  scan()
  const timer = setInterval(scan, 800)
  timer.unref?.()
  return {
    dispose() {
      stopped = true
      clearInterval(timer)
    },
  }
}

function recordCopilotEvent(root, event, getLatestModelTime, setLatestModelTime) {
  const model = event.model || event.data?.model
  const eventTime = Date.parse(event.timestamp || '') || 0
  if (typeof model === 'string' && model.trim() && eventTime >= getLatestModelTime()) {
    setLatestModelTime(eventTime)
    setBoardModel(root, model, 'COPILOT')
  }

  const type = String(event.type || '')
  const data = event.data || {}
  const stateFile = commandMeshStateFile(root)
  if (type === 'user.message') {
    const prompt = redact(data.content || data.transformedContent || '')
    if (prompt) appendCopilotEntry(stateFile, {
      ...(event.id ? { id: `copilot-msg-${String(event.id).slice(0, 80)}` } : {}),
      provider: 'copilot',
      station: 'you',
      label: firstLine(prompt, 'new message'),
      detail: { kind: 'User prompt', content: prompt },
      status: 'ok',
      startedAt: Date.now(),
      endedAt: Date.now(),
    })
    return
  }
  if (type !== 'tool.execution_start' && type !== 'tool.execution_complete') return
  const tool = String(data.toolName || data.tool_name || 'tool').trim().slice(0, 80)
  const station = classifyCopilotTool(tool)
  return withStateLock(stateFile, () => recordCopilotToolLocked(stateFile, event, data, tool, station))
}

function recordCopilotToolLocked(stateFile, event, data, tool, station) {
  const type = String(event.type || '')
  const state = readState(stateFile)
  if (!state) return
  const now = Date.now()
  const toolCallId = String(data.toolCallId || event.toolCallId || '')
  if (type === 'tool.execution_complete' && toolCallId) {
    const active = [...(state.entries || [])].reverse().find(entry => entry.id === toolCallId && entry.status === 'run')
    if (active) {
      active.status = data.success === false ? 'err' : 'ok'
      active.endedAt = now
      active.detail = { ...(active.detail || {}), result: data.success === false ? 'Failed' : 'Completed' }
      writeState(stateFile, state)
      return
    }
  }
  if (toolCallId && (state.entries || []).some(existing => existing.id === toolCallId)) return
  const entry = {
    id: toolCallId || `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    provider: 'copilot',
    station,
    label: tool,
    detail: toolDetail(tool, data),
    status: type === 'tool.execution_start' ? 'run' : data.success === false ? 'err' : 'ok',
    startedAt: now,
    ...(type === 'tool.execution_start' ? {} : { endedAt: now }),
  }
  state.entries = [...(state.entries || []), entry].slice(-80)
  state.counts = { ...(state.counts || {}), [station]: (state.counts?.[station] || 0) + 1 }
  writeState(stateFile, state)
}

function appendCopilotEntry(stateFile, entry) {
  return withStateLock(stateFile, () => appendCopilotEntryLocked(stateFile, entry))
}

function appendCopilotEntryLocked(stateFile, entry) {
  const state = readState(stateFile)
  if (!state) return
  // Same event id already on the board means another reader recorded it: skip the duplicate.
  if (entry.id && (state.entries || []).some(existing => existing.id === entry.id)) return
  const complete = { id: entry.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, ...entry }
  state.entries = [...(state.entries || []), complete].slice(-80)
  state.counts = { ...(state.counts || {}), [complete.station]: (state.counts?.[complete.station] || 0) + 1 }
  writeState(stateFile, state)
}

function startCodexEventBridge(root) {
  const sessionsRoot = path.join(os.homedir(), '.codex', 'sessions')
  const sessions = new Map()
  const bridgeStartedAt = Date.now()
  let stopped = false

  const isWorkspace = value => {
    if (typeof value !== 'string' || !value.trim()) return false
    try { return path.resolve(value).toLowerCase() === path.resolve(root).toLowerCase() } catch { return false }
  }
  const readChunk = (file, offset, size) => {
    try {
      const handle = fs.openSync(file, 'r')
      const buffer = Buffer.alloc(Math.max(0, size - offset))
      fs.readSync(handle, buffer, 0, buffer.length, offset)
      fs.closeSync(handle)
      return buffer.toString('utf8')
    } catch { return '' }
  }
  const prime = (file, stat) => {
    const session = { offset: stat.size, matches: false }
    const start = Math.max(0, stat.size - 262144)
    for (const line of readChunk(file, start, stat.size).split(/\r?\n/)) {
      try {
        const event = JSON.parse(line)
        if (event.type !== 'turn_context') continue
        const payload = event.payload || {}
        session.matches = isWorkspace(payload.cwd)
        if (session.matches && typeof payload.model === 'string') setBoardModel(root, payload.model, 'CODEX')
      } catch {}
    }
    sessions.set(file, session)
  }
  const processFile = file => {
    let stat
    try { stat = fs.statSync(file) } catch { return }
    let session = sessions.get(file)
    if (!session) {
      if (stat.birthtimeMs >= bridgeStartedAt - 1000) {
        session = { offset: 0, matches: false }
        sessions.set(file, session)
      } else {
        prime(file, stat)
        return
      }
    }
    if (stat.size < session.offset) session.offset = 0
    if (stat.size === session.offset) return
    const chunk = readChunk(file, session.offset, stat.size)
    if (!chunk) return
    const lines = chunk.split(/\r?\n/)
    const tail = lines.pop() || ''
    session.offset += Buffer.byteLength(chunk, 'utf8') - Buffer.byteLength(tail, 'utf8')
    for (const line of lines) {
      if (!line.trim()) continue
      try { recordCodexEvent(root, session, JSON.parse(line), isWorkspace) } catch {}
    }
  }
  const scan = () => {
    if (stopped || !fs.existsSync(sessionsRoot)) return
    const pending = [sessionsRoot]
    while (pending.length) {
      const directory = pending.pop()
      let items
      try { items = fs.readdirSync(directory, { withFileTypes: true }) } catch { continue }
      for (const item of items) {
        const itemPath = path.join(directory, item.name)
        if (item.isDirectory()) pending.push(itemPath)
        else if (item.isFile() && item.name.endsWith('.jsonl')) processFile(itemPath)
      }
    }
  }

  scan()
  const timer = setInterval(scan, 600)
  timer.unref?.()
  return { dispose() { stopped = true; clearInterval(timer) } }
}

function recordCodexEvent(root, session, event, isWorkspace) {
  const payload = event.payload || {}
  if (event.type === 'turn_context') {
    session.matches = isWorkspace(payload.cwd)
    if (session.matches && typeof payload.model === 'string') setBoardModel(root, payload.model, 'CODEX')
    return
  }
  if (!session.matches) return
  const stateFile = commandMeshStateFile(root)
  const now = Date.parse(event.timestamp || '') || Date.now()
  if (event.type === 'event_msg' && payload.type === 'task_started') {
    const turnId = String(payload.turn_id || payload.root_turn_id || now)
    appendCopilotEntry(stateFile, { id: `codex-you-${turnId}`, provider: 'codex', station: 'you', label: 'new Codex message', detail: { kind: 'ChatGPT / Codex turn' }, status: 'ok', startedAt: now, endedAt: now })
    appendCopilotEntry(stateFile, { id: `codex-turn-${turnId}`, provider: 'codex', station: 'model', label: 'Codex working', detail: { kind: 'ChatGPT / Codex turn' }, status: 'run', startedAt: now })
    return
  }
  if (event.type === 'event_msg' && payload.type === 'task_complete') {
    const turnId = String(payload.turn_id || payload.root_turn_id || '')
    completeCodexEntry(stateFile, `codex-turn-${turnId}`, 'ok', now)
    return
  }
  if (event.type !== 'response_item') return
  if (payload.type === 'custom_tool_call' || payload.type === 'function_call') {
    const tool = String(payload.name || 'tool').trim().slice(0, 80)
    const callId = String(payload.call_id || payload.id || now)
    const input = typeof payload.input === 'string' ? payload.input : ''
    const station = classifyCodexTool(tool, input)
    appendCopilotEntry(stateFile, { id: `codex-tool-${callId}`, provider: 'codex', station, label: codexToolLabel(tool, station), detail: { kind: 'Codex tool call', tool }, status: 'run', startedAt: now })
    return
  }
  if (payload.type === 'custom_tool_call_output' || payload.type === 'function_call_output') {
    const callId = String(payload.call_id || payload.id || '')
    if (callId) completeCodexEntry(stateFile, `codex-tool-${callId}`, 'ok', now)
  }
}

function classifyCodexTool(name, input) {
  const lower = `${name} ${input}`.toLowerCase()
  if (/(spawn_agent|followup_task|send_message|wait_agent|collaboration\.)/.test(lower)) return 'agents'
  if (/(skill\.md|[\\/]skills[\\/])/.test(lower)) return 'skills'
  if (/(playwright-cli|cua_repl|createbrowsertab|gettab\s*\()/.test(lower)) return 'browser'
  if (/(web__run|tools\.web|search_query|image_query|web_fetch|fetch\s*\()/.test(lower)) return 'web'
  if (/(command-mesh-(?:copilot-)?hook|lot-map-(?:copilot-)?hook|[\\/]hook\.js)/.test(lower)) return 'hooks'
  if (/(memory|remember|recall)/.test(lower)) return 'memory'
  if (/(apply_patch|read|write|edit|file|glob|grep)/.test(lower)) return 'files'
  if (/(shell|terminal|command|bash|powershell|exec|run)/.test(lower)) return 'shell'
  return 'model'
}

function codexToolLabel(tool, station) {
  if (station === 'web') return 'web request'
  if (station === 'browser') return 'browser automation'
  if (station === 'skills') return 'skill loaded'
  if (station === 'hooks') return 'telemetry hook'
  return tool
}

function completeCodexEntry(stateFile, id, status, endedAt) {
  return withStateLock(stateFile, () => completeCodexEntryLocked(stateFile, id, status, endedAt))
}

function completeCodexEntryLocked(stateFile, id, status, endedAt) {
  const state = readState(stateFile)
  if (!state) return
  const active = [...(state.entries || [])].reverse().find(entry => entry.id === id && entry.status === 'run')
  if (!active) return
  active.status = status
  active.endedAt = endedAt
  writeState(stateFile, state)
}

function toolDetail(tool, data) {
  const args = data.arguments || data.input || data.parameters
  const detail = { kind: 'Tool call', tool }
  if (typeof args === 'string') detail.arguments = redact(args)
  else if (args && typeof args === 'object') {
    const safe = {}
    for (const [key, value] of Object.entries(args).slice(0, 12)) safe[key] = redact(typeof value === 'string' ? value : JSON.stringify(value))
    detail.arguments = safe
  }
  return detail
}

function redact(value) {
  return String(value || '')
    .replace(/<memories>[\s\S]*?<\/memories>/gi, '')
    .replace(/<system_reminder>[\s\S]*?<\/system_reminder>/gi, '')
    .replace(/<current_datetime>[\s\S]*?<\/current_datetime>/gi, '')
    .replace(/(token|secret|password|api[_-]?key|authorization)(\s*[:=]\s*)([^\s,}"']+)/gi, '$1$2[REDACTED]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 600)
}

function firstLine(value, fallback) {
  const line = String(value || '').split(/\s+/).join(' ').trim()
  return line.slice(0, 100) || fallback
}

function setBoardModel(root, model, provider) {
  const stateFile = commandMeshStateFile(root)
  return withStateLock(stateFile, () => setBoardModelLocked(stateFile, model, provider))
}

function setBoardModelLocked(stateFile, model, provider) {
  const state = readState(stateFile)
  if (!state) return
  state.model = String(model).replace(/[\r\n]+/g, ' ').slice(0, 100)
  if (provider) {
    state.provider = provider
    const providerKey = normalizeProvider(provider)
    if (providerKey) state.models = { ...(state.models || {}), [providerKey]: state.model }
  }
  writeState(stateFile, state)
}

function normalizeProvider(provider) {
  const value = String(provider || '').toLowerCase()
  if (value.includes('copilot')) return 'copilot'
  if (value.includes('codex') || value.includes('chatgpt')) return 'codex'
  if (value.includes('kiro')) return 'kiro'
  return ''
}

// Atomic replace with retries. Windows rename fails while another process has the file open,
// so retry, never leave a temp file behind, and never let telemetry throw into the editor.
function writeState(stateFile, state) {
  const serialized = JSON.stringify(state)
  try { fs.mkdirSync(path.dirname(stateFile), { recursive: true }) } catch {}
  for (let attempt = 0; attempt < 4; attempt++) {
    const temporary = `${stateFile}.${process.pid}.${Date.now()}.${attempt}.tmp`
    try {
      fs.writeFileSync(temporary, serialized)
      fs.renameSync(temporary, stateFile)
      return
    } catch {
      try { fs.unlinkSync(temporary) } catch {}
    }
  }
  // Never fall back to writing in place: a half-written state.json is what readers see as corrupt.
  // Dropping one event is better than wiping the board.
}

function classifyCopilotTool(name) {
  const lower = name.toLowerCase()
  if (/(read|write|edit|file|glob|grep)/.test(lower)) return 'files'
  if (/(browser|navigate|search|fetch|http|web)/.test(lower)) return 'web'
  if (/(agent|subagent)/.test(lower)) return 'agents'
  if (/(memory|remember|recall)/.test(lower)) return 'memory'
  if (/(shell|terminal|command|bash|powershell|exec|run)/.test(lower)) return 'shell'
  return 'model'
}

function recordWorkspaceFiles(action, uris) {
  if (uris.length === 0) return
  const stateFile = stateFileFor(uris[0])
  const now = Date.now()
  const folder = vscode.workspace.getWorkspaceFolder(uris[0])
  if (!folder) return
  const entries = []
  for (const uri of uris.slice(0, 20)) {
    const relative = path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, '/')
    entries.push({
      id: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      station: 'files',
      label: `${action} ${relative.split('/').slice(-2).join('/')}`.slice(0, 100),
      status: 'ok',
      startedAt: now,
      endedAt: now,
    })
  }
  appendEntries(stateFile, entries)
}

function recordShell(status, commandLine) {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) return
  const stateFile = commandMeshStateFile(folder.uri.fsPath)
  return withStateLock(stateFile, () => recordShellLocked(stateFile, status, commandLine))
}

function recordShellLocked(stateFile, status, commandLine) {
  const command = String(commandLine || 'terminal').split(/\s+/)[0].slice(0, 90)
  if (status !== 'run') {
    // Close the oldest open run of the same command instead of adding a second entry.
    const state = readState(stateFile)
    if (!state) return
    const open = (state.entries || []).find(entry => entry.station === 'shell' && entry.status === 'run' && entry.label === `run ${command}`)
    if (open) {
      open.status = status === 'failed' ? 'err' : 'ok'
      open.label = `${status} ${command}`
      open.endedAt = Date.now()
      writeState(stateFile, state)
      return
    }
  }
  appendEntries(stateFile, [{
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    station: 'shell',
    label: `${status} ${command}`,
    status: status === 'failed' ? 'err' : status === 'run' ? 'run' : 'ok',
    startedAt: Date.now(),
    endedAt: status === 'run' ? undefined : Date.now(),
  }])
}

function openMap(context) {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    vscode.window.showErrorMessage('Command Mesh requires an open workspace.')
    return
  }
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside)
    return
  }
  panel = vscode.window.createWebviewPanel('commandMesh', 'Command Mesh', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  })
  panel.webview.html = html(panel.webview, context.extensionUri)
  const stateFile = commandMeshStateFile(folder.uri.fsPath)
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  const send = () => {
    const board = readBoard(folder.uri.fsPath)
    panel?.webview.postMessage({
      type: 'state',
      svg: drawMap(board, Date.now(), rendererSetup),
      state: board,
    })
  }
  send()
  watcher = fs.watch(path.dirname(stateFile), { persistent: false }, send)
  panelRefreshTimer = setInterval(send, 800)
  panelRefreshTimer.unref?.()
  panel.onDidDispose(() => {
    watcher?.close()
    watcher = undefined
    clearInterval(panelRefreshTimer)
    panelRefreshTimer = undefined
    panel = undefined
  }, null, context.subscriptions)
}

function html(webview, extensionUri) {
  const nonce = String(Date.now())
  return `<!doctype html>
<html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
body{margin:0;padding:16px;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font:12px ui-monospace,SFMono-Regular,Consolas,monospace}
svg{display:block;width:100%;max-height:70vh}.telemetry{border:1px solid var(--vscode-widget-border);border-radius:11px;background:linear-gradient(145deg,var(--vscode-sideBar-background),var(--vscode-editor-background));padding:12px;margin-top:8px;box-shadow:0 10px 24px #0004}.telemetry-head{display:flex;justify-content:space-between;margin-bottom:9px}.eyebrow{opacity:.65;font-size:9px;letter-spacing:.16em}.model{color:#e1ac6e}.kpis{display:grid;grid-template-columns:repeat(8,1fr);gap:6px}.kpi{background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:7px;min-width:0;cursor:pointer}.kpi:hover,.kpi.active{border-color:#c79d6d}.kpi b{display:block;color:#e1ac6e;font-size:15px;margin-top:3px}.kpi span{opacity:.6;font-size:9px;text-transform:uppercase;letter-spacing:.08em}.spark{height:27px;display:flex;align-items:end;gap:2px;margin:11px 0 7px;padding:0 2px;border-bottom:1px solid var(--vscode-widget-border)}.bar{flex:1;background:linear-gradient(#c79d6d,#6d5139);border-radius:3px 3px 0 0;min-height:2px}.route{color:#c5a77d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.now{border-top:1px solid var(--vscode-widget-border);margin-top:9px;padding-top:8px}.detail{border-top:1px solid var(--vscode-widget-border);margin-top:9px;padding-top:8px}.detail-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.detail-card{background:var(--vscode-editor-background);border-radius:5px;padding:6px}.detail-card span{opacity:.6;font-size:9px;text-transform:uppercase}.detail-card b{display:block;color:#e1ac6e;margin-top:3px}.topops{margin-top:7px;opacity:.75}.feed{margin-top:7px;line-height:1.5;max-height:120px;overflow:auto}.row{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.72}.run{color:#e1ac6e;opacity:1}.err{color:#e8654f;opacity:1}.dim{opacity:.65}.head{display:flex;justify-content:space-between;margin-bottom:8px}.title{font-weight:600}@media(max-width:600px){.kpis,.detail-grid{grid-template-columns:repeat(3,1fr)}}
${dashboardCss}</style></head><body><div class="head"><span class="title">Command Mesh</span><span id="summary" class="dim"></span></div><div id="map"></div><div id="dashboard" class="telemetry"></div>
<script nonce="${nonce}">
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
function formatDuration(ms){const s=Math.floor(ms/1000);return s<60?s+'s':Math.floor(s/60)+'m '+s%60+'s'}
const PROV=['copilot','codex','kiro']
function stackBar(list,max,h){const segs=PROV.map(p=>{const n=list.filter(x=>(x.provider||'copilot')===p).length;return n?'<b class="seg '+p+'" style="flex:'+n+'"></b>':''}).join('');return '<i class="bar" style="height:'+Math.max(2,Math.round(list.length/max*h))+'px">'+segs+'</i>'}
function modelsHtml(state){const m=state.models||{},parts=PROV.filter(p=>m[p]).map(p=>'<span class="m '+p+'"><b>'+p.toUpperCase()+'</b>'+esc(m[p])+'</span>');return parts.length?'<span class="models">'+parts.join('')+'</span>':'<span class="model">model pending</span>'}
function creditsKpi(state){const u=state.usage&&state.usage.kiro;return '<div class="kpi"><span>Kiro credits</span><b class="credits">'+(u?Number(u.session).toFixed(2):'--')+'</b></div>'}
let filter='all',lastMessage
function bindMapFilters(redraw){const map=document.getElementById('map'),sync=()=>map.querySelectorAll('[data-station]').forEach(card=>{const selected=filter===card.dataset.station;card.classList.toggle('selected',selected);card.setAttribute('aria-pressed',String(selected))}),activate=card=>{if(!card)return;filter=filter===card.dataset.station?'all':card.dataset.station;redraw()};map.addEventListener('click',event=>activate(event.target.closest?.('[data-station]')));map.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const card=event.target.closest?.('[data-station]');if(!card)return;event.preventDefault();activate(card)});new MutationObserver(sync).observe(map,{childList:true});sync()}
function detailHtml(all){const selected=filter==='all'?all:filter==='run'?all.filter(x=>x.status==='run'):filter==='ok'?all.filter(x=>x.status==='ok'):filter==='err'?all.filter(x=>x.status==='err'||x.status==='block'):all.filter(x=>x.station===filter),dur=selected.filter(x=>x.endedAt).map(x=>x.endedAt-x.startedAt),avg=dur.length?Math.round(dur.reduce((a,b)=>a+b,0)/dur.length):0,good=selected.filter(x=>x.status==='ok').length,labels={};selected.forEach(x=>labels[x.label]=(labels[x.label]||0)+1);const top=Object.entries(labels).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>esc(x[0])+' ×'+x[1]).join(' · ')||'No activity';return '<div class="detail"><div class="detail-grid"><div class="detail-card"><span>Selected</span><b>'+esc(filter==='all'?'Entire session':filter)+'</b></div><div class="detail-card"><span>Success</span><b>'+(selected.length?Math.round(good/selected.length*100):0)+'%</b></div><div class="detail-card"><span>Avg duration</span><b>'+formatDuration(avg)+'</b></div><div class="detail-card"><span>Latest</span><b>'+formatDuration(selected.length?Date.now()-selected[selected.length-1].startedAt:0)+' ago</b></div></div><div class="topops">TOP OPERATIONS&nbsp;&nbsp;'+top+'</div></div>'}
function render(message){lastMessage=message;document.getElementById('map').innerHTML=message.svg;const all=message.state.entries||[],e=filter==='all'?all:filter==='run'?all.filter(x=>x.status==='run'):filter==='ok'?all.filter(x=>x.status==='ok'):filter==='err'?all.filter(x=>x.status==='err'||x.status==='block'):all.filter(x=>x.station===filter),now=Date.now(),first=all[0]?.startedAt||now,running=all.filter(x=>x.status==='run'),done=all.filter(x=>x.status==='ok'),errors=all.filter(x=>x.status==='err'||x.status==='block'),files=all.filter(x=>x.station==='files').length,shell=all.filter(x=>x.station==='shell').length,rate=Math.round(all.length/Math.max(1,(now-first)/60000)),route=[];all.slice(-12).forEach(x=>{if(route[route.length-1]!==x.station)route.push(x.station)});const buckets=Array.from({length:24},(_,i)=>all.filter(x=>now-x.startedAt>=i*60000&&now-x.startedAt<(i+1)*60000)),max=Math.max(1,...buckets.map(l=>l.length)),bars=buckets.reverse().map(l=>stackBar(l,max,25)).join(''),last=e[e.length-1];document.getElementById('summary').textContent=last?.label||'Nothing is running.';document.getElementById('dashboard').innerHTML='<div class="telemetry-head"><span class="eyebrow">LIVE TELEMETRY</span>'+modelsHtml(message.state)+'</div><div class="kpis"><div class="kpi '+(filter==='all'?'active':'')+'" data-filter="all"><span>Events</span><b>'+all.length+'</b></div><div class="kpi '+(filter==='run'?'active':'')+'" data-filter="run"><span>Active</span><b>'+running.length+'</b></div><div class="kpi '+(filter==='ok'?'active':'')+'" data-filter="ok"><span>Done</span><b>'+done.length+'</b></div><div class="kpi '+(filter==='files'?'active':'')+'" data-filter="files"><span>Files</span><b>'+files+'</b></div><div class="kpi '+(filter==='shell'?'active':'')+'" data-filter="shell"><span>Shell</span><b>'+shell+'</b></div><div class="kpi '+(filter==='err'?'active':'')+'" data-filter="err"><span>Errors</span><b class="'+(errors.length?'err':'')+'">'+errors.length+'</b></div><div class="kpi"><span>Rate</span><b>'+rate+'/min</b></div>'+creditsKpi(message.state)+'</div><div class="spark">'+bars+'</div><div class="route">ROUTE&nbsp;&nbsp;'+(route.length?route.map(esc).join(' → '):'No activity yet')+'</div><div class="now">'+(last?(last.status==='run'?'●':'✓')+' NOW&nbsp;&nbsp;'+esc(last.station)+' · '+esc(last.label):'Waiting for activity')+'</div>'+detailHtml(all)+'<div class="feed">'+e.slice(-8).reverse().map(x=>'<div class="row '+(x.status||'')+'" data-provider="'+esc(x.provider||'')+'">'+(x.status==='run'?'●':x.status==='ok'?'·':'✕')+' '+esc(x.station)+'  '+esc(x.label)+'</div>').join('')+'</div>';document.querySelectorAll('[data-filter]').forEach(x=>x.onclick=()=>{filter=x.dataset.filter;render(lastMessage)})}
bindMapFilters(()=>render(lastMessage))
window.addEventListener('message',e=>{if(e.data.type==='state')render(e.data)})
</script></body></html>`
}

function deactivate() {
  watcher?.close()
  clearInterval(panelRefreshTimer)
  diskWatcher?.close()
  copilotBridge?.dispose()
  codexBridge?.dispose()
  kiroUsageBridge?.dispose()
  presenceBridge?.dispose()
  webServer?.close()
}
module.exports = { activate, deactivate }
