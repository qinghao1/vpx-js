// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { PHYSICS_STEPTIME } from '../physics/constants.js'
import { BALL_STRIDE, drainInput, MAX_BALLS, writeFrame } from './shared/physics-buffer.js'

declare const self: { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null }

let sab: SharedArrayBuffer | null = null
let running = false
let timer: ReturnType<typeof setTimeout> | null = null
let timeMsec = 0
let curUsec = 0
let nextUsec = PHYSICS_STEPTIME
let startUsec = 0
let tickCount = 0

const scratch = new Float32Array(MAX_BALLS * BALL_STRIDE)
for (let i = 0; i < MAX_BALLS; i++) {
	const o = i * BALL_STRIDE
	scratch[o] = 1000 + i * 40
	scratch[o + 1] = 1000 + i * 10
	scratch[o + 2] = 30
	scratch[o + 3] = (Math.random() - 0.5) * 20
	scratch[o + 4] = (Math.random() - 0.5) * 20
	scratch[o + 5] = 0
	scratch[o + 6] = 0
	scratch[o + 7] = 0
	scratch[o + 8] = 0
	scratch[o + 9] = 25
	scratch[o + 10] = 1
	scratch[o + 11] = 0
}

async function ensureWasm(): Promise<void> {
	try {
		const mod = await import('../physics/wasm/kernels.js')
		await mod.getWasmKernels?.()
		mod.warmWasmPools?.(2048, 2048, 2048, 2048, 2048, 2048, 2048, 2048)
	} catch {}
}

function tick(): void {
	if (!sab) return
	try {
		drainInput(sab, [])
	} catch {}
	curUsec = nextUsec
	nextUsec += PHYSICS_STEPTIME
	timeMsec = Math.floor((curUsec - startUsec) / 1000)
	const tPrev = Math.floor((curUsec - PHYSICS_STEPTIME - startUsec) / 1000)
	try {
		writeFrame(sab, scratch, 0, tPrev, timeMsec, timeMsec)
	} catch {}
	if (++tickCount % 1000 === 0) {
		try {
			self.postMessage({ type: 'heartbeat', timeMsec, tickCount })
		} catch {}
	}
}

function startLoop(): void {
	if (running) return
	running = true
	startUsec = Math.floor(performance.now() * 1000)
	curUsec = startUsec
	nextUsec = startUsec + PHYSICS_STEPTIME
	timeMsec = 0
	void ensureWasm()
	const loop = () => {
		if (!running || !sab) return
		const end = performance.now() + 1
		while (running && performance.now() < end) tick()
		timer = setTimeout(loop, 1)
	}
	loop()
	try {
		self.postMessage({ type: 'started', timeMsec: 0 })
	} catch {}
}

function stopLoop(): void {
	running = false
	if (timer !== null) {
		clearTimeout(timer)
		timer = null
	}
	try {
		self.postMessage({ type: 'stopped' })
	} catch {}
}

self.onmessage = (e: MessageEvent) => {
	const d = e.data as { type?: string; sab?: SharedArrayBuffer; id?: number }
	if (d?.sab) sab = d.sab
	if (!d?.type) return
	if (d.type === 'init') {
		if (d.sab) sab = d.sab
		void ensureWasm()
		try {
			self.postMessage({ type: 'ready' })
		} catch {}
	} else if (d.type === 'start') {
		startLoop()
	} else if (d.type === 'stop') {
		stopLoop()
	} else if (d.type === 'ping') {
		try {
			self.postMessage({ type: 'pong', id: d.id ?? 0, timeMsec, tickCount })
		} catch {}
	}
}

try {
	self.postMessage({ type: 'worker-ready' })
} catch {}
