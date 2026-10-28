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
import {
	collectUsedTextureNames,
	compareByAreaAsc,
	compareStreamTextures,
	countTris,
	defaultGenOpts,
	filterStreamTextures,
	getPlayfieldMapKey,
	isDeferredTexture,
	movePlayfieldFirst,
	timedAsync,
	timedSync,
} from './bench-shared.js'
import { getArg, hasFlag } from './vpinball-resolver.js'

const args = process.argv.slice(2)
const vpx = getArg(args, 'vpx', process.env.WALKING_DEAD_VPX ?? '/home/qinghao1/Downloads/walking_dead.vpx')
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

const tableProto = TableLoader.prototype as any
const origGame = tableProto.loadGameItems
const origTex = tableProto.loadTextures
const origColl = tableProto.loadCollections
const origInfo = tableProto.loadTableInfo
let gameMs = 0
let texMs = 0
let collMs = 0
let infoMs = 0

tableProto.loadGameItems = timedAsync(origGame, ms => {
	gameMs = ms
})
tableProto.loadTextures = timedAsync(origTex, ms => {
	texMs = ms
})
tableProto.loadCollections = timedAsync(origColl, ms => {
	collMs = ms
})
tableProto.loadTableInfo = timedAsync(origInfo, ms => {
	infoMs = ms
})

let t = performance.now()
const table = await Table.load(new NodeBinaryReader(vpx))
let ms = performance.now() - t
push('Table.load', ms)
push('  loadGameItems', gameMs)
push('  loadTextures', texMs)
push('  loadCollections', collMs)
push('  loadTableInfo', infoMs)
push('  script+header+Ole', ms - gameMs - texMs - collMs - infoMs)

tableProto.loadGameItems = origGame
tableProto.loadTextures = origTex
tableProto.loadCollections = origColl
tableProto.loadTableInfo = origInfo

const loader = new ThreeTextureLoaderNode()
const api = new ThreeRenderApi({ applyMaterials: true, applyTextures: loader as any })
const genOpts = defaultGenOpts()
t = performance.now()
let node: any
try {
	node = await table.generateTableNode(api as any, { ...genOpts, preloadTextures: false } as any)
} catch (error: any) {
	console.warn(`generateTableNode failed: ${error.message?.slice(0, 500)}`)
}
const renderMs = performance.now() - t
push('Three.generateTableNode', renderMs)
{
	const triCount = countTris(node)
	if (node) {
		console.log(
			` Three.generate ${renderMs.toFixed(0)}ms — meshes=${triCount.meshes} tris=${Math.round(triCount.tris / 1000)}k`,
		)
	}
}

