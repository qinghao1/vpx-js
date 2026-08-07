// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { type GamelistDB, WpcEmuApi, type WpcEmuWebWorkerApi } from 'wpc-emu'
import type { IEmulator } from '../game/iemulator.js'
import { logger } from '../util/logger.js'
import { Vertex2D } from '../util/math.js'
import { EmulatorMessageQueue, MessageType } from './emulator-message-queue.js'
import { EmulatorState } from './emulator-state.js'
import { OffsetIndex } from './offset-index.js'

const INCLUDE_RAM = false

/** WPC-EMU adapter. @see https://github.com/vpinball/wpc-emu */
export class Emulator implements IEmulator {
	public readonly emulatorState = new EmulatorState()
	private readonly queue = new EmulatorMessageQueue()
	private readonly dmdSize = new Vertex2D(128, 32)
	private paused = false
	private emulator?: WpcEmuApi.Emulator

	public async loadGame(entry: GamelistDB.GameEntry, rom: Uint8Array): Promise<void> {
		this.emulator = await WpcEmuApi.initVMwithRom({ u06: rom }, entry)
		this.emulator.reset()
		this.emulator.executeCycleForTime(1000, 4)
		this.queue.addMessage(MessageType.CabinetInput, 16)
		this.queue.replayMessages(this)
		this.registerAudioConsumer((cb) => logger().debug('audioCallback', cb))
	}

	public isInitialized(): boolean {
		return !!this.emulator
	}
	public getVersion(): string {
		return WpcEmuApi.getVersion()
	}
	public setPaused(v: boolean): void {
		this.paused = v
	}
	public getPaused(): boolean {
		return this.paused
	}

	public registerAudioConsumer(cb: (m: WpcEmuApi.AudioMessage) => void): void {
		this.emulator?.registerAudioConsumer(cb)
	}

	public emuSimulateCycle(ms: number): number {
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

	public getSwitchInput(nr: number): number {
		return this.emulatorState.getSwitchState(OffsetIndex.fromWpcMatrix(nr))
	}
	public getLampState(nr: number): number {
		return this.emulatorState.getLampState(OffsetIndex.fromWpcMatrix(nr))
	}
	public getSolenoidState(nr: number): number {
		return this.emulatorState.getSolenoidState(nr)
	}
	public getGIState(nr: number): number {
		return this.emulatorState.getGIState(nr)
	}

	public setSwitchInput(nr: number, enable?: boolean): boolean {
		if (!this.emulator) {
			const type =
				enable === true
					? MessageType.SetSwitchInput
					: enable === false
						? MessageType.ClearSwitchInput
						: MessageType.ToggleSwitchInput
			this.queue.addMessage(type, nr)
			return true
		}
		this.emulator.setSwitchInput(nr, enable)
		return true
	}

	public setCabinetInput(v: number): void {
		if (!this.emulator) {
			this.queue.addMessage(MessageType.CabinetInput, v)
			return
		}
		this.emulator.setCabinetInput(v)
	}

	public setFliptronicsInput(v: string, enable?: boolean): void {
		this.emulator?.setFliptronicsInput(v, enable)
	}

	public getDmdDimensions(): Vertex2D {
		return this.dmdSize
	}
	public getDmdFrame(): Uint8Array {
		return this.emulatorState.getDmdScreen()
	}
	public getDipSwitchByte(): number {
		return this.emulator?.getDipSwitchByte() ?? 0
	}
	public setDipSwitchByte(v: number): void {
		if (!this.emulator) {
			this.queue.addMessage(MessageType.SetDipByte, v)
			return
		}
		this.emulator.setDipSwitchByte(v)
	}
}
