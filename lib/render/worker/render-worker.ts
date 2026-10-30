// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

/**
 * Render-worker entry: owns the worker-side rAF loop and drains the SAB slots.
 *
 * Two layers share this module. The driver below is transport only (message
 * routing, slot consume, stats) and stays dependency-free so unit tests can
 * drive it in Node. The scene layer boots on `init` when the message carries a
 * canvas plus table URL: it builds the same table scene the main thread would
 * (same Table parse, same ThreeRenderApi path, same updaters), then poses it
 * from balls, semantic delta rows, view offsets, and DMD versions.
 */

import {
	BALL_ORIENT,
	BALL_STRIDE,
	createSlotScratch,
	DMD_BYTES,
	F_BALL_COUNT,
	F_BALLS,
	F_DELTA_COUNT,
	F_DMD_FRAME_ID,
	F_VIEW,
	FrameState,
	groupDeltaFields,
	MAX_BALLS,
	readViewCamera,
	setStateField,
	V_ACC_X,
	V_ACC_Y,
	V_NUDGE_X,
	V_NUDGE_Y,
} from './frame-state.js'
import { ensureProcessShim } from './process-shim.js'
import { buildNodeCache, fanOutLightmap, type NodeCache, nudgeOffset } from './shared-scene.js'
import type { WorkerInitMsg, WorkerInMsg } from './worker-protocol.js'
import { resolveBootFov } from './worker-protocol.js'

// Workers get no page script, so install the browser `process` shape here,
// before any dynamic import evaluates Node-oriented deps (wpc-emu via the
// scripting chain). The bundler only injects a bare fallback without `.on`.
ensureProcessShim()

/** Consumes decoded slots; the real pipeline wires VpxRenderPipeline apply paths here. */
export interface WorkerFrameSink {
	applyFrame(scratch: Float32Array, slot: number, version: number): void
	applyResize?(width: number, height: number, pixelRatio: number): void
	/** Re-runs the backing-store lit probe; the result surfaces on stats (`lit`). */
	requestReadback?(): void
	/** PNG-encodes the backing store after the next render; posts `readback-png`. */
	requestPixels?(): void
}

export interface WorkerDriver {
	readonly state: FrameState | null
	onMessage(ev: { data: WorkerInMsg }): void
	tick(): void
	dispose(): void
}

let currentSink: WorkerFrameSink = { applyFrame: () => {} }

/** Override the no-op default before init in workers that render for real. */
export function setWorkerFrameSink(sink: WorkerFrameSink): void {
	currentSink = sink
}

function requestFrame(cb: () => void): number {
	const w = globalThis as unknown as {
		requestAnimationFrame?: (c: () => void) => number
		cancelAnimationFrame?: (id: number) => void
	}
	if (typeof w.requestAnimationFrame === 'function') return w.requestAnimationFrame.call(globalThis, cb)
	return setTimeout(cb, 16) as unknown as number
}

function cancelFrame(id: number): void {
	const w = globalThis as unknown as { cancelAnimationFrame?: (id: number) => void }
	if (typeof w.cancelAnimationFrame === 'function') w.cancelAnimationFrame.call(globalThis, id)
	else clearTimeout(id)
}

