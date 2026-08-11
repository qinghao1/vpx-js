// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import {
	BALL_STRIDE,
	createPhysicsSAB,
	drainInput,
	MAX_BALLS,
	pushInput,
	readFrame,
	SAB_SIZE,
	trySnap,
	writeFrame,
} from './physics-buffer.js'

describe('physics-buffer', () => {
	it('creates SAB and roundtrip', () => {
		const sab = createPhysicsSAB()
		expect(sab.byteLength).toBe(SAB_SIZE)
		const balls = new Float32Array(MAX_BALLS * BALL_STRIDE)
		for (let i = 0; i < BALL_STRIDE; i++) balls[i] = i + 1
		writeFrame(sab, balls, 1, 100, 101, 100)
		const out = new Float32Array(MAX_BALLS * BALL_STRIDE)
		const res = trySnap(sab, out)
		expect(res?.count).toBe(1)
		expect(res?.tPrev).toBe(100)
		for (let i = 0; i < BALL_STRIDE; i++) expect(out[i]).toBeCloseTo(balls[i])
		expect(trySnap(sab, out)).toBeNull()
	})

	it('lossy keeps newest', () => {
		const sab = createPhysicsSAB()
		const out = new Float32Array(MAX_BALLS * BALL_STRIDE)
		const a = new Float32Array(MAX_BALLS * BALL_STRIDE)
		const b = new Float32Array(MAX_BALLS * BALL_STRIDE)
		a[0] = 1
		b[0] = 2
		writeFrame(sab, a, 1, 0, 1, 0)
		writeFrame(sab, b, 1, 1, 2, 1)
		trySnap(sab, out)
		expect(out[0]).toBe(2)
	})

	it('SPSC ring 255 capacity', () => {
		const sab = createPhysicsSAB()
		for (let i = 0; i < 255; i++) expect(pushInput(sab, 1, i, i * 0.5)).toBe(true)
		expect(pushInput(sab, 1, 999, 0)).toBe(false)
		const evs: { kind: number; key: number; val: number }[] = []
		expect(drainInput(sab, evs)).toBe(255)
		expect(evs[0]?.key).toBe(0)
		expect(evs[254]?.key).toBe(254)
	})

	it('fuzz 1kHz vs 60Hz', () => {
		const sab = createPhysicsSAB()
		const out = new Float32Array(MAX_BALLS * BALL_STRIDE)
		const src = new Float32Array(MAX_BALLS * BALL_STRIDE)
		for (let i = 0; i < 20000; i++) {
			for (let b = 0; b < 5; b++) {
				const o = b * BALL_STRIDE
				src[o] = i * 0.1 + b
				src[o + 1] = i * 0.2 + b
				src[o + 9] = 25
				src[o + 10] = 1
			}
			writeFrame(sab, src, 5, i, i + 1, i)
			if (i % 16 === 0) {
				const r = trySnap(sab, out)
				if (r) {
					expect(r.tNext).toBeGreaterThan(r.tPrev)
					for (let j = 0; j < r.count * BALL_STRIDE; j++) expect(Number.isFinite(out[j])).toBe(true)
				}
			}
			if (i % 7 === 0) {
				const r = readFrame(sab, out)
				if (r) expect(r.tNext).toBeGreaterThan(r.tPrev)
			}
		}
	})
})
