// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Plunger shape descriptor coordinate entry.
 *
 * The plunger is essentially built on a virtual lathe:  it consists of a series
 * of circles centered on the longitudinal axis.  Each coordinate gives the
 * position along the axis of the circle, expressed as the distance (in
 * standard table units) from the tip, and the radius of the circle, expressed
 * as a fraction of the nominal plunger width (m_d.m_width).  Each coordinate
 * also specifies the normal for the vertices along that circle, and the
 * vertical texture offset of the vertices.  The horizontal texture offset is
 * inferred in the lathing process - the center of the texture is mapped to the
 * top center of each circle, and the texture is wrapped around the sides of
 * the circle.
 */
export class PlungerCoord {
	/**
	 * radius at this point, as a fraction of nominal plunger width
	 */
	public r: number

	/**
	 * y position, in table distance units, with the tip at 0.0
	 */
	public y: number

	/**
	 * texture v coordinate of the vertices on this circle
	 */
	public tv: number

	/**
	 * normal of the top vertex along this circle
	 */
	public nx: number
	public ny: number

	constructor(r: number, y: number, tv: number, nx: number, ny: number) {
		this.r = r
		this.y = y
		this.tv = tv
		this.nx = nx
		this.ny = ny
	}

	public set(r: number, y: number, tv: number, nx: number, ny: number) {
		this.r = r
		this.y = y
		this.tv = tv
		this.nx = nx
		this.ny = ny
	}
}
