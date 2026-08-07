// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix3D } from '../../util/math.js'
import { Vertex3DNoTex2 } from '../../util/vertex.js'
import { Enums } from '../enums.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { PlungerData } from './plunger-data.js'
import { PlungerDesc } from './plunger-desc.js'

const FRAME_COUNT = 25

/** Generates plunger rod/spring/flat meshes. @see https://github.com/vpinball/vpinball/blob/master/plunger.cpp */
export class PlungerMeshGenerator {
	private readonly cache: Record<number, { rod?: Mesh; spring?: Mesh; flat?: Mesh }> = {}
	public readonly cFrames: number
	private readonly stroke: number
	private readonly beginY: number
	private readonly endY: number
	private readonly invScale: number
	private readonly dyPerFrame: number
	private readonly circlePoints: number
	private readonly srcCells: number
	private readonly cellWid: number
	private zHeight = 0
	private zScale = 1
	private rodY: number
	private springLoops = 0
	private springEndLoops = 0
	private springGauge = 0
	private springRadius = 0
	private readonly springMinSpacing = 2.2
	private lathePoints!: number
	private vtsPerFrame!: number
	private indicesPerFrame!: number
	private desc!: PlungerDesc

	constructor(private readonly data: PlungerData) {
		this.stroke = data.stroke!
		this.beginY = data.center.y
		this.endY = data.center.y - this.stroke
		this.cFrames = Math.floor(FRAME_COUNT * (this.stroke / 80)) + 1
		this.invScale = this.cFrames > 1 ? 1 / (this.cFrames - 1) : 0
		this.dyPerFrame = (this.endY - this.beginY) * this.invScale
		this.circlePoints = data.type === Enums.PlungerType.PlungerTypeFlat ? 0 : 24
		this.rodY = this.beginY + data.height
		this.srcCells = Math.max(1, data.animFrames || 1)
		this.cellWid = 1 / this.srcCells
	}

