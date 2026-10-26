import fs from 'node:fs'
import { Player } from '../../lib/game/player.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { Vertex3D } from '../../lib/math/vector.js'
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js'
import { Table } from '../../lib/vpt/table/table.js'
import {
	collectUsedTextureNames,
	compareByAreaAsc,
	compareStreamTextures,
	countTris,
	defaultGenOpts,
	exists,
	filterStreamTextures,
	findVpx,
	getPlayfieldMapKey,
	isDeferredTexture,
	movePlayfieldFirst,
	stats,
	timedAsync,
	timedSync,
} from './bench-shared.js'
import { getArg, hasFlag } from './vpinball-resolver.js'

const args = process.argv.slice(2)

const vpx = getArg(args, 'vpx', null) ?? findVpx() ?? 'test/fixtures/table-empty.vpx'
if (!exists(vpx)) {
	console.error(`VPX not found: ${vpx}`)
	process.exit(1)
}

const balls = Number(getArg(args, 'balls', vpx.includes('walking_dead') ? '1' : '0') ?? '0')
const ticks = Number(getArg(args, 'ticks', '300') ?? '300')
const noTextures = hasFlag(args, 'no-textures')
const breakdown = hasFlag(args, 'breakdown') || hasFlag(args, 'profile')

const st = fs.statSync(vpx)
console.log(`vpx-js Node bench — ${new Date().toISOString()}`)
console.log(
	` VPX: ${vpx} ${(st.size / 1024 / 1024).toFixed(1)} MB  balls=${balls} ticks=${ticks} noTextures=${noTextures}`,
)

const reader = new NodeBinaryReader(vpx)
let tLoad = 0
let table: Table
if (breakdown) {
	const { TableLoader } = await import('../../lib/vpt/table/table-loader.js')
	const tableProto = TableLoader.prototype as any
	const origGame = tableProto.loadGameItems
	const origTex = tableProto.loadTextures
	const origColl = tableProto.loadCollections
	let gameMs = 0
	let texMs = 0
	let collMs = 0
	tableProto.loadGameItems = timedAsync(origGame, ms => {
		gameMs = ms
		console.log(` [breakdown] loadGameItems ${ms.toFixed(0)}ms`)
	})
	tableProto.loadTextures = timedAsync(origTex, ms => {
		texMs = ms
		console.log(` [breakdown] loadTextures ${ms.toFixed(0)}ms`)
	})
	tableProto.loadCollections = timedAsync(origColl, ms => {
		collMs = ms
		console.log(` [breakdown] loadCollections ${ms.toFixed(0)}ms`)
	})
	const t0 = performance.now()
	table = await Table.load(reader, { skipTextures: noTextures })
	tLoad = performance.now() - t0
	tableProto.loadGameItems = origGame
	tableProto.loadTextures = origTex
	tableProto.loadCollections = origColl
	console.log(
		` [breakdown] Table.load total ${tLoad.toFixed(0)}ms — items=${Object.keys((table as any).items).length} textures=${Object.keys((table as any).textures).length} (game ${gameMs.toFixed(0)}ms tex ${texMs.toFixed(0)}ms coll ${collMs.toFixed(0)}ms)`,
	)
} else {
	const t0 = performance.now()
	table = await Table.load(reader, { skipTextures: noTextures })
	tLoad = performance.now() - t0
}
console.log(
	` Table.load ${tLoad.toFixed(0)}ms — items=${Object.keys((table as any).items).length} textures=${Object.keys((table as any).textures).length}`,
)
console.log(
	`  Table: ${(table as any).info?.TableName ?? (table as any).data?.name ?? 'n/a'}  Game=${(table as any).tableScript?.match(/cGameName\s*=\s*["']([^"']+)["']/i)?.[1] ?? 'n/a'}`,
)

