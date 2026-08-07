// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix3D } from '../../math/matrix3d.js'
import { Vertex3DNoTex2 } from '../../math/vertex.js'
import { Enums } from '../enums.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { PlungerData } from './plunger-data.js'
import { PlungerDesc } from './plunger-desc.js'

const PLUNGER_FRAME_COUNT = 25

/** Plunger mesh generator. */
export class PlungerMeshGenerator {
	private readonly data: PlungerData
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

	constructor(data: PlungerData) {
		this.data = data
		this.stroke = data.stroke!
		this.beginY = data.center.y
		this.endY = data.center.y - this.stroke
		this.cFrames = Math.floor(PLUNGER_FRAME_COUNT * (this.stroke / 80)) + 1
		this.invScale = this.cFrames > 1 ? 1 / (this.cFrames - 1) : 0
		this.dyPerFrame = (this.endY - this.beginY) * this.invScale
		this.circlePoints = data.type === Enums.PlungerType.PlungerTypeFlat ? 0 : 24
		this.rodY = this.beginY + data.height
		this.srcCells = Math.max(1, data.animFrames || 1)
		this.cellWid = 1 / this.srcCells
	}

	public generateMeshes(frame: number, table: Table): { rod?: Mesh; spring?: Mesh; flat?: Mesh } {
		if (this.cache[frame]) return this.cache[frame]
		this.zHeight =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) + this.data.zAdjust
		this.zScale = table.getScaleZ()
		this.desc = this.getDesc()
		this.lathePoints = this.desc.n
		this.calculateFrameRenderingDetails()