const allTex = Object.values((table as any).textures) as any[]
const totalTex = allTex.length
const totalBytesRaw = allTex.reduce((s, tx) => s + (tx.binary?.len ?? tx.pdsBuffer?.getData?.()?.length ?? 0), 0)
const high = allTex.filter(tx => !isDeferredTexture(tx, table))
const deferred = allTex.filter(tx => isDeferredTexture(tx, table))
high.sort(compareByAreaAsc)
deferred.sort(compareByAreaAsc)
let textures: any[] = [...high, ...deferred]
const pfMap = getPlayfieldMapKey(table)
if (pfMap) {
	const idx = movePlayfieldFirst(textures, pfMap)
	if (idx === -1) {
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
	const { used, mainBakeUsed } = collectUsedTextureNames(node)
	usedSize = used.size
	mainBakeSize = mainBakeUsed.size
	const before = textures.length
	textures = filterStreamTextures(textures, used, mainBakeUsed, pfMap)
	textures.sort((a, b) => compareStreamTextures(a, b, mainBakeUsed, pfMap, true))
	filteredCount = textures.length
	console.log(
		` Textures all=${totalTex} high=${high.length} deferred=${deferred.length} filtered=${filteredCount} used=${usedSize} mainBake=${mainBakeSize} raw=${(totalBytesRaw / 1048576).toFixed(1)}MB pf=${pfMap || 'none'}`,
	)
	if (before !== filteredCount)
		console.log(` Filtered ${before} → ${filteredCount} (kept inserts, removed unused nestmaps)`)
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
	const avg = (preloadMs / textures.length).toFixed(1)
	const cacheSize = (api as any).getMapGenerator?.().getCache?.()?.size ?? preloadOk
	console.log(
		` Three.preloadTextures ${preloadMs.toFixed(0)}ms — ${preloadOk}/${textures.length} ok ${preloadFail} fail avg ${avg}ms/tex cache=${cacheSize} ~${texMemMB}MB`,
	)
	if (high.length && deferred.length) {
		const filteredHigh = textures.filter(tx => !isDeferredTexture(tx, table)).length
		const filteredDeferred = textures.length - filteredHigh
		console.log(`  filtered high=${filteredHigh} deferred=${filteredDeferred}`)
	}
}
let preloadAllMs = 0
if (hasFlag(args, 'preload-all') && allTex.length) {
	const api2 = new ThreeRenderApi({
		applyMaterials: true,
		applyTextures: new ThreeTextureLoaderNode() as any,
	})
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

const grammarProto = Grammar.prototype as any
const origGrammar = grammarProto.transpile
grammarProto.transpile = timedSync(origGrammar, ms => {
	grammarMs = ms
})

const transpilerProto = Transpiler.prototype as any
const origExecute = transpilerProto.execute
const origGen = transpilerProto.gen
const origPipeline = transpilerProto.pipeline

transpilerProto.gen = timedSync(origGen, ms => {
	genMs = ms
})

transpilerProto.pipeline = function (gf?: string, go?: string) {
	const fns = origPipeline.call(this, gf, go)
	const names = ['FunctionHoist', 'Event', 'Error', 'Reference', 'Scope', 'ClassThis', 'Ambiguity', 'Class', 'Wrap']
	return fns.map((fn: any, i: number) => (ast: any) => {
		const start = performance.now()
		const result = fn(ast)
		const key = names[i] ?? `step${i}`
		pipelinePer.set(key, (pipelinePer.get(key) ?? 0) + (performance.now() - start))
		return result
	})
}

transpilerProto.execute = timedSync(origExecute, ms => {
	execMs = ms
})

const physicsProto = PlayerPhysics.prototype as any
const origPhysInit = physicsProto.init
physicsProto.init = timedSync(origPhysInit, ms => {
	physMs = ms
})

t = performance.now()
new Player(table).init()
ms = performance.now() - t
push('Player.init', ms)
push('  PlayerPhysics.init', physMs)
push('  Transpiler.execute', execMs)
push('    Grammar.transpile', grammarMs)
for (const [k, v] of pipelinePer) push(`    Transformer:${k}`, v)
push('    escodegen.generate', genMs)
const other = execMs - grammarMs - Array.from(pipelinePer.values()).reduce((a, b) => a + b, 0) - genMs
push('    eval+play', other > 0 ? other : 0)

grammarProto.transpile = origGrammar
transpilerProto.execute = origExecute
transpilerProto.gen = origGen
transpilerProto.pipeline = origPipeline
physicsProto.init = origPhysInit

const tTotal = performance.now() - tTotal0
push('TOTAL (Table+Three+Player)', tTotal)

phases.sort((a, b) => b.ms - a.ms)
console.log(`\n=== Ranked hotspots (full load inc. textures) ===`)
for (const [i, p] of phases.entries()) {
	const pct = ((p.ms / tTotal) * 100).toFixed(1)
	console.log(
		`${String(i + 1).padStart(2)}. ${p.name.padEnd(50)} ${p.ms.toFixed(0).padStart(6)}ms  ${pct.padStart(5)}%`,
	)
}
console.log(`\nJSON:`)
console.log(JSON.stringify(phases, null, 2))
