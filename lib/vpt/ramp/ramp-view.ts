// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Meshes, RenderInfo } from '../../game/irenderable.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { CatmullCurve3D } from '../../util/catmull-curve.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex2D, Vertex3D } from '../../util/vector.js'
import { RenderVertex3D, Vertex3DNoTex2 } from '../../util/vertex.js'
import { DragPoint } from '../dragpoint.js'
import { Enums } from '../enums.js'
import { ItemUpdater } from '../item-updater.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { RampData } from './ramp-data.js'
import type { RampState } from './ramp-state.js'

export interface RampMeshes {
	wire1?: Mesh
	wire2?: Mesh
	wire3?: Mesh
	wire4?: Mesh
	floor?: Mesh
	left?: Mesh
	right?: Mesh
}

export interface RampVertexResult {
	pcvertex: number
	ppheight: number[]
	ppfCross: boolean[]
	ppratio: number[]
	pMiddlePoints: Vertex2D[]
	rgvLocal: Vertex2D[]
}

/** Ramp mesh generator. */
export class RampMeshGenerator {
	private readonly data: RampData
	private readonly state: RampState

	constructor(data: RampData, state: RampState) {
		this.data = data
		this.state = state
	}

	public getMeshes<GEOMETRY>(isTransparent: boolean, table: Table): Meshes<GEOMETRY> {
		const ramp = this.generateMeshes(table)
		const material = table.getMaterial(this.data.szMaterial)
		const map = table.getTexture(this.data.szImage)
		const meshes: Meshes<GEOMETRY> = {}
		for (const key of ['wire1', 'wire2', 'wire3', 'wire4', 'floor', 'left', 'right'] as const) {
			const mesh = ramp[key]
			if (!mesh) continue
			meshes[key] = {
				isVisible: this.data.isVisible,
				mesh: mesh.transform(Matrix3D.RIGHT_HANDED),
				material,
				...(key === 'floor' || key === 'left' || key === 'right' ? { map } : {}),
				isTransparent,
			}
		}
		return meshes
	}

	public generateMeshes(table: Table): RampMeshes {
		if (!this.isHabitrail()) return this.generateFlatMesh(table)
		const [a, b] = this.generateWireMeshes(table)
		const name = this.data.getName()
		const meshes: RampMeshes = {}
		switch (this.state.type) {
			case Enums.RampType.RampType1Wire:
				a.name = `ramp.wire1-${name}`
				meshes.wire1 = a
				break
			case Enums.RampType.RampType2Wire:
				meshes.wire1 = a.makeTranslation(0, 0, 3.0)
				meshes.wire2 = b.makeTranslation(0, 0, 3.0)
				meshes.wire1.name = `ramp.wire1-${name}`
				meshes.wire2.name = `ramp.wire2-${name}`
				break
			case Enums.RampType.RampType4Wire:
				meshes.wire1 = a.clone(`ramp.wire1-${name}`).makeTranslation(0, 0, this.data.wireDistanceY * 0.5)
				meshes.wire2 = b.clone(`ramp.wire2-${name}`).makeTranslation(0, 0, this.data.wireDistanceY * 0.5)
				meshes.wire3 = a.makeTranslation(0, 0, 3.0)
				meshes.wire3.name = `ramp.wire3-${name}`
				meshes.wire4 = b.makeTranslation(0, 0, 3.0)
				meshes.wire4.name = `ramp.wire4-${name}`
				break
			case Enums.RampType.RampType3WireLeft:
				meshes.wire2 = b.clone(`ramp.wire2-${name}`).makeTranslation(0, 0, this.data.wireDistanceY * 0.5)
				meshes.wire3 = a.makeTranslation(0, 0, 3.0)
				meshes.wire3.name = `ramp.wire3-${name}`
				meshes.wire4 = b.makeTranslation(0, 0, 3.0)
				meshes.wire4.name = `ramp.wire4-${name}`
				break
			case Enums.RampType.RampType3WireRight:
				meshes.wire1 = a.clone(`ramp.wire1-${name}`).makeTranslation(0, 0, this.data.wireDistanceY * 0.5)
				meshes.wire3 = a.makeTranslation(0, 0, 3.0)
				meshes.wire3.name = `ramp.wire3-${name}`
				meshes.wire4 = b.makeTranslation(0, 0, 3.0)
				meshes.wire4.name = `ramp.wire4-${name}`
				break
		}
		return meshes
	}

