// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Object3D, PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu'
import type { ThreeRenderApi } from '../../dist-esm/lib/render/threejs/three-render-api.js'
import type { Table } from '../../dist-esm/lib/vpt/table/table.js'
import type { Viewer } from './viewer.js'

/** Live ball pose in engine units. */
export interface VpxBallPose {
	id: number
	x: number
	y: number
	z: number
}

/** Live plunger pull, normalized 0 (rest) to 1 (full pull). */
export interface VpxPlunger {
	partIdx: number
	name: string | undefined
	pull: number
}

/** Live flipper angle in radians. */
export interface VpxFlipper {
	partIdx: number
	name: string | undefined
	angle: number
}

/** Point-in-time load, mode, and engine snapshot. Fresh on every read. */
export interface VpxState {
	mode: 'viewer' | 'play'
	loadState: string
	tableName: string | undefined
	wasmReady: boolean
	paused: boolean
	ballCount: number
	balls: VpxBallPose[]
	plungers: VpxPlunger[]
	flippers: VpxFlipper[]
	scriptErrors: number
	catalogSize: number
	partNames: string[]
	lightActivity: number
	gameMs: number
}

/** Live scene handles for framing and screenshots. No engine pokes: use the API above. */
export interface VpxThree {
	scene: Scene
	camera: PerspectiveCamera
	controls: OrbitControls | null
	renderer: WebGPURenderer | null
	tableGroup: Object3D | null
	renderApi: ThreeRenderApi | null
	table: Table | null
}

export interface VpxDmdFrame {
	frame: Uint8Array
	width: number
	height: number
	frameId: number
}

/**
 * Typed end-to-end test surface. Replaces poking viewer privates
 * (`_cameraGen`, `_cameraRaf`, `_sendKey`, `_nudge`)
 * and matching "Ready" in the log. Exposed as dev-only `window.vpx`.
 */
export interface ViewerTestApi {
	/** Snapshot of load, mode, and engine state. */
	readonly state: VpxState
	/** Live three.js handles for framing/screenshots. */
	readonly three: VpxThree
	/** Resolve once the load lifecycle reaches `ready`; reject on `error` or timeout. */
	whenReady(timeoutMs?: number): Promise<void>
	/** Enter/leave play mode through the same path as UI input (awaits the camera move). */
	setMode(mode: 'viewer' | 'play'): Promise<void>
	/** Stop any in-flight camera animation, leaving the camera where it stands. */
	cancelCameraAnimation(): void
	/** Route a keyboard code to the engine (same mapping as live input). */
	sendKey(code: string, down: boolean): void
	/** Nudge the cabinet through the engine (play-mode gated, like live input). */
	nudge(angleDeg: number, force?: number): void
	/** Run one engine step plus scene sync outside the rAF loop. Returns whether a step ran. */
	step(nowMs?: number): boolean
	/** Latest DMD frame, if the engine publishes one. */
	dmd(): VpxDmdFrame | undefined
}

const normalizePull = (pos: number, start: number, end: number): number => {
	if (!Number.isFinite(pos) || end === start) return 0
	return Math.min(1, Math.max(0, (pos - start) / (end - start)))
}

/** Build the dev-only test surface over a live viewer. No stored mutable state. */
export function createTestApi(viewer: Viewer): ViewerTestApi {
	return {
		get state(): VpxState {
			const engine = viewer.wasmEngine
			return {
				mode: viewer.viewerMode,
				loadState: document.body.dataset.loadState ?? '',
				tableName: viewer.table?.getName?.() ?? undefined,
				wasmReady: engine?.ready ?? false,
				paused: viewer.isPaused,
				ballCount: engine?.ballCount ?? 0,
				balls: engine?.ballPoses() ?? [],
				plungers: (engine?.plungerPositions() ?? []).map(p => ({
					partIdx: p.partIdx,
					name: p.name,
					pull: normalizePull(p.pos, p.start, p.end),
				})),
				flippers: (engine?.flipperAngles() ?? []).map(f => ({ ...f, name: engine?.partName(f.partIdx) })),
				scriptErrors: engine?.scriptErrorCount ?? 0,
				catalogSize: engine?.catalogSize ?? 0,
				partNames: engine?.catalogNames() ?? [],
				lightActivity: engine?.lightActivity ?? 0,
				gameMs: engine?.gameMs ?? 0,
			}
		},
		get three(): VpxThree {
			return {
				scene: viewer.scene,
				camera: viewer.camera,
				controls: viewer.controls,
				renderer: viewer.renderer,
				tableGroup: viewer.tableGroup,
				renderApi: viewer.renderApi,
				table: viewer.table,
			}
		},
		whenReady(timeoutMs = 60000): Promise<void> {
			const deadline = Date.now() + timeoutMs
			return new Promise((resolve, reject) => {
				const poll = () => {
					const s = document.body.dataset.loadState ?? ''
					if (s === 'ready') return resolve()
					if (s === 'error') return reject(new Error('load state is error'))
					if (Date.now() >= deadline) return reject(new Error(`load not ready after ${timeoutMs}ms`))
					setTimeout(poll, 250)
				}
				poll()
			})
		},
		setMode(mode: 'viewer' | 'play'): Promise<void> {
			return viewer.setMode(mode)
		},
		cancelCameraAnimation(): void {
			viewer.cancelCameraAnimation()
		},
		sendKey(code: string, down: boolean): void {
			viewer._sendKey(code, down)
		},
		nudge(angleDeg: number, force = 2.6): void {
			viewer._nudge(angleDeg, force)
		},
		step(nowMs = performance.now()): boolean {
			return viewer.stepOnce(nowMs)
		},
		dmd(): VpxDmdFrame | undefined {
			return viewer.wasmEngine?.dmdFrame
		},
	}
}
