import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { Player } from '../../lib/game/player.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { Vertex3D } from '../../lib/math/vector.js'
import { getWasmKernels, isWasmReady } from '../../lib/physics/wasm/kernels.js'
import { Table } from '../../lib/vpt/table/table.js'
import { stats, timedSync } from './bench-shared.js'
import { extractGameName, getArg, hasFlag } from './vpinball-resolver.js'

const args = process.argv.slice(2)

const vpx =
	getArg(args, 'vpx', null) ??
	(fs.existsSync('walking_dead.vpx') ? 'walking_dead.vpx' : 'test/fixtures/table-empty.vpx')
const ballsArg = Number(getArg(args, 'balls', vpx.includes('walking_dead') ? '5' : '10') ?? '5')
const ticks = Number(getArg(args, 'ticks', '1000') ?? '1000')
const warmup = Number(getArg(args, 'warmup', '100') ?? '100')

const reader = new NodeBinaryReader(vpx)
console.log(`[profile] load ${vpx}`)
const t0 = performance.now()
const table = await Table.load(reader)
console.log(
	`[profile] Table.load ${(performance.now() - t0).toFixed(0)}ms  Game=${extractGameName((table as any).tableScript ?? '') ?? 'n/a'}`,
)
let wasmReady = false
try {
	await getWasmKernels()
	wasmReady = isWasmReady()
} catch {}
console.log(`[profile] WASM ready=${wasmReady}`)

const player = new Player(table).init() as any
const phys = player.getPhysics?.() ?? player.physics
console.log(
	`[profile] hitObjects=${phys.hitObjects?.length ?? '?'}  hitObjectsDynamic=${phys.hitObjectsDynamic?.length ?? '?'}`,
)

const w = (table as any).data?.width ?? 1000,
	h = (table as any).data?.height ?? 2000
for (let i = 0; i < ballsArg; i++) {
	player.createBall(
		{
			getBallCreationPosition: () =>
				new Vertex3D(w * 0.5 + (Math.random() - 0.5) * 200, h * 0.75 + (Math.random() - 0.5) * 200, 30),
			getBallCreationVelocity: () => new Vertex3D((Math.random() - 0.5) * 600, -200 - Math.random() * 300, 20),
			onBallCreated: () => {},
		},
		25,
		1,
	)
}
console.log(`[profile] balls=${player.balls.length}`)

let hitCalls = 0
let wasmCalls = 0
let scalarCalls = 0
let totalOrderLen = 0
let maxOrderLen = 0
const orderHist = new Map<string, number>()

function resetCounters(): void {
	hitCalls = 0
	wasmCalls = 0
	scalarCalls = 0
	totalOrderLen = 0
	maxOrderLen = 0
	orderHist.clear()
}

function orderBucket(len: number): string {
	if (len < 16) return '<16'
	if (len < 64) return '16-63'
	if (len < 128) return '64-127'
	if (len < 256) return '128-255'
	return '256+'
}
const HitQuadtree = (await import('../../lib/physics/hit-quadtree.js')).HitQuadtree

const origQT = HitQuadtree.prototype.hitTestBall
HitQuadtree.prototype.hitTestBall = function (ball: any, coll: any, physics: any) {
	hitCalls++
	const lenBefore = (this as any)._orderLen ?? 0
	const res = origQT.call(this, ball, coll, physics)
	const len = (this as any)._orderLen ?? lenBefore
	if (len > 0) {
		totalOrderLen += len
		maxOrderLen = Math.max(maxOrderLen, len)
		const bucket = orderBucket(len)
		orderHist.set(bucket, (orderHist.get(bucket) ?? 0) + 1)
		if (len >= 64 && isWasmReady()) wasmCalls++
		else scalarCalls++
	} else {
		// still count as scalar if fallback
		if (lenBefore < 64) scalarCalls++
	}
	return res
} as any

const physTimes: number[] = []
const moverTimes: number[] = []
const timerTimes: number[] = []

let curMs = 16
player.updatePhysics(curMs)
for (let i = 0; i < warmup; i++) {
	curMs += 16
	player.updatePhysics(curMs)
}

resetCounters()

const origSim = phys.physicsSimulateCycle
let innerHitMs = 0
phys.physicsSimulateCycle = timedSync(origSim, ms => {
	innerHitMs += ms
})

