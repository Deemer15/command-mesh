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

function readBoard(root) {
  const stateFile = commandMeshStateFile(root)
  let state = { entries: [], counts: {} }
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch {}
  return {
    ...state,
    entries: (state.entries || []).map(entry => ({
      from: 'core',
      ...entry,
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
  let paused=false,filter='all',latestState,latestSvg='',selectedId='',minuteFilter=null;
  function bindMapFilters(redraw){const map=document.querySelector('#map'),sync=()=>map.querySelectorAll('[data-station]').forEach(card=>{const selected=filter===card.dataset.station;card.classList.toggle('selected',selected);card.setAttribute('aria-pressed',String(selected))}),activate=card=>{if(!card)return;filter=filter===card.dataset.station?'all':card.dataset.station;selectedId='';redraw()};map.addEventListener('click',event=>activate(event.target.closest?.('[data-station]')));map.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const card=event.target.closest?.('[data-station]');if(!card)return;event.preventDefault();activate(card)});new MutationObserver(sync).observe(map,{childList:true});sync()}
  function bindEventDisclosures(redraw){let feedScrollTop=0;const dashboard=document.querySelector('#dashboard'),decorate=()=>{const rows=dashboard.querySelectorAll('.row[data-id]');rows.forEach(row=>{const expanded=selectedId===row.dataset.id;row.classList.toggle('expanded',expanded);row.setAttribute('role','button');row.setAttribute('tabindex','0');row.setAttribute('aria-expanded',String(expanded));let toggle=row.querySelector('.row-toggle');if(!toggle){toggle=document.createElement('span');toggle.className='row-toggle';toggle.setAttribute('aria-hidden','true');row.prepend(toggle)}const symbol=expanded?'−':'+';if(toggle.textContent!==symbol)toggle.textContent=symbol});const row=dashboard.querySelector('.row.expanded'),inspector=dashboard.querySelector('.inspector');if(row&&inspector&&inspector.previousElementSibling!==row)row.after(inspector);const feed=dashboard.querySelector('.feed');if(feed&&Math.abs(feed.scrollTop-feedScrollTop)>1)feed.scrollTop=feedScrollTop},activate=event=>{const row=event.target.closest?.('.row[data-id]');if(!row)return;event.preventDefault();event.stopImmediatePropagation();selectedId=selectedId===row.dataset.id?'':row.dataset.id;redraw()};dashboard.addEventListener('scroll',event=>{if(event.target.matches?.('.feed'))feedScrollTop=event.target.scrollTop},true);dashboard.addEventListener('click',activate,true);dashboard.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;activate(event)},true);new MutationObserver(decorate).observe(dashboard,{childList:true,subtree:true});decorate()}
  function bindActivityTimeline(redraw){const dashboard=document.querySelector('#dashboard'),mainFilter=all=>filter==='all'?all:filter==='run'?all.filter(x=>x.status==='run'):filter==='ok'?all.filter(x=>x.status==='ok'):filter==='err'?all.filter(x=>x.status==='err'||x.status==='block'):all.filter(x=>x.station===filter),bucket=(all,minute,now)=>all.filter(x=>{const age=now-x.startedAt;return age>=minute*60000&&age<(minute+1)*60000}),renderFeed=now=>{if(minuteFilter===null)return;const feed=dashboard.querySelector('.feed');if(!feed)return;const visible=bucket(mainFilter(latestState.entries||[]),minuteFilter,now).slice().reverse(),signature=visible.map(x=>x.id).join('|'),current=[...feed.querySelectorAll(':scope > .row[data-id]')].map(x=>x.dataset.id).join('|');if(signature===current&&feed.dataset.minuteSignature===signature)return;feed.dataset.minuteSignature=signature;feed.innerHTML=visible.map(x=>'<div class="row '+(x.status||'')+'" data-id="'+esc(x.id)+'">'+(x.status==='run'?'●':x.status==='ok'?'·':'✕')+' '+esc(x.station)+'  '+esc(x.label)+'</div>').join('')||'<div class="timeline-empty">No events in this minute</div>'},decorate=()=>{const spark=dashboard.querySelector('.spark');if(!spark)return;let head=spark.previousElementSibling;if(!head?.classList.contains('spark-head')){head=document.createElement('div');head.className='spark-head';head.innerHTML='<span>ACTIVITY · LAST 24 MINUTES</span><span class="spark-selection">24M AGO&nbsp;&nbsp;→&nbsp;&nbsp;NOW</span>';spark.before(head)}const now=Date.now(),bars=[...spark.querySelectorAll('.bar')];bars.forEach((bar,index)=>{const minute=bars.length-1-index,count=bucket(latestState.entries||[],minute,now).length,end=new Date(now-minute*60000),start=new Date(now-(minute+1)*60000),time=d=>d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});bar.dataset.minute=String(minute);bar.dataset.count=String(count);bar.classList.toggle('active',minuteFilter===minute);bar.setAttribute('role','button');bar.setAttribute('tabindex','0');bar.setAttribute('aria-pressed',String(minuteFilter===minute));bar.setAttribute('aria-label',count+' events from '+time(start)+' to '+time(end));bar.title=count+' event'+(count===1?'':'s')+' · '+time(start)+'–'+time(end)});const selectedCount=minuteFilter===null?0:bucket(mainFilter(latestState.entries||[]),minuteFilter,now).length;head.querySelector('.spark-selection').textContent=minuteFilter===null?'24M AGO  →  NOW':(minuteFilter===0?'CURRENT MINUTE':minuteFilter+'–'+(minuteFilter+1)+' MIN AGO')+' · '+selectedCount+' EVENT'+(selectedCount===1?'':'S');renderFeed(now)},activate=bar=>{if(!bar)return;const minute=Number(bar.dataset.minute);minuteFilter=minuteFilter===minute?null:minute;selectedId='';redraw()};dashboard.addEventListener('click',event=>{if(event.target.closest?.('#reset')){minuteFilter=null;return}activate(event.target.closest?.('.bar[data-minute]'))},true);dashboard.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const bar=event.target.closest?.('.bar[data-minute]');if(!bar)return;event.preventDefault();activate(bar)},true);new MutationObserver(decorate).observe(dashboard,{childList:true});decorate()}
  function inspector(entry){if(!entry)return '';const detail=entry.detail||{};return '<div class="inspector"><h3>'+esc(detail.kind||'Event')+' · '+esc(entry.label)+'</h3><pre>'+esc(JSON.stringify({station:entry.station,status:entry.status,startedAt:new Date(entry.startedAt).toISOString(),endedAt:entry.endedAt?new Date(entry.endedAt).toISOString():undefined,duration:entry.endedAt?formatDuration(entry.endedAt-entry.startedAt):'running',...detail},null,2))+'</pre></div>'}
  function detailHtml(all){const selected=filter==='all'?all:filter==='run'?all.filter(x=>x.status==='run'):filter==='ok'?all.filter(x=>x.status==='ok'):filter==='err'?all.filter(x=>x.status==='err'||x.status==='block'):all.filter(x=>x.station===filter),dur=selected.filter(x=>x.endedAt).map(x=>x.endedAt-x.startedAt),avg=dur.length?Math.round(dur.reduce((a,b)=>a+b,0)/dur.length):0,good=selected.filter(x=>x.status==='ok').length,labels={};selected.forEach(x=>labels[x.label]=(labels[x.label]||0)+1);const top=Object.entries(labels).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>esc(x[0])+' ×'+x[1]).join(' · ')||'No activity';return '<div class="detail"><div class="detail-grid"><div class="detail-card"><span>Selected</span><b>'+esc(filter==='all'?'Entire session':filter)+'</b></div><div class="detail-card"><span>Success</span><b>'+ (selected.length?Math.round(good/selected.length*100):0)+'%</b></div><div class="detail-card"><span>Avg duration</span><b>'+formatDuration(avg)+'</b></div><div class="detail-card"><span>Latest</span><b>'+formatDuration(selected.length?Date.now()-selected[selected.length-1].startedAt:0)+' ago</b></div></div><div class="topops">TOP OPERATIONS&nbsp;&nbsp;'+top+'</div></div>'}
  function dashboard(state){latestState=state;const all=state.entries||[],e=filter==='all'?all:filter==='run'?all.filter(x=>x.status==='run'):filter==='ok'?all.filter(x=>x.status==='ok'):filter==='err'?all.filter(x=>x.status==='err'||x.status==='block'):all.filter(x=>x.station===filter),now=Date.now(),first=all[0]?.startedAt||now,mins=Math.max(1,(now-first)/60000),running=all.filter(x=>x.status==='run'),done=all.filter(x=>x.status==='ok'),errors=all.filter(x=>x.status==='err'||x.status==='block'),files=all.filter(x=>x.station==='files').length,shell=all.filter(x=>x.station==='shell').length,rate=Math.round(all.length/mins),route=[];all.slice(-12).forEach(x=>{if(route[route.length-1]!==x.station)route.push(x.station)});const buckets=Array.from({length:24},(_,i)=>all.filter(x=>now-x.startedAt>=i*60000&&now-x.startedAt<(i+1)*60000).length),max=Math.max(1,...buckets),bars=buckets.reverse().map(x=>'<i class="bar" style="height:'+Math.max(2,Math.round(x/max*28))+'px"></i>').join(''),last=e[e.length-1],chosen=all.find(x=>x.id===selectedId),summary=last&&last.label?last.label:'Nothing is running.',model=state.model||'model pending',map=document.querySelector('#map');document.querySelector('#summary').textContent=summary;map.style.display='block';map.innerHTML=latestSvg;document.querySelector('#dashboard').innerHTML='<div class="telemetry-head"><span class="eyebrow">LIVE MAP</span><span class="model">'+esc(model)+'</span><span class="controls"><button id="pause">'+(paused?'RESUME':'PAUSE')+'</button><button id="reset">ALL</button></span></div><div class="kpis"><div class="kpi '+(filter==='all'?'active':'')+'" data-filter="all"><span>Events</span><b>'+all.length+'</b></div><div class="kpi '+(filter==='run'?'active':'')+'" data-filter="run"><span>Active</span><b>'+running.length+'</b></div><div class="kpi '+(filter==='ok'?'active':'')+'" data-filter="ok"><span>Done</span><b>'+done.length+'</b></div><div class="kpi '+(filter==='files'?'active':'')+'" data-filter="files"><span>Files</span><b>'+files+'</b></div><div class="kpi '+(filter==='shell'?'active':'')+'" data-filter="shell"><span>Shell</span><b>'+shell+'</b></div><div class="kpi '+(filter==='err'?'active':'')+'" data-filter="err"><span>Errors</span><b class="'+(errors.length?'err':'')+'">'+errors.length+'</b></div><div class="kpi"><span>Rate</span><b>'+rate+'/min</b></div></div><div class="spark">'+bars+'</div><div class="route">ROUTE&nbsp;&nbsp;'+(route.length?route.map(esc).join(' → '):'No activity yet')+'</div><div class="now">'+(last?(last.status==='run'?'●':'✓')+' NOW&nbsp;&nbsp;'+esc(last.station)+' · '+esc(last.label):'Waiting for activity')+'</div>'+detailHtml(all)+inspector(chosen)+'<div class="feed">'+e.slice(-10).reverse().map(x=>'<div class="row '+(x.status||'')+'" data-id="'+esc(x.id)+'">'+(x.status==='run'?'●':x.status==='ok'?'·':'✕')+' '+esc(x.station)+'  '+esc(x.label)+'</div>').join('')+'</div>';document.querySelectorAll('[data-filter]').forEach(x=>x.onclick=()=>{filter=x.dataset.filter;dashboard(latestState)});document.querySelectorAll('[data-id]').forEach(x=>x.onclick=()=>{selectedId=x.dataset.id;dashboard(latestState)});document.querySelector('#pause').onclick=()=>{paused=!paused;dashboard(latestState)};document.querySelector('#reset').onclick=()=>{filter='all';selectedId='';dashboard(latestState)}}
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
  if (folder) {
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
  let state = { entries: [], counts: {} }
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch {}
  const currentProvider = normalizeProvider(state.provider) || 'kiro'
  for (const rawEntry of entries) {
    const entry = { provider: currentProvider, ...rawEntry }
    state.entries = [...(state.entries || []), entry].slice(-80)
    state.counts = { ...(state.counts || {}), [entry.station]: (state.counts?.[entry.station] || 0) + 1 }
  }
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  const serialized = JSON.stringify(state)
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const temporary = `${stateFile}.${process.pid}.${Date.now()}.${attempt}.tmp`
      fs.writeFileSync(temporary, serialized)
      fs.renameSync(temporary, stateFile)
      break
    } catch (error) {
      if (attempt === 3) fs.writeFileSync(stateFile, serialized)
    }
  }
}

