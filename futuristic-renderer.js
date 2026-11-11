const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))
const stations = ['you','model','memory','files','shell','web','browser','agents','skills','hooks']
const names = ['Operator','Model','Memory','Files','Terminal','Network','Browser','Agents','Skills','Hooks']
const normalizeProvider = value => {
  const provider = String(value || '').toLowerCase()
  if (provider.includes('copilot')) return 'copilot'
  if (provider.includes('codex') || provider.includes('chatgpt')) return 'codex'
  if (provider.includes('kiro')) return 'kiro'
  return ''
}
const providerFor = entry => {
  const explicit = normalizeProvider(entry.provider)
  if (explicit) return explicit
  if (String(entry.id || '').startsWith('codex-') || /codex|chatgpt/i.test(String(entry.detail?.kind || ''))) return 'codex'
  if (/kiro/i.test(String(entry.detail?.kind || ''))) return 'kiro'
  return 'copilot'
}
const hexPath = (x, y, radius) => Array.from({ length: 6 }, (_, index) => {
  const angle = Math.PI / 3 * index - Math.PI / 2
  return `${index ? 'L' : 'M'}${(x + Math.cos(angle) * radius).toFixed(1)} ${(y + Math.sin(angle) * radius).toFixed(1)}`
}).join(' ') + 'Z'
module.exports = function drawMap(board, now, setup) {
  const entries = board.entries || []
  const active = entries.filter(e => e.status === 'run')
  const cyan = '#53f4dd', violet = '#a28aff'
  let body = `<style>@keyframes orbit{to{transform:rotate(360deg)}}@keyframes reactor{50%{opacity:.35}}@keyframes corePulse{50%{opacity:.35;transform:scale(1.12)}}@keyframes stream{to{stroke-dashoffset:-48}}@keyframes nodePulse{50%{opacity:.8}}.stream{animation:stream 1.2s linear infinite;animation-delay:-${(now%1200)/1000}s}.node-pulse{animation:nodePulse 2s ease-in-out infinite;animation-delay:-${(now%2000)/1000}s}.provider-pulse{transform-box:fill-box;transform-origin:center;animation:corePulse 1.8s ease-in-out infinite;animation-delay:-${(now%1800)/1000}s}.sweep{animation-duration:18s;animation-delay:-${(now%18000)/1000}s}.inner-orbit{animation-duration:9s;animation-delay:-${(now%9000)/1000}s}.orbit{transform-origin:450px 285px;animation:orbit 24s linear infinite;animation-delay:-${(now%24000)/1000}s}.counter{animation-direction:reverse;animation-duration:36s;animation-delay:-${(now%36000)/1000}s}.reactor{animation:reactor 2.4s ease-in-out infinite;animation-delay:-${(now%2400)/1000}s}@media(prefers-reduced-motion:reduce){.orbit,.reactor,.stream,.node-pulse,.provider-pulse{animation:none}.moving-packets,.sweep{display:none}}</style><defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#162638" stroke-width=".5"/></pattern><radialGradient id="aura"><stop stop-color="#125252" stop-opacity=".48"/><stop offset="1" stop-color="#07101c" stop-opacity="0"/></radialGradient><filter id="glow"><feGaussianBlur stdDeviation="3"/></filter></defs><rect width="900" height="570" rx="16" fill="#080e19"/><rect width="900" height="570" fill="url(#grid)" opacity=".6"/><ellipse cx="450" cy="285" rx="260" ry="250" fill="url(#aura)"/><g font-family="Consolas,monospace"><text x="26" y="30" fill="#768ba4" font-size="10" letter-spacing="2">NEURAL TOPOLOGY / ${String(stations.length).padStart(2,'0')} NODES</text><text x="874" y="30" text-anchor="end" fill="${active.length ? cyan : '#768ba4'}" font-size="10">${active.length ? active.length + ' ACTIVE' : 'STANDBY'}</text>`
  body += `<style>.station-card{cursor:pointer;outline:none}.station-card rect:first-of-type{transition:fill .18s,stroke .18s,filter .18s}.station-card:hover rect:first-of-type,.station-card:focus rect:first-of-type{fill:#12283a;stroke:#53f4dd;filter:url(#glow)}.station-card.selected rect:first-of-type{fill:#112e38;stroke:#53f4dd;stroke-width:2;filter:url(#glow)}</style>`
  for (const r of [90,111,166,218]) body += `<circle cx="450" cy="285" r="${r}" fill="none" stroke="${r===111?violet:'#244052'}" opacity="${r===111?'.6':'.5'}" stroke-dasharray="${r===111?'65 12 3 12':'2 7'}"/>`
  body += `<g class="orbit"><circle cx="450" cy="285" r="101" fill="none" stroke="${cyan}" stroke-width="2" stroke-dasharray="55 580"/><circle cx="450" cy="184" r="3" fill="${cyan}"/><circle cx="450" cy="386" r="2" fill="${cyan}"/></g><g class="orbit counter"><circle cx="450" cy="285" r="153" fill="none" stroke="${violet}" stroke-width="1.5" stroke-dasharray="80 220 15 646"/><circle cx="603" cy="285" r="3" fill="${violet}"/></g><circle class="reactor" cx="450" cy="285" r="83" fill="none" stroke="${cyan}" stroke-width="5" opacity=".15"/>`
  // Slow sensor sweep and a faster inner rotor add depth without moving the labels.
  body += `<g class="orbit sweep" opacity=".32"><path d="M450 285L450 72A213 213 0 0 1 551 97Z" fill="url(#aura)"/><path d="M450 285V72" stroke="${cyan}" opacity=".25"/><circle cx="450" cy="72" r="2" fill="${cyan}"/></g><g class="orbit inner-orbit"><circle cx="450" cy="285" r="87" fill="none" stroke="${violet}" stroke-width="3" stroke-dasharray="14 77" opacity=".6"/></g>`
  for(let tick=0;tick<60;tick++) {
    const angle=tick*Math.PI/30, major=tick%5===0, r=major?197:202
    body += `<line x1="${450+Math.sin(angle)*r}" y1="${285-Math.cos(angle)*r}" x2="${450+Math.sin(angle)*208}" y2="${285-Math.cos(angle)*208}" stroke="${major?violet:'#385467'}" stroke-width="${major?1.5:1}" opacity=".5"/>`
  }
  body += `<path d="M450 55V72M450 498V515M220 285H237M663 285H680" stroke="${cyan}" opacity=".7"/>`
  stations.forEach((station,i)=>{
    const left=i<5, row=i%5, x=left?24:684,y=66+row*94, edge=left?216:684, end=left?350:550
    const events=entries.filter(e=>e.station===station || station==='web'&&e.station==='network'), last=events.at(-1), running=events.some(e=>e.status==='run'), bad=last && ['err','block'].includes(last.status), color=bad?'#ff728f':running?cyan:'#506b85'
    const count=board.counts?.[station]??events.length
    body += `<path d="M${edge} ${y+34}H${left?260:640}L${end} 285" fill="none" stroke="${color}" stroke-width="${running?1.5:.7}" opacity="${running?.8:.3}"/>`
    const recentlyFinished = last?.endedAt && now-last.endedAt>=0 && now-last.endedAt<3000
    if(running || recentlyFinished) {
      const route=`M${edge} ${y+34}H${left?260:640}L${end} 285`, returning=!running
      body += `<path class="stream" d="${route}" fill="none" stroke="${returning?violet:color}" stroke-dasharray="3 21" stroke-width="2" opacity=".65" style="animation-direction:${returning?'reverse':'normal'}"/>`
      body += '<g class="moving-packets">'
      for(let packet=0;packet<3;packet++) {
        const phase=((now+i*190+packet*800)%2400)/1000
        const motion=`<animateMotion begin="-${phase}s" dur="2.4s" repeatCount="indefinite" keyPoints="${returning?'1;0':'0;1'}" keyTimes="0;1" calcMode="linear" path="${route}"/>`
        body += `<circle r="7" fill="${returning?violet:color}" opacity=".2" filter="url(#glow)">${motion}</circle><circle r="2.5" fill="${returning?violet:'#c9fff5'}">${motion}</circle>`
      }
      body += '</g>'
      body += `<rect class="node-pulse" x="${x-3}" y="${y-3}" width="198" height="76" rx="8" fill="none" stroke="${returning?violet:color}" opacity=".2"/>`
    }
    body += `<g class="station-card" data-station="${station}" role="button" tabindex="0" aria-label="Filter events by ${names[i]}"><g><rect x="${x}" y="${y}" width="192" height="70" rx="6" fill="#0d1826" stroke="${running?cyan:'#213349'}"/><path d="M${x} ${y+15}V${y+4}Q${x} ${y} ${x+4} ${y}H${x+20}" fill="none" stroke="${color}" stroke-width="2"/><text x="${x+14}" y="${y+23}" fill="#d4e6f5" font-size="12" letter-spacing="1">${names[i].toUpperCase()}</text><text x="${x+178}" y="${y+23}" fill="${color}" font-size="14" text-anchor="end">${String(count).padStart(2,'0')}</text><circle cx="${x+17}" cy="${y+49}" r="2.5" fill="${color}"/><text x="${x+27}" y="${y+53}" fill="#849ab2" font-size="10">${esc((last?.label || 'Awaiting signal').slice(0,23))}</text><title>${esc(last?.label||names[i])}</title></g></g>`
  })
  const providers = [
    { id: 'copilot', label: 'COPILOT', x: 394, y: 238, color: cyan },
    { id: 'codex', label: 'CODEX', x: 506, y: 238, color: violet },
    { id: 'kiro', label: 'KIRO', x: 450, y: 342, color: '#ffb86b' },
  ]
  body += `<circle cx="450" cy="285" r="112" fill="#081522" stroke="#294256" stroke-width="1.5"/><circle cx="450" cy="285" r="106" fill="none" stroke="#183548" stroke-dasharray="2 8"/><path d="M394 238L506 238L450 342Z" fill="none" stroke="#29485c" stroke-width="1.2" stroke-dasharray="3 6"/><circle cx="450" cy="278" r="7" fill="#112d3b" stroke="#53f4dd" opacity=".8"/>`
  for (const provider of providers) {
    const providerEntries = entries.filter(entry => providerFor(entry) === provider.id)
    const running = providerEntries.filter(entry => entry.status === 'run').length
    const last = providerEntries.at(-1)
    const recent = last?.endedAt && now - last.endedAt >= 0 && now - last.endedAt < 4000
    const lit = running > 0 || recent
    const model = board.models?.[provider.id] || (normalizeProvider(board.provider) === provider.id ? board.model : '') || 'MODEL PENDING'
    body += `<g class="provider-core"><circle ${running ? 'class="provider-pulse"' : ''} cx="${provider.x}" cy="${provider.y}" r="42" fill="${provider.color}" opacity="${lit ? '.13' : '.035'}" filter="url(#glow)"/><path d="${hexPath(provider.x, provider.y, 34)}" fill="#0b1a27" stroke="${lit ? provider.color : '#385267'}" stroke-width="${lit ? 2.4 : 1.4}"/><path d="${hexPath(provider.x, provider.y, 23)}" fill="${provider.color}" fill-opacity="${lit ? '.28' : '.09'}" stroke="${provider.color}" stroke-opacity="${lit ? '.8' : '.25'}"/><text x="${provider.x}" y="${provider.y + 5}" text-anchor="middle" fill="${lit ? '#efffff' : '#7890a7'}" font-size="13">${String(providerEntries.length).padStart(2,'0')}</text><circle cx="${provider.x - 34}" cy="${provider.y - 29}" r="3.5" fill="${running ? provider.color : '#3c566a'}"/><text x="${provider.x}" y="${provider.y + 48}" text-anchor="middle" fill="${lit ? provider.color : '#9bb0c4'}" font-size="11" letter-spacing="1.7">${provider.label}</text><rect x="${provider.x - 50}" y="${provider.y + 54}" width="100" height="17" rx="8.5" fill="#07111c" stroke="${provider.color}" stroke-opacity="${lit ? '.45' : '.18'}"/><text x="${provider.x}" y="${provider.y + 65.5}" text-anchor="middle" fill="#9bb0c4" font-size="8.5">${esc(model.slice(0, 22))}</text><title>${provider.label} · ${running ? running + ' active' : 'idle'} · ${esc(model)}</title></g>`
  }
  body += `<text x="450" y="430" fill="#5c7891" font-size="8" letter-spacing="3" text-anchor="middle">MULTI-AGENT BUS</text><text x="450" y="451" fill="${active.length?cyan:'#849ab2'}" font-size="10" letter-spacing="3" text-anchor="middle">${active.length?active.length+' ACTIVE CHANNEL'+(active.length===1?'':'S'):'AWAITING INPUT'}</text><text x="26" y="548" fill="#506b85" font-size="9" letter-spacing="2">LOT MAP / OPERATIONS GRID</text><text x="874" y="548" fill="#506b85" font-size="9" text-anchor="end">${entries.length} EVENTS IN BUFFER</text></g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 570" role="img" aria-label="Live agent activity topology">${body}</svg>`
}