let sceneGenMs: number | null = null
let tris: number | null = null
let meshes: number | null = null
let preloadMs: number | null = null
let preloadFilteredMs: number | null = null
let filteredTexCount: number | null = null
try {
	const api = new ThreeRenderApi({ applyMaterials: true, applyTextures: !noTextures, optimizeTextures: false } as any)
	const { Group } = await import('three')
	const group = new Group()
	const genOpts = defaultGenOpts()
	const t1 = performance.now()
	for (const renderable of (table as any).getRenderables()) {
		const obj = (api as any).createObjectFromRenderable(renderable, table, genOpts)
		if (obj) group.add(obj)
	}
	sceneGenMs = Math.round(performance.now() - t1)
	const triCount = countTris(group)
	tris = Math.round(triCount.tris)
	meshes = triCount.meshes
	console.log(` ThreeRenderApi ${sceneGenMs}ms — meshes=${meshes} tris=${Math.round(triCount.tris / 1000)}k`)
} catch (error: any) {
	console.warn(` Scene gen skipped: ${error.message.slice(0, 300)}`)
}
if (!noTextures) {
	try {
		const { ThreeTextureLoaderNode } = await import('../../lib/render/threejs/three-texture-loader-node.js')
		const { ThreeRenderApi: Api2 } = await import('../../lib/render/threejs/three-render-api.js')
		const loader = new ThreeTextureLoaderNode()
		const api2 = new Api2({ applyMaterials: true, applyTextures: loader as any })
		const genOpts2 = defaultGenOpts()
		const tPre0 = performance.now()
		const node2: any = await (table as any).generateTableNode(
			api2 as any,
			{ ...genOpts2, preloadTextures: false } as any,
		)
		const gen2Ms = Math.round(performance.now() - tPre0)
		console.log(` Three.generateTableNode ${gen2Ms}ms (for preload)`)
		const all: any[] = Object.values((table as any).textures)
		let textures: any[] = [
			...all.filter((tx: any) => !isDeferredTexture(tx, table)),
			...all.filter((tx: any) => isDeferredTexture(tx, table)),
		]
		textures.sort(compareByAreaAsc)
		const pfMap = getPlayfieldMapKey(table)
		if (pfMap) {
			movePlayfieldFirst(textures, pfMap)
		}
		if (node2) {
			const { used, mainBakeUsed } = collectUsedTextureNames(node2)
			const before = textures.length
			textures = filterStreamTextures(textures, used, mainBakeUsed, pfMap)
			textures.sort((a: any, b: any) => compareStreamTextures(a, b, mainBakeUsed, pfMap))
			filteredTexCount = textures.length
			console.log(
				` Textures filtered ${before} → ${filteredTexCount} used=${used.size} mainBake=${mainBakeUsed.size}`,
			)
		}
		const tP = performance.now()
		await (api2 as any).preloadTextures(textures, table)
		preloadFilteredMs = Math.round(performance.now() - tP)
		console.log(` Three.preloadTextures (filtered) ${preloadFilteredMs}ms — ${textures.length} tex`)
		if (hasFlag(args, 'preload-all')) {
			const tPA = performance.now()
			const apiAll = new Api2({
				applyMaterials: true,
				applyTextures: new ThreeTextureLoaderNode() as any,
			})
			await (table as any).generateTableNode(apiAll as any, { ...genOpts2, preloadTextures: false } as any)
			await (apiAll as any).preloadTextures(all, table)
			preloadMs = Math.round(performance.now() - tPA)
			console.log(` Three.preloadTextures (all) ${preloadMs}ms — ${all.length} tex`)
		} else {
			preloadMs = null
		}
	} catch (error: any) {
		console.warn(` preloadTextures skipped: ${error.message.slice(0, 500)}`)
	}
}