	private generateFlatMesh(table: Table): RampMeshes {
		const rv = this.getRampVertex(table, -1, true)
		const meshes: RampMeshes = { floor: this.generateFlatFloorMesh(table, rv) }
		if (this.state.leftWallHeightVisible > 0) meshes.left = this.generateFlatWall(table, rv, 'left')
		if (this.state.rightWallHeightVisible > 0) meshes.right = this.generateFlatWall(table, rv, 'right')
		return meshes
	}

	private generateFlatFloorMesh(table: Table, rv: RampVertexResult): Mesh {
		const n = rv.pcvertex
		const dim = table.getDimensions()
		const invW = 1 / dim.width
		const invH = 1 / dim.height
		const mesh = new Mesh(`ramp.floor-${this.data.getName()}`)
		for (let i = 0; i < n; i++) {
			const v1 = new Vertex3DNoTex2()
			const v2 = new Vertex3DNoTex2()
			v1.x = rv.rgvLocal[i]!.x
			v1.y = rv.rgvLocal[i]!.y
			v1.z = rv.ppheight[i]! * table.getScaleZ()
			v2.x = rv.rgvLocal[n * 2 - i - 1]!.x
			v2.y = rv.rgvLocal[n * 2 - i - 1]!.y
			v2.z = v1.z
			if (this.state.texture) {
				if (this.state.textureAlignment === Enums.RampImageAlignment.ImageModeWorld) {
					v1.tu = v1.x * invW
					v1.tv = v1.y * invH
					v2.tu = v2.x * invW
					v2.tv = v2.y * invH
				} else {
					v1.tu = 1
					v1.tv = rv.ppratio[i]!
					v2.tu = 0
					v2.tv = rv.ppratio[i]!
				}
			}
			mesh.vertices.push(v1, v2)
			if (i < n - 1) mesh.indices.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2)
		}
		Mesh.computeNormals(mesh.vertices, n * 2, mesh.indices, (n - 1) * 6)
		return mesh
	}

	private generateFlatWall(table: Table, rv: RampVertexResult, side: 'left' | 'right'): Mesh {
		const n = rv.pcvertex
		const dim = table.getDimensions()
		const invW = 1 / dim.width
		const invH = 1 / dim.height
		const wallH = side === 'left' ? this.state.leftWallHeightVisible : this.state.rightWallHeightVisible
		const mesh = new Mesh(`ramp.${side}-${this.data.getName()}`)
		for (let i = 0; i < n; i++) {
			const v1 = new Vertex3DNoTex2()
			const v2 = new Vertex3DNoTex2()
			const idx = side === 'left' ? n * 2 - i - 1 : i
			v1.x = rv.rgvLocal[idx]!.x
			v1.y = rv.rgvLocal[idx]!.y
			v1.z = rv.ppheight[i]! * table.getScaleZ()
			v2.x = v1.x
			v2.y = v1.y
			v2.z = (rv.ppheight[i]! + wallH) * table.getScaleZ()
			if (this.state.texture && this.state.hasWallImage) {
				if (this.state.textureAlignment === Enums.RampImageAlignment.ImageModeWorld) {
					v1.tu = v1.x * invW
					v1.tv = v1.y * invH
				} else {
					v1.tu = 0
					v1.tv = rv.ppratio[i]!
				}
				v2.tu = v1.tu
				v2.tv = v1.tv
			}
			mesh.vertices.push(v1, v2)
			if (i < n - 1) mesh.indices.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2)
		}
		Mesh.computeNormals(mesh.vertices, n * 2, mesh.indices, (n - 1) * 6)
		return mesh
	}

	private generateWireMeshes(table: Table): Mesh[] {
		let accuracy: number
		if (table.getDetailLevel() < 5) accuracy = 6
		else if (table.getDetailLevel() < 8) accuracy = 8
		else accuracy = Math.floor(table.getDetailLevel() * 1.3)
		const mat = table.getMaterial(this.state.material)
		if (!mat?.isOpacityActive) accuracy = 12

		const rv = this.getRampVertex(table, -1, false)
		const n = rv.pcvertex
		const heights = rv.ppheight
		const middlePoints = rv.pMiddlePoints
		const numRings = n
		const numSegments = accuracy

		const tmpPoints: Vertex2D[] = []
		for (let i = 0; i < n; i++) tmpPoints[i] = rv.rgvLocal[n * 2 - i - 1]!

		let vertBuffer: Vertex3DNoTex2[]
		let vertBuffer2: Vertex3DNoTex2[] | undefined
		if (this.state.type !== Enums.RampType.RampType1Wire) {
			vertBuffer = this.createWire(numRings, numSegments, rv.rgvLocal, heights)
			vertBuffer2 = this.createWire(numRings, numSegments, tmpPoints, heights)
		} else {
			vertBuffer = this.createWire(numRings, numSegments, middlePoints, heights)
		}

		const indices: number[] = []
		for (let i = 0; i < numRings - 1; i++) {
			for (let j = 0; j < numSegments; j++) {
				const quad = [
					i * numSegments + j,
					j !== numSegments - 1 ? i * numSegments + j + 1 : i * numSegments,
					i !== numRings - 1
						? j !== numSegments - 1
							? (i + 1) * numSegments + j + 1
							: (i + 1) * numSegments
						: j !== numSegments - 1
							? j + 1
							: 0,
					i !== numRings - 1 ? (i + 1) * numSegments + j : j,
				]
				const offs = (i * numSegments + j) * 6
				indices[offs] = quad[0]!
				indices[offs + 1] = quad[1]!
				indices[offs + 2] = quad[3]!
				indices[offs + 3] = quad[2]!
				indices[offs + 4] = quad[3]!
				indices[offs + 5] = quad[1]!
			}
		}
		const meshes = [new Mesh(vertBuffer, indices)]
		if (vertBuffer2) meshes.push(new Mesh(vertBuffer2, indices))
		return meshes
	}

	private createWire(
		numRings: number,
		numSegments: number,
		midPoints: Vertex2D[],
		heights: number[],
	): Vertex3DNoTex2[] {
		const rgvbuf: Vertex3DNoTex2[] = []
		let prevB = new Vertex3D()
		let index = 0
		for (let i = 0; i < numRings; i++) {
			const i2 = i === numRings - 1 ? i : i + 1
			const height = heights[i]!
			const tangent = new Vertex3D(
				midPoints[i2]!.x - midPoints[i]!.x,
				midPoints[i2]!.y - midPoints[i]!.y,
				heights[i2]! - heights[i]!,
			)
			if (i === numRings - 1) {
				tangent.x = midPoints[i]!.x - midPoints[i - 1]!.x
				tangent.y = midPoints[i]!.y - midPoints[i - 1]!.y
			}
			let binorm: Vertex3D
			let normal: Vertex3D
			if (i === 0) {
				const up = new Vertex3D(
					midPoints[i2]!.x + midPoints[i]!.x,
					midPoints[i2]!.y + midPoints[i]!.y,
					heights[i2]! - height,
				)
				normal = tangent.clone().cross(up)
				binorm = tangent.clone().cross(normal)
			} else {
				normal = prevB.clone().cross(tangent)
				binorm = tangent.clone().cross(normal)
			}
			binorm.normalize()
			normal.normalize()
			prevB = binorm

			const invNumRings = 1 / numRings
			const invNumSegments = 1 / numSegments
			const u = i * invNumRings
			for (let j = 0; j < numSegments; j++, index++) {
				const v = (j + u) * invNumSegments
				const tmp = Vertex3D.getRotatedAxis(j * (360 * invNumSegments), tangent, normal).multiplyScalar(
					this.data.wireDiameter * 0.5,
				)
				const vtx = new Vertex3DNoTex2()
				vtx.x = midPoints[i]!.x + tmp.x
				vtx.y = midPoints[i]!.y + tmp.y
				vtx.z = height + tmp.z
				vtx.tu = u
				vtx.tv = v
				const n = new Vertex3D(vtx.x - midPoints[i]!.x, vtx.y - midPoints[i]!.y, vtx.z - height)
				const len = 1 / Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z)
				vtx.nx = n.x * len
				vtx.ny = n.y * len
				vtx.nz = n.z * len
				rgvbuf[index] = vtx
			}
		}
		return rgvbuf
	}

	public getRampVertex(table: Table, accuracy: number, incWidth: boolean): RampVertexResult {
		const ppheight: number[] = []
		const ppfCross: boolean[] = []
		const ppratio: number[] = []
		const pMiddlePoints: Vertex2D[] = []
		const vvertex = this.getCentralCurve(table, accuracy)
		const cvertex = vvertex.length
		const rgvLocal: Vertex2D[] = []
		const bottomHeight = this.state.heightBottom + table.getTableHeight()
		const topHeight = this.state.heightTop + table.getTableHeight()

		let totalLength = 0
		for (let i = 0; i < cvertex - 1; i++) {
			const dx = vvertex[i]!.x - vvertex[i + 1]!.x
			const dy = vvertex[i]!.y - vvertex[i + 1]!.y
			totalLength = totalLength + Math.sqrt(dx * dx + dy * dy)
		}

		let currentLength = 0
		for (let i = 0; i < cvertex; i++) {
			const vprev = vvertex[i > 0 ? i - 1 : i]!
			const vnext = vvertex[i < cvertex - 1 ? i + 1 : i]!
			const vmiddle = vvertex[i]!
			ppfCross[i] = vmiddle.fControlPoint

			const vnormal = this.computeNormal(vprev, vmiddle, vnext, i, cvertex)
			const dx = vprev.x - vmiddle.x
			const dy = vprev.y - vmiddle.y
			currentLength = currentLength + Math.sqrt(dx * dx + dy * dy)

			const percentage = currentLength / totalLength
			let currentWidth = percentage * (this.state.widthTop - this.state.widthBottom) + this.state.widthBottom
			const height = vmiddle.z + percentage * (topHeight - bottomHeight) + bottomHeight
			ppheight[i] = height
			this.assignHeightToControlPoint(vvertex[i]!, height)
			ppratio[i] = 1 - percentage

			if (this.isHabitrail() && this.state.type !== Enums.RampType.RampType1Wire) {
				currentWidth = this.data.wireDistanceX + (incWidth ? 20 : 0)
			} else if (this.state.type === Enums.RampType.RampType1Wire) {
				currentWidth = this.data.wireDiameter
			}

			pMiddlePoints[i] = new Vertex2D(vmiddle.x, vmiddle.y).add(vnormal)
			rgvLocal[i] = new Vertex2D(vmiddle.x, vmiddle.y).add(vnormal.clone().multiplyScalar(currentWidth * 0.5))
			rgvLocal[cvertex * 2 - i - 1] = new Vertex2D(vmiddle.x, vmiddle.y).sub(
				vnormal.clone().multiplyScalar(currentWidth * 0.5),
			)
		}
		return { rgvLocal, pcvertex: cvertex, ppheight, ppfCross, ppratio, pMiddlePoints }
	}

	private computeNormal(
		vprev: RenderVertex3D,
		vmiddle: RenderVertex3D,
		vnext: RenderVertex3D,
		i: number,
		cvertex: number,
	): Vertex2D {
		const v1normal = new Vertex2D(vprev.y - vmiddle.y, vmiddle.x - vprev.x)
		const v2normal = new Vertex2D(vmiddle.y - vnext.y, vnext.x - vmiddle.x)
		if (i === cvertex - 1) {
			v1normal.normalize()
			return v1normal
		}
		if (i === 0) {
			v2normal.normalize()
			return v2normal
		}
		v1normal.normalize()
		v2normal.normalize()
		if (Math.abs(v1normal.x - v2normal.x) < 0.0001 && Math.abs(v1normal.y - v2normal.y) < 0.0001) return v1normal

		const A = vprev.y - vmiddle.y
		const B = vmiddle.x - vprev.x
		const C = -(A * (vprev.x - v1normal.x) + B * (vprev.y - v1normal.y))
		const D = vnext.y - vmiddle.y
		const E = vmiddle.x - vnext.x
		const F = -(D * (vnext.x - v2normal.x) + E * (vnext.y - v2normal.y))
		const det = A * E - B * D
		const invDet = det !== 0 ? 1 / det : 0
		const ix = (B * F - E * C) * invDet
		const iy = (C * D - A * F) * invDet
		return new Vertex2D(vmiddle.x - ix, vmiddle.y - iy)
	}

	public getCentralCurve(table: Table, acc = -1): RenderVertex3D[] {
		let accuracy: number
		if (acc !== -1) {
			accuracy = acc
		} else {
			const mat = table.getMaterial(this.state.material)
			accuracy = !mat?.isOpacityActive ? 10 : table.getDetailLevel()
		}
		accuracy = 4 * 10 ** ((10 - accuracy) * (1 / 1.5))
		return DragPoint.getRgVertex(
			this.data.dragPoints,
			() => new RenderVertex3D(),
			CatmullCurve3D.fromVertex3D,
			false,
			accuracy,
		)
	}

	private isHabitrail(): boolean {
		return [
			Enums.RampType.RampType4Wire,
			Enums.RampType.RampType1Wire,
			Enums.RampType.RampType2Wire,
			Enums.RampType.RampType3WireLeft,
			Enums.RampType.RampType3WireRight,
		].includes(this.state.type)
	}

	private assignHeightToControlPoint(v: RenderVertex3D, height: number): void {
		for (const dp of this.data.dragPoints) {
			if (dp.vertex.x === v.x && dp.vertex.y === v.y) dp.calcHeight = height
		}
	}
}

