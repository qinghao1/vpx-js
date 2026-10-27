import type { IEmulator } from '../../emu/emulator.js'
import { tryGetFloatState } from '../../emu/res-uri.js'
import type { IAnimation } from '../../game/interfaces.js'
import type { Table } from '../table/table.js'
import type { FlasherData } from './flasher-data.js'
import type { FlasherState } from './flasher-state.js'

/**
 * Flasher animation — controller link modulation of opacity.
 * Mirrors upstream render logic: a resolved `SLNK` link scales the opacity and
 * suppresses the lightmap fallback, otherwise the lightmap (or plain script opacity)
 * applies (@see Flasher::Render in src/parts/flasher.cpp).
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
		// A resolution flip alone (same alpha, link now resolving or not) still changes
		// the rendered result: the updater applies the lightmap only while unresolved.
		if (this.state.alpha === alpha && this.state.slnkResolved === linked.ok) return false
		this.state.alpha = alpha
		this.state.slnkResolved = linked.ok
		return true
	}
}
