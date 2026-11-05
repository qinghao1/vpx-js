// @ts-nocheck — viewer is a DOM/three coordinator over loosely-typed runtime
// subsystems (wasm engine, controls); strict-typing it is a separate migration.
// Viewer coordinator - delegates to subsystems

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as THREE from 'three/webgpu'
import { BrowserBinaryReader } from '../../dist-esm/lib/io/binary-reader.js'
import { setGlobalEmissionScale } from '../../dist-esm/lib/render/threejs/material-shared.js'
import {
	isPrimitiveNodeMaterial,
	setPrimitiveMap,
	setPrimitiveTransmissionArea,
} from '../../dist-esm/lib/render/threejs/nodes/primitive-bdl-node.js'
import { isBakedNodeMaterial, setBakedMap } from '../../dist-esm/lib/render/threejs/nodes/unshaded-baked-node.js'
import { RE_VR } from '../../dist-esm/lib/render/threejs/scene-classify.js'
import {
	batchStaticOpaques as _batchStaticOpaques,
	optimizeScene as _optimizeScene,
} from '../../dist-esm/lib/render/threejs/three-batched-builder.js'
import { buildBvhIdle } from '../../dist-esm/lib/render/threejs/three-bvh.js'
import {
	applyCameraState,
	computePlayFraming,
	computeViewerFraming,
	frameCamera,
} from '../../dist-esm/lib/render/threejs/three-camera-framing.js'
import { ThreeRenderApi } from '../../dist-esm/lib/render/threejs/three-render-api.js'
import { VpxRenderPipeline } from '../../dist-esm/lib/render/threejs/three-render-pipeline.js'
import {
	applyBakedMaterial,
	ensureProceduralRoom,
	hideCabFlippers,
	isBakedMeshByNames,
	isDeferred,
	postProcessScene,
	showCabFlippers,
} from '../../dist-esm/lib/render/threejs/three-scene-postprocess.js'
import { ThreeTextureLoaderBrowser } from '../../dist-esm/lib/render/threejs/three-texture-loader-browser.js'
import {
	applyRendererToneMapping,
	clampExposure,
	resolveToneMapping,
} from '../../dist-esm/lib/render/threejs/tone-mapping.js'
import {
	getTransmissionDebug,
	updateTransmissionBuffer,
} from '../../dist-esm/lib/render/threejs/transmission-buffer.js'
import { collectPostProcessNodes, needsNoBakeFill } from '../../dist-esm/lib/render/threejs/visibility-heuristics.js'
import { AnimationGate } from '../../dist-esm/lib/util/animation-gate.js'
import { Table } from '../../dist-esm/lib/vpt/table/table.js'
import { codeToSdlScancode, createScancodeGate, resolveFlipperKey } from '../../dist-esm/lib/wasm/vpinball-wasm.js'
import { BackglassRenderer } from './backglass/backglass-renderer.js'
import {
	CAM,
	CAM_ANIM,
	isTableHit,
	LIGHT_AMBIENT,
	LIGHT_DIR,
	LIGHT_HEMI,
	LIGHT_NOBAKE_FILL,
	RE_BAKE_MAP,
	TABLE_OPTS,
} from './config.js'
import { DmdRenderer } from './dmd/dmd-renderer.js'
import {
	isDev as _isDev,
	ensureBvh,
	ensureGlobals,
	getMaxLights,
	getTargetPixelRatio,
	isLowQuality,
	QUALITY_CAPS,
} from './env.js'
import { RELEASE_CODES } from './input/input-manager.js'
import { pollNudgePads } from './input/nudge-controller.js'
import { attachInput } from './input.js'
import type { DirtyOverlay } from './overlays/dirty-overlay.js'
import { createHarness } from './ui/log-viewer.js'
import { renderModeHint, renderStats } from './ui/stats-overlay.js'
import {
	$,
	computeTexMem,
	countObjects,
	fetchWithProgress,
	filterTextures,
	fmtBytes,
	logMem,
	resolveVpxCandidates,
} from './utils.js'
import { WasmEngine, WasmEngineStartError } from './wasm-engine.js'

let _prerenderedBackground: THREE.Color | null = null
function getPrerenderedBackground(): THREE.Color {
	if (_prerenderedBackground) return _prerenderedBackground
	_prerenderedBackground = new THREE.Color(0x121a2b)
	return _prerenderedBackground
}

function syncRoom(
	scene: THREE.Scene,
	node: THREE.Object3D,
	center: THREE.Vector3,
	size: THREE.Vector3,
): THREE.Group | null {
	let hasVr = false
	// Visibility-independent: script states hide the authored room after
	// mount, but the meshes still count as a room (no procedural fallback).
	node.traverse((o: any) => {
		if (o.isMesh && RE_VR.test(String(o.name ?? ''))) hasVr = true
	})
	const room = ensureProceduralRoom(scene, center, size, { hasVr })
	scene.background = getPrerenderedBackground() as any
	return room
}

function cullExcessLights(root: any, maxLights: number) {
	const lights: any[] = []
	root.traverse((o: any) => {
		if (o.isPointLight) lights.push(o)
	})
	if (lights.length <= maxLights) return null
	lights.sort((a: any, b: any) => (b.intensity || 0) - (a.intensity || 0))
	let culled = 0
	for (const light of lights.slice(maxLights)) {
		light.visible = false
		light.intensity = 0
		light.parent?.remove(light)
		culled++
	}
	return { before: lights.length, after: maxLights, culled }
}

export {
	createHarness,
	ensureProceduralRoom,
	filterTextures,
	frameCamera,
	hideCabFlippers,
	postProcessScene,
	resolveVpxCandidates,
}

const SOUND_SPEAKER = '<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none"></path>'
const SOUND_SVG_ATTRS =
	'viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'
