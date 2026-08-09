// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IEmulator } from '../../game/iemulator.js'
import { logger } from '../../util/logger.js'
import { Vertex2D } from '../../util/vector.js'
import { EmulatorMessageQueue, MessageType } from '../emulator-message-queue.js'
import { EmulatorState } from '../emulator-state.js'
import { createPinmameModule } from './pinmame-loader.js'
import type { PinmameModule } from './pinmame-module.js'

const DMD = new Vertex2D(128, 32)
const CONFIG_SIZE = 1024
const VPM_DIR = '/pinmame'
const SAMPLE_RATE = 44100

type Api = {
	setConfig(p: number): void
	run(p: number): number
	isRunning(): number
	setSwitch(n: number, v: number): void
	getSwitch(n: number): number
	getChangedLamps(p: number): number
	getChangedSols(p: number): number
	getChangedGIs(p: number): number
	getDIP(b: number): number
	setDIP(b: number, v: number): void
	getDmdWidth(): number
	getDmdHeight(): number
	getDmdDepth(): number
	getDmdFrame(p: number): number
	getSolMask(low: number): number
	setSolMask(low: number, mask: number): void
}

const gameName = (v: string | { name?: string; pinmame?: { name?: string } }) =>
	typeof v === 'string' ? v : (v.pinmame?.name ?? v.name ?? '')

export class PinMameEmulator implements IEmulator {
	readonly emulatorState = new EmulatorState()
	private readonly queue = new EmulatorMessageQueue()
	private readonly fallback = new Uint8Array(DMD.x * DMD.y)

	private mod: PinmameModule | null = null
	private api: Api | null = null
	public isMock = false
	private ready = false
	private paused = false
	private game: string = ''

	private readonly lamps = new Uint8Array(624)
	private readonly sols = new Uint8Array(72)
	private readonly gis = new Uint8Array(8)
	private readonly mockSwitches = new Map<number, number>()
	private readonly solMasks = new Map<number, number>()
	private readonly pendingSolMasks: Array<{ low: number; mask: number }> = []
	private dmdW = DMD.x
	private dmdH = DMD.y

	async init(): Promise<void> {
		if (this.mod) return
		const { module, isMock } = await createPinmameModule()
		this.mod = module
		this.isMock = isMock
		if (isMock) {
			logger().warn('[pinmame] mock — physics only, run npm run build:wasm')
			return
		}
		const c = module.cwrap.bind(module) as (
			id: string,
			rt: string | null,
			at: string[],
		) => (...a: unknown[]) => unknown
		this.api = {
			setConfig: c('PinmameSetConfig', null, ['number']) as Api['setConfig'],
			run: c('PinmameRun', 'number', ['number']) as Api['run'],
			isRunning: c('PinmameIsRunning', 'number', []) as Api['isRunning'],
			setSwitch: c('PinmameSetSwitch', null, ['number', 'number']) as Api['setSwitch'],
			getSwitch: c('PinmameGetSwitch', 'number', ['number']) as Api['getSwitch'],
			getChangedLamps: c('PinmameGetChangedLamps', 'number', ['number']) as Api['getChangedLamps'],
			getChangedSols: c('PinmameGetChangedSolenoids', 'number', ['number']) as Api['getChangedSols'],
			getChangedGIs: c('PinmameGetChangedGIs', 'number', ['number']) as Api['getChangedGIs'],
			getDIP: c('PinmameGetDIP', 'number', ['number']) as Api['getDIP'],
			setDIP: c('PinmameSetDIP', null, ['number', 'number']) as Api['setDIP'],
			getDmdWidth: c('PinmameGetDmdWidth', 'number', []) as Api['getDmdWidth'],
			getDmdHeight: c('PinmameGetDmdHeight', 'number', []) as Api['getDmdHeight'],
			getDmdDepth: c('PinmameGetDmdDepth', 'number', []) as Api['getDmdDepth'],
			getDmdFrame: c('PinmameGetDmdFrame', 'number', ['number']) as Api['getDmdFrame'],
			getSolMask: c('PinmameGetSolenoidMask', 'number', ['number']) as Api['getSolMask'],
			setSolMask: c('PinmameSetSolenoidMask', null, ['number', 'number']) as Api['setSolMask'],
		}
	}

	async loadGame(name: string | { name?: string; pinmame?: { name?: string } }, rom: Uint8Array): Promise<void> {
		await this.init()
		const game = gameName(name)
		if (!game) throw new Error('PINMAME_GAME_NAME_MISSING')
		if (this.isMock || !this.mod || !this.api) return this.markReady()
		if (this.api.isRunning()) {
			if (this.game !== game) logger().warn(`[pinmame] already running ${this.game}, refusing second run ${game}`)
			return this.markReady()
		}
		const m = this.mod
		for (const dir of ['/pinmame/roms', '/pinmame/nvram', '/pinmame/cfg'])
			try {
				m.FS.mkdirTree(dir)
			} catch {}
		if (rom.length) {
			let reuse = false
			try {
				reuse = m.FS.stat(`/pinmame/roms/${game}.zip`).size === rom.length
			} catch {}
			if (!reuse) m.FS.writeFile(`/pinmame/roms/${game}.zip`, rom)
		}
		this.writeConfig(m)
		const ptr = m._malloc(m.lengthBytesUTF8(game) + 1)
		try {
			m.stringToUTF8(game, ptr, m.lengthBytesUTF8(game) + 1)
			const st = this.api.run(ptr)
			if (st !== 0) logger().warn(`[pinmame] PinmameRun(${game}) status=${st} — continuing with physics only`)
			else this.game = game
		} finally {
			m._free(ptr)
		}
		this.markReady()
	}

