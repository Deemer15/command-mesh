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
  const status = eventKind === 'tool-start' ? 'run' : eventKind === 'error' ? 'err' : 'ok'
  const stateFile = path.join(process.cwd(), '.kiro', 'command-mesh', 'state.json')
  let state = { entries: [], counts: {} }
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch {}
  const now = Date.now()
  const entry = {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    provider: 'copilot',
    station,
    label: sanitize(label),
    status,
    startedAt: now,
    ...(status === 'run' ? {} : { endedAt: now }),
  }
  state.entries = [...(state.entries || []), entry].slice(-80)
  state.counts = { ...(state.counts || {}), [station]: (state.counts?.[station] || 0) + 1 }
  state.provider = 'COPILOT'
  if (model) {
    state.model = sanitize(model)
    state.models = { ...(state.models || {}), copilot: state.model }
  }
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  writeStateBestEffort(stateFile, JSON.stringify(state))
}

function writeStateBestEffort(stateFile, serialized) {
  const temporary = `${stateFile}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(temporary, serialized)
    try {
      fs.renameSync(temporary, stateFile)
      return
    } catch {
      // Windows does not atomically replace an existing destination with rename.
      fs.writeFileSync(stateFile, serialized)
    }
  } finally {
    try { fs.unlinkSync(temporary) } catch {}
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

function classify(name, data) {
  const lower = `${name} ${JSON.stringify(data)}`.toLowerCase()
  if (/(read|write|edit|file|glob|grep)/.test(lower)) return 'files'
  if (/(browser|navigate|search|fetch|http|web)/.test(lower)) return 'network'
  if (/(agent|subagent)/.test(lower)) return 'agents'
  if (/(memory|remember|recall)/.test(lower)) return 'memory'
  if (/(shell|terminal|command|bash|powershell|exec|run)/.test(lower)) return 'shell'
  return 'model'
}