const SOUND_ICON_HIGH = `<svg ${SOUND_SVG_ATTRS}>${SOUND_SPEAKER}<path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.4 5.6a9 9 0 0 1 0 12.8"></path></svg>`
const SOUND_ICON_LOW = `<svg ${SOUND_SVG_ATTRS}>${SOUND_SPEAKER}<path d="M15.5 8.5a5 5 0 0 1 0 7"></path></svg>`
const SOUND_ICON_OFF = `<svg ${SOUND_SVG_ATTRS}>${SOUND_SPEAKER}<line x1="16" y1="9" x2="22" y2="15"></line><line x1="22" y1="9" x2="16" y2="15"></line></svg>`
const setTitle = title => {
	const el = document.getElementById('title')
	if (el && title) el.textContent = title
}
export class Viewer {
	private readonly overlays: DirtyOverlay[]
	constructor(opts = {}) {
		ensureGlobals()
		ensureBvh()
		const { defaultVpx = null, queryParam = 'vpx', dom = {}, viewerMode = 'viewer' } = opts
		this.defaultVpx = defaultVpx
		this.queryParam = queryParam
		this.viewerMode = viewerMode
		this.dom = {
			canvas: dom.canvas || $('canvas'),
			loading: dom.loading || $('loading'),
			barFill: dom.barFill || $('bar-fill'),
			barText: dom.barText || $('bar-text'),
			loadDetail: dom.loadDetail || $('load-detail'),
			loadTitle: dom.loadTitle || $('load-title'),
			subtitle: dom.subtitle || $('subtitle'),
			stats: dom.stats || $('stats'),
			logEl: dom.logEl || $('log'),
			resetBtn: dom.resetBtn || $('reset'),
			wrap: dom.wrap || $('canvas-wrap'),
			dropzone: dom.dropzone || $('dropzone'),
			card: dom.card || $('card'),
			status: dom.status || $('status'),
			fileInput: dom.fileInput || $('file'),
			playTip: dom.playTip || document.getElementById('play-tip'),
			soundBtn: dom.soundBtn || document.getElementById('sound-btn'),
			soundVolume: dom.soundVolume || document.getElementById('sound-volume'),
			streamWrap: dom.streamWrap || document.getElementById('stream-progress'),
			streamFill: dom.streamFill || document.getElementById('stream-fill'),
			streamText: dom.streamText || document.getElementById('stream-text'),
			streamLabel: dom.streamLabel || document.getElementById('stream-label'),
			nudgeFlash: dom.nudgeFlash || document.getElementById('nudge-flash'),
			fpsHud: dom.fpsHud || document.getElementById('fps-hud'),
			modeHint: dom.modeHint || document.getElementById('mode-hint'),
		}
		this.harnessLog = createHarness(this.dom.logEl).harnessLog
		this.scene = new THREE.Scene()
		this.scene.background = getPrerenderedBackground() as any
		this.camera = new THREE.PerspectiveCamera(
			CAM.fov,
			(typeof window !== 'undefined' ? window.innerWidth : 800) /
				(typeof window !== 'undefined' ? window.innerHeight : 600),
			CAM.near,
			CAM.far,
		)
		this.camera.position.set(0, -800, 1500)
		this.scene.add(new THREE.HemisphereLight(LIGHT_HEMI.sky, LIGHT_HEMI.ground, LIGHT_HEMI.intensity))
		const dir = new THREE.DirectionalLight(LIGHT_DIR.color, LIGHT_DIR.intensity)
		dir.position.set(...LIGHT_DIR.pos)
		this.scene.add(dir)
		this.scene.add(new THREE.AmbientLight(LIGHT_AMBIENT.color, LIGHT_AMBIENT.intensity))
		this.tableGroup = null
		this.table = null
		this.wasmEngine = null
		// Raw table bytes retained for the WASM engine; each load path stashes its bytes beside its reader.
		this._vpxBytes = null
		this.renderApi = null
		this.nodeCache = new Map()
		this._lightmapMap = new Map()
		this.isPaused = false
		this._playCameraApplied = false
		this._cameraTimeout = null
		this._cameraRaf = null
		this.animFrame = null
		this._animRaf = null
		this._animTimeout = null
		this.invalidate()
		this._streamId = 0
		this._loadId = 0
		this._cameraGen = 0
		this._cameraTimeoutResolver = null
		this._loadAbort = null
		this._touchMap = new Map()
		this._inputCleanup = null
		this._nudgeCleanup = null
		this._touchCleanup = null
		this._rendererBackend = 'webgpu'
		this.renderPipeline = null
		this.renderer = null
		this.controls = null
		this._eventCleanups = []
		this._boundResize = () => this._onResize()
		this._disposed = false
		this._deviceLossCount = 0
		this._rendererReady = this._createRenderer()
		this._rendererReady.catch(e => {
			this.log(
				`WebGPU renderer failed to start (${e?.message ?? e}) — the table cannot render. This usually means broken GPU-driver or browser WebGPU support here; try updating Chrome and GPU drivers, reloading with ?noaa (disables antialiasing), or relaunching Chrome with --use-angle=vulkan.`,
				'error',
			)
		})
		this.dmd = new DmdRenderer(this)
		this.backglass = new BackglassRenderer(this)
		this.overlays = [this.dmd, this.backglass]
		if (_isDev)
			Object.assign(window, {
				scene: this.scene,
				camera: this.camera,
				THREE,
			})
		addEventListener('resize', this._boundResize)
		this._eventCleanups.push(() => removeEventListener('resize', this._boundResize))
		{
			const onPopState = () => {
				if (this.viewerMode === 'play') {
					this._switchToViewer()
				}
			}
			addEventListener('popstate', onPopState)
			this._eventCleanups.push(() => removeEventListener('popstate', onPopState))
		}
		this._setupSoundControls()
		{
			const onReset = () => this._onResetView()
			this.dom.resetBtn?.addEventListener('click', onReset)
			if (this.dom.resetBtn)
				this._eventCleanups.push(() => this.dom.resetBtn?.removeEventListener('click', onReset))
		}
		this._setupModeSwitch()
		this._setupDebugToggle()
		this._syncChrome()
	}
	destroy() {
		if (this._disposed) return
		this._disposed = true
		if (this._cameraRaf) cancelAnimationFrame(this._cameraRaf)
		if (this._cameraTimeout) clearTimeout(this._cameraTimeout)
		if (this._animRaf) cancelAnimationFrame(this._animRaf)
		if (this._animTimeout) clearTimeout(this._animTimeout)
		if (this.animFrame) {
			cancelAnimationFrame(this.animFrame)
			this.animFrame = null
		}
		if ((this as any)._physicsTimeout) clearTimeout((this as any)._physicsTimeout)
		this._inputCleanup?.()
		this._inputCleanup = null
		this._nudgeCleanup?.()
		this._nudgeCleanup = null
		this._touchCleanup?.()
		this._touchCleanup = null
		if (this._cameraTimeoutResolver) {
			const resolver = this._cameraTimeoutResolver
			this._cameraTimeoutResolver = null
			resolver()
		}
		if (this._loadAbort) {
			this._loadAbort.abort()
			this._loadAbort = null
		}
		for (const fn of this._eventCleanups) fn()
		this._eventCleanups = []
		if (this.wasmEngine) {
			const engine = this.wasmEngine
			this.wasmEngine = null
			void engine.destroy().catch(() => {})
		}
		for (const overlay of this.overlays) overlay.dispose?.()
		this.controls?.dispose?.()
		this.renderPipeline?.dispose?.()
		this.renderer?.setAnimationLoop(null)
		this.renderer?.dispose?.()
		this.scene?.clear?.()
	}
	_setupDebugToggle() {
		const btn = document.getElementById('debug-toggle')
		const toggle = () => document.body.classList.toggle('show-debug')
		if (btn) {
			btn.addEventListener('click', toggle)
			this._eventCleanups.push(() => btn.removeEventListener('click', toggle))
		}
		const onKey = e => {
			if ((e.code === 'Backquote' || e.key === '`' || e.key === 'F2') && !e.ctrlKey && !e.metaKey && !e.altKey) {
				const tag = (document.activeElement?.tagName || '').toLowerCase()
				if (tag === 'input' || tag === 'textarea' || tag === 'select') return
				toggle()
			}
		}
		addEventListener('keydown', onKey)
		this._eventCleanups.push(() => removeEventListener('keydown', onKey))
	}
	/**
	 * Controls-first sound surface for the chrome and e2e: mute flag and 0..1
	 * level, live from the WASM engine. Undefined before the engine boots —
	 * the headless ring is the only audio source, so there is nothing to
	 * query (or drive) without it.
	 */
	get sound() {
		const engine = this.wasmEngine
		if (!engine) return undefined
		return {
			isMuted: () => engine.muted,
			getLevel: () => engine.volume,
		}
	}
	/** Sound-button/shortcut entry: flip the engine mute and reflect it in the chrome. */
	toggleSoundMuted() {
		const engine = this.wasmEngine
		const muted = engine ? engine.toggleMuted() : false
		this._syncSoundChrome()
		return muted
	}
	// Chrome over engine-owned mute/level (per-load engine state; the old
	// persisted sound profile is gone by design — each table starts fresh).
	_setupSoundControls() {
		this._syncSoundChrome()
		const btn = this.dom.soundBtn
		const slider = this.dom.soundVolume
		const group = btn?.closest?.('.sound-control')
		const toggle = () => this.toggleSoundMuted()
		if (btn) {
			// Touch (no-hover): the first tap only reveals the slider so the
			// tap that opens the control never flips mute by accident.
			const reveal = () => {
				if (
					group &&
					!group.classList.contains('expanded') &&
					typeof window.matchMedia === 'function' &&
					window.matchMedia('(hover: none)').matches
				) {
					group.classList.add('expanded')
					return true
				}
				return false
			}
			const onToggle = () => {
				if (reveal()) return
				toggle()
			}
			btn.addEventListener('click', onToggle)
			this._eventCleanups.push(() => btn.removeEventListener('click', onToggle))
		}
		// Touch (no-hover) support: tapping the icon reveals the slider until
		// the next tap outside the control. Desktop hover/:focus-within needs no JS.
		if (group) {
			const collapseOutside = e => {
				if (e.target instanceof Node && !group.contains(e.target)) group.classList.remove('expanded')
			}
			document.addEventListener('pointerdown', collapseOutside)
			this._eventCleanups.push(() => document.removeEventListener('pointerdown', collapseOutside))
		}
		if (slider) {
			const onSlider = () => {
				if (!this.wasmEngine) return
				this.wasmEngine.setVolume(Number(slider.value) / 100)
				this._syncSoundChrome()
			}
			slider.addEventListener('input', onSlider)
			this._eventCleanups.push(() => slider.removeEventListener('input', onSlider))
		}
		const onKey = e => {
			// Global mute shortcut (all modes); the key still reaches the
			// table as DIK_M, as before. No repeat: holding M must not strobe.
			if ((e.code === 'KeyM' || e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
				if (e.repeat) return
				const tag = (document.activeElement?.tagName || '').toLowerCase()
				if (tag === 'input' || tag === 'textarea' || tag === 'select') return
				toggle()
			}
		}
		addEventListener('keydown', onKey)
		this._eventCleanups.push(() => removeEventListener('keydown', onKey))
	}
	_syncSoundChrome() {
		const engine = this.wasmEngine
		const btn = this.dom.soundBtn
		const slider = this.dom.soundVolume
		if (btn && engine) {
			const muted = engine.muted
			const level = engine.volume
			btn.innerHTML = muted || level <= 0 ? SOUND_ICON_OFF : level <= 0.5 ? SOUND_ICON_LOW : SOUND_ICON_HIGH
			btn.setAttribute('aria-pressed', muted ? 'true' : 'false')
			btn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound')
		}
		if (slider && engine) slider.value = String(Math.round(engine.volume * 100))
	}
	async _createRenderer() {
		const canvas = this.dom.canvas
		const p = new URLSearchParams(location.search)
		const wantAA = !p.has('noaa')

		const renderer = new THREE.WebGPURenderer({
			canvas,
			antialias: wantAA,
			powerPreference: 'high-performance',
		})
		await renderer.init()

		renderer.setPixelRatio(getTargetPixelRatio(this.viewerMode))
		renderer.outputColorSpace = THREE.SRGBColorSpace
		renderer.sortObjects = true
		renderer.shadowMap.enabled = false

		applyRendererToneMapping(renderer, this.table?.data, isLowQuality())
		this._globalEmissionScale = Number.isFinite(this.table?.data?.globalEmissionScale)
			? this.table.data.globalEmissionScale
			: 1
		this._applyTableToneMapping = tbl => {
			if (!this.renderer || !tbl?.data) return
			applyRendererToneMapping(this.renderer, tbl.data, isLowQuality())
			this._globalEmissionScale = Number.isFinite(tbl.data.globalEmissionScale) ? tbl.data.globalEmissionScale : 1
			if (this.renderPipeline) {
				// resolveToneMapping owns the AgX default: pass the table value
				// through instead of falling back to ACES (2) here.
				this.renderPipeline.updateExposure(clampExposure(tbl.data.exposure, isLowQuality()))
				this.renderPipeline.updateToneMapper(tbl.data.toneMapper)
				if (Number.isFinite(tbl.data.bloomStrength)) {
					this.renderPipeline.updateBloomStrength(tbl.data.bloomStrength)
				}
			}
		}
		this.renderer = renderer
		this._rendererBackend = 'webgpu'
		try {
			this.renderPipeline = new VpxRenderPipeline(renderer, this.scene, this.camera, {
				toneMapper: this.table?.data?.toneMapper,
				exposure: this.table?.data?.exposure,
				lowQuality: isLowQuality(),
				bloomEnabled: true,
				bloomStrength: Number.isFinite(this.table?.data?.bloomStrength)
					? this.table.data.bloomStrength
					: isLowQuality()
						? 0.2
						: 0.22,
			})
		} catch (e) {
			console.warn('VpxRenderPipeline init failed, falling back to direct render', e)
			this.renderPipeline = null
		}
		this._setupDeviceLifecycle(renderer)
		this.controls?.dispose?.()
		this.controls = new OrbitControls(this.camera, this.renderer.domElement)
		this.controls.enableDamping = true
		this.controls.target.set(0, 0, 0)
		this.controls.update()
		this.controls.enabled = this.viewerMode !== 'play'
		if (_isDev)
			Object.assign(window, {
				scene: this.scene,
				camera: this.camera,
				controls: this.controls,
				renderer: this.renderer,
				THREE,
			})
		this._onResize()
		this.log(`WebGPURenderer ready (three r${String(THREE.REVISION)})`)
		return renderer
	}

	private _setupDeviceLifecycle(renderer) {
		try {
			const device = (renderer as any).backend?.device as GPUDevice | undefined
			if (!device?.lost) return
			device.lost.then((info: any) => {
				console.warn(`[WebGPU] Device lost: reason=${info.reason}, message=${info.message}`)
				if (info.reason === 'destroyed' || this._disposed) return
				if (++this._deviceLossCount > 2) {
					this.log(
						`WebGPU device keeps failing (${info.reason}) — not retrying. Reload with ?noaa, update Chrome and GPU drivers, or relaunch Chrome with --use-angle=vulkan.`,
						'error',
					)
					return
				}
				this._rendererReady = this._createRenderer()
				this._rendererReady.catch(() => {})
			})
		} catch {}
	}

	async precompilePipelines() {
		if (!this.renderer || !this.scene || !this.camera) return
		try {
			this.log('[renderer] pre-compiling WebGPU shader pipelines...', 'debug')
			const startTime = performance.now()
			await this.renderer.compileAsync(this.scene, this.camera)
			const duration = (performance.now() - startTime).toFixed(1)
			this.log(`[renderer] WebGPU pipelines compiled in ${duration}ms`, 'debug')
		} catch (e) {
			console.warn('[renderer] compileAsync non-fatal warning:', e)
		}
	}

	/** Legacy name: delegates to _syncWasmTransforms; no TS physics remains. */
	private _syncPhysicsTransforms(_timestamp) {
		if (this.wasmEngine?.ready) return this._syncWasmTransforms(_timestamp)
		return false
	}

	/**
	 * Step the headless-WASM engine and fan its rows out onto the scene.
	 * Runs on each rAF tick while ready and unpaused — pause freezes the
	 * sim (and its audio with it). Lamp changes fan out to lightmapped prims.
	 */
	_syncWasmTransforms(timestamp) {
		// Both callers (the gated loop and the input immediate tick) already
		// return while paused, so pause needs no mode-qualified check here.
		if (!this.wasmEngine?.ready || this.isPaused) return false
		const { changedLights, counts } = this.wasmEngine.step(timestamp)
		if (changedLights.length > 0) {
			// One pass over the dirty prims: several changed lamps usually
			// share a lightmapped prim, and the empty partial reads only
			// current lamp state, so collapsing duplicates is exact.
			const dirty = new Set<string>()
			for (const lm of changedLights) for (const primName of this._lightmapMap.get(lm) ?? []) dirty.add(primName)
			for (const primName of dirty) {
				const entry = this.nodeCache.get(primName)
				if (entry) entry.item.getUpdater().applyState(entry.node, {}, this.renderApi, this.table)
			}
		}
		return (
			!!counts &&
			(counts.ballsMoved > 0 ||
				counts.ballsSpawned > 0 ||
				counts.ballsRemoved > 0 ||
				counts.movers > 0 ||
				counts.lights > 0 ||
				counts.prims > 0 ||
				counts.flashers > 0)
		)
	}

	stopLoop() {
		this.renderer?.setAnimationLoop(null)
	}
	async _ensureRenderer() {
		await this._rendererReady
		return this.renderer
	}
	_onResetView() {
		if (this.viewerMode === 'play') {
			this._switchToViewer()
			return
		}
		if (!this.tableGroup || !this.controls) return
		const state = computeViewerFraming(this.tableGroup)
		this._animateCameraTo(state, CAM_ANIM.durationReset)
	}
	_onResize() {
		this.invalidate()
		const width = typeof window !== 'undefined' ? window.innerWidth : 800
		const height = typeof window !== 'undefined' ? window.innerHeight : 600
		this.camera.aspect = width / height
		this.camera.updateProjectionMatrix()
		const pixelRatio = getTargetPixelRatio(this.viewerMode)
		if (this.renderer) this.renderer.setPixelRatio(pixelRatio)
		this.renderer?.setSize(width, height)
	}
	_setupModeSwitch() {
		const onOrbitToggle = e => {
			if ((e.key === 'o' || e.key === 'O') && this.viewerMode === 'play') {
				this.controls.enabled = !this.controls.enabled
				this.log(`Orbit ${this.controls.enabled ? 'enabled' : 'disabled'}`)
			}
		}
		addEventListener('keydown', onOrbitToggle)
		this._eventCleanups.push(() => removeEventListener('keydown', onOrbitToggle))
		this._raycaster = new THREE.Raycaster()
		this._raycaster.firstHitOnly = false
		this._mouse = new THREE.Vector2()
		const tip = this.dom.playTip
		const canvas = this.dom.canvas
		let hovered = false
		const hideTip = () => {
			hovered = false
			if (tip) tip.hidden = true
			if (canvas) canvas.classList.remove('is-pointer')
		}
		const showTipAt = (x, y) => {
			if (!tip || this.viewerMode !== 'viewer' || !this.tableGroup) return
			hovered = true
			tip.style.setProperty('--tip-x', `${x}px`)
			tip.style.setProperty('--tip-y', `${y}px`)
			tip.hidden = false
			if (canvas) canvas.classList.add('is-pointer')
		}
		this._hidePlayTip = hideTip
		if (!canvas) return
		const getHits = (x, y) => {
			if (this.viewerMode !== 'viewer' || !this.tableGroup) return []
			const rect = canvas.getBoundingClientRect()
			this._mouse.x = ((x - rect.left) / rect.width) * 2 - 1
			this._mouse.y = -((y - rect.top) / rect.height) * 2 + 1
			this._raycaster.setFromCamera(this._mouse, this.camera)
			return this._raycaster.intersectObject(this.tableGroup, true)
		}
		const hitTest = (x, y) => getHits(x, y).some((hit: any) => isTableHit(hit.object, this.tableGroup))
		let hoverRaf = 0
		let hoverX = 0,
			hoverY = 0
		const flushHover = () => {
			hoverRaf = 0
			if (this.viewerMode !== 'viewer' || !this.tableGroup) return hideTip()
			if (this.controls?.state !== -1) return hideTip()
			if (!hitTest(hoverX, hoverY)) return hideTip()
			showTipAt(hoverX, hoverY)
		}
		const onHover = event => {
			hoverX = event.clientX
			hoverY = event.clientY
			if (hoverRaf) return
			hoverRaf = requestAnimationFrame(flushHover)
		}
		canvas.addEventListener('pointermove', onHover)
		canvas.addEventListener('pointerleave', () => {
			if (hoverRaf) cancelAnimationFrame(hoverRaf)
			hoverRaf = 0
			hideTip()
		})
		canvas.addEventListener('click', event => {
			if (this.viewerMode !== 'viewer' || !this.tableGroup || event.button !== 0) return
			if (!hitTest(event.clientX, event.clientY)) return
			this._switchToPlay()
		})
		const onViewerTouchEnd = event => {
			if (this.viewerMode !== 'viewer' || !this.tableGroup) return
			const touch = event.changedTouches?.[0]
			if (!touch) return
			if (!hitTest(touch.clientX, touch.clientY)) return
			this._switchToPlay()
			event.preventDefault()
		}
		canvas.addEventListener('touchend', onViewerTouchEnd, { passive: false })
		this._eventCleanups.push(() => canvas.removeEventListener('touchend', onViewerTouchEnd))
	}
	async _switchToPlay() {
		if (this.viewerMode === 'play' || !this.tableGroup) return
		this.viewerMode = 'play'
		if (typeof history !== 'undefined' && history.state?.mode !== 'play') {
			history.pushState({ mode: 'play' }, '')
		}
		if (this.renderer) {
			this.renderer.setPixelRatio(getTargetPixelRatio('play'))
			this.renderer.sortObjects = true
		}
		this._hidePlayTip?.()
		hideCabFlippers(this.tableGroup)
		this._syncChrome()
		if (this.wasmEngine?.ready) {
			this.wasmEngine.setBallsVisible(true)
			this.enterPlayMode()
		} else {
			this.hookInput()
		}
		this.dom.canvas?.focus()
		const target = computePlayFraming(this.tableGroup, this.camera)
		await this._animateCameraTo(target, CAM_ANIM.durationMode)
		syncRoom(this.scene, this.tableGroup, target.center, target.size)
		if (!this.wasmEngine?.ready) {
			if (this.table) {
				try {
					await this._createWasmEngine()
				} catch (e) {
					this.log(`Play load failed: ${e.message}`, 'error')
					this._revertFailedPlay()
				}
			} else {
				this.load().catch(e => {
					this.log(`Play load failed: ${e.message}`, 'error')
					this._revertFailedPlay()
				})
			}
		}
	}
	// A failed play-load must not strand the viewer in play mode with no
	// engine: drop back to viewer chrome instead of warn-and-continue.
	_revertFailedPlay() {
		if (this.viewerMode !== 'play' || this.wasmEngine?.ready) return
		this.viewerMode = 'viewer'
		if (typeof history !== 'undefined' && history.state?.mode === 'play') history.back()
		if (this.controls) this.controls.enabled = true
		this._syncChrome()
	}
	async _switchToViewer() {
		if (this.viewerMode !== 'play' || !this.tableGroup) return
		this.viewerMode = 'viewer'
		if (typeof history !== 'undefined' && history.state?.mode === 'play') {
			history.back()
		}
		if (this.renderer) this.renderer.setPixelRatio(getTargetPixelRatio('viewer'))
		this._hidePlayTip?.()
		showCabFlippers(this.tableGroup)
		this._syncChrome()
		const target = computeViewerFraming(this.tableGroup)
		await this._animateCameraTo(target, CAM_ANIM.durationMode)
		if (Math.abs(this.camera.fov - CAM.fov) > 0.5) {
			this.camera.fov = CAM.fov
			this.camera.updateProjectionMatrix()
		}
		if (this.tableGroup)
			syncRoom(this.scene, this.tableGroup, target.center, (target as any).size || new THREE.Vector3(1, 1, 1))
		this.exitPlayMode()
	}
	_syncChrome() {
		const hint = this.dom.modeHint
		const isPlay = this.viewerMode === 'play'
		document.body.classList.toggle('is-play', isPlay)
		renderModeHint(hint, isPlay)
	}
	setupPlayCamera() {
		if (!this.tableGroup || !this.controls) return
		const state = computePlayFraming(this.tableGroup, this.camera)
		applyCameraState(this.camera, this.controls, state)
		this._playCameraApplied = true
	}
	async _animateCameraTo(state, duration = CAM_ANIM.durationMode) {
		if (!state || !this.controls) return
		this._cameraGen = (this._cameraGen ?? 0) + 1
		const _gen = this._cameraGen
		if (this._cameraRaf) {
			cancelAnimationFrame(this._cameraRaf)
			this._cameraRaf = null
		}
		if (this._cameraTimeout) {
			clearTimeout(this._cameraTimeout)
			this._cameraTimeout = null
		}
		if (this._cameraTimeoutResolver) {
			const resolver = this._cameraTimeoutResolver
			this._cameraTimeoutResolver = null
			resolver()
		}
		const fromPos = this.camera.position.clone()
		const fromTarget = this.controls.target.clone()
		const fromNear = this.camera.near
		const fromFar = this.camera.far
		const fromFov = this.camera.fov
		const toPos = state.position.clone()
		const toTarget = state.target.clone()
		const toNear = state.near
		const toFar = state.far
		// Play and viewer modes share one FOV so every table frames the same way; the table's own ViewSetup FOV stays script-visible via api.FieldOfView only.
		const toFov = CAM.fov
		if (
			fromPos.distanceTo(toPos) < 0.5 &&
			fromTarget.distanceTo(toTarget) < 0.5 &&
			Math.abs(fromFov - toFov) < 0.1
		) {
			applyCameraState(this.camera, this.controls, state)
			if (Math.abs(this.camera.fov - toFov) > 0.1) {
				this.camera.fov = toFov
				this.camera.updateProjectionMatrix()
			}
			this._playCameraApplied = this.viewerMode === 'play'
			return
		}
		const ease = t => t * t * (3 - 2 * t)
		const prevDamping = this.controls.enableDamping
		this.controls.enableDamping = false
		this.controls.enabled = false
		this.gate ??= new AnimationGate()
		this.gate.beginAnimation()
		const start = performance.now()
		return new Promise(resolve => {
			const tick = () => {
				// Camera ticks run outside the gated loop: invalidate every tick,
				// including the final pose that lands after _cameraRaf clears.
				this.invalidate()
				if (_gen !== this._cameraGen) {
					this.gate.endAnimation()
					this.controls.enableDamping = prevDamping
					this.controls.enabled = this.viewerMode !== 'play'
					resolve()
					return
				}
				if (this._disposed) {
					this.gate.endAnimation()
					this.controls.enableDamping = prevDamping
					resolve()
					return
				}
				const t = Math.min(1, (performance.now() - start) / duration)
				const e = ease(t)
				this.camera.position.lerpVectors(fromPos, toPos, e)
				this.controls.target.lerpVectors(fromTarget, toTarget, e)
				this.camera.near = THREE.MathUtils.lerp(fromNear, toNear, e)
				this.camera.far = THREE.MathUtils.lerp(fromFar, toFar, e)
				this.camera.fov = THREE.MathUtils.lerp(fromFov, toFov, e)
				this.camera.updateProjectionMatrix()
				this.camera.lookAt(this.controls.target)
				this.controls.update()
				if (t < 1) this._cameraRaf = requestAnimationFrame(tick)
				else {
					this._cameraRaf = null
					applyCameraState(this.camera, this.controls, state)
					if (Math.abs(this.camera.fov - toFov) > 0.1) {
						this.camera.fov = toFov
						this.camera.updateProjectionMatrix()
					}
					this._playCameraApplied = this.viewerMode === 'play'
					this.controls.enableDamping = prevDamping
					this.controls.enabled = this.viewerMode !== 'play'
					this.gate.endAnimation()
					resolve()
				}
			}
			this._cameraRaf = requestAnimationFrame(tick)
		})
	}
	enterPlayMode() {
		this.invalidate()
		if (this.renderer) this.renderer.shadowMap.enabled = false
		if (this.controls) this.controls.enabled = false
		if (this.tableGroup) hideCabFlippers(this.tableGroup)
		{
			const framing = this.tableGroup ? computePlayFraming(this.tableGroup, this.camera) : null
			const center = framing?.center ?? new THREE.Vector3()
			const size = framing?.size ?? new THREE.Vector3(1000, 2000, 500)
			syncRoom(this.scene, this.tableGroup ?? this.scene, center, size)
		}
		const ballsNode = this.tableGroup?.getObjectByName('balls')
		if (ballsNode) ballsNode.visible = true
		this._emitModeChange()
		if (this.dom.canvas) {
			this.dom.canvas.tabIndex = 0
			this.dom.canvas.focus()
		}
		this.hookInput()
		if (!this._blurHandler) {
			this._blurHandler = () => {
				for (const code of RELEASE_CODES) this._sendKey(code, false)
			}
			window.addEventListener('blur', this._blurHandler)
			document.addEventListener('visibilitychange', () => {
				if (document.hidden) this._blurHandler()
			})
		}
	}
	exitPlayMode() {
		this.invalidate()
		if (this.wasmEngine?.ready) {
			for (const code of this._touchMap.values()) this._sendKey(code, false)
			this._touchMap.clear()
			for (const code of RELEASE_CODES) this._sendKey(code, false)
		} else this._touchMap.clear()
		if (this.controls) this.controls.enabled = true
		if (this.tableGroup) showCabFlippers(this.tableGroup)
		const ballsNode = this.tableGroup?.getObjectByName('balls')
		if (ballsNode) ballsNode.visible = false
		this._emitModeChange()
	}
	buildNodeCache() {
		this.nodeCache.clear()
		this._lightmapMap = new Map()
		if (!this.tableGroup || !this.table) return
		for (const name of Object.keys(this.table.items)) {
			if (
				this.viewerMode === 'play' &&
				name.toLowerCase().includes('vrcab') &&
				name.toLowerCase().includes('flipper')
			)
				continue
			const item = this.table.items[name]
			const node = this.tableGroup.getObjectByName(name) || this.tableGroup.getObjectByName(name.toLowerCase())
			if (item?.getUpdater && node) this.nodeCache.set(name, { item, node })
		}
		for (const [primName, prim] of Object.entries(this.table.primitives ?? {})) {
			const lm = prim?.data?.szLightmap
			if (!lm) continue
			const list = this._lightmapMap.get(lm)
			if (list) list.push(primName)
			else this._lightmapMap.set(lm, [primName])
		}
	}
	/**
	 * Room/cabinet force-show: a script-driven hide of a VR or cabinet node
	 * is dropped from the diff in both modes, while the diff's matrices and
	 * materials still apply. Tables that ship a room show it on flat
	 * screens; the backdrop is the fallback only when no room exists.
	 * Non-room states are untouched in both modes.
	 */
	_emitModeChange() {
		document.dispatchEvent(
			new CustomEvent('viewer:modechange', {
				detail: {
					mode: this.viewerMode,
				},
			}),
		)
	}
	log(msg, level = 'info') {
		this.harnessLog?.(msg, level)
	}
	setBar(pct, txt) {
		if (this.dom.barFill) this.dom.barFill.style.setProperty('--progress', String(Math.max(0, Math.min(100, pct))))
		if (this.dom.barText) this.dom.barText.textContent = txt ?? `${pct.toFixed(0)}%`
	}
	_loading(pct, title, detail = '') {
		this.setBar(pct, title)
		if (this.dom.loadTitle) this.dom.loadTitle.textContent = title
		if (this.dom.loadDetail) this.dom.loadDetail.textContent = detail
	}
	_setStreamProgress(done, total) {
		const pct = total ? Math.round((done / total) * 100) : 0
		if (this.dom.streamFill) this.dom.streamFill.style.setProperty('--progress', String(pct))
		if (this.dom.streamText) this.dom.streamText.textContent = total ? `${done}/${total} · ${pct}%` : `${pct}%`
	}
	_showStream() {
		const wrap = this.dom.streamWrap
		if (!wrap) return
		wrap.hidden = false
		requestAnimationFrame(() => wrap.classList.add('show'))
	}
	_hideStream() {
		const wrap = this.dom.streamWrap
		if (!wrap) return
		wrap.classList.remove('show')
		setTimeout(() => {
			if (!wrap.classList.contains('show')) wrap.hidden = true
		}, 400)
	}
	_showCanvas() {
		if (this.dom.dropzone) this.dom.dropzone.hidden = true
		if (this.dom.wrap) this.dom.wrap.hidden = false
		if (this.dom.loading) this.dom.loading.hidden = true
		this.renderer?.setSize(
			typeof window !== 'undefined' ? window.innerWidth : 800,
			typeof window !== 'undefined' ? window.innerHeight : 600,
		)
		this.dom.canvas?.focus()
	}
	_setStatus(msg) {
		if (this.dom.subtitle) this.dom.subtitle.textContent = msg
		if (this.dom.status) this.dom.status.textContent = msg
	}
	async _loadTable(reader) {
		logMem(this.harnessLog, 'after reader.open')
		this._loading(66, 'Opening table…', 'Reading table data…')
		const t0 = performance.now()
		const table = await Table.load(reader)
		this.table = table
		this._applyTableToneMapping?.(table)
		if (_isDev) window.table = table
		const dt = performance.now() - t0
		this.log(
			`Parsed in ${dt.toFixed(0)}ms — ${Object.keys(table.items).length} items, ${Object.keys(table.textures).length} textures`,
			'debug',
		)
		logMem(this.harnessLog, 'after parse')
		filterTextures(table, this.log.bind(this))
		return table
	}
	_setupEnvironment(table) {
		try {
			if (!this.scene) return
			if ((this as any)._envTexture && this.scene.environment === (this as any)._envTexture)
				this.scene.environment = null
		} catch {}
	}
	// Floor the base hemi + ambient fill when needsNoBakeFill() reports a
	// lamp-only, unlit table. Never lowers an already brighter rig.
	_applyNoBakeFill(table, node) {
		try {
			if (!table || !node || !this.scene) return
			if (!needsNoBakeFill(collectPostProcessNodes(node))) return
			this.scene.traverse((o: any) => {
				if (o?.isHemisphereLight) o.intensity = Math.max(o.intensity, LIGHT_NOBAKE_FILL.hemi)
				else if (o?.isAmbientLight) o.intensity = Math.max(o.intensity, LIGHT_NOBAKE_FILL.ambient)
			})
			this.log('[light] no-bake ambient floor applied (all-glow lamps)', 'debug')
		} catch {}
	}
	async _buildScene(table) {
		this._setStatus('')
		this._loading(70, 'Building playfield…', 'Preparing visuals…')
		const emissionScale = table.data.globalEmissionScale
		if (Number.isFinite(emissionScale)) setGlobalEmissionScale(emissionScale)
		this._setupEnvironment(table)
		try {
			const dim = table.getDimensions?.()
			if (dim) setPrimitiveTransmissionArea(dim.width, dim.height, ThreeRenderApi.SCALE)
		} catch {}
		const texLoader = new ThreeTextureLoaderBrowser()
		const renderApi = new ThreeRenderApi(
			{
				applyMaterials: true,
				applyTextures: texLoader,
				optimizeTextures: false,
			},
			(this.gate ??= new AnimationGate()),
		)
		this.renderApi = renderApi
		if (_isDev) window.renderApi = renderApi
		if (_isDev) window.textureLoader = texLoader
		const ballTex = await texLoader.loadDefaultTexture('ball.png', '.png', 'ball.png')
		renderApi.getMapGenerator().getCache().set('ball.png', ballTex)
		ballTex.name = 'texture:ball.png'
		await Promise.all(
			[
				'bumperbase.png',
				'bumperCap.png',
				'bumperring.png',
				'bumperskirt.png',
				'kickerCup.png',
				'kickerGottlieb.png',
				'kickerHoleWood.png',
				'kickerT1.png',
				'kickerWilliams.png',
			].map(async defaultTexName => {
				const defaultTex = await texLoader.loadDefaultTexture(defaultTexName, '.png', defaultTexName)
				renderApi.getMapGenerator().getCache().set(defaultTexName, defaultTex)
				defaultTex.name = `texture:${defaultTexName}`
				renderApi.getMapGenerator().getCache().set(defaultTexName.toLowerCase(), defaultTex)
			}),
		)
		let textures = []
		{
			const all = Object.values(table.textures)
			const high = all.filter(tx => !isDeferred(tx, table))
			const deferred = all.filter(tx => isDeferred(tx, table))
			high.sort((a, b) => a.width * a.height - b.width * b.height)
			deferred.sort((a, b) => a.width * a.height - b.width * b.height)
			textures = [...high, ...deferred]
			const pf = table.getPlayfieldMap()?.toLowerCase()
			if (pf) {
				const idx = textures.findIndex(tx => tx.getName().toLowerCase() === pf)
				if (idx > 0) {
					const [pfTx] = textures.splice(idx, 1)
					textures.unshift(pfTx)
				} else if (idx === -1) {
					const best = [...textures].sort((a, b) => b.width * b.height - a.width * a.height)[0]
					if (best) {
						const fIdx = textures.indexOf(best)
						if (fIdx > 0) {
							const [bestTex] = textures.splice(fIdx, 1)
							textures.unshift(bestTex)
						}
						this.log(
							`[stream] Playfield map "${pf}" missing — fallback to largest "${best.getName()}"`,
							'warn',
						)
					}
				}
			}
			if (textures.length) {
				this.log(
					`[stream] ${high.length} high-prio + ${deferred.length} deferred — streaming ${textures.length}`,
					'debug',
				)
			}
		}
		this._loading(78, 'Assembling cabinet…', 'Building the machine…')
		const t0 = performance.now()
		const node = await table.generateTableNode(renderApi, {
			...TABLE_OPTS,
			preloadTextures: false,
		})
		try {
			// Anchor the bulb-lift height gate to the built playfield plane:
			// the table z=0 plane in world units, so below-table geometry
			// sharing the playfield footprint stays dark.
			const dim = table.getDimensions?.()
			if (dim) {
				node.updateWorldMatrix(true, false)
				const surfaceY = node.localToWorld(new THREE.Vector3(0, 0, 0)).y
				setPrimitiveTransmissionArea(dim.width, dim.height, ThreeRenderApi.SCALE, surfaceY)
			}
		} catch {}
		{
			const maxLights = getMaxLights()
			const culled = cullExcessLights(node, maxLights)
			if (culled)
				this.log(
					`[quality] ${isLowQuality() ? 'low' : 'high'} — lights ${culled.before} → ${culled.after} (culled ${culled.culled})`,
					'debug',
				)
		}
		{
			const pfLower = table.getPlayfieldMap()?.toLowerCase()
			const hasPfTex = pfLower ? !!table.getTexture(pfLower) : false
			const hasBM = (() => {
				let found = false
				node.traverse(o => {
					if (found) return
					if ((o.name || '').toLowerCase().includes('bm_playfield')) found = true
				})
				return found
			})()
			if (!hasPfTex && !hasBM) {
				const best = Object.values(table.textures).sort((a, b) => b.width * b.height - a.width * a.height)[0]
				if (best) {
					node.traverse(o => {
						if (!o.isMesh || o.name !== 'primitive-playfield_mesh') return
						const mat = o.material
						if (!mat || mat.map || mat.userData?.pendingMap) return
						mat.userData.pendingMap = best.getName()
						mat.userData.__isBaked = true
						mat.needsUpdate = true
					})
					if (best) this.log(`[playfield] Patched missing "${pfLower}" with "${best.getName()}"`, 'info')
				}
			}
		}
		const dt = performance.now() - t0
		let tris = 0,
			draws = 0
		node.traverse(o => {
			if (o.isMesh && o.geometry?.attributes?.position) {
				tris += o.geometry.attributes.position.count / 3
				draws++
			}
		})
		this.log(
			`Scene generated in ${dt.toFixed(0)}ms — ${countObjects(node)} objects, ${Math.round(tris)} tris, ${draws} draws`,
			'debug',
		)
		const { texCount, texMemMB } = computeTexMem(node)
		this.log(`Textures in scene: ${texCount} ~${texMemMB} MB`, 'debug')
		this._loading(88, 'Finishing up…', 'Final touches…')
		logMem(this.harnessLog, 'after generateTableNode')
		if (textures.length) {
			const used = new Set()
			const mainBakeUsed = new Set()
			node.traverse(o => {
				if (!o.isMesh || !o.material) return
				const n = (o.name || '').toLowerCase()
				const isMainBake = n.includes('playfield') && (n.includes('bm_') || RE_BAKE_MAP.test(n))
				const mats = Array.isArray(o.material) ? o.material : [o.material]
				for (const material of mats) {
					for (const mapProp of ['map', 'normalMap', 'envMap', 'emissiveMap']) {
						const pending = material.userData?.[`pending${mapProp[0].toUpperCase()}${mapProp.slice(1)}`]
						if (pending) {
							const key = String(pending).toLowerCase()
							used.add(key)
							if (isMainBake) mainBakeUsed.add(key)
						}
						const tex = material[mapProp]
						if (tex?.name) {
							const key = String(tex.name)
								.replace(/^texture:/, '')
								.toLowerCase()
							used.add(key)
							if (isMainBake) mainBakeUsed.add(key)
						}
					}
				}
			})
			const pf2 = table.getPlayfieldMap()?.toLowerCase()
			const before = textures.length
			const keepAllInserts = texName =>
				texName.includes('insert') ||
				texName.includes('round') ||
				texName.includes('rect') ||
				texName.includes('switc') ||
				texName.includes('vrlight') ||
				texName.includes('flasher') ||
				texName.includes('scratches') ||
				texName.includes('ball_') ||
				texName.includes('bumper') ||
				texName.includes('kicker') ||
				texName.includes('bump')
			textures = textures.filter(tx => {
				const texName = tx.getName().toLowerCase()
				if (used.has(texName) || (pf2 && texName === pf2)) return true
				if (keepAllInserts(texName)) return true
				return false
			})
			if (textures.length !== before)
				this.log(`[stream] Filtered ${before} → ${textures.length} used textures (kept inserts)`, 'debug')
			// NOTE: filtered-out textures keep their raw binaries until the
			// post-stream demand pass below: table script (e.g. Table1_Init
			// assigning VRCab_Backbox.image) routinely references textures
			// no generate-time material names. Clearing here strands those
			// materials mapless forever (transparent-black meshes). Binaries
			// are bulk-cleared after streaming instead (_clearRawTextures).
			textures.sort((texA, texB) => {
				const nameA = texA.getName().toLowerCase()
				const nameB = texB.getName().toLowerCase()
				if (nameA === pf2 && nameB !== pf2) return -1
				if (nameB === pf2 && nameA !== pf2) return 1
				const aMain = mainBakeUsed.has(nameA) ? 0 : 1
				const bMain = mainBakeUsed.has(nameB) ? 0 : 1
				if (aMain !== bMain) return aMain - bMain
				const aCab =
					nameA.includes('vrcab') ||
					RE_VR.test(nameA) ||
					nameA.includes('lockbar') ||
					nameA.includes('cabinet')
						? 0
						: 1
				const bCab =
					nameB.includes('vrcab') ||
					RE_VR.test(nameB) ||
					nameB.includes('lockbar') ||
					nameB.includes('cabinet')
						? 0
						: 1
				if (aCab !== bCab) return aCab - bCab
				if (aMain === 0) return texB.width * texB.height - texA.width * texA.height
				if (aCab === 0) return texB.width * texB.height - texA.width * texA.height
				return texA.width * texA.height - texB.width * texB.height
			})
			if (mainBakeUsed.size)
				this.log(
					`[stream] Prioritized ${mainBakeUsed.size} main-bake: ${[...mainBakeUsed].slice(0, 10).join(', ')}`,
					'debug',
				)
			this.log(`[stream] ${textures.length} textures pending — streaming`, 'debug')
		}
		return {
			node,
			textures,
		}
	}
	async _cleanupReader(reader) {
		if (reader.release) await reader.release()
		else await reader.close()
		reader.data = undefined
		reader.blob = undefined
		if (typeof (window as any).gc === 'function') (window as any).gc()
		logMem(this.harnessLog, 'after reader release')
	}
	// Snapshot unstreamed texture sources before the archive is released,
	// so mid-game script swaps still resolve afterwards.
	async _retainUnstreamedSources(table) {
		if (!this.renderApi || !table?.textures) return
		const retained = await this.renderApi.getMapGenerator().retainSources(Object.values(table.textures), table)
		if (retained.retained > 0)
			this.log(
				`[stream] Retained ${retained.retained} texture sources (${retained.bytes < 1048576 ? `${(retained.bytes / 1024).toFixed(0)} KB` : `${(retained.bytes / 1048576).toFixed(1)} MB`}) for late swaps`,
				'debug',
			)
	}
	_clearRawTextures() {
		let clearedCount = 0
		let retainedCount = 0
		if (!this.table?.textures) return
		const mapGen = this.renderApi?.getMapGenerator?.()
		for (const key of Object.keys(this.table.textures)) {
			const tex = this.table.textures[key]
			// Only free sources already on the GPU: filtered-out and failed
			// textures keep binaries for future demand passes (mid-game swaps).
			if (mapGen?.hasTexture(tex.getName())) {
				tex.binary = undefined
				tex.pdsBuffer = undefined
				clearedCount++
			} else retainedCount++
		}
		if (clearedCount)
			this.harnessLog?.(`[mem] Cleared ${clearedCount} raw texture buffers (${retainedCount} retained)`, 'info')
	}
	async _mount(table, node, opts = {}, source = null) {
		// The renderApi (and its texture cache) is recreated per scene build,
		// so overlays sync here — a _loadTable-time preload would land in
		// the discarded cache.
		for (const overlay of this.overlays)
			void overlay.syncTable?.(table)?.catch?.(e => this.log?.(`overlay sync failed: ${e}`, 'warn'))
		if (this.tableGroup) this.scene.remove(this.tableGroup)
		this.tableGroup = node
		;(globalThis as any).tableGroup = node
		;(globalThis as any).viewer = this
		;(globalThis as any).renderApi = this.renderApi
		this.scene.add(node)
		const pp = postProcessScene(node, {
			viewerMode: this.viewerMode,
			harnessLog: this.harnessLog,
		})
		this._applyNoBakeFill(table, node)
		const params = new URLSearchParams(location.search)
		const useBatch = !params.has('nobatched')
		if (useBatch && table && this.renderApi) {
			const res = _optimizeScene(node, table, this.renderApi)
			if ((res.batched || res.instanced) && this.harnessLog) {
				const before = (() => {
					let c = 0
					node.traverse(o => {
						if (o.isMesh) c++
					})
					return c
				})()
				this.harnessLog(
					`[batch] BatchedMesh ${res.batched} + Instanced ${res.instanced} — meshes ${before}`,
					'debug',
				)
			}
		}
		this.buildNodeCache()
		this.dmd._ensureTexture()
		this.dmd.findMeshes()
		let framed
		if (opts.skipCamera)
			framed = {
				center: this.controls.target.clone(),
				size: new THREE.Vector3(),
				maxDim: 1,
			}
		else if (this.viewerMode === 'play') {
			const state = computePlayFraming(this.tableGroup, this.camera)
			applyCameraState(this.camera, this.controls, state)
			this._playCameraApplied = true
			framed = {
				center: state.center,
				size: state.size,
				maxDim: state.maxDim,
			}
			this.harnessLog?.(
				`[mount] play cam ${state.position.x.toFixed(0)},${state.position.y.toFixed(0)},${state.position.z.toFixed(0)} tgt ${state.target.x.toFixed(0)},${state.target.y.toFixed(0)},${state.target.z.toFixed(0)} maxDim ${state.maxDim.toFixed(0)}`,
				'debug',
			)
		} else {
			framed = frameCamera(this.tableGroup, this.camera, this.controls)
			if (Math.abs(this.camera.fov - CAM.fov) > 0.5) {
				this.camera.fov = CAM.fov
				this.camera.updateProjectionMatrix()
			}
		}
		const center = framed.center,
			size = framed.size || new THREE.Vector3(1, 1, 1)
		syncRoom(this.scene, node, center, size)
		this._showCanvas()
		this.log(
			`Framed ${pp.lightmaps ? `(hid ${pp.lightmaps} lm)` : ''} — ${this.tableGroup ? countObjects(this.tableGroup) : 0} objs`.trim(),
			'debug',
		)
		logMem(this.harnessLog, 'Ready — streaming textures')
		this._emitModeChange()
		const src =
			(opts && typeof opts.source === 'string' ? opts.source : null) ?? (typeof source === 'string' ? source : '')
		const basename =
			typeof src === 'string' && src
				? src
						.split('/')
						.pop()
						?.replace(/\.vpx$/i, '')
				: ''
		const rawGet = table?.getName?.()
		const infoName = table?.info?.TableName?.trim()
		let vpxName = ''
		if (rawGet && rawGet !== 'Table' && rawGet !== 'Table1') vpxName = rawGet
		else if (
			infoName &&
			infoName !== 'Table Name' &&
			infoName !== 'Table1' &&
			infoName.toLowerCase() !== 'table name'
		)
			vpxName = infoName
		else if (basename) vpxName = basename.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
		if (vpxName) setTitle(vpxName)
		if (this.dom.subtitle) this.dom.subtitle.textContent = ''
		if (!opts.skipPlayer) {
			this._loading(92, 'Almost ready…', 'Starting game logic…')
			await new Promise(r => setTimeout(r, 0))
			try {
				// The headless-WASM bridge is the only engine: it boots here
				// eagerly (viewer-mode animation, instant play). A missing
				// artifact or load failure falls through to the catch below.
				await this._createWasmEngine()
			} catch {
				// A broken table must not unmount a successfully built
				// scene: stay viewer-only so the table still renders and
				// orbits. Play entry retries creation on demand. The cause
				// is already logged by the boot above.
				this._revertFailedPlay()
			}
			this._loading(100, 'Ready!', 'Ready to play')
			if (this.dom.loadTitle)
				this.dom.loadTitle.textContent =
					this.viewerMode === 'play'
						? 'Ready — PLAY: Enter=plunger (hold), ←/→ or A/D flippers, 1=Start 5=Coin, Touch tap left/right hold plunger, P=Pause Esc=viewer ?=help'
						: 'Ready — VIEWER: drag to orbit, wheel to zoom — click table to Play (Esc to return)'
			this.log(this.dom.loadTitle.textContent)
			logMem(this.harnessLog, 'Ready final')
		} else {
			this._loading(88, 'Finishing up…', 'Finishing up…')
		}
		if (_isDev)
			Object.assign(window, {
				table,
				tableGroup: node,
			})
		if (!isLowQuality()) buildBvhIdle(node)
		else this.log('[bvh] low quality: skip idle BVH for perf', 'debug')
		this._buttonMeshes = []
		node.traverse(o => {
			if (o.isMesh && o.userData?.isCabinetButton) this._buttonMeshes.push(o)
		})
		if (this._buttonMeshes.length)
			this.harnessLog?.(`[input] ${this._buttonMeshes.length} cabinet button meshes (BVH)`, 'debug')
		this.startLoop()
		if (this.viewerMode === 'viewer') {
			const p = new URLSearchParams(location.search)
			const hasVpx = !!(p.get('vpx') || p.get('table'))
			const mode = p.get('mode')
			if (hasVpx && mode === 'play') {
				this.log('[viewer] auto-switch to play (vpx URL)', 'info')
				setTimeout(() => {
					this._switchToPlay()
				}, 600)
			}
		}
		return {
			loaded: table,
			node,
			pp,
			framed,
		}
	}
	_ensureBallsGroup() {
		let ballsGroup = this.tableGroup?.getObjectByName('balls')
		if (!ballsGroup && this.tableGroup && this.renderApi) {
			ballsGroup = this.renderApi.createParentNode('balls')
			this.tableGroup.add(ballsGroup)
		}
		return ballsGroup
	}
	/**
	 * Boot the headless-WASM engine that owns script, physics, and audio.
	 * Meshes, materials, and input routing are unchanged — only the state
	 * producer swaps. Throws `WasmEngineStartError` (or the missing-artifact
	 * error) on failure so play entry reverts; leaves `wasmEngine` null
	 * unless fully loaded.
	 */
	async _createWasmEngine() {
		await this.wasmEngine?.destroy().catch(() => {})
		this.wasmEngine = null
		if (!this._vpxBytes?.length) throw new WasmEngineStartError('No table bytes retained for the WASM engine')
		const win = window
		const rom =
			win.__pendingRom?.length && win.__pendingRomName
				? { name: win.__pendingRomName, zip: win.__pendingRom }
				: undefined
		const engine = new WasmEngine({
			renderApi: this.renderApi,
			table: this.table,
			ballsGroup: this._ensureBallsGroup(),
			lookupPart: name => {
				const entry = this.nodeCache.get(name)
				if (!entry) return undefined
				return { obj: entry.node, state: entry.item.getState(), updater: entry.item.getUpdater() }
			},
			lookupPlunger: name => this.table?.plungers?.[name]?.data,
		})
		try {
			await engine.load({
				vpxBytes: this._vpxBytes,
				rom,
			})
		} catch (e) {
			await engine.destroy().catch(() => {})
			throw e
		}
		this.wasmEngine = engine
		engine.primeAudioOnGesture()
		this.nodeCache.clear()
		this.buildNodeCache()
		const ballsGroup = this._ensureBallsGroup()
		if (ballsGroup) ballsGroup.visible = true
		this._syncSoundChrome()
		this.log(`WASM engine ready: ${engine.catalogSize} parts, script errors: ${engine.scriptErrorCount}`, 'debug')
		this.isPaused = false
		this.hookInput()
		if (this.viewerMode === 'play') this.enterPlayMode()
		else this.exitPlayMode()
	}
	async _streamTextures(table, textures, reader) {
		if (!textures?.length) {
			await this._retainUnstreamedSources(table)
			if (reader) void this._cleanupReader(reader).catch(() => {})
			// generic: free raw texture binaries after streaming regardless of mode; keeps GPU textures only
			this._clearRawTextures?.()
			if (typeof (globalThis as any).gc === 'function') (globalThis as any).gc()
			// The e2e stream-Done wait relies on this: the lifecycle always closes.
			this.log('[stream] Done 0/0 — nothing to stream')
			return
		}
		this._showStream()
		this._setStreamProgress(0, textures.length)
		if (this.dom.streamLabel) this.dom.streamLabel.textContent = 'Enhancing visuals…'
		const streamId = ++this._streamId
		void (async () => {
			const total = textures.length
			let done = 0
			const t0 = performance.now()
			this.log(`[stream] Streaming ${total} textures…`, 'debug')
			let scheduled = false
			// Exposed for the demand hook below (mid-game script image swaps).
			const patchCloned = (this._patchCloned = () => {
				const cache = this.renderApi.getMapGenerator?.().getCache?.()
				if (!cache || !this.tableGroup) return 0
				let fixed = 0
				this.tableGroup.traverse(o => {
					if (!o.isMesh || !o.material) return
					const mats = Array.isArray(o.material) ? o.material : [o.material]
					for (const m of mats) {
						for (const k of ['map', 'normalMap', 'envMap', 'emissiveMap']) {
							const pk = `pending${k[0].toUpperCase()}${k.slice(1)}`
							const name = m.userData?.[pk]
							if (!name) continue
							// The cache is dual-keyed (exact + lowercase) at every
							// insert, so this is the whole case-insensitive
							// search — no linear scan over the growing cache.
							const tex = cache.get(name) ?? cache.get(String(name).toLowerCase())
							if (!tex) continue
							if (isBakedNodeMaterial(m)) {
								if (k !== 'map') {
									delete m.userData[pk]
									continue
								}
								const changed = setBakedMap(m, tex, String(name))
								delete m.userData[pk]
								let cut = false
								if (!(m.userData as any)?.__addBlend && !((m as any).alphaTest > 0)) {
									const cutout =
										(m.userData as any)?.__alphaTestValue ??
										(tex as any)?.userData?.alphaTestValue ??
										0
									if (cutout > 0 && cutout <= 1) {
										;(m as any).alphaTest = cutout
										m.needsUpdate = true
										cut = true
									}
								}
								if (changed || cut) fixed++
								continue
							}
							if (isPrimitiveNodeMaterial(m)) {
								if (k === 'map') {
									const changed = setPrimitiveMap(m, tex, String(name))
									delete m.userData[pk]
									let cut = false
									if (!(m.userData as any)?.__addBlend && !((m as any).alphaTest > 0)) {
										const cutout =
											(m.userData as any)?.__alphaTestValue ??
											(tex as any)?.userData?.alphaTestValue ??
											0
										if (cutout > 0 && cutout <= 1) {
											;(m as any).alphaTest = cutout
											m.needsUpdate = true
											cut = true
										}
									}
									if (m.userData?.pendingEmissiveMap) delete m.userData.pendingEmissiveMap
									if (changed || cut) fixed++
									continue
								}
								if (k === 'normalMap' || k === 'envMap') {
									if ((m as any)[k] === tex) {
										delete m.userData[pk]
										continue
									}
									// Attach (empty -> texture) changes the program; a
									// texture -> texture swap only rebinds a uniform.
									const attached = (m as any)[k] == null
									m[k] = tex
									tex.name = String(name)
									if (k === 'envMap') m.envMapIntensity = 1
									if (attached) m.needsUpdate = true
									fixed++
									continue
								}
								delete m.userData[pk]
								if (m.userData?.pendingEmissiveMap) delete m.userData.pendingEmissiveMap
								continue
							}
							if ((m as any)[k] === tex) {
								delete m.userData[pk]
								if (k === 'map' && m.userData?.pendingEmissiveMap) {
									delete (m.userData as any).pendingEmissiveMap
								}
								continue
							}
							// Attach (empty -> texture) changes the program; a
							// texture -> texture swap only rebinds a uniform.
							const attached = (m as any)[k] == null
							m[k] = tex
							tex.name = name
							delete m.userData[pk]
							if (attached) m.needsUpdate = true
							if (k === 'map' || k === 'emissiveMap') {
								const info = isBakedMeshByNames(
									o.name || '',
									m.name || '',
									tex.name || '',
									!!m.userData?.__isBaked,
									!!m.userData?.__addBlend,
								)
								if (info.isBaked) {
									applyBakedMaterial(m, tex, info, o.name || '')
									const nl = (o.name || '').toLowerCase()
									const isBakedMeshName = nl.includes('playfield') || nl.includes('bm_')
									if (info.isMainBake && isBakedMeshName) {
										const makeVisible = obj => {
											if (obj.visible === false) {
												obj.visible = true
												for (let pp = obj.parent; pp && pp !== this.tableGroup; pp = pp.parent)
													if (pp.visible === false) pp.visible = true
											}
										}
										makeVisible(o)
										this.tableGroup.traverse(obj2 => {
											if (!obj2.isMesh || obj2 === o) return
											const n2 = (obj2.name || '').toLowerCase()
											if (obj2.material === m && n2.includes('bm_')) {
												makeVisible(obj2)
											}
										})
									}
								} else if (info.isVrCab) {
									const nl = (o.name || '').toLowerCase()
									if (
										o.visible === false &&
										(nl.includes('vrcab') ||
											nl.includes('cabinet') ||
											nl.includes('lockbar') ||
											nl.includes('pincab'))
									) {
										o.visible = true
										for (let p = o.parent; p && p !== this.tableGroup; p = p.parent)
											if (p.visible === false) p.visible = true
									}
									m.polygonOffset = true
									m.polygonOffsetFactor = 0
									m.polygonOffsetUnits = -1
									if (m.transparent && m.opacity === 0) {
										m.transparent = false
										m.opacity = 1
										m.depthWrite = true
										m.alphaTest = 0
										m.blending = THREE.NormalBlending
										if (tex) {
											// Shared textures re-resolve per material: only
											// touch (and re-upload) when samplers differ.
											// A never-flagged texture (version 0) still
											// needs its first upload even when the
											// samplers already match — three.js only
											// uploads version-bumped textures.
											const aniso = isLowQuality() ? QUALITY_CAPS.low.aniso : 8
											const samplerDiffers =
												tex.wrapS !== THREE.ClampToEdgeWrapping ||
												tex.wrapT !== THREE.ClampToEdgeWrapping ||
												tex.generateMipmaps !== true ||
												tex.minFilter !== THREE.LinearMipmapLinearFilter ||
												tex.magFilter !== THREE.LinearFilter ||
												tex.anisotropy !== aniso
											if (samplerDiffers) {
												tex.wrapS = THREE.ClampToEdgeWrapping
												tex.wrapT = THREE.ClampToEdgeWrapping
												tex.generateMipmaps = true
												tex.minFilter = THREE.LinearMipmapLinearFilter
												tex.magFilter = THREE.LinearFilter
												tex.anisotropy = aniso
											}
											if (samplerDiffers || tex.version === 0) tex.needsUpdate = true
										}
										m.needsUpdate = true
									}
									m.needsUpdate = true
								} else {
									const texName = String(tex?.name ?? name ?? '').toLowerCase()
									const isRoundInsert = texName.includes('round') && !texName.includes('ground')
									const isInsertTex =
										texName.includes('insert') ||
										texName.includes('rect') ||
										isRoundInsert ||
										texName.includes('dot') ||
										texName.includes('triangle') ||
										texName.includes('flasher') ||
										texName.includes('vrlight')
									if (isInsertTex && m.transparent && m.opacity === 0) {
										m.transparent = false
										m.opacity = 1
										m.depthWrite = true
										m.alphaTest = 0
										m.blending = THREE.NormalBlending
										m.needsUpdate = true
									}
								}
							}
							fixed++
						}
					}
				})
				if (fixed) {
					// One pass: bake-detect, playfield hide, and playfield show
					// share the per-mesh classify, but the hide needs the whole
					// walk's verdict first, so decisions apply after the walk.
					// classify() lowercases names itself, so one call covers
					// the mixed original/lowercase callers above.
					const effMap = (mm: any) => mm?.map ?? (mm?.userData?.__map as any) ?? null
					let hasReadyBake = false
					const hide: THREE.Mesh[] = []
					const show: THREE.Mesh[] = []
					this.tableGroup.traverse(o2 => {
						if (!o2.isMesh) return
						const rawName = o2.name || ''
						const n2 = rawName.toLowerCase()
						const inFamily = n2.includes('playfield') || n2.includes('bm_')
						const m2 = Array.isArray(o2.material) ? o2.material[0] : o2.material
						const map = m2 ? effMap(m2) : null
						if (map && inFamily) {
							const info = isBakedMeshByNames(
								rawName,
								m2.name || '',
								map?.name || '',
								!!m2.userData?.__isBaked,
								!!m2.userData?.__addBlend,
							)
							if (info.isBaked) hasReadyBake = true
							const isBaked = !!(m2.userData && (m2.userData.__isBaked || m2.userData.__bakedNode))
							// Collect regardless of current visibility: the hide
							// below runs first (as before), and a hidden mesh
							// that still qualifies must end up shown again.
							const shouldShow = isBaked || info.isMainBake || (info.isVlmBake && !info.isMainBake)
							if (shouldShow) show.push(o2)
						}
						if (m2 && o2.visible && n2.includes('playfield')) {
							const info = isBakedMeshByNames(
								rawName,
								m2.name || '',
								map?.name || '',
								!!m2.userData?.__isBaked,
								!!m2.userData?.__addBlend,
							)
							if (!info.isBaked && !info.isMainBake && !info.isVlmBake) hide.push(o2)
						}
					})
					if (hasReadyBake)
						for (const o2 of hide) {
							o2.visible = false
							o2.geometry?.dispose?.()
						}
					for (const o2 of show) {
						if (o2.visible === false) {
							o2.visible = true
							for (let p = o2.parent; p && p !== this.tableGroup; p = p.parent)
								if (p.visible === false) p.visible = true
						}
					}
				}
				return fixed
			})
			const schedulePatch = () => {
				if (scheduled) return
				scheduled = true
				queueMicrotask(() => {
					scheduled = false
					if (this._streamId !== streamId) return
					const matGen = this.renderApi.getMaterialGenerator?.()
					if (this.tableGroup) matGen?.resolvePendingInScene(this.tableGroup)
					matGen?.resolvePendingTextures?.()
					patchCloned()
				})
			}
			const onTexture = (_tex, _ok) => {
				if (this._streamId !== streamId) return
				done++
				schedulePatch()
				if (done % 2 === 0 || done === total) this._setStreamProgress(done, total)
			}
			await this.renderApi.preloadTextures(textures, table, onTexture)
			if (this._streamId !== streamId) {
				if (reader) {
					await this._cleanupReader(reader)
				}
				return
			}
			const matGen = this.renderApi.getMaterialGenerator?.()
			const fixedScene = this.tableGroup ? (matGen?.resolvePendingInScene(this.tableGroup) ?? 0) : 0
			const fixed = fixedScene + (matGen?.resolvePendingTextures?.() ?? 0)
			const fixed2 = patchCloned()
			if (fixed || fixed2)
				this.log(`[stream] Patched ${fixed + fixed2} materials (${fixed} resolved + ${fixed2} cloned)`, 'debug')
			// Demand pass: script-assigned images (set after the used-texture
			// filter ran) reference textures that never streamed. Load + bind
			// them now, before batching, so no material stays mapless.
			if (this.tableGroup && table && this._streamId === streamId) {
				const mapGenerator = this.renderApi.getMapGenerator()
				const { loaded, missing } = await mapGenerator.demandPendingMaps(this.tableGroup, table)
				if (loaded.length) {
					const demandMatGen = this.renderApi.getMaterialGenerator?.()
					const fixed3 =
						(this.tableGroup ? (demandMatGen?.resolvePendingInScene(this.tableGroup) ?? 0) : 0) +
						(demandMatGen?.resolvePendingTextures?.() ?? 0)
					const fixed4 = patchCloned()
					this.log(
						`[stream] Demand-loaded ${loaded.length} script-referenced textures (${loaded.join(', ')})`,
						'debug',
					)
					if (fixed3 + fixed4 === 0)
						this.log('[stream] Demand-loaded textures but no material took them', 'warn')
				}
				for (const name of missing)
					this.log(
						`[stream] Material references unloadable texture "${name}" (unknown name or cleared source)`,
						'warn',
					)
			}
			if (this.tableGroup && table && this.renderApi) {
				const params = new URLSearchParams(location.search)
				if (!params.has('nobatched')) {
					const bakedRes = _batchStaticOpaques(this.tableGroup, table, this.renderApi)
					if (bakedRes) {
						this.log(`[batch] Post-stream baked ${bakedRes} BatchedMesh`, 'debug')
						if (!isLowQuality()) buildBvhIdle(this.tableGroup)
						else this.log('[bvh] low quality: skip post-batch BVH', 'debug')
					} else {
						setTimeout(() => {
							if (this._disposed || !this.tableGroup) return
							const retry = _batchStaticOpaques(this.tableGroup, table, this.renderApi)
							if (retry) {
								this.log(`[batch] Post-stream retry baked ${retry} BatchedMesh`, 'debug')
								if (!isLowQuality()) buildBvhIdle(this.tableGroup)
							}
						}, 600)
					}
				}
			}
			const tm = computeTexMem(this.tableGroup)
			this.log(
				`[stream] Done ${done}/${total} in ${(performance.now() - t0) | 0}ms — now ${tm.texCount} ~${tm.texMemMB} MB`,
			)
			this._setStreamProgress(total, total)
			if (this.dom.streamLabel) this.dom.streamLabel.textContent = 'Visuals ready'
			setTimeout(() => this._hideStream(), 1200)
			logMem(this.harnessLog, 'Stream ready')
			await this._retainUnstreamedSources(table)
			if (reader) {
				await this._cleanupReader(reader)
			}
			// generic: free raw texture binaries after streaming regardless of mode; keeps GPU textures only
			this._clearRawTextures?.()
			if (typeof (globalThis as any).gc === 'function') (globalThis as any).gc()
		})()
	}
	async _fromReader(reader, source, _loadGen = this._loadId) {
		if (_loadGen !== this._loadId) {
			await this._cleanupReader(reader)
			return null
		}
		setTitle(
			typeof source === 'string'
				? source
						.split('/')
						.pop()
						?.replace(/\.vpx$/i, '')
				: '',
		)
		this._loading(62, 'Opening table…', 'Reading table data…')
		const table = await this._loadTable(reader)
		if (_loadGen !== this._loadId) {
			await this._cleanupReader(reader)
			return null
		}
		const { node, textures } = await this._buildScene(table)
		if (_loadGen !== this._loadId) {
			await this._cleanupReader(reader)
			return null
		}
		const mounted = await this._mount(table, node, {}, source)
		if (_loadGen !== this._loadId) {
			await this._cleanupReader(reader)
			return mounted
		}
		const streamIdle = () => {
			if (_loadGen !== this._loadId) {
				void this._cleanupReader(reader).catch(() => {})
				return
			}
			this._streamTextures(table, textures, reader)
		}
		if (typeof (globalThis as any).requestIdleCallback === 'function') {
			;(globalThis as any).requestIdleCallback(streamIdle, { timeout: 2000 })
		} else {
			setTimeout(streamIdle, 32)
		}
		return mounted
	}
	async load() {
		this._loadId = (this._loadId ?? 0) + 1
		const _loadGen = this._loadId
		if (this._loadAbort) this._loadAbort.abort()
		this._loadAbort = new AbortController()
		const _signal = this._loadAbort.signal
		this._streamId++
		await this._ensureRenderer()
		if (_loadGen !== this._loadId) return
		if (this.dom.loading) this.dom.loading.hidden = false
		if (this.dom.wrap) this.dom.wrap.hidden = false
		const _w = typeof window !== 'undefined' ? window.innerWidth : 800
		const _h = typeof window !== 'undefined' ? window.innerHeight : 600
		this.renderer?.setSize(_w, _h)
		this._loading(2, 'Getting ready…', 'Looking for table…')
		const candidates = resolveVpxCandidates({
			defaultName: this.defaultVpx,
			queryParam: this.queryParam,
		})
		if (!candidates.length) {
			this.log('No VPX candidate (pass ?vpx=name)', 'warn')
			return
		}
		this.log(`Trying ${candidates.join(', ')}`, 'debug')
		for (const cand of candidates) {
			if (_loadGen !== this._loadId) return
			if (_signal.aborted) throw new DOMException('Aborted', 'AbortError')
			try {
				try {
					const { idbGet } = await import('../../dist-esm/lib/util/idb-cache.js')
					const cached = await idbGet(cand.split('/').pop())
					if (cached && cached.byteLength > 1_000_000) {
						this.log(
							`[IDB] hit ${cand.split('/').pop()} ${fmtBytes(cached.byteLength)} — using cached`,
							'debug',
						)
						const bytes = new Uint8Array(cached)
						this._vpxBytes = bytes
						const reader = new BrowserBinaryReader(bytes)
						await reader.open()
						if (_loadGen !== this._loadId) {
							try {
								await this._cleanupReader(reader)
							} catch {}
							return
						}
						const _res = await this._fromReader(reader, cand, _loadGen)
						if (_loadGen === this._loadId) this._loadAbort = null
						return _res
					}
				} catch {}
				if (_loadGen !== this._loadId) return
				if (_signal.aborted) throw new DOMException('Aborted', 'AbortError')
				this.log(`Fetching ${cand}…`, 'debug')
				this._loading(5, 'Downloading…', 'Downloading table…')
				const t0 = performance.now()
				const vpxKey = cand.split('/').pop()
				const data = await fetchWithProgress(
					cand,
					p => {
						const pct = Math.round(p * 100)
						this._loading(5 + p * 60, `Downloading… ${pct}%`, `Downloading table… ${pct}%`)
					},
					{ signal: _signal },
				)
				this.log(
					`Fetched ${fmtBytes(data.length)} in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
					'debug',
				)
				try {
					const { idbSet } = await import('../../dist-esm/lib/util/idb-cache.js')
					idbSet(vpxKey, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)).catch(
						() => {},
					)
				} catch {}
				if (_loadGen !== this._loadId) return
				this._vpxBytes = data
				const reader = new BrowserBinaryReader(data)
				await reader.open()
				if (_loadGen !== this._loadId) {
					try {
						await this._cleanupReader(reader)
					} catch {}
					return
				}
				const _res2 = await this._fromReader(reader, cand, _loadGen)
				if (_loadGen === this._loadId) this._loadAbort = null
				return _res2
			} catch (err) {
				if (_signal.aborted || err?.name === 'AbortError' || _loadGen !== this._loadId) return
				this.log(`Error loading ${cand}: ${err?.stack ?? err?.message}`, 'error')
			}
		}
		if (_loadGen !== this._loadId) return
		if (_loadGen === this._loadId) this._loadAbort = null
		throw new Error(`Failed: none of ${candidates.join(', ')}`)
	}
	async loadFromFile(file) {
		this._loadId = (this._loadId ?? 0) + 1
		const _loadGen = this._loadId
		if (this._loadAbort) this._loadAbort.abort()
		this._loadAbort = new AbortController()
		this._streamId++
		this._loading(5, 'Reading file…', `Reading ${file.name}…`)
		this.log(`Reading ${file.name}…`, 'debug')
		const bytes = new Uint8Array(await file.arrayBuffer())
		this._vpxBytes = bytes
		const reader = new BrowserBinaryReader(bytes)
		await reader.open()
		if (_loadGen !== this._loadId) {
			await this._cleanupReader(reader)
			return null
		}
		const _res = await this._fromReader(reader, file.name, _loadGen)
		if (_loadGen === this._loadId) this._loadAbort = null
		return _res
	}
	async loadRomFile(file) {
		const buf = new Uint8Array(await file.arrayBuffer())
		window.__pendingRom = buf
		window.__pendingRomName = file.name.replace(/\.zip$/i, '')
		this.log(`ROM file ${file.name} ${fmtBytes(buf.length)} — stored`, 'debug')
		return buf
	}
	async preloadRom(url) {
		this.log(`Preloading ROM ${url}…`, 'debug')
		const data = await fetchWithProgress(url, p => this.setBar(5 + p * 40, `ROM ${(p * 100).toFixed(0)}%`), {
			signal: this._loadAbort?.signal,
		})
		window.__pendingRom = data
		window.__pendingRomName =
			url
				.split('/')
				.pop()
				?.replace(/\.zip$/i, '') || ''
		window.__pendingRomUrl = url
		this.log(`ROM preload OK ${fmtBytes(data.length)}`, 'debug')
		return data
	}
	async startLoop() {
		await this._ensureRenderer()
		if (this._disposed || !this.renderer) return
		await this.precompilePipelines()
		if (this._disposed || !this.renderer) return
		if (this.animFrame) {
			cancelAnimationFrame(this.animFrame)
			clearTimeout(this.animFrame)
			this.animFrame = null
		}
		if (this._animRaf) {
			cancelAnimationFrame(this._animRaf)
			this._animRaf = null
		}
		if (this._animTimeout) {
			clearTimeout(this._animTimeout)
			this._animTimeout = null
		}
		if ((this as any)._physicsTimeout) {
			clearTimeout((this as any)._physicsTimeout)
			;(this as any)._physicsTimeout = null
		}
		let last = performance.now(),
			frames = 0,
			fps = 0
		let lastFpsUpdate = performance.now()
		// Skipped frames reset without recording, so the next present measures
		// a live rate instead of averaging in the idle gap.
		const rollFpsWindow = (timestamp: number, presented: boolean): boolean => {
			if (timestamp - lastFpsUpdate <= 500) return false
			if (presented) fps = Math.round((frames * 1000) / (timestamp - lastFpsUpdate))
			lastFpsUpdate = timestamp
			frames = 0
			return true
		}
		// expose immediate physics tick for tests
		;(this as any)._tickPhysicsImmediate = () => {
			if (!this.wasmEngine?.ready) return
			if (this.isPaused || this.viewerMode !== 'play' || isLowQuality()) return
			if (this._syncWasmTransforms(performance.now()) && !this._disposed) {
				this.renderApi?.flushMatrixUpdates?.(this.tableGroup)
				if (this.renderPipeline) this.renderPipeline.render()
				else this.renderer.render(this.scene, this.camera)
			}
		}
		this.renderer.setAnimationLoop((timestamp, frame) => {
			if (this._disposed || this.isPaused) {
				if (this.isPaused) this.wasmEngine?.resetStepClock(timestamp)
				return
			}
			// Dirty-gated present: idle frames skip the present (and its matrix
			// pass) entirely — physics above still steps every frame. The scan
			// itself is cheap (numeric signatures, no string work).
			const transmissionDirty = (() => {
				if (!this.table || (this as any)._skipTrans) return false
				try {
					return updateTransmissionBuffer(this.table as never)
				} catch {
					return false
				}
			})()
			if (transmissionDirty) {
				;(window as unknown as Record<string, unknown>).__transDebug = getTransmissionDebug()
			}
			const stateDirty = this._syncPhysicsTransforms(timestamp)
			const controlsDirty = this.controls?.enabled ? !!this.controls.update() : false
			const cameraDirty = !!this._cameraRaf
			// Gamepad nudges share this rAF tick (play-mode gated inside).
			pollNudgePads(this, timestamp)
			// Each overlay owns its poll cadence (the DMD gates on frameId);
			// every overlay updates each tick so none starves when an
			// earlier one reports dirty.
			let overlayDirty = false
			for (const overlay of this.overlays) overlayDirty = overlay.update() || overlayDirty
			const forcePresent = this._needsRender
			this._needsRender = false
			const dirty =
				stateDirty || controlsDirty || cameraDirty || overlayDirty || transmissionDirty || forcePresent
			if (!dirty) {
				rollFpsWindow(timestamp, false)
				return
			}
			if (stateDirty) this.renderApi?.flushMatrixUpdates?.(this.tableGroup)
			if (this.renderPipeline) this.renderPipeline.render()
			else this.renderer.render(this.scene, this.camera)
			frames++
			if (rollFpsWindow(timestamp, true)) {
				if (this.dom.stats) {
					const balls = this.wasmEngine?.ballCount ?? 0
					const mode = this.viewerMode === 'play' ? (this.isPaused ? 'PLAY PAUSED' : 'PLAY') : 'VIEWER'
					const emuRaw = '—'
					const emuLabel = emuRaw
					const draws = this.renderer?.info?.render?.calls ?? 0
					const tris = this.renderer?.info?.render?.triangles ?? 0
					const trisFmt =
						tris >= 1e6
							? `${(tris / 1e6).toFixed(1)}M`
							: tris >= 1e3
								? `${(tris / 1e3).toFixed(1)}k`
								: `${tris}`
					const wasmReady = !!this.wasmEngine?.ready
					const wasmLabel = wasmReady ? 'Ready' : 'Loading…'
					renderStats(this.dom.stats, {
						fps,
						draws,
						trisFmt,
						balls,
						tFmt: '—',
						tHasValue: false,
						emuLabel,
						emuRaw,
						wasmLabel,
						wasmReady,
						backend: this._rendererBackend,
						mode,
					})
				}
				const hud = this.dom.fpsHud || document.getElementById('fps-hud')
				if (hud) {
					let el = hud.querySelector('.fps')
					if (!el) {
						el = document.createElement('span')
						el.className = 'fps'
						hud.textContent = ''
						hud.append(el)
					}
					el.textContent = `${fps} fps`
					const cls = fps >= 55 ? 'fps--good' : fps >= 30 ? 'fps--mid' : fps > 0 ? 'fps--low' : ''
					el.className = `fps ${cls}`.trim()
				}
			}
		})
	}

	_needsRender = false

	/** Requests one gated-loop present (mode switch, resize, camera tick, demand texture). Immediate render() also clears it. */
	invalidate(): void {
		this._needsRender = true
	}

	render() {
		this.renderApi?.flushMatrixUpdates?.(this.tableGroup)
		if (this.renderPipeline) this.renderPipeline.render()
		else this.renderer?.render(this.scene, this.camera)
		this._needsRender = false
	}

	_nudge(angle, force = 2.6) {
		if (!this.wasmEngine?.ready || this.viewerMode !== 'play' || this.isPaused) return
		this.wasmEngine.nudge(angle, force)
		this._flashNudge(angle)
	}
	private readonly unknownKeys = new Set<string>()
	private readonly keyGate = createScancodeGate()
	/** Push a key to the engine; drops silently while not ready, warns once per unmappable code. */
	_sendKey(code, down) {
		if (!this.wasmEngine?.ready) return
		// Pausing must not latch keys in the engine: drop presses, always deliver releases.
		if (this.isPaused && down) return
		const scancode = codeToSdlScancode(resolveFlipperKey(code))
		if (scancode === undefined) {
			if (!this.unknownKeys.has(code)) {
				this.unknownKeys.add(code)
				this.log?.(`[input] no SDL scancode for ${code}; key dropped`, 'warn')
			}
			return
		}
		// Several browser keys fold onto one scancode: first down and last up win.
		if (down ? this.keyGate.down(scancode) : this.keyGate.up(scancode)) this.wasmEngine.pushKey(scancode, down)
	}
	_flashNudge(angle) {
		const el = this.dom.nudgeFlash
		if (!el || this.viewerMode !== 'play') return
		const dir =
			angle >= 45 && angle < 135
				? 'left'
				: angle >= 135 && angle < 225
					? 'down'
					: angle >= 225 && angle < 315
						? 'right'
						: 'up'
		el.textContent = dir === 'left' ? '‹ NUDGE' : dir === 'right' ? 'NUDGE ›' : dir === 'up' ? '▲ NUDGE' : '▼ NUDGE'
		el.dataset.dir = dir
		el.hidden = false
		el.classList.remove('show')
		void el.offsetWidth
		el.classList.add('show')
		clearTimeout(this._nudgeFlashTimer)
		this._nudgeFlashTimer = setTimeout(() => {
			el.classList.remove('show')
			el.hidden = true
		}, 420)
	}
	hookInput() {
		if (!this.wasmEngine?.ready) return
		this._inputCleanup?.()
		this._inputCleanup = attachInput(this)
		if (this.dom.canvas) {
			this.dom.canvas.tabIndex = 0
			setTimeout(() => {
				this.dom.canvas.focus()
			}, 50)
			setTimeout(() => {
				this.dom.canvas.focus()
			}, 300)
		}
	}
}
export function createViewer(opts) {
	return new Viewer(opts)
}
