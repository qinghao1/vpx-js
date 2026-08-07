// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import {
	type BufferAttribute,
	BufferGeometry,
	Float32BufferAttribute,
	Matrix3,
	Matrix4,
	Mesh,
	Vector2,
	Vector3,
} from '../../refs.node.js'

/**
 * Holds a binary space partition tree representing a 3D solid. Two solids can
 * be combined using the `union()`, `subtract()`, and `intersect()` methods.
 *
 * Copyright (c) 2011 Evan Wallace (http://madebyevan.com/), under the MIT license.
 * THREE.js rework by thrax
 * Typescript port by freezy
 *
 * @see https://github.com/manthrax/THREE-CSGMesh
 */

/* Shim Geometry/Face3 for CSG – removed from three r125+ */
class Face3 {
	public a: number
	public b: number
	public c: number
	public normal: Vector3 = new Vector3()
	public vertexNormals: Vector3[] = []
	public color: any
	constructor(a: number, b: number, c: number, normal?: Vector3, color?: any, materialIndex?: number) {
		this.a = a
		this.b = b
		this.c = c
		if (normal) this.normal.copy(normal)
	}
}
class Geometry {
	public vertices: Vector3[] = []
	public faces: Face3[] = []
	public faceVertexUvs: Vector2[][][] = [[]]
	public verticesNeedUpdate = false
	public elementsNeedUpdate = false
	public normalsNeedUpdate = false
	public boundingSphere: any = null
	public boundingBox: any = null
	public isGeometry = true
	public isBufferGeometry = false
	public applyMatrix(matrix: Matrix4): this {
		for (const v of this.vertices) v.applyMatrix4(matrix)
		for (const f of this.faces) {
			f.normal.applyMatrix3(new Matrix3().getNormalMatrix(matrix))
			for (const vn of f.vertexNormals) vn.applyMatrix3(new Matrix3().getNormalMatrix(matrix))
		}
		return this
	}
	public computeBoundingSphere(): void {}
	public computeBoundingBox(): void {}
	public fromBufferGeometry(bufferGeom: BufferGeometry): this {
		const pos = bufferGeom.getAttribute('position') as BufferAttribute
		const normal = bufferGeom.getAttribute('normal') as BufferAttribute | undefined
		const uv = bufferGeom.getAttribute('uv') as BufferAttribute | undefined
		const index = bufferGeom.getIndex()
		this.vertices = []
		this.faces = []
		this.faceVertexUvs[0] = []
		if (!pos) return this
		for (let i = 0; i < pos.count; i++) {
			this.vertices.push(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
		}
		const addFace = (a: number, b: number, c: number) => {
			const f = new Face3(a, b, c)
			if (normal) {
				f.vertexNormals.push(new Vector3(normal.getX(a), normal.getY(a), normal.getZ(a)))
				f.vertexNormals.push(new Vector3(normal.getX(b), normal.getY(b), normal.getZ(b)))
				f.vertexNormals.push(new Vector3(normal.getX(c), normal.getY(c), normal.getZ(c)))
				f.normal.copy(f.vertexNormals[0]).add(f.vertexNormals[1]).add(f.vertexNormals[2]).normalize()
			}
			this.faces.push(f)
			if (uv) {
				this.faceVertexUvs[0].push([
					new Vector2(uv.getX(a), uv.getY(a)),
					new Vector2(uv.getX(b), uv.getY(b)),
					new Vector2(uv.getX(c), uv.getY(c)),
				])
			} else {
				this.faceVertexUvs[0].push([new Vector2(), new Vector2(), new Vector2()])
			}
		}
		if (index) {
			for (let i = 0; i < index.count; i += 3) {
				addFace(index.getX(i), index.getX(i + 1), index.getX(i + 2))
			}
		} else {
			for (let i = 0; i < pos.count; i += 3) {
				addFace(i, i + 1, i + 2)
			}
		}
		return this
	}
}

export default class ThreeCsg {
	private polygons: Polygon[] = []
	// private static currentOp: string;
	// private static sourceMesh: any;
	// private static doRemove: boolean;
	// private static currentPrim: CSG;
	// private static nextPrim: CSG;
	private static _tmpm3 = new Matrix3()

	public clone() {
		const csg = new ThreeCsg()
		csg.polygons = this.polygons.map((p) => p.clone())
		return csg
	}

