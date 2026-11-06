/* Copyright (C) 2026 The VPX-JS Authors. Released under GPL-3.0-or-later. */

import type { BufferGeometry, Object3D, PointLight } from 'three/webgpu'
import { isPlayfieldDecoyName } from '../../dist-esm/lib/render/threejs/scene-classify.js'
import type { ThreeRenderApi } from '../../dist-esm/lib/render/threejs/three-render-api.js'
import { Ball } from '../../dist-esm/lib/vpt/ball/ball.js'
import { BallData } from '../../dist-esm/lib/vpt/ball/ball-data.js'
import { BallState } from '../../dist-esm/lib/vpt/ball/ball-state.js'
import type { PlungerData } from '../../dist-esm/lib/vpt/plunger/plunger-data.js'
import { PlungerMeshGenerator } from '../../dist-esm/lib/vpt/plunger/plunger-mesh-generator.js'
import type { Table } from '../../dist-esm/lib/vpt/table/table.js'
import type { HeadlessEngine, WasmBufferKind } from '../../dist-esm/lib/wasm/vpinball-wasm.js'
import {
	HeadlessEngineMissingError,
	loadHeadlessEngine,
	romMountFileName,
	WASM_STRIDES,
} from '../../dist-esm/lib/wasm/vpinball-wasm.js'
import type { BallSlot, PartSlot, SyncCounts, SyncScene } from '../../dist-esm/lib/wasm/wasm-scene-sync.js'
import { WasmSceneSync } from '../../dist-esm/lib/wasm/wasm-scene-sync.js'

/** Scene hooks the WASM engine adapter needs from the viewer. */
export interface WasmEngineHost {
	readonly renderApi: ThreeRenderApi
	readonly table: Table
	readonly ballsGroup: Object3D
	lookupPart(name: string): PartSlot<Object3D> | undefined
	lookupPlunger(name: string): PlungerData | undefined
}

export interface WasmEngineLoad {
	/** Table bytes, already fetched. */
	vpxBytes: Uint8Array
	/** Optional `.zip` ROM override for PinMAME games. */
	rom?: { name: string; zip: Uint8Array }
}

/** Error thrown when the caller forced `?engine=wasm` but the WASM engine failed to start. */
export class WasmEngineStartError extends Error {}

/** The instance whose table is loaded in the shared engine module. */
let session: WasmEngine | undefined

/** Shared empty view for missing engine buffers (avoids per-frame garbage). */
const EMPTY_VIEW = new Float32Array(0)

/**
 * Packed DMD bytes to dots-per-byte. Gray frames pass through; packed RGB
 * (3 bytes/dot) and RGBA (4 bytes/dot) triplets average to one dot, alpha
 * ignored. Anything else is a future layout: reject, don't misdecode.
 */
function toDots(bytes: Uint8Array, width: number, height: number): Uint8Array | undefined {
	const dots = width * height
	if (bytes.length === dots) return bytes
	const per = bytes.length === dots * 3 ? 3 : bytes.length === dots * 4 ? 4 : 0
	if (!per) return undefined
	const out = new Uint8Array(dots)
	for (let i = 0; i < dots; i++) out[i] = Math.round((bytes[i * per] + bytes[i * per + 1] + bytes[i * per + 2]) / 3)
	return out
}

/**
 * Audible gain from a 0..1 user level and the mute flag. Out-of-range and
 * non-numeric levels silence instead of throwing or wrapping.
 */
export function effectiveGain(volume: number, muted: boolean): number {
	if (muted) return 0
	if (!Number.isFinite(volume)) return 0
	return Math.min(1, Math.max(0, volume))
}

/**
 * Headless-WASM engine adapter: loads a table into `vpinball-headless`, steps it
 * in the viewer's rAF loop, and fan-outs typed-array rows through `WasmSceneSync`
 * onto the existing three.js scene. Input and ROMs route to the bridge.
 */
