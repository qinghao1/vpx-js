// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Vertex2D } from '../math/vertex2d.js'

export interface IEmulator {
	/** Executes one emulator cycle (~1000Hz, after input, before physics). */
	emuSimulateCycle(dTime: number): void

	/** DMD frame buffer (top-left to bottom-right, 1 byte/pixel 0-3). */
	getDmdFrame(): Uint8Array

	/** DMD dimensions (x=width, y=height). */
	getDmdDimensions(): Vertex2D

	/** Cabinet key (ESC, -, +, ENTER …). */
	setCabinetInput(keyNr: number): void

	/** Updates a switch state. */
	setSwitchInput(switchNr: number, optionalEnableSwitch?: boolean): void

	/** Updates emulator language DIP switch. */
	setDipSwitchByte(dipSwitch: number): void
}
