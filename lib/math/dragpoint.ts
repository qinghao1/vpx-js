// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../io/biff-parser.js'
import type { CatmullCurve } from './catmull-curve.js'
import { f4 } from './float.js'
import type { IRenderVertex, Vertex } from './vertex.js'
import type { RenderVertex } from './vertex2d.js'
import { Vertex3D } from './vertex3d.js'

export const HIT_SHAPE_DETAIL_LEVEL = 7.0

/** Editable spline point. */
export class DragPoint extends BiffParser {
	vertex!: Vertex3D
	fSmooth!: boolean
	fSlingshot!: boolean
	fAutoTexture!: boolean
	texturecoord!: number
	calcHeight?: number

	/** Generates render vertices between drag points. */
	static getRgVertex<T extends IRenderVertex>(
		dragPoints: DragPoint[],
		create: () => T,
		curve: (a: Vertex, b: Vertex, c: Vertex, d: Vertex) => CatmullCurve,
		loop = true,
		accuracy = 4.0,
	): T[] {
		const out: T[] = []
		const n = dragPoints.length
		const end = loop ? n : n - 1
		const tail = create()

		for (let i = 0; i < end; i++) {
			const p1 = dragPoints[i]
			const p2 = dragPoints[i < n - 1 ? i + 1 : 0]
			if (p1.vertex.equals(p2.vertex)) continue

			const iPrev = p1.fSmooth ? (i - 1 < 0 ? (loop ? n - 1 : 0) : i - 1) : i
			const iNext = p2.fSmooth ? (i + 2 >= n ? (loop ? i + 2 - n : n - 1) : i + 2) : i + 1
			const ccKind = curve as any
			const cc: CatmullCurve = ccKind(dragPoints[iPrev].vertex, p1.vertex, p2.vertex, dragPoints[iNext].vertex)

			const v1 = create()
			v1.set(p1.vertex.x, p1.vertex.y, (p1.vertex as any).z ?? 0)
			v1.fSmooth = p1.fSmooth
			v1.fSlingshot = p1.fSlingshot
			v1.fControlPoint = true
			tail.set(p2.vertex.x, p2.vertex.y, (p2.vertex as any).z ?? 0)
			DragPoint.recurse(out, cc, 0, 1, v1, tail, accuracy)
		}
		if (!loop) {
			tail.fSmooth = true
			tail.fSlingshot = false
			tail.fControlPoint = false
			out.push(tail)
		}
		return out
	}

	/** Computes texture coordinates along path. */
	static getTextureCoords(dragPoints: DragPoint[], verts: RenderVertex[]): number[] {
		const n = verts.length
		const texIdx: number[] = []
		const renderIdx: number[] = []
		let ctrl = 0
		for (let i = 0; i < n; i++) {
			if (!verts[i].fControlPoint) continue
			if (!dragPoints[ctrl].fAutoTexture) {
				texIdx.push(ctrl)
				renderIdx.push(i)
			}
			ctrl++
		}
		let autoOnly = false
		if (!texIdx.length) {
			texIdx.push(0)
			renderIdx.push(0)
			autoOnly = true
		}
		texIdx.push(texIdx[0] + dragPoints.length)
		renderIdx.push(renderIdx[0] + n)

		const coords: number[] = []
		for (let i = 0; i < texIdx.length - 1; i++) {
			const start = renderIdx[i] % n
			let end = renderIdx[i + 1] % n
			if (end <= start) end += n
			const t0 = autoOnly ? 0 : dragPoints[texIdx[i] % dragPoints.length].texturecoord
			const t1 = autoOnly ? 1 : dragPoints[texIdx[i + 1] % dragPoints.length].texturecoord
			const delta = t1 - t0

			let total = 0
			for (let l = start; l < end; l++) {
				const a = verts[l % n],
					b = verts[(l + 1) % n]
				total += Math.hypot(f4(a.x - b.x), f4(a.y - b.y))
			}
			if (total === 0) total = 1
			let partial = 0
			for (let l = start; l < end; l++) {
				const a = verts[l % n],
					b = verts[(l + 1) % n]
				const len = Math.hypot(f4(a.x - b.x), f4(a.y - b.y))
				coords[l % n] = (partial / total) * delta + t0
				partial += len
			}
		}
		return coords
	}

	private static recurse<T extends IRenderVertex>(
		out: T[],
		cc: CatmullCurve,
		t1: number,
		t2: number,
		v1: T,
		v2: T,
		acc: number,
	): void {
		const tMid = f4((t1 + t2) * 0.5)
		const mid = cc.getPointAt(tMid) as T
		mid.fSmooth = true
		mid.fSlingshot = false
		mid.fControlPoint = false
		if (DragPoint.isFlat(v1, v2, mid, acc)) out.push(v1)
		else {
			DragPoint.recurse(out, cc, t1, tMid, v1, mid, acc)
			DragPoint.recurse(out, cc, tMid, t2, mid, v2, acc)
		}
	}

	private static isFlat(v1: IRenderVertex, v2: IRenderVertex, mid: IRenderVertex, acc: number): boolean {
		return v1.isVector3 ? DragPoint.flat3(v1 as any, v2 as any, mid as any, acc) : DragPoint.flat2(v1, v2, mid, acc)
	}

	private static flat2(a: IRenderVertex, b: IRenderVertex, m: IRenderVertex, acc: number): boolean {
		const area = (m.x - a.x) * (b.y - a.y) - (b.x - a.x) * (m.y - a.y)
		return area * area < acc
	}

	private static flat3(a: Vertex3D, b: Vertex3D, m: Vertex3D, acc: number): boolean {
		return m.clone().sub(a).cross(b.clone().sub(a)).lengthSq() < acc
	}

	async fromTag(buffer: Uint8Array, tag: string): Promise<number> {
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
