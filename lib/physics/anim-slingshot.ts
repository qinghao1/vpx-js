// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import type { AnimObject } from './anim-object.js'

/** No-op slingshot animation (visual slingshots are largely unused). */
export class SlingshotAnimObject implements AnimObject {
	public timeReset = 0
	public animations = false
	public iframe = false

	public animate(physics: PlayerPhysics): void {
		if (!this.iframe && this.timeReset !== 0 && this.animations) this.iframe = true
		else if (this.iframe && this.timeReset < physics.timeMsec) {
			this.iframe = false
			this.timeReset = 0
		}
	}
}
