// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { Matrix4, type Object3D } from 'three'
import { getAuthoredVisible } from './authored-visible.js'

/** Debug counters for batched-visibility fallback paths (warn-free by design). */
export interface BatchedVisibilityStats {
	hideFailed: number
	restoreFailed: number
	setFailed: number
}

export interface BatchedInstanceInfo {
	batched: any
	instanceId: number
	isInstanced?: boolean
	matrix?: Matrix4
}

// Shared zero-scale matrix for InstancedMesh hides: setMatrixAt copies the
// values into the instance buffer, so one frozen instance is safe to reuse
// instead of allocating per hide.
export const ZERO_SCALE = new Matrix4().makeScale(0, 0, 0)

function batchedInfoOf(node: Object3D): BatchedInstanceInfo | undefined {
	const info = (node as { userData?: { __batched?: unknown } }).userData?.__batched as BatchedInstanceInfo | undefined
	return info?.batched && typeof info.instanceId === 'number' ? info : undefined
}

function hideInstance(info: BatchedInstanceInfo, stats: BatchedVisibilityStats): void {
	try {
		if (info.isInstanced) {
			info.batched.setMatrixAt(info.instanceId, ZERO_SCALE)
			info.batched.instanceMatrix.needsUpdate = true
		} else {
			info.batched.setVisibleAt?.(info.instanceId, false)
		}
	} catch {
		// Count-and-continue: a failed hide leaves the stale instance visible,
		// which unbatch below repairs by restoring the original mesh.
		stats.hideFailed++
	}
}

/**
 * Restores every batched original under `obj` (script matrix writes and
 * material swaps need the live mesh back) and hides the stale batch slots.
 */
export function unbatchInstances(obj: Object3D, stats: BatchedVisibilityStats): void {
	if (!obj) return
	const visit = (current: any): void => {
		const info = current.userData?.__batched
		if (info?.batched && typeof info.instanceId === 'number') {
			hideInstance(info, stats)
			current.visible = true
			let anc: any = current.parent
			while (anc && anc !== obj.parent) {
				if (!anc.visible) anc.visible = true
				if (anc === obj) break
				anc = anc.parent
			}
			delete current.userData.__batched
		}
		if (current.children) for (const child of current.children) visit(child)
	}
	visit(obj)
}

function syncInstance(
	node: Object3D,
	info: BatchedInstanceInfo,
	visible: boolean,
	stats: BatchedVisibilityStats,
): void {
	if (info.isInstanced) {
		if (!visible) {
			hideInstance(info, stats)
			return
		}
		// InstancedMesh has no per-instance visibility flag: hide zero-scales
		// the slot, so show must restore the pre-batch matrix saved at batch
		// time. Without a saved matrix, unbatch the mesh so it can never
		// disappear (hidden instance + hidden original).
		try {
			if (info.matrix) {
				info.batched.setMatrixAt(info.instanceId, info.matrix)
				info.batched.instanceMatrix.needsUpdate = true
			} else {
				hideInstance(info, stats)
				node.visible = true
				delete (node as { userData?: { __batched?: unknown } }).userData?.__batched
			}
		} catch {
			// Count-and-continue: the instance slot keeps its last matrix;
			// the source mesh keeps its own visibility flag.
			stats.restoreFailed++
		}
		return
	}
	try {
		info.batched.setVisibleAt?.(info.instanceId, !!visible)
	} catch {
		// Count-and-continue: BatchedMesh visibility stays stale for this
		// slot; the source mesh keeps its own visibility flag.
		stats.setFailed++
	}
}

/**
 * Single-walk visibility over the subtree: drives each batch slot, then sets
 * the source flags. A batched original stays hidden while its batch slot
 * carries the pixels: unhiding it on the show path would double-render
 * (original + instance with identical transforms, z-fighting at 2x cost).
 * A child stamped __authoredVisible: false (e.g. a cabinet/backbox bulb
 * glow quad, see ThreeConverter.createMesh) must survive the show path:
 * the lamp updater gates it on authored visibility, so a blanket show
 * here would unhide what the author hid.
 * The flags run to every depth, not just the direct children: nested
 * item groups (light groups, ramp assemblies) keep meshes below the
 * first level, and a shallow show/hide left those flags stale — the
 * subtree then renders (or stays dark) against the author's intent
 * once an ancestor toggles.
 */
export function applyBatchedVisibility(obj: Object3D, visible: boolean, stats: BatchedVisibilityStats): void {
	if (!obj) return
	const visit = (node: Object3D): void => {
		const info = batchedInfoOf(node)
		if (info) syncInstance(node, info, visible, stats)
		// Re-read: the sync above may have unbatched the node (missing
		// restore matrix), which must then follow the plain show path.
		node.visible = visible && getAuthoredVisible(node) && !batchedInfoOf(node)
		for (const child of node.children ?? []) visit(child)
	}
	visit(obj)
}