export class WasmEngine {
	private readonly liveBalls = new Map<number, BallSlot<Object3D>>()
	private readonly partNames = new Map<number, string>()
	/** Plunger animation frame count per part index, resolved on first use. */
	private readonly plungerFrames = new Map<number, number>()
	private sync?: WasmSceneSync<Object3D, BufferGeometry, PointLight>
	private engine?: HeadlessEngine
	private ballsVisible = true
	private destroyed = false
	private audioCtx?: AudioContext
	private audioGain?: GainNode
	private _muted = false
	private _volume = 1
	// The engine boots with table-seeded bus volumes; push ours only after
	// the user touches a control, so a first gesture never snaps the mix.
	private _audioLevelDirty = false
	private audioRate = 0
	private audioChannels = 0
	private audioNextStart = 0
	private audioFailed = false
	private dmdCache?: { frameId: number; frame: Uint8Array; width: number; height: number }
	private audioGestureAbort?: AbortController
	/**
	 * Host-owned game clock (game epoch, ms). Each rAF tick advances it by
	 * the tick's own wall delta (one stepFrame per tick), so game time tracks
	 * the wall at any refresh rate. Physics keeps its own wall clock inside
	 * the bridge (its epoch starts at process time, so host-epoch targets
	 * would starve it); script and PinMAME follow the host epoch instead, so
	 * draining buffered debt fast-forwards them (up to 8x) while physics runs
	 * realtime — replay, not slow motion. The real physics spiral guard is
	 * upstream's anti-hung skip (PhysicsEngine.cpp:535-539); the host cap
	 * below only bounds per-tick bridge work.
	 */
	private gameMs = 0
	private debtMs = 0
	private lastStepWallMs = 0
	/** Max game-time advance per rAF: bounds bridge work so a stall cannot spiral. */
	private static readonly maxAdvanceMs = (8 * 1000) / 60
	/** Debt older than this is dropped: game time lags the wall, never freezes. */
	private static readonly maxDebtMs = 500

	constructor(private readonly host: WasmEngineHost) {}

	/** Load WASM bytes, mount the ROM (if any), and load the table. */
	async load({ vpxBytes, rom }: WasmEngineLoad): Promise<void> {
		// Fresh table, fresh game epoch (also covers instance reuse: drop the
		// previous table's part names, cached DMD frame, and scene sync; the
		// bridge's LoadTable replaces the previous table itself).
		this.gameMs = 0
		this.debtMs = 0
		this.lastStepWallMs = 0
		this.partNames.clear()
		this.plungerFrames.clear()
		this.dmdCache = undefined
		this.liveBalls.clear()
		this.resetAudioFormat()
		this.sync = undefined
		// Page-relative so subpath deploys work: document.baseURI resolves
		// against the page, unlike a module-relative URL under `/@fs/`. The
		// module is shared page-wide; this instance owns its table from here.
		this.engine = await loadHeadlessEngine(new URL('wasm/vpinball-headless.js', document.baseURI).href)
		session = this
		const pending = window as unknown as { __pendingRom?: Uint8Array; __pendingRomName?: string }
		// PinMAME resolves the zip by the script's game name, not the file basename.
		const script = this.host.table.tableScript
		if (rom) {
			this.engine.mountRom(romMountFileName(script, rom.name), rom.zip)
		} else if (pending.__pendingRom?.length && pending.__pendingRomName) {
			this.engine.mountRom(romMountFileName(script, pending.__pendingRomName), pending.__pendingRom)
		}
		await this.engine.loadTable(vpxBytes)
		for (const part of this.readCatalog()) {
			if (typeof part.idx === 'number' && typeof part.name === 'string') this.partNames.set(part.idx, part.name)
		}
		// The generated base slab carries the playfield, so the parsed table
		// force-hides the authored collision mesh (see forceHidePlayfieldMesh);
		// the live engine still reports it visible, which would cover the base
		// with a white quad. Resolved once here so the per-frame policy stays a lookup.
		const hiddenDecoys = new Set<number>()
		for (const [idx, name] of this.partNames) {
			if (isPlayfieldDecoyName(name) && this.host.table?.primitives?.[name]) hiddenDecoys.add(idx)
		}
		this.sync = new WasmSceneSync<Object3D, BufferGeometry, PointLight>(
			this.scene(),
			this.balls(),
			this.host.renderApi,
			this.host.table,
			// See WasmSyncPolicy.
			{
				neverShow: idx => hiddenDecoys.has(idx),
				// Script `Flasher.ImageA` swaps (digit-flasher score tables)
				// move no numeric column, so every slotted flasher pays one
				// WASM string-bridge call per frame while this is installed.
				flasherImage: idx => this.engine?.getFlasherImage(idx),
			},
		)
	}

