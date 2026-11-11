const fs = require('fs')
const path = require('path')

const kind = process.argv[2] || 'event'
let raw = ''
try { raw = fs.readFileSync(0, 'utf8') } catch {}
let event = {}
try { event = JSON.parse(raw) } catch {}

const value = (...values) => values.find(v => typeof v === 'string' && v.trim()) || ''
const tool = value(event.toolName, event.tool_name, event.tool, process.env.COPILOT_TOOL_NAME)
const prompt = value(event.prompt, process.env.COPILOT_USER_PROMPT)
const model = extractModel(event, raw) || value(
  event.model,
  event.modelName,
  event.model_name,
  event.selectedModel,
  event.model_id,
  process.env.COPILOT_MODEL,
)
const label = kind === 'prompt' ? 'new message'
  : kind === 'agent-stop' ? 'answer ready'
  : kind === 'session-start' ? 'session started'
  : kind === 'error' ? 'agent error'
  : tool || kind
const station = kind === 'prompt' ? 'you' : kind === 'agent-stop' ? 'model'
  : kind === 'error' ? 'hooks' : classify(tool, event)
const status = kind === 'tool-start' ? 'run' : kind === 'error' ? 'err' : 'ok'
const root = process.cwd()
const stateFile = path.join(root, '.kiro', 'command-mesh', 'state.json')
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
const temporary = `${stateFile}.${process.pid}.tmp`
const serialized = JSON.stringify(state)
for (let attempt = 0; attempt < 4; attempt++) {
  try {
    fs.writeFileSync(`${temporary}.${attempt}`, serialized)
    fs.renameSync(`${temporary}.${attempt}`, stateFile)
    break
  } catch (error) {
    if (attempt === 3) {
      fs.writeFileSync(stateFile, serialized)
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

function classify(name, data) {
  const lower = `${name} ${JSON.stringify(data)}`.toLowerCase()
  if (/(read|write|edit|file|glob|grep)/.test(lower)) return 'files'
  if (/(browser|navigate|search|fetch|http|web)/.test(lower)) return 'network'
  if (/(agent|subagent)/.test(lower)) return 'agents'
  if (/(memory|remember|recall)/.test(lower)) return 'memory'
  if (/(shell|terminal|command|bash|powershell|exec|run)/.test(lower)) return 'shell'
  return 'model'
}
