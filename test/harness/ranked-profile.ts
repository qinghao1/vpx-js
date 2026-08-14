import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { Player } from '../../lib/game/player.js'
import { PlayerPhysics } from '../../lib/game/player-physics.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js'
import { ThreeTextureLoaderNode } from '../../lib/render/threejs/three-texture-loader-node.js'
import { Grammar } from '../../lib/scripting/grammar/grammar.js'
import { Transpiler } from '../../lib/scripting/transpiler.js'
import { Table } from '../../lib/vpt/table/table.js'
import { TableLoader } from '../../lib/vpt/table/table-loader.js'

const vpx = process.argv.find(a => a.startsWith('--vpx='))?.slice(6) ?? '/home/qinghao1/Downloads/walking_dead.vpx'
if (!fs.existsSync(vpx)) {
	console.error(`VPX not found ${vpx}`)
	process.exit(1)
}
const st = fs.statSync(vpx)
console.log(`Ranked profile for ${vpx} ${(st.size / 1048576).toFixed(1)} MB — ${new Date().toISOString()}`)

type Phase = { name: string; ms: number }
const phases: Phase[] = []
function push(name: string, ms: number) {
	phases.push({ name, ms })
}

const tTotal0 = performance.now()

const origGame = (TableLoader.prototype as any).loadGameItems
const origTex = (TableLoader.prototype as any).loadTextures
const origColl = (TableLoader.prototype as any).loadCollections
const origInfo = (TableLoader.prototype as any).loadTableInfo
let gameMs = 0
let texMs = 0
let collMs = 0
let infoMs = 0

;(TableLoader.prototype as any).loadGameItems = async function (...a: any[]) {
	const s = performance.now()
	const r = await origGame.apply(this, a)
	gameMs = performance.now() - s
	return r
}
;(TableLoader.prototype as any).loadTextures = async function (...a: any[]) {
	const s = performance.now()
	const r = await origTex.apply(this, a)
	texMs = performance.now() - s
	return r
}
;(TableLoader.prototype as any).loadCollections = async function (...a: any[]) {
	const s = performance.now()
	const r = await origColl.apply(this, a)
	collMs = performance.now() - s
	return r
}
;(TableLoader.prototype as any).loadTableInfo = async function (...a: any[]) {
	const s = performance.now()
	const r = await origInfo.apply(this, a)
	infoMs = performance.now() - s
	return r
}

let t = performance.now()
const table = await Table.load(new NodeBinaryReader(vpx))
let ms = performance.now() - t
push('Table.load', ms)
push('  loadGameItems', gameMs)
push('  loadTextures', texMs)
push('  loadCollections', collMs)
push('  loadTableInfo', infoMs)
push('  script+header+Ole', ms - gameMs - texMs - collMs - infoMs)

;(TableLoader.prototype as any).loadGameItems = origGame
;(TableLoader.prototype as any).loadTextures = origTex
;(TableLoader.prototype as any).loadCollections = origColl
;(TableLoader.prototype as any).loadTableInfo = origInfo

const isDeferred = (tx: any, tbl: Table) => {
	const n = tx.getName().toLowerCase()
	const pf = tbl.getPlayfieldMap().toLowerCase()
	if (n === pf) return false
	if (n.includes('nestmap') || n.includes('bake') || n.includes('playfield') || n === 'blueprintsv2noramps') return false
	const p = (tx.szPath || '').toLowerCase()
	if (p.endsWith('.exr') || p.endsWith('.hdr') || (tx as any).isHdr?.()) return true
	return tx.width * tx.height > 1_048_576
}
const RE_BAKE_MAP = /bake|nestmap/i

const loader = new ThreeTextureLoaderNode()
const api = new ThreeRenderApi({ applyMaterials: true, applyTextures: loader as any, optimizeTextures: false })
const genOpts: any = {
	exportPlayfield: true,
	exportPrimitives: true,
	exportFlippers: true,
	exportBumpers: true,
	exportRamps: true,
	exportSurfaces: true,
	exportRubbers: true,
	exportLightBulbs: true,
	exportHitTargets: true,
	exportGates: true,
	exportKickers: true,
	exportTriggers: true,
	exportSpinners: true,
	exportPlungers: true,
}
t = performance.now()
let node: any
try {
	node = await table.generateTableNode(api as any, { ...genOpts, preloadTextures: false } as any)
} catch (e: any) {
	console.warn(`generateTableNode failed: ${e.message?.slice(0, 500)}`)
}
let renderMs = performance.now() - t
push('Three.generateTableNode', renderMs)
{
	let tris = 0
	let meshes = 0
	if (node) {
		node.traverse((o: any) => {
			if (o.isMesh && o.geometry?.attributes?.position) {
				tris += o.geometry.attributes.position.count / 3
				meshes++
			}
		})
		console.log(` Three.generate ${renderMs.toFixed(0)}ms — meshes=${meshes} tris=${Math.round(tris / 1000)}k`)
	}
}

