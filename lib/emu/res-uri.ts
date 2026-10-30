import type { IEmulator } from '../game/iemulator.js'

/**
 * Minimal port of upstream `ResURIResolver` float-state resolution (`ctrl://` links).
 *
 * Upstream lights/flashers store an optional controller link (`LINK`/`SLNK` tags) that
 * drives their in-play state whenever it resolves against a controller plugin. vpx-js has
 * a single emulator instead of plugin endpoints, so any authority is accepted and the
 * `group`/`mapping` pair selects one of the emulator lamp/solenoid/GI outputs.
 *
 * Group ids follow the PinMAME plugin interface: 1/8 solenoids, 2/9 global illumination,
 * 3/10 lamps. Raw emulator values are returned as-is (upstream `TryGetFloatState` does no
 * normalization for these groups either); callers clamp to their own range.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/plugins/plugins/ResURIResolver.h
 * @see https://github.com/vpinball/pinmame/blob/master/src/libpinmame/PinMAMEPlugin.h
 */

const SOLENOID_GROUPS = new Set([1, 8])
const GI_GROUPS = new Set([2, 9])
const LAMP_GROUPS = new Set([3, 10])

/** Parsed `ctrl://authority/state?group=N&mapping=M` link. */
export interface StateLink {
	group: number
	mapping: number
}

/** Float-state resolution result. Mirrors `ResURIResolver::TryGetFloatState`. */
export interface FloatStateResult {
	ok: boolean
	value: number
}

function parseInteger(value: string | null): number | undefined {
	if (value === null) return undefined
	const trimmed = value.trim()
	if (!/^[+-]?\d+$/.test(trimmed)) return undefined
	return Number.parseInt(trimmed, 10)
}

/** Parses a controller state link. Returns undefined for anything but `ctrl://authority/state?group=&mapping=`. */
export function parseStateLink(link: string): StateLink | undefined {
	let url: URL
	try {
		url = new URL(link)
	} catch {
		return undefined
	}
	if (url.protocol !== 'ctrl:' || !url.hostname || url.pathname !== '/state') return undefined
	const group = parseInteger(url.searchParams.get('group'))
	const mapping = parseInteger(url.searchParams.get('mapping'))
	if (group === undefined || mapping === undefined) return undefined
	return { group, mapping }
}

/**
 * Resolves a controller state link against the emulator.
 * Unresolved links (no emulator, unknown group, `name=` selection) report `ok: false`
 * so callers keep their script-driven state — same as upstream.
 */
export function tryGetFloatState(emu: IEmulator | undefined, link: string): FloatStateResult {
	if (!emu) return { ok: false, value: 0 }
	const parsed = parseStateLink(link)
	if (!parsed) return { ok: false, value: 0 }
	if (LAMP_GROUPS.has(parsed.group)) return { ok: true, value: emu.getLampState(parsed.mapping) }
	if (SOLENOID_GROUPS.has(parsed.group)) return { ok: true, value: emu.getSolenoidState(parsed.mapping) }
	if (GI_GROUPS.has(parsed.group)) return { ok: true, value: emu.getGIState(parsed.mapping) }
	return { ok: false, value: 0 }
}