	/** The bridge's part catalog; a malformed one fails the start with a clear reason. */
	private readCatalog(): { idx: unknown; name: unknown }[] {
		const json = this.engine?.getPartCatalogJson() || '[]'
		let catalog: unknown
		try {
			catalog = JSON.parse(json)
		} catch (e) {
			throw new WasmEngineStartError(`Part catalog is not valid JSON (${e?.message ?? e}): ${json.slice(0, 120)}`)
		}
		if (!Array.isArray(catalog)) throw new WasmEngineStartError('Part catalog is not a JSON array')
		return catalog
	}

	/** Forget the previous table's PCM format: the next one may run at another rate. */
	private resetAudioFormat(): void {
		this.audioRate = 0
		this.audioChannels = 0
	}

	get ready(): boolean {
		return !!this.engine && !!this.sync && !this.destroyed
	}

	get ballCount(): number {
		return this.liveBalls.size
	}

	/**
	 * Harness read-only: live flipper angles. Public so harnesses never
	 * reach into the sync layer's private row snapshots.
	 */
	public flipperAngles(): { partIdx: number; angle: number }[] {
		return this.sync?.flipperAngles() ?? []
	}

	/**
	 * Harness read-only: live ball poses in engine units. Public so
	 * harnesses never reach into the sync layer's private row snapshots.
	 */
	public ballPoses(): { id: number; x: number; y: number; z: number }[] {
		return this.sync?.ballPoses() ?? []
	}

	/** Harness read-only: cumulative applied light-row changes (boot/activity signal). */
	public get lightActivity(): number {
		return this.sync?.lightActivity ?? 0
	}

	get catalogSize(): number {
		return this.partNames.size
	}

	partName(idx: number): string | undefined {
		return this.partNames.get(idx)
	}

	get scriptErrorCount(): number {
		return this.engine?.getScriptErrorCount() ?? 0
	}

	get muted(): boolean {
		return this._muted
	}

	get volume(): number {
		return this._volume
	}

	/** Mute switch for the sound button/shortcut; returns the new state. */
	setMuted(muted: boolean): void {
		this._muted = muted
		this._audioLevelDirty = true
		this.applyAudioLevel()
	}

	toggleMuted(): boolean {
		this.setMuted(!this._muted)
		return this._muted
	}

	/**
	 * User level 0..1 (slider percent / 100), clamped. A nonzero level
	 * unmutes, matching slider UX.
	 */
	setVolume(volume: number): void {
		this._volume = effectiveGain(volume, false)
		if (this._volume > 0) this._muted = false
		this._audioLevelDirty = true
		this.applyAudioLevel()
	}

	/**
	 * Push the current mute/level to both outputs: the WebAudio gain (PinMAME
	 * ROM ring) and the engine's own SDL path (table script sounds). The
	 * engine push waits for an explicit user control so table-seeded bus
	 * volumes survive until the user touches mute or volume.
	 */
	private applyAudioLevel(): void {
		if (this.audioGain && this.audioCtx) this.audioGain.gain.value = effectiveGain(this._volume, this._muted)
		if (this._audioLevelDirty) this.engine?.setAudioLevel(effectiveGain(this._volume, false), this._muted)
	}

	/**
	 * PinMAME ROM audio: create/resume the output context. Browsers start it
	 * suspended until a user gesture; call from pointer/key handlers only —
	 * never from the frame pump, so a missing gesture can't conjure contexts
	 * (browsers cap them) or burn construction exceptions per frame.
	 */
	resumeAudio(): void {
		if (this.audioFailed) return
		try {
			const wasRunning = this.audioCtx?.state === 'running'
			this.audioCtx ??= new AudioContext()
			if (this.audioCtx.state === 'suspended') void this.audioCtx.resume()
			if (!this.audioGain) {
				this.audioGain = this.audioCtx.createGain()
				this.audioGain.connect(this.audioCtx.destination)
			}
			this.applyAudioLevel()
			// Fresh-start only: drop the pre-gesture ring backlog (up to 4 s)
			// so playback starts live. Never flush a running context: that
			// would drop audible audio.
			if (!wasRunning) this.engine?.getAudio()
		} catch {
			this.audioFailed = true
			this.audioCtx = undefined
			this.audioGain = undefined
		}
	}