export function createWorkerDriver(getSink: () => WorkerFrameSink = () => currentSink): WorkerDriver {
	let state: FrameState | null = null
	let scratch: Float32Array | null = null
	let raf = 0
	let disposed = false
	let lastStats = 0
	let frames = 0

	const loop = (): void => {
		if (disposed) return
		driver.tick()
		raf = requestFrame(loop)
	}
	const driver: WorkerDriver = {
		get state() {
			return state
		},
		onMessage(ev: { data: WorkerInMsg }): void {
			const msg = ev.data
			if (!msg || typeof msg.type !== 'string') return
			if (msg.type === 'init') {
				state = new FrameState(msg.sab)
				scratch = createSlotScratch()
				if (!raf) raf = requestFrame(loop)
				const init = msg as WorkerInitMsg
				if (init.canvas && init.tableUrl)
					void bootWorkerScene(init).catch(err => {
						;(globalThis as unknown as { postMessage?: (m: unknown) => void }).postMessage?.({
							type: 'boot-failure',
							error: (err as Error)?.stack ?? String(err),
						})
					})
				return
			}
			if (msg.type === 'resize') {
				getSink().applyResize?.(msg.width, msg.height, msg.pixelRatio)
				return
			}
			if (msg.type === 'readback') {
				getSink().requestReadback?.()
				return
			}
			if (msg.type === 'readback-pixels') {
				getSink().requestPixels?.()
				return
			}
		},
		tick(): void {
			if (!state || !scratch) return
			const got = state.tryConsume(scratch)
			if (!got) return
			const activeSink = getSink()
			activeSink.applyFrame(scratch, got.slot, got.version)
			frames++
			const now = Date.now()
			if (now - lastStats > 500) {
				const elapsed = now - lastStats
				lastStats = now
				const lit = (activeSink as { readbackLit?: unknown }).readbackLit
				const out: Record<string, unknown> = {
					type: 'stats',
					fps: (frames * 1000) / Math.max(1, elapsed),
					slot: got.slot,
					version: got.version,
				}
				if (typeof lit === 'number') out.lit = lit
				const glassHidden = (activeSink as { parityGlassHidden?: unknown }).parityGlassHidden
				if (typeof glassHidden === 'number') out.glassHidden = glassHidden
				;(globalThis as unknown as { postMessage?: (m: unknown) => void }).postMessage?.(out)
				frames = 0
			}
		},
		dispose(): void {
			disposed = true
			if (raf) cancelFrame(raf)
			raf = 0
			state = null
			scratch = null
		},
	}
	return driver
}

// Auto-wire only inside a real worker; importing this module on main/test threads is inert.
if (typeof self !== 'undefined' && typeof window === 'undefined') {
	const driver = createWorkerDriver()
	;(self as unknown as { onmessage: ((ev: { data: WorkerInMsg }) => void) | null }).onmessage = ev =>
		driver.onMessage(ev)
}

// ---------------------------------------------------------------------------
// Scene layer. Heavy three/table dependencies load lazily so importing this
// module stays safe on the main thread and in Node. Everything below runs
// only inside the worker after a successful boot.
// ---------------------------------------------------------------------------

/** View vector layout lives in frame-state.ts (V_CAM_* / V_PX_* / V_NUDGE_* / V_ACC_*). */

