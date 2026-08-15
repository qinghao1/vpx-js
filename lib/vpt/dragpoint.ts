// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../io/biff-parser.js'
import type { CatmullCurve } from '../util/catmull-curve.js'
import { Vertex3D } from '../util/vector.js'
import type { IRenderVertex, RenderVertex, Vertex } from '../util/vertex.js'

export const HIT_SHAPE_DETAIL_LEVEL = 7.0

/** Editable spline point. */
export class DragPoint extends BiffParser {
	public vertex!: Vertex3D
	public fSmooth!: boolean
	public fSlingshot!: boolean
	public fAutoTexture!: boolean
	public texturecoord!: number
	public calcHeight?: number

	public static getRgVertex<T extends IRenderVertex>(
		vdpoint: DragPoint[],
		instantiateT: () => T,
		instantiateCatmullCurve: (pdp0: Vertex, pdp1: Vertex, pdp2: Vertex, pdp3: Vertex) => CatmullCurve,
		loop = true,
		accuracy = 4.0,
	): T[] {
		let vv: T[] = []
		const cpoint = vdpoint.length
		const endpoint = loop ? cpoint : cpoint - 1
		const rendv2 = instantiateT()

		for (let i = 0; i < endpoint; i++) {
			const pdp1 = vdpoint[i]
			const pdp2 = vdpoint[i < cpoint - 1 ? i + 1 : 0]
			if (pdp1.vertex.x === pdp2.vertex.x && pdp1.vertex.y === pdp2.vertex.y && pdp1.vertex.z === pdp2.vertex.z)
				continue

			let iprev = pdp1.fSmooth ? i - 1 : i
			if (iprev < 0) iprev = loop ? cpoint - 1 : 0
			let inext = pdp2.fSmooth ? i + 2 : i + 1
			if (inext >= cpoint) inext = loop ? inext - cpoint : cpoint - 1

			const pdp0 = vdpoint[iprev]
			const pdp3 = vdpoint[inext]
			const cc = instantiateCatmullCurve(pdp0.vertex, pdp1.vertex, pdp2.vertex, pdp3.vertex)

			const rendv1 = instantiateT()
			rendv1.set(pdp1.vertex.x, pdp1.vertex.y, pdp1.vertex.z)
			rendv1.fSmooth = pdp1.fSmooth
			rendv1.fSlingshot = pdp1.fSlingshot
			rendv1.fControlPoint = true
			rendv2.set(pdp2.vertex.x, pdp2.vertex.y, pdp2.vertex.z)

			vv = DragPoint.recurseSmoothLine(vv, cc, 0, 1, rendv1, rendv2, accuracy)
		}

		if (!loop) {
			rendv2.fSmooth = true
			rendv2.fSlingshot = false
			rendv2.fControlPoint = false
			vv.push(rendv2)
		}
		return vv
	}

