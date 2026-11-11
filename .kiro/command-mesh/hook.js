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
const filePath = text(event.filePath, event.path, event.file?.path)
const label = kind === 'file' ? filePath.split(/[\\/]/).slice(-2).join('/') || 'file saved'
  : kind === 'prompt' ? 'new message'
  : kind === 'stop' ? 'answer ready'
  : tool || kind
const station = kind === 'prompt' ? 'you' : kind === 'file' ? 'files' : kind === 'stop' ? 'model' : classify(tool, event)
const now = Date.now()
let state = { entries: [], counts: {} }
try { state = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
const entry = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`, provider: 'kiro', station, label: sanitize(label), status: kind === 'tool-start' ? 'run' : 'ok', startedAt: now, endedAt: now }
state.entries = [...(state.entries || []), entry].slice(-80)
state.counts = { ...(state.counts || {}), [station]: (state.counts?.[station] || 0) + 1 }
state.provider = 'KIRO'
const model = text(event.model, event.modelName, event.model_name)
if (model) {
  state.model = sanitize(model)
  state.models = { ...(state.models || {}), kiro: state.model }
}
fs.mkdirSync(dir, { recursive: true })
const serialized = JSON.stringify(state)
for (let attempt = 0; attempt < 4; attempt++) {
  try {
    const temporary = `${file}.${process.pid}.${Date.now()}.${attempt}.tmp`
    fs.writeFileSync(temporary, serialized)
    fs.renameSync(temporary, file)
    break
  } catch (error) {
    if (attempt === 3) fs.writeFileSync(file, serialized)
  }
}

function sanitize(value) { return value.replace(/[\r\n]+/g, ' ').slice(0, 100) }
function classify(name, data) {
  const lower = `${name} ${JSON.stringify(data)}`.toLowerCase()
  if (/(read|write|edit|file|glob|grep)/.test(lower)) return 'files'
  if (/(browser|navigate|search|fetch|http|web)/.test(lower)) return 'network'
  if (/(agent|subagent)/.test(lower)) return 'agents'
  if (/(memory|remember|recall)/.test(lower)) return 'memory'
  if (/(shell|terminal|command|bash|powershell|exec|run)/.test(lower)) return 'shell'
  return 'model'
}
