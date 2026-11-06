// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Table } from './table/table.js'

/** Minimal controller float-state source (structural slice of the deleted game/iemulator + emu/res-uri). */
export interface EmuFloatState {
	getLampState(n: number): number
	getSolenoidState(n: number): number
	getGIState(n: number): number
}

const SOLENOID_GROUPS = new Set([1, 8])
const GI_GROUPS = new Set([2, 9])
const LAMP_GROUPS = new Set([3, 10])

/**
 * Resolves a `ctrl://authority/state?group=&mapping=` link against the emulator
 * (PinMAME plugin interface groups: 1/8 solenoids, 2/9 GI, 3/10 lamps).
 * Unresolved links report `ok: false` so callers keep script-driven state.
 */
export function tryGetLinkedFloatState(emu: EmuFloatState | undefined, link: string): { ok: boolean; value: number } {
	if (!emu) return { ok: false, value: 0 }
	let url: URL
	try {
		url = new URL(link)
	} catch {
		return { ok: false, value: 0 }
	}
	if (url.protocol !== 'ctrl:' || !url.hostname || url.pathname !== '/state') return { ok: false, value: 0 }
	const group = parseLinkInt(url.searchParams.get('group'))
	const mapping = parseLinkInt(url.searchParams.get('mapping'))
	if (group === undefined || mapping === undefined) return { ok: false, value: 0 }
	if (LAMP_GROUPS.has(group)) return { ok: true, value: emu.getLampState(mapping) }
	if (SOLENOID_GROUPS.has(group)) return { ok: true, value: emu.getSolenoidState(mapping) }
	if (GI_GROUPS.has(group)) return { ok: true, value: emu.getGIState(mapping) }
	return { ok: false, value: 0 }
}

function parseLinkInt(value: string | null): number | undefined {
	if (value === null) return undefined
	const trimmed = value.trim()
	if (!/^[+-]?\d+$/.test(trimmed)) return undefined
	return Number.parseInt(trimmed, 10)
}

/**
 * Lightmap modulation ratio for a linked lamp, shared by the primitive and
 * flasher updaters (upstream `primitive.cpp:932-940` and `flasher.cpp:1011-1020`
 * are the same rule: a resolved SLNK link scales the alpha and suppresses this
 * ratio, otherwise the live lamp scales it).
 *
 * Upstream divides unconditionally: the live intensity is full-scale
 * (base x scale x state), so a mid-fade lamp scales by current/denom, never by
 * the raw current value. Zero base or scale yields 0, never NaN.
 */
export function lightmapAlphaFactor(table: Table, lightName: string | undefined): number {
	// Native convolutes lightmap primitives with the lamp shadow; the lamp
	// scales the alpha, never the color.
	if (!lightName) return 1
	try {
		const light = (table as any).lights?.[lightName] ?? (table as any).getLight?.(lightName)
		const lightState = (light as any)?.getState?.() ?? (light as any)?.state
		const dataInt = (light as any)?.data?.intensity ?? (light as any)?.intensity ?? 1
		const scale =
			(lightState as any)?.intensityScale ??
			(light as any)?.data?.intensityScale ??
			(light as any)?.animation?.intensityScale ??
			1
		const currentIntensity = lightState?.intensity ?? dataInt
		const denom = dataInt * scale
		let rawFactor: number
		if (denom !== 0) {
			rawFactor = currentIntensity / denom
		} else rawFactor = 0
		return Math.max(0, Math.min(1, Number.isFinite(rawFactor) ? rawFactor : 0))
	} catch {
		return 1
	}
}
