// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import type { AnimObject } from './anim-object.js'

/**
 * Slingshot animations are only visible when the ball hit the slingshot
 * segment of a surface. They look ugly and I don't think they are used
 * in any tables today. Thus, they aren't currently implemented.
 */
export class SlingshotAnimObject implements AnimObject {
	/**
	 * Time at which to pull in slingshot, Zero means the slingshot is currently reset
	 */
	public timeReset: number = 0
	public animations: boolean = false
	public iframe: boolean = false

	public animate(physics: PlayerPhysics) {
		if (!this.iframe && this.timeReset !== 0 && this.animations) {
			this.iframe = true
		} else if (this.iframe && this.timeReset < physics.timeMsec) {
			this.iframe = false
			this.timeReset = 0
		}
	}
}
