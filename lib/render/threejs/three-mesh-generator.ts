// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import {
	BufferGeometry,
	Float32BufferAttribute,
	Line,
	Matrix3,
	type Object3D,
	Mesh as ThreeMesh,
	Vector2,
	Vector3,
} from '../../refs.node.js'
import { Vertex3DNoTex2 } from '../../util/vertex.js'
import { Mesh } from '../../vpt/mesh.js'

/**
 * A class that converts the meshes we read from VPinball to Three.js meshes.
 *
 * It takes a similar approach as Three's OBJLoader, e.g. first read data into
 * a "state" and then convert it into `BufferGeometry`s.
 * @see https://github.com/vpinball/vpinball/blob/master/mesh.cpp
 */
export class ThreeMeshGenerator {
	public convertToBufferGeometry(mesh: Mesh): BufferGeometry {
		const s = ParserState.claim(mesh.name)
		for (const v of mesh.vertices) {
			s.vertices.push(v.x, v.y, v.z)
			s.normals.push(v.nx, v.ny, v.nz)
			if (v.hasTextureCoordinates()) s.uvs.push(v.tu, 1 - v.tv)
		}
		for (let i = 0; i < mesh.indices.length; i += 3) {
			// VPX is LH, Three is RH; mesh already transformed via RIGHT_HANDED
			const a = mesh.indices[i + 2] + 1,
				b = mesh.indices[i + 1] + 1,
				c = mesh.indices[i] + 1
			s.addFace(a, b, c, a, b, c, a, b, c)
		}
		const g = s.object.geometry,
			bg = new BufferGeometry() as BufferGeometry
		bg.name = mesh.name
		bg.setAttribute('position', RecyclableFloat32BufferAttribute.claim(g.vertices, 3))
		if (g.normals.length) bg.setAttribute('normal', RecyclableFloat32BufferAttribute.claim(g.normals, 3))
		else bg.computeVertexNormals()
		if (g.uvs.length) bg.setAttribute('uv', RecyclableFloat32BufferAttribute.claim(g.uvs, 2))

		return bg
	}
}

class ParserState {
	public object!: ParserObject

	public readonly vertices: number[] = []
	public readonly normals: number[] = []
	public readonly uvs: number[] = []

	public static claim(name: string): ParserState {
		return new ParserState().set(name)
	}

	public static release(..._states: ParserState[]) {}

	public set(name: string): this {
		this.object = new ParserObject().set(name)
		return this
	}

	public static reset(state: ParserState): void {
		state.vertices.length = 0
		state.normals.length = 0
		state.uvs.length = 0
	}

	public addFace(
		a: number,
		b: number,
		c: number,
		ua: number,
		ub: number,
		uc: number,
		na: number,
		nb: number,
		nc: number,
	) {
		const vLen = this.vertices.length

		let ia = this.parseVertexIndex(a, vLen)
		let ib = this.parseVertexIndex(b, vLen)
		let ic = this.parseVertexIndex(c, vLen)

		this.addVertex(ia, ib, ic)

		if (ua !== undefined) {
			const uvLen = this.uvs.length
			ia = this.parseUVIndex(ua, uvLen)
			ib = this.parseUVIndex(ub, uvLen)
			ic = this.parseUVIndex(uc, uvLen)
			this.addUV(ia, ib, ic)
		}

		if (na !== undefined) {
			// Normals are many times the same. If so, skip function call and parseInt.
			const nLen = this.normals.length
			ia = this.parseNormalIndex(na, nLen)

			ib = na === nb ? ia : this.parseNormalIndex(nb, nLen)
			ic = na === nc ? ia : this.parseNormalIndex(nc, nLen)

			this.addNormal(ia, ib, ic)
		}
	}

	private addUV(a: number, b: number, c: number) {
		const src = this.uvs
		const dst = this.object.geometry.uvs
		dst.push(src[a], src[a + 1])
		dst.push(src[b], src[b + 1])
		dst.push(src[c], src[c + 1])
	}

	private parseVertexIndex(index: number, len: number) {
		return (index >= 0 ? index - 1 : index + len / 3) * 3
	}

	private parseNormalIndex(index: number, len: number) {
		return (index >= 0 ? index - 1 : index + len / 3) * 3
	}

	private parseUVIndex(index: number, len: number) {
		return (index >= 0 ? index - 1 : index + len / 2) * 2
	}

	private addVertex(a: number, b: number, c: number) {
		const src = this.vertices
		const dst = this.object.geometry.vertices
		dst.push(src[a], src[a + 1], src[a + 2])
		dst.push(src[b], src[b + 1], src[b + 2])
		dst.push(src[c], src[c + 1], src[c + 2])
	}

	private addNormal(a: number, b: number, c: number) {
		const src = this.normals
		const dst = this.object.geometry.normals
		dst.push(src[a], src[a + 1], src[a + 2])
		dst.push(src[b], src[b + 1], src[b + 2])
		dst.push(src[c], src[c + 1], src[c + 2])
	}
}

