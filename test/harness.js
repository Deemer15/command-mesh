#!/usr/bin/env node
// Command Mesh test harness.
//
// Plays a short scripted session for Copilot, Codex, and Kiro into this workspace's live board, so you
// can watch the grid react with the panel or web dashboard open. Then it checks the results and removes
// everything it added.
//
//   node test/harness.js          ~15 s show, then verify and clean up
//   node test/harness.js --fast   same events at 10x speed (quick pipeline check)
//   node test/harness.js --keep   leave the harness events on the board afterwards
//
// Kiro events go through the real .kiro/command-mesh/hook.js, the same way Kiro calls it.
// Copilot and Codex events are written straight to the board, because their real sources are
// session logs in your home folder that the harness should not touch.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const dir = path.join(root, '.kiro', 'command-mesh')
const stateFile = path.join(dir, 'state.json')
const lockFile = `${stateFile}.lock`
const kiroHook = path.join(dir, 'hook.js')
const args = process.argv.slice(2)
const speed = args.includes('--fast') ? 0.1 : 1
const keep = args.includes('--keep')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms * speed))
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

// ---- board access (same lock and atomic write as the extension and hooks) ----

function readState() {
  for (let attempt = 0; attempt < 6; attempt++) {
    try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch (error) {
      if (error.code === 'ENOENT') return { entries: [], counts: {} }
    }
    pause(15)
  }
  return null
}

function update(mutate) {
  fs.mkdirSync(dir, { recursive: true })
  const deadline = Date.now() + 3000
  let owned = false
  while (!owned) {
    try { fs.closeSync(fs.openSync(lockFile, 'wx')); owned = true } catch (error) {
      if (error.code !== 'EEXIST') throw error
      try { if (Date.now() - fs.statSync(lockFile).mtimeMs > 3000) { fs.unlinkSync(lockFile); continue } } catch {}
      if (Date.now() > deadline) throw new Error('state.json.lock stayed held for 3 s')
      pause(5)
    }
  }
  try {
    const state = readState()
    if (!state) throw new Error('state.json could not be parsed')
    state.entries = state.entries || []
    state.counts = state.counts || {}
    mutate(state)
    const temporary = `${stateFile}.${process.pid}.${Date.now()}.harness.tmp`
    fs.writeFileSync(temporary, JSON.stringify(state))
    for (let attempt = 0; ; attempt++) {
      try { fs.renameSync(temporary, stateFile); break } catch (error) {
        if (attempt >= 5) { try { fs.unlinkSync(temporary) } catch {} throw error }
        pause(10)
      }
    }
  } finally {
    try { fs.unlinkSync(lockFile) } catch {}
  }
}

// ---- event sources ----

const added = new Set()

function add(provider, station, label, status = 'ok') {
  const now = Date.now()
  const id = `harness-${provider}-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`
  added.add(id)
  update(state => {
    state.entries = [...state.entries, { id, provider, source: 'harness', station, label, status, startedAt: now, ...(status === 'run' ? {} : { endedAt: now }) }].slice(-80)
    state.counts[station] = (state.counts[station] || 0) + 1
  })
  return id
}

function finish(id, status = 'ok') {
  update(state => {
    const entry = state.entries.find(x => x.id === id)
    if (entry) { entry.status = status; entry.endedAt = Date.now() }
  })
}

