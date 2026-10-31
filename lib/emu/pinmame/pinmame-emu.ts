// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IEmulator } from '../../game/iemulator.js'
import { Vertex2D } from '../../math/vector.js'
import { logger } from '../../util/logger.js'
import { EmulatorMessageQueue, MessageType, switchMessageType } from '../emulator-message-queue.js'
import { EmulatorState } from '../emulator-state.js'
import { warnOnce } from '../warn-once.js'
import { createPinmameModule, resetPinmameModuleCache } from './pinmame-loader.js'
import type { PinmameModule } from './pinmame-module.js'

// VPM default DMD size, used until the core reports real dimensions.
const FALLBACK_DMD = new Vertex2D(128, 32)
// PinMAME reads a fixed 1 KiB config struct from the given pointer.
const CONFIG_SIZE = 1024
const VPM_DIR = '/pinmame/'
// Mixer rate PinMAME resamples its audio to (Hz).
const SAMPLE_RATE = 44100
// Largest DMD frame accepted from the wasm core (1 MiB). Real DMDs are at
// most a few dozen KiB; anything bigger is a corrupt width/height pair and
// must not reach _malloc.
const MAX_DMD_BYTES = 1 << 20
// Largest single audio drain from the wasm core: one full mixer
// accumulator (PINMAME_ACCUMULATOR_SAMPLES) of per-channel frames.
const MAX_AUDIO_FRAMES = 8192
// Full LED display/segment mask for the segment pull (CORE_SEGCOUNT LEDs).
const LED_MASK_ALL = 0xffffffffffffffffn

type Api = {
	setConfig(p: number): void
	run(p: number): number
	isRunning(): number
	// Optional: only present when the wasm build exports PinmameStop.
	stop?(): void
	setSwitch(n: number, v: number): void
	getSwitch(n: number): number
	getChangedLamps(p: number): number
	getChangedSols(p: number): number
	getChangedGIs(p: number): number
	// PinmameGetChangedLEDs(mask, mask2, out). The build passes i64 masks
	// as BigInt, which cwrap cannot forward, so this is bound to a closure
	// below. Optional like setCabinetInput so older builds stay silent.
	getChangedLEDs?(p: number): number
	getAudioFrame?(p: number, max: number): number
	getAudioChannels?(): number
	getAudioSeq?(): number
	getDIP(b: number): number
	setDIP(b: number, v: number): void
	getDmdWidth(): number
	getDmdHeight(): number
	getDmdFrame(p: number): number
	getSolMask(low: number): number
	setSolMask(low: number, mask: number): void
	// Optional: only present when the wasm build exports PinmameSetCabinetInput.
	setCabinetInput?(v: number): void
}

const gameName = (v: string | { name?: string; pinmame?: { name?: string } }) =>
	typeof v === 'string' ? v : (v.pinmame?.name ?? v.name ?? '')

// Byte identity for same-length cached ROM zips.
function romBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
	return true
}

export class PinMameEmulator implements IEmulator {
	readonly emulatorState = new EmulatorState()
	private readonly queue = new EmulatorMessageQueue()

	private mod: PinmameModule | null = null
	private api: Api | null = null
	public isMock = false
	private ready = false
	private paused = false
	private game: string = ''
	// Single-flight guards: init races the module import, and concurrent
	// loadGame calls race the isRunning check — serialize both.
	private initPromise: Promise<void> | null = null
	private loadPromise: Promise<void> | null = null
	// Module-global tracking: the wasm core runs at most one game, shared by
	// every instance, so in-flight and ownership guards must span instances.
	// loadingGame names the game currently inside doLoadGame; activeGame the
	// last game whose PinmameRun returned OK and was never stopped.
	private static loadingGame: string | null = null
	private static activeGame = ''
	// Set immediately before api.run: a later failure with this flag means
	// our run may have left native state behind, so cleanup must stop it.
	private attemptedRun = false