	/**
	 * Return a new CSG solid representing space in either this solid or in the
	 * solid `csg`. Neither this solid nor the solid `csg` are modified.
	 *
	 * ```
	 *   A.union(B)
	 *
	 *      +-------+            +-------+
	 *      |       |            |       |
	 *      |   A   |            |       |
	 *      |    +--+----+   =   |       +----+
	 *      +----+--+    |       +----+       |
	 *           |   B   |            |       |
	 *           |       |            |       |
	 *           +-------+            +-------+
	 * ```
	 * @param csg
	 */
	public union(csg: ThreeCsg): ThreeCsg {
		const a = new Node(this.clone().polygons)
		const b = new Node(csg.clone().polygons)
		a.clipTo(b)
		b.clipTo(a)
		b.invert()
		b.clipTo(a)
		b.invert()
		a.build(b.allPolygons())
		return ThreeCsg.fromPolygons(a.allPolygons())
	}

	/**
	 * Return a new CSG solid representing space in this solid but not in the
	 * solid `csg`. Neither this solid nor the solid `csg` are modified.
	 *
	 * ```
	 *   A.subtract(B)
	 *
	 *      +-------+            +-------+
	 *      |       |            |       |
	 *      |   A   |            |       |
	 *      |    +--+----+   =   |    +--+
	 *      +----+--+    |       +----+
	 *           |   B   |
	 *           |       |
	 *           +-------+
	 * ```
	 * @param csg
	 */
	public subtract(csg: ThreeCsg): ThreeCsg {
		const a = new Node(this.clone().polygons)
		const b = new Node(csg.clone().polygons)
		a.invert()
		a.clipTo(b)
		b.clipTo(a)
		b.invert()
		b.clipTo(a)
		b.invert()
		a.build(b.allPolygons())
		a.invert()
		return ThreeCsg.fromPolygons(a.allPolygons())
	}

	/**
	 * Return a new CSG solid representing space both this solid and in the
	 * solid `csg`. Neither this solid nor the solid `csg` are modified.
	 *
	 * ```
	 *   A.intersect(B)
	 *
	 *      +-------+
	 *      |       |
	 *      |   A   |
	 *      |    +--+----+   =   +--+
	 *      +----+--+    |       +--+
	 *           |   B   |
	 *           |       |
	 *           +-------+
	 * ```
	 * @param csg
	 */
	public intersect(csg: ThreeCsg): ThreeCsg {
		const a = new Node(this.clone().polygons)
		const b = new Node(csg.clone().polygons)
		a.invert()
		b.clipTo(a)
		b.invert()
		a.clipTo(b)
		b.clipTo(a)
		a.build(b.allPolygons())
		a.invert()
		return ThreeCsg.fromPolygons(a.allPolygons())
	}

	/**
	 * Return a new CSG solid with solid and empty space switched. This solid is
	 * not modified.
	 */
	public inverse(): ThreeCsg {
		const csg = this.clone()
		csg.polygons.map((p) => p.flip())
		return csg
	}

	public toPolygons() {
		return this.polygons
	}

	/**
	 * Construct a CSG solid from a list of `Polygon` instances.
	 * @param polygons
	 */
	public static fromPolygons(polygons: Polygon[]): ThreeCsg {
		const csg = new ThreeCsg()
		csg.polygons = polygons
		return csg
	}

	public static fromGeometry(geom: Geometry | BufferGeometry) {
		if ((geom as any).isBufferGeometry) {
			geom = new Geometry().fromBufferGeometry(geom as BufferGeometry)
		}
		const geometry = geom as Geometry
		const fs = geometry.faces
		const vs = geometry.vertices as Vector[]
		const polys: Polygon[] = []
		for (let i = 0; i < fs.length; i++) {
			const f = fs[i]
			const vertices: Vertex[] = []
			vertices.push(new Vertex(vs[f.a], f.vertexNormals[0] as Vector, geometry.faceVertexUvs[0][i][0]))
			vertices.push(new Vertex(vs[f.b], f.vertexNormals[1] as Vector, geometry.faceVertexUvs[0][i][1]))
			vertices.push(new Vertex(vs[f.c], f.vertexNormals[2] as Vector, geometry.faceVertexUvs[0][i][2]))
			polys.push(new Polygon(vertices))
		}
		return ThreeCsg.fromPolygons(polys)
	}

	public static fromMesh(mesh: Mesh) {
		const csg = ThreeCsg.fromGeometry(mesh.geometry)
		ThreeCsg._tmpm3.getNormalMatrix(mesh.matrix)
		for (let i = 0; i < csg.polygons.length; i++) {
			const p = csg.polygons[i]
			for (let j = 0; j < p.vertices.length; j++) {
				const v = p.vertices[j]
				v.pos.applyMatrix4(mesh.matrix)
				v.normal.applyMatrix3(ThreeCsg._tmpm3)
			}
		}
		return csg
	}

