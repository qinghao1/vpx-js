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
const t0 = performance.now()
const table = await Table.load(reader, { skipTextures: noTextures })
const tLoad = performance.now() - t0
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

const t2 = performance.now()
const player = new Player(table).init()
const tInit = performance.now() - t2
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