	private readonly lamps = new Uint8Array(1024)
	private readonly sols = new Uint8Array(128)
	private readonly gis = new Uint8Array(32)
	private readonly mockSwitches = new Map<number, number>()
	private readonly solMasks = new Map<number, number>()
	private readonly pendingSwitches = new Map<number, number>()
	// Last good DMD size from pullDmd; getDmdDimensions hands out a fresh
	// copy so callers can't mutate shared state. Read x/y.
	private dmdW = FALLBACK_DMD.x
	private dmdH = FALLBACK_DMD.y
	// Scratch buffers pooled across frames to avoid per-sync _malloc churn.
	// The pull slot is shared: lamp/sol/GI pulls run sequentially (never
	// concurrently), each writing 8-byte (i32 index, i32 value) pairs. Sizes
	// below are bytes: the slot grows on demand to the largest pull (1024
	// lamps = 8 KiB). The DMD slot is separate so frame-sized buffers don't
	// thrash against pull pages when resolutions differ from the 128x32 fallback.
	private readonly wasmBufs: Record<'pull' | 'dmd' | 'audio', { ptr: number; cap: number; min: number }> = {
		pull: { ptr: 0, cap: 0, min: 1024 },
		dmd: { ptr: 0, cap: 0, min: 4096 },
		audio: { ptr: 0, cap: 0, min: MAX_AUDIO_FRAMES * 2 },
	}
	private _dmdFrameBuf: Uint8Array | null = null
	// Pooled output; borrowed, not owned (see pullAudio).
	private readonly _audioPcm = new Float32Array(MAX_AUDIO_FRAMES)
	// Single listener slot: last writer wins instead of stacking streams.
	private audioConsumer: ((msg: unknown) => void) | null = null

	async init(): Promise<void> {
		if (this.mod) return
		if (!this.initPromise) {
			this.initPromise = this.doInit().catch(e => {
				this.initPromise = null
				throw e
			})
		}
		await this.initPromise
	}

	private async doInit(): Promise<void> {
		const { module, isMock } = await createPinmameModule()
		this.mod = module
		this.isMock = isMock
		if (isMock) {
			logger().warn('[pinmame] mock — physics only, run npm run build:wasm')
			return
		}
		const wrap = (id: string, ret: string | null, args: string[]): any => module.cwrap(id, ret, args)
		this.api = {
			setConfig: wrap('PinmameSetConfig', null, ['number']),
			run: wrap('PinmameRun', 'number', ['number']),
			isRunning: wrap('PinmameIsRunning', 'number', []),
			setSwitch: wrap('PinmameSetSwitch', null, ['number', 'number']),
			getSwitch: wrap('PinmameGetSwitch', 'number', ['number']),
			getChangedLamps: wrap('PinmameGetChangedLamps', 'number', ['number']),
			getChangedSols: wrap('PinmameGetChangedSolenoids', 'number', ['number']),
			getChangedGIs: wrap('PinmameGetChangedGIs', 'number', ['number']),
			getDIP: wrap('PinmameGetDIP', 'number', ['number']),
			setDIP: wrap('PinmameSetDIP', null, ['number', 'number']),
			getDmdWidth: wrap('PinmameGetDmdWidth', 'number', []),
			getDmdHeight: wrap('PinmameGetDmdHeight', 'number', []),
			getDmdFrame: wrap('PinmameGetDmdFrame', 'number', ['number']),
			getSolMask: wrap('PinmameGetSolenoidMask', 'number', ['number']),
			setSolMask: wrap('PinmameSetSolenoidMask', null, ['number', 'number']),
		}
		// PinmameSetCabinetInput is not in PINMAME_EXPORTS yet — wire it only
		// when a (future) wasm build provides it, so cwrap never wraps a hole.
		if (typeof (module as unknown as Record<string, unknown>)._PinmameSetCabinetInput === 'function') {
			this.api.setCabinetInput = wrap('PinmameSetCabinetInput', null, ['number'])
		}
		// Same for PinmameStop: without it, failure cleanup can only abandon
		// the poisoned module instance (see stopNative).
		if (typeof (module as unknown as Record<string, unknown>)._PinmameStop === 'function') {
			this.api.stop = wrap('PinmameStop', null, [])
		}
		// Segment-display LEDs ship in every current build; the guard keeps
		// older builds (and the mock) on the empty lane instead of binding
		// a hole. The pull below always uses full masks — VPM's masks only
		// narrow what a script read reports, and the scripts pass full masks.
		if (typeof (module as unknown as Record<string, unknown>)._PinmameGetChangedLEDs === 'function') {
			const raw = (module as unknown as { _PinmameGetChangedLEDs(m1: bigint, m2: bigint, p: number): number })
				._PinmameGetChangedLEDs
			this.api.getChangedLEDs = (p: number) => raw.call(module, LED_MASK_ALL, LED_MASK_ALL, p)
		}
		// PinmameGetAudioFrame/Channels/Seq ship in audio-polling wasm builds —
		// wire them only when present so older builds (and the mock) stay
		// silent instead of wrapping a hole.
		if (typeof (module as unknown as Record<string, unknown>)._PinmameGetAudioFrame === 'function') {
			this.api.getAudioFrame = wrap('PinmameGetAudioFrame', 'number', ['number', 'number'])
			this.api.getAudioChannels = wrap('PinmameGetAudioChannels', 'number', [])
			this.api.getAudioSeq = wrap('PinmameGetAudioSeq', 'number', [])
		}
	}

