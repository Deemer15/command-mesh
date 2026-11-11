const fs = require('fs')
const path = require('path')

const kind = process.argv[2] || 'event'

// Telemetry must never become a permission gate. Copilot fails closed when a
// preToolUse command exits non-zero, so recording is deliberately best effort.
try { recordTelemetry(kind) } catch {}
if (kind === 'tool-start') {
  process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }))
}

function recordTelemetry(eventKind) {
  let raw = ''
  try { raw = fs.readFileSync(0, 'utf8') } catch {}
  let event = {}
  try { event = JSON.parse(raw) } catch {}

  const value = (...values) => values.find(v => typeof v === 'string' && v.trim()) || ''
  const tool = value(event.toolName, event.tool_name, event.tool, process.env.COPILOT_TOOL_NAME)
  const model = extractModel(event, raw) || value(
    event.model,
    event.modelName,
    event.model_name,
    event.selectedModel,
    event.model_id,
    process.env.COPILOT_MODEL,
  )
  const label = eventKind === 'prompt' ? 'new message'
    : eventKind === 'agent-stop' ? 'answer ready'
    : eventKind === 'session-start' ? 'session started'
    : eventKind === 'error' ? 'agent error'
    : tool || eventKind
  const station = eventKind === 'prompt' ? 'you' : eventKind === 'agent-stop' ? 'model'
    : eventKind === 'error' ? 'hooks' : classify(tool, event)
  const failed = event.success === false || event.isError === true || Boolean(event.error)
    || event.toolResult?.resultType === 'failure'
  const status = eventKind === 'tool-start' ? 'run'
    : eventKind === 'error' || (eventKind === 'tool-end' && failed) ? 'err' : 'ok'
  const stateFile = path.join(process.cwd(), '.kiro', 'command-mesh', 'state.json')
  // When the extension's Copilot stream reader is live (fresh bridge.lock heartbeat), it already records
  // prompts and tool calls with the real model and call ids. Recording them here too would double-count.
  if (['prompt', 'tool-start', 'tool-end'].includes(eventKind) && streamReaderLive(stateFile)) return
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  const lockPath = `${stateFile}.lock`
  if (acquireLock(lockPath)) process.on('exit', () => { try { fs.unlinkSync(lockPath) } catch {} })
  const state = readState(stateFile)
  if (!state) return
  state.entries = state.entries || []
  const now = Date.now()
  if (eventKind === 'agent-stop') {
    // The turn is over, so any call whose end event was missed is finished too.
    for (const open of state.entries) {
      if (open.source === 'copilot-hook' && open.status === 'run') {
        open.status = 'ok'
        open.endedAt = now
      }
    }
  }
  // A tool's end closes the oldest open call with the same name, so each call is one entry.
  const open = eventKind === 'tool-end'
    ? state.entries.find(x => x.source === 'copilot-hook' && x.status === 'run' && x.label === sanitize(label))
    : undefined
  if (open) {
    open.status = status
    open.endedAt = now
  } else {
    const entry = {
      id: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      provider: 'copilot',
      source: 'copilot-hook',
      station,
      label: sanitize(label),
      status,
      startedAt: now,
      ...(status === 'run' ? {} : { endedAt: now }),
    }
    state.entries = [...state.entries, entry].slice(-80)
    state.counts = { ...(state.counts || {}), [station]: (state.counts?.[station] || 0) + 1 }
  }
  state.provider = 'COPILOT'
  if (model) {
    state.model = sanitize(model)
    state.models = { ...(state.models || {}), copilot: state.model }
  }
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  writeStateBestEffort(stateFile, JSON.stringify(state))
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

function streamReaderLive(stateFile) {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(path.dirname(stateFile), 'bridge.lock'), 'utf8'))
    return Date.now() - Number(lock.at) < 30000
  } catch { return false }
}

// Empty board when the file is missing; null when it exists but cannot be parsed (another writer is
// mid-write). Skipping on null keeps a torn read from wiping everyone's counts and models.
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

// Atomic replace with retries. Windows rename fails while another process has the file open.
// Never write in place: a half-written file is what other readers see as corrupt.
function writeStateBestEffort(stateFile, serialized) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const temporary = `${stateFile}.${process.pid}.${Date.now()}.${attempt}.tmp`
    try {
      fs.writeFileSync(temporary, serialized)
      fs.renameSync(temporary, stateFile)
      return
    } catch {
      try { fs.unlinkSync(temporary) } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
    }
  }
}

function sanitize(text) {
  return String(text).replace(/[\r\n]+/g, ' ').slice(0, 100)
}

function extractModel(eventData, input) {
  const text = `${input}\n${JSON.stringify(eventData)}`
  const selected = text.match(/(?:Copilot\s+Fusion\s+selected|selected)\s+(.+?)\s+because\b/i)
  if (selected?.[1]) return selected[1].trim()
  const known = text.match(/\b(GPT-\d+(?:\.\d+)?(?:\s+[A-Za-z][A-Za-z0-9_-]*)*)\b/i)
  return known?.[1]?.trim()
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