const allTex = Object.values((table as any).textures) as any[]
const totalTex = allTex.length
const totalBytesRaw = allTex.reduce((s, tx) => s + (tx.binary?.len ?? tx.pdsBuffer?.getData?.()?.length ?? 0), 0)
const high = allTex.filter(tx => !isDeferred(tx, table))
const deferred = allTex.filter(tx => isDeferred(tx, table))
high.sort((a, b) => a.width * a.height - b.width * b.height)
deferred.sort((a, b) => a.width * a.height - b.width * b.height)
let textures: any[] = [...high, ...deferred]
const pfMap = (() => {
	try {
		return table.getPlayfieldMap()?.toLowerCase() ?? ''
	} catch {
		return ''
	}
})()
if (pfMap) {
	const idx = textures.findIndex(tx => tx.getName().toLowerCase() === pfMap)
	if (idx > 0) {
		const [pfTx] = textures.splice(idx, 1)
		textures.unshift(pfTx)
	} else if (idx === -1) {
		const best = [...textures].sort((a, b) => b.width * b.height - a.width * a.height)[0]
		if (best) {
			const fIdx = textures.indexOf(best)
			if (fIdx > 0) {
				const [f] = textures.splice(fIdx, 1)
				textures.unshift(f)
			}
		}
	}
}
let filteredCount = textures.length
let usedSize = 0
let mainBakeSize = 0
if (node) {
	const used = new Set<string>()
	const mainBakeUsed = new Set<string>()
	node.traverse((o: any) => {
		if (!o.isMesh || !o.material) return
		const n = (o.name || '').toLowerCase()
		const isMainBake = n.includes('playfield') && (n.includes('bm_') || RE_BAKE_MAP.test(n))
		const mats = Array.isArray(o.material) ? o.material : [o.material]
		for (const m of mats) {
			for (const k of ['map', 'normalMap', 'envMap', 'emissiveMap'] as const) {
				const pk = `pending${k[0].toUpperCase()}${k.slice(1)}`
				const pending = m.userData?.[pk]
				if (pending) {
					const key = String(pending).toLowerCase()
					used.add(key)
					if (isMainBake) mainBakeUsed.add(key)
				}
				const tex = (m as any)[k]
				if (tex?.name) {
					const key = String(tex.name).replace(/^texture:/, '').toLowerCase()
					used.add(key)
					if (isMainBake) mainBakeUsed.add(key)
				}
			}
		}
	})
	usedSize = used.size
	mainBakeSize = mainBakeUsed.size
	const before = textures.length
	const keepAllInserts = (n: string) =>
		n.includes('insert') ||
		n.includes('round') ||
		n.includes('rect') ||
		n.includes('switc') ||
		n.includes('vrlight') ||
		n.includes('flasher') ||
		n.includes('scratches') ||
		n.includes('ball_') ||
		n.includes('bumper') ||
		n.includes('kicker') ||
		n.includes('bump')
	textures = textures.filter(tx => {
		const n = tx.getName().toLowerCase()
		if (used.has(n) || (pfMap && n === pfMap)) return true
		if (n.startsWith('vlm.nestmap') && !mainBakeUsed.has(n) && n !== pfMap) return false
		if (keepAllInserts(n)) return true
		return false
	})
	textures.sort((a, b) => {
		const aN = a.getName().toLowerCase()
		const bN = b.getName().toLowerCase()
		if (aN === pfMap && bN !== pfMap) return -1
		if (bN === pfMap && aN !== pfMap) return 1
		const aMain = mainBakeUsed.has(aN) ? 0 : 1
		const bMain = mainBakeUsed.has(bN) ? 0 : 1
		if (aMain !== bMain) return aMain - bMain
		const aCab = aN.includes('vrcab') || aN.includes('vr_') || aN.includes('lockbar') || aN.includes('cabinet') ? 0 : 1
		const bCab = bN.includes('vrcab') || bN.includes('vr_') || bN.includes('lockbar') || bN.includes('cabinet') ? 0 : 1
		if (aCab !== bCab) return aCab - bCab
		if (aMain === 0) return b.width * b.height - a.width * a.height
		if (aCab === 0) return b.width * b.height - a.width * a.height
		return a.width * a.height - b.width * b.height
	})
	filteredCount = textures.length
	console.log(
		` Textures all=${totalTex} high=${high.length} deferred=${deferred.length} filtered=${filteredCount} used=${usedSize} mainBake=${mainBakeSize} raw=${(totalBytesRaw / 1048576).toFixed(1)}MB pf=${pfMap || 'none'}`,
	)
	if (before !== filteredCount) console.log(` Filtered ${before} → ${filteredCount} (kept inserts, removed unused nestmaps)`)
}
const texMemMB = (textures.reduce((s, tx) => s + tx.width * tx.height * 4, 0) / 1048576).toFixed(1)
console.log(` Streaming ${textures.length} textures ~${texMemMB} MB decoded estimate (filtered)`)

