// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IEmulator } from '../../game/iemulator.js'
import { logger } from '../../util/logger.js'
import { Vertex2D } from '../../util/math.js'
import { EmulatorMessageQueue, MessageType } from '../emulator-message-queue.js'
import { EmulatorState } from '../emulator-state.js'
import { createPinmameModule } from './pinmame-loader.js'
import type { PinmameModule } from './pinmame-module.js'

const DMD_SIZE = new Vertex2D(128, 32)
const CONFIG_SIZE = 1024
const VPM_DIR = '/pinmame'
const SAMPLE_RATE = 44100

type Api = {
	setConfig(p: number): void
	run(p: number): number
	setSwitch(n: number, v: number): void
	getSwitch(n: number): number
	getChangedLamps(p: number): number
	getChangedSols(p: number): number
	getChangedGIs(p: number): number
	getDIP(b: number): number
	setDIP(b: number, v: number): void
}

function resolveName(name: string | { name?: string; pinmame?: { name?: string } }): string {
	if (typeof name === 'string') return name
	return name.pinmame?.name ?? name.name ?? ''
}

export class PinMameEmulator implements IEmulator {
	readonly emulatorState = new EmulatorState()
	private readonly queue = new EmulatorMessageQueue()
	private readonly fallback = new Uint8Array(DMD_SIZE.x * DMD_SIZE.y)

	private mod: PinmameModule | null = null
	private api: Api | null = null
	public isMock = false
	private ready = false
	private paused = false

	private readonly lamps = new Uint8Array(624)
	private readonly sols = new Uint8Array(72)
	private readonly gis = new Uint8Array(8)

	async init(): Promise<void> {
		if (this.mod) return
		const { module, isMock } = await createPinmameModule()
		this.mod = module
		this.isMock = isMock
		if (isMock) {
			logger().warn('[pinmame] mock — physics only, run npm run build:wasm')
			return
		}
		const wrap = (n: string, r: string | null, a: string[]) => module.cwrap(n, r, a) as unknown as Api[keyof Api]
		this.api = {
			setConfig: wrap('PinmameSetConfig', null, ['number']) as Api['setConfig'],
			run: wrap('PinmameRun', 'number', ['number']) as Api['run'],
			setSwitch: wrap('PinmameSetSwitch', null, ['number', 'number']) as Api['setSwitch'],
			getSwitch: wrap('PinmameGetSwitch', 'number', ['number']) as Api['getSwitch'],
			getChangedLamps: wrap('PinmameGetChangedLamps', 'number', ['number']) as Api['getChangedLamps'],
			getChangedSols: wrap('PinmameGetChangedSolenoids', 'number', ['number']) as Api['getChangedSols'],
			getChangedGIs: wrap('PinmameGetChangedGIs', 'number', ['number']) as Api['getChangedGIs'],
			getDIP: wrap('PinmameGetDIP', 'number', ['number']) as Api['getDIP'],
			setDIP: wrap('PinmameSetDIP', null, ['number', 'number']) as Api['setDIP'],
		}
	}

	async loadGame(name: string | { name?: string; pinmame?: { name?: string } }, rom: Uint8Array): Promise<void> {
		await this.init()
		const game = resolveName(name)
		if (!game) throw new Error('PINMAME_GAME_NAME_MISSING')
		if (this.isMock || !this.mod || !this.api) {
			this.ready = true
			this.queue.replayMessages(this)
			return
		}
		const m = this.mod
		for (const dir of ['/pinmame/roms', '/pinmame/nvram', '/pinmame/cfg']) {
			try {
				m.FS.mkdirTree(dir)
			} catch {}
		}
		m.FS.writeFile(`/pinmame/roms/${game}.zip`, rom)
		this.writeConfig(m)
		const ptr = m._malloc(m.lengthBytesUTF8(game) + 1)
		try {
			m.stringToUTF8(game, ptr, m.lengthBytesUTF8(game) + 1)
			const st = this.api.run(ptr)
			if (st !== 0) throw new Error(`PinmameRun(${game}) status=${st}`)
		} finally {
			m._free(ptr)
		}
		this.ready = true
		this.queue.replayMessages(this)
	}

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
	registerAudioConsumer(): void {}
	getDmdDimensions(): Vertex2D {
		return DMD_SIZE
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
		try {
			this.pull(this.api.getChangedLamps, this.lamps)
			this.pull(this.api.getChangedSols, this.sols)
			this.pull(this.api.getChangedGIs, this.gis)
			this.emulatorState.applyPinmame(this.lamps, this.sols, this.gis)
		} catch (e) {
			logger().warn('[pinmame] poll failed', (e as Error).message)
		}
	}

	private pull(fn: (p: number) => number, buf: Uint8Array): void {
		const m = this.mod!
		const ptr = m._malloc(buf.length * 8)
		try {
			const n = fn(ptr)
			for (let i = 0; i < n; i++) {
				const idx = m.getValue(ptr + i * 8, 'i32')
				const val = m.getValue(ptr + i * 8 + 4, 'i32')
				if (idx >= 0 && idx < buf.length) buf[idx] = val ? 1 : 0
			}
		} finally {
			m._free(ptr)
		}
	}

	private readonly mockSwitches = new Map<number, number>()

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
