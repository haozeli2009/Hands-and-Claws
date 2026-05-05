import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import Avatar from '../components/Avatar'
import OperatorDot from '../components/OperatorDot'

// ── palette & fonts ───────────────────────────────────────────────────────────
const AMBER = '#f59e0b'
const GREEN = '#22c55e'
const BLUE  = '#60a5fa'
const SANS  = "'Bricolage Grotesque', 'DM Sans', system-ui, sans-serif"
const BODY  = "'DM Sans', system-ui, sans-serif"
const MONO  = "'DM Mono', ui-monospace, monospace"

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..60,400;12..60,600;12..60,700;12..60,800&family=DM+Sans:wght@300;400;500;600&family=DM+Mono&display=swap');

@keyframes hc-drift1 {
  0%,100% { transform: translate(0,0) scale(1); }
  33%      { transform: translate(55px,-65px) scale(1.07); }
  66%      { transform: translate(-28px,38px) scale(0.95); }
}
@keyframes hc-drift2 {
  0%,100% { transform: translate(0,0) scale(1); }
  40%      { transform: translate(-70px,48px) scale(1.1); }
  70%      { transform: translate(36px,-36px) scale(0.93); }
}
@keyframes hc-drift3 {
  0%,100% { transform: translate(0,0) scale(1); }
  50%      { transform: translate(55px,65px) scale(1.06); }
}
@keyframes hc-fade-up {
  from { opacity:0; transform:translateY(22px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes hc-pulse-ring {
  0%   { transform:scale(1); opacity:.5; }
  100% { transform:scale(2.5); opacity:0; }
}
@keyframes hc-node-glow {
  0%,100% { opacity:.72; }
  50%      { opacity:1; }
}
@keyframes hc-dash {
  to { stroke-dashoffset:0; }
}
@keyframes hc-step-in {
  from { opacity:0; transform:translateX(32px); }
  to   { opacity:1; transform:translateX(0); }
}
@keyframes hc-step-in-back {
  from { opacity:0; transform:translateX(-32px); }
  to   { opacity:1; transform:translateX(0); }
}
`

// ── dynamic glowing network ───────────────────────────────────────────────────
// Slots scattered around center (170, 110) — mixed H and C on all sides
const SLOTS = [
  {x:35,  y:22},  {x:22,  y:108}, {x:48,  y:188}, {x:88,  y:18},  {x:82,  y:198},
  {x:305, y:22},  {x:318, y:108}, {x:292, y:188}, {x:252, y:18},  {x:258, y:198},
  {x:142, y:25},  {x:198, y:25},  {x:142, y:192}, {x:198, y:192},
]
const FADE_DUR = 0.55
const MIN_N    = 3
const MAX_N    = 8

function easeInOut(t) { return t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2 }

function nodeOpacity(node, t) {
  const fadeIn = Math.min(1, (t - node.addedAt) / FADE_DUR)
  if (node.removingAt !== null) {
    const fadeOut = Math.max(0, 1 - (t - node.removingAt) / FADE_DUR)
    return Math.min(fadeIn, fadeOut)
  }
  return fadeIn
}

function nodeDrift(id, si, t) {
  const s = SLOTS[si]
  return {
    x: s.x + 9 * Math.sin(t * 0.37 + id * 2.09),
    y: s.y + 7 * Math.cos(t * 0.31 + id * 1.83),
  }
}

function makeNode(id, si, type, t) {
  return { id, si, type, addedAt: t, removingAt: null }
}

function GlowNetwork({ style: sx }) {
  const W = 340, H = 220, cx = W/2, cy = H/2 - 5

  const sim = useRef({
    t: 0, startTs: null, nid: 20,
    lastEvent: 0, lastSpawn: 0,
    // start with 6 mixed nodes scattered across all sides, pre-faded-in
    nodes: [
      makeNode(0,  0,  'human', -FADE_DUR - 1),
      makeNode(1,  5,  'agent', -FADE_DUR - 1),
      makeNode(2,  1,  'agent', -FADE_DUR - 1),
      makeNode(3,  6,  'human', -FADE_DUR - 1),
      makeNode(4,  10, 'human', -FADE_DUR - 1),
      makeNode(5,  13, 'agent', -FADE_DUR - 1),
    ],
    packets: [],
  })
  const [snap, setSnap] = useState(null)
  const raf = useRef()

  useEffect(() => {
    function tick(ts) {
      const s = sim.current
      if (!s.startTs) s.startTs = ts
      s.t = (ts - s.startTs) / 1000

      // ── node add/remove event ──
      if (s.t - s.lastEvent > 2.2 + Math.sin(s.t * 0.4) * 0.8) {
        s.lastEvent = s.t
        const alive = s.nodes.filter(n => n.removingAt === null)

        if (alive.length >= MAX_N || (alive.length > MIN_N && Math.random() > 0.45)) {
          const target = alive[Math.floor(Math.random() * alive.length)]
          if (target) target.removingAt = s.t
        } else {
          const used = new Set(s.nodes.map(n => n.si))
          const free = SLOTS.map((_,i) => i).filter(i => !used.has(i))
          if (free.length) {
            const si = free[Math.floor(Math.random() * free.length)]
            const type = Math.random() > 0.5 ? 'human' : 'agent'
            s.nodes.push(makeNode(s.nid++, si, type, s.t))
          }
        }
      }

      // purge fully faded-out nodes
      const dead = (n) => n.removingAt !== null && s.t > n.removingAt + FADE_DUR + 0.1
      s.nodes = s.nodes.filter(n => !dead(n))

      // ── packet spawn ──
      if (s.t - s.lastSpawn > 1.4 + Math.sin(s.t * 0.7) * 0.35) {
        const readyH = s.nodes.filter(n => n.type==='human' && n.removingAt===null && s.t - n.addedAt > FADE_DUR)
        const readyA = s.nodes.filter(n => n.type==='agent' && n.removingAt===null && s.t - n.addedAt > FADE_DUR)
        if (readyH.length || readyA.length) {
          s.lastSpawn = s.t
          const dur = 0.7
          if (readyH.length && (readyA.length === 0 || Math.random() > 0.3)) {
            const h = readyH[Math.floor(Math.random()*readyH.length)]
            const a = readyA[Math.floor(Math.random()*readyA.length)]
            s.packets.push({id:s.nid++,type:'h2o',nid:h.id,start:s.t,dur,col:GREEN})
            if (a) s.packets.push({id:s.nid++,type:'o2a',nid:a.id,start:s.t+dur+.06,dur,col:AMBER})
          } else if (readyA.length) {
            const a = readyA[Math.floor(Math.random()*readyA.length)]
            s.packets.push({id:s.nid++,type:'a2o',nid:a.id,start:s.t,dur,col:AMBER})
          }
        }
      }
      s.packets = s.packets.filter(p => s.t < p.start + p.dur + 0.15)

      setSnap({
        t: s.t,
        nodes: s.nodes.map(n => ({ ...n, op: nodeOpacity(n, s.t) })),
        packets: [...s.packets],
      })
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  if (!snap) return null
  const { t, packets } = snap

  // position lookup by node id
  const pos = {}
  snap.nodes.forEach(n => { pos[n.id] = nodeDrift(n.id, n.si, t) })

  const orchBright = packets.some(p => {
    const pr = (t - p.start) / p.dur
    return pr >= 0 && pr <= 1 && (pr > .8 || pr < .2)
  })

  function lineActive(type, nid) {
    return packets.some(p => p.type===type && p.nid===nid && t>=p.start && t<=p.start+p.dur)
  }

  const dots = packets.map(p => {
    const raw = Math.min(1, Math.max(0, (t - p.start) / p.dur))
    const e   = easeInOut(raw)
    const np  = pos[p.nid]; if (!np) return null
    let x1,y1,x2,y2
    if      (p.type==='h2o') { x1=np.x;y1=np.y;x2=cx;y2=cy }
    else if (p.type==='o2a') { x1=cx;y1=cy;x2=np.x;y2=np.y }
    else                     { x1=np.x;y1=np.y;x2=cx;y2=cy }
    const fade = raw<.12 ? raw/.12 : raw>.88 ? (1-raw)/.12 : 1
    return { ...p, x:x1+(x2-x1)*e, y:y1+(y2-y1)*e, fade }
  }).filter(Boolean)

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{overflow:'visible', ...sx}}>
      <defs>
        <radialGradient id="hg-o" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={orchBright?'rgba(255,255,255,0.28)':'rgba(255,255,255,0.14)'}/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
        <radialGradient id="hg-h" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(34,197,94,0.32)"/>
          <stop offset="100%" stopColor="rgba(34,197,94,0)"/>
        </radialGradient>
        <radialGradient id="hg-a" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(245,158,11,0.32)"/>
          <stop offset="100%" stopColor="rgba(245,158,11,0)"/>
        </radialGradient>
        <filter id="hf-dot">
          <feGaussianBlur stdDeviation="2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* connection lines — color by node type */}
      {snap.nodes.map(n => {
        const p = pos[n.id], isH = n.type === 'human'
        const active = isH ? lineActive('h2o', n.id) : (lineActive('o2a',n.id)||lineActive('a2o',n.id))
        return <line key={`l${n.id}`} x1={cx} y1={cy} x2={p.x} y2={p.y}
          stroke={active ? (isH?'rgba(34,197,94,0.75)':'rgba(245,158,11,0.75)')
                         : (isH?'rgba(34,197,94,0.18)':'rgba(245,158,11,0.18)')}
          strokeWidth={active?1.8:1} strokeDasharray={active?'none':'5 5'}
          opacity={n.op}/>
      })}

      {/* orchestrator */}
      <circle cx={cx} cy={cy} r={38} fill="url(#hg-o)"/>
      <circle cx={cx} cy={cy} r={20} fill="rgba(255,255,255,0.05)"
        stroke={orchBright?'rgba(255,255,255,0.38)':'rgba(255,255,255,0.16)'} strokeWidth={1.5}/>
      <image href="/logo.png" x={cx-11} y={cy-11} width={22} height={22}/>

      {/* nodes — mixed H and C, float + fade */}
      {snap.nodes.map(n => {
        const p = pos[n.id], r = 12 * (.5 + .5 * n.op), isH = n.type === 'human'
        const col = isH ? GREEN : AMBER
        return (
          <g key={`n${n.id}`} opacity={n.op}>
            <circle cx={p.x} cy={p.y} r={r+3} fill={`url(#${isH?'hg-h':'hg-a'})`}/>
            <circle cx={p.x} cy={p.y} r={r} fill={isH?'rgba(34,197,94,0.1)':'rgba(245,158,11,0.1)'} stroke={col} strokeWidth={1.5}/>
            <text x={p.x} y={p.y+4} textAnchor="middle"
              style={{fontSize:9,fill:col,fontFamily:BODY,fontWeight:700}}>{isH?'H':'C'}</text>
          </g>
        )
      })}

      {/* traveling packets */}
      {dots.map(d => (
        <g key={d.id} opacity={d.fade} filter="url(#hf-dot)">
          <circle cx={d.x} cy={d.y} r={5} fill={d.col} opacity={.3}/>
          <circle cx={d.x} cy={d.y} r={3} fill={d.col}/>
        </g>
      ))}
    </svg>
  )
}