		if (this.data.type === Enums.PlungerType.PlungerTypeFlat) {
			this.cache[frame] = { flat: this.buildFlatMesh(frame).transform(Matrix3D.RIGHT_HANDED) }
		} else {
			const rod = this.buildRodMesh(frame).transform(Matrix3D.RIGHT_HANDED)
			const spring = this.buildSpringMesh(frame, rod.vertices).transform(Matrix3D.RIGHT_HANDED)
			this.cache[frame] = { rod, spring }
		}
		return this.cache[frame]
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
		}
		throw new Error(`Unknown plunger type ${this.data.type}`)
	}

	private calculateFrameRenderingDetails(): void {
		if (this.data.type === Enums.PlungerType.PlungerTypeFlat) {
			this.vtsPerFrame = 4
			this.indicesPerFrame = 6
			return
		}
		const latheVts = this.lathePoints * this.circlePoints
		const springVts = Math.floor((this.springLoops + this.springEndLoops) * this.circlePoints) * 3
		this.vtsPerFrame = latheVts + springVts
		const latheIndices = 6 * this.circlePoints * (this.lathePoints - 1)
		let springIndices = 0
		if (this.data.type === Enums.PlungerType.PlungerTypeCustom) {
			springIndices = Math.max(0, 4 * springVts - 12)
		}
		this.indicesPerFrame = latheIndices + springIndices
	}

	/** Build rod lathe mesh for frame `i`. */
	private buildRodMesh(i: number): Mesh {
		const mesh = new Mesh('rod')
		const yTip = this.beginY + this.dyPerFrame * i
		const stepU = 1 / this.circlePoints
		let tu = 0.51
		for (let l = 0, offset = 0; l < this.circlePoints; l++, offset += this.lathePoints, tu += stepU) {
			if (tu > 1) tu -= 1
			const angle = ((Math.PI * 2) / this.circlePoints) * l
			const sn = Math.sin(angle)
			const cs = Math.cos(angle)
			for (let m = 0; m < this.lathePoints; m++) {
				const c = this.desc.c[m]
				let y = c.y + yTip
				let tv = c.tv
				if (m + 1 === this.lathePoints) {
					y = this.rodY
					tv = mesh.vertices[m - 1].tv + (tv - mesh.vertices[m - 1].tv) * (i * this.invScale)
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
		}
		let k = 0
		const latheVts = this.lathePoints * this.circlePoints
		for (let l = 0, offset = 0; l < this.circlePoints; l++, offset += this.lathePoints) {
			for (let m = 0; m < this.lathePoints - 1; m++) {
				mesh.indices[k++] = (m + offset) % latheVts
				mesh.indices[k++] = (m + offset + this.lathePoints) % latheVts
				mesh.indices[k++] = (m + offset + 1 + this.lathePoints) % latheVts
				mesh.indices[k++] = (m + offset + 1 + this.lathePoints) % latheVts
				mesh.indices[k++] = (m + offset + 1) % latheVts
				mesh.indices[k++] = (m + offset) % latheVts
			}
		}
		return mesh
	}

	/** Build spring wedge mesh for frame `i`. */
	private buildSpringMesh(i: number, rodVertices: Vertex3DNoTex2[]): Mesh {
		const mesh = new Mesh('spring')
		const springGaugeRel = this.springGauge / this.data.width
		const offset = this.circlePoints * this.lathePoints
		const y0 = rodVertices[offset - 2].y
		const y1 = this.rodY
		let n = Math.floor((this.springLoops + this.springEndLoops) * this.circlePoints)
		const nEnd = Math.floor(this.springEndLoops * this.circlePoints)
		const nMain = n - nEnd
		const yEnd = this.springEndLoops * this.springGauge * this.springMinSpacing
		const dyMain = nMain > 1 ? (y1 - y0 - yEnd) / (nMain - 1) : 0
		let dy = nEnd > 1 ? yEnd / (nEnd - 1) : 0
		const dTheta = (Math.PI * 2) / (this.circlePoints - 1) + (n > 1 ? Math.PI / (n - 1) : 0)
		for (let theta = Math.PI, y = y0; n !== 0; --n, theta += dTheta, y += dy) {
			if (n === nMain) dy = dyMain
			if (theta >= Math.PI * 2) theta -= Math.PI * 2
			const sn = Math.sin(theta)
			const cs = Math.cos(theta)

			let pm = new Vertex3DNoTex2()
			pm.x = this.springRadius * (sn * this.data.width) + this.data.center.x
			pm.y = y - this.springGauge
			pm.z = (this.springRadius * (cs * this.data.width) + this.data.width + this.zHeight) * this.zScale
			pm.nx = 0
			pm.ny = -1
			pm.nz = 0
			pm.tu = (sn + 1) * 0.5
			pm.tv = 0.76
			mesh.vertices.push(pm)

			pm = new Vertex3DNoTex2()
			pm.x = (this.springRadius + springGaugeRel / 1.5) * (sn * this.data.width) + this.data.center.x
			pm.y = y
			pm.z =
				((this.springRadius + springGaugeRel / 1.5) * (cs * this.data.width) + this.data.width + this.zHeight) *
				this.zScale
			pm.nx = sn
			pm.ny = 0
			pm.nz = -cs
			pm.tu = (sn + 1) * 0.5
			pm.tv = 0.85
			mesh.vertices.push(pm)

			pm = new Vertex3DNoTex2()
			pm.x = this.springRadius * (sn * this.data.width) + this.data.center.x
			pm.y = y + this.springGauge
			pm.z = (this.springRadius * (cs * this.data.width) + this.data.width + this.zHeight) * this.zScale
			pm.nx = 0
			pm.ny = 1
			pm.nz = 0
			pm.tu = (sn + 1) * 0.5
			pm.tv = 0.98
			mesh.vertices.push(pm)
		}

		let k = 0
		for (let idx = 0; idx < mesh.vertices.length - 3; idx += 3) {
			const v = mesh.vertices[idx + 1]
			if (v.nz <= 0) {
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

	/** Flat plunger — alpha image on a rectangle. */
	private buildFlatMesh(i: number): Mesh {
		const mesh = new Mesh('flat')
		const yTip = this.beginY + this.dyPerFrame * i
		const xLt = this.data.center.x - this.data.width
		const xRt = this.data.center.x + this.data.width
		const yTop = yTip
		const yBot = this.beginY + this.data.height
		const z = (this.zHeight + this.data.width * 1.25) * this.zScale
		let cellIdx = this.srcCells - 1 - Math.floor((i * this.srcCells) / this.cFrames + 0.5)
		if (cellIdx < 0) cellIdx = 0
		const tuLocal = this.cellWid * cellIdx
		const tvLocal = (yBot - yTop) / (this.beginY + this.data.height - this.endY)

		mesh.vertices[0] = Vertex3DNoTex2.fromArray([xLt, yBot, z, 0, 0, -1, tuLocal, tvLocal])
		mesh.vertices[1] = Vertex3DNoTex2.fromArray([xLt, yTop, z, 0, 0, -1, tuLocal, 0])
		mesh.vertices[2] = Vertex3DNoTex2.fromArray([xRt, yTop, z, 0, 0, -1, tuLocal + this.cellWid, 0])
		mesh.vertices[3] = Vertex3DNoTex2.fromArray([xRt, yBot, z, 0, 0, -1, tuLocal + this.cellWid, tvLocal])
		mesh.indices[0] = 0
		mesh.indices[1] = 1
		mesh.indices[2] = 2
		mesh.indices[3] = 2
		mesh.indices[4] = 3
		mesh.indices[5] = 0
		return mesh
	}
}
