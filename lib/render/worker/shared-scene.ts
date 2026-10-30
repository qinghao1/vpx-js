// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

/**
 * DOM-free scene helpers shared by the main-thread viewer and the render worker.
 * Pure data/math only: no three, DOM, or worker APIs, so the worker driver and
 * unit tests can import this module anywhere (Node included).
 */

import { createNodeIdMap, workerNodeNames } from './frame-state.js'

/** Offset gain: nudge-table units to playfield shift. */
const NUDGE_AMP_OFF = 110
/** Offset gain: cabinet acceleration to playfield shift. */
const NUDGE_AMP_ACC = 0.22
/** Clamp applied to either axis of the nudge shift. */
const NUDGE_CLAMP = 6
/** Y-axis factor: the playfield tips away (negative) at 60% of the Y nudge. */
const NUDGE_Y_FACTOR = -0.6

/** Clamped playfield shift for one nudge/acceleration view sample. */
export function nudgeOffset(
	viewNudgeX: number,
	viewNudgeY: number,
	viewAccX: number,
	viewAccY: number,
): { x: number; y: number } {
	const tx = viewNudgeX * NUDGE_AMP_OFF + viewAccX * NUDGE_AMP_ACC
	const ty = viewNudgeY * NUDGE_AMP_OFF + viewAccY * NUDGE_AMP_ACC
	return {
		x: Math.max(-NUDGE_CLAMP, Math.min(NUDGE_CLAMP, tx)),
		y: Math.max(-NUDGE_CLAMP, Math.min(NUDGE_CLAMP, ty * NUDGE_Y_FACTOR)),
	}
}

/** Minimal updater surface a cached node needs (mirrors the worker's NodeUpdater). */
export interface NodeCacheUpdater {
	applyState(node: unknown, state: unknown, api: unknown, table: unknown): void
}

/** Minimal item surface buildNodeCache needs: identity, live state, and updater. */
export interface NodeCacheItem {
	getName(): string
	getState(): Record<string, unknown>
	getUpdater(): NodeCacheUpdater
}

/** One cached scene node, keyed by shared node id. */
export interface SceneNodeEntry {
	item: NodeCacheItem
	node: unknown
	name: string
	updater: NodeCacheUpdater
}

/** Minimal table surface buildNodeCache needs: items plus light/lightmap maps. */
export interface NodeCacheTable {
	getItems(): NodeCacheItem[]
	getName?(): string
	lights?: Record<string, unknown>
	primitives?: Record<string, { data?: { szLightmap?: string } }>
}

/** Minimal scene-root surface buildNodeCache needs: case-variant node lookup. */
export interface NodeCacheRoot {
	getObjectByName(name: string): unknown
}

/** Node cache shared by the viewer and the worker boot path. */
export interface NodeCache {
	entries: Array<SceneNodeEntry | null>
	lightmap: Map<string, string[]>
	lightNames: Set<string>
	idOf: (name: string) => number
	names: string[]
}

/**
 * Build the per-table node cache: one entry per state-carrying item resolved
 * against the scene root (exact, lower, then upper case), plus the light name
 * set and the lightmap (light name to prim names) map. Cabinet-flipper rig
 * nodes (vrcab + flipper) never carry state and are skipped.
 */
export function buildNodeCache(table: NodeCacheTable, root: NodeCacheRoot): NodeCache {
	const names = workerNodeNames(table as never)
	const idOf = createNodeIdMap(names)
	const entries: Array<SceneNodeEntry | null> = new Array(names.length).fill(null)
	const lightNames = new Set(Object.keys(table.lights ?? {}))
	const lightmap = new Map<string, string[]>()
	for (const [primName, prim] of Object.entries(table.primitives ?? {})) {
		const lm = prim?.data?.szLightmap
		if (!lm) continue
		const list = lightmap.get(lm)
		if (list) list.push(primName)
		else lightmap.set(lm, [primName])
	}
	for (const item of table.getItems()) {
		let name = ''
		try {
			name = item.getName?.() ?? ''
		} catch {
			name = ''
		}
		const id = name ? idOf(name) : -1
		if (id < 0) continue
		if (name.toLowerCase().includes('vrcab') && name.toLowerCase().includes('flipper')) continue
		const node =
			root.getObjectByName(name) ??
			root.getObjectByName(name.toLowerCase()) ??
			root.getObjectByName(name.toUpperCase())
		let updater: NodeCacheUpdater | undefined
		let live: Record<string, unknown> | undefined
		try {
			updater = item.getUpdater?.()
		} catch {
			updater = undefined
		}
		try {
			live = item.getState?.()
		} catch {
			live = undefined
		}
		if (!node || !updater || !live) continue
		entries[id] = { item, node, name, updater }
	}
	return { entries, lightmap, lightNames, idOf, names }
}

/**
 * Lightmap fan-out: re-evaluate every overlay prim of each changed lamp with
 * an empty state so overlays track live lamp levels. One shared sequence for
 * the viewer, the worker, and the harnesses.
 */
export function fanOutLightmap(
	cache: Pick<NodeCache, 'lightmap' | 'idOf' | 'entries'>,
	renderApi: unknown,
	table: unknown,
	changedLights: Iterable<string>,
): void {
	for (const lm of changedLights) {
		for (const primName of cache.lightmap.get(lm) ?? []) {
			const primId = cache.idOf(primName)
			const prim = primId >= 0 ? cache.entries[primId] : null
			if (!prim) continue
			prim.updater.applyState(prim.node, {}, renderApi, table)
		}
	}
}