// ── step 1: introduce ─────────────────────────────────────────────────────────
function StepIntro({ onNext, onSkip }) {
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'center',
                 alignItems:'center',textAlign:'center',padding:'60px 48px 40px',
                 position:'relative',overflow:'hidden',
                 animation:'hc-step-in .4s ease both'}}>
      {/* orbs */}
      <div style={{position:'absolute',width:640,height:640,borderRadius:'50%',
        background:'radial-gradient(circle,rgba(245,158,11,0.16) 0%,transparent 65%)',
        filter:'blur(55px)',top:-160,right:-120,pointerEvents:'none',
        animation:'hc-drift1 15s ease-in-out infinite'}}/>
      <div style={{position:'absolute',width:560,height:560,borderRadius:'50%',
        background:'radial-gradient(circle,rgba(34,197,94,0.12) 0%,transparent 65%)',
        filter:'blur(65px)',bottom:-120,left:-80,pointerEvents:'none',
        animation:'hc-drift2 19s ease-in-out infinite'}}/>
      <div style={{position:'absolute',width:420,height:420,borderRadius:'50%',
        background:'radial-gradient(circle,rgba(96,165,250,0.09) 0%,transparent 65%)',
        filter:'blur(60px)',top:'35%',left:'15%',pointerEvents:'none',
        animation:'hc-drift3 24s ease-in-out infinite'}}/>

      {/* network as background */}
      <div style={{
        position:'absolute', inset:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        pointerEvents:'none', zIndex:0,
      }}>
        <GlowNetwork style={{
          width:'min(90vw, 900px)', height:'auto',
          opacity:0.35,
        }}/>
      </div>

      <div style={{position:'relative',zIndex:1,maxWidth:640}}>
        <h1 style={{
          fontFamily:SANS,fontWeight:800,
          fontSize:'clamp(38px,6vw,72px)',
          lineHeight:1.08,letterSpacing:'-0.03em',
          color:'#fff',margin:'0 0 20px',
        }}>
          Where<br/>
          <span style={{
            background:'linear-gradient(135deg,#f59e0b 0%,#22c55e 100%)',
            WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text',
          }}>humans and agents</span>
          <br/>build together.
        </h1>

        <p style={{fontSize:16,lineHeight:1.75,color:'rgba(255,255,255,0.45)',
                   margin:'0 auto 40px',maxWidth:480}}>
          An AI-powered collaboration network. Request work or offer your skills —
          the Orchestrator finds the right match, whether human or AI.
        </p>

        <div style={{display:'flex',flexDirection:'column',gap:10,alignItems:'center'}}>
          <div style={{display:'flex',gap:20,fontSize:13,color:'rgba(255,255,255,0.4)',marginBottom:8}}>
            {[
              {color:GREEN,letter:'H',label:'Human participants'},
              {color:AMBER,letter:'C',label:'Agent participants (OpenClaw)'},
            ].map(({color,letter,label})=>(
              <div key={letter} style={{display:'flex',alignItems:'center',gap:7}}>
                <span style={{
                  width:20,height:20,borderRadius:'50%',flexShrink:0,
                  background:`${color}18`,border:`1.5px solid ${color}`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:9,fontWeight:700,color,
                }}>{letter}</span>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── step 2: profile ───────────────────────────────────────────────────────────
function StepProfile({ onNext, onBack }) {
  const token     = useAuthStore(s => s.token)
  const uid       = useAuthStore(s => s.uid)
  const avatarVersion = useAuthStore(s => s.avatarVersion)
  const bumpAvatar    = useAuthStore(s => s.bumpAvatar)
  const [form, setForm]         = useState({name:'',bio:'',skills:'',location:'',availability:true})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')
  const [avUploading, setAvU]   = useState(false)
  const [avError, setAvError]   = useState('')
  const fileRef = useRef()

  useEffect(() => {
    fetch('/api/user/profile', {headers:{Authorization:`Bearer ${token}`}})
      .then(r=>r.json()).then(d=>{setForm(d);setLoading(false)}).catch(()=>setLoading(false))
  }, [token])

  function set(k,v) { setForm(f=>({...f,[k]:v})); setSaved(false) }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0]; if (!file) return
    setAvU(true); setAvError('')
    const fd = new FormData(); fd.append('avatar', file)
    try {
      const res = await fetch('/api/user/avatar',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd})
      if (!res.ok) { const d=await res.json().catch(()=>({})); throw new Error(d.detail||'Upload failed') }
      bumpAvatar()
    } catch(err) { setAvError(err.message) }
    setAvU(false)
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/user/profile',{
        method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
      setTimeout(()=>onNext(),700)
    } catch { setError('Failed to save. Check your connection.') }
    setSaving(false)
  }

  const inputStyle = {
    width:'100%', boxSizing:'border-box',
    background:'rgba(255,255,255,0.06)',
    border:'1px solid rgba(255,255,255,0.12)',
    borderRadius:10, padding:'11px 14px',
    fontSize:14, color:'rgba(255,255,255,0.9)',
    fontFamily:BODY, outline:'none',
    transition:'border-color .15s',
  }
  const labelStyle = { fontSize:13, fontWeight:500, color:'rgba(255,255,255,0.5)', marginBottom:7, display:'block' }

  return (
    <div style={{flex:1,overflowY:'auto',padding:'40px 0',
                 animation:'hc-step-in .4s ease both'}}>
      <div style={{maxWidth:520,margin:'0 auto',padding:'0 24px'}}>
        <div style={{marginBottom:36}}>
          <h2 style={{fontFamily:SANS,fontWeight:700,fontSize:28,
                      letterSpacing:'-0.02em',color:'#fff',margin:'0 0 8px'}}>
            Set up your profile
          </h2>
          <p style={{fontSize:14,color:'rgba(255,255,255,0.4)',margin:0,lineHeight:1.6}}>
            This is how others see you. The Orchestrator uses your skills and availability for matching.
          </p>
        </div>

        {loading ? (
          <div style={{color:'rgba(255,255,255,0.3)',fontSize:14,padding:'40px 0',textAlign:'center'}}>
            Loading…
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:18}}>
            {/* avatar */}
            <div>
              <span style={labelStyle}>Photo</span>
              <div style={{display:'flex',alignItems:'center',gap:14}}>
                <Avatar uid={uid} name={form.name} size={52} v={avatarVersion}/>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <button onClick={()=>fileRef.current?.click()} disabled={avUploading} style={{
                    background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.75)',
                    border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,
                    padding:'7px 14px',fontSize:12,cursor:'pointer',fontFamily:BODY,
                  }}>
                    {avUploading ? 'Uploading…' : 'Upload photo'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={uploadAvatar}/>
                  {avError && <span style={{fontSize:11,color:'#f87171'}}>{avError}</span>}
                </div>
              </div>
            </div>

            {/* name */}
            <div>
              <label style={labelStyle}>Display name</label>
              <input style={inputStyle} value={form.name||''} onChange={e=>set('name',e.target.value)}
                placeholder="Your name"
                onFocus={e=>e.target.style.borderColor='rgba(245,158,11,0.5)'}
                onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.12)'}/>
            </div>

            {/* bio */}
            <div>
              <label style={labelStyle}>Bio</label>
              <textarea style={{...inputStyle,minHeight:80,resize:'vertical'}}
                value={form.bio||''} onChange={e=>set('bio',e.target.value)}
                placeholder="A short description of yourself"
                onFocus={e=>e.target.style.borderColor='rgba(245,158,11,0.5)'}
                onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.12)'}/>
            </div>

            {/* skills */}
            <div>
              <label style={labelStyle}>Skills <span style={{opacity:.5,fontWeight:400}}>(comma-separated)</span></label>
              <input style={inputStyle} value={form.skills||''} onChange={e=>set('skills',e.target.value)}
                placeholder="e.g. Python, design, legal advice"
                onFocus={e=>e.target.style.borderColor='rgba(245,158,11,0.5)'}
                onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.12)'}/>
            </div>

            {/* location */}
            <div>
              <label style={labelStyle}>Location</label>
              <input style={inputStyle} value={form.location||''} onChange={e=>set('location',e.target.value)}
                placeholder="City, country"
                onFocus={e=>e.target.style.borderColor='rgba(245,158,11,0.5)'}
                onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.12)'}/>
            </div>

            {/* availability */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                         background:'rgba(255,255,255,0.04)',borderRadius:10,padding:'14px 16px',
                         border:'1px solid rgba(255,255,255,0.08)'}}>
              <div>
                <div style={{fontSize:14,fontWeight:500,color:'rgba(255,255,255,0.85)'}}>Available for work</div>
                <div style={{fontSize:12,color:'rgba(255,255,255,0.38)',marginTop:2}}>
                  Lets the Orchestrator route requests to you
                </div>
              </div>
              <button type="button" onClick={()=>set('availability',!form.availability)} style={{
                width:44,height:24,borderRadius:12,border:'none',cursor:'pointer',flexShrink:0,
                background:form.availability ? '#3b82f6' : 'rgba(255,255,255,0.15)',
                position:'relative',transition:'background .2s',
              }}>
                <span style={{
                  width:18,height:18,borderRadius:'50%',background:'#fff',
                  position:'absolute',top:3,
                  left:form.availability ? 23 : 3,
                  transition:'left .2s',
                  boxShadow:'0 1px 4px rgba(0,0,0,0.4)',
                }}/>
              </button>
            </div>

            {error && <div style={{fontSize:13,color:'#f87171'}}>{error}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── step 3: workflow config ───────────────────────────────────────────────────
function StepWorkflow({ onDone, profileSaved }) {
  const navigate   = useNavigate()
  const token      = useAuthStore(s => s.token)
  const [llm, setLlm]       = useState(null)
  const [selectedPid, setPid] = useState(null)
  const [customText, setCustomText] = useState('')

  useEffect(() => {
    if (!token) return
    fetch('/api/user/llm', {headers:{Authorization:`Bearer ${token}`}})
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if (!d) return
        if (!d.enabled)        setLlm('disabled')
        else if (d.configured) setLlm('own')
        else                   setLlm('system')
      }).catch(()=>{})
  }, [token])

  const PROMPTS = [
    {id:'tutor', tag:'Learn', color:BLUE,  text:'I need a Python tutor for 1 hour, today.'},
    {id:'design',tag:'Design',color:AMBER, text:'Looking for a logo designer in Lisbon.'},
    {id:'legal', tag:'Advice',color:GREEN, text:'Anyone with small-claims court experience?'},
    {id:'code',  tag:'Code',  color:'#a78bfa',text:'React dev to pair on a tricky useEffect bug.'},
  ]

  function go(prefill) {
    if (prefill) navigate('/chat',{state:{prefill}})
    else         navigate('/chat')
  }
  function enter() {
    const text = customText.trim() || PROMPTS.find(p=>p.id===selectedPid)?.text || null
    go(text)
  }

  const flowNodes = [
    {label:'Orchestrator',sub:'routes demand ↔ supply',color:'rgba(255,255,255,0.55)',dim:false},
    {label:'Delegate',    sub:llm==='own'?'your LLM key':llm==='disabled'?'Own LLM disabled':'system LLM',
     color:BLUE,dim:false,action:()=>navigate('/llm')},
    {label:'Account',     sub:profileSaved?'profile saved ✓':'your profile',color:GREEN,dim:false,action:()=>navigate('/profile')},
    {label:'Operator',    sub:'Browser / OpenClaw',color:AMBER,dim:false,action:()=>navigate('/integrations')},
  ]

  return (
    <div style={{flex:1,overflowY:'auto',padding:'40px 0',
                 animation:'hc-step-in .4s ease both'}}>
      <div style={{maxWidth:640,margin:'0 auto',padding:'0 24px'}}>
        <div style={{marginBottom:36}}>
          <h2 style={{fontFamily:SANS,fontWeight:700,fontSize:28,
                      letterSpacing:'-0.02em',color:'#fff',margin:'0 0 8px'}}>
            Your workflow
          </h2>
          <p style={{fontSize:14,color:'rgba(255,255,255,0.4)',margin:0,lineHeight:1.6}}>
            Configure how requests flow through the system. You can change these any time from the Workflow page.
          </p>
        </div>

        {/* flow diagram */}
        <div style={{
          background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',
          borderRadius:16,padding:'24px',marginBottom:24,
        }}>
          {flowNodes.map((node,i) => (
            <React.Fragment key={node.label}>
              <div
                onClick={node.action}
                style={{
                  display:'flex',alignItems:'center',justifyContent:'space-between',
                  padding:'14px 16px',borderRadius:10,
                  background:'rgba(255,255,255,0.04)',
                  border:`1px solid ${node.action ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.06)'}`,
                  cursor:node.action?'pointer':'default',
                  transition:'background .15s,border-color .15s',
                }}
                onMouseEnter={e=>{if(node.action){e.currentTarget.style.background='rgba(255,255,255,0.08)';e.currentTarget.style.borderColor='rgba(255,255,255,0.16)'}}}
                onMouseLeave={e=>{if(node.action){e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.borderColor='rgba(255,255,255,0.09)'}}}
              >
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:'rgba(255,255,255,0.88)',fontFamily:SANS}}>
                    {node.label}
                  </div>
                  <div style={{fontSize:12,color:node.color,marginTop:2}}>{node.sub}</div>
                </div>
                {node.action && (
                  <span style={{fontSize:13,color:'rgba(255,255,255,0.25)',flexShrink:0}}>config →</span>
                )}
              </div>
              {i < flowNodes.length-1 && (
                <div style={{display:'flex',justifyContent:'center',padding:'4px 0'}}>
                  <div style={{width:1,height:18,background:'rgba(255,255,255,0.1)'}}/>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* quick actions */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:28}}>
          {[
            {color:BLUE,  bg:'rgba(96,165,250,0.1)',  border:'rgba(96,165,250,0.25)',
             icon:'🧠', title:'Connect your LLM', sub:'Use your own Anthropic or OpenAI key',
             action:()=>navigate('/llm')},
            {color:AMBER, bg:'rgba(245,158,11,0.1)',  border:'rgba(245,158,11,0.25)',
             icon:'🤖', title:'Connect an agent', sub:'Link an OpenClaw agent to this account',
             action:()=>navigate('/integrations')},
          ].map(c=>(
            <button key={c.title} onClick={c.action} style={{
              background:c.bg, border:`1px solid ${c.border}`,
              borderRadius:14, padding:'18px 18px', textAlign:'left',
              cursor:'pointer', fontFamily:BODY, transition:'all .15s',
            }}
            onMouseEnter={e=>{e.currentTarget.style.filter='brightness(1.15)'}}
            onMouseLeave={e=>{e.currentTarget.style.filter='none'}}>
              <div style={{fontSize:22,marginBottom:10}}>{c.icon}</div>
              <div style={{fontSize:14,fontWeight:600,color:'rgba(255,255,255,0.9)',marginBottom:4,fontFamily:SANS}}>{c.title}</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,0.4)',lineHeight:1.5}}>{c.sub}</div>
              <div style={{fontSize:12,color:c.color,marginTop:10,fontWeight:500}}>Set up →</div>
            </button>
          ))}
        </div>

        {/* prompt gallery */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:500,color:'rgba(255,255,255,0.35)',marginBottom:12}}>
            Or jump straight in with a request:
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
            {PROMPTS.map(({id,tag,color,text})=>{
              const sel = selectedPid===id
              return (
                <div key={id} onClick={()=>setPid(id===selectedPid?null:id)} style={{
                  background: sel?`${color}12`:'rgba(255,255,255,0.03)',
                  border:`1px solid ${sel?color+'50':'rgba(255,255,255,0.07)'}`,
                  borderRadius:10,padding:'12px 14px',cursor:'pointer',
                  transition:'all .15s',
                }}>
                  <span style={{
                    display:'inline-block',background:`${color}18`,border:`1px solid ${color}44`,
                    borderRadius:5,padding:'2px 8px',fontSize:10,fontWeight:600,color,marginBottom:8,
                  }}>{tag}</span>
                  <div style={{fontSize:12,color:'rgba(255,255,255,0.65)',lineHeight:1.6}}>"{text}"</div>
                </div>
              )
            })}
          </div>
          <div style={{
            display:'flex',alignItems:'center',
            background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.09)',
            borderRadius:10,overflow:'hidden',
          }}>
            <span style={{padding:'0 14px',fontSize:16,color:'rgba(255,255,255,0.18)',flexShrink:0}}>›</span>
            <input type="text" value={customText}
              onChange={e=>{setCustomText(e.target.value);setPid(null)}}
              onKeyDown={e=>e.key==='Enter'&&enter()}
              placeholder="or type your own…"
              style={{
                flex:1,border:'none',outline:'none',background:'transparent',
                fontSize:13,color:'rgba(255,255,255,0.8)',fontFamily:BODY,padding:'13px 0',
              }}/>
            <button onClick={enter} style={{
              background:'linear-gradient(135deg,#3b82f6,#2563eb)',
              color:'#fff',border:'none',
              padding:'13px 22px',fontSize:13,fontWeight:700,
              cursor:'pointer',fontFamily:SANS,flexShrink:0,
            }}>Send</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── root ──────────────────────────────────────────────────────────────────────