	public static toMesh(csg: ThreeCsg, toMatrix: Matrix4) {
		const geom = new Geometry()
		const ps = csg.polygons
		const vs = geom.vertices
		const fvuv = geom.faceVertexUvs[0]
		for (let i = 0; i < ps.length; i++) {
			const p = ps[i]
			const pvs = p.vertices
			const v0 = vs.length
			const pvlen = pvs.length

			for (let j = 0; j < pvlen; j++) {
				vs.push(new Vector3().copy(pvs[j].pos))
			}

			for (let j = 3; j <= pvlen; j++) {
				const fc = new Face3(v0, v0 + j - 2, v0 + j - 1)
				const fuv: Vector2[] = []
				fvuv.push(fuv)
				const fnml = fc.vertexNormals

				fnml.push(new Vector3().copy(pvs[0].normal))
				fnml.push(new Vector3().copy(pvs[j - 2].normal))
				fnml.push(new Vector3().copy(pvs[j - 1].normal))
				fuv.push(new Vector2().copy(pvs[0].uv))
				fuv.push(new Vector2().copy(pvs[j - 2].uv))
				fuv.push(new Vector2().copy(pvs[j - 1].uv))

				fc.normal = new Vector3().copy(p.plane.normal)
				geom.faces.push(fc)
			}
		}
		const inv = new Matrix4().copy(toMatrix).invert()
		geom.applyMatrix(inv)
		geom.verticesNeedUpdate = geom.elementsNeedUpdate = geom.normalsNeedUpdate = true
		geom.computeBoundingSphere()
		geom.computeBoundingBox()
		// Convert legacy Geometry to BufferGeometry for three r125+
		const bufferGeom = new BufferGeometry()
		const positions: number[] = []
		const normals: number[] = []
		const uvs: number[] = []
		for (let i = 0; i < geom.faces.length; i++) {
			const face = geom.faces[i]
			const uv = geom.faceVertexUvs[0][i]
			const verts = [face.a, face.b, face.c]
			const vnorms = face.vertexNormals
			for (let j = 0; j < 3; j++) {
				const v = geom.vertices[verts[j]]
				positions.push(v.x, v.y, v.z)
				if (vnorms[j]) {
					normals.push(vnorms[j].x, vnorms[j].y, vnorms[j].z)
				} else {
					normals.push(face.normal.x, face.normal.y, face.normal.z)
				}
				if (uv && uv[j]) {
					uvs.push(uv[j].x, uv[j].y)
				} else {
					uvs.push(0, 0)
				}
			}
		}
		bufferGeom.setAttribute('position', new Float32BufferAttribute(positions, 3))
		if (normals.length) bufferGeom.setAttribute('normal', new Float32BufferAttribute(normals, 3))
		if (uvs.length) bufferGeom.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
		bufferGeom.computeVertexNormals()
		const m = new Mesh(bufferGeom)
		m.matrix.copy(toMatrix)
		m.matrix.decompose(m.position, m.quaternion, m.scale) // FIXED: replace m.rotation by m.quaternion
		m.updateMatrixWorld()
		return m
	}
}

/**
 * Represents a 3D vector.
 *
 * Example usage:
 *
 * ```ts
 * new CSG.Vector(1, 2, 3);
 * new CSG.Vector([1, 2, 3]);
 * new CSG.Vector({ x: 1, y: 2, z: 3 });
 * ```
 */
class Vector extends Vector3 {
	public static fromVector(v: Vector): Vector {
		return new Vector(v.x, v.y, v.z)
	}

	public static fromArray(v: number[]): Vector {
		return new Vector(v[0], v[1], v[2])
	}

	constructor(x: number, y: number, z: number) {
		super(x, y, z)
	}

	public negated() {
		return this.clone().multiplyScalar(-1)
	}

	public plus(a: Vector): this {
		return this.clone().add(a)
	}

	public minus(a: Vector): this {
		return this.clone().sub(a)
	}

	public times(a: number): this {
		return this.clone().multiplyScalar(a)
	}

	public dividedBy(a: number): this {
		return this.clone().divideScalar(a)
	}

	public lerp(a: Vector, t: number): this {
		return this.plus(a.minus(this).times(t))
	}

	public unit(): Vector {
		return this.dividedBy(this.length())
	}

