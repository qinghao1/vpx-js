import fs from 'node:fs'
import path from 'node:path'
import { Player } from '../../lib/game/player.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js'
import { Vertex3D } from '../../lib/util/vector.js'
import { Table } from '../../lib/vpt/table/table.js'

const args = process.argv.slice(2)
const getArg = (name: string, def: string | null) =>
	args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def
const hasFlag = (name: string) => args.includes(`--${name}`)

const home = process.env.HOME ?? '/home/qinghao1'
const candidates = [
	path.resolve('walking_dead.vpx'),
	path.join(home, 'Downloads/walking_dead.vpx'),
	path.resolve('test/fixtures/table-empty.vpx'),
]
const exists = (p: string) => {
	try {
		return fs.existsSync(p) && fs.statSync(p).size > 1024
	} catch {
		return false
	}
}

const vpx = getArg('vpx', null) ?? candidates.find(exists) ?? 'test/fixtures/table-empty.vpx'
if (!exists(vpx)) {
	console.error(`VPX not found: ${vpx}`)
	process.exit(1)
}

const balls = Number(getArg('balls', vpx.includes('walking_dead') ? '1' : '0') ?? '0')
const ticks = Number(getArg('ticks', '300') ?? '300')
const noTextures = hasFlag('no-textures')
const breakdown = hasFlag('breakdown') || hasFlag('profile')

const st = fs.statSync(vpx)
console.log(`vpx-js Node bench — ${new Date().toISOString()}`)
console.log(
	` VPX: ${vpx} ${(st.size / 1024 / 1024).toFixed(1)} MB  balls=${balls} ticks=${ticks} noTextures=${noTextures}`,
)

function stats(arr: number[]) {
	if (!arr.length) return null
	const s = [...arr].sort((a, b) => a - b)
	const avg = s.reduce((a, b) => a + b, 0) / s.length
	return {
		avg: +avg.toFixed(2),
		p50: +s[Math.floor(s.length * 0.5)].toFixed(2),
		p95: +s[Math.floor(s.length * 0.95)].toFixed(2),
		min: +Math.min(...s).toFixed(2),
		max: +Math.max(...s).toFixed(2),
		count: s.length,
	}
}

const reader = new NodeBinaryReader(vpx)
let tLoad = 0
let table: Table
if (breakdown) {
	const { TableLoader } = await import('../../lib/vpt/table/table-loader.js')
	const origGame = (TableLoader.prototype as any).loadGameItems
	const origTex = (TableLoader.prototype as any).loadTextures
	const origColl = (TableLoader.prototype as any).loadCollections
	let gameMs = 0
	let texMs = 0
	let collMs = 0
	;(TableLoader.prototype as any).loadGameItems = async function (...a: any[]) {
		const s = performance.now()
		const r = await origGame.apply(this, a)
		gameMs = performance.now() - s
		console.log(` [breakdown] loadGameItems ${gameMs.toFixed(0)}ms`)
		return r
	}
	;(TableLoader.prototype as any).loadTextures = async function (...a: any[]) {
		const s = performance.now()
		const r = await origTex.apply(this, a)
		texMs = performance.now() - s
		console.log(` [breakdown] loadTextures ${texMs.toFixed(0)}ms`)
		return r
	}
	;(TableLoader.prototype as any).loadCollections = async function (...a: any[]) {
		const s = performance.now()
		const r = await origColl.apply(this, a)
		collMs = performance.now() - s
		console.log(` [breakdown] loadCollections ${collMs.toFixed(0)}ms`)
		return r
	}
	const t0 = performance.now()
	table = await Table.load(reader, { skipTextures: noTextures })
	tLoad = performance.now() - t0
	;(TableLoader.prototype as any).loadGameItems = origGame
	;(TableLoader.prototype as any).loadTextures = origTex
	;(TableLoader.prototype as any).loadCollections = origColl
	console.log(
		` [breakdown] Table.load total ${tLoad.toFixed(0)}ms — items=${Object.keys((table as any).items).length} textures=${Object.keys((table as any).textures).length} (game ${gameMs.toFixed(0)}ms tex ${texMs.toFixed(0)}ms coll ${collMs.toFixed(0)}ms)`,
	)
} else {
	const t0 = performance.now()
	table = await Table.load(reader, { skipTextures: noTextures })
	tLoad = performance.now() - t0
}
console.log(
	` Table.load ${(tLoad).toFixed(0)}ms — items=${Object.keys((table as any).items).length} textures=${Object.keys((table as any).textures).length}`,
)
console.log(
	`  Table: ${(table as any).info?.TableName ?? (table as any).data?.name ?? 'n/a'}  Game=${(table as any).tableScript?.match(/cGameName\s*=\s*["']([^"']+)["']/i)?.[1] ?? 'n/a'}`,
)

