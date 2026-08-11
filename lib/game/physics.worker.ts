// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { DEFAULT_STEPTIME, PHYSICS_STEPTIME } from '../physics/constants.js'
import { BALL_STRIDE, drainInput, MAX_BALLS, writeFrame } from './shared/physics-buffer.js'

type WorkerInitMessage = {
	type: 'init'
	sab: SharedArrayBuffer
	tableTransfer?: ArrayBuffer
	wasmUrl?: string
}

type WorkerControlMessage = { type: 'start' } | { type: 'stop' } | { type: 'ping'; id: number } | WorkerInitMessage

let sab: SharedArrayBuffer | null = null
let running = false
let timer: number | null = null
let timeMsec = 0
let curUsec = 0
let nextUsec = PHYSICS_STEPTIME
let startUsec = 0
let lastHeartbeat = 0
let tickCount = 0
const ballCount = 1
const scratch = new Float32Array(MAX_BALLS * BALL_STRIDE)
let wasmReady = false

for (let i = 0; i < MAX_BALLS; i++) {
	const off = i * BALL_STRIDE
	scratch[off] = 1000 + i * 40
	scratch[off + 1] = 1000 + i * 10
	scratch[off + 2] = 30
	scratch[off + 3] = (Math.random() - 0.5) * 20
	scratch[off + 4] = (Math.random() - 0.5) * 20
	scratch[off + 5] = 0
	scratch[off + 6] = 0
	scratch[off + 7] = 0
	scratch[off + 8] = 0
	scratch[off + 9] = 25
	scratch[off + 10] = 1
	scratch[off + 11] = 0
}

async function ensureWasm(): Promise<void> {
	if (wasmReady) return
	try {
		const mod = await import('../physics/wasm/kernels.js')
		if (mod.getWasmKernels) {
			await mod.getWasmKernels()
			try {
				mod.warmWasmPools?.(2048, 2048, 2048, 2048, 2048, 2048, 2048, 2048)
			} catch {}
			wasmReady = true
		}
	} catch {}
}

function now(): number {
	return performance.now()
}

function tick(): void {
	if (!sab) return
	const evs: { kind: number; key: number; val: number }[] = []
	try {
		drainInput(sab, evs)
	} catch {}
	if (evs.length) {
		for (const ev of evs) {
			if (ev.kind === 1) {
				for (let i = 0; i < ballCount; i++) {
					const off = i * BALL_STRIDE
					scratch[off + 3] += (Math.random() - 0.5) * 40
					scratch[off + 4] += (Math.random() - 0.5) * 40
				}
			}
		}
	}
	const dt = PHYSICS_STEPTIME / DEFAULT_STEPTIME
	for (let i = 0; i < ballCount; i++) {
		const off = i * BALL_STRIDE
		scratch[off] += scratch[off + 3] * dt
		scratch[off + 1] += scratch[off + 4] * dt
		scratch[off + 2] += scratch[off + 5] * dt
		if (scratch[off + 1] > 2000) scratch[off + 4] = -Math.abs(scratch[off + 4])
		if (scratch[off + 1] < 0) scratch[off + 4] = Math.abs(scratch[off + 4])
		if (scratch[off] > 2000) scratch[off + 3] = -Math.abs(scratch[off + 3])
		if (scratch[off] < 0) scratch[off + 3] = Math.abs(scratch[off + 3])
		if (scratch[off + 2] < 25) {
			scratch[off + 2] = 25
			if (scratch[off + 5] < 0) scratch[off + 5] = -scratch[off + 5] * 0.7
		}
		scratch[off + 5] -= 1.8 * dt
	}
	curUsec = nextUsec
	nextUsec += PHYSICS_STEPTIME
	timeMsec = Math.floor((curUsec - startUsec) / 1000)
	const tPrev = Math.floor((curUsec - PHYSICS_STEPTIME - startUsec) / 1000)
	const tNext = timeMsec
	try {
		writeFrame(sab, scratch, ballCount, tPrev, tNext, timeMsec)
	} catch {}
	tickCount++
	const n = now()
	if (n - lastHeartbeat > 1000) {
		lastHeartbeat = n
		try {
			;(self as unknown as { postMessage: (m: unknown) => void }).postMessage({
				type: 'heartbeat',
				timeMsec,
				tickCount,
				ballCount,
				wasmReady,
			})
		} catch {}
	}
}

function startLoop(): void {
	if (running) return
	running = true
	startUsec = Math.floor(now() * 1000)
	curUsec = startUsec
	nextUsec = startUsec + PHYSICS_STEPTIME
	timeMsec = 0
	lastHeartbeat = now()
	void ensureWasm()
	const loop = () => {
		if (!running || !sab) return
		const target = now() + 1
		while (running) {
			tick()
			if (now() >= target) break
		}
		timer = (self as unknown as { setTimeout: (fn: () => void, ms: number) => number }).setTimeout(
			loop,
			1,
		) as unknown as number
	}
	loop()
	try {
		;(self as unknown as { postMessage: (m: unknown) => void }).postMessage({ type: 'started', timeMsec: 0 })
	} catch {}
}

function stopLoop(): void {
	running = false
	if (timer !== null) {
		try {
			;(self as unknown as { clearTimeout: (id: number) => void }).clearTimeout(timer)
		} catch {}
		timer = null
	}
	try {
		;(self as unknown as { postMessage: (m: unknown) => void }).postMessage({ type: 'stopped' })
	} catch {}
}

;(self as unknown as { onmessage: ((e: MessageEvent) => void) | null }).onmessage = (
	e: MessageEvent<WorkerControlMessage & { sab?: SharedArrayBuffer }>,
) => {
	const data = e.data as WorkerControlMessage & { sab?: SharedArrayBuffer }
	try {
		if (data && typeof data === 'object' && 'sab' in data && data.sab) {
			sab = data.sab as SharedArrayBuffer
		}
		if (!data || typeof (data as { type?: string }).type !== 'string') return
		const t = (data as { type: string }).type
		if (t === 'init') {
			if ((data as WorkerInitMessage).sab) sab = (data as WorkerInitMessage).sab
			void ensureWasm()
			try {
				;(self as unknown as { postMessage: (m: unknown) => void }).postMessage({ type: 'ready', wasmReady })
			} catch {}
			return
		}
		if (t === 'start') {
			startLoop()
			return
		}
		if (t === 'stop') {
			stopLoop()
			return
		}
		if (t === 'ping') {
			const id = (data as { id?: number }).id ?? 0
			try {
				;(self as unknown as { postMessage: (m: unknown) => void }).postMessage({
					type: 'pong',
					id,
					timeMsec,
					tickCount,
				})
			} catch {}
			return
		}
	} catch (err) {
		try {
			;(self as unknown as { postMessage: (m: unknown) => void }).postMessage({
				type: 'error',
				message: (err as Error).message,
			})
		} catch {}
	}
}

try {
	;(self as unknown as { postMessage: (m: unknown) => void }).postMessage({ type: 'worker-ready' })
} catch {}