	public crossProduct(a: Vector): Vector {
		const v = Vector3.prototype.cross.call(this.clone(), a)
		return new Vector(v.x, v.y, v.z)
	}
}

/**
 * Represents a vertex of a polygon. Use your own vertex class instead of this
 * one to provide additional features like texture coordinates and vertex
 * colors. Custom vertex classes need to provide a `pos` property and `clone()`,
 * `flip()`, and `interpolate()` methods that behave analogous to the ones
 * defined by `CSG.Vertex`. This class provides `normal` so convenience
 * functions like `CSG.sphere()` can return a smooth vertex normal, but `normal`
 * is not used anywhere else.
 */
class Vertex {
	public pos: Vector
	public normal: Vector
	public uv: Vector2

	constructor(pos: Vector, normal: Vector, uv: Vector2) {
		this.pos = Vector.fromVector(pos)
		this.normal = Vector.fromVector(normal)
		this.uv = new Vector2(uv.x, uv.y)
	}

	public clone() {
		return new Vertex(this.pos.clone(), this.normal.clone(), this.uv.clone())
	}

	// Invert all orientation-specific data (e.g. vertex normal). Called when the
	// orientation of a polygon is flipped.
	public flip() {
		this.normal = this.normal.negated()
	}

	// Create a new vertex between this vertex and `other` by linearly
	// interpolating all properties using a parameter of `t`. Subclasses should
	// override this to interpolate additional properties.
	public interpolate(other: Vertex, t: number) {
		return new Vertex(this.pos.lerp(other.pos, t), this.normal.lerp(other.normal, t), this.uv.lerp(other.uv, t))
	}
}

/**
 * Represents a plane in 3D space.
 */
class Plane {
	public normal: Vector
	private w: number

	// `Plane.EPSILON` is the tolerance used by `splitPolygon()` to decide if a
	// point is on the plane.
	public static EPSILON = 1e-5

	constructor(normal: Vector, w: number) {
		this.normal = normal
		this.w = w
	}

	public clone(): Plane {
		return new Plane(this.normal.clone(), this.w)
	}

	public flip(): void {
		this.normal = this.normal.negated()
		this.w = -this.w
	}

	/**
	 * Split `polygon` by this plane if needed, then put the polygon or polygon
	 * fragments in the appropriate lists. Coplanar polygons go into either
	 * `coplanarFront` or `coplanarBack` depending on their orientation with
	 * respect to this plane. Polygons in front or in back of this plane go into
	 * either `front` or `back`.
	 *
	 * @param polygon
	 * @param coplanarFront
	 * @param coplanarBack
	 * @param front
	 * @param back
	 */
	public splitPolygon(
		polygon: Polygon,
		coplanarFront: Polygon[],
		coplanarBack: Polygon[],
		front: Polygon[],
		back: Polygon[],
	) {
		console.log('splitting polygon (%s/%s/%s/%s)', coplanarFront.length, coplanarBack.length, front.length, back.length)
		const COPLANAR = 0
		const FRONT = 1
		const BACK = 2
		const SPANNING = 3

		// Classify each point as well as the entire polygon into one of the above
		// four classes.
		let polygonType = 0
		const types = []
		for (let i = 0; i < polygon.vertices.length; i++) {
			const t = this.normal.dot(polygon.vertices[i].pos) - this.w
			const type = t < -Plane.EPSILON ? BACK : t > Plane.EPSILON ? FRONT : COPLANAR
			polygonType |= type
			types.push(type)
		}

		// Put the polygon in the correct list, splitting it when necessary.
		switch (polygonType) {
			case COPLANAR:
				;(this.normal.dot(polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon)
				break
			case FRONT:
				front.push(polygon)
				break
			case BACK:
				back.push(polygon)
				break
			case SPANNING: {
				const f = [],
					b = []
				for (let i = 0; i < polygon.vertices.length; i++) {
					const j = (i + 1) % polygon.vertices.length
					const ti = types[i]
					const tj = types[j]
					const vi = polygon.vertices[i]
					const vj = polygon.vertices[j]
					if (ti != BACK) {
						f.push(vi)
					}
					if (ti != FRONT) {
						b.push(ti != BACK ? vi.clone() : vi)
					}
					if ((ti | tj) == SPANNING) {
						const t = (this.w - this.normal.dot(vi.pos)) / this.normal.dot(vj.pos.minus(vi.pos))
						const v = vi.interpolate(vj, t)
						f.push(v)
						b.push(v.clone())
					}
				}
				if (f.length >= 3) {
					front.push(new Polygon(f, polygon.shared))
				}
				if (b.length >= 3) {
					back.push(new Polygon(b, polygon.shared))
				}
				break
			}
		}
	}

	public static fromPoints = (a: Vector, b: Vector, c: Vector): Plane => {
		const n = b.minus(a).crossProduct(c.minus(a)).unit()
		return new Plane(n, n.dot(a))
	}
}

/**
 * Represents a convex polygon. The vertices used to initialize a polygon must
 * be coplanar and form a convex loop. They do not have to be `Vertex`
 * instances but they must behave similarly (duck typing can be used for
 * customization).
 *
 * Each convex polygon has a `shared` property, which is shared between all
 * polygons that are clones of each other or were split from the same polygon.
 * This can be used to define per-polygon properties (such as surface color).
 */
class Polygon {
	public vertices: Vertex[]
	public shared: any
	public plane: Plane

