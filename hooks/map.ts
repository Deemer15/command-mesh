// What the map knows: which station an action belongs to, what to call it, and how to draw the board.
// Nothing here touches the engine.
import type { Board, Entry, StationId } from '../types'
import { stringsFor } from './text'
import type { Strings } from './text'

// ---- stations ---------------------------------------------------------------------------------

export const STATIONS: { id: StationId; icon: string }[] = [
  { id: 'you', icon: `${ring(0, -3.6, 3.4)}M-6.5 8c0-4 3-6.2 6.5-6.2s6.5 2.2 6.5 6.2` },
  { id: 'model', icon: 'M-5 -5h10v10h-10zM-2 -8.5v3.5M2 -8.5v3.5M-2 5v3.5M2 5v3.5M-8.5 -2h3.5M-8.5 2h3.5M5 -2h3.5M5 2h3.5' },
  { id: 'memory', icon: `M-5 4.5L0 -5L6 3.5M-5 4.5L6 3.5${ring(-5, 4.5, 2.1)}${ring(0, -5, 2.1)}${ring(6, 3.5, 2.1)}` },
  { id: 'files', icon: 'M-5.5 -8h7.5l3.5 3.5v12.5h-11zM2 -8v3.5h3.5' },
  { id: 'shell', icon: 'M-7.5 -5l5 5l-5 5M0 6h7.5' },
  { id: 'web', icon: `${ring(0, 0, 7.8)}M-7.8 0h15.6M0 -7.8c-4.2 4.2 -4.2 11.4 0 15.6M0 -7.8c4.2 4.2 4.2 11.4 0 15.6` },
  { id: 'browser', icon: 'M-8.5 -6.5h17v13h-17zM-8.5 -2.8h17M-6.3 -4.7h.1M-3.8 -4.7h.1' },
  { id: 'agents', icon: `M0 -4v3.5M0 -.5L-6 4M0 -.5L6 4${ring(0, -6, 2.1)}${ring(-6.5, 5.5, 2.1)}${ring(6.5, 5.5, 2.1)}` },
  { id: 'skills', icon: 'M1.5 -8.5L-5.5 1h4.5l-1.5 7.5l7.5 -9.8h-4.5z' },
  { id: 'hooks', icon: `M2.5 -5.5v8a4.2 4.2 0 1 1 -8.4 0v-1.5${ring(2.5, -7.3, 1.8)}` },
]

function ring(x: number, y: number, r: number): string {
  return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
}

// ---- what the person set -----------------------------------------------------------------------

/** The mod's options made ready to use. Whatever is missing or malformed counts as not set. */
export type Setup = {
  t: Strings
  core: string
  memoryServers: ReadonlySet<string>
  memoryCommands: readonly string[]
  memoryPaths: readonly string[]
  memoryLabels: ReadonlyMap<string, string>
  hookRecords: boolean
}

const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map(x => String(x).trim()).filter(x => x !== '')

export function setupFrom(options: Readonly<Record<string, unknown>> = {}): Setup {
  const memoryLabels = new Map<string, string>()
  for (const pair of list(options.memoryLabels)) {
    const at = pair.indexOf('=')
    if (at > 0 && at < pair.length - 1) memoryLabels.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim())
  }
  const core = typeof options.coreName === 'string' ? options.coreName.trim().slice(0, 10) : ''
  return {
    t: stringsFor(options.language),
    core: core === '' ? 'CLAUDE' : core,
    memoryServers: new Set(list(options.memoryServers)),
    memoryCommands: list(options.memoryCommands),
    memoryPaths: list(options.memoryPaths),
    memoryLabels,
    hookRecords: options.hookRecords === true,
  }
}

// ---- classification ---------------------------------------------------------------------------

export type Classified = { station: StationId; label: string }

const lastTwo = (path: string): string => path.split('/').filter(Boolean).slice(-2).join('/')

