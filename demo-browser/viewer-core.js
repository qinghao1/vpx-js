// Viewer core — loads VPX, builds Three.js scene, bridges Player physics & input.

import { Buffer } from 'buffer'
import * as THREE from 'three'
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Player } from '../dist-esm/lib/game/player.js'
import { BrowserBinaryReader } from '../dist-esm/lib/io/binary-reader.browser.js'
import { buildBvhIdle, installBvh } from '../dist-esm/lib/render/threejs/three-bvh.js'
import { ThreeRenderApi } from '../dist-esm/lib/render/threejs/three-render-api.js'
import { ThreeTextureLoaderBrowser } from '../dist-esm/lib/render/threejs/three-texture-loader-browser.js'
import { ANIM_POLL_MS, ANIM_SETTLE_MS, AnimationGate } from '../dist-esm/lib/util/animation-gate.js'
import { Vertex3D } from '../dist-esm/lib/util/vector.js'
import { Table } from '../dist-esm/lib/vpt/table/table.js'
import { isWasmReady } from '../dist-esm/lib/physics/wasm/kernels.js'
import { BALL_STRIDE, createPhysicsSAB, MAX_BALLS, pushInput, trySnap } from '../dist-esm/lib/game/shared/physics-buffer.js'
import {
	BAKED_METAL,
	BAKED_ROUGH,
	CAM,
	CAM_ANIM,
	LIGHT_AMBIENT,
	LIGHT_DIR,
	LIGHT_HEMI,
	RE_BAKE_MAP,
	RE_BAKE_MAT,
	RE_CAB,
	RE_OUTER,
	RE_VR,
} from './src/config.js'
import { DmdController } from './src/dmd.js'
import { createHarness } from './src/log-overlay.js'
import {
	applyCameraState,
	computePlayFraming,
	computeViewerFraming,
	ensureProceduralRoom,
	frameCamera,
	hideCabFlippers,
	isDeferred,
	postProcessScene,
	showCabFlippers,
} from './src/scene.js'
import {
	$,
	aliasEvent,
	computeTexMem,
	countObjects,
	fetchWithProgress,
	filterTextures,
	fmtBytes,
	logMem,
	resolveRomCandidates,
	resolveVpxCandidates,
} from './src/utils.js'

window.Buffer ??= Buffer
window.global ??= window
const _isDev = (() => {
	try { if (import.meta.env.DEV) return true } catch {}
	try {
		const h = typeof location !== 'undefined' ? location.hostname : ''
		return h === 'localhost' || h === '127.0.0.1' || h === '' || h === '0.0.0.0'
	} catch { return false }
})()
try {
	installBvh()
} catch {}

export {
	createHarness,
	ensureProceduralRoom,
	filterTextures,
	frameCamera,
	hideCabFlippers,
	postProcessScene,
	resolveVpxCandidates,
}

const cGameName = t => t?.tableScript?.match(/cGameName\s*=\s*["']([^"']+)["']/i)?.[1] || ''
const setTitle = s => { try { const el = document.getElementById('title'); if (el && s) el.textContent = s } catch {} }

const NUDGE = { left: 75, right: 285, forward: 0, back: 180, force: 2.6 }
const swipeNudge = (dx, dy) => {
	const adx = Math.abs(dx), ady = Math.abs(dy)
	if (adx > ady * 1.2) return dx < 0 ? NUDGE.left : NUDGE.right
	if (ady > adx * 1.2) return dy < 0 ? NUDGE.forward : NUDGE.back
	return null
}

const isBakedMesh = (meshName, matName, mapName) => {
	const ml = matName.toLowerCase(), nl = meshName.toLowerCase(), mp = mapName.toLowerCase()
	const isBakedMat = RE_BAKE_MAT.test(ml) || RE_BAKE_MAP.test(mp) || RE_BAKE_MAP.test(nl)
	const isBakedFamily = nl.includes('bm_') || nl.includes('playfield')
	const isMainBake = isBakedFamily && isBakedMat
	const isVlmBake = nl.includes('playfield') && (/lm_/i.test(nl) || isBakedMat || nl.includes('bm_'))
	const isVrCab = RE_VR.test(nl) || RE_CAB.test(nl) || RE_VR.test(ml) || RE_CAB.test(ml)
	return { isBakedMat, isMainBake, isVlmBake, isVrCab, isBaked: isBakedMat || isMainBake || isVlmBake || isVrCab }
}
const wrapBakedTex = tex => {
	if (!tex) return
	tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping
	tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter
	tex.anisotropy = 1; tex.needsUpdate = true
}
const applyBakedMaterial = (mat, tex, info, meshName) => {
	const nl = meshName.toLowerCase()
	mat.emissiveMap = tex
	try { if (mat.emissive) mat.emissive.set(0xffffff); else mat.emissive = new THREE.Color(0xffffff) } catch {}
	mat.emissiveIntensity = 1
	try { if (!mat.color) mat.color = new THREE.Color(0x000000); else mat.color.set(0x000000) } catch {}
	mat.side = THREE.DoubleSide; mat.toneMapped = true; mat.roughness = BAKED_ROUGH; mat.metalness = BAKED_METAL
	wrapBakedTex(tex); wrapBakedTex(mat.emissiveMap)
	if (info.isMainBake && !nl.includes('non_opaque') && !/ramp|armp|botramp|rampscrw/i.test(nl)) {
		mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -1
		mat.depthWrite = true; mat.transparent = false; mat.alphaTest = 0
	}
}

