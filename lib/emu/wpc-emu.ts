// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import wpcEmuPkg, { type GamelistDB, type WpcEmuApi as WpcEmuApiType, type WpcEmuWebWorkerApi } from 'wpc-emu'
import type { IEmulator } from '../game/iemulator.js'
import { logger } from '../util/logger.js'

const WpcEmuApi = (wpcEmuPkg as any)?.WpcEmuApi ?? (wpcEmuPkg as any)?.default?.WpcEmuApi ?? wpcEmuPkg

import { Vertex2D } from '../math/vector.js'
import { EmulatorMessageQueue, MessageType, switchMessageType } from './emulator-message-queue.js'
import { EmulatorState } from './emulator-state.js'
import { OffsetIndex } from './offset-index.js'
import { warnOnce } from './warn-once.js'

const INCLUDE_RAM = false

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
		this.emulator.executeCycleForTime(1000, 4)
		this.queue.addMessage(MessageType.CabinetInput, 16)
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
		// Standardize on a zeroed w*h buffer — never a 0-length one.
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
