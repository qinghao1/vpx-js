import { describe, expect, it } from 'vitest'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import type { LineSeg } from './line-seg.js'
import { hitTestTwoSided } from './two-sided-hit.js'

function stubSeg(hitTime: number): LineSeg {
	return { hitTestBasic: () => hitTime } as unknown as LineSeg
}

function makeColl(): CollisionEvent {
	return { hitFlag: false } as CollisionEvent
}

const ball = {} as Ball

describe('hitTestTwoSided', () => {
	it('should return -1 and leave hitFlag alone when neither side hits', () => {
		const coll = makeColl()
		const t = hitTestTwoSided([stubSeg(-1), stubSeg(-1)], ball, 1, coll, false)
		expect(t).toBe(-1)
		expect(coll.hitFlag).toBe(false)
	})

	it('should tolerate a missing segment', () => {
		const coll = makeColl()
		const t = hitTestTwoSided([undefined, stubSeg(-1)], ball, 1, coll, false)
		expect(t).toBe(-1)
		expect(coll.hitFlag).toBe(false)
	})

	it('should flag the gate polarity (!!i: front false, back true)', () => {
		// Upstream HitGate::HitTest stores `coll.m_hitflag = !!i` (collideex.cpp:186).
		const front = makeColl()
		expect(hitTestTwoSided([stubSeg(0.5), stubSeg(-1)], ball, 1, front, false)).toBe(0.5)
		expect(front.hitFlag).toBe(false)

		const back = makeColl()
		expect(hitTestTwoSided([stubSeg(-1), stubSeg(0.25)], ball, 1, back, false)).toBe(0.25)
		expect(back.hitFlag).toBe(true)
	})

	it('should flag the spinner polarity (!i: front true, back false)', () => {
		// Upstream HitSpinner::HitTest stores `coll.m_hitflag = !i` (collideex.cpp:387).
		const front = makeColl()
		expect(hitTestTwoSided([stubSeg(0.5), stubSeg(-1)], ball, 1, front, true)).toBe(0.5)
		expect(front.hitFlag).toBe(true)

		const back = makeColl()
		expect(hitTestTwoSided([stubSeg(-1), stubSeg(0.25)], ball, 1, back, true)).toBe(0.25)
		expect(back.hitFlag).toBe(false)
	})
})