	public static getTextureCoords(dragPoints: DragPoint[], vv: RenderVertex[]): number[] {
		const vitexpoints: number[] = []
		const virenderpoints: number[] = []
		let fNoCoords = false
		const cpoints = vv.length
		let icontrolpoint = 0
		const ppcoords: number[] = []

		for (let i = 0; i < cpoints; i++) {
			const prv = vv[i]
			if (prv.fControlPoint) {
				if (!dragPoints[icontrolpoint].fAutoTexture) {
					vitexpoints.push(icontrolpoint)
					virenderpoints.push(i)
				}
				icontrolpoint++
			}
		}

		if (vitexpoints.length === 0) {
			vitexpoints.push(0)
			virenderpoints.push(0)
			fNoCoords = true
		}

		vitexpoints.push(vitexpoints[0] + dragPoints.length)
		virenderpoints.push(virenderpoints[0] + cpoints)

		for (let i = 0; i < vitexpoints.length - 1; i++) {
			const startrenderpoint = virenderpoints[i] % cpoints
			let endrenderpoint = virenderpoints[i < cpoints - 1 ? i + 1 : 0] % cpoints
			let startTexCoord: number, endtexcoord: number
			if (fNoCoords) {
				startTexCoord = 0
				endtexcoord = 1
			} else {
				startTexCoord = dragPoints[vitexpoints[i] % dragPoints.length].texturecoord
				endtexcoord = dragPoints[vitexpoints[i + 1] % dragPoints.length].texturecoord
			}
			const deltacoord = endtexcoord - startTexCoord
			if (endrenderpoint <= startrenderpoint) endrenderpoint += cpoints

			let totalLength = 0
			for (let l = startrenderpoint; l < endrenderpoint; l++) {
				const pv1 = vv[l % cpoints],
					pv2 = vv[(l + 1) % cpoints]
				const dx = pv1.x - pv2.x
				const dy = pv1.y - pv2.y
				totalLength += Math.sqrt(dx * dx + dy * dy)
			}
			let partialLength = 0
			for (let l = startrenderpoint; l < endrenderpoint; l++) {
				const pv1 = vv[l % cpoints],
					pv2 = vv[(l + 1) % cpoints]
				const dx = pv1.x - pv2.x
				const dy = pv1.y - pv2.y
				const length = Math.sqrt(dx * dx + dy * dy)
				if (totalLength === 0) totalLength = 1
				const texCoord = partialLength / totalLength
				ppcoords[l % cpoints] = texCoord * deltacoord + startTexCoord
				partialLength += length
			}
		}
		return ppcoords
	}

	private static recurseSmoothLine<T extends IRenderVertex>(
		vv: T[] = [],
		cc: CatmullCurve,
		t1: number,
		t2: number,
		vt1: T,
		vt2: T,
		accuracy: number,
	): T[] {
		const tMid = (t1 + t2) * 0.5
		const vmid = cc.getPointAt(tMid) as T
		vmid.fSmooth = true
		vmid.fSlingshot = false
		vmid.fControlPoint = false
		if (DragPoint.flatWithAccuracy(vt1, vt2, vmid, accuracy)) vv.push(vt1)
		else {
			vv = DragPoint.recurseSmoothLine<T>(vv, cc, t1, tMid, vt1, vmid, accuracy)
			vv = DragPoint.recurseSmoothLine<T>(vv, cc, tMid, t2, vmid, vt2, accuracy)
		}
		return vv
	}

	private static flatWithAccuracy(
		v1: IRenderVertex,
		v2: IRenderVertex,
		vMid: IRenderVertex,
		accuracy: number,
	): boolean {
		return v1.isVector3 && v2.isVector3 && vMid.isVector3
			? DragPoint.flatWithAccuracy3(
					v1 as unknown as Vertex3D,
					v2 as unknown as Vertex3D,
					vMid as unknown as Vertex3D,
					accuracy,
				)
			: DragPoint.flatWithAccuracy2(v1, v2, vMid, accuracy)
	}

	private static flatWithAccuracy2(
		v1: IRenderVertex,
		v2: IRenderVertex,
		vMid: IRenderVertex,
		accuracy: number,
	): boolean {
		const dblArea = (vMid.x - v1.x) * (v2.y - v1.y) - (v2.x - v1.x) * (vMid.y - v1.y)
		return dblArea * dblArea < accuracy
	}

	private static flatWithAccuracy3(v1: Vertex3D, v2: Vertex3D, vMid: Vertex3D, accuracy: number): boolean {
		const cross = vMid.clone().sub(v1).cross(v2.clone().sub(v1))
		return cross.lengthSq() < accuracy
	}

	public async fromTag(buffer: Uint8Array, tag: string): Promise<number> {
		switch (tag) {
			case 'VCEN':
				this.vertex = Vertex3D.get(buffer)
				break
			case 'POSZ':
				this.vertex.z = this.getFloat(buffer)
				break
			case 'SMTH':
				this.fSmooth = this.getBool(buffer)
				break
			case 'SLNG':
				this.fSlingshot = this.getBool(buffer)
				break
			case 'ATEX':
				this.fAutoTexture = this.getBool(buffer)
				break
			case 'TEXC':
				this.texturecoord = this.getFloat(buffer)
				break
		}
		return 0
	}
}
