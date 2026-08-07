// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Plunger lathe coordinate — radius, y, tv, normal. @see https://github.com/vpinball/vpinball/blob/master/plunger.cpp */
export class PlungerCoord {
	constructor(
		public r: number,
		public y: number,
		public tv: number,
		public nx: number,
		public ny: number,
	) {}

	public set(r: number, y: number, tv: number, nx: number, ny: number) {
		this.r = r
		this.y = y
		this.tv = tv
		this.nx = nx
		this.ny = ny
	}
}