async function bootWorkerScene(init: WorkerInitMsg): Promise<void> {
	if (!init.canvas || !init.tableUrl) throw new Error('worker scene needs canvas + tableUrl')
	const canvas = init.canvas
	const tableUrl = init.tableUrl
	const THREE = await import('three')
	const { WebGPURenderer } = await import('three/webgpu')
	const { BrowserBinaryReader } = await import('../../io/binary-reader.js')
	const { Table } = await import('../../vpt/table/table.js')
	const { ThreeRenderApi } = await import('../threejs/three-render-api.js')
	const { ThreeTextureLoaderWorker } = await import('./worker-textures.js')
	const { AnimationGate } = await import('../../util/animation-gate.js')
	const { computePlayFraming, computeViewerFraming } = await import('../threejs/three-camera-framing.js')
	const { VpxRenderPipeline } = await import('../threejs/three-render-pipeline.js')
	const { Matrix3D } = await import('../../math/matrix.js')
	const { GpuDmdNodeController } = await import('../threejs/nodes/dmd-node.js')
	const { applyRendererToneMapping } = await import('../threejs/tone-mapping.js')
	// Dynamic: static evaluation would run before ensureProcessShim above and
	// crash on bare `process.on` (three-render-api pulls Node-oriented deps).
	const { assembleTableScene, syncTableRoom, applyInitialEntryStates } = await import('../threejs/table-scene.js')

	const state = new FrameState(init.sab)
	const renderer = new WebGPURenderer({
		canvas: canvas as unknown as HTMLCanvasElement,
		antialias: true,
		powerPreference: 'high-performance',
	})
	// Mirror the main-thread renderer setup (viewer _createRenderer):
	// identical output transform, sort order, and shadows-or-lack-thereof.
	renderer.outputColorSpace = THREE.SRGBColorSpace
	renderer.sortObjects = true
	renderer.shadowMap.enabled = false
	await renderer.init()
	renderer.setPixelRatio(init.pixelRatio)
	renderer.setSize(init.width, init.height, false)

	const res = await fetch(tableUrl)
	if (!res.ok) throw new Error(`table fetch failed (${res.status})`)
	const reader = new BrowserBinaryReader(new Uint8Array(await res.arrayBuffer()))
	await reader.open()
	const table = await Table.load(reader, {})
	// Main thread applies this in _buildScene; the worker bundle owns a
	// separate material-shared copy that defaults to 1 (TWD stores 0.25).
	const { setGlobalEmissionScale } = await import('../threejs/material-shared.js')
	const emissionScale = (table as unknown as { data?: { globalEmissionScale?: unknown } }).data?.globalEmissionScale
	if (Number.isFinite(emissionScale)) setGlobalEmissionScale(emissionScale as number)

	const texLoader = new ThreeTextureLoaderWorker()
	texLoader.seedDefaults(init.defaults ?? [])
	const renderApi = new ThreeRenderApi({ applyMaterials: true, applyTextures: texLoader }, new AnimationGate())
	const { DEFAULT_TEXTURE_FILES } = await import('../threejs/three-texture-loader-browser.js')
	for (const fileName of DEFAULT_TEXTURE_FILES) {
		const tex = await texLoader.loadDefaultTexture(fileName, '.png', fileName)
		renderApi
			.getMapGenerator()
			.getCache()
			.set(fileName, tex as never)
	}
	const { getMaxLights } = await import('../../util/quality.js')
	let cache: NodeCache | null = null
	// Same assembly the main-thread viewer runs (same generate flags, same
	// postprocess, same transmission lift, same light cull). The authored sweep
	// runs before postprocess so stray-mesh hides match the main thread (a
	// post-assembly sweep would re-show them and diverge).
	const { node: built, stats: ppStats } = await assembleTableScene(renderApi, table as never, {
		viewerMode: init.viewerMode ?? 'play',
		batch: false,
		maxLights: getMaxLights(),
		onBeforePostprocess: node => {
			cache = buildNodeCache(table as never, node as never)
			applyInitialEntryStates(cache as never, renderApi, table)
		},
	})
	const root = new THREE.Group()
	root.name = 'tableRoot'
	root.add(built)
	// Boot framing follows the hosting page's mode (viewer keeps the cabinet
	// rig, play hides it; centers/sizes/near/far all differ by mode): the
	// first published camera only corrects pos/target/fov/near, so boot
	// values for room and far must already match.
	const framing = (init.viewerMode === 'viewer' ? computeViewerFraming : computePlayFraming)(root as never) as {
		position: { x: number; y: number; z: number }
		target: { x: number; y: number; z: number }
		center: { x: number; y: number; z: number }
		size: { x: number; y: number; z: number }
		near: number
		far: number
	}

	const scene = new THREE.Scene()
	// Base lights mirror demo-browser scene lights (demo-browser/src/config.js).
	scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.35))
	const dir = new THREE.DirectionalLight(0xffffff, 0.4)
	dir.position.set(400, -600, 1200)
	scene.add(dir)
	scene.add(new THREE.AmbientLight(0xffffff, 0.18))
	scene.add(root)
	syncTableRoom(scene as never, root as never, framing.center as never, framing.size as never)
	console.log(
		`[render-worker] scene assembled: glass hidden ${ppStats.glass ?? 0}, overlays ${ppStats.lightmaps ?? 0}`,
	)

	for (let pass = 0; pass < 3; pass++) {
		const { loaded } = await renderApi.getMapGenerator().demandPendingMaps(root as never, table as never)
		if (!loaded.length) break
	}
	// Demand only fills the cache: bind arrived textures onto materials and
	// clear their pending keys, like the main thread does after streaming.
	// Without this every deferred map stays pending and renders untextured.
	renderApi.getMaterialGenerator().resolvePendingInScene(root as never)
	renderApi.getMaterialGenerator().resolvePendingTextures()

	// The per-frame published FOV takes over after the first publish; the boot
	// value only removes the pre-publish divergence from the hardcoded 45.
	const camera = new THREE.PerspectiveCamera(
		resolveBootFov(init.fov),
		init.width / init.height,
		framing.near,
		framing.far,
	)
	camera.position.set(framing.position.x, framing.position.y, framing.position.z)
	camera.lookAt(framing.target.x, framing.target.y, framing.target.z)

	applyRendererToneMapping(renderer as never, (table as { data?: unknown }).data, false)
	const data = (table as unknown as { data?: Record<string, number> }).data ?? {}
	const pipeline = new VpxRenderPipeline(renderer as never, scene as never, camera as never, {
		toneMapper: data.toneMapper,
		exposure: data.exposure,
		lowQuality: false,
		bloomEnabled: true,
		bloomStrength: Number.isFinite(data.bloomStrength) ? data.bloomStrength : 0.22,
	})
	await (renderer as unknown as { compileAsync?(s: unknown, c: unknown): Promise<void> }).compileAsync?.(
		scene,
		camera,
	)

	if (!cache) throw new Error('Render worker scene assembly produced no node cache')
	const { entries, lightmap, lightNames, idOf, names } = cache

	const ballGroup = new THREE.Group()
	ballGroup.name = 'balls'
	scene.add(ballGroup)
	const ballGeo = new THREE.SphereGeometry(1, 24, 16)
	const ballMap: unknown =
		renderApi.getMapGenerator().getCache().get('ball.png') ?? renderApi.getMapGenerator().getCache().get('ball')
	const ballPool: Array<{ mesh: InstanceType<typeof THREE.Mesh> }> = []
	for (let i = 0; i < MAX_BALLS; i++) {
		const mat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		if (ballMap) (mat as { map?: unknown }).map = ballMap
		const mesh = new THREE.Mesh(ballGeo, mat)
		mesh.visible = false
		mesh.matrixAutoUpdate = false
		mesh.name = `Ball${i + 1}`
		ballGroup.add(mesh)
		ballPool.push({ mesh })
	}

	const dmd = new GpuDmdNodeController(128, 32)
	let dmdVersion = -1
	const dmdScratch = new Uint8Array(DMD_BYTES)
	{
		const dmdNames = new Set(['dmd'])
		for (const k in (
			table as unknown as { flashers?: Record<string, { data?: { isDMD?: boolean }; getName(): string }> }
		).flashers ?? {}) {
			const fl = (
				table as unknown as { flashers: Record<string, { data?: { isDMD?: boolean }; getName(): string }> }
			).flashers[k]
			if (fl?.data?.isDMD) {
				dmdNames.add(k.toLowerCase())
				dmdNames.add(fl.getName().toLowerCase())
			}
		}
		for (const k in (
			table as unknown as { textboxes?: Record<string, { data?: { isDMD?: boolean }; getName(): string }> }
		).textboxes ?? {}) {
			const tb = (
				table as unknown as { textboxes: Record<string, { data?: { isDMD?: boolean }; getName(): string }> }
			).textboxes[k]
			if (tb?.data?.isDMD) {
				dmdNames.add(k.toLowerCase())
				dmdNames.add(tb.getName().toLowerCase())
			}
		}
		scene.traverse(o => {
			const mesh = o as { isMesh?: boolean; name?: string; material?: unknown }
			if (!mesh.isMesh || !mesh.name) return
			if (dmdNames.has(mesh.name.toLowerCase()) || mesh.name.toLowerCase().includes('dmd')) {
				mesh.material = dmd.material as unknown
			}
		})
	}

	const basePos = root.position.clone()
	const ballMats = {
		orient: Matrix3D.claim(),
		trans: Matrix3D.claim(),
		scale: Matrix3D.claim(),
		mat: Matrix3D.claim(),
	}
	const touched = new Map<number, Map<string, number[]>>()
	const lastApplied = new Map<number, string>()

	let readbackDone = false
	let pendingProbe = false
	let pendingPng = false
	// 64px backing-store probe: lit = fraction of 4096 pixels with channel sum v > 128.
	// The floor sits above the 0x121a2b scene background (sum 87) so the probe
	// counts rendered table pixels, not the backdrop.
	// Headless/CI (SwiftShader) runs never present to a screen, so this is the only
	// pixel-visibility signal; kept off the hot path because convertToBlob stalls
	// the worker loop — one automatic boot probe plus on-demand `readback` posts.
	// The probe is always dispatched from inside applyFrame right after render
	// (same-task backing store); a bare message-handler dispatch reads back stale
	// swapchain state under SwiftShader and fails.
	const runReadbackProbe = (target: WorkerFrameSink): void => {
		void (async () => {
			const blob = await (init.canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' })
			const bitmap = await createImageBitmap(blob)
			const probe = new OffscreenCanvas(64, 64)
			const g = probe.getContext('2d')
			if (!g) return
			g.drawImage(bitmap, 0, 0, 64, 64)
			const data = g.getImageData(0, 0, 64, 64).data
			let sum = 0
			let lit = 0
			for (let i = 0; i < data.length; i += 4) {
				const v = (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)
				sum += v
				if (v > 128) lit++
			}
			bitmap.close()
			;(target as unknown as { readbackLit?: number }).readbackLit = lit / 4096
			console.log(`[render-worker] readback: mean=${(sum / (64 * 64)).toFixed(1)} lit=${lit}/4096`)
		})()
	}
	const sink: WorkerFrameSink & { parityGlassHidden: number } = {
		parityGlassHidden: ppStats.glass ?? 0,
		requestReadback(): void {
			pendingProbe = true
		},
		requestPixels(): void {
			pendingPng = true
		},
		applyFrame(scratch: Float32Array, _slot: number, _version: number): void {
			// Follow the main-thread camera (viewer orbit included).
			const cam = readViewCamera(scratch)
			if (cam) {
				camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2])
				camera.lookAt(cam.target[0], cam.target[1], cam.target[2])
				if (Math.abs(camera.fov - cam.fov) > 1e-3) camera.fov = cam.fov
				if (cam.near > 0 && Math.abs(camera.near - cam.near) > 1e-6) camera.near = cam.near
				camera.updateProjectionMatrix()
			}
			const nudge = nudgeOffset(
				scratch[F_VIEW + V_NUDGE_X] ?? 0,
				scratch[F_VIEW + V_NUDGE_Y] ?? 0,
				scratch[F_VIEW + V_ACC_X] ?? 0,
				scratch[F_VIEW + V_ACC_Y] ?? 0,
			)
			root.position.set(basePos.x + nudge.x, basePos.y + nudge.y, basePos.z)

			const balls = Math.min(scratch[F_BALL_COUNT] ?? 0, MAX_BALLS)
			for (let i = 0; i < MAX_BALLS; i++) {
				const pooled = ballPool[i]
				if (!pooled) continue
				if (i >= balls) {
					pooled.mesh.visible = false
					continue
				}
				const o = F_BALLS + i * BALL_STRIDE
				const radius = scratch[o + 6] ?? 25
				// Slot +7 is the producer-set active flag; unset orientation rows fall back to the identity rotation.
				if (!(radius > 0) || (scratch[o + 7] ?? 0) === 0) {
					pooled.mesh.visible = false
					continue
				}
				const e = (idx: number): number => scratch[o + BALL_ORIENT + idx] ?? (idx % 4 === 0 ? 1 : 0)
				ballMats.orient.setEach(e(0), e(1), e(2), 0, e(3), e(4), e(5), 0, e(6), e(7), e(8), 0, 0, 0, 0, 1)
				ballMats.trans.setTranslation(scratch[o] ?? 0, scratch[o + 1] ?? 0, scratch[o + 2] ?? 0)
				ballMats.scale.setScaling(radius, radius, radius)
				// Compose orient*scale*trans in the left-handed physics frame, then convert to the renderer's right-handed frame.
				ballMats.mat.copy(ballMats.orient).multiply(ballMats.scale).multiply(ballMats.trans).toRightHanded()
				;(renderApi as unknown as { applyMatrixToNode(m: unknown, n: unknown): void }).applyMatrixToNode(
					ballMats.mat,
					pooled.mesh,
				)
				pooled.mesh.visible = true
				pooled.mesh.updateMatrixWorld(true)
			}

			touched.clear()
			groupDeltaFields(scratch, scratch[F_DELTA_COUNT] ?? 0, (nodeId, field, values) => {
				let bucket = touched.get(nodeId)
				if (!bucket) {
					bucket = new Map()
					touched.set(nodeId, bucket)
				}
				bucket.set(field, values)
			})
			const changedLights = new Set<string>()
			for (const [nodeId, fields] of touched) {
				const entry = entries[nodeId]
				if (!entry) continue
				// Lamp levels ride every frame; skip updater/fan-out when values match last applied (application is idempotent).
				let sig = ''
				for (const [field, values] of fields) sig += `${field}:${values.join(',')};`
				if (lastApplied.get(nodeId) === sig) continue
				lastApplied.set(nodeId, sig)
				const live = entry.item.getState()
				let ok = true
				for (const [field, values] of fields) {
					if (!setStateField(live, field, values)) ok = false
				}
				if (!ok) continue
				entry.updater.applyState(entry.node, live, renderApi, table)
				if (lightNames.has(entry.name)) changedLights.add(entry.name)
			}
			fanOutLightmap({ lightmap, idOf, entries }, renderApi, table, changedLights)

			const frameId = scratch[F_DMD_FRAME_ID] ?? 0
			if (frameId !== 0) {
				const v = state.dmdVersion()
				if (v !== dmdVersion) {
					dmdVersion = v
					const dims = state.dmdDims()
					const bytes = state.consumeDmd(dmdScratch)
					if (bytes !== null && dims.w > 0 && dims.h > 0) {
						dmd.updateFrame(dmdScratch as never, dims.w, dims.h)
					}
				}
			}

			pipeline.render()
			if (!readbackDone || pendingProbe) {
				readbackDone = true
				pendingProbe = false
				runReadbackProbe(sink)
			}
			if (pendingPng) {
				pendingPng = false
				void (async () => {
					const blob = await (init.canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' })
					const png = await blob.arrayBuffer()
					;(globalThis as unknown as { postMessage?: (m: unknown) => void }).postMessage?.({
						type: 'readback-png',
						png,
					})
				})()
			}
		},
		applyResize(width: number, height: number, pixelRatio: number): void {
			renderer.setPixelRatio(pixelRatio)
			renderer.setSize(width, height, false)
			camera.aspect = width / height
			camera.updateProjectionMatrix()
		},
	}

	setWorkerFrameSink(sink)
	console.log(`[render-worker] scene ready: ${entries.filter(Boolean).length} nodes, ${names.length} entries/names`)
}