	async loadGame(name: string | { name?: string; pinmame?: { name?: string } }, rom: Uint8Array): Promise<void> {
		// Serialize loads: the isRunning check below is check-then-act, so two
		// concurrent loads could both start a run. Failures don't jam the
		// chain — the catch lets the next load proceed while still rejecting
		// the caller that failed. A second load racing an in-flight one fails
		// fast inside doLoadGame instead of reaching the wasm ALREADY_RUNNING.
		const run = (this.loadPromise ?? Promise.resolve()).catch(() => {}).then(() => this.doLoadGame(name, rom))
		this.loadPromise = run
		await run
	}

	private async doLoadGame(
		name: string | { name?: string; pinmame?: { name?: string } },
		rom: Uint8Array,
	): Promise<void> {
		const game = gameName(name)
		if (!game) throw new Error('PINMAME_GAME_NAME_MISSING')
		// Cross-instance fail-fast: the native core is module-global, so the
		// per-instance chain above cannot serialize two instances racing one
		// core — the loser gets a clear error, never a half-started run.
		if (PinMameEmulator.loadingGame !== null)
			throw new Error(`PINMAME_LOAD_IN_FLIGHT_${game}_WHILE_${PinMameEmulator.loadingGame}_LOADS`)
		PinMameEmulator.loadingGame = game
		try {
			await this.init()
			if (this.isMock || !this.mod || !this.api) return this.markReady()
			if (this.api.isRunning()) {
				if (this.game === game) return this.markReady()
				if (this.game)
					// This instance owns a different running game — fail
					// loudly so the caller stops it first instead of
					// silently staying on the old game.
					throw new Error(`PINMAME_ALREADY_RUNNING_${this.game}`)
				// A fresh instance facing a running core: the previous owner
				// died without cleanup (failed load, aborted table). Reclaim
				// the orphan so the next load starts from a known state.
				this.stopNative()
				await this.init()
				if (!this.mod || !this.api) return this.markReady()
				if (this.api.isRunning())
					throw new Error(`PINMAME_ALREADY_RUNNING_${PinMameEmulator.activeGame || 'unknown'}`)
			}
			const m = this.mod
			for (const dir of ['/pinmame/roms', '/pinmame/nvram', '/pinmame/cfg']) m.FS.mkdirTree(dir)
			const zipPath = `/pinmame/roms/${game}.zip`
			if (rom.length) {
				let reuse = false
				try {
					// Size match alone is not identity — compare bytes too, so a
					// same-length but different ROM is never silently reused.
					reuse = m.FS.stat(zipPath).size === rom.length && romBytesEqual(m.FS.readFile(zipPath), rom)
				} catch (e) {
					const errno = (e as unknown as { errno?: number })?.errno
					// 44 is ENOENT from the Emscripten FS — no cached zip yet.
					if (errno !== 44) throw e
				}
				if (!reuse) m.FS.writeFile(zipPath, rom)
			} else {
				// An empty ROM must not leave a stale zip behind for this game.
				try {
					m.FS.unlink(zipPath)
				} catch (e) {
					const errno = (e as unknown as { errno?: number })?.errno
					if (errno !== 44) throw e
				}
			}
			this.writeConfig(m)
			this.attemptedRun = true
			const ptr = m._malloc(m.lengthBytesUTF8(game) + 1)
			try {
				m.stringToUTF8(game, ptr, m.lengthBytesUTF8(game) + 1)
				const st = this.api.run(ptr)
				if (st === 3)
					// Lost a race the guard couldn't see — never pretend the
					// new game is ready while another one runs.
					throw new Error(`PINMAME_ALREADY_RUNNING_${PinMameEmulator.activeGame || game}`)
				if (st !== 0) logger().warn(`[pinmame] PinmameRun(${game}) status=${st} — continuing with physics only`)
				else {
					this.game = game
					PinMameEmulator.activeGame = game
				}
			} finally {
				m._free(ptr)
			}
		} catch (e) {
			// A failed load must not poison the next one: stop native state
			// our run may have left behind, then reset so a retry proceeds
			// past the isRunning guard instead of throwing ALREADY_RUNNING.
			if (this.attemptedRun) this.stopNative()
			this.ready = false
			this.game = ''
			this.attemptedRun = false
			this.paused = true
			// Keep the name when native state survived cleanup — the next
			// guard names the culprit instead of an empty string.
			if (PinMameEmulator.activeGame === game && !this.api?.isRunning()) PinMameEmulator.activeGame = ''
			throw e
		} finally {
			if (PinMameEmulator.loadingGame === game) PinMameEmulator.loadingGame = null
		}
		this.markReady()
	}