/** Only the host: a login, a password, a path or a query never reach a label. */
function hostOf(url: string): string {
  const [, scheme = '', rest = ''] = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(.*)$/is.exec(url) ?? []
  return (rest.split(/[/?#]/)[0].split('@').pop() ?? '').slice(0, 40) || scheme
}

/** Claude Code's own memory folder counts for everyone; anything else is the person's to name. */
const isMemoryPath = (path: string, setup: Setup): boolean =>
  /\/\.claude\/projects\/[^/]+\/memory\//.test(path) || setup.memoryPaths.some(part => path.includes(part))
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Commands that only look at or move files. echo, cd and the like say nothing either way. */
const FILE_WORDS = new Set(['cat', 'head', 'tail', 'sed', 'grep', 'rg', 'find', 'ls', 'wc', 'cp', 'mv', 'mkdir', 'touch', 'diff', 'cmp', 'sort', 'uniq', 'cut', 'tr', 'awk', 'tee', 'stat', 'file', 'du', 'tree', 'ln', 'basename', 'dirname', 'realpath', 'jq'])
const NEUTRAL_WORDS = new Set(['echo', 'printf', 'cd', 'export', 'true', 'set', 'pwd', 'sleep', 'which', 'test', '['])
const NET_WORDS = new Set(['curl', 'wget', 'gh', 'ssh', 'scp', 'ping', 'dig', 'nslookup'])
const NET_GIT = new Set(['push', 'pull', 'fetch', 'clone', 'ls-remote'])
const RUNNERS = new Set(['python', 'python3', 'bash', 'sh', 'zsh', 'node'])

/** The words of each command in a shell line, leading assignments taken off. Quotes stay: a quoted word is an argument. */
function segments(command: string): string[][] {
  return command
    .split(/&&|\|\||;|\||\n/)
    .map(part => part.trim().split(/\s+/).filter(Boolean))
    .map(words => {
      let i = 0
      while (i < words.length && /^[A-Za-z_]\w*=/.test(words[i])) i++
      return words.slice(i)
    })
    .filter(words => words.length > 0)
}

const base = (word: string): string => word.replace(/["']/g, '').split('/').pop() ?? word

/** The name a memory command goes by: the one word after the command, never an argument behind it. */
function memoryLabel(words: string[], commands: readonly string[]): string {
  const head = base(words[0])
  if (!commands.includes(head)) return base(RUNNERS.has(head) && words[1] ? words[1] : words[0]).replace(/\.py$/, '')
  return /^[a-z][a-z-]*$/.test(words[1] ?? '') ? words[1] : head
}

function classifyBash(command: string, description: string, setup: Setup): Classified {
  const lines = segments(command)
  const label = description.trim() || base(lines[0]?.[0] ?? 'shell')
  for (const words of lines) {
    const head = base(words[0])
    const script = RUNNERS.has(head) && words[1] ? base(words[1]) : ''
    if (setup.memoryCommands.some(c => head.startsWith(c) || script.startsWith(c))) {
      return { station: 'memory', label: memoryLabel(words, setup.memoryCommands) }
    }
  }
  for (const words of lines) {
    const head = base(words[0])
    if (NET_WORDS.has(head) || (head === 'git' && NET_GIT.has(words[1] ?? ''))) return { station: 'web', label }
  }
  const real = lines.filter(words => !NEUTRAL_WORDS.has(base(words[0])))
  if (real.length > 0 && real.every(words => FILE_WORDS.has(base(words[0])))) {
    return { station: isMemoryPath(command, setup) ? 'memory' : 'files', label }
  }
  return { station: 'shell', label }
}

export function classify(tool: string, input: Record<string, unknown>, setup: Setup): Classified {
  const { t } = setup
  switch (tool) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit': {
      const path = str(input.file_path) || str(input.notebook_path)
      return { station: isMemoryPath(path, setup) ? 'memory' : 'files', label: lastTwo(path) || tool }
    }
    case 'Grep':
    case 'Glob':
      return { station: 'files', label: tool }
    case 'Bash':
      return classifyBash(str(input.command), str(input.description), setup)
    case 'WebFetch':
      return { station: 'web', label: hostOf(str(input.url)) }
    case 'WebSearch':
      return { station: 'web', label: t.webSearch }
    case 'Artifact':
      return { station: 'web', label: t.artifact }
    case 'Agent':
      return { station: 'agents', label: str(input.description) || t.subagent }
    case 'Workflow':
      return { station: 'agents', label: t.workflow }
    case 'SendMessage':
    case 'TaskStop':
      return { station: 'agents', label: tool }
    case 'Skill':
      return { station: 'skills', label: str(input.skill) || t.skill }
    case 'ToolSearch':
      return { station: 'skills', label: t.loadingTools }
    case 'AskUserQuestion':
      return { station: 'you', label: t.questionForYou }
    case 'SendUserFile':
      return { station: 'you', label: t.fileForYou }
  }
  const mcp = /^mcp__([^_].*?)__(.+)$/.exec(tool)
  if (mcp === null) return { station: 'shell', label: tool }
  const [, server, name] = mcp
  if (setup.memoryServers.has(server)) {
    const id = typeof input.id === 'number' || typeof input.id === 'string' ? ` #${input.id}` : ''
    return { station: 'memory', label: (setup.memoryLabels.get(name) ?? name.replace(/_/g, ' ')) + id }
  }
  if (server === 'Claude_Browser' || server === 'claude-in-chrome') {
    const url = str(input.url)
    return { station: 'browser', label: url && /^[a-z]+:/i.test(url) ? hostOf(url) : name.replace(/_/g, ' ') }
  }
  if (server === 'terminal') return { station: 'shell', label: name.replace(/_/g, ' ') }
  if (server === 'visualize' || server.startsWith('ccd_')) return { station: 'you', label: name.replace(/_/g, ' ') }
  if (server === 'plugin-authoring') return { station: 'skills', label: name.replace(/_/g, ' ') }
  return { station: 'web', label: `${server}: ${name.replace(/_/g, ' ')}` }
}

/** `claude-opus-5-5` reads as `opus 5.5`. */
export function shortModel(model: string): string {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model)
  return m === null ? model : `${m[1]} ${m[2]}${m[3] !== undefined ? `.${m[3]}` : ''}`
}

export function formatMs(ms: number, t: Strings): string {
  return ms < 1000 ? t.ms(Math.max(1, Math.round(ms))) : ms < 60000 ? t.seconds((ms / 1000).toFixed(1)) : t.minutes(Math.floor(ms / 60000), Math.round((ms % 60000) / 1000))
}

/** The first line of a hook's refusal, cut short: the lines after it may repeat the whole command. */
export function firstLine(text: string, max = 72): string {
  const line = (text.split('\n').find(l => l.trim() !== '') ?? '').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** The record numbers a memory hook put in front of the model: `[#123`, `[now #123`, `[todo #123`. */
export function memoryIds(text: string): string[] {
  return [...new Set([...text.matchAll(/\[(?:[a-z]+ )?#(\d+)/g)].map(m => m[1]))]
}

// ---- drawing ----------------------------------------------------------------------------------

const W = 460
const H = 430
const CX = 230
const CY = 212
const RX = 176
const RY = 164
const NODE = 22
const CORE = 40

const GROUND = '#0a0c11'
const RAISED = '#12151c'
const LINE = '#272c36'
const SPOKE = '#1a1e27'
const BONE = '#ebe6dc'
const ASH = '#9ba1ab'
const ACCENT = '#e1ac6e'
const HOT = '#f0c595'
const RED = '#e8654f'
const FONT = 'font-family="SF Mono, ui-monospace, Menlo, monospace"'

const PULSE_MS = 800
const GLOW_MS = 3200
const ALARM_MS = 6000

type Point = { x: number; y: number }

const place = (i: number): Point => {
  const a = (i * 2 * Math.PI) / STATIONS.length
  return { x: CX + RX * Math.sin(a), y: CY - RY * Math.cos(a) }
}

const n1 = (v: number): string => (Math.round(v * 10) / 10).toString()
const secs = (ms: number): string => `${(ms / 1000).toFixed(3)}s`

/** Where a straight line from `from` to `to` meets the circle of radius `r` around `from`. */
function edge(from: Point, to: Point, r: number): Point {
  const d = Math.hypot(to.x - from.x, to.y - from.y) || 1
  return { x: from.x + ((to.x - from.x) * r) / d, y: from.y + ((to.y - from.y) * r) / d }
}

function pulse(a: Point, b: Point, color: string, age: number, radius: number): string {
  // A negative begin carries on where the last drawing left off, so a redraw never restarts a flight.
  const at = `begin="-${secs(age)}" dur="${secs(PULSE_MS)}" fill="freeze"`
  return (
    `<circle r="${radius}" fill="${color}" opacity="0">` +
    `<animateMotion path="M${n1(a.x)} ${n1(a.y)}L${n1(b.x)} ${n1(b.y)}" ${at}/>` +
    `<animate attributeName="opacity" values="1;1;0" keyTimes="0;.82;1" ${at}/>` +
    `</circle>`
  )
}

function beam(a: Point, b: Point, color: string, age: number): string {
  return (
    `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke="${color}" stroke-width="1.4" opacity="0">` +
    `<animate attributeName="opacity" values=".75;0" begin="-${secs(age)}" dur="${secs(GLOW_MS / 2)}" fill="freeze"/></line>`
  )
}

function station(i: number, entries: Entry[], count: number, now: number, name: string): { under: string; over: string } {
  const s = STATIONS[i]
  const p = place(i)
  const own = entries.filter(e => e.station === s.id)
  const running = own.filter(e => e.status === 'run')
  const latest = own.length > 0 ? own[own.length - 1] : undefined
  const since = latest === undefined ? Infinity : now - (latest.endedAt ?? latest.startedAt)
  const alarm = own.filter(e => e.status === 'block' || e.status === 'err').pop()
  const alarmAge = alarm === undefined ? Infinity : now - alarm.startedAt
  const isAlarm = alarmAge < ALARM_MS
  const isLit = running.length > 0 || since < GLOW_MS
  const color = isAlarm ? RED : ACCENT
  const fade = isAlarm ? alarmAge : since
  const span = isAlarm ? ALARM_MS : GLOW_MS

  let under = ''
  if (isLit || isAlarm) {
    under +=
      running.length > 0 && !isAlarm
        ? `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${NODE + 10}" fill="${color}" opacity=".16"/>`
        : `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${NODE + 10}" fill="${color}" opacity="0">` +
          `<animate attributeName="opacity" values=".3;0" begin="-${secs(fade)}" dur="${secs(span)}" fill="freeze"/></circle>`
  }
  if (running.length > 0) {
    const phase = (now - running[0].startedAt) % 1400
    const at = `begin="-${secs(phase)}" dur="1.4s" repeatCount="indefinite"`
    under +=
      `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${NODE}" fill="none" stroke="${color}" stroke-width="1.3">` +
      `<animate attributeName="r" values="${NODE};${NODE + 15}" ${at}/>` +
      `<animate attributeName="opacity" values=".9;0" ${at}/></circle>`
  }

  // A lit node holds its color while something runs, otherwise it cools down to the resting line.
  const stroke = running.length > 0 ? color : LINE
  const cooling =
    running.length === 0 && (isLit || isAlarm)
      ? `<animate attributeName="stroke" values="${color};${LINE}" begin="-${secs(fade)}" dur="${secs(span)}" fill="freeze"/>`
      : ''
  const glyphColor = running.length > 0 || isLit || isAlarm ? (isAlarm ? RED : HOT) : ASH
  const over =
    `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${NODE}" fill="${RAISED}" stroke="${stroke}" stroke-width="1.2">${cooling}</circle>` +
    `<path transform="translate(${n1(p.x)} ${n1(p.y)})" d="${s.icon}" fill="none" stroke="${glyphColor}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="${n1(p.x)}" y="${n1(p.y + NODE + 15)}" text-anchor="middle" ${FONT} font-size="11.5" fill="${isLit || isAlarm ? BONE : ASH}">${name}</text>` +
    (count > 0
      ? `<text x="${n1(p.x)}" y="${n1(p.y + NODE + 28)}" text-anchor="middle" ${FONT} font-size="9.5" fill="#6b7280">${count}</text>`
      : '')
  return { under, over }
}

export function drawMap(board: Board, now: number, setup: Setup): string {
  const core: Point = { x: CX, y: CY }
  const recent = board.entries.slice(-40)
  const flights = recent.filter(e => now - e.startedAt < PULSE_MS).slice(-14)
  const returns = recent.filter(e => e.endedAt !== undefined && now - e.endedAt < PULSE_MS).slice(-14)
  const beams = recent.filter(e => now - e.startedAt < GLOW_MS / 2).slice(-10)
  const anyRunning = recent.some(e => e.status === 'run')
  const agentsAt = place(STATIONS.findIndex(s => s.id === 'agents'))

  let body = `<rect width="${W}" height="${H}" rx="12" fill="${GROUND}"/>`

  // Contours around the core.
  for (const [rx, ry] of [[66, 62], [104, 97], [142, 132]]) {
    body += `<ellipse cx="${CX}" cy="${CY}" rx="${rx}" ry="${ry}" fill="none" stroke="${LINE}" stroke-width=".7" opacity=".45" stroke-dasharray="2 5"/>`
  }

  // Spokes first, then whatever flies along them, then the nodes on top.
  STATIONS.forEach((_, i) => {
    const p = place(i)
    const a = edge(core, p, CORE)
    const b = edge(p, core, NODE)
    body += `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke="${SPOKE}" stroke-width="1"/>`
  })

  const drawn = STATIONS.map((s, i) => station(i, recent, board.counts[s.id] ?? 0, now, setup.t.stations[s.id]))
  body += drawn.map(d => d.under).join('')

  const pointOf = (id: StationId): Point => place(STATIONS.findIndex(s => s.id === id))
  for (const e of beams) {
    const p = pointOf(e.station)
    const start = e.from === 'agents' ? agentsAt : core
    const color = e.status === 'block' || e.status === 'err' ? RED : ACCENT
    body += beam(edge(start, p, e.from === 'agents' ? NODE : CORE), edge(p, start, NODE), color, now - e.startedAt)
  }
  for (const e of flights) {
    const p = pointOf(e.station)
    const start = e.from === 'agents' ? agentsAt : core
    const a = edge(start, p, e.from === 'agents' ? NODE : CORE)
    const b = edge(p, start, NODE)
    const color = e.status === 'block' ? RED : HOT
    body += e.from === 'inbound' ? pulse(b, a, color, now - e.startedAt, 3.8) : pulse(a, b, color, now - e.startedAt, 3.8)
  }
  for (const e of returns) {
    if (e.from === 'inbound') continue
    const p = pointOf(e.station)
    const start = e.from === 'agents' ? agentsAt : core
    const a = edge(start, p, e.from === 'agents' ? NODE : CORE)
    const b = edge(p, start, NODE)
    const color = e.status === 'ok' ? ASH : RED
    body += pulse(b, a, color, now - (e.endedAt as number), 2.6)
  }

  body += drawn.map(d => d.over).join('')

  // A name longer than three letters shrinks to stay inside the circle.
  const coreSize = Math.min(17, 62 / (0.75 * setup.core.length))

  // The core breathes at rest and quickens while something runs.
  const period = anyRunning ? 1600 : 4800
  const at = `begin="-${secs(now % period)}" dur="${secs(period)}" repeatCount="indefinite"`
  body +=
    `<circle cx="${CX}" cy="${CY}" r="${CORE + 6}" fill="${ACCENT}" opacity=".08">` +
    `<animate attributeName="r" values="${CORE + 3};${CORE + 13};${CORE + 3}" ${at}/>` +
    `<animate attributeName="opacity" values=".05;${anyRunning ? '.24' : '.12'};.05" ${at}/></circle>` +
    `<circle cx="${CX}" cy="${CY}" r="${CORE}" fill="${RAISED}" stroke="${anyRunning ? ACCENT : LINE}" stroke-width="1.3"/>` +
    `<text x="${CX}" y="${CY + (board.model === undefined ? 6 : 1)}" text-anchor="middle" ${FONT} font-size="${n1(coreSize)}" letter-spacing="${n1(coreSize * 0.147)}" fill="${BONE}">${escapeXml(setup.core)}</text>`
  if (board.model !== undefined) {
    body += `<text x="${CX}" y="${CY + 17}" text-anchor="middle" ${FONT} font-size="9" fill="${ASH}">${escapeXml(shortModel(board.model))}</text>`
  }

  // Twice the viewBox, so the picture fills whatever room the pane gives it.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}">${body}</svg>`
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] as string)
}

export function describeNow(board: Board, t: Strings): string {
  const running = board.entries.filter(e => e.status === 'run')
  if (running.length === 0) return t.idle
  const top = running[running.length - 1]
  return `${t.stations[top.station]}: ${top.label}${running.length > 1 ? t.andMore(running.length - 1) : ''}`
}
