// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../io/biff-parser.js'
import type { CatmullCurve } from './catmull-curve.js'
import { f4 } from './float.js'
import type { IRenderVertex, Vertex } from './vertex.js'
import type { RenderVertex } from './vertex2d.js'
import { Vertex3D } from './vertex3d.js'

export const HIT_SHAPE_DETAIL_LEVEL = 7.0

/** Editable spline point (rubber, wall, etc.). */
export class DragPoint extends BiffParser {
	public vertex!: Vertex3D
	public fSmooth!: boolean
	public fSlingshot!: boolean
	public fAutoTexture!: boolean
	public texturecoord!: number
	public calcHeight?: number

	/** Generates render vertices from drag points. */
	public static getRgVertex<T extends IRenderVertex>(
		dragPoints: DragPoint[],
		instantiateT: () => T,
		instantiateCatmullCurve: (pdp0: Vertex, pdp1: Vertex, pdp2: Vertex, pdp3: Vertex) => CatmullCurve,
		loop = true,
		accuracy = 4.0,
	): T[] {
		let out: T[] = []
		const n = dragPoints.length
		const end = loop ? n : n - 1
		const tail = instantiateT()

		for (let i = 0; i < end; i++) {
			const p1 = dragPoints[i]
			const p2 = dragPoints[i < n - 1 ? i + 1 : 0]
			if (p1.vertex.x === p2.vertex.x && p1.vertex.y === p2.vertex.y && p1.vertex.z === p2.vertex.z) continue

			let iPrev = p1.fSmooth ? i - 1 : i
			if (iPrev < 0) iPrev = loop ? n - 1 : 0
			let iNext = p2.fSmooth ? i + 2 : i + 1
			if (iNext >= n) iNext = loop ? iNext - n : n - 1

			const cc = instantiateCatmullCurve(dragPoints[iPrev].vertex, p1.vertex, p2.vertex, dragPoints[iNext].vertex)
			const v1 = instantiateT()
			v1.set(p1.vertex.x, p1.vertex.y, p1.vertex.z)
			v1.fSmooth = p1.fSmooth
			v1.fSlingshot = p1.fSlingshot
			v1.fControlPoint = true
			tail.set(p2.vertex.x, p2.vertex.y, p2.vertex.z)
			out = DragPoint.recurseSmoothLine(out, cc, 0, 1, v1, tail, accuracy)
		}
		if (!loop) {
			tail.fSmooth = true
			tail.fSlingshot = false
			tail.fControlPoint = false
			out.push(tail)
		}
		return out
	}

	/** Computes texture coordinates along a drag-point path. */
	public static getTextureCoords(dragPoints: DragPoint[], verts: RenderVertex[]): number[] {
		const texIdx: number[] = []
		const renderIdx: number[] = []
		let autoOnly = false
		const n = verts.length
		let ctrl = 0
		const coords: number[] = []

		for (let i = 0; i < n; i++) {
			if (!verts[i].fControlPoint) continue
			if (!dragPoints[ctrl].fAutoTexture) {
				texIdx.push(ctrl)
				renderIdx.push(i)
			}
			ctrl++
		}
		if (texIdx.length === 0) {
			texIdx.push(0)
			renderIdx.push(0)
			autoOnly = true
		}
		texIdx.push(texIdx[0] + dragPoints.length)
		renderIdx.push(renderIdx[0] + n)

		for (let i = 0; i < texIdx.length - 1; i++) {
			const start = renderIdx[i] % n
			let end = renderIdx[i < n - 1 ? i + 1 : 0] % n
			const t0 = autoOnly ? 0 : dragPoints[texIdx[i] % dragPoints.length].texturecoord
			const t1 = autoOnly ? 1 : dragPoints[texIdx[i + 1] % dragPoints.length].texturecoord
			const delta = t1 - t0
			if (end <= start) end += n

			let total = 0
			for (let l = start; l < end; l++) {
				const a = verts[l % n],
					b = verts[(l + 1) % n]
				const dx = f4(a.x - b.x),
					dy = f4(a.y - b.y)
				total = f4(total + f4(Math.sqrt(f4(dx * dx) + f4(dy * dy))))
			}
			let partial = 0
			for (let l = start; l < end; l++) {
				const a = verts[l % n],
					b = verts[(l + 1) % n]
				const dx = f4(a.x - b.x),
					dy = f4(a.y - b.y)
				const len = f4(Math.sqrt(f4(dx * dx) + f4(dy * dy)))
				if (total === 0) total = 1
				coords[l % n] = f4(partial / total) * delta + t0
				partial = f4(partial + len)
			}
		}
		return coords
	}

	private static recurseSmoothLine<T extends IRenderVertex>(
		out: T[] = [],
		cc: CatmullCurve,
		t1: number,
		t2: number,
		v1: T,
		v2: T,
		accuracy: number,
	): T[] {
		const tMid = f4((t1 + t2) * 0.5)
		const mid = cc.getPointAt(tMid) as T
		mid.fSmooth = true
		mid.fSlingshot = false
		mid.fControlPoint = false
		if (DragPoint.flatWithAccuracy(v1, v2, mid, accuracy)) out.push(v1)
		else {
			out = DragPoint.recurseSmoothLine(out, cc, t1, tMid, v1, mid, accuracy)
			out = DragPoint.recurseSmoothLine(out, cc, tMid, t2, mid, v2, accuracy)
		}
		return out
	}

	private static flatWithAccuracy(v1: IRenderVertex, v2: IRenderVertex, mid: IRenderVertex, acc: number): boolean {
		return v1.isVector3 && v2.isVector3 && mid.isVector3
			? DragPoint.flatWithAccuracy3(v1 as any, v2 as any, mid as any, acc)
			: DragPoint.flatWithAccuracy2(v1, v2, mid, acc)
	}

	private static flatWithAccuracy2(v1: IRenderVertex, v2: IRenderVertex, mid: IRenderVertex, acc: number): boolean {
		const area = f4(f4(mid.x - v1.x) * f4(v2.y - v1.y)) - f4(f4(v2.x - v1.x) * f4(mid.y - v1.y))
		return f4(area * area) < acc
	}

	private static flatWithAccuracy3(v1: Vertex3D, v2: Vertex3D, mid: Vertex3D, acc: number): boolean {
		return mid.clone().sub(v1).cross(v2.clone().sub(v1)).lengthSq() < acc
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
