// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Single shared table-scene assembly for the main-thread viewer and the
 * OffscreenCanvas render worker. Both renderers must build the same content
 * (same generate flags, same postprocess, same room, same transmission lift,
 * same light cull).
 */
import * as THREE from 'three'
import type { Table } from '../../vpt/table/table.js'
import { fanOutLightmap, type NodeCache } from '../worker/shared-scene.js'
import { setPrimitiveTransmissionArea } from './nodes/primitive-bdl-node.js'
import { ensureProceduralRoom } from './procedural-room.js'
import { optimizeScene } from './three-batched-builder.js'
import { ThreeRenderApi } from './three-render-api.js'
import { postProcessScene } from './three-scene-postprocess.js'

/** The one generate-flags set both renderers use. */
export const TABLE_GENERATE_OPTIONS = {
	exportPlayfield: true,
	exportPrimitives: true,
	exportRubbers: true,
	exportSurfaces: true,
	exportFlippers: true,
	exportBumpers: true,
	exportRamps: true,
	exportLightBulbs: true,
	exportPlayfieldLights: true,
	exportHitTargets: true,
	exportGates: true,
	exportKickers: true,
	exportTriggers: true,
	exportSpinners: true,
	exportPlungers: true,
	exportLightBulbLights: true,
}

/** Prerendered scene background both renderers clear to. */
export const PRERENDERED_BACKGROUND = 0x121a2b

export interface TableSceneOptions {
	viewerMode: 'viewer' | 'play'
	harnessLog?: (msg: string, level?: string) => void
	/** Static batching (main-thread default, honours ?nobatched). Off in the worker: its ball/DMD lookups run on unmerged meshes. */
	batch?: boolean
	maxLights?: number
	/** Worker authored-state sweep; runs here so postprocess hides stray meshes exactly like on the main thread. */
	onBeforePostprocess?: (node: THREE.Group) => void
}

export interface TableSceneResult {
	node: THREE.Group
	stats: Record<string, number>
	batch: { batched: number; instanced: number } | null
	culled: { before: number; after: number; culled: number } | null
}

/**
 * Framing, room, camera, and state application stay caller-side (the room
 * needs the framed bounds; states need the node cache / Player).
 */
export async function assembleTableScene(
	renderApi: ThreeRenderApi,
	table: Table,
	opts: TableSceneOptions,
): Promise<TableSceneResult> {
	const node = (await (table as unknown as { generateTableNode(a: unknown, o: unknown): unknown }).generateTableNode(
		renderApi,
		// Stream textures on demand: preloading spikes peak memory and shifts postprocess texture timing.
		{ ...TABLE_GENERATE_OPTIONS, preloadTextures: false },
	)) as THREE.Group
	opts.onBeforePostprocess?.(node)
	const stats = postProcessScene(node, { viewerMode: opts.viewerMode, harnessLog: opts.harnessLog })
	const dim = table.getDimensions?.()
	if (dim) {
		node.updateWorldMatrix(true, false)
		const surfaceY = node.localToWorld(new THREE.Vector3(0, 0, 0)).y
		setPrimitiveTransmissionArea(dim.width, dim.height, ThreeRenderApi.SCALE, surfaceY)
	}
	let culled: TableSceneResult['culled'] = null
	if (opts.maxLights !== undefined) culled = cullExcessLights(node, opts.maxLights)
	let batch: TableSceneResult['batch'] = null
	if (opts.batch) batch = optimizeScene(node, table, renderApi)
	return { node, stats, batch, culled }
}

export function cullExcessLights(root: THREE.Object3D, maxLights: number): TableSceneResult['culled'] {
	const lights: THREE.PointLight[] = []
	root.traverse(o => {
		if ((o as THREE.PointLight).isPointLight) lights.push(o as THREE.PointLight)
	})
	if (lights.length <= maxLights) return null
	lights.sort((a, b) => (b.intensity || 0) - (a.intensity || 0))
	let culled = 0
	for (const light of lights.slice(maxLights)) {
		light.parent?.remove(light)
		culled++
	}
	return { before: lights.length, after: maxLights, culled }
}

export function syncTableRoom(
	scene: THREE.Scene,
	node: THREE.Object3D,
	center: THREE.Vector3,
	size: THREE.Vector3,
): THREE.Group | null {
	let hasVr = false
	node.traverse((o: unknown) => {
		const mesh = o as THREE.Mesh
		if (mesh.isMesh && mesh.visible && (mesh.name ?? '').toLowerCase().includes('vr_')) hasVr = true
	})
	const room = ensureProceduralRoom(scene, center, size, { hasVr })
	scene.background = new THREE.Color(PRERENDERED_BACKGROUND)
	return room
}

/**
 * Worker-side counterpart of the viewer's Player-driven init: apply every
 * entry's live (authored) state once, then fan out the lightmap prims exactly
 * like the per-frame delta path. Without this the worker holds overlays and
 * lamp levels at generated defaults until the first delta touches them.
 */
export function applyInitialEntryStates(cache: NodeCache, renderApi: unknown, table: unknown): void {
	const changedLights = new Set<string>()
	for (const entry of cache.entries) {
		if (!entry) continue
		entry.updater.applyState(entry.node, entry.item.getState(), renderApi, table)
		if (cache.lightNames.has(entry.name)) changedLights.add(entry.name)
	}
	fanOutLightmap(cache, renderApi, table, changedLights)
}
