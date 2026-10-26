import type { IEmulator } from '../../emu/emulator.js'
import { tryGetFloatState } from '../../emu/res-uri.js'
import type { IAnimation } from '../../game/interfaces.js'
import type { Table } from '../table/table.js'
import type { FlasherData } from './flasher-data.js'
import type { FlasherState } from './flasher-state.js'

/**
 * Flasher animation — controller link modulation of opacity.
 * Mirrors upstream render logic (`alpha *= linkState` when `SLNK` resolves, plain script
 * opacity otherwise; vpx-js has no lightmaps so the lightmap fallback does not apply).
 * @see https://github.com/vpinball/vpinball/blob/master/src/parts/flasher.cpp
 */
export class FlasherAnimation implements IAnimation {
	constructor(
		private readonly data: FlasherData,
		private readonly state: FlasherState,
		private readonly emuProvider?: () => IEmulator | undefined,
	) {}

	public init(_timeMsec: number): void {}

	public updateAnimation(_newTimeMsec: number, _table: Table): boolean {
		// Locked by a light sequence: like upstream, the controller state is ignored.
		if (!this.data.stateSrcLink || this.state.lockedByLS) return false
		const linked = tryGetFloatState(this.emuProvider?.(), this.data.stateSrcLink)
		const alpha = linked.ok ? this.data.alpha * linked.value : this.data.alpha
		if (this.state.alpha === alpha) return false
		this.state.alpha = alpha
		return true
	}
}
