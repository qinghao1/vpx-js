import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { Player } from '../../lib/game/player.js'
import { PlayerPhysics } from '../../lib/game/player-physics.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js'
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

t = performance.now()
const api = new ThreeRenderApi({ applyMaterials: true, applyTextures: false, optimizeTextures: false } as any)
const { Group } = await import('three')
const group = new Group()
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
let renderMs = 0
{
	const s = performance.now()
	for (const r of (table as any).getRenderables()) {
		const obj = (api as any).createObjectFromRenderable(r, table, genOpts)
		if (obj) group.add(obj)
	}
	renderMs = performance.now() - s
}
push('ThreeRenderApi.generateTableNode', renderMs)

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