let sceneGenMs: number | null = null
let tris: number | null = null
let meshes: number | null = null
try {
	const api = new ThreeRenderApi({ applyMaterials: true, applyTextures: !noTextures, optimizeTextures: false } as any)
	const { Group } = await import('three')
	const group = new Group()
	const genOpts = {
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
	} as any
	const t1 = performance.now()
	for (const r of (table as any).getRenderables()) {
		const obj = (api as any).createObjectFromRenderable(r, table, genOpts)
		if (obj) group.add(obj)
	}
	sceneGenMs = Math.round(performance.now() - t1)
	let c = 0
	let m = 0
	group.traverse((o: any) => {
		if (o.isMesh && o.geometry?.attributes?.position) {
			c += o.geometry.attributes.position.count / 3
			m++
		}
	})
	tris = Math.round(c)
	meshes = m
	console.log(` ThreeRenderApi ${sceneGenMs}ms — meshes=${meshes} tris=${Math.round(c / 1000)}k`)
} catch (e: any) {
	console.warn(` Scene gen skipped: ${e.message.slice(0, 300)}`)
}

let tInit = 0
let player: Player
if (breakdown) {
	const { Transpiler } = await import('../../lib/scripting/transpiler.js')
	const script = (table as any).tableScript as string | undefined
	const origExec = Transpiler.prototype.execute as any
	const origExecAsync = (Transpiler.prototype as any).executeAsync as any
	let execMs = 0
	let execAsyncMs = 0
	Transpiler.prototype.execute = function (...a: any[]) {
		const s = performance.now()
		const r = origExec.apply(this, a as any)
		execMs = performance.now() - s
		return r
	} as any
	;(Transpiler.prototype as any).executeAsync = async function (...a: any[]) {
		const s = performance.now()
		const r = await origExecAsync.apply(this, a as any)
		execAsyncMs = performance.now() - s
		return r
	} as any
	const { PlayerPhysics } = await import('../../lib/game/player-physics.js')
	const origInit = PlayerPhysics.prototype.init
	let physMs = 0
	PlayerPhysics.prototype.init = function (...a: any[]) {
		const s = performance.now()
		const r = (origInit as any).apply(this, a as any)
		physMs = performance.now() - s
		return r
	} as any
	const tI0 = performance.now()
	player = new Player(table).init()
	tInit = performance.now() - tI0
	Transpiler.prototype.execute = origExec
	;(Transpiler.prototype as any).executeAsync = origExecAsync
	PlayerPhysics.prototype.init = origInit
	const phys: any = (player as any).physics ?? (player as any)['physics']
	if (script)
		console.log(
			` [breakdown] Transpiler execute ${execMs.toFixed(0)}ms executeAsync ${execAsyncMs.toFixed(0)}ms script ${(script.length / 1024).toFixed(1)} KB`,
		)
	console.log(
		` [breakdown] PlayerPhysics.init ${physMs.toFixed(0)}ms — hitObjects=${phys?.hitObjects?.length ?? '?'} hitTimers=${phys?.hitTimers?.length ?? phys?.['hitTimers']?.length ?? '?'} movers=${phys?.movers?.length ?? phys?.['movers']?.length ?? '?'}`,
	)
	console.log(
		` [breakdown] Player.init total ${tInit.toFixed(0)}ms — (phys ${physMs.toFixed(0)}ms + transpiler ${execMs.toFixed(0)}ms)`,
	)
} else {
	const t2 = performance.now()
	player = new Player(table).init()
	tInit = performance.now() - t2
}
console.log(` Player.init ${(tInit).toFixed(0)}ms — hitObjects=${(player as any).physics?.hitObjects?.length ?? '?'}`)

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
	` Physics x${ticks} ${(total).toFixed(0)}ms — ${(total / ticks).toFixed(2)}ms/frame (16ms simulated, ${ticks * 16}ms total) p95 ${stats(physTimes)?.p95}ms`,
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
const outPath = getArg('out', null)
if (outPath) {
	fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
	console.log(`wrote ${outPath}`)
}
if (hasFlag('json')) console.log(JSON.stringify(out, null, 2))