// Calls the real Kiro hook. A tool_use_id keeps start and end paired to this harness's own calls,
// even while Kiro itself has a call of the same name open.
function kiro(kind, payload = {}) {
  const result = spawnSync(process.execPath, [kiroHook, kind], { cwd: root, input: JSON.stringify({ hook_event_name: 'harness', ...payload }), encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`Kiro hook "${kind}" exited ${result.status}: ${result.stderr}`)
}

function kiroCredits(amount) {
  update(state => {
    const previous = state.usage?.kiro || { session: 0 }
    state.usage = { ...(state.usage || {}), kiro: { ...previous, last: amount, session: Number(((previous.session || 0) + amount).toFixed(4)), lastAt: Date.now(), unit: 'credits' } }
  })
}

// ---- scenario ----

const before = readState()
if (!before) { console.error('state.json exists but cannot be parsed. Close other writers and retry.'); process.exit(1) }
const startIds = new Map((before.entries || []).map(e => [e.id, { status: e.status, endedAt: e.endedAt }]))
const startUsage = before.usage?.kiro
const startedAt = Date.now()
const step = label => console.log(`  ${((Date.now() - startedAt) / 1000).toFixed(1).padStart(5)}s  ${label}`)

async function play() {
  step('operator prompts Copilot and Kiro')
  add('copilot', 'you', 'fix the failing build')
  kiro('prompt', { prompt: 'harness prompt' })
  await sleep(1200)

  step('Copilot runs a shell command')
  const copilotShell = add('copilot', 'shell', 'powershell', 'run')
  await sleep(900)

  step('Kiro writes a file, Codex starts a turn')
  kiro('tool-start', { tool_name: 'fs_write', tool_use_id: 'harness-kiro-write', tool_input: { path: 'harness.txt' } })
  add('codex', 'you', 'new Codex message')
  const codexTurn = add('codex', 'model', 'Codex working', 'run')
  const codexPatch = add('codex', 'files', 'apply_patch', 'run')
  await sleep(1500)

  step('Copilot fetches a page')
  finish(copilotShell)
  const copilotWeb = add('copilot', 'web', 'web_fetch', 'run')
  await sleep(1200)

  step('Kiro moves to the terminal')
  kiro('tool-end', { tool_name: 'fs_write', tool_use_id: 'harness-kiro-write' })
  kiro('tool-start', { tool_name: 'execute_pwsh', tool_use_id: 'harness-kiro-shell', tool_input: { command: 'npm test' } })
  await sleep(1800)

  step('Codex patch lands, Copilot fetch returns')
  finish(codexPatch)
  finish(copilotWeb)
  await sleep(1200)

  step('Kiro command fails          (red glitch on Terminal)')
  kiro('tool-end', { tool_name: 'execute_pwsh', tool_use_id: 'harness-kiro-shell', success: false })
  await sleep(1800)

  step('Kiro finishes its turn      (shockwave + credits burst)')
  kiroCredits(1.25)
  kiro('stop')
  await sleep(1400)

  step('Codex and Copilot finish    (shockwaves)')
  finish(codexTurn)
  add('copilot', 'model', 'answer ready')
  await sleep(3000)
}

// ---- checks ----

const KIRO_LABELS = ['answer ready', 'execute_pwsh', 'fs_write', 'new message']
let failures = 0
const check = (ok, label) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++ }

function kiroHarnessEntries(state) {
  return state.entries.filter(e => !startIds.has(e.id) && e.source === 'kiro-hook' && e.startedAt >= startedAt && KIRO_LABELS.includes(e.label))
}

function verify() {
  const state = readState()
  check(Boolean(state), 'state.json parses')
  if (!state) return
  const mine = state.entries.filter(e => added.has(e.id))
  check(mine.length === added.size, `all ${added.size} Copilot/Codex events are on the board`)
  check(mine.every(e => e.status !== 'run'), 'every Copilot/Codex call was closed')
  const kiroEntries = kiroHarnessEntries(state)
  check(JSON.stringify(kiroEntries.map(e => e.label).sort()) === JSON.stringify(KIRO_LABELS), 'Kiro hook recorded prompt, fs_write, execute_pwsh, answer ready (one entry each)')
  check(kiroEntries.find(e => e.label === 'fs_write')?.status === 'ok', 'Kiro fs_write closed as ok')
  check(kiroEntries.find(e => e.label === 'execute_pwsh')?.status === 'err', 'Kiro failed command marked err')
  check(kiroEntries.find(e => e.label === 'fs_write')?.station === 'files' && kiroEntries.find(e => e.label === 'execute_pwsh')?.station === 'shell', 'Kiro tools landed on Files and Terminal')
  for (const provider of ['copilot', 'codex']) {
    if (before.models?.[provider]) check(state.models?.[provider] === before.models[provider], `${provider} model kept (${before.models[provider]})`)
  }
  check(state.usage?.kiro?.last === 1.25, 'Kiro credits burst recorded')
  const leftovers = fs.readdirSync(dir).filter(f => f.endsWith('.harness.tmp') || f === 'state.json.lock')
  check(leftovers.length === 0, 'no temp or lock files left behind')
}

function cleanup() {
  update(state => {
    const remove = new Set([...added, ...kiroHarnessEntries(state).map(e => e.id)])
    for (const e of state.entries) {
      if (remove.has(e.id) && state.counts[e.station]) state.counts[e.station] = Math.max(0, state.counts[e.station] - 1)
    }
    state.entries = state.entries.filter(e => !remove.has(e.id))
    // Kiro's stop closes every open Kiro call, including real ones that were running before the harness.
    for (const e of state.entries) {
      const was = startIds.get(e.id)
      if (was && was.status === 'run' && e.source === 'kiro-hook' && e.status !== 'run' && e.endedAt >= startedAt) {
        e.status = 'run'
        delete e.endedAt
      }
    }
    if (startUsage) state.usage = { ...(state.usage || {}), kiro: startUsage }
    else if (state.usage) delete state.usage.kiro
  })
}

;(async () => {
  console.log(`Command Mesh harness${speed < 1 ? ' (fast)' : ''}: open the Activity Grid or web dashboard to watch.\n`)
  try {
    await play()
    console.log('\nChecks')
    verify()
  } catch (error) {
    failures++
    console.error(`\n  FAIL  ${error.message}`)
  } finally {
    if (!keep) {
      try { cleanup(); console.log('\n  harness events removed from the board') } catch (error) { failures++; console.error(`  FAIL  cleanup: ${error.message}`) }
    }
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
  process.exitCode = failures ? 1 : 0
})()
