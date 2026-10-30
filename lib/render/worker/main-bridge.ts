// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

/** Main-thread side of the render-worker handoff: SAB owner, publisher, fallback selector. */

import {
	BALL_STRIDE,
	createFrameStateBuffer,
	DELTA_STRIDE,
	F_BALL_COUNT,
	F_BALLS,
	F_DELTA_COUNT,
	F_DELTAS,
	F_DMD_FRAME_ID,
	F_LAST_PRESENT,
	F_OVERALL_FRAMES,
	F_SIM_TIME,
	F_TARGET_LEN,
	F_TIME_SEC,
	F_VIEW,
	F_VSYNC,
	FrameState,
	MAX_BALLS,
	MAX_DELTAS,
} from './frame-state.js'
import type { WorkerInMsg, WorkerOutMsg } from './worker-protocol.js'
import { probeRenderCaps, type RenderCaps, selectRenderMode } from './worker-protocol.js'

/** Packed caller-owned views; the bridge copies them into the slot, never retains them. */
export interface BridgeFrame {
	simTime: number
	timeSec: number
	overallFrames: number
	balls: Float32Array
	ballCount: number
	deltas: Float32Array
	deltaCount: number
	view: Float32Array
	vsync: number
	lastPresentTick: number
	targetLen: number
	dmdFrameId: number
}

export function createBridgeScratch(): {
	balls: Float32Array
	deltas: Float32Array
	view: Float32Array
} {
	return {
		balls: new Float32Array(MAX_BALLS * BALL_STRIDE),
		deltas: new Float32Array(MAX_DELTAS * DELTA_STRIDE),
		view: new Float32Array(16),
	}
}

export interface BridgeOptions {
	workerUrl?: string | URL
	width?: number
	height?: number
	pixelRatio?: number
	/** Absolute .vpx URL the worker fetches to build its own scene. Required for L0. */
	tableUrl?: string
	/** Boot camera FOV in degrees (table desktop set); forwarded to the worker init message. */
	fov?: number
	/** Hosting page mode; forwarded so worker assembly matches page postprocess. */
	viewerMode?: 'viewer' | 'play'
	/** Default-texture bitmaps (ball, bumper, kicker) carried over, not re-fetched. */
	defaults?: Array<{ name: string; bitmap: ImageBitmap }>
	onStats?: (stats: { fps: number; slot: number; version: number; lit?: number; glassHidden?: number }) => void
	/** Fired when the worker posts a boot-failure message; the caller fails outright. */
	onBootFailure?: (error: string) => void
}

/**
 * L0 fast path. attach() throws whenever a gate fails — no silent L2
 * fallback. The worker path either works or fails outright.
 */
export class RenderBridge {
	private disposed = false
	private pngResolve: ((bytes: Uint8Array) => void) | null = null
	private pngPromise: Promise<Uint8Array> | null = null

	private constructor(
		readonly state: FrameState,
		private readonly worker: Worker,
		private lastResizeSeq = 0,
	) {}

