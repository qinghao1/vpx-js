// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Frame data for animated meshes. */
export class FrameData {
	public frameVerts: VertData[] = []
	public static get(buffer: Uint8Array, numVertices: number): FrameData {
		const fd = new FrameData()
		for (let i = 0; i < numVertices; i++) fd.frameVerts.push(VertData.load(buffer, i * 24))
		return fd
	}
	public clone(): FrameData {
		const f = new FrameData()
		f.frameVerts = this.frameVerts.map((v) => v.clone())
		return f
	}
}

/** VertData. */
export class VertData {
	public constructor(
		public readonly x: number,
		public readonly y: number,
		public readonly z: number,
		public readonly nx: number,
		public readonly ny: number,
		public readonly nz: number,
	) {}
	public static load(buf: Uint8Array, off = 0): VertData {
		const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
		return new VertData(
			v.getFloat32(off, true),
			v.getFloat32(off + 4, true),
			v.getFloat32(off + 8, true),
			v.getFloat32(off + 12, true),
			v.getFloat32(off + 16, true),
			v.getFloat32(off + 20, true),
		)
	}
	public clone(): VertData {
		return new VertData(this.x, this.y, this.z, this.nx, this.ny, this.nz)
	}
}