	/**
	 * Best-effort core stop so a later load starts from a known state. Safe
	 * on a failed or foreign instance: native state is only touched when this
	 * instance ran (or still owns) the active game.
	 */
	public stop(): void {
		if (this.attemptedRun || (this.game !== '' && PinMameEmulator.activeGame === this.game)) this.stopNative()
		this.ready = false
		this.paused = true
		this.attemptedRun = false
		this.game = ''
		if (PinMameEmulator.activeGame !== '' && !this.api?.isRunning()) PinMameEmulator.activeGame = ''
	}

	// Native stop when the export exists; otherwise abandon the poisoned
	// module instance so the next init builds a known-clean one. Abandoning
	// never kills other instances' games — they keep their own module ref —
	// it only redirects future inits at a fresh instance.
	private stopNative(): void {
		try {
			this.api?.stop?.()
		} catch (e) {
			logger().warn('[pinmame] PinmameStop threw — abandoning module instance instead', e)
		}
		if (this.api && !this.api.stop && this.api.isRunning()) {
			this.mod = null
			this.api = null
			resetPinmameModuleCache()
		}
	}

	/**
	 * Test seam: installs a fake module/API backend without loading WASM.
	 * Unknown-typed so specs never touch private fields to wire fakes.
	 */
	public setBackendForTesting(mod: unknown, api: unknown): void {
		this.mod = mod as PinmameModule
		this.api = api as Api
		this.isMock = false
	}

	/** Clears module-global load/owner tracking; test seam for spec isolation. */
	public static resetSharedStateForTesting(): void {
		PinMameEmulator.loadingGame = null
		PinMameEmulator.activeGame = ''
	}

	/** Advances to ready (normally called by loadGame; public for tests). */
	public markReady(): void {
		this.ready = true
		this.queue.replayMessages(this)
		if (this.isMock || !this.api) return
		for (const [low, mask] of this.solMasks) {
			this.api.setSolMask(low, mask)
		}
	}