const TABLE_OPTS = {
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

export class Viewer {
	constructor(opts = {}) {
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
			dmdWrap: dom.dmdWrap || document.getElementById('dmd-wrap'),
			dmdCanvas: dom.dmdCanvas || document.getElementById('dmd'),
			dmdStatus: dom.dmdStatus || document.getElementById('dmd-status'),
			playTip: dom.playTip || document.getElementById('play-tip'),
			streamWrap: dom.streamWrap || document.getElementById('stream-progress'),
			streamFill: dom.streamFill || document.getElementById('stream-fill'),
			streamText: dom.streamText || document.getElementById('stream-text'),
			streamLabel: dom.streamLabel || document.getElementById('stream-label'),
		}
		this.harnessLog = createHarness(this.dom.logEl).harnessLog
		this.scene = new THREE.Scene()
		this.scene.background = new THREE.Color(0x0f1115)
		this.camera = new THREE.PerspectiveCamera(CAM.fov, innerWidth / innerHeight, CAM.near, CAM.far)
		this.camera.position.set(0, -800, 1500)
		this.scene.add(new THREE.HemisphereLight(LIGHT_HEMI.sky, LIGHT_HEMI.ground, LIGHT_HEMI.intensity))
		const dir = new THREE.DirectionalLight(LIGHT_DIR.color, LIGHT_DIR.intensity)
		dir.position.set(...LIGHT_DIR.pos)
		this.scene.add(dir)
		this.scene.add(new THREE.AmbientLight(LIGHT_AMBIENT.color, LIGHT_AMBIENT.intensity))
		this.tableGroup = null
		this.table = null
		this.player = null
		this.renderApi = null
		this.nodeCache = new Map()
		this.isPaused = false
		this._boundKeyDown = null
		this._boundKeyUp = null
		this._playCameraApplied = false
		this._cameraAnim = null
		this.animFrame = null
		this._emuStartLogged = false
		this._streamId = 0
		this._touchMap = new Map()
		this._autoPlayTimer = null
		this._rendererBackend = 'webgl'
		this.renderer = null
		this.outlineEffect = null
		this._outlineHover = false
		this._outerMeshes = []
		this.controls = null
		this._rendererReady = this._createRenderer()
		this.dmd = new DmdController(this)
		if (_isDev) Object.assign(window, { scene: this.scene, camera: this.camera, THREE })
		addEventListener('resize', () => this._onResize())
		this.dom.resetBtn?.addEventListener('click', () => this._onResetView())
		this._setupModeSwitch()
		this._setupDebugToggle()
		this._syncChrome()
	}

	_setupDebugToggle() {
		const btn = document.getElementById('debug-toggle')
		const toggle = () => document.body.classList.toggle('show-debug')
		btn?.addEventListener('click', toggle)
		addEventListener('keydown', e => {
			if ((e.code === 'Backquote' || e.key === '`' || e.key === 'F2') && !e.ctrlKey && !e.metaKey && !e.altKey) {
				const tag = (document.activeElement?.tagName || '').toLowerCase()
				if (tag === 'input' || tag === 'textarea' || tag === 'select') return
				toggle()
			}
		})
	}

	async _createRenderer() {
		const canvas = this.dom.canvas
		const p = new URLSearchParams(location.search)
		const wantWebGPU = p.has('webgpu') || p.get('renderer')?.startsWith('webgpu')
		const wantAA = !p.has('noaa')
		let renderer = null
		let backend = 'webgl'
		if (wantWebGPU) {
			try {
				const { WebGPURenderer } = await import('three/webgpu')
				renderer = new WebGPURenderer({ canvas, antialias: wantAA })
				await renderer.init()
				const fallback = !!renderer.backend?.isWebGLBackend
				backend = fallback ? 'webgl-fallback' : 'webgpu'
				if (fallback) console.warn('WebGPURenderer fallback to WebGLBackend')
			} catch (e) {
				console.warn('WebGPURenderer init failed, falling back to WebGLRenderer', e)
				renderer = null
			}
		}
		const isSwiftShader = (() => {
			try {
				const c = document.createElement('canvas')
				const gl = (c.getContext('webgl2') ?? c.getContext('webgl'))
				if (!gl) return false
				const ext = gl.getExtension('WEBGL_debug_renderer_info')
				const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''
				return String(r).toLowerCase().includes('swiftshader')
			} catch { return false }
		})()
		const useAA = wantAA && !isSwiftShader
		if (!renderer) {
			renderer = new THREE.WebGLRenderer({
				canvas,
				antialias: useAA,
				stencil: false,
				preserveDrawingBuffer: false,
				powerPreference: 'high-performance',
			})
			backend = 'webgl'
		}
		renderer.setPixelRatio(Math.min(devicePixelRatio, this.viewerMode === 'play' ? 1 : 1.5))
		renderer.sortObjects = false
		renderer.shadowMap.enabled = p.has('shadows')
		if (renderer.shadowMap.enabled) renderer.shadowMap.type = THREE.PCFSoftShadowMap
		renderer.outputColorSpace = THREE.SRGBColorSpace
		renderer.toneMapping = THREE.ACESFilmicToneMapping
		renderer.toneMappingExposure = 1.25
		this.renderer = renderer
		this._rendererBackend = backend
		if (backend !== 'webgpu' && this.viewerMode !== 'play') {
			try {
				this.outlineEffect = new OutlineEffect(this.renderer, {
					defaultThickness: 0.0025,
					defaultColor: [1, 1, 1],
					defaultAlpha: 1,
					defaultKeepAlive: true,
				})
			} catch (e) {
				console.warn('OutlineEffect init failed', e)
			}
		}
		this.controls?.dispose?.()
		this.controls = new OrbitControls(this.camera, this.renderer.domElement)
		this.controls.enableDamping = true
		this.controls.target.set(0, 0, 0)
		this.controls.update()
		this.controls.enabled = this.viewerMode !== 'play'
		Object.assign(window, {
			scene: this.scene,
			camera: this.camera,
			controls: this.controls,
			renderer: this.renderer,
			THREE,
		})
		this._onResize()
		this.log(`Renderer ready: ${backend} (three r${THREE.REVISION})`)
		return renderer
	}

	async _ensureRenderer() {
		await this._rendererReady
		return this.renderer
	}


	_collectMeshes(re) {
		const out = []
		this.tableGroup.traverse(o => { if (o.isMesh && re.test(o.name || '')) out.push(o) })
		return out
	}

	_updateOuterMeshes() {
		if (!this.tableGroup) return
		let meshes = this._collectMeshes(RE_OUTER)
		if (!meshes.length) meshes = this._collectMeshes(RE_CAB)
		this._outerMeshes = meshes
		for (const m of meshes) {
			m.frustumCulled = this.viewerMode === 'play'
			if (!m.geometry) continue
			try { m.geometry.computeBoundingSphere(); m.geometry.computeBoundingBox() } catch {}
		}
		this._configureOuterOutline(false)
	}

	_ensureOutlineParams(mat, visible) {
		if (!mat) return
		if (!mat.userData) mat.userData = {}
		const p = mat.userData.outlineParameters || (mat.userData.outlineParameters = {})
		p.thickness = 0.0025; p.color = [1, 1, 1]; p.alpha = 1; p.visible = visible; p.keepAlive = true
	}

	_configureOuterOutline(visible) {
		if (!this._outerMeshes?.length) return
		for (const m of this._outerMeshes) {
			if (!m.geometry?.attributes?.normal) try { m.geometry.computeVertexNormals() } catch {}
			for (const mat of (m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [])) this._ensureOutlineParams(mat, visible)
		}
	}

	_setOuterOutline(visible) {
		if (!this._outerMeshes?.length || !this.outlineEffect) return
		for (const m of this._outerMeshes) for (const mat of (m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [])) if (mat?.userData?.outlineParameters) mat.userData.outlineParameters.visible = visible
	}

	_onResize() {
		this.camera.aspect = innerWidth / innerHeight
		this.camera.updateProjectionMatrix()
		if (this.renderer) this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.viewerMode === 'play' ? 1 : 1.5))
		this.renderer?.setSize(innerWidth, innerHeight)
		this.dmd?._resize?.()
	}

	_setupModeSwitch() {
		addEventListener('keydown', e => {
			if ((e.key === 'o' || e.key === 'O') && this.viewerMode === 'play') {
				this.controls.enabled = !this.controls.enabled
				this.log(`Orbit ${this.controls.enabled ? 'enabled' : 'disabled'}`)
			}
		})
		this._raycaster = new THREE.Raycaster()
		this._raycaster.firstHitOnly = false
		this._mouse = new THREE.Vector2()
		const tip = this.dom.playTip
		const canvas = this.dom.canvas
		let hovered = false
		const isOuter = n => (this._outerMeshes.length ? RE_OUTER.test(n) : RE_CAB.test(n || ''))
		const hitIsOuter = o => {
			for (let c = o; c; c = c.parent) if (isOuter(c.name || '')) return true
			return false
		}
		const hitIsPlayfield = o => {
			const n = (o.name || '').toLowerCase()
			return n.includes('playfield') || n.includes('bm_') || n.includes('apron')
		}
		const hideTip = () => {
			hovered = false
			this._outlineHover = false
			if (tip) tip.style.display = 'none'
			if (canvas) canvas.style.cursor = ''
			this._setOuterOutline(false)
		}
		const showTipAt = (x, y) => {
			if (!tip || this.viewerMode !== 'viewer' || !this.tableGroup) return
			hovered = true
			this._outlineHover = isOuterHit(x, y)
			tip.style.left = x + 'px'
			tip.style.top = y + 'px'
			tip.style.display = 'block'
			if (canvas) canvas.style.cursor = 'pointer'
			this._setOuterOutline(this._outlineHover)
		}
		this._hidePlayTip = hideTip
		if (!canvas) return
		const getHits = (x, y) => {
			if (this.viewerMode !== 'viewer' || !this.tableGroup) return []
			const r = canvas.getBoundingClientRect()
			this._mouse.x = ((x - r.left) / r.width) * 2 - 1
			this._mouse.y = -((y - r.top) / r.height) * 2 + 1
			this._raycaster.setFromCamera(this._mouse, this.camera)
			return this._raycaster.intersectObject(this.tableGroup, true)
		}
		const hitTest = (x, y) => {
			if (this.controls?.state !== -1) return hovered
			const hits = getHits(x, y)
			return hits.length ? hits.some(h => hitIsOuter(h.object) || hitIsPlayfield(h.object)) : false
		}
		const isOuterHit = (x, y) => getHits(x, y).some(h => hitIsOuter(h.object))
		let hoverRaf = 0
		let hoverX = 0,
			hoverY = 0
		const flushHover = () => {
			hoverRaf = 0
			if (this.viewerMode !== 'viewer' || !this.tableGroup) return hideTip()
			if (!hitTest(hoverX, hoverY)) return hideTip()
			showTipAt(hoverX, hoverY)
			this._setOuterOutline(isOuterHit(hoverX, hoverY))
		}
		const onHover = e => {
			hoverX = e.clientX
			hoverY = e.clientY
			if (hoverRaf) return
			hoverRaf = requestAnimationFrame(flushHover)
		}
		canvas.addEventListener('pointermove', onHover)
		canvas.addEventListener('pointerleave', () => {
			if (hoverRaf) cancelAnimationFrame(hoverRaf)
			hoverRaf = 0
			hideTip()
		})
		canvas.addEventListener('click', e => {
			if (this.viewerMode !== 'viewer' || !this.tableGroup || e.button !== 0) return
			if (!hovered && !hitTest(e.clientX, e.clientY)) return
			this._switchToPlay()
		})
	}

	async _switchToPlay() {
		if (this.viewerMode === 'play' || !this.tableGroup) return
		this.viewerMode = 'play'
		if (this.renderer) { this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1)); this.renderer.sortObjects = false }
		this._hidePlayTip?.()
		hideCabFlippers(this.tableGroup)
		this._syncChrome()
		const target = computePlayFraming(this.tableGroup)
		await this._animateCameraTo(target, CAM_ANIM.durationMode)
		if (this.player) {
			this.player.setPhysicsEnabled(true)
			this.enterPlayMode()
		} else if (this.table) await this._createPlayer()
		else this.load().catch(e => this.log('Play load failed: ' + e.message, 'error'))
	}

	async _switchToViewer() {
		if (this.viewerMode !== 'play' || !this.tableGroup) return
		this.viewerMode = 'viewer'
		if (this.renderer) { this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); if (!this.outlineEffect && this._rendererBackend !== 'webgpu') { try { this.outlineEffect = new OutlineEffect(this.renderer, { defaultThickness:0.0025, defaultColor:[1,1,1], defaultAlpha:1, defaultKeepAlive:true }) } catch {} } }
		this._hidePlayTip?.()
		showCabFlippers(this.tableGroup)
		this._syncChrome()
		const target = computeViewerFraming(this.tableGroup)
		await this._animateCameraTo(target, CAM_ANIM.durationMode)
		if (this.player) this.player.setPhysicsEnabled(false)
		this.exitPlayMode()
	}

	_syncChrome() {
		const hint = document.getElementById('mode-hint')
		const isPlay = this.viewerMode === 'play'
		document.body.classList.toggle('is-play', isPlay)
		if (hint) {
			hint.innerHTML = isPlay
				? '<span class="dot"></span><b>Play</b> <span style="opacity:0.35">—</span> Esc to exit <span style="opacity:0.35">·</span> P pause <span style="opacity:0.35">·</span> ? help'
				: '<span class="dot"></span><b>Viewer</b> <span style="opacity:0.35">—</span> drag to orbit · click cabinet to <b>Play</b>'
		}
	}

	setupPlayCamera() {
		if (!this.tableGroup || !this.controls) return
		try {
			const state = computePlayFraming(this.tableGroup)
			applyCameraState(this.camera, this.controls, state)
			this._playCameraApplied = true
		} catch (e) {
			console.warn('setupPlayCamera', e)
		}
	}

	async _animateCameraTo(state, duration = CAM_ANIM.durationMode) {
		if (!state || !this.controls) return
		if (this._cameraAnim) clearTimeout(this._cameraAnim)
		this._cameraAnim = null
		const fromPos = this.camera.position.clone()
		const fromTarget = this.controls.target.clone()
		const fromNear = this.camera.near
		const fromFar = this.camera.far
		const toPos = state.position.clone()
		const toTarget = state.target.clone()
		const toNear = state.near
		const toFar = state.far
		if (fromPos.distanceTo(toPos) < 0.5 && fromTarget.distanceTo(toTarget) < 0.5) {
			applyCameraState(this.camera, this.controls, state)
			this._playCameraApplied = this.viewerMode === 'play'
			return
		}
		const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
		this.controls.enabled = false
		this.gate ??= new AnimationGate()
		this.gate.beginAnimation()
		// Let texture/transpile workers yield before animating
		await new Promise(r => setTimeout(r, ANIM_SETTLE_MS))
		const start = performance.now()
		return new Promise(resolve => {
			const tick = now => {
				const t = Math.min(1, (now - start) / duration)
				const e = ease(t)
				this.camera.position.lerpVectors(fromPos, toPos, e)
				this.controls.target.lerpVectors(fromTarget, toTarget, e)
				this.camera.near = THREE.MathUtils.lerp(fromNear, toNear, e)
				this.camera.far = THREE.MathUtils.lerp(fromFar, toFar, e)
				this.camera.updateProjectionMatrix()
				this.camera.lookAt(this.controls.target)
				this.controls.update()
				if (t < 1) this._cameraAnim = setTimeout(() => tick(performance.now()), ANIM_POLL_MS)
				else {
					this._cameraAnim = null
					applyCameraState(this.camera, this.controls, state)
					this._playCameraApplied = this.viewerMode === 'play'
					this.controls.enabled = this.viewerMode !== 'play'
					this.gate.endAnimation()
					resolve()
				}
			}
			this._cameraAnim = setTimeout(() => tick(performance.now()), ANIM_POLL_MS)
		})
	}


	_createPhysicsWorker() {
		try {
			const sab = createPhysicsSAB()
			const scratch = new Float32Array(MAX_BALLS * BALL_STRIDE)
			const workerUrl = new URL('../dist-esm/lib/game/physics.worker.js', import.meta.url)
			const worker = new Worker(workerUrl, { type: 'module' })
			worker.postMessage({ type: 'init', sab }); worker.postMessage({ type: 'start' })
			worker.onmessage = e => { if (e.data?.type === 'heartbeat') this.log(`[physics-worker] heartbeat ${e.data.timeMsec} ticks ${e.data.tickCount}`, 'debug') }
			worker.onerror = e => { this.log(`worker error ${e.message}`, 'warn'); this._physicsSab = null }
			this._physicsSab = sab; this._physicsScratch = scratch; this._physicsWorker = worker
			return { sab, scratch, worker }
		} catch (e) { this.log(`threaded init failed ${e.message}`, 'warn'); return null }
	}

	_ensureThreadedPhysics() {
		try {
			const can = typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined' && typeof Atomics.waitAsync === 'function' && globalThis.crossOriginIsolated
			if (!can) return false
			if (this._physicsSab && this._physicsWorker) return true
			if (!this.player) return false
			const res = this._createPhysicsWorker()
			if (!res) return false
			this.log(`[threaded] lazy SAB ${res.sab.byteLength} worker started`, 'info')
			return true
		} catch (e) { this.log(`lazy threaded init failed ${e.message}`, 'warn'); return false }
	}
	enterPlayMode() {
		if (this.controls) this.controls.enabled = false
		try { this._ensureThreadedPhysics() } catch {}
		if (this.tableGroup) hideCabFlippers(this.tableGroup)
		try {
			const bg = this.tableGroup?.getObjectByName('balls')
			if (bg) bg.visible = true
		} catch {}
		this._emitModeChange()
		try {
			this.dom.canvas?.focus()
		} catch {}
		this._scheduleAutoPlay()
	}
	exitPlayMode() {
		if (this._autoPlayTimer) {
			clearTimeout(this._autoPlayTimer)
			this._autoPlayTimer = null
		}
		if (this._fallbackBallTimer) {
			clearTimeout(this._fallbackBallTimer)
			this._fallbackBallTimer = null
		}
		for (const code of this._touchMap.values()) {
			try {
				this.player?.onKeyUp({ code, key: code === 'Enter' ? 'Enter' : 'Shift', ts: Date.now() })
			} catch {}
		}
		this._touchMap.clear()
		if (this.controls) this.controls.enabled = true
		if (this.tableGroup) showCabFlippers(this.tableGroup)
		try {
			const bg = this.tableGroup?.getObjectByName('balls')
			if (bg) bg.visible = false
		} catch {}
		this._emitModeChange()
	}
	_scheduleAutoPlay() {
		if (this._autoPlayTimer) {
			clearTimeout(this._autoPlayTimer)
			this._autoPlayTimer = null
		}
		if (this.viewerMode !== 'play' || !this.player) return
		const attemptSend = (attempt = 0) => {
			if (this.viewerMode !== 'play' || !this.player) return
			const emu = this.player.getPhysics?.()?.emu
			const isMock = emu?.isMock
			const isPinmame = emu && !isMock
			if (isPinmame) {
				let running = false
				try { running = emu.isInitialized?.() && emu.api?.isRunning?.() === 1 } catch {}
				if (!running) {
					if (attempt < 40) {
						this._autoPlayTimer = setTimeout(() => attemptSend(attempt + 1), 500)
						return
					}
				} else {
					try {
						const frame = this.player.getDmdFrame?.()
						let sum = 0
						if (frame?.length) for (let i = 0; i < Math.min(frame.length, 4096); i++) sum += frame[i] ?? 0
						if (sum < 1000 && attempt < 40) {
							this._autoPlayTimer = setTimeout(() => attemptSend(attempt + 1), 500)
							return
						}
						if (attempt < 30) {
							const dmdReady = sum > 50000
							if (!dmdReady) {
								this._autoPlayTimer = setTimeout(() => attemptSend(attempt + 1), 500)
								return
							}
						}
					} catch {}
					if (attempt < 2) {
						this._autoPlayTimer = setTimeout(() => attemptSend(attempt + 1), 1000)
						return
					}
				}
			} else {
				if (attempt === 0) {
					const emuReady = !emu || emu.isInitialized?.()
					if (!emuReady) {
						this._autoPlayTimer = setTimeout(() => attemptSend(attempt + 1), 500)
						return
					}
				}
			}
			try {
				this.player.onKeyDown({ code: 'Digit5', key: '5', ts: Date.now() })
				setTimeout(() => {
					try {
						this.player.onKeyUp({ code: 'Digit5', key: '5', ts: Date.now() })
					} catch {}
				}, 120)
				setTimeout(() => {
					try {
						this.player.onKeyDown({ code: 'Digit1', key: '1', ts: Date.now() })
					} catch {}
				}, 380)
				setTimeout(() => {
					try {
						this.player.onKeyUp({ code: 'Digit1', key: '1', ts: Date.now() })
					} catch {}
				}, 500)
				this.log('Auto credit/start (5 → 1)', 'info')
				this._scheduleFallbackBall()
			} catch {}
		}
		this._autoPlayTimer = setTimeout(() => attemptSend(0), 900)
	}

	_scheduleFallbackBall() {
		if (this._fallbackBallTimer) clearTimeout(this._fallbackBallTimer)
		if (this._hasPinmame) return
		try {
			const emu = this.player?.getPhysics?.()?.emu
			if (emu && !emu.isMock && emu.isInitialized?.()) return
		} catch {}
		this._fallbackBallTimer = setTimeout(() => {
			try {
				if (this.viewerMode !== 'play' || !this.player || !this.table) return
				if (this._hasPinmame) return
				try {
					const emu = this.player.getPhysics?.()?.emu
					if (emu && !emu.isMock) return
				} catch {}
				const balls = this.player.balls
				if (balls.some(b => !b.state.isFrozen)) return
				if (balls.length === 0) return
				this.log('No ball ejected (no ROM?) — spawning fallback ball', 'warn')
				this._spawnFallbackBall()
			} catch {}
		}, 3500)
	}

	_spawnFallbackBall() {
		try {
			if (!this.player || !this.table) return
			let pos = new Vertex3D(475, 800, 45)
			try {
				const kickers = Object.values(this.table.kickers ?? this.table.items ?? {}).filter(v => v?.constructor?.name === 'Kicker' || v?.data?.isKicker)
				let kicker = kickers.find(k => /drain|trough|ballrelease/i.test(k.getName?.() ?? k.data?.name ?? '')) ?? kickers[0]
				if (kicker?.data) {
					const d = kicker.data
					const x = d.center?.x ?? d.position?.x ?? d.vCenter?.x
					const y = d.center?.y ?? d.position?.y ?? d.vCenter?.y
					if (Number.isFinite(x) && Number.isFinite(y)) pos = new Vertex3D(x, y, 45)
				} else {
					const dim = this.table.getDimensions?.()
					if (dim?.width && dim?.height) pos = new Vertex3D(dim.width * 0.5, dim.height * 0.35, 45)
				}
			} catch {}
			const vel = new Vertex3D(0, 0, 0)
			const creator = {
				getBallCreationPosition: () => pos,
				getBallCreationVelocity: () => vel,
				onBallCreated: () => {},
			}
			const ball = this.player.createBall(creator, 25, 1)
			ball.state.isFrozen = false
			try {
				ball.hit.vel.set(0, 0, 0)
			} catch {}
			this.log(
				`Fallback ball ${ball.getName()} at ${ball.state.pos.x.toFixed(0)},${ball.state.pos.y.toFixed(0)}`,
				'info',
			)
		} catch (e) {
			this.log('Fallback ball failed: ' + e.message, 'warn')
		}
	}

	buildNodeCache() {
		this.nodeCache.clear()
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
	}

	handleBallLifecycle(ball, created) {
		const ballsGroup = this.tableGroup?.getObjectByName('balls')
		if (!ballsGroup || !ball) return
		if (created) {
			try {
				const meshes = ball.getMeshes(this.table, this.renderApi, {})
				const group = this.renderApi.createParentNode(ball.getName())
				for (const obj of Object.values(meshes)) group.add(this.renderApi.createMesh(obj))
				ballsGroup.add(group)
				group.traverse(o => {
					if (o.isMesh) {
						o.castShadow = true
						o.receiveShadow = false
						o.frustumCulled = false
					}
				})
				group.frustumCulled = false
				this.nodeCache.set(ball.getName(), { item: ball, node: group })
				try {
					ball.getUpdater().applyState(group, ball.getState(), this.renderApi, this.table)
				} catch (e) {
					console.warn('ball initial state', e)
				}
				if (this.viewerMode !== 'play') ballsGroup.visible = false
			} catch (e) {
				console.warn('ballCreated', e)
			}
		} else {
			const entry = this.nodeCache.get(ball.getName())
			if (entry?.node) ballsGroup.remove(entry.node)
			this.nodeCache.delete(ball.getName())
		}
	}

	applyChangedStates(changed) {
		if (!changed || !this.tableGroup || !this.renderApi) {
			changed?.release?.()
			return
		}
		for (const name of changed.keys || Object.keys(changed.changedStates || {})) {
			const state = changed.getState ? changed.getState(name) : changed.changedStates[name]
			if (!state) continue
			let entry = this.nodeCache.get(name)
			if (!entry) {
				let node = null
				this.tableGroup.traverse(o => {
					if (!node && o.name === name) node = o
				})
				if (!node) node = this.tableGroup.getObjectByName(name)
				const item = this.table.items[name] || this.player?.balls.find(b => b.getName() === name)
				if (item?.getUpdater && node) {
					entry = { item, node }
					this.nodeCache.set(name, entry)
				}
			}
			if (!entry) continue
			try {
				entry.item.getUpdater().applyState(entry.node, state, this.renderApi, this.table)
			} catch {}
		}
		changed.release()
	}

	_emitModeChange() {
		try {
			document.dispatchEvent(new CustomEvent('viewer:modechange', { detail: { mode: this.viewerMode } }))
		} catch {}
	}

	log(msg, level = 'info') {
		this.harnessLog?.(msg, level)
	}
	setBar(pct, txt) {
		if (this.dom.barFill) this.dom.barFill.style.width = `${Math.max(0, Math.min(100, pct))}%`
		if (this.dom.barText) this.dom.barText.textContent = txt ?? `${pct.toFixed(0)}%`
	}
	_loading(pct, title, detail = '') {
		this.setBar(pct, title)
		if (this.dom.loadTitle) this.dom.loadTitle.textContent = title
		if (this.dom.loadDetail) this.dom.loadDetail.textContent = detail
	}
	_setStreamProgress(done, total) {
		const pct = total ? Math.round((done / total) * 100) : 0
		if (this.dom.streamFill) this.dom.streamFill.style.width = `${pct}%`
		if (this.dom.streamText) this.dom.streamText.textContent = total ? `${done}/${total} · ${pct}%` : `${pct}%`
	}
	_showStream() {
		const w = this.dom.streamWrap
		if (!w) return
		w.hidden = false
		requestAnimationFrame(() => w.classList.add('show'))
	}
	_hideStream() {
		const w = this.dom.streamWrap
		if (!w) return
		w.classList.remove('show')
		setTimeout(() => {
			if (!w.classList.contains('show')) w.hidden = true
		}, 400)
	}
	_showCanvas() {
		if (this.dom.dropzone) this.dom.dropzone.style.display = 'none'
		if (this.dom.wrap) this.dom.wrap.style.display = 'block'
		if (this.dom.loading) this.dom.loading.style.display = 'none'
		this.renderer?.setSize(innerWidth, innerHeight)
		this.dom.canvas?.focus()
		if (this.dom.dmdWrap) this.dom.dmdWrap.style.display = 'none'
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
		if (_isDev) window.table = table
		try { this._hasPinmame = !!cGameName(table) } catch { this._hasPinmame = false }
		const dt = performance.now() - t0
		this.log(
			`Parsed in ${dt.toFixed(0)}ms — ${Object.keys(table.items).length} items, ${Object.keys(table.textures).length} textures`,
		)
		logMem(this.harnessLog, 'after parse')
		filterTextures(table, this.log.bind(this))
		return table
	}

	async _buildScene(table) {
		this._setStatus('')
		this._loading(70, 'Building playfield…', 'Preparing visuals…')
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
		try {
			const ballTex = await texLoader.loadDefaultTexture('ball.png', '.png', 'ball.png')
			renderApi.getMapGenerator().getCache().set('ball.png', ballTex)
			ballTex.name = 'texture:ball.png'
		} catch {}
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
			].map(async nm => {
				try {
					const t = await texLoader.loadDefaultTexture(nm, '.png', nm)
					renderApi.getMapGenerator().getCache().set(nm, t)
					t.name = `texture:${nm}`
					renderApi.getMapGenerator().getCache().set(nm.toLowerCase(), t)
				} catch {}
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
				}
			}
			if (textures.length) {
				this.log(
					`[stream] ${high.length} high-prio + ${deferred.length} deferred — streaming ${textures.length}`,
				)
			}
		}
		this._loading(78, 'Assembling cabinet…', 'Building the machine…')
		const t0 = performance.now()
		const node = await table.generateTableNode(renderApi, {
			...TABLE_OPTS,
			preloadTextures: false,
		})
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
		)
		const { texCount, texMemMB } = computeTexMem(node)
		this.log(`Textures in scene: ${texCount} ~${texMemMB} MB`)
		this._loading(88, 'Finishing up…', 'Final touches…')
		logMem(this.harnessLog, 'after generateTableNode')
		if (textures.length) {
			const used = new Set()
			const mainBakeUsed = new Set()
			node.traverse(o => {
				if (!o.isMesh || !o.material) return
				const n = (o.name || '').toLowerCase()
				const isMainBake = n.includes('playfield') && (n.includes('bm_') || RE_BAKE_MAP.test(n))
				if (n.includes('lm_')) return
				const mats = Array.isArray(o.material) ? o.material : [o.material]
				for (const m of mats) {
					for (const k of ['map', 'normalMap', 'envMap', 'emissiveMap']) {
						const pending = (m.userData || {})['pending' + k[0].toUpperCase() + k.slice(1)]
						if (pending) {
							const key = String(pending).toLowerCase()
							used.add(key)
							if (isMainBake) mainBakeUsed.add(key)
						}
						const tex = m[k]
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
			const keepAllInserts = n =>
				n.includes('insert') ||
				n.includes('round') ||
				n.includes('rect') ||
				n.includes('switc') ||
				n.includes('vrlight') ||
				n.includes('flasher') ||
				n.includes('scratches') ||
				n.includes('ball_') ||
				n.includes('bumper') ||
				n.includes('kicker') ||
				n.includes('bump')
			textures = textures.filter(tx => {
				const n = tx.getName().toLowerCase()
				if (used.has(n) || (pf2 && n === pf2)) return true
				if (n.startsWith('vlm.nestmap') && !mainBakeUsed.has(n) && n !== pf2) return false
				if (keepAllInserts(n)) return true
				return false
			})
			if (textures.length !== before)
				this.log(`[stream] Filtered ${before} → ${textures.length} used textures (kept inserts)`)
			textures.sort((a, b) => {
				const aN = a.getName().toLowerCase(),
					bN = b.getName().toLowerCase()
				if (aN === pf2 && bN !== pf2) return -1
				if (bN === pf2 && aN !== pf2) return 1
				const aMain = mainBakeUsed.has(aN) ? 0 : 1,
					bMain = mainBakeUsed.has(bN) ? 0 : 1
				if (aMain !== bMain) return aMain - bMain
				const aCab =
					aN.includes('vrcab') || aN.includes('vr_') || aN.includes('lockbar') || aN.includes('cabinet')
						? 0
						: 1
				const bCab =
					bN.includes('vrcab') || bN.includes('vr_') || bN.includes('lockbar') || bN.includes('cabinet')
						? 0
						: 1
				if (aCab !== bCab) return aCab - bCab
				if (aMain === 0) return b.width * b.height - a.width * a.height
				if (aCab === 0) return b.width * b.height - a.width * a.height
				return a.width * a.height - b.width * b.height
			})
			if (mainBakeUsed.size)
				this.log(
					`[stream] Prioritized ${mainBakeUsed.size} main-bake: ${[...mainBakeUsed].slice(0, 10).join(', ')}`,
				)
			this.log(`[stream] ${textures.length} textures pending — streaming`)
		}
		return { node, textures }
	}

	async _cleanupReader(reader) {
		try {
			if (reader.release) await reader.release()
			else await reader.close()
		} catch {}
		try {
			reader.data = undefined
			reader.blob = undefined
			if (window.gc) window.gc()
		} catch {}
		logMem(this.harnessLog, 'after reader release')
	}

	_clearRawTextures() {
		try {
			let n = 0
			if (!this.table?.textures) return
			for (const k of Object.keys(this.table.textures)) {
				try {
					this.table.textures[k].binary = undefined
					this.table.textures[k].pdsBuffer = undefined
					n++
				} catch {}
			}
			// Keep entries but clear raw buffers; delete would break fast mode-switch, so just clear.
			if (n) this.harnessLog?.(`[mem] Cleared ${n} raw texture buffers`, 'info')
		} catch {}
	}

	async _mount(table, node, opts = {}) {
		if (this.tableGroup) this.scene.remove(this.tableGroup)
		this.tableGroup = node
		try { this._tableBasePos = node.position.clone() } catch {}
		this.scene.add(node)
		const pp = postProcessScene(node, { viewerMode: this.viewerMode, harnessLog: this.harnessLog, table })
		if (this.viewerMode === 'play') hideCabFlippers(node)
		this._updateOuterMeshes()
		this._setOuterOutline(false)
		this.buildNodeCache()
		try {
			this.dmd._ensureTexture()
			this.dmd.findMeshes()
		} catch {}
		let framed
		if (opts.skipCamera) framed = { center: this.controls.target.clone(), size: new THREE.Vector3(), maxDim: 1 }
		else if (this.viewerMode === 'play') {
			const state = computePlayFraming(this.tableGroup)
			applyCameraState(this.camera, this.controls, state)
			this._playCameraApplied = true
			framed = { center: state.center, size: state.size, maxDim: state.maxDim }
			this.harnessLog?.(`[mount] play cam ${state.position.x.toFixed(0)},${state.position.y.toFixed(0)},${state.position.z.toFixed(0)} tgt ${state.target.x.toFixed(0)},${state.target.y.toFixed(0)},${state.target.z.toFixed(0)} maxDim ${state.maxDim.toFixed(0)}`, 'info')
		} else framed = frameCamera(this.tableGroup, this.camera, this.controls)
		try {
			const center = framed.center,
				size = framed.size || new THREE.Vector3(1, 1, 1)
			let hasVr = false
			node.traverse(o => {
				if (o.isMesh && o.visible && o.name?.toLowerCase().includes('vr_')) hasVr = true
			})
			ensureProceduralRoom(this.scene, center, size, { hasVr })
		} catch {}
		this._showCanvas()
		this.log(
			`Framed ${pp.lightmaps ? `(hid ${pp.lightmaps} lm)` : ''} — ${this.tableGroup ? countObjects(this.tableGroup) : 0} objs`.trim(),
		)
		logMem(this.harnessLog, 'Ready — streaming textures')
		this._emitModeChange()
		try {
			const gn = cGameName(table)
			const basename = typeof source === 'string' ? source.split('/').pop()?.replace(/\.vpx$/i, '') : ''
			const rawGet = table?.getName?.()
			const infoName = table?.info?.TableName?.trim()
			let vpxName = ''
			if (rawGet && rawGet !== 'Table' && rawGet !== 'Table1') vpxName = rawGet
			else if (infoName && infoName !== 'Table Name' && infoName !== 'Table1' && infoName.toLowerCase() !== 'table name') vpxName = infoName
			else if (basename) vpxName = basename.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
			if (vpxName) setTitle(vpxName)
			else if (gn) setTitle(gn)
			if (gn) {
				const romParam = new URLSearchParams(location.search).get('rom')
				const candidates = romParam ? resolveRomCandidates(romParam) : [`/pinmame/roms/${gn}.zip`]
				this.log(`PinMAME GameName: ${gn} — trying ${candidates.join(', ')}`)
			}
			if (this.dom.subtitle) this.dom.subtitle.textContent = ''
		} catch {}
		if (!opts.skipPlayer) {
			this._loading(92, 'Almost ready…', 'Starting game logic…')
			await new Promise(r => setTimeout(r, 0))
			await this._createPlayer()
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
		Object.assign(window, { table, tableGroup: node, player: this.player })
		try {
			buildBvhIdle(node)
		} catch {}
		this.startLoop()
		return { loaded: table, node, pp, framed }
	}

	async _createPlayer() {
		try {
			if (this.player)
				try {
					this.player.removeAllListeners?.()
				} catch {}
			this.player = new Player(this.table, (this.gate ??= new AnimationGate()))
			this.player.setPhysicsEnabled(this.viewerMode === 'play')
			const p = this.player
			if (typeof p.initAsync === 'function') await p.initAsync()
			else this.player.init()
			this.nodeCache.clear()
			this.buildNodeCache()
			try {
				let ballsGroup = this.tableGroup?.getObjectByName('balls')
				if (!ballsGroup && this.tableGroup && this.renderApi) {
					ballsGroup = this.renderApi.createParentNode('balls')
					this.tableGroup.add(ballsGroup)
				}
				for (const b of this.player.balls) this.handleBallLifecycle(b, true)
				try {
					if (ballsGroup) ballsGroup.visible = this.viewerMode === 'play'
				} catch {}
				try {
					this.player.updateAnimations(this.player.getGameTime() ?? this.player.getPhysics().timeMsec ?? 0)
				} catch {}
				const init = this.player.popStates()
				this.applyChangedStates(init)
				// viewer mode no longer spawns a debug ball — playfield should be empty
			} catch (e) {
				console.warn('init balls/states', e)
			}
			this.player.on('ballCreated', b => this.handleBallLifecycle(b, true))
			this.player.on('ballDestroyed', b => this.handleBallLifecycle(b, false))
			this.player.on('emuStarted', () => {
				this._emuStartLogged = true
				this.log(`PinMAME emu ready: ${this.player.getPhysics().emu?.constructor.name}`)
			})
			let tries = 0
			const fallback = async () => {
				try {
					let emu = this.player.getPhysics().emu
					if (emu) {
						this.log(`Emu after init: ${emu.constructor.name} init=${emu.isInitialized?.()} mock=${emu.isMock} run=${(()=>{try{return emu.api?.isRunning?.()}catch{return '?' }})()}`)
						return
					}
					if (++tries < 10) {
						setTimeout(fallback, 1000)
						return
					}
					const gn = cGameName(this.table)
					if (!gn) return
					this.log(`PinMAME: no emu yet for ${gn} — trying manual fallback`, 'warn')
					const { VpmController } = await import('../dist-esm/lib/scripting/objects/vpm-controller.js')
					if (this.player.getPhysics().emu) return
					const vpm = new VpmController(this.player)
					vpm.GameName = gn
					await vpm.whenReady()
					emu = this.player.getPhysics().emu
					if (emu) {
						this._emuStartLogged = true
						this.log(`PinMAME fallback emu ready: ${emu.constructor.name} init=${emu.isInitialized()}`)
						this.dmd._ensureTexture()
						this.dmd.findMeshes()
					}
				} catch (e) {
					this.log(`PinMAME fallback failed: ${e.message}`, 'warn')
				}
			}
			setTimeout(fallback, 3000)
			this.log('Player init OK')
			this.isPaused = false
			this.hookInput()
			if (this.viewerMode === 'play') this.enterPlayMode()
			else this.exitPlayMode()
		} catch (e) {
			this.log('Player init failed:' + e.message, 'error')
			console.error(e)
		}
	}

	_streamTextures(table, textures, reader) {
		if (!textures?.length) {
			if (reader) void this._cleanupReader(reader).catch(() => {})
			if (this.viewerMode !== 'play') {
				try {
					this._clearRawTextures?.()
				} catch {}
			}
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
			this.log(`[stream] Streaming ${total} textures…`)
			let scheduled = false
			const patchCloned = () => {
				try {
					const cache = this.renderApi.getMapGenerator?.().getCache?.()
					if (!cache || !this.tableGroup) return 0
					let fixed = 0
					this.tableGroup.traverse(o => {
						if (!o.isMesh || !o.material) return
						const mats = Array.isArray(o.material) ? o.material : [o.material]
						for (const m of mats) {
							for (const k of ['map', 'normalMap', 'envMap', 'emissiveMap']) {
								const pk = 'pending' + k[0].toUpperCase() + k.slice(1)
								const name = m.userData?.[pk]
								if (!name) continue
								let tex = cache.get(name)
								if (!tex) {
									for (const [ck, cv] of cache)
										if (ck.toLowerCase() === String(name).toLowerCase()) {
											tex = cv
											break
										}
								}
								if (!tex) continue
								m[k] = tex
								try {
									tex.name = name
								} catch {}
								delete m.userData[pk]
								m.needsUpdate = true
								if (k === 'map') {
									const info = isBakedMesh(o.name || '', m.name || '', tex.name || '')
									if (info.isBaked) {
										try { applyBakedMaterial(m, tex, info, o.name || '') } catch {}
										if (info.isMainBake && (o.visible === false) && (o.name || '').toLowerCase().includes('playfield')) {
											o.visible = true
											for (let p = o.parent; p && p !== this.tableGroup; p = p.parent) if (p.visible === false) p.visible = true
										}
									}
								}
								fixed++
							}
						}
					})
					if (fixed) {
						let hasReadyBake = false
						this.tableGroup.traverse(o2 => {
							if (!o2.isMesh) return
							const n2 = o2.name || '', m2 = Array.isArray(o2.material) ? o2.material[0] : o2.material
							if (!m2?.map) return
							if (!n2.toLowerCase().includes('playfield') && !n2.toLowerCase().includes('bm_')) return
							const info = isBakedMesh(n2, m2.name || '', m2.map?.name || '')
							if (info.isBaked) hasReadyBake = true
						})
						if (hasReadyBake) {
							this.tableGroup.traverse(o2 => {
								if (!o2.isMesh || !o2.visible || !(o2.name || '').toLowerCase().includes('playfield')) return
								const m2 = Array.isArray(o2.material) ? o2.material[0] : o2.material
								if (!m2) return
								const info = isBakedMesh(o2.name || '', m2.name || '', m2.map?.name || '')
								if (!info.isBaked && !info.isMainBake && !info.isVlmBake) {
									o2.visible = false
									try { o2.geometry?.dispose?.() } catch {}
								}
							})
						}
						// ensure baked playfield is visible after streaming (fix depthBias dedup / pending hide)
						this.tableGroup.traverse(o2 => {
							if (!o2.isMesh) return
							const n2 = (o2.name || '').toLowerCase()
							if (!n2.includes('bm_playfield')) return
							const m2 = Array.isArray(o2.material) ? o2.material[0] : o2.material
							if (!m2?.map) return
							if (o2.visible === false) {
								o2.visible = true
								for (let p = o2.parent; p && p !== this.tableGroup; p = p.parent) if (p.visible === false) p.visible = true
							}
						})
					}
					if (fixed && this._outerMeshes?.length && this.outlineEffect) {
						const visible = !!this._outlineHover
						for (const outer of this._outerMeshes) {
							const mm = outer.material
								? Array.isArray(outer.material)
									? outer.material
									: [outer.material]
								: []
							for (const mmMat of mm) {
								if (!mmMat?.userData) continue
								if (!mmMat.userData.outlineParameters) {
									mmMat.userData.outlineParameters = {
										thickness: 0.0025,
										color: [1, 1, 1],
										alpha: 1,
										visible,
										keepAlive: true,
									}
								} else mmMat.userData.outlineParameters.visible = visible
							}
							if (!outer.geometry?.attributes?.normal) {
								try {
									outer.geometry.computeVertexNormals()
								} catch {}
							}
						}
					}
					return fixed
				} catch {
					return 0
				}
			}
			const schedulePatch = () => {
				if (scheduled) return
				scheduled = true
				queueMicrotask(() => {
					scheduled = false
					if (this._streamId !== streamId) return
					try {
						this.renderApi.getMaterialGenerator?.().resolvePendingTextures?.()
					} catch {}
					try {
						patchCloned()
					} catch {}
				})
			}
			const onTexture = (tex, ok) => {
				if (this._streamId !== streamId) return
				done++
				schedulePatch()
				if (done % 2 === 0 || done === total) this._setStreamProgress(done, total)
			}
			try {
				await this.renderApi.preloadTextures(textures, table, onTexture)
				if (this._streamId !== streamId) return
				const fixed = this.renderApi.getMaterialGenerator?.().resolvePendingTextures?.() ?? 0
				const fixed2 = patchCloned()
				if (fixed || fixed2)
					this.log(`[stream] Patched ${fixed + fixed2} materials (${fixed} cached + ${fixed2} cloned)`)
				const tm = computeTexMem(this.tableGroup)
				this.log(
					`[stream] Done ${done}/${total} in ${(performance.now() - t0) | 0}ms — now ${tm.texCount} ~${tm.texMemMB} MB`,
				)
				this._setStreamProgress(total, total)
				if (this.dom.streamLabel) this.dom.streamLabel.textContent = 'Visuals ready'
				setTimeout(() => this._hideStream(), 1200)
				logMem(this.harnessLog, 'Stream ready')
			} catch (e) {
				if (this._streamId !== streamId) return
				this.log('[stream] failed: ' + e.message, 'warn')
				this._hideStream()
			} finally {
				if (reader) {
					try {
						await this._cleanupReader(reader)
					} catch {}
				}
				if (this.viewerMode !== 'play') {
					try {
						this._clearRawTextures?.()
					} catch {}
				}
			}
		})()
	}

	async _waitForPinmame(timeout = 45000) {
		if (!this._hasPinmame) return true
		this.log(`[wait] PinMAME wait up to ${timeout}ms — throttling render`)
		const start = performance.now()
		while (performance.now() - start < timeout) {
			try {
				const emu = this.player?.getPhysics?.()?.emu
				if (emu?.isMock) return true
				if (emu?.api?.isRunning?.() === 1) {
					this.log(`[wait] isRunning=1 after ${((performance.now()-start)|0)}ms`)
					return true
				}
			} catch {}
			await new Promise(r => setTimeout(r, 200))
		}
		try {
			const emu = this.player?.getPhysics?.()?.emu
			this.log(`[wait] timeout ${timeout}ms isRunning=${emu?.api?.isRunning?.()} init=${emu?.isInitialized?.()}`)
		} catch {}
		return false
	}

	async _fromReader(reader, source) {
		try {
			setTitle(typeof source === 'string' ? source.split('/').pop()?.replace(/\.vpx$/i,'') : '')
			this._loading(62, 'Opening table…', 'Reading table data…')
			const table = await this._loadTable(reader)
			const { node, textures } = await this._buildScene(table)
			const mounted = await this._mount(table, node)
			const ok = await this._waitForPinmame(5000)
			this.log(`[wait] done ok=${ok} streaming ${textures.length}`)
			this._streamTextures(table, textures, reader)
			return mounted
		} catch (err) {
			this.log(`Failed: ${err.stack || err.message}`, 'error')
			console.error(err)
			this._loading(0, 'Failed to load', err.message)
			throw err
		}
	}

	async load() {
		await this._ensureRenderer()
		if (this.dom.loading) this.dom.loading.style.display = 'flex'
		if (this.dom.wrap) this.dom.wrap.style.display = 'block'
		try {
			this.renderer?.setSize(innerWidth, innerHeight)
		} catch {}
		this._loading(2, 'Getting ready…', 'Looking for table…')
		const candidates = resolveVpxCandidates({ defaultName: this.defaultVpx, queryParam: this.queryParam })
		if (!candidates.length) {
			this.log('No VPX candidate (pass ?vpx=name)', 'warn')
			return
		}
		this.log(`Trying ${candidates.join(', ')}`)
		for (const cand of candidates) {
			try {
				try {
					const { idbGet } = await import('../dist-esm/lib/util/idb-cache.js')
					const cached = await idbGet(cand.split('/').pop())
					if (cached && cached.byteLength > 1_000_000) {
						this.log(`[IDB] hit ${cand.split('/').pop()} ${fmtBytes(cached.byteLength)} — using cached`)
						const reader = new BrowserBinaryReader(new Uint8Array(cached))
						await reader.open()
						return await this._fromReader(reader, cand)
					}
				} catch {}
				this.log(`Fetching ${cand}…`)
				this._loading(5, 'Downloading…', 'Downloading table…')
				const t0 = performance.now()
				const vpxKey = cand.split('/').pop()
				const data = await fetchWithProgress(cand, p => {
					const pct = Math.round(p * 100)
					this._loading(5 + p * 60, `Downloading… ${pct}%`, `Downloading table… ${pct}%`)
				})
				this.log(`Fetched ${fmtBytes(data.length)} in ${((performance.now() - t0) / 1000).toFixed(1)}s`)
				try {
					const { idbSet } = await import('../dist-esm/lib/util/idb-cache.js')
					idbSet(vpxKey, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)).catch(
						() => {},
					)
				} catch {}
				const reader = new BrowserBinaryReader(data)
				await reader.open()
				return await this._fromReader(reader, cand)
			} catch (err) {
				if (!String(err.message).includes('Failed:')) this.log(`Not at ${cand}: ${err.message}`, 'debug')
			}
		}
		throw new Error(`Failed: none of ${candidates.join(', ')}`)
	}

	async loadFromFile(file) {
		this._loading(5, 'Reading file…', `Reading ${file.name}…`)
		this.log(`Reading ${file.name}…`)
		const reader = new BrowserBinaryReader(file)
		await reader.open()
		return this._fromReader(reader, file.name)
	}

	async loadRomFile(file) {
		try {
			const buf = new Uint8Array(await file.arrayBuffer())
			window.__pendingRom = buf
			window.__pendingRomName = file.name.replace(/\.zip$/i, '')
			this.log(`ROM file ${file.name} ${fmtBytes(buf.length)} — stored`)
			return buf
		} catch (e) {
			this.log(`loadRomFile failed: ${e.message}`, 'error')
			throw e
		}
	}

	async preloadRom(url) {
		try {
			this.log(`Preloading ROM ${url}…`)
			const data = await fetchWithProgress(url, p => this.setBar(5 + p * 40, `ROM ${(p * 100).toFixed(0)}%`))
			window.__pendingRom = data
			window.__pendingRomName = url.split('/').pop()?.replace(/\.zip$/i, '') || ''
			window.__pendingRomUrl = url
			this.log(`ROM preload OK ${fmtBytes(data.length)}`)
			return data
		} catch (e) {
			this.log(`ROM preload failed: ${e.message}`, 'error')
			throw e
		}
	}

	async startLoop() {
		await this._ensureRenderer()
		if (this.animFrame) {
			try { cancelAnimationFrame(this.animFrame) } catch {}
			try { clearTimeout(this.animFrame) } catch {}
		}
		let last = performance.now(),
			frames = 0,
			fps = 0
		let pinLoadingLogged = false
		const isPinLoading = () => {
			if (!this._hasPinmame) return false
			const emu = this.player?.getPhysics?.()?.emu
			if (!emu || emu.isMock || !emu.isInitialized?.()) return false
			try { return emu.api?.isRunning?.() === 0 } catch { return false }
		}
		let threaded = false
		try {
			const can = typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined' && typeof Atomics.waitAsync === 'function' && globalThis.crossOriginIsolated
			if (can && this.player && this.viewerMode === 'play') {
				const res = this._createPhysicsWorker()
				if (res) {
					threaded = true
					this.log(`[threaded] SAB ${res.sab.byteLength} worker started`, 'info')
				}
			} else if (!can) {
				try { this.log(`[threaded] disabled hasSAB=${typeof SharedArrayBuffer !== 'undefined'} isolated=${globalThis.crossOriginIsolated} waitAsync=${typeof Atomics?.waitAsync}`, 'debug') } catch {}
			}
		} catch {}
		const tickPhysics = now => {
			if (!this.player || this.isPaused) return
			this.player.setPhysicsEnabled(this.viewerMode === 'play')
			this.player.updatePhysics(now)
			this.player.updateAnimations(this.player.getGameTime())
			const changed = this.player.popStates()
			if (changed.keys.length) this.applyChangedStates(changed)
		}
		const tickPhysicsThreaded = now => {
			const curSab = this._physicsSab
			const curScratch = this._physicsScratch
			if (!curSab || !curScratch || !this.player || this.isPaused) return
			try {
				const res = trySnap(curSab, curScratch)
				if (res) {
					for (let i = 0; i < Math.min(res.count, this.player.balls.length); i++) {
						const off = i * BALL_STRIDE
						const b = this.player.balls[i]
						if (!b) continue
						const st = b.getState()
						st.pos.x = curScratch[off]
						st.pos.y = curScratch[off + 1]
						st.pos.z = curScratch[off + 2]
						if (st.vel) {
							st.vel.x = curScratch[off + 3]
							st.vel.y = curScratch[off + 4]
							st.vel.z = curScratch[off + 5]
						}
					}
					this.player.updateAnimations(res.timeMsec)
					const changed = this.player.popStates()
					if (changed.keys.length) this.applyChangedStates(changed)
				} else {
					const t = this.player.getPhysics()?.timeMsec ?? now
					this.player.updateAnimations(t)
					const changed = this.player.popStates()
					if (changed.keys.length) this.applyChangedStates(changed)
				}
			} catch {}
		}
		const loop = () => {
			if (!threaded && this._physicsSab) threaded = true
			const now = performance.now()
			const pinLoading = isPinLoading()
			if (pinLoading !== pinLoadingLogged) {
				pinLoadingLogged = pinLoading
				this.log(pinLoading ? '[loop] PinMAME loading — pausing render' : '[loop] PinMAME ready — resuming render')
			}
			if (pinLoading) {
				this.animFrame = setTimeout(loop, 16)
				if (threaded) tickPhysicsThreaded(now)
				else tickPhysics(now)
				this._pollPinmame()
				return
			}
			this.animFrame = requestAnimationFrame(loop)
			if (this.controls?.enabled) this.controls.update()
			if (threaded) tickPhysicsThreaded(now)
			else tickPhysics(now)
			this._pollPinmame()
			try { this._applyNudgeVisual() } catch {}
			this.renderer.render(this.scene, this.camera)
			frames++
			const now2 = performance.now()
			if (now2 - last > 500) {
				fps = Math.round((frames * 1000) / (now2 - last))
				last = now2
				frames = 0
			}
			if (this.dom.stats) {
				const balls = this.player?.balls.length ?? 0
				const t = this.player?.getPhysics()?.timeMsec ?? 0
				const mode = this.viewerMode === 'play' ? (this.isPaused ? 'PLAY PAUSED' : 'PLAY') : 'VIEWER'
				const emu = this.player?.getPhysics()?.emu
				const emuRaw = emu ? emu.constructor.name : '—'
				const emuStat = !emu ? '' : emu.isInitialized?.() ? 'ok' : 'loading'
				const draws = this.renderer?.info?.render?.calls ?? 0
				const tris = this.renderer?.info?.render?.triangles ?? 0
				const trisFmt = tris >= 1e6 ? `${(tris / 1e6).toFixed(1)}M` : tris >= 1e3 ? `${(tris / 1e3).toFixed(1)}k` : `${tris}`
				const fpsCls = fps >= 55 ? 'fps--good' : fps >= 30 ? 'fps--mid' : fps > 0 ? 'fps--low' : ''
				const modeCls = mode.includes('PAUSED') ? 'badge--paused' : mode === 'PLAY' ? 'badge--play' : 'badge--viewer'
				const modeLabel = mode === 'PLAY PAUSED' ? 'PAUSED' : mode
				const tFmt = t ? `${(t / 1000).toFixed(1)}s` : '—'
				const emuLabel = emuStat ? `${emuRaw} · ${emuStat}` : emuRaw
				let wasmReady = false
				try { wasmReady = isWasmReady() } catch {}
				const wasmLabel = wasmReady ? 'Ready' : 'Loading…'
				const threadLabel = threaded ? ' · threaded' : ''
				this.dom.stats.innerHTML = `
					<div class="stats-head">
						<span class="badge ${modeCls}">${modeLabel}</span>
						<span class="sep">·</span><span>${this._rendererBackend}</span>
						<span class="sep">·</span><span class="fps ${fpsCls}">${fps} fps</span><span>${threadLabel}</span>
					</div>
					<div class="stats-grid">
						<div class="stats-item"><span class="k">Draws</span><span class="v">${draws}</span></div>
						<div class="stats-item"><span class="k">Tris</span><span class="v">${trisFmt}</span></div>
						<div class="stats-item"><span class="k">Balls</span><span class="v">${balls}</span></div>
						<div class="stats-item"><span class="k">Time</span><span class="v ${t ? '' : 'v--muted'}">${tFmt}</span></div>
						<div class="stats-item"><span class="k">Emu</span><span class="v ${emuRaw === '—' ? 'v--muted' : ''}">${emuLabel}</span></div>
						<div class="stats-item"><span class="k">WASM</span><span class="v ${wasmReady ? '' : 'v--muted'}">${wasmLabel}</span></div>
					</div>`
			}
		}
		loop()
	}

	_pollPinmame() {
		if (!this._emuStartLogged) {
			const emu = this.player?.getPhysics()?.emu
			if (emu) {
				this._emuStartLogged = true
				this.log(`PinMAME emu started: ${emu.constructor.name} ${emu.getVersion?.() ?? ''}`)
			}
		}
		this.dmd.render()
	}

	_applyNudgeVisual() {
		if (!this.tableGroup || !this.player || this.viewerMode !== 'play') return
		try {
			const phys = this.player.getPhysics?.()
			if (!phys) return
			if (!this._tableBasePos) {
				try { this._tableBasePos = this.tableGroup.position.clone() } catch { this._tableBasePos = new THREE.Vector3() }
			}
			const base = this._tableBasePos
			const off = phys.getCabinetOffset?.()
			const acc = phys.getCabinetAcceleration?.()
			const hasOff = off && (Math.abs(off.x) > 1e-4 || Math.abs(off.y) > 1e-4)
			const hasAcc = acc && (Math.abs(acc.x) > 1e-3 || Math.abs(acc.y) > 1e-3)
			if (!hasOff && !hasAcc) {
				if (this.tableGroup.userData._nudgeApplied) {
					this.tableGroup.position.x += (base.x - this.tableGroup.position.x) * 0.15
					this.tableGroup.position.y += (base.y - this.tableGroup.position.y) * 0.15
					if (Math.hypot(this.tableGroup.position.x - base.x, this.tableGroup.position.y - base.y) < 0.01) {
						this.tableGroup.position.x = base.x
						this.tableGroup.position.y = base.y
						this.tableGroup.userData._nudgeApplied = false
					}
				}
				try {
					const wrap = document.getElementById('canvas-wrap')
					if (wrap) wrap.style.transform = ''
				} catch {}
				return
			}
			const ampOff = 110
			const ampAcc = 0.22
			const tx = (off?.x ?? 0) * ampOff + (acc?.x ?? 0) * ampAcc
			const ty = (off?.y ?? 0) * ampOff + (acc?.y ?? 0) * ampAcc
			const scaleX = Math.max(-6, Math.min(6, tx))
			const scaleY = Math.max(-6, Math.min(6, -ty * 0.6))
			this.tableGroup.position.x = base.x + scaleX
			this.tableGroup.position.y = base.y + scaleY
			this.tableGroup.userData._nudgeApplied = true
			try {
				const wrap = document.getElementById('canvas-wrap')
				if (wrap) {
					const shake = Math.hypot(scaleX, scaleY)
					wrap.style.transform = shake > 0.05 ? `translate(${scaleX * 0.6}px, ${scaleY * 0.6}px)` : ''
				}
			} catch {}
		} catch {}
	}

	_nudge(angle, force = 2.6) {
		if (!this.player || this.viewerMode !== 'play' || this.isPaused) return
		try { this.player.nudge(angle, force) } catch {}
		try { this._flashNudge(angle) } catch {}
	}


	_sendKey(code, down) {
		try { down ? this.player.onKeyDown({ code, key: code === 'Enter' ? 'Enter' : 'Shift', ts: Date.now() }) : this.player.onKeyUp({ code, key: code === 'Enter' ? 'Enter' : 'Shift', ts: Date.now() }) } catch {}
		try { if (this._physicsSab) pushInput(this._physicsSab, down ? 1 : 0, code.charCodeAt(0) || 0, Date.now()) } catch {}
	}
	_flashNudge(angle) {
		try {
			const el = document.getElementById('nudge-flash')
			if (!el || this.viewerMode !== 'play') return
			const dir = angle >= 45 && angle < 135 ? 'left' : angle >= 135 && angle < 225 ? 'down' : angle >= 225 && angle < 315 ? 'right' : 'up'
			el.textContent = dir === 'left' ? '‹ NUDGE' : dir === 'right' ? 'NUDGE ›' : dir === 'up' ? '▲ NUDGE' : '▼ NUDGE'
			el.dataset.dir = dir
			el.hidden = false
			el.classList.remove('show')
			void el.offsetWidth
			el.classList.add('show')
			clearTimeout(this._nudgeFlashTimer)
			this._nudgeFlashTimer = setTimeout(() => { try { el.classList.remove('show'); el.hidden = true } catch {} }, 420)
		} catch {}
	}

	hookInput() {
		if (!this.player) return
		if (this._boundKeyDown) removeEventListener('keydown', this._boundKeyDown)
		if (this._boundKeyUp) removeEventListener('keyup', this._boundKeyUp)
		const togglePause = () => {
			this.isPaused = !this.isPaused
			try {
				this.isPaused ? this.player.pause() : this.player.resume()
			} catch {}
			this.log(this.isPaused ? 'Paused (P to resume)' : 'Resumed', this.isPaused ? 'warn' : 'info')
		}
		const send = (e, down) => {
			if (['?', 'h', 'H', 'o', 'O'].includes(e.key)) return
			if (
				(e.key === 'p' || e.key === 'P' || e.code === 'KeyP') &&
				this.viewerMode === 'play' &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.repeat
			) {
				if (!down) return
				togglePause()
				e.preventDefault()
				return
			}
			if ((e.code === 'KeyB' || e.key === 'b' || e.key === 'B') && !e.repeat && down) {
				if (this.viewerMode === 'play' && this.player) {
					this._spawnFallbackBall()
					e.preventDefault()
					return
				}
			}
			if (e.code === 'Escape' && this.viewerMode === 'play') {
				if (down) this._switchToViewer()
				e.preventDefault()
				return
			}
			const ae = aliasEvent(e)
			const ev = ae || { code: e.code, key: e.key, ts: Date.now() }
			try {
				down ? this.player.onKeyDown(ev) : this.player.onKeyUp(ev)
			} catch {}
			try {
				if (this._physicsSab) {
					const kind = down ? 1 : 0
					const keyCode = ev.code ? ev.code.charCodeAt(0) : 0
					pushInput(this._physicsSab, kind, keyCode, ev.ts ?? Date.now())
				}
			} catch {}
			if (
				ae ||
				['Space', 'KeyZ', 'Slash', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Digit1', 'Digit5', 'KeyT'].includes(
					e.code,
				)
			)
				e.preventDefault()
		}
		this._boundKeyDown = e => send(e, true)
		this._boundKeyUp = e => send(e, false)
		addEventListener('keydown', this._boundKeyDown)
		addEventListener('keyup', this._boundKeyUp)
		this.dom.canvas?.addEventListener('click', () => this.dom.canvas.focus())
		if (this.dom.canvas) {
			this.dom.canvas.tabIndex = 0
			try {
				this.dom.canvas.focus()
			} catch {}
			this.dom.canvas.style.touchAction = 'none'
			if (this._touchCleanup) {
				try {
					this._touchCleanup()
				} catch {}
				this._touchCleanup = null
			}
			const active = this._touchMap
			const toCode = (x, y) => {
				const r = this.dom.canvas.getBoundingClientRect()
				const nx = (x - r.left) / r.width
				const ny = (y - r.top) / r.height
				return nx > 0.65 && ny > 0.55 ? 'Enter' : nx < 0.5 ? 'ShiftLeft' : 'ShiftRight'
			}
			const down = (id, code) => {
				if (active.has(id) || this.viewerMode !== 'play' || !this.player) return
				active.set(id, code); this._sendKey(code, true)
			}
			const up = id => {
				const code = active.get(id)
				if (!code) return
				active.delete(id); this._sendKey(code, false)
			}
			const onDown = e => {
				if (e.pointerType === 'touch') return
				if (e.pointerType === 'mouse' && e.button !== 0) return
				down(e.pointerId, toCode(e.clientX, e.clientY))
				if (this.viewerMode === 'play') e.preventDefault()
				try {
					this.dom.canvas.setPointerCapture(e.pointerId)
				} catch {}
			}
			const onUp = e => {
				if (e.pointerType === 'touch') return
				up(e.pointerId)
				if (this.viewerMode === 'play') e.preventDefault()
				try {
					this.dom.canvas.releasePointerCapture(e.pointerId)
				} catch {}
			}
			const onCancel = e => {
				if (e.pointerType !== 'touch') up(e.pointerId)
			}
			const touchStarts = new Map()
			const onTouchStart = e => {
				for (const t of e.changedTouches) {
					touchStarts.set(t.identifier + 1000, { x: t.clientX, y: t.clientY, t: performance.now() })
					down(t.identifier + 1000, toCode(t.clientX, t.clientY))
				}
			}
			const onTouchEnd = e => {
				for (const t of e.changedTouches) {
					const id = t.identifier + 1000
					const st = touchStarts.get(id)
					if (st) {
						const dx = t.clientX - st.x
						const dy = t.clientY - st.y
						const dt = performance.now() - st.t
						touchStarts.delete(id)
						if (dt < 600 && Math.hypot(dx, dy) > 50) {
							try { up(id) } catch {}
							const ang = swipeNudge(dx, dy)
							if (ang !== null) { this._nudge(ang, ang === NUDGE.back ? 2.0 : NUDGE.force); continue }
						}
					}
					up(id)
				}
			}
			const onContext = e => {
				if (this.viewerMode === 'play') e.preventDefault()
			}
			this.dom.canvas.addEventListener('pointerdown', onDown)
			this.dom.canvas.addEventListener('pointerup', onUp)
			this.dom.canvas.addEventListener('pointercancel', onCancel)
			this.dom.canvas.addEventListener('touchstart', onTouchStart, { passive: true })
			this.dom.canvas.addEventListener('touchend', onTouchEnd, { passive: true })
			this.dom.canvas.addEventListener('touchcancel', onTouchEnd, { passive: true })
			this.dom.canvas.addEventListener('contextmenu', onContext)
			this._touchCleanup = () => {
				this.dom.canvas.removeEventListener('pointerdown', onDown)
				this.dom.canvas.removeEventListener('pointerup', onUp)
				this.dom.canvas.removeEventListener('pointercancel', onCancel)
				this.dom.canvas.removeEventListener('touchstart', onTouchStart)
				this.dom.canvas.removeEventListener('touchend', onTouchEnd)
				this.dom.canvas.removeEventListener('touchcancel', onTouchEnd)
				this.dom.canvas.removeEventListener('contextmenu', onContext)
			}
		}
		this._setupNudgeInput()
	}
	_setupNudgeInput() {
		try { if (this._nudgeCleanup) this._nudgeCleanup() } catch {}
		this._nudgeCleanup = null
		const cleanups = []
		const trigger = (angle, force = 2.6) => this._nudge(angle, force)
		const pad = document.getElementById('nudge-pad')
		if (pad) {
			pad.hidden = false
			const handler = e => {
				const dir = e.currentTarget?.dataset?.nudge
				if (dir === 'left') trigger(NUDGE.left, 2.8)
				else if (dir === 'right') trigger(NUDGE.right, 2.8)
				else if (dir === 'center' || dir === 'up') trigger(NUDGE.forward, 2.8)
				e.preventDefault()
			}
			for (const btn of pad.querySelectorAll('[data-nudge]')) {
				btn.addEventListener('touchstart', handler, { passive: false })
				btn.addEventListener('mousedown', handler)
				cleanups.push(() => {
					btn.removeEventListener('touchstart', handler)
					btn.removeEventListener('mousedown', handler)
				})
			}
		}
		const canvas = this.dom.canvas
		if (canvas) {
			let startX = 0, startY = 0, startT = 0, activeId = null
			const onPtrDown = e => {
				if (e.pointerType === 'touch' || e.button !== 2) return
				startX = e.clientX; startY = e.clientY; startT = performance.now(); activeId = e.pointerId
			}
			const onPtrUp = e => {
				if (activeId !== e.pointerId) return
				const dx = e.clientX - startX, dy = e.clientY - startY, dt = performance.now() - startT
				activeId = null
				if (dt > 600 || Math.hypot(dx, dy) < 45) return
				const ang = swipeNudge(dx, dy)
				if (ang !== null) trigger(ang, ang === NUDGE.back ? 1.8 : 2.5)
			}
			canvas.addEventListener('pointerdown', onPtrDown)
			canvas.addEventListener('pointerup', onPtrUp)
			cleanups.push(() => {
				canvas.removeEventListener('pointerdown', onPtrDown)
				canvas.removeEventListener('pointerup', onPtrUp)
			})
			// touch swipe handled in hookInput (unified)
		}
		let lastShake = 0
		const onMotion = e => {
			const acc = e.accelerationIncludingGravity || e.acceleration
			if (!acc) return
			const mag = Math.hypot(acc.x ?? 0, acc.y ?? 0, acc.z ?? 0)
			if (mag < 18) return
			const now = performance.now()
			if (now - lastShake < 700) return
			lastShake = now
			const ang = (acc.x ?? 0) > 0 ? 285 : 75
			trigger(ang, 3.0)
		}
		let motionActive = false
		try {
			if (typeof DeviceMotionEvent !== 'undefined' && 'requestPermission' in DeviceMotionEvent) {
				const btn = document.getElementById('enable-motion')
				if (btn) {
					btn.hidden = false
					btn.onclick = async () => {
						try {
							const perm = await DeviceMotionEvent.requestPermission()
							if (perm === 'granted') {
								addEventListener('devicemotion', onMotion)
								motionActive = true
								btn.hidden = true
								this.log('Motion nudge enabled', 'info')
							}
						} catch {}
					}
				}
			} else {
				addEventListener('devicemotion', onMotion)
				motionActive = true
			}
		} catch {}
		cleanups.push(() => {
			if (motionActive) removeEventListener('devicemotion', onMotion)
		})
		let gpRaf = 0
		let lastGP = 0
		const pollGP = () => {
			try {
				const gps = navigator.getGamepads?.()
				if (gps) {
					for (const gp of gps) {
						if (!gp) continue
						const now = performance.now()
						if (now - lastGP < 180) continue
						let ang = null
						if (gp.buttons[4]?.pressed) ang = 75
						else if (gp.buttons[5]?.pressed) ang = 285
						else if (gp.buttons[0]?.pressed || gp.buttons[2]?.pressed) ang = 0
						if (ang !== null) { trigger(ang, 2.8); lastGP = now }
						const ax0 = gp.axes[0] ?? 0
						const ax1 = gp.axes[1] ?? 0
						if (Math.abs(ax0) > 0.85 || Math.abs(ax1) > 0.85) {
							if (now - lastGP < 300) continue
							if (Math.abs(ax0) > Math.abs(ax1)) trigger(ax0 < 0 ? 75 : 285, 2.5)
							else trigger(ax1 < 0 ? 0 : 180, 2.2)
							lastGP = now
						}
					}
				}
			} catch {}
			gpRaf = requestAnimationFrame(pollGP)
		}
		gpRaf = requestAnimationFrame(pollGP)
		cleanups.push(() => cancelAnimationFrame(gpRaf))
		this._nudgeCleanup = () => { for (const fn of cleanups) try { fn() } catch {} }
	}
}

export function createViewer(opts) {
	return new Viewer(opts)
}