	/** Drain one PCM frame from the bridge ring into scheduled WebAudio output. */
	private pumpAudio(): void {
		const engine = this.engine
		if (!engine) return
		const info = engine.getAudioInfo()
		if (info.sampleRate > 0) {
			this.audioRate = info.sampleRate
			this.audioChannels = info.channels
		}
		if (!this.audioRate) return
		const ctx = this.audioCtx
		if (!ctx || ctx.state !== 'running') return
		// Drain only when the output runs: pre-gesture frames would be copied
		// out of the ring and dropped. The ring keeps the newest audio (oldest
		// drops on overflow); the gesture path flushes the backlog so the first
		// scheduled chunk is live, not stale.
		const frame = engine.getAudio()
		if (!frame || !frame.samples.length) return
		const channels = Math.min(2, Math.max(1, frame.channels || this.audioChannels || 1))
		const frames = Math.floor(frame.samples.length / channels)
		if (frames < 1) return
		try {
			const out = ctx.createBuffer(channels, frames, this.audioRate)
			for (let c = 0; c < channels; c++) {
				const dst = out.getChannelData(c)
				for (let i = 0; i < frames; i++) dst[i] = (frame.samples[i * channels + c] ?? 0) / 32768
			}
			const src = ctx.createBufferSource()
			src.buffer = out
			src.connect(this.audioGain ?? ctx.destination)
			// Back-to-back scheduling: chunks longer than the step gap would
			// otherwise overlap, and input double-steps would pile up. Drop
			// backlog past half a second so a stall can't queue a tail.
			if (this.audioNextStart < ctx.currentTime) this.audioNextStart = ctx.currentTime
			if (this.audioNextStart - ctx.currentTime > 0.5) this.audioNextStart = ctx.currentTime
			src.start(this.audioNextStart)
			this.audioNextStart += out.duration
		} catch {
			// A scheduling fault must not kill the rAF callback; the next
			// frame drains again. Persistent failure is the gesture path's
			// problem, surfaced via resumeAudio.
		}
	}

	/**
	 * Latest DMD frame as flat bytes for the on-table/backglass presenters.
	 * Float luminance frames quantize to bytes (clamped, not wrapped); the
	 * descriptor's own `frameId` drives the present cadence (no game-time
	 * ABI exists). Converted bytes are cached per frameId: the presenters
	 * read this getter more than once per tick.
	 */
	get dmdFrame(): { frame: Uint8Array; width: number; height: number; frameId: number } | undefined {
		const desc = this.engine?.getDmdFrame()
		if (!desc || !desc.width || !desc.height) return undefined
		const cached = this.dmdCache
		if (cached && cached.frameId === desc.frameId && cached.width === desc.width && cached.height === desc.height)
			return cached
		const raw = desc.pixels
		const pixels =
			raw instanceof Uint8Array
				? toDots(raw, desc.width, desc.height)
				: Uint8Array.from(raw, (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255))
		if (!pixels || pixels.length < desc.width * desc.height) return undefined
		const frame = { frame: pixels, width: desc.width, height: desc.height, frameId: desc.frameId }
		this.dmdCache = frame
		return frame
	}

	setBallsVisible(visible: boolean): void {
		this.ballsVisible = visible
		this.host.ballsGroup.visible = visible
	}

	pushKey(scancode: number, down: boolean): void {
		this.engine?.pushKey(scancode, down)
	}

	nudge(angleDeg: number, force: number): void {
		this.engine?.nudge(angleDeg, force)
	}

	/**
	 * Rebase the wall baseline without adding debt: call while paused (the
	 * rAF loop skips stepping then) so resume continues from now instead of
	 * bursting catch-up steps for the paused interval.
	 */
	resetStepClock(nowMs: number): void {
		if (!Number.isFinite(nowMs)) return
		this.lastStepWallMs = nowMs
		this.debtMs = 0
	}