class ParserObject {
	public name!: string
	public geometry: { [key: string]: number[] } = {
		vertices: [],
		normals: [],
		uvs: [],
	}
	public smooth: boolean = false

	public static claim(name: string): ParserObject {
		return new ParserObject().set(name)
	}

	public static release(..._states: ParserObject[]) {}

	public static reset(po: ParserObject): void {
		po.geometry.vertices.length = 0
		po.geometry.normals.length = 0
		po.geometry.uvs.length = 0
		po.smooth = false
	}

	public set(name: string): this {
		this.name = name
		return this
	}
}

/** releaseGeometry. */
export function releaseGeometry(geometry: BufferGeometry) {
	for (const attrName of Object.keys(geometry.attributes)) {
		delete geometry.attributes[attrName]
	}
	geometry.dispose()
}

class RecyclableFloat32BufferAttribute extends Float32BufferAttribute {
	private static readonly ARR = new Float32Array()

	public static claim(array: number[], itemSize: number, normalized?: boolean): RecyclableFloat32BufferAttribute {
		return new RecyclableFloat32BufferAttribute().set(array, itemSize, normalized)
	}

	public static release(..._bas: RecyclableFloat32BufferAttribute[]) {}

	public set(array: number[], itemSize: number, normalized?: boolean): this {
		if (this.array.length === array.length) {
			;(this.array as Float32Array).set(array)
		} else {
			this.array = new Float32Array(array)
		}
		this.itemSize = itemSize
		;(this as unknown as { count: number }).count = array.length / itemSize
		this.normalized = normalized === true

		this.clearUpdateRanges()

		this.version = 0
		return this
	}

	constructor() {
		super(RecyclableFloat32BufferAttribute.ARR, 3)
	}
}

/* istanbul ignore next: used for debugging */
/** MeshExporter. */
export class MeshExporter {
	private output = new Mesh()

	private vertex = new Vector3()
	private normal = new Vector3()
	private uv = new Vector2()

	public parse(object: Object3D): Mesh {
		object.traverse((child) => {
			if (child instanceof ThreeMesh) this.parseMesh(child as ThreeMesh)

			if (child instanceof Line) {
				//this.parseLine(child);
			}
		})
		return this.output
	}

	private parseMesh(mesh: ThreeMesh) {
		let i: number
		let l: number
		let m: number

		let nbVertex = 0
		let nbNormals = 0
		let nbVertexUvs = 0
		const geometry = mesh.geometry

		const normalMatrixWorld = new Matrix3()

		if (geometry instanceof BufferGeometry) {
			// shortcuts
			const vertices = geometry.getAttribute('position')
			const normals = geometry.getAttribute('normal')
			const uvs = geometry.getAttribute('uv')
			const indices = geometry.getIndex()

			// name of the mesh object
			this.output.name = mesh.name

			// vertices
			if (vertices !== undefined) {
				for (i = 0, l = vertices.count; i < l; i++, nbVertex++) {
					this.vertex.x = vertices.getX(i)
					this.vertex.y = vertices.getY(i)
					this.vertex.z = vertices.getZ(i)

					// transfrom the vertex to world space
					this.vertex.applyMatrix4(mesh.matrixWorld)

					// transform the vertex to export format
					this.output.vertices.push(
						Vertex3DNoTex2.fromArray([this.vertex.x, this.vertex.y, this.vertex.z, 0, 0, 0, 0, 0]),
					)
				}
			}

			// uvs
			if (uvs !== undefined) {
				for (i = 0, l = uvs.count; i < l; i++, nbVertexUvs++) {
					this.uv.x = uvs.getX(i)
					this.uv.y = uvs.getY(i)

					// transform the uv to export format
					this.output.vertices[i].tu = this.uv.x
					this.output.vertices[i].tv = this.uv.y
				}
			}

			// normals
			if (normals !== undefined) {
				normalMatrixWorld.getNormalMatrix(mesh.matrixWorld)
				for (i = 0, l = normals.count; i < l; i++, nbNormals++) {
					this.normal.x = normals.getX(i)
					this.normal.y = normals.getY(i)
					this.normal.z = normals.getZ(i)

					// transfrom the normal to world space
					this.normal.applyMatrix3(normalMatrixWorld)

					// transform the normal to export format
					this.output.vertices[i].nx = this.normal.x
					this.output.vertices[i].ny = this.normal.y
					this.output.vertices[i].nz = this.normal.z
				}
			}

			// faces
			if (indices !== null) {
				for (i = 0, l = indices.count; i < l; i += 3) {
					for (m = 0; m < 3; m++) {
						this.output.indices.push(indices.getX(i))
					}
				}
			} else {
				for (i = 0, l = vertices.count; i < l; i += 3) {
					for (m = 0; m < 3; m++) {
						this.output.indices.push(i + m)
					}
				}
			}
		}

		// update index
		this.indexVertex += nbVertex
		this.indexVertexUvs += nbVertexUvs
		this.indexNormals += nbNormals
	}
}
