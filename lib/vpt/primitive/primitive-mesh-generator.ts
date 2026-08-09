// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { MathUtils } from 'three'
import { FLT_MAX } from '../../util/float.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex3DNoTex2 } from '../../util/vertex.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { PrimitiveData } from './primitive-data.js'

/** Generates primitive built-in mesh. @see https://github.com/vpinball/vpinball/blob/master/primitive.cpp */
export class PrimitiveMeshGenerator {
	private readonly data: PrimitiveData
	constructor(data: PrimitiveData) {
		this.data = data
	}

	public getMesh(vpTable: Table): Mesh {
		const mesh = this.data.use3DMesh
			? this.data.mesh.clone(`primitive-${this.data.getName()}`)
			: this.calculateBuiltinOriginal()
		return mesh.transform(this.getMatrix(vpTable))
	}

	private calculateBuiltinOriginal(): Mesh {
		const mesh = new Mesh(`primitive-${this.data.getName()}`)
		const sides = this.data.sides
		const outerRadius = -0.5 / Math.cos(Math.PI / sides)
		const addAngle = (2 * Math.PI) / sides
		const offsAngle = Math.PI / sides

		let minX = FLT_MAX,
			minY = FLT_MAX,
			maxX = -FLT_MAX,
			maxY = -FLT_MAX
		mesh.vertices = []
		mesh.vertices.push(Object.assign(new Vertex3DNoTex2(), { x: 0, y: 0, z: 0.5 }))
		mesh.vertices[sides + 1] = Object.assign(new Vertex3DNoTex2(), { x: 0, y: 0, z: -0.5 })

		for (let i = 0; i < sides; i++) {
			const angle = addAngle * i + offsAngle
			const x = Math.sin(angle) * outerRadius
			const y = Math.cos(angle) * outerRadius
			const top = Object.assign(new Vertex3DNoTex2(), { x, y, z: 0.5 })
			const bot = Object.assign(new Vertex3DNoTex2(), { x, y, z: -0.5 })
			mesh.vertices[i + 1] = top
			mesh.vertices[i + 1 + sides + 1] = bot
			mesh.vertices[sides * 2 + 2 + i] = top.clone()
			mesh.vertices[sides * 3 + 2 + i] = bot.clone()
			if (x < minX) minX = x
			if (x > maxX) maxX = x
			if (y < minY) minY = y
			if (y > maxY) maxY = y
		}

		mesh.vertices[0]!.tu = 0.25
		mesh.vertices[0]!.tv = 0.25
		mesh.vertices[sides + 1]!.tu = 0.75
		mesh.vertices[sides + 1]!.tv = 0.25
		const invX = 0.5 / (maxX - minX)
		const invY = 0.5 / (maxY - minY)
		const invS = 1 / sides
		for (let i = 0; i < sides; i++) {
			const top = mesh.vertices[i + 1]!
			top.tu = (top.x - minX) * invX
			top.tv = (top.y - minY) * invY
			const bot = mesh.vertices[i + 1 + sides + 1]!
			bot.tu = top.tu + 0.5
			bot.tv = top.tv
			const sTop = mesh.vertices[sides * 2 + 2 + i]!
			const sBot = mesh.vertices[sides * 3 + 2 + i]!
			sTop.tu = i * invS
			sTop.tv = 0.5
			sBot.tu = sTop.tu
			sBot.tv = 1
		}

		mesh.indices = []
		if (this.data.drawTexturesInside) {
			for (let i = 0; i < sides; i++) {
				const nxt = i === sides - 1 ? 1 : i + 2
				const nxt2 = nxt + 1
				mesh.indices.push(0, i + 1, nxt, 0, nxt, i + 1)
				mesh.indices.push(sides + 1, sides + nxt2, sides + 2 + i, sides + 1, sides + 2 + i, sides + nxt2)
				mesh.indices.push(
					sides * 2 + nxt2,
					sides * 2 + 2 + i,
					sides * 3 + 2 + i,
					sides * 2 + nxt2,
					sides * 3 + 2 + i,
					sides * 3 + nxt2,
				)
				mesh.indices.push(
					sides * 2 + nxt2,
					sides * 3 + 2 + i,
					sides * 2 + 2 + i,
					sides * 2 + nxt2,
					sides * 3 + nxt2,
					sides * 3 + 2 + i,
				)
			}
		} else {
			for (let i = 0; i < sides; i++) {
				const nxt = i === sides - 1 ? 1 : i + 2
				const nxt2 = nxt + 1
				mesh.indices.push(0, nxt, i + 1)
				mesh.indices.push(sides + 1, sides + 2 + i, sides + nxt2)
				mesh.indices.push(
					sides * 2 + nxt2,
					sides * 3 + 2 + i,
					sides * 2 + 2 + i,
					sides * 2 + nxt2,
					sides * 3 + nxt2,
					sides * 3 + 2 + i,
				)
			}
		}
		Mesh.computeNormals(mesh.vertices, mesh.vertices.length, mesh.indices, mesh.indices.length)
		return mesh
	}

	private getMatrix(table: Table): Matrix3D {
		const scale = new Matrix3D().setScaling(this.data.size.x, this.data.size.y, this.data.size.z)
		const trans = new Matrix3D().setTranslation(this.data.position.x, this.data.position.y, this.data.position.z)
		const sz = new Matrix3D().setScaling(1, 1, table.getScaleZ())
		const rotTransCol = new Matrix3D()
		rotTransCol.rotateXMatrix(MathUtils.degToRad(this.data.rotAndTra[6]!))
		const tmp = new Matrix3D()
		tmp.rotateYMatrix(MathUtils.degToRad(this.data.rotAndTra[7]!))
		rotTransCol.multiply(tmp)
		tmp.rotateZMatrix(MathUtils.degToRad(this.data.rotAndTra[8]!))
		rotTransCol.multiply(tmp)
		tmp.rotateXMatrix(MathUtils.degToRad(this.data.rotAndTra[0]!))
		rotTransCol.multiply(tmp)
		tmp.rotateYMatrix(MathUtils.degToRad(this.data.rotAndTra[1]!))
		rotTransCol.multiply(tmp)
		tmp.rotateZMatrix(MathUtils.degToRad(this.data.rotAndTra[2]!))
		rotTransCol.multiply(tmp)
		tmp.setTranslation(this.data.rotAndTra[3]!, this.data.rotAndTra[4]!, this.data.rotAndTra[5]!)
		rotTransCol.multiply(tmp)
		const full = sz.clone().multiply(trans).multiply(rotTransCol).multiply(scale)
		return full
	}
}