	/** Step one frame and sync scene state. Returns changed lamp names for the lightmap cache. */
	step(nowMs: number): { changedLights: string[]; counts?: SyncCounts } {
		const engine = this.engine
		if (!engine || !this.sync) return { changedLights: [] }
		// Continuous-time advance: one stepFrame per rAF carries the tick's own
		// wall delta (see the gameMs field comment for the drain semantics).
		// A non-finite timestamp carries no wall information, so it must not
		// touch debt either — otherwise a NaN tick would spend banked catch-up.
		if (Number.isFinite(nowMs)) {
			if (this.lastStepWallMs === 0) this.lastStepWallMs = nowMs
			const wallDelta = nowMs - this.lastStepWallMs
			this.lastStepWallMs = nowMs
			this.debtMs = Math.min(this.debtMs + Math.max(wallDelta, 0), WasmEngine.maxDebtMs)
			const advance = Math.min(this.debtMs, WasmEngine.maxAdvanceMs)
			if (advance > 0) {
				this.gameMs += advance
				this.debtMs -= advance
				engine.stepFrame(this.gameMs)
			}
		}
		const read = (kind: WasmBufferKind): Float32Array => engine.getBuffer(kind)?.view ?? EMPTY_VIEW
		const buffers = {
			balls: read('balls'),
			movers: read('movers'),
			lights: read('lights'),
			prims: read('prims'),
			flashers: read('flashers'),
		}
		const counts = this.sync.syncAll(buffers)
		this.pumpAudio()
		// The sync already visited every light row and knows which col-1
		// intensities changed; map those straight to names instead of
		// re-walking the buffer here.
		const changedLights: string[] = []
		for (const partIdx of counts.changedLightParts) {
			const name = this.partNames.get(partIdx)
			if (name) changedLights.push(name)
		}
		return { changedLights, counts }
	}

	/** Prime the audio context on first user gesture (autoplay policy). */
	primeAudioOnGesture(): void {
		this.audioGestureAbort?.abort()
		const abort = new AbortController()
		this.audioGestureAbort = abort
		const prime = (): void => this.resumeAudio()
		window.addEventListener('pointerdown', prime, { signal: abort.signal })
		window.addEventListener('keydown', prime, { signal: abort.signal })
	}

	async destroy(): Promise<void> {
		this.destroyed = true
		this.audioGestureAbort?.abort()
		this.audioGestureAbort = undefined
		if (this.audioCtx) void this.audioCtx.close().catch(() => {})
		this.audioCtx = undefined
		this.audioFailed = false
		this.audioNextStart = 0
		this.resetAudioFormat()
		this.dmdCache = undefined
		for (const id of [...this.liveBalls.keys()]) this.balls().remove(id)
		this.liveBalls.clear()
		this.partNames.clear()
		this.plungerFrames.clear()
		this.sync = undefined
		// A superseded instance must not tear down its successor's table.
		if (session === this) {
			session = undefined
			await this.engine?.destroyTable()
		}
		this.engine = undefined
	}

	private scene(): SyncScene<Object3D> {
		return {
			part: (partIdx: number) => {
				const name = this.partNames.get(partIdx)
				return name ? this.host.lookupPart(name) : undefined
			},
			plungerFrameCount: (partIdx: number): number => {
				const cached = this.plungerFrames.get(partIdx)
				if (cached !== undefined) return cached
				const name = this.partNames.get(partIdx)
				const data = name ? this.host.lookupPlunger(name) : undefined
				const frames: number = data ? new PlungerMeshGenerator(data).cFrames : 1
				this.plungerFrames.set(partIdx, frames)
				return frames
			},
		}
	}

	private balls() {
		return {
			get: (id: number) => this.liveBalls.get(id),
			spawn: (id: number, radius: number, color: number): BallSlot<Object3D> => {
				const existing = this.liveBalls.get(id)
				if (existing) return existing
				const data = new BallData(radius)
				data.color = color
				const state = new BallState()
				state.name = `Ball${id}`
				const ball = new Ball(id, data, state)
				const meshes = ball.getMeshes(this.host.table)
				const obj = this.host.renderApi.createParentNode(`Ball${id}`)
				for (const mesh of Object.values(meshes)) obj.add(this.host.renderApi.createMesh(mesh))
				obj.visible = this.ballsVisible
				this.host.ballsGroup.add(obj)
				const slot: BallSlot<Object3D> = { obj, state, updater: ball.getUpdater() }
				this.liveBalls.set(id, slot)
				return slot
			},
			remove: (id: number): void => {
				const ball = this.liveBalls.get(id)
				if (!ball) return
				this.host.ballsGroup.remove(ball.obj)
				this.liveBalls.delete(id)
			},
		}
	}
}

export { HeadlessEngineMissingError, WASM_STRIDES }