const origVel = phys.updateVelocities
phys.updateVelocities = timedSync(origVel, ms => {
	moverTimes.push(ms)
})

const origFire = (phys as any).fireTimers
if (origFire) {
	;(phys as any).fireTimers = timedSync(origFire, ms => {
		timerTimes.push(ms)
	})
}

console.log(`[profile] running ${ticks} ticks @16ms monotonic, ${player.balls.length} balls…`)
const tStart = performance.now()
for (let i = 0; i < ticks; i++) {
	curMs += 16
	const a = performance.now()
	player.updatePhysics(curMs)
	const dt = performance.now() - a
	physTimes.push(dt)
	player.updateAnimations(player.getGameTime())
	if (i % 200 === 0 && i > 0)
		console.log(
			`  ${i}/${ticks}  avg ${(physTimes.slice(-200).reduce((sum, value) => sum + value, 0) / 200).toFixed(3)}ms`,
		)
}
const totalMs = performance.now() - tStart

const hitAvg = hitCalls ? totalOrderLen / hitCalls : 0
console.log(
	`\n[results] ticks=${ticks} total=${totalMs.toFixed(0)}ms  avgTick=${(totalMs / ticks).toFixed(3)}ms  throughput=${Math.round((ticks * 1000) / totalMs)} ticks/sec`,
)
console.log(`  phys updatePhysics stats`, stats(physTimes, 3))
console.log(`  mover updateVelocities stats`, stats(moverTimes, 3))
console.log(`  timer stats`, stats(timerTimes, 3))
console.log(
	`  inner physicsSimulateCycle total ${innerHitMs.toFixed(1)}ms avg ${(innerHitMs / ticks).toFixed(3)}ms/tick`,
)
console.log(
	`  hitTestBall calls=${hitCalls} wasmPath~${wasmCalls} scalarPath~${scalarCalls} avgOrderLen=${hitAvg.toFixed(1)} max=${maxOrderLen} hist=${JSON.stringify(Object.fromEntries(orderHist))}`,
)
console.log(
	`  WASM ready=${wasmReady}  threshold=64  balls=${player.balls.length}  hitObjects=${phys.hitObjects.length}`,
)

console.log(`\n[micro] physicsSimulateCycle(0.016) x500 isolated`)
resetCounters()
const microArr: number[] = []
for (let i = 0; i < 500; i++) {
	const a = performance.now()
	phys.physicsSimulateCycle(0.016)
	microArr.push(performance.now() - a)
}
console.log(`  micro stats`, stats(microArr, 3))
console.log(
	`  micro hitCalls=${hitCalls} wasm~${wasmCalls} scalar~${scalarCalls} avgOrder=${hitCalls ? (totalOrderLen / hitCalls).toFixed(1) : 0}`,
)

console.log(`\n[varying balls]`)
for (const n of [1, 5, 10, 20]) {
	const pl = new Player(table).init() as any
	for (let i = 0; i < n; i++)
		pl.createBall(
			{
				getBallCreationPosition: () =>
					new Vertex3D(w * 0.5 + Math.random() * 10, h * 0.5 + Math.random() * 10, 30),
				getBallCreationVelocity: () =>
					new Vertex3D((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, 0),
				onBallCreated: () => {},
			},
			25,
			1,
		)
	try {
		await getWasmKernels()
	} catch {}
	let cur = 16
	pl.updatePhysics(cur)
	for (let i = 0; i < 50; i++) {
		cur += 16
		pl.updatePhysics(cur)
	}
	const arr: number[] = []
	cur += 16
	for (let i = 0; i < 200; i++) {
		cur += 16
		const a = performance.now()
		pl.updatePhysics(cur)
		arr.push(performance.now() - a)
	}
	console.log(
		`  balls=${n}  avg=${(arr.reduce((sum, value) => sum + value, 0) / arr.length).toFixed(3)}ms  p95=${stats(arr, 3)?.p95}ms`,
	)
}

if (hasFlag(args, 'json')) {
	const out = {
		vpx,
		balls: ballsArg,
		ticks,
		wasmReady,
		physStats: stats(physTimes, 3),
		moverStats: stats(moverTimes, 3),
		hitCalls,
		wasmCalls,
		scalarCalls,
		avgOrderLen: hitAvg,
		maxOrderLen,
		hist: Object.fromEntries(orderHist),
	}
	console.log(JSON.stringify(out, null, 2))
}