	// PinMAME's config is a fixed 1 KiB C struct read by pointer: offset 4 is
	// the mixer sample rate (i32 LE) and offset 8 the VPM install dir string.
	private writeConfig(m: PinmameModule): void {
		const ptr = m._malloc(CONFIG_SIZE)
		try {
			m.HEAPU8.fill(0, ptr, ptr + CONFIG_SIZE)
			new DataView(m.HEAPU8.buffer).setInt32(ptr + 4, SAMPLE_RATE, true)
			m.HEAPU8.set(new TextEncoder().encode(VPM_DIR), ptr + 8)
			this.api?.setConfig(ptr)
		} finally {
			m._free(ptr)
		}
	}

	isInitialized(): boolean {
		return this.ready
	}
	getVersion(): string {
		return 'libpinmame-3.7-wasm'
	}
	setPaused(v: boolean): void {
		this.paused = v
	}
	getPaused(): boolean {
		return this.paused
	}
	registerAudioConsumer(cb: (msg: unknown) => void): void {
		this.audioConsumer = cb
	}
	getDmdDimensions(): Vertex2D {
		return new Vertex2D(this.dmdW, this.dmdH)
	}
	getDmdFrame(): Uint8Array {
		const d = this.emulatorState.getDmdScreen()
		// The non-empty buffer is the live stored frame: read it, don't mutate it.
		return d.length ? d : new Uint8Array(this.dmdW * this.dmdH)
	}
	getDipSwitchByte(bank = 0): number {
		return this.isMock || !this.api ? 0 : this.api.getDIP(bank)
	}
	setDipSwitchByte(v: number, bank = 0): void {
		if (!this.ready) {
			// Pack bank into the high byte so replay can split value/bank apart.
			this.queue.addMessage(MessageType.SetDipByte, (bank << 8) | (v & 0xff))
			return
		}
		if (!this.isMock && this.api) this.api.setDIP(bank, v)
	}

	getSolMask(low: number): number {
		const cached = this.solMasks.get(low)
		if (cached !== undefined) return cached
		if (this.isMock || !this.api) return 0
		// Real backend errors propagate — a catch-all 0 would hide a dead core.
		return this.api.getSolMask(low)
	}
	setSolMask(low: number, mask: number): void {
		this.solMasks.set(low, mask)
		if (!this.ready || this.isMock || !this.api) return
		this.api.setSolMask(low, mask)
	}

	emuSimulateCycle(ms: number): number {
		if (!this.ready) {
			this.queue.addMessage(MessageType.ExecuteTicks, ms)
			return 0
		}
		if (this.pendingSwitches.size) this.flushPendingSwitches()
		if (this.paused || this.isMock) return ms
		// Zero time pulls nothing; 1 ms → 10 ms decimation lives caller-side.
		if (ms <= 0) return ms
		this.sync()
		return ms
	}

	setTimeFence(time: number): void {
		if (!this.ready) {
			this.queue.addMessage(MessageType.SetTimeFence, time)
			return
		}
		if (this.isMock || !this.api) {
			// No backend to fence against — warn once per process, not per frame.
			warnOnce('pinmame:time-fence', '[pinmame] setTimeFence without a backend — input ignored')
			return
		}
	}

	private sync(): void {
		if (!this.mod || !this.api || this.isMock) return
		for (const [fn, buf] of [
			[this.api.getChangedLamps, this.lamps],
			[this.api.getChangedSols, this.sols],
			[this.api.getChangedGIs, this.gis],
		] as const)
			this.pull(fn, buf)
		this.emulatorState.applyPinmame(this.lamps, this.sols, this.gis)
		this.pullLEDs()
		this.pullDmd()
		this.pullAudio()
	}

