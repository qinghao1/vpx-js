// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

/** Message shapes and fallback matrix for the render-worker handoff. */

export type RenderMode = 'l0-shared' | 'l2-main'

export interface RenderCaps {
	offscreenCanvas: boolean
	webgpuInWorker: boolean
	crossOriginIsolated: boolean
	sharedArrayBuffer: boolean
}

/**
 * L0 needs everything: transferable canvas, WebGPU usable in a worker (a stricter
 * floor than page-level WebGPU), and cross-origin isolation for SAB. Anything
 * less stays on the main thread (L2).
 */
export function selectRenderMode(caps: RenderCaps): RenderMode {
	if (caps.sharedArrayBuffer && caps.crossOriginIsolated && caps.offscreenCanvas && caps.webgpuInWorker) {
		return 'l0-shared'
	}
	return 'l2-main'
}

/**
 * Boot camera FOV: table desktop set clamped to the main-thread 20-70 range,
 * 45 fallback. Shared so the worker boot matches the viewer rule exactly.
 */
export function resolveBootFov(fov?: number): number {
	if (!Number.isFinite(fov)) return 45
	return Math.max(20, Math.min(70, fov as number))
}

/** Coarse main-thread probe; WebGPU-in-worker is confirmed only by worker init. */
export function probeRenderCaps(canvas: { transferControlToOffscreen?: unknown }): RenderCaps {
	const g = globalThis as Record<string, unknown>
	return {
		offscreenCanvas: typeof canvas.transferControlToOffscreen === 'function',
		webgpuInWorker: typeof navigator !== 'undefined' && (navigator as Navigator & { gpu?: unknown }).gpu != null,
		crossOriginIsolated: g.crossOriginIsolated === true,
		sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
	}
}

export interface WorkerInitMsg {
	type: 'init'
	sab: SharedArrayBuffer
	/**
	 * Present for L0 scene boot; absent in unit tests. One-shot transfer: main-bridge
	 * passes it in the postMessage transfer list, so it is neutered on the sender.
	 */
	canvas?: OffscreenCanvas
	width: number
	height: number
	pixelRatio: number
	mode: RenderMode
	/** Absolute URL of the .vpx table the worker parses for its own scene. */
	tableUrl?: string
	/**
	 * Boot camera FOV in degrees, resolved on the main thread from the table
	 * desktop set (bgFov[0], clamped 20-70, fallback 45). The worker still
	 * follows the per-frame published FOV after boot; this only removes the
	 * pre-publish divergence from the hardcoded 45.
	 */
	fov?: number
	/**
	 * Hosting page mode. Postprocess parity demands the worker assemble
	 * with the same mode (play hides the cabinet-flipper rig, viewer
	 * keeps it); defaults to play.
	 */
	viewerMode?: 'viewer' | 'play'
	/** Transferred default-texture bitmaps keyed by file name (no URL guessing). */
	defaults?: Array<{ name: string; bitmap: ImageBitmap }>
}

export interface WorkerResizeMsg {
	type: 'resize'
	width: number
	height: number
	pixelRatio: number
	seq: number
}

/**
 * On-demand backing-store readback: the worker re-runs the 64px lit probe and
 * the result surfaces on the next stats tick (`lit`). Lets harnesses compare
 * presented pixels across camera moves; headless runs never present to a
 * screen, so this is the only pixel-visibility signal.
 */
export interface WorkerReadbackMsg {
	type: 'readback'
}

/**
 * On-demand full-frame readback for A/B harnesses: the worker PNG-encodes
 * its backing store inside applyFrame right after render (same-task rule as
 * the lit probe) and posts the bytes back. Test-only traffic; the hot path
 * never touches it.
 */
export interface WorkerPixelsMsg {
	type: 'readback-pixels'
}

/** Full-frame PNG bytes answering a `readback-pixels` request. */
export interface WorkerPngMsg {
	type: 'readback-png'
	png: ArrayBuffer
}

export interface WorkerStatsMsg {
	type: 'stats'
	fps: number
	slot: number
	version: number
	/**
	 * Fraction of sampled pixels brighter than near-black from the backing-store readback (0..1).
	 * Absent until the first readback lands; refreshed by on-demand `readback` posts.
	 */
	lit?: number
	/**
	 * Glass meshes hidden by the boot content-parity pass (postProcessScene).
	 * Lets harnesses prove the veil fix through the stats channel; absent
	 * until boot completes. Stays 0 on tables without a glass cover.
	 */
	glassHidden?: number
}

/**
 * Worker-to-main boot-failure signal. The worker posts this via `postMessage`
 * when scene boot fails (missing canvas/table URL, failed import, WebGPU init
 * failure); the main thread listens on the worker `onmessage` handler installed
 * by `RenderBridge.attach` and routes it to `BridgeOptions.onBootFailure`;
 * the caller fails outright (no main-thread fallback).
 */
export interface WorkerBootFailureMsg {
	type: 'boot-failure'
	error: string
}

export type WorkerInMsg = WorkerInitMsg | WorkerResizeMsg | WorkerReadbackMsg | WorkerPixelsMsg
export type WorkerOutMsg = WorkerStatsMsg | WorkerBootFailureMsg | WorkerPngMsg
