// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Vertex2D } from '../math/vector.js'
import type { EmulatorState } from './emulator-state.js'

export interface IEmulator {
	readonly emulatorState: EmulatorState
	readonly isMock?: boolean

	isInitialized(): boolean
	getVersion(): string
	setPaused(v: boolean): void
	getPaused(): boolean
	registerAudioConsumer(cb: (msg: unknown) => void): void

	emuSimulateCycle(ms: number): number
	getDmdFrame(): Uint8Array
	getDmdDimensions(): Vertex2D
	setCabinetInput(n: number): void
	setSwitchInput(n: number, enable?: boolean): boolean
	getSwitchInput(n: number): number
	getLampState(n: number): number
	getSolenoidState(n: number): number
	getGIState(n: number): number
	setFliptronicsInput(v: string, enable?: boolean): void
	getDipSwitchByte(bank?: number): number
	setDipSwitchByte(v: number, bank?: number): void
	getSolMask?(low: number): number
	setSolMask?(low: number, mask: number): void
	setTimeFence?(time: number): void
}

export type { IEmulator as Emulator }