	// Borrowed view — see registerAudioConsumer contract.
	private pullAudio(): void {
		const m = this.mod
		const consumer = this.audioConsumer
		const getFrame = this.api?.getAudioFrame
		// No consumer means no drain: mirrored frames wait until one registers.
		if (!m || !consumer || typeof getFrame !== 'function') return
		// 0 channels means the stream hasn't started yet — wait, don't assume.
		const channels = this.api?.getAudioChannels?.()
		if (channels !== 1 && channels !== 2) return
		// Seqlock guard: a counter change across the drain means the copy may
		// be torn or stale — drop it either way.
		const seq0 = this.api?.getAudioSeq?.() ?? 0
		if (seq0 & 1) return
		// Always stereo-sized: the layout can change mid-drain, and an
		// undersized buffer would overflow the wasm heap.
		const ptr = this.ensureWasmBuf('audio', MAX_AUDIO_FRAMES * 2 * 2)
		// At most one accumulator per sync; 0 means nothing drained yet, not an error.
		// Rogue backend guard: never size the DataView past the pool.
		const frames = Math.min(getFrame(ptr, MAX_AUDIO_FRAMES), MAX_AUDIO_FRAMES)
		if (frames <= 0 || (this.api?.getAudioSeq?.() ?? seq0) !== seq0) return
		const fresh = this.api?.getAudioChannels?.() ?? 0
		if (fresh !== 1 && fresh !== 2) return
		const view = new DataView(m.HEAPU8.buffer, ptr, frames * fresh * 2)
		const pcm = this._audioPcm.subarray(0, frames)
		if (fresh === 1) {
			for (let i = 0; i < frames; i++) pcm[i] = view.getInt16(i * 2, true) / 32768
		} else {
			for (let i = 0; i < frames; i++)
				pcm[i] = (view.getInt16(i * 4, true) + view.getInt16(i * 4 + 2, true)) / 2 / 32768
		}
		consumer(pcm)
	}

	private ensureWasmBuf(slot: 'pull' | 'dmd' | 'audio', bytes: number): number {
		const buf = this.wasmBufs[slot]
		if (buf.ptr && buf.cap >= bytes) return buf.ptr
		if (buf.ptr) this.mod?._free(buf.ptr)
		buf.cap = Math.max(buf.min, bytes)
		buf.ptr = this.mod ? this.mod._malloc(buf.cap) : 0
		return buf.ptr
	}

	private pullDmd(): void {
		if (!this.mod || !this.api) return
		const w = this.api.getDmdWidth()
		const h = this.api.getDmdHeight()
		// Width/height come straight from wasm memory: reject non-positive
		// and absurd pairs (negative dims threw RangeError in Uint8Array;
		// huge ones OOM in _malloc) and keep the last good dimensions.
		if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
		const n = w * h
		if (n > MAX_DMD_BYTES) return
		this.dmdW = w
		this.dmdH = h
		const ptr = this.ensureWasmBuf('dmd', n)
		// getDmdFrame returns bytes written (0 = no display yet). The frame is
		// copied out of wasm memory twice — HEAPU8 into the reusable
		// _dmdFrameBuf, then into the publish back buffer — so later pulls
		// can't mutate a previously published frame.
		if (ptr && this.api.getDmdFrame(ptr) > 0) {
			if (!this._dmdFrameBuf || this._dmdFrameBuf.length !== n) {
				this._dmdFrameBuf = new Uint8Array(n)
			}
			this._dmdFrameBuf.set(this.mod.HEAPU8.subarray(ptr, ptr + n))
			this.emulatorState.setDmd(this._dmdFrameBuf)
		}
	}

	private pull(fn: (p: number) => number, buf: Uint8Array): void {
		const m = this.mod
		// A null fn is the cwrap-missing-export escape: cwrap returns null when
		// the wasm build lacks the export instead of throwing at wrap time.
		if (!m || typeof fn !== 'function') return
		const reqBytes = buf.length * 8
		const ptr = this.ensureWasmBuf('pull', reqBytes)
		if (!ptr) return
		let n = 0
		try {
			// One failing stage must not poison the other two: any throw or
			// bogus count (null/NaN/negative) degrades to zero changes. A huge
			// finite count is clamped to the lane count: indexes past it are
			// ignored anyway, and an unbounded read loop would hang the tick.
			n = fn(ptr) ?? 0
			if (!Number.isFinite(n) || n < 0) n = 0
			n = Math.min(n, buf.length)
		} catch {
			warnOnce('pinmame:pull', '[pinmame] stage pull threw; changes dropped.')
			n = 0
		}
		for (let i = 0; i < n; i++) {
			// 8-byte stride: each change is an (i32 index, i32 value) pair; 255 is the VPM lamp ceiling.
			const idx = m.getValue(ptr + i * 8, 'i32')
			const val = m.getValue(ptr + i * 8 + 4, 'i32')
			if (idx >= 0 && idx < buf.length) buf[idx] = Math.max(0, Math.min(255, val))
		}
	}

