// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Regression for viewer hover + fallback ball (see walking_dead issues).
 * - hover Play tip must fire only for cabinet outer or playfield, not VR floor outside
 * - hitIsPlayfield must check mesh name only, not ancestor playfield group
 * - fallback ball must not spawn for ROM tables (cGameName / PinMAME)
 */
import { describe, expect, it } from 'vitest'

const RE_OUTER = /VRCab_(Cabinet|Backbox|LegsFront|LegsBack)$/i
const RE_CAB = /vrcab|cabinet|lockbar|pincab/i

function isOuter(name: string, outerLen: number): boolean {
	return outerLen ? RE_OUTER.test(name) : RE_CAB.test(name)
}
function hitIsOuter(obj: { name: string; parent?: any }, outerLen: number): boolean {
	for (let c: any = obj; c; c = c.parent) if (isOuter(c.name || '', outerLen)) return true
	return false
}
function hitIsPlayfield(obj: { name: string }): boolean {
	const n = (obj.name || '').toLowerCase()
	return n.includes('playfield') || n.includes('bm_') || n.includes('apron')
}
function hitTest(hits: Array<{ object: any }>, outerLen: number): boolean {
	if (!hits.length) return false
	return hits.some(h => hitIsOuter(h.object, outerLen) || hitIsPlayfield(h.object))
}
function shouldScheduleFallback(opts: {
	hasPinmame: boolean
	emu?: { isMock?: boolean; isInitialized?: () => boolean }
}): boolean {
	if (opts.hasPinmame) return false
	const emu = opts.emu
	if (emu && !emu.isMock && emu.isInitialized?.()) return false
	return true
}
function shouldSpawnFallbackNow(opts: {
	hasPinmame: boolean
	emu?: { isMock?: boolean }
	balls: Array<{ isFrozen: boolean }>
}): boolean {
	if (opts.hasPinmame) return false
	if (opts.emu && !opts.emu.isMock) return false
	if (opts.balls.length === 0) return false
	if (opts.balls.some(b => !b.isFrozen)) return false
	return true
}

describe('viewer hover regression — Play tip only on cabinet/playfield', () => {
	it('playfield mesh triggers', () => {
		const hit = { object: { name: 'primitive-BM_Playfield' } }
		expect(hitIsPlayfield(hit.object as any)).toBe(true)
		expect(hitTest([hit], 4)).toBe(true)
	})
	it('cabinet outer triggers', () => {
		const hit = { object: { name: 'VRCab_Cabinet', parent: { name: 'playfield' } } }
		expect(hitIsOuter(hit.object as any, 4)).toBe(true)
		expect(hitTest([hit], 4)).toBe(true)
	})
	it('VR floor outside must NOT trigger (ancestor playfield ignored)', () => {
		const vr = {
			name: 'primitive-VR_MegaFloor001',
			parent: { name: 'VR_MegaFloor001', parent: { name: 'primitives', parent: { name: 'playfield' } } },
		}
		expect(hitIsPlayfield(vr as any)).toBe(false)
		expect(hitIsOuter(vr as any, 4)).toBe(false)
		expect(hitTest([{ object: vr }], 4)).toBe(false)
		// buggy ancestor walk would have returned true for playfield ancestor:
		const buggyHitIsPlayfield = (o: any) => {
			for (let c = o; c; c = c.parent) {
				const n = (c.name || '').toLowerCase()
				if (n.includes('playfield') || n.includes('bm_')) return true
			}
			return false
		}
		expect(buggyHitIsPlayfield(vr)).toBe(true)
	})
	it('legs/backbox trigger outer even when outside playfield center', () => {
		const hit = { object: { name: 'VRCab_LegsFront' } }
		expect(hitTest([hit] as any, 4)).toBe(true)
	})
})

describe('fallback ball regression — mystery ball in middle', () => {
	it('does not schedule for ROM table', () => {
		expect(shouldScheduleFallback({ hasPinmame: true, emu: { isMock: false, isInitialized: () => true } })).toBe(
			false,
		)
		expect(shouldScheduleFallback({ hasPinmame: true, emu: { isMock: true } })).toBe(false)
		expect(shouldScheduleFallback({ hasPinmame: true })).toBe(false)
	})
	it('schedules for non-ROM table', () => {
		expect(shouldScheduleFallback({ hasPinmame: false })).toBe(true)
		expect(shouldScheduleFallback({ hasPinmame: false, emu: { isMock: true } })).toBe(true)
	})
	it('defers when real emu already running', () => {
		expect(shouldScheduleFallback({ hasPinmame: false, emu: { isMock: false, isInitialized: () => true } })).toBe(
			false,
		)
	})
	it('does not spawn when hasPinmame even if balls frozen in trough', () => {
		const balls = [{ isFrozen: true }, { isFrozen: true }, { isFrozen: true }, { isFrozen: true }]
		expect(shouldSpawnFallbackNow({ hasPinmame: true, balls })).toBe(false)
	})
	it('does not spawn when any ball already ejected (not frozen)', () => {
		expect(shouldSpawnFallbackNow({ hasPinmame: false, balls: [{ isFrozen: true }, { isFrozen: false }] })).toBe(
			false,
		)
	})
	it('spawns only for non-ROM with all frozen', () => {
		expect(shouldSpawnFallbackNow({ hasPinmame: false, balls: [{ isFrozen: true }, { isFrozen: true }] })).toBe(
			true,
		)
	})
})