	static attach(
		canvas: HTMLCanvasElement,
		opts: BridgeOptions = {},
		capsOverride?: Partial<RenderCaps>,
	): RenderBridge | null {
		const caps = { ...probeRenderCaps(canvas), ...capsOverride }
		if (selectRenderMode(caps) !== 'l0-shared')
			throw new Error('Render worker needs OffscreenCanvas + SAB + isolation + WebGPU')
		if (!opts.tableUrl) throw new Error('Render worker needs a table URL')
		if (typeof canvas.transferControlToOffscreen !== 'function')
			throw new Error('Render worker needs transferControlToOffscreen')
		{
			const offscreen = canvas.transferControlToOffscreen()
			const sab = createFrameStateBuffer()
			new FrameState(sab).reset()
			const url = opts.workerUrl ?? new URL('./render-worker.js', import.meta.url)
			const worker = new Worker(url as unknown as string | URL, { type: 'module' })
			const width = opts.width ?? (typeof window !== 'undefined' ? window.innerWidth : 800)
			const height = opts.height ?? (typeof window !== 'undefined' ? window.innerHeight : 600)
			const pixelRatio = opts.pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
			const init: WorkerInMsg = {
				type: 'init',
				sab,
				canvas: offscreen,
				width,
				height,
				pixelRatio,
				mode: 'l0-shared',
				tableUrl: opts.tableUrl,
				fov: opts.fov,
				viewerMode: opts.viewerMode,
				defaults: opts.defaults ?? [],
			}
			const bridge = new RenderBridge(new FrameState(sab), worker)
			worker.onerror = ev => {
				console.warn('[render-worker]', (ev as ErrorEvent)?.message ?? ev)
			}
			worker.onmessage = ev => {
				const msg = (ev as MessageEvent).data as WorkerOutMsg
				if (msg?.type === 'stats') {
					opts.onStats?.({
						fps: msg.fps,
						slot: msg.slot,
						version: msg.version,
						lit: msg.lit,
						glassHidden: msg.glassHidden,
					})
				} else if (msg?.type === 'boot-failure') {
					opts.onBootFailure?.(msg.error)
				} else if (msg?.type === 'readback-png') {
					bridge.pngResolve?.(new Uint8Array(msg.png))
					bridge.pngResolve = null
					bridge.pngPromise = null
				}
			}
			// One-shot transfer: the canvas and bitmaps are neutered on this thread; do not reuse after attach.
			worker.postMessage(init, [
				offscreen,
				...(opts.defaults ?? []).map(d => d.bitmap),
			] as never as Transferable[])
			return bridge
		}
	}

	/** Publish into the shared slot; payloads move by bounded memcpys, never per-frame allocation. */
	publishFrame(frame: BridgeFrame): number {
		if (this.disposed) return -1
		return this.state.publish(slot => {
			slot[F_SIM_TIME] = frame.simTime
			slot[F_TIME_SEC] = frame.timeSec
			slot[F_OVERALL_FRAMES] = frame.overallFrames
			const balls = Math.min(frame.ballCount, MAX_BALLS)
			slot[F_BALL_COUNT] = balls
			slot.set(frame.balls.subarray(0, balls * BALL_STRIDE), F_BALLS)
			const deltas = Math.min(frame.deltaCount, MAX_DELTAS)
			slot[F_DELTA_COUNT] = deltas
			slot.set(frame.deltas.subarray(0, deltas * DELTA_STRIDE), F_DELTAS)
			slot.set(frame.view.subarray(0, 16), F_VIEW)
			slot[F_VSYNC] = frame.vsync
			slot[F_LAST_PRESENT] = frame.lastPresentTick
			slot[F_TARGET_LEN] = frame.targetLen
			slot[F_DMD_FRAME_ID] = frame.dmdFrameId
		})
	}

	publishDmd(src: Uint8Array | Uint8ClampedArray, w?: number, h?: number): number {
		return this.state.publishDmd(src, w, h)
	}

	/**
	 * Ask the worker to re-run its backing-store lit probe; the result surfaces
	 * on the next stats tick (`lit`). Fire-and-forget.
	 */
	requestReadback(): void {
		if (this.disposed) return
		this.worker.postMessage({ type: 'readback' })
	}

	/**
	 * Full-frame PNG bytes from the worker backing store, captured inside the
	 * worker applyFrame right after render. A/B harnesses only.
	 */
	requestPixels(): Promise<Uint8Array> {
		if (this.disposed) return Promise.reject(new Error('render bridge disposed'))
		if (!this.pngPromise) {
			this.pngPromise = new Promise<Uint8Array>(resolve => {
				this.pngResolve = resolve
			})
			this.worker.postMessage({ type: 'readback-pixels' })
		}
		return this.pngPromise
	}

	notifyResize(width: number, height: number, pixelRatio: number): number {
		if (this.disposed) return this.lastResizeSeq
		this.lastResizeSeq = (this.lastResizeSeq + 1) | 0
		this.worker.postMessage({ type: 'resize', width, height, pixelRatio, seq: this.lastResizeSeq })
		return this.lastResizeSeq
	}

	dispose(): void {
		this.disposed = true
		this.worker.terminate()
	}
}