	private markReady(): void {
		this.ready = true
		this.queue.replayMessages(this)
		for (const { low, mask } of this.pendingSolMasks) {
			try {
				this.api?.setSolMask(low, mask)
				this.solMasks.set(low, mask)
			} catch {}
		}
		this.pendingSolMasks.length = 0
	}

	private writeConfig(m: PinmameModule): void {
		const ptr = m._malloc(CONFIG_SIZE)
		try {
			m.HEAPU8.fill(0, ptr, ptr + CONFIG_SIZE)
			new DataView(m.HEAPU8.buffer).setInt32(ptr + 4, SAMPLE_RATE, true)
			m.HEAPU8.set(new TextEncoder().encode(VPM_DIR), ptr + 8)
			this.api!.setConfig(ptr)
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
	registerAudioConsumer(): void {}
	getDmdDimensions(): Vertex2D {
		return new Vertex2D(this.dmdW, this.dmdH)
	}
	getDmdFrame(): Uint8Array {
		const d = this.emulatorState.getDmdScreen()
		return d.length ? d : this.fallback
	}
	getDipSwitchByte(): number {
		return this.isMock || !this.api ? 0 : (this.api.getDIP(0) ?? 0)
	}
	setDipSwitchByte(v: number): void {
		if (!this.ready) {
			this.queue.addMessage(MessageType.SetDipByte, v)
			return
		}
		if (!this.isMock && this.api)
			try {
				this.api.setDIP(0, v)
			} catch {}
	}

	getSolMask(low: number): number {
		if (this.solMasks.has(low)) return this.solMasks.get(low)!
		if (this.isMock || !this.api) return 0
		try {
			return this.api.getSolMask(low) ?? 0
		} catch {
			return 0
		}
	}
	setSolMask(low: number, mask: number): void {
		this.solMasks.set(low, mask)
		if (!this.ready || this.isMock || !this.api) {
			if (!this.ready) this.pendingSolMasks.push({ low, mask })
			return
		}
		try {
			this.api.setSolMask(low, mask)
		} catch {}
	}

	emuSimulateCycle(ms: number): number {
		if (!this.ready) {
			this.queue.addMessage(MessageType.ExecuteTicks, ms)
			return 0
		}
		if (this.paused || this.isMock) return ms
		this.sync()
		return ms
	}

	private sync(): void {
		if (!this.mod || !this.api || this.isMock) return
		for (const [fn, buf] of [
			[this.api.getChangedLamps, this.lamps],
			[this.api.getChangedSols, this.sols],
			[this.api.getChangedGIs, this.gis],
		] as const)
			try {
				this.pull(fn, buf)
			} catch {}
		try {
			this.emulatorState.applyPinmame(this.lamps, this.sols, this.gis)
		} catch {}
		try {
			this.pullDmd()
		} catch (e) {
			logger().warn('[pinmame] pullDmd failed', String(e))
		}
	}

	private pullDmd(): void {
		if (!this.mod || !this.api) return
		const w = this.api.getDmdWidth()
		const h = this.api.getDmdHeight()
		if (!w || !h) return
		this.dmdW = w
		this.dmdH = h
		const n = w * h
		const ptr = this.mod._malloc(n)
		try {
			if (this.api.getDmdFrame(ptr) > 0) {
				this.emulatorState.setDmd(this.mod.HEAPU8.subarray(ptr, ptr + n).slice())
			}
		} finally {
			this.mod._free(ptr)
		}
	}

	private pull(fn: (p: number) => number, buf: Uint8Array): void {
		const m = this.mod!
		const ptr = m._malloc(buf.length * 8)
		try {
			let n = 0
			try {
				n = fn(ptr)
			} catch (e) {
				if (String(e) !== 'unwind') throw e
				n = 0
			}
			for (let i = 0; i < n; i++) {
				const idx = m.getValue(ptr + i * 8, 'i32')
				const val = m.getValue(ptr + i * 8 + 4, 'i32')
				if (idx >= 0 && idx < buf.length) buf[idx] = Math.max(0, Math.min(255, val))
			}
		} finally {
			m._free(ptr)
		}
	}

	getSwitchInput(n: number): number {
		return (this.isMock ? this.mockSwitches.get(n) : this.api?.getSwitch(n)) ?? 0
	}
	getLampState(n: number): number {
		return this.emulatorState.getLampStateDirect(n) ?? this.lamps[n] ?? 0
	}
	getSolenoidState(n: number): number {
		return this.emulatorState.getSolenoidState(n)
	}
	getGIState(n: number): number {
		return this.emulatorState.getGIState(n)
	}

	setSwitchInput(n: number, enable?: boolean): boolean {
		if (!this.ready) {
			const t =
				enable === true
					? MessageType.SetSwitchInput
					: enable === false
						? MessageType.ClearSwitchInput
						: MessageType.ToggleSwitchInput
			this.queue.addMessage(t, n)
			return true
		}
		const cur = (this.isMock ? this.mockSwitches.get(n) : this.api?.getSwitch(n)) ?? 0
		const next = enable === undefined ? (cur ? 0 : 1) : enable ? 1 : 0
		if (this.isMock) {
			this.mockSwitches.set(n, next)
			return true
		}
		if (!this.api) return true
		try {
			this.api.setSwitch(n, next)
			return true
		} catch {
			return false
		}
	}

	setCabinetInput(v: number): void {
		if (!this.ready) this.queue.addMessage(MessageType.CabinetInput, v)
	}
	setFliptronicsInput(): void {}
}