	public generateMeshes(frame: number, table: Table): { rod?: Mesh; spring?: Mesh; flat?: Mesh } {
		if (this.cache[frame]) return this.cache[frame]!
		this.zHeight =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) + this.data.zAdjust
		this.zScale = table.getScaleZ()
		this.desc = this.getDesc()
		this.lathePoints = this.desc.n
		this.calcFrameDetails()
		if (this.data.type === Enums.PlungerType.PlungerTypeFlat) {
			this.cache[frame] = { flat: this.buildFlat(frame).transform(Matrix3D.RIGHT_HANDED) }
		} else {
			const rod = this.buildRod(frame).transform(Matrix3D.RIGHT_HANDED)
			const spring = this.buildSpring(frame, rod.vertices).transform(Matrix3D.RIGHT_HANDED)
			this.cache[frame] = { rod, spring }
		}
		return this.cache[frame]!
	}

	private getDesc(): PlungerDesc {
		switch (this.data.type) {
			case Enums.PlungerType.PlungerTypeModern:
				return PlungerDesc.getModern()
			case Enums.PlungerType.PlungerTypeFlat:
				return PlungerDesc.getFlat()
			case Enums.PlungerType.PlungerTypeCustom: {
				const r = PlungerDesc.getCustom(this.data, this.beginY, this.springMinSpacing)
				this.rodY = r.rody
				this.springGauge = r.springGauge
				this.springRadius = r.springRadius
				this.springLoops = r.springLoops
				this.springEndLoops = r.springEndLoops
				return r.desc
			}
			default:
				throw new Error(`Unknown plunger type ${this.data.type}`)
		}
	}

	private calcFrameDetails(): void {
		if (this.data.type === Enums.PlungerType.PlungerTypeFlat) {
			this.vtsPerFrame = 4
			this.indicesPerFrame = 6
			return
		}
		const latheVts = this.lathePoints * this.circlePoints
		const springVts = Math.floor((this.springLoops + this.springEndLoops) * this.circlePoints) * 3
		this.vtsPerFrame = latheVts + springVts
		const latheIdx = 6 * this.circlePoints * (this.lathePoints - 1)
		const springIdx = this.data.type === Enums.PlungerType.PlungerTypeCustom ? Math.max(0, 4 * springVts - 12) : 0
		this.indicesPerFrame = latheIdx + springIdx
	}

	private buildRod(i: number): Mesh {
		const mesh = new Mesh('rod')
		const yTip = this.beginY + this.dyPerFrame * i
		const stepU = 1 / this.circlePoints
		let tu = 0.51
		for (let l = 0; l < this.circlePoints; l++) {
			if (tu > 1) tu -= 1
			const angle = ((Math.PI * 2) / this.circlePoints) * l
			const sn = Math.sin(angle),
				cs = Math.cos(angle)
			for (let m = 0; m < this.lathePoints; m++) {
				const c = this.desc.c[m]!
				let y = c.y + yTip,
					tv = c.tv
				if (m + 1 === this.lathePoints) {
					y = this.rodY
					tv = mesh.vertices[m - 1]!.tv + (tv - mesh.vertices[m - 1]!.tv) * (i * this.invScale)
				}
				const r = c.r
				const pm = new Vertex3DNoTex2()
				pm.x = r * (sn * this.data.width) + this.data.center.x
				pm.y = y
				pm.z = (r * (cs * this.data.width) + this.data.width + this.zHeight) * this.zScale
				pm.nx = c.nx * sn
				pm.ny = c.ny
				pm.nz = -c.nx * cs
				pm.tu = tu
				pm.tv = tv
				mesh.vertices.push(pm)
			}
			tu += stepU
		}
		const latheVts = this.lathePoints * this.circlePoints
		for (let l = 0, k = 0; l < this.circlePoints; l++) {
			const off = l * this.lathePoints
			for (let m = 0; m < this.lathePoints - 1; m++) {
				const a = (m + off) % latheVts,
					b = (m + off + this.lathePoints) % latheVts
				mesh.indices[k++] = a
				mesh.indices[k++] = b
				mesh.indices[k++] = (m + off + 1 + this.lathePoints) % latheVts
				mesh.indices[k++] = (m + off + 1 + this.lathePoints) % latheVts
				mesh.indices[k++] = (m + off + 1) % latheVts
				mesh.indices[k++] = a
			}
		}
		return mesh
	}

	private buildSpring(i: number, rodVertices: Vertex3DNoTex2[]): Mesh {
		const mesh = new Mesh('spring')
		const gaugeRel = this.springGauge / this.data.width
		const off = this.circlePoints * this.lathePoints
		const y0 = rodVertices[off - 2]!.y
		let n = Math.floor((this.springLoops + this.springEndLoops) * this.circlePoints)
		const nEnd = Math.floor(this.springEndLoops * this.circlePoints)
		const nMain = n - nEnd
		const yEnd = this.springEndLoops * this.springGauge * this.springMinSpacing
		const dyMain = nMain > 1 ? (this.rodY - y0 - yEnd) / (nMain - 1) : 0
		let dy = nEnd > 1 ? yEnd / (nEnd - 1) : 0
		const dTheta = (Math.PI * 2) / (this.circlePoints - 1) + (n > 1 ? Math.PI / (n - 1) : 0)
		for (let theta = Math.PI, y = y0; n !== 0; --n, theta += dTheta, y += dy) {
			if (n === nMain) dy = dyMain
			if (theta >= Math.PI * 2) theta -= Math.PI * 2
			const sn = Math.sin(theta),
				cs = Math.cos(theta)
			const w = this.data.width,
				cx = this.data.center.x,
				zh = this.zHeight,
				zs = this.zScale,
				sr = this.springRadius,
				sg = this.springGauge
			mesh.vertices.push(
				Object.assign(new Vertex3DNoTex2(), {
					x: sr * (sn * w) + cx,
					y: y - sg,
					z: (sr * (cs * w) + w + zh) * zs,
					nx: 0,
					ny: -1,
					nz: 0,
					tu: (sn + 1) * 0.5,
					tv: 0.76,
				}),
			)
			mesh.vertices.push(
				Object.assign(new Vertex3DNoTex2(), {
					x: (sr + gaugeRel / 1.5) * (sn * w) + cx,
					y,
					z: ((sr + gaugeRel / 1.5) * (cs * w) + w + zh) * zs,
					nx: sn,
					ny: 0,
					nz: -cs,
					tu: (sn + 1) * 0.5,
					tv: 0.85,
				}),
			)
			mesh.vertices.push(
				Object.assign(new Vertex3DNoTex2(), {
					x: sr * (sn * w) + cx,
					y: y + sg,
					z: (sr * (cs * w) + w + zh) * zs,
					nx: 0,
					ny: 1,
					nz: 0,
					tu: (sn + 1) * 0.5,
					tv: 0.98,
				}),
			)
		}
		for (let idx = 0, k = 0; idx < mesh.vertices.length - 3; idx += 3) {
			const nz = mesh.vertices[idx + 1]!.nz
			if (nz <= 0) {
				mesh.indices[k++] = idx
				mesh.indices[k++] = idx + 3
				mesh.indices[k++] = idx + 1
				mesh.indices[k++] = idx + 1
				mesh.indices[k++] = idx + 3
				mesh.indices[k++] = idx + 4
				mesh.indices[k++] = idx + 4
				mesh.indices[k++] = idx + 5
				mesh.indices[k++] = idx + 2
				mesh.indices[k++] = idx + 2
				mesh.indices[k++] = idx + 1
				mesh.indices[k++] = idx + 4
			} else {
				mesh.indices[k++] = idx + 3
				mesh.indices[k++] = idx
				mesh.indices[k++] = idx + 4
				mesh.indices[k++] = idx + 4
				mesh.indices[k++] = idx
				mesh.indices[k++] = idx + 1
				mesh.indices[k++] = idx + 1
				mesh.indices[k++] = idx + 2
				mesh.indices[k++] = idx + 5
				mesh.indices[k++] = idx + 5
				mesh.indices[k++] = idx + 1
				mesh.indices[k++] = idx + 2
			}
		}
		return mesh
	}

	private buildFlat(i: number): Mesh {
		const yTip = this.beginY + this.dyPerFrame * i
		const xLt = this.data.center.x - this.data.width,
			xRt = this.data.center.x + this.data.width
		const yTop = yTip,
			yBot = this.beginY + this.data.height
		const z = (this.zHeight + this.data.width * 1.25) * this.zScale
		let idx = this.srcCells - 1 - Math.floor((i * this.srcCells) / this.cFrames + 0.5)
		if (idx < 0) idx = 0
		const tu = this.cellWid * idx,
			tv = (yBot - yTop) / (this.beginY + this.data.height - this.endY)
		const mesh = new Mesh('flat')
		mesh.vertices[0] = Vertex3DNoTex2.fromArray([xLt, yBot, z, 0, 0, -1, tu, tv])
		mesh.vertices[1] = Vertex3DNoTex2.fromArray([xLt, yTop, z, 0, 0, -1, tu, 0])
		mesh.vertices[2] = Vertex3DNoTex2.fromArray([xRt, yTop, z, 0, 0, -1, tu + this.cellWid, 0])
		mesh.vertices[3] = Vertex3DNoTex2.fromArray([xRt, yBot, z, 0, 0, -1, tu + this.cellWid, tv])
		mesh.indices.push(0, 1, 2, 2, 3, 0)
		return mesh
	}
}