/** Ramp updater — visibility, material and wire/floor meshes. */
export class RampUpdater extends ItemUpdater<RampState> {
	constructor(
		state: RampState,
		private readonly meshGenerator: RampMeshGenerator,
	) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: RampState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		Object.assign(this.state, state)
		this.applyVisibility(obj, state, renderApi)
		this.applyMaterial(obj, state.material, state.texture, renderApi, table)
		if (this.mustUpdateGeometry(state)) {
			if (state.type === undefined) this.updateMeshes(obj, renderApi, table)
			else this.replaceMeshes(obj, renderApi, table)
		}
	}

	private updateMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const r = this.meshGenerator.generateMeshes(table)
		for (const k of ['wire1', 'wire2', 'wire3', 'wire4', 'floor', 'left', 'right'] as const) {
			const mesh = r[k]
			if (!mesh) continue
			const node = renderApi.findInGroup(obj, `ramp.${k}-${this.state.getName()}`)
			renderApi.applyMeshToNode(mesh.transform(Matrix3D.RIGHT_HANDED), node)
		}
	}

	private replaceMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		group: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const mat = table.getMaterial(this.state.material)
		const meshes = this.meshGenerator.getMeshes<GEOMETRY>(!mat || mat.isOpacityActive, table)
		renderApi.removeChildren(group)
		for (const info of Object.values<RenderInfo<GEOMETRY>>(meshes)) {
			renderApi.addChildToParent(group, renderApi.createMesh(info))
		}
	}

	private mustUpdateGeometry(s: RampState): boolean {
		return (
			s.type !== undefined ||
			s.leftWallHeightVisible !== undefined ||
			s.rightWallHeightVisible !== undefined ||
			s.heightBottom !== undefined ||
			s.heightTop !== undefined ||
			s.widthTop !== undefined ||
			s.widthBottom !== undefined
		)
	}
}
