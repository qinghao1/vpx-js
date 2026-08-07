// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Vertex2D } from '../math/vertex2d.js'

export interface IEmulator {
	/**
	 * Executes an emulator cycle.
	 *
	 * This method is called *after* key presses and hit events have been
	 * processed (so the ROM gets the latest state), and *before* the physics
	 * cycle (so the physics cycle can react on changes from the emulator).
	 *
	 * Cycles get executed at around 1000 frames per second.
	 *
	 * @param dTime Time passed since last cycle in milliseconds (as double)
	 */
	emuSimulateCycle(dTime: number): void

	/**
	 * Returns the frame buffer of the DMD.
	 *
	 * top-left to bottom-right array, one byte per pixel, with values from 0 to 3
	 *
	 * TODO will probably change to use bit planes and cut size by four.
	 */
	getDmdFrame(): Uint8Array

	/**
	 * Returns the current DMD dimensions.
	 *
	 * @return Vector where `x` is the width and `y` the height.
	 */
	getDmdDimensions(): Vertex2D

	/**
	 * trigger a cabinet key (like ESC, -, +, ENTER)
	 */
	setCabinetInput(keyNr: number): void

	/**
	 * Update Switch State
	 * @param switchNr which switch number (11..88) to modifiy
	 * @param optionalEnableSwitch if this parameter is missing, the switch will be toggled, else set to the defined state
	 */
	setSwitchInput(switchNr: number, optionalEnableSwitch?: boolean): void

	/**
	 * update emulator language setting
	 * @param dipSwitch new uint8 byte value
	 */
	setDipSwitchByte(dipSwitch: number): void
}
