// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemData } from '../item-data.js'

/** Ball data. @see https://github.com/vpinball/vpinball/blob/master/ball.cpp */
export class BallData extends ItemData {
	public color = 0xffffff
	public environmentMap = ''
	public frontDecal = ''
	public decalMode = false
	public isReflectionEnabled = true
	public playfieldReflectionStrength = 1.0
	public forceReflection = false

	constructor(
		public radius = 25,
		public mass = 1,
		public bulbIntensityScale = 1,
	) {
		super('Ball')
	}
}
