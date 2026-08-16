export * from './utils/candidate-resolver.js'
export * from './utils/texture-streamer.js'
export { resolveVpxCandidates, resolveRomCandidates, fetchWithProgress } from './utils/candidate-resolver.js'
export { filterTextures } from './utils/texture-streamer.js'
export const $ = (id) => document.getElementById(id)
export const fmtBytes = (n) => (n < 1_048_576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1_048_576).toFixed(1)} MB`)
export const countObjects = (root) => { let c=0; root.traverse(()=>c++); return c }
export const computeTexMem = (root) => {
	let bytes=0,count=0; const seen=new Set()
	root.traverse((o)=>{ if(!o.isMesh||!o.material) return; for(const m of Array.isArray(o.material)?o.material:[o.material]) for(const k of ['map','emissiveMap']) { const t=m[k]; if(!t?.image||seen.has(t)) continue; seen.add(t); count++; const img=t.image; const w=img.width||0; const h=img.height||0; bytes+=w&&h?w*h*4:0 } })
	return { texCount: count, texMemMB: (bytes/1048576).toFixed(1) }
}
export const logMem = (log, stage) => { const m=performance.memory; if(m) log?.(`[mem] ${stage}: ${(m.usedJSHeapSize/1048576).toFixed(0)}/${(m.totalJSHeapSize/1048576).toFixed(0)} MB`, 'debug') }
export const aliasEvent = (e) => {
	const ALIAS={ArrowLeft:'ShiftLeft',KeyA:'ShiftLeft',ArrowRight:'ShiftRight',KeyD:'ShiftRight',Enter:'Enter',NumpadEnter:'Enter'}
	const code=ALIAS[e.code]; if(!code) return null; return { code, key: code==='Enter'?'Enter':'Shift', ts: Date.now() }
}
