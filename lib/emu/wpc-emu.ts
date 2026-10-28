// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { GamelistDB, WpcEmuApi as WpcEmuApiType, WpcEmuWebWorkerApi } from 'wpc-emu'
import type { IEmulator } from '../game/iemulator.js'
import { Vertex2D } from '../math/vector.js'
import { logger } from '../util/logger.js'
import { EmulatorMessageQueue, MessageType, switchMessageType } from './emulator-message-queue.js'
import { EmulatorState } from './emulator-state.js'
import { OffsetIndex } from './offset-index.js'
import { warnOnce } from './warn-once.js'
import { resolveWpcEmu } from './wpc-emu-interop.js'

const WpcEmuApi = resolveWpcEmu<{
	initVMwithRom(rom: { u06: Uint8Array }, entry: GamelistDB.GameEntry): Promise<WpcEmuApiType.Emulator>
	getVersion(): string
}>('WpcEmuApi')

const INCLUDE_RAM = false
// Boot warmup: run the first simulated second so CPU/Fliptronics state
// settles before table scripts run; 4 tick steps is wpc-emu's recommended
// granularity (see wpc-emu BENCHMARK.md).
const WARMUP_MS = 1000
const WARMUP_TICK_STEPS = 4
// Initial cabinet-key state replayed after load. wpc-emu autoreleases
// cabinet keys after 100 ms, so this is a boot pulse, not a held switch.
const INITIAL_CABINET_KEY = 16

/** WPC-EMU adapter. @see https://github.com/vpinball/wpc-emu */
export class Emulator implements IEmulator {
	readonly emulatorState = new EmulatorState()
	private readonly queue = new EmulatorMessageQueue()
	private readonly dmdSize = new Vertex2D(128, 32)
	private paused = false
	private emulator?: WpcEmuApiType.Emulator

	async loadGame(entry: GamelistDB.GameEntry, rom: Uint8Array): Promise<void> {
		this.emulator = await WpcEmuApi.initVMwithRom({ u06: rom }, entry)
		this.emulator.reset()
		this.emulator.executeCycleForTime(WARMUP_MS, WARMUP_TICK_STEPS)
		this.queue.addMessage(MessageType.CabinetInput, INITIAL_CABINET_KEY)
		this.queue.replayMessages(this)
		this.registerAudioConsumer(m => logger().debug('audioCallback', m))
	}

	isInitialized(): boolean {
		return !!this.emulator
	}
	getVersion(): string {
		return WpcEmuApi.getVersion()
	}
	setPaused(v: boolean): void {
		this.paused = v
	}
	getPaused(): boolean {
		return this.paused
	}

	registerAudioConsumer(cb: (m: unknown) => void): void {
		this.emulator?.registerAudioConsumer(cb as (m: WpcEmuApiType.AudioMessage) => void)
	}

	emuSimulateCycle(ms: number): number {
		if (!this.emulator) {
			this.queue.addMessage(MessageType.ExecuteTicks, ms)
			return 0
		}
		if (this.paused) return 0
		const cycles = this.emulator.executeCycleForTime(ms, 16)
		const state: WpcEmuWebWorkerApi.EmuState = this.emulator.getUiState(INCLUDE_RAM)
		this.emulatorState.updateState(state.asic)
		return cycles
	}

	getSwitchInput(nr: number): number {
		return this.emulatorState.getSwitchState(OffsetIndex.fromWpcMatrix(nr))
	}
	getLampState(nr: number): number {
		return this.emulatorState.getLampState(OffsetIndex.fromWpcMatrix(nr))
	}
	getSolenoidState(nr: number): number {
		return this.emulatorState.getSolenoidState(nr)
	}
	getGIState(nr: number): number {
		return this.emulatorState.getGIState(nr)
	}

	setSwitchInput(nr: number, enable?: boolean): boolean {
		if (!this.emulator) {
			this.queue.addMessage(switchMessageType(enable), nr)
			return true
		}
		this.emulator.setSwitchInput(nr, enable)
		return true
	}

	setCabinetInput(v: number): void {
		if (!this.emulator) {
			this.queue.addMessage(MessageType.CabinetInput, v)
			return
		}
		this.emulator.setCabinetInput(v)
	}

	setFliptronicsInput(v: string, enable?: boolean): void {
		this.emulator?.setFliptronicsInput(v, enable)
	}

	getDmdDimensions(): Vertex2D {
		return this.dmdSize
	}
	getDmdFrame(): Uint8Array {
		const frame = this.emulatorState.getDmdScreen()
		// Standardize on a zeroed w*h buffer — never a 0-length one. The
		// non-empty buffer is the live stored frame: read it, don't mutate it.
		return frame.length ? frame : new Uint8Array(this.dmdSize.x * this.dmdSize.y)
	}
	getDipSwitchByte(bank = 0): number {
		// WPC hardware exposes a single DIP bank — other banks have no meaning.
		if (bank !== 0) {
			warnOnce('wpc:dip-bank', '[wpc] DIP bank %d unsupported — only bank 0 exists', bank)
			return 0
		}
		return this.emulator?.getDipSwitchByte() ?? 0
	}
	setDipSwitchByte(v: number, bank = 0): void {
		if (bank !== 0) {
			warnOnce('wpc:dip-bank', '[wpc] DIP bank %d unsupported — only bank 0 exists', bank)
			return
		}
		if (!this.emulator) {
			this.queue.addMessage(MessageType.SetDipByte, v)
			return
		}
		this.emulator.setDipSwitchByte(v)
	}
	setTimeFence(_time: number): void {
		// wpc-emu has no time fence — warn once per process, not per frame.
		warnOnce('wpc:time-fence', '[wpc] setTimeFence unsupported — input ignored')
	}
}
