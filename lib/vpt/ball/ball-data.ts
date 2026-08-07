// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemData } from '../item-data.js'

export class BallData extends ItemData {
	public radius: number
	public mass: number
	public bulbIntensityScale: number
	public color: number = 0xffffff

	public environmentMap: string = ''
	public frontDecal: string = ''
	public decalMode: boolean = false
	public isReflectionEnabled: boolean = true
	public playfieldReflectionStrength: number = 1.0
	public forceReflection: boolean = false

	constructor(radius: number = 25, mass: number = 1, bulbIntensityScale = 1) {
		super('Ball')
		this.radius = radius
		this.mass = mass
		this.bulbIntensityScale = bulbIntensityScale
	}
}