	// Segment-display lane: 12-byte (ledNo, chgSeg, state) triples, at most
	// CORE_SEGCOUNT (128) per pull. Full masks — see the wiring comment above.
	private pullLEDs(): void {
		const m = this.mod
		const fn = this.api?.getChangedLEDs
		if (!m || typeof fn !== 'function') return
		const ptr = this.ensureWasmBuf('pull', 128 * 12)
		if (!ptr) return
		let n = 0
		try {
			n = fn(ptr) ?? 0
			if (!Number.isFinite(n) || n < 0) n = 0
			n = Math.min(n, 128)
		} catch {
			warnOnce('pinmame:pull-led', '[pinmame] LED pull threw; changes dropped.')
			n = 0
		}
		if (!n) return
		const rows: number[][] = []
		for (let i = 0; i < n; i++) {
			rows.push([
				m.getValue(ptr + i * 12, 'i32'),
				m.getValue(ptr + i * 12 + 4, 'i32'),
				m.getValue(ptr + i * 12 + 8, 'i32'),
			])
		}
		this.emulatorState.pullLEDs(rows)
	}

	getSwitchInput(n: number): number {
		return this.readSwitch(n)
	}
	getLampState(n: number): number {
		return this.emulatorState.getLampStateDirect(n)
	}
	getSolenoidState(n: number): number {
		return this.emulatorState.getSolenoidState(n)
	}
	getGIState(n: number): number {
		return this.emulatorState.getGIState(n)
	}

	private readSwitch(n: number): number {
		return this.pendingSwitches.get(n) ?? (this.isMock ? this.mockSwitches.get(n) : this.api?.getSwitch(n)) ?? 0
	}

	setSwitchInput(n: number, enable?: boolean): boolean {
		if (!this.ready) {
			this.queue.addMessage(switchMessageType(enable), n)
			return true
		}
		const cur = this.readSwitch(n)
		const next = enable === undefined ? (cur ? 0 : 1) : enable ? 1 : 0
		if (this.isMock) {
			this.mockSwitches.set(n, next)
			return true
		}
		if (!this.api) {
			this.pendingSwitches.set(n, next)
			return true
		}
		try {
			this.api.setSwitch(n, next)
		} catch {
			this.pendingSwitches.set(n, next)
			return false
		}
		if (!this.isSwitchSettled(n, next)) {
			this.pendingSwitches.set(n, next)
			return true
		}
		this.pendingSwitches.delete(n)
		return true
	}

	private flushPendingSwitches(): void {
		if (!this.api) return
		for (const [n, v] of [...this.pendingSwitches]) {
			this.api.setSwitch(n, v)
			if (this.isSwitchSettled(n, v)) this.pendingSwitches.delete(n)
		}
	}

	private isSwitchSettled(n: number, expected: number): boolean {
		const got = this.api?.getSwitch(n) ?? 0
		return !!got === !!expected
	}

	setCabinetInput(v: number): void {
		if (!this.ready) {
			this.queue.addMessage(MessageType.CabinetInput, v)
			return
		}
		if (!this.isMock && this.api?.setCabinetInput) {
			this.api.setCabinetInput(v)
			return
		}
		// No PinmameSetCabinetInput export to forward to — warn once per process.
		warnOnce('pinmame:cabinet-input', '[pinmame] setCabinetInput without a backend — input ignored')
	}
	setFliptronicsInput(): void {}
}