function startCopilotEventBridge(root) {
  const sessionsRoot = path.join(os.homedir(), '.copilot', 'session-state')
  const offsets = new Map()
  let latestModelTime = 0
  let stopped = false

  const processFile = (file) => {
    let stat
    try { stat = fs.statSync(file) } catch { return }
    let offset = offsets.get(file)
    if (offset === undefined) offset = Math.max(0, stat.size - 131072)
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
  let state = { entries: [], counts: {} }
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch {}
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
  let state = { entries: [], counts: {} }
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch {}
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
  let state = { entries: [], counts: {} }
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch {}
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
  let state = { entries: [], counts: {} }
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch {}
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

function writeState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  const temporary = `${stateFile}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(state))
  fs.renameSync(temporary, stateFile)
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
  appendEntries(commandMeshStateFile(folder.uri.fsPath), [{
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    station: 'shell',
    label: `${status} ${String(commandLine || 'terminal').split(/\s+/)[0]}`.slice(0, 100),
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
    let state = { entries: [], counts: {} }
    try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch {}
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
svg{display:block;width:100%;max-height:70vh}.telemetry{border:1px solid var(--vscode-widget-border);border-radius:11px;background:linear-gradient(145deg,var(--vscode-sideBar-background),var(--vscode-editor-background));padding:12px;margin-top:8px;box-shadow:0 10px 24px #0004}.telemetry-head{display:flex;justify-content:space-between;margin-bottom:9px}.eyebrow{opacity:.65;font-size:9px;letter-spacing:.16em}.model{color:#e1ac6e}.kpis{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.kpi{background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:7px;min-width:0;cursor:pointer}.kpi:hover,.kpi.active{border-color:#c79d6d}.kpi b{display:block;color:#e1ac6e;font-size:15px;margin-top:3px}.kpi span{opacity:.6;font-size:9px;text-transform:uppercase;letter-spacing:.08em}.spark{height:27px;display:flex;align-items:end;gap:2px;margin:11px 0 7px;padding:0 2px;border-bottom:1px solid var(--vscode-widget-border)}.bar{flex:1;background:linear-gradient(#c79d6d,#6d5139);border-radius:3px 3px 0 0;min-height:2px}.route{color:#c5a77d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.now{border-top:1px solid var(--vscode-widget-border);margin-top:9px;padding-top:8px}.detail{border-top:1px solid var(--vscode-widget-border);margin-top:9px;padding-top:8px}.detail-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.detail-card{background:var(--vscode-editor-background);border-radius:5px;padding:6px}.detail-card span{opacity:.6;font-size:9px;text-transform:uppercase}.detail-card b{display:block;color:#e1ac6e;margin-top:3px}.topops{margin-top:7px;opacity:.75}.feed{margin-top:7px;line-height:1.5;max-height:120px;overflow:auto}.row{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.72}.run{color:#e1ac6e;opacity:1}.err{color:#e8654f;opacity:1}.dim{opacity:.65}.head{display:flex;justify-content:space-between;margin-bottom:8px}.title{font-weight:600}@media(max-width:600px){.kpis,.detail-grid{grid-template-columns:repeat(3,1fr)}}
${dashboardCss}</style></head><body><div class="head"><span class="title">Command Mesh</span><span id="summary" class="dim"></span></div><div id="map"></div><div id="dashboard" class="telemetry"></div>
<script nonce="${nonce}">
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
function formatDuration(ms){const s=Math.floor(ms/1000);return s<60?s+'s':Math.floor(s/60)+'m '+s%60+'s'}
let filter='all',lastMessage
function bindMapFilters(redraw){const map=document.getElementById('map'),sync=()=>map.querySelectorAll('[data-station]').forEach(card=>{const selected=filter===card.dataset.station;card.classList.toggle('selected',selected);card.setAttribute('aria-pressed',String(selected))}),activate=card=>{if(!card)return;filter=filter===card.dataset.station?'all':card.dataset.station;redraw()};map.addEventListener('click',event=>activate(event.target.closest?.('[data-station]')));map.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const card=event.target.closest?.('[data-station]');if(!card)return;event.preventDefault();activate(card)});new MutationObserver(sync).observe(map,{childList:true});sync()}
function detailHtml(all){const selected=filter==='all'?all:filter==='run'?all.filter(x=>x.status==='run'):filter==='ok'?all.filter(x=>x.status==='ok'):filter==='err'?all.filter(x=>x.status==='err'||x.status==='block'):all.filter(x=>x.station===filter),dur=selected.filter(x=>x.endedAt).map(x=>x.endedAt-x.startedAt),avg=dur.length?Math.round(dur.reduce((a,b)=>a+b,0)/dur.length):0,good=selected.filter(x=>x.status==='ok').length,labels={};selected.forEach(x=>labels[x.label]=(labels[x.label]||0)+1);const top=Object.entries(labels).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>esc(x[0])+' ×'+x[1]).join(' · ')||'No activity';return '<div class="detail"><div class="detail-grid"><div class="detail-card"><span>Selected</span><b>'+esc(filter==='all'?'Entire session':filter)+'</b></div><div class="detail-card"><span>Success</span><b>'+(selected.length?Math.round(good/selected.length*100):0)+'%</b></div><div class="detail-card"><span>Avg duration</span><b>'+formatDuration(avg)+'</b></div><div class="detail-card"><span>Latest</span><b>'+formatDuration(selected.length?Date.now()-selected[selected.length-1].startedAt:0)+' ago</b></div></div><div class="topops">TOP OPERATIONS&nbsp;&nbsp;'+top+'</div></div>'}
function render(message){lastMessage=message;document.getElementById('map').innerHTML=message.svg;const all=message.state.entries||[],e=filter==='all'?all:filter==='run'?all.filter(x=>x.status==='run'):filter==='ok'?all.filter(x=>x.status==='ok'):filter==='err'?all.filter(x=>x.status==='err'||x.status==='block'):all.filter(x=>x.station===filter),now=Date.now(),first=all[0]?.startedAt||now,running=all.filter(x=>x.status==='run'),done=all.filter(x=>x.status==='ok'),errors=all.filter(x=>x.status==='err'||x.status==='block'),files=all.filter(x=>x.station==='files').length,shell=all.filter(x=>x.station==='shell').length,rate=Math.round(all.length/Math.max(1,(now-first)/60000)),route=[];all.slice(-12).forEach(x=>{if(route[route.length-1]!==x.station)route.push(x.station)});const buckets=Array.from({length:24},(_,i)=>all.filter(x=>now-x.startedAt>=i*60000&&now-x.startedAt<(i+1)*60000).length),max=Math.max(1,...buckets),bars=buckets.reverse().map(x=>'<i class="bar" style="height:'+Math.max(2,Math.round(x/max*25))+'px"></i>').join(''),last=e[e.length-1];document.getElementById('summary').textContent=last?.label||'Nothing is running.';document.getElementById('dashboard').innerHTML='<div class="telemetry-head"><span class="eyebrow">LIVE TELEMETRY</span><span class="model">'+esc(message.state.model||'model pending')+'</span></div><div class="kpis"><div class="kpi '+(filter==='all'?'active':'')+'" data-filter="all"><span>Events</span><b>'+all.length+'</b></div><div class="kpi '+(filter==='run'?'active':'')+'" data-filter="run"><span>Active</span><b>'+running.length+'</b></div><div class="kpi '+(filter==='ok'?'active':'')+'" data-filter="ok"><span>Done</span><b>'+done.length+'</b></div><div class="kpi '+(filter==='files'?'active':'')+'" data-filter="files"><span>Files</span><b>'+files+'</b></div><div class="kpi '+(filter==='shell'?'active':'')+'" data-filter="shell"><span>Shell</span><b>'+shell+'</b></div><div class="kpi '+(filter==='err'?'active':'')+'" data-filter="err"><span>Errors</span><b class="'+(errors.length?'err':'')+'">'+errors.length+'</b></div><div class="kpi"><span>Rate</span><b>'+rate+'/min</b></div></div><div class="spark">'+bars+'</div><div class="route">ROUTE&nbsp;&nbsp;'+(route.length?route.map(esc).join(' → '):'No activity yet')+'</div><div class="now">'+(last?(last.status==='run'?'●':'✓')+' NOW&nbsp;&nbsp;'+esc(last.station)+' · '+esc(last.label):'Waiting for activity')+'</div>'+detailHtml(all)+'<div class="feed">'+e.slice(-8).reverse().map(x=>'<div class="row '+(x.status||'')+'">'+(x.status==='run'?'●':x.status==='ok'?'·':'✕')+' '+esc(x.station)+'  '+esc(x.label)+'</div>').join('')+'</div>';document.querySelectorAll('[data-filter]').forEach(x=>x.onclick=()=>{filter=x.dataset.filter;render(lastMessage)})}
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
  webServer?.close()
}
module.exports = { activate, deactivate }