let tInit = 0
let player: Player
if (breakdown) {
	const { Transpiler } = await import('../../lib/scripting/transpiler.js')
	const script = (table as any).tableScript as string | undefined
	const transpilerProto = Transpiler.prototype as any
	const origExec = transpilerProto.execute
	const origExecAsync = transpilerProto.executeAsync
	let execMs = 0
	let execAsyncMs = 0
	transpilerProto.execute = timedSync(origExec, ms => {
		execMs = ms
	})
	transpilerProto.executeAsync = timedAsync(origExecAsync, ms => {
		execAsyncMs = ms
	})
	const { PlayerPhysics } = await import('../../lib/game/player-physics.js')
	const physicsProto = PlayerPhysics.prototype as any
	const origInit = physicsProto.init
	let physMs = 0
	physicsProto.init = timedSync(origInit, ms => {
		physMs = ms
	})
	const tI0 = performance.now()
	player = new Player(table).init()
	tInit = performance.now() - tI0
	transpilerProto.execute = origExec
	transpilerProto.executeAsync = origExecAsync
	physicsProto.init = origInit
	const phys: any = (player as any).physics
	if (script)
		console.log(
			` [breakdown] Transpiler execute ${execMs.toFixed(0)}ms executeAsync ${execAsyncMs.toFixed(0)}ms script ${(script.length / 1024).toFixed(1)} KB`,
		)
	console.log(
		` [breakdown] PlayerPhysics.init ${physMs.toFixed(0)}ms — hitObjects=${phys?.hitObjects?.length ?? '?'} hitTimers=${phys?.hitTimers?.length ?? '?'} movers=${phys?.movers?.length ?? '?'}`,
	)
	console.log(
		` [breakdown] Player.init total ${tInit.toFixed(0)}ms — (phys ${physMs.toFixed(0)}ms + transpiler ${execMs.toFixed(0)}ms)`,
	)
} else {
	const t2 = performance.now()
	player = new Player(table).init()
	tInit = performance.now() - t2
}
console.log(` Player.init ${tInit.toFixed(0)}ms — hitObjects=${(player as any).physics?.hitObjects?.length ?? '?'}`)

if (balls > 0) {
	const w = (table as any).data?.width ?? 1000
	const h = (table as any).data?.height ?? 2000
	for (let i = 0; i < balls; i++) {
		;(player as any).createBall(
			{
				getBallCreationPosition: () =>
					new Vertex3D(w / 2 + (Math.random() - 0.5) * 60, h / 2 + (Math.random() - 0.5) * 60, 30),
				getBallCreationVelocity: () =>
					new Vertex3D((Math.random() - 0.5) * 600, (Math.random() - 0.5) * 600, 50),
				onBallCreated: () => {},
			},
			25,
			1,
		)
	}
	console.log(` Created ${balls} ball(s) -> ${(player as any).balls?.length ?? 0}`)
}

const physTimes: number[] = []
const animTimes: number[] = []
const t3 = performance.now()
let curTime = 16
// prime physics clock: first updatePhysics establishes startTimeUsec
;(player as any).updatePhysics(curTime)
for (let i = 0; i < ticks; i++) {
	curTime += 16
	const a = performance.now()
	;(player as any).updatePhysics(curTime)
	physTimes.push(performance.now() - a)
	const b = performance.now()
	;(player as any).updateAnimations((player as any).getGameTime?.() ?? curTime)
	animTimes.push(performance.now() - b)
}
const total = performance.now() - t3
console.log(
	` Physics x${ticks} ${total.toFixed(0)}ms — ${(total / ticks).toFixed(2)}ms/frame (16ms simulated, ${ticks * 16}ms total) p95 ${stats(physTimes)?.p95}ms`,
)
console.log(
	`  Throughput ${Math.round((ticks * 16 * 1000) / total)} simulated ms/sec  (${Math.round((ticks * 1000) / total)} frames/sec)`,
)

const mem = process.memoryUsage()
console.log(
	` Heap ${(mem.heapUsed / 1048576).toFixed(1)} MB / ${(mem.heapTotal / 1048576).toFixed(1)} MB  rss ${(mem.rss / 1048576).toFixed(1)} MB`,
)

const out: any = {
	vpx,
	balls,
	ticks,
	noTextures,
	loadMs: Math.round(tLoad),
	sceneGenMs,
	preloadMs,
	preloadFilteredMs,
	filteredTexCount,
	tris,
	meshes,
	initMs: Math.round(tInit),
	physStats: stats(physTimes),
	animStats: stats(animTimes),
	heap: {
		heapUsed: Math.round(mem.heapUsed / 1048576),
		heapTotal: Math.round(mem.heapTotal / 1048576),
		rss: Math.round(mem.rss / 1048576),
	},
}
const outPath = getArg(args, 'out', null)
if (outPath) {
	fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
	console.log(`wrote ${outPath}`)
}
if (hasFlag(args, 'json')) console.log(JSON.stringify(out, null, 2))