	constructor(vertices: Vertex[], shared?: any) {
		this.vertices = vertices
		this.shared = shared
		this.plane = Plane.fromPoints(vertices[0].pos, vertices[1].pos, vertices[2].pos)
	}

	public clone() {
		const vertices = this.vertices.map((v) => v.clone())
		return new Polygon(vertices, this.shared)
	}

	public flip() {
		this.vertices.reverse().map((v) => {
			v.flip()
		})
		this.plane.flip()
	}
}

/**
 * Holds a node in a BSP tree. A BSP tree is built from a collection of polygons
 * by picking a polygon to split along. That polygon (and all other coplanar
 * polygons) are added directly to that node and the other polygons are added to
 * the front and/or back subtrees. This is not a leafy BSP tree since there is
 * no distinction between internal and leaf nodes.
 */
class Node {
	private polygons: Polygon[]
	private plane: Plane | undefined
	private front: Node | undefined
	private back: Node | undefined

	constructor(polygons?: Polygon[]) {
		this.polygons = []
		if (polygons) {
			this.build(polygons)
		}
	}

	public clone(): Node {
		const node = new Node()
		node.plane = this.plane && this.plane.clone()
		node.front = this.front && this.front.clone()
		node.back = this.back && this.back.clone()
		node.polygons = this.polygons.map((p) => p.clone())
		return node
	}

	/**
	 * Convert solid space to empty space and empty space to solid space.
	 */
	public invert() {
		for (let i = 0; i < this.polygons.length; i++) {
			this.polygons[i].flip()
		}
		if (this.plane) {
			this.plane.flip()
			if (this.front) {
				this.front.invert()
			}
			if (this.back) {
				this.back.invert()
			}
			const temp = this.front
			this.front = this.back
			this.back = temp
		}
	}

	/**
	 * Recursively remove all polygons in `polygons` that are inside this BSP
	 * tree.
	 * @param polygons
	 */
	public clipPolygons(polygons: Polygon[]) {
		if (!this.plane) {
			return polygons.slice()
		}
		let front: Polygon[] = []
		let back: Polygon[] = []
		for (let i = 0; i < polygons.length; i++) {
			this.plane.splitPolygon(polygons[i], front, back, front, back)
		}
		if (this.front) {
			front = this.front.clipPolygons(front)
		}
		if (this.back) {
			back = this.back.clipPolygons(back)
		} else {
			back = []
		}
		return front.concat(back)
	}

	/**
	 * Remove all polygons in this BSP tree that are inside the other BSP tree
	 * `bsp`.
	 *
	 * @param bsp
	 */
	public clipTo(bsp: Node) {
		this.polygons = bsp.clipPolygons(this.polygons)
		if (this.front) {
			this.front.clipTo(bsp)
		}
		if (this.back) {
			this.back.clipTo(bsp)
		}
	}

	/**
	 * Return a list of all polygons in this BSP tree.
	 */
	public allPolygons(): Polygon[] {
		let polygons = this.polygons.slice()
		if (this.front) {
			polygons = polygons.concat(this.front.allPolygons())
		}
		if (this.back) {
			polygons = polygons.concat(this.back.allPolygons())
		}
		return polygons
	}

	/**
	 * Build a BSP tree out of `polygons`. When called on an existing tree, the
	 * new polygons are filtered down to the bottom of the tree and become new
	 * nodes there. Each set of polygons is partitioned using the first polygon
	 * (no heuristic is used to pick a good split).
	 * @param polygons
	 */
	public build(polygons: Polygon[]) {
		if (!polygons.length) {
			return
		}
		if (!this.plane) {
			this.plane = polygons[0].plane.clone()
		}
		const front: Polygon[] = []
		const back: Polygon[] = []
		for (let i = 0; i < polygons.length; i++) {
			this.plane.splitPolygon(polygons[i], this.polygons, this.polygons, front, back)
		}
		if (front.length) {
			if (!this.front) {
				this.front = new Node()
			}
			this.front.build(front)
		}
		if (back.length) {
			if (!this.back) {
				this.back = new Node()
			}
			this.back.build(back)
		}
	}
}
