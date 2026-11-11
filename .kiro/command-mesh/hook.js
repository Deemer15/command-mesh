const fs = require('fs')
const path = require('path')

const root = process.cwd()
const dir = path.join(root, '.kiro', 'command-mesh')
const file = path.join(dir, 'state.json')
const kind = process.argv[2] || 'event'
let input = ''
try { input = fs.readFileSync(0, 'utf8') } catch {}
let event = {}
try { event = JSON.parse(input) } catch {}

const text = (...values) => values.find(value => typeof value === 'string' && value.trim()) || ''
const tool = text(event.toolName, event.tool_name, event.tool, event.name, event.toolUse?.name)
const callId = text(event.toolUseId, event.tool_use_id, event.toolCallId, event.tool_call_id, event.callId, event.toolUse?.id)
const filePath = text(event.file_path, event.filePath, event.path, event.file?.path)
const label = kind === 'file' ? filePath.split(/[\\/]/).slice(-2).join('/') || 'file saved'
  : kind === 'prompt' ? 'new message'
  : kind === 'stop' ? 'answer ready'
  : tool || kind
const station = kind === 'prompt' ? 'you' : kind === 'file' ? 'files' : kind === 'stop' ? 'model' : classify(tool, event)
const failed = event.success === false || event.isError === true || Boolean(event.error)
const now = Date.now()
fs.mkdirSync(dir, { recursive: true })
releaseLockOnExit(acquireLock(`${file}.lock`), `${file}.lock`)
const state = readState(file)
if (!state) process.exit(0)
state.entries = state.entries || []

// A tool's end closes the entry its start opened, so each call is one entry.
const open = kind === 'tool-end' ? findOpenEntry(state.entries, sanitize(label), callId) : undefined
if (kind === 'stop') {
  // The turn is over, so any call whose end event was missed is finished too.
  for (const entry of state.entries) {
    if (entry.source === 'kiro-hook' && entry.status === 'run') {
      entry.status = 'ok'
      entry.endedAt = now
    }
  }
}
if (open) {
  open.status = failed ? 'err' : 'ok'
  open.endedAt = now
} else {
  const entry = {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    provider: 'kiro',
    source: 'kiro-hook',
    station,
    label: sanitize(label),
    status: kind === 'tool-start' ? 'run' : kind === 'tool-end' && failed ? 'err' : 'ok',
    startedAt: now,
    ...(kind === 'tool-start' ? {} : { endedAt: now }),
    ...(kind === 'tool-start' && callId ? { callId: sanitize(callId) } : {}),
  }
  state.entries = [...state.entries, entry].slice(-80)
  state.counts = { ...(state.counts || {}), [station]: (state.counts?.[station] || 0) + 1 }
}
state.provider = 'KIRO'
const model = text(event.model, event.modelName, event.model_name) || modelForSession(event.session_id)
if (model) {
  state.model = sanitize(model)
  state.models = { ...(state.models || {}), kiro: state.model }
}
fs.mkdirSync(dir, { recursive: true })
writeState(file, JSON.stringify(state))

// Prefer an exact call id; otherwise close the oldest open call with the same tool name.
function findOpenEntry(entries, toolLabel, id) {
  const running = entries.filter(entry => entry.source === 'kiro-hook' && entry.status === 'run')
  if (id) {
    const exact = running.find(entry => entry.callId === sanitize(id))
    if (exact) return exact
  }
  return running.find(entry => entry.label === toolLabel)
}

// Writers take turns on state.json.lock so two writers never read the same old board and overwrite each
// other's event. A lock older than 3 s is abandoned; after 2 s of waiting the write goes ahead anyway.
function acquireLock(lockPath) {
  const deadline = Date.now() + 2000
  for (;;) {
    try { fs.closeSync(fs.openSync(lockPath, 'wx')); return true } catch (error) {
      if (error.code !== 'EEXIST') return false
      try { if (Date.now() - fs.statSync(lockPath).mtimeMs > 3000) { fs.unlinkSync(lockPath); continue } } catch {}
      if (Date.now() > deadline) return false
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
    }
  }
}
function releaseLockOnExit(owned, lockPath) {
  if (owned) process.on('exit', () => { try { fs.unlinkSync(lockPath) } catch {} })
}

// Empty board when the file is missing; null when it exists but cannot be parsed (another writer is
// mid-write). Skipping on null keeps a torn read from wiping everyone's counts and models.
function readState(target) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let raw
    try { raw = fs.readFileSync(target, 'utf8') } catch (error) {
      if (error.code === 'ENOENT') return { entries: [], counts: {} }
    }
    if (raw !== undefined) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') return parsed
      } catch {}
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15)
  }
  return null
}

// Atomic replace with retries. Windows rename fails while another process has the file open.
// Never write in place: a half-written file is what other readers see as corrupt.
function writeState(target, serialized) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const temporary = `${target}.${process.pid}.${Date.now()}.${attempt}.tmp`
    try {
      fs.writeFileSync(temporary, serialized)
      fs.renameSync(temporary, target)
      return
    } catch {
      try { fs.unlinkSync(temporary) } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
    }
  }
}

function sanitize(value) { return String(value).replace(/[\r\n]+/g, ' ').slice(0, 100) }

// Kiro's hook payload has no model, but Kiro stores the model per session in
// ~/.kiro/sessions/<workspace hash>/<session id>/session.json as "modelId".
function modelForSession(sessionId) {
  if (!/^[\w-]+$/.test(String(sessionId || ''))) return ''
  try {
    const sessions = path.join(require('os').homedir(), '.kiro', 'sessions')
    for (const hash of fs.readdirSync(sessions)) {
      const file = path.join(sessions, hash, sessionId, 'session.json')
      if (fs.existsSync(file)) return String(JSON.parse(fs.readFileSync(file, 'utf8')).modelId || '')
    }
  } catch {}
  return ''
}
// Classify by tool name only. Tool input can contain words like "file" that say nothing about the tool.
function classify(name) {
  const lower = String(name || '').toLowerCase()
  if (/(read|write|edit|replace|file|glob|grep|list_?dir)/.test(lower)) return 'files'
  if (/(browser|navigate|search|fetch|http|web)/.test(lower)) return 'network'
  if (/(agent|subagent)/.test(lower)) return 'agents'
  if (/(memory|remember|recall)/.test(lower)) return 'memory'
  if (/(shell|terminal|command|bash|powershell|exec|run)/.test(lower)) return 'shell'
  return 'model'
}
