// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import {
	BALL_STRIDE,
	createPhysicsSAB,
	drainInput,
	hasNewFrame,
	inputPending,
	MAX_BALLS,
	pushInput,
	readFrame,
	SAB_SIZE,
	trySnap,
	writeFrame,
} from './physics-buffer.js'

describe('physics-buffer', () => {
	it('creates SAB 16KB and exposes layout', () => {
		const sab = createPhysicsSAB()
		expect(sab.byteLength).toBe(SAB_SIZE)
		expect(sab instanceof SharedArrayBuffer).toBe(true)
	})

	it('write->snap roundtrip single ball', () => {
		const sab = createPhysicsSAB()
		const balls = new Float32Array(MAX_BALLS * BALL_STRIDE)
		for (let i = 0; i < BALL_STRIDE; i++) balls[i] = i + 1
		writeFrame(sab, balls, 1, 100, 101, 100)
		expect(hasNewFrame(sab)).toBe(true)
		const out = new Float32Array(MAX_BALLS * BALL_STRIDE)
		const res = trySnap(sab, out)
		expect(res).not.toBeNull()
		expect(res?.count).toBe(1)
		expect(res?.tPrev).toBe(100)
		expect(res?.tNext).toBe(101)
		expect(res?.timeMsec).toBe(100)
		for (let i = 0; i < BALL_STRIDE; i++) expect(out[i]).toBeCloseTo(balls[i])
		expect(hasNewFrame(sab)).toBe(false)
		expect(trySnap(sab, out)).toBeNull()
	})

	it('lossy mailbox keeps newest', () => {
		const sab = createPhysicsSAB()
		const out = new Float32Array(MAX_BALLS * BALL_STRIDE)
		const a = new Float32Array(MAX_BALLS * BALL_STRIDE)
		const b = new Float32Array(MAX_BALLS * BALL_STRIDE)
		a[0] = 1
		b[0] = 2
		writeFrame(sab, a, 1, 0, 1, 0)
		writeFrame(sab, b, 1, 1, 2, 1)
		const res = trySnap(sab, out)
		expect(res).not.toBeNull()
		expect(out[0]).toBe(2)
		expect(trySnap(sab, out)).toBeNull()
	})

	it('input SPSC ring 256 capacity mask', () => {
		const sab = createPhysicsSAB()
		for (let i = 0; i < 255; i++) expect(pushInput(sab, 1, i, i * 0.5)).toBe(true)
		expect(inputPending(sab)).toBe(255)
		expect(pushInput(sab, 1, 999, 0)).toBe(false)
		const evs: { kind: number; key: number; val: number }[] = []
		const n = drainInput(sab, evs)
		expect(n).toBe(255)
		expect(evs[0]?.key).toBe(0)
		expect(evs[254]?.key).toBe(254)
		expect(inputPending(sab)).toBe(0)
	})

	it('input notify empty->non-empty', () => {
		const sab = createPhysicsSAB()
		expect(pushInput(sab, 1, 42, 3.14)).toBe(true)
		expect(inputPending(sab)).toBe(1)
		const evs: { kind: number; key: number; val: number }[] = []
		drainInput(sab, evs)
		expect(evs[0]?.val).toBeCloseTo(3.14)
	})

	it('fuzz 1kHz writer vs 60Hz reader 20k iters no torn', () => {
		const sab = createPhysicsSAB()
		const out = new Float32Array(MAX_BALLS * BALL_STRIDE)
		const src = new Float32Array(MAX_BALLS * BALL_STRIDE)
		for (let i = 0; i < 10000; i++) {
			const count = 5
			for (let b = 0; b < count; b++) {
				const off = b * BALL_STRIDE
				src[off] = i * 0.1 + b
				src[off + 1] = i * 0.2 + b
				src[off + 2] = 30
				src[off + 3] = 10
				src[off + 4] = -10
				src[off + 5] = 0
				src[off + 6] = 0
				src[off + 7] = 0
				src[off + 8] = 0
				src[off + 9] = 25
				src[off + 10] = 1
				src[off + 11] = 0
			}
			const tPrev = i
			const tNext = i + 1
			writeFrame(sab, src, count, tPrev, tNext, i)
			if (i % 16 === 0) {
				const res = trySnap(sab, out)
				if (res) {
					expect(res.tNext).toBeGreaterThan(res.tPrev)
					for (let j = 0; j < res.count * BALL_STRIDE; j++) expect(Number.isFinite(out[j])).toBe(true)
					expect(out[0]).not.toBeNaN()
				}
			}
		}
		const last = trySnap(sab, out)
		if (last) expect(last.tNext).toBeGreaterThan(last.tPrev)
	})

	it('concurrent-like 100k iters', () => {
		const sab = createPhysicsSAB()
		const out = new Float32Array(MAX_BALLS * BALL_STRIDE)
		const src = new Float32Array(MAX_BALLS * BALL_STRIDE)
		src[0] = 1
		for (let i = 0; i < 20000; i++) {
			src[0] = i
			writeFrame(sab, src, 1, i, i + 1, i)
			if (i % 7 === 0) {
				const r = readFrame(sab, out)
				if (r) {
					expect(r.tNext).toBeGreaterThan(r.tPrev)
					expect(Number.isFinite(out[0])).toBe(true)
				}
			}
		}
		expect(hasNewFrame(createPhysicsSAB())).toBe(false)
	})
})