let preloadMs = 0
let preloadOk = 0
let preloadFail = 0
if (textures.length) {
	const s = performance.now()
	await api.preloadTextures(textures, table, (_tx: any, ok: boolean) => {
		if (ok) preloadOk++
		else preloadFail++
	})
	preloadMs = performance.now() - s
	push('Three.preloadTextures (filtered)', preloadMs)
	const avg = textures.length ? (preloadMs / textures.length).toFixed(1) : '0'
	const cacheSize = (api as any).getMapGenerator?.().getCache?.()?.size ?? preloadOk
	console.log(
		` Three.preloadTextures ${preloadMs.toFixed(0)}ms — ${preloadOk}/${textures.length} ok ${preloadFail} fail avg ${avg}ms/tex cache=${cacheSize} ~${texMemMB}MB`,
	)
	if (high.length && deferred.length) {
		const filteredHigh = textures.filter(tx => !isDeferred(tx, table)).length
		const filteredDeferred = textures.length - filteredHigh
		console.log(`  filtered high=${filteredHigh} deferred=${filteredDeferred}`)
	}
}
let preloadAllMs = 0
if (process.argv.includes('--preload-all') && allTex.length) {
	const api2 = new ThreeRenderApi({ applyMaterials: true, applyTextures: new ThreeTextureLoaderNode() as any, optimizeTextures: false })
	await table.generateTableNode(api2 as any, { ...genOpts, preloadTextures: false } as any)
	const s2 = performance.now()
	await api2.preloadTextures(allTex, table)
	preloadAllMs = performance.now() - s2
	push('Three.preloadTextures (all)', preloadAllMs)
	console.log(` Three.preloadTextures(all) ${preloadAllMs.toFixed(0)}ms for ${allTex.length} tex`)
}

let grammarMs = 0
const pipelinePer = new Map<string, number>()
let genMs = 0
let execMs = 0
let physMs = 0

const origGrammar = (Grammar.prototype as any).transpile
;(Grammar.prototype as any).transpile = function (...a: any[]) {
	const s = performance.now()
	const r = origGrammar.apply(this, a)
	grammarMs = performance.now() - s
	return r
}

const origExecute = (Transpiler.prototype as any).execute
const origGen = (Transpiler.prototype as any).gen
const origPipeline = (Transpiler.prototype as any).pipeline

;(Transpiler.prototype as any).gen = function (ast: any, t0: number) {
	const s = performance.now()
	const r = origGen.call(this, ast, t0)
	genMs = performance.now() - s
	return r
}

;(Transpiler.prototype as any).pipeline = function (gf?: string, go?: string) {
	const fns = origPipeline.call(this, gf, go)
	const names = ['FunctionHoist', 'Event', 'Error', 'Reference', 'Scope', 'ClassThis', 'Ambiguity', 'Class', 'Wrap']
	return fns.map((fn: any, i: number) => (ast: any) => {
		const s = performance.now()
		const r = fn(ast)
		const e = performance.now() - s
		pipelinePer.set(names[i] ?? `step${i}`, (pipelinePer.get(names[i] ?? `step${i}`) ?? 0) + e)
		return r
	})
}

;(Transpiler.prototype as any).execute = function (...a: any[]) {
	const s = performance.now()
	const r = origExecute.apply(this, a)
	execMs = performance.now() - s
	return r
}

const origPhysInit = (PlayerPhysics.prototype as any).init
;(PlayerPhysics.prototype as any).init = function (...a: any[]) {
	const s = performance.now()
	const r = origPhysInit.apply(this, a)
	physMs = performance.now() - s
	return r
}

t = performance.now()
const player = new Player(table).init()
ms = performance.now() - t
push('Player.init', ms)
push('  PlayerPhysics.init', physMs)
push('  Transpiler.execute', execMs)
push('    Grammar.transpile', grammarMs)
for (const [k, v] of pipelinePer) push(`    Transformer:${k}`, v)
push('    escodegen.generate', genMs)
const other = execMs - grammarMs - Array.from(pipelinePer.values()).reduce((a, b) => a + b, 0) - genMs
push('    eval+play', other > 0 ? other : 0)

;(Grammar.prototype as any).transpile = origGrammar
;(Transpiler.prototype as any).execute = origExecute
;(Transpiler.prototype as any).gen = origGen
;(Transpiler.prototype as any).pipeline = origPipeline
;(PlayerPhysics.prototype as any).init = origPhysInit

const tTotal = performance.now() - tTotal0
push('TOTAL (Table+Three+Player)', tTotal)

phases.sort((a, b) => b.ms - a.ms)
console.log(`\n=== Ranked hotspots (full load inc. textures) ===`)
for (let i = 0; i < phases.length; i++) {
	const p = phases[i]!
	const pct = ((p.ms / tTotal) * 100).toFixed(1)
	console.log(
		`${String(i + 1).padStart(2)}. ${p.name.padEnd(50)} ${p.ms.toFixed(0).padStart(6)}ms  ${pct.padStart(5)}%`,
	)
}
console.log(`\nJSON:`)
console.log(JSON.stringify(phases, null, 2))