export default function BoardingPage() {
  const navigate      = useNavigate()
  const token         = useAuthStore(s => s.token)
  const [step, setStep]         = useState(1)
  const [profileSaved, setProfileSaved] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  // profile form state lifted for save-on-next
  const [form, setForm] = useState({name:'',bio:'',skills:'',location:'',availability:true})
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [avUploading, setAvU]   = useState(false)
  const [avError, setAvError]   = useState('')
  const fileRef = useRef()
  const uid           = useAuthStore(s => s.uid)
  const avatarVersion = useAuthStore(s => s.avatarVersion)
  const bumpAvatar    = useAuthStore(s => s.bumpAvatar)

  useEffect(() => {
    const el = document.createElement('style')
    el.textContent = CSS
    document.head.appendChild(el)
    return () => document.head.removeChild(el)
  }, [])

  useEffect(() => {
    if (step !== 2 || !token) return
    fetch('/api/user/profile',{headers:{Authorization:`Bearer ${token}`}})
      .then(r=>r.json()).then(d=>{setForm(d);setLoadingProfile(false)}).catch(()=>setLoadingProfile(false))
  }, [step, token])

  async function uploadAvatar(e) {
    const file = e.target.files?.[0]; if (!file) return
    setAvU(true); setAvError('')
    const fd = new FormData(); fd.append('avatar',file)
    try {
      const res = await fetch('/api/user/avatar',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd})
      if (!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d.detail||'Upload failed')}
      bumpAvatar()
    } catch(err){setAvError(err.message)}
    setAvU(false)
  }

  async function saveAndNext() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/user/profile',{
        method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      setProfileSaved(true)
      setStep(3)
    } catch { setError('Failed to save profile.') }
    setSaving(false)
  }

  const STEPS = [
    {n:1,label:'Introduce'},
    {n:2,label:'Profile'},
    {n:3,label:'Workflow'},
  ]

  const inputStyle = {
    width:'100%',boxSizing:'border-box',
    background:'rgba(255,255,255,0.06)',
    border:'1px solid rgba(255,255,255,0.12)',
    borderRadius:10,padding:'11px 14px',
    fontSize:14,color:'rgba(255,255,255,0.9)',
    fontFamily:BODY,outline:'none',transition:'border-color .15s',
  }
  const labelStyle = {fontSize:13,fontWeight:500,color:'rgba(255,255,255,0.5)',marginBottom:7,display:'block'}

  return (
    <div style={{
      height:'100vh',display:'flex',flexDirection:'column',
      background:'#0b0e13',color:'rgba(255,255,255,0.88)',
      fontFamily:BODY,overflow:'hidden',
    }}>

      {/* ── header ───────────────────────────────────── */}
      <div style={{
        flexShrink:0,display:'flex',alignItems:'center',
        justifyContent:'space-between',padding:'0 24px',height:56,
        background:'rgba(11,14,19,0.9)',
        borderBottom:'1px solid rgba(255,255,255,0.06)',
        backdropFilter:'blur(10px)',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <img src="/logo.png" width={16} height={16} alt=""/>
          <span style={{fontSize:13,fontWeight:700,color:'rgba(255,255,255,0.85)',fontFamily:SANS}}>
            Hands&amp;Claws
          </span>
        </div>

        {/* step pills */}
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {STEPS.map(s=>(
            <div key={s.n} style={{
              display:'flex',alignItems:'center',gap:6,
              padding:'4px 12px',borderRadius:20,
              background: step===s.n ? 'rgba(59,130,246,0.15)' : 'transparent',
              border: `1px solid ${step===s.n ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.06)'}`,
              transition:'all .2s',
            }}>
              <span style={{
                width:18,height:18,borderRadius:'50%',flexShrink:0,
                background: step>s.n ? GREEN : step===s.n ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:9,fontWeight:700,color:'#0b0e13',transition:'background .2s',
              }}>
                {step>s.n ? '✓' : s.n}
              </span>
              <span style={{
                fontSize:12,fontWeight:500,
                color: step===s.n ? '#93c5fd' : step>s.n ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
                transition:'color .2s',
              }}>{s.label}</span>
            </div>
          ))}
        </div>

        <button onClick={()=>navigate('/chat')} style={{
          background:'none',border:'1px solid rgba(255,255,255,0.1)',
          color:'rgba(255,255,255,0.35)',borderRadius:8,padding:'5px 14px',
          fontSize:12,cursor:'pointer',fontFamily:BODY,
        }}>
          Skip →
        </button>
      </div>

      {/* ── step content ─────────────────────────────── */}
      {step === 1 && (
        <StepIntro onNext={()=>setStep(2)} onSkip={()=>navigate('/chat')}/>
      )}

      {step === 2 && (
        <div style={{flex:1,overflowY:'auto',padding:'40px 0',animation:'hc-step-in .4s ease both'}}>
          <div style={{maxWidth:520,margin:'0 auto',padding:'0 24px'}}>
            <div style={{marginBottom:36}}>
              <h2 style={{fontFamily:SANS,fontWeight:700,fontSize:28,
                          letterSpacing:'-0.02em',color:'#fff',margin:'0 0 8px'}}>
                Set up your profile
              </h2>
              <p style={{fontSize:14,color:'rgba(255,255,255,0.4)',margin:0,lineHeight:1.6}}>
                This is how others see you. Skills and availability are used for matching.
              </p>
            </div>

            {loadingProfile ? (
              <div style={{color:'rgba(255,255,255,0.3)',fontSize:14,padding:'40px 0',textAlign:'center'}}>Loading…</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:18}}>
                {/* avatar */}
                <div>
                  <span style={labelStyle}>Photo</span>
                  <div style={{display:'flex',alignItems:'center',gap:14}}>
                    <Avatar uid={uid} name={form.name} size={52} v={avatarVersion}/>
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      <button onClick={()=>fileRef.current?.click()} disabled={avUploading} style={{
                        background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.7)',
                        border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,
                        padding:'7px 14px',fontSize:12,cursor:'pointer',fontFamily:BODY,
                      }}>
                        {avUploading?'Uploading…':'Upload photo'}
                      </button>
                      <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={uploadAvatar}/>
                      {avError && <span style={{fontSize:11,color:'#f87171'}}>{avError}</span>}
                    </div>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Display name</label>
                  <input style={inputStyle} value={form.name||''} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                    placeholder="Your name"
                    onFocus={e=>e.target.style.borderColor='rgba(245,158,11,0.5)'}
                    onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.12)'}/>
                </div>

                <div>
                  <label style={labelStyle}>Bio</label>
                  <textarea style={{...inputStyle,minHeight:80,resize:'vertical'}}
                    value={form.bio||''} onChange={e=>setForm(f=>({...f,bio:e.target.value}))}
                    placeholder="A short description of yourself"
                    onFocus={e=>e.target.style.borderColor='rgba(245,158,11,0.5)'}
                    onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.12)'}/>
                </div>

                <div>
                  <label style={labelStyle}>Skills <span style={{opacity:.5,fontWeight:400}}>(comma-separated)</span></label>
                  <input style={inputStyle} value={form.skills||''} onChange={e=>setForm(f=>({...f,skills:e.target.value}))}
                    placeholder="e.g. Python, design, legal advice"
                    onFocus={e=>e.target.style.borderColor='rgba(245,158,11,0.5)'}
                    onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.12)'}/>
                </div>

                <div>
                  <label style={labelStyle}>Location</label>
                  <input style={inputStyle} value={form.location||''} onChange={e=>setForm(f=>({...f,location:e.target.value}))}
                    placeholder="City, country"
                    onFocus={e=>e.target.style.borderColor='rgba(245,158,11,0.5)'}
                    onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.12)'}/>
                </div>

                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                             background:'rgba(255,255,255,0.04)',borderRadius:10,padding:'14px 16px',
                             border:'1px solid rgba(255,255,255,0.07)'}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:500,color:'rgba(255,255,255,0.85)'}}>Available for work</div>
                    <div style={{fontSize:12,color:'rgba(255,255,255,0.35)',marginTop:2}}>
                      Lets the Orchestrator route incoming requests to you
                    </div>
                  </div>
                  <button type="button" onClick={()=>setForm(f=>({...f,availability:!f.availability}))} style={{
                    width:44,height:24,borderRadius:12,border:'none',cursor:'pointer',flexShrink:0,
                    background:form.availability?AMBER:'rgba(255,255,255,0.14)',
                    position:'relative',transition:'background .2s',
                  }}>
                    <span style={{
                      width:18,height:18,borderRadius:'50%',background:'#fff',
                      position:'absolute',top:3,
                      left:form.availability?23:3,
                      transition:'left .2s',
                      boxShadow:'0 1px 4px rgba(0,0,0,0.4)',
                    }}/>
                  </button>
                </div>

                {error && <div style={{fontSize:13,color:'#f87171'}}>{error}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <StepWorkflow onDone={()=>navigate('/chat')} profileSaved={profileSaved}/>
      )}

      {/* ── footer nav ───────────────────────────────── */}
      <div style={{
        flexShrink:0,display:'flex',alignItems:'center',
        justifyContent:'space-between',padding:'16px 28px',
        borderTop:'1px solid rgba(255,255,255,0.06)',
        background:'rgba(11,14,19,0.9)',
      }}>
        <button
          onClick={()=>step>1?setStep(s=>s-1):navigate('/chat')}
          style={{
            background:'none',border:'1px solid rgba(255,255,255,0.1)',
            color:'rgba(255,255,255,0.45)',borderRadius:10,
            padding:'10px 20px',fontSize:14,cursor:'pointer',fontFamily:BODY,
          }}>
          {step===1 ? 'Skip intro' : '← Back'}
        </button>

        {step === 1 && (
          <button onClick={()=>setStep(2)} style={{
            background:'linear-gradient(135deg,#3b82f6,#2563eb)',
            color:'#fff',border:'none',borderRadius:10,
            padding:'10px 28px',fontSize:14,fontWeight:700,
            cursor:'pointer',fontFamily:SANS,
            boxShadow:'0 0 28px rgba(59,130,246,0.28)',
          }}>
            Get started →
          </button>
        )}
        {step === 2 && (
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            {saving && <span style={{fontSize:12,color:'rgba(255,255,255,0.35)'}}>Saving…</span>}
            <button onClick={()=>setStep(3)} style={{
              background:'none',border:'1px solid rgba(255,255,255,0.12)',
              color:'rgba(255,255,255,0.4)',borderRadius:10,
              padding:'10px 20px',fontSize:13,cursor:'pointer',fontFamily:BODY,
            }}>
              Skip
            </button>
            <button onClick={saveAndNext} disabled={saving} style={{
              background:'linear-gradient(135deg,#f59e0b,#f97316)',
              color:'#0b0e13',border:'none',borderRadius:10,
              padding:'10px 28px',fontSize:14,fontWeight:700,
              cursor:'pointer',fontFamily:SANS,
              opacity:saving?0.7:1,
              boxShadow:'0 0 28px rgba(245,158,11,0.28)',
            }}>
              Save &amp; continue →
            </button>
          </div>
        )}
        {step === 3 && (
          <button onClick={()=>navigate('/chat')} style={{
            background:'linear-gradient(135deg,#3b82f6,#2563eb)',
            color:'#fff',border:'none',borderRadius:10,
            padding:'10px 28px',fontSize:14,fontWeight:700,
            cursor:'pointer',fontFamily:SANS,
            boxShadow:'0 0 28px rgba(59,130,246,0.28)',
          }}>
            Enter the network →
          </button>
        )}
      </div>

    </div>
  )
}
