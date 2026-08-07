// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export class FrameData {
	public frameVerts: VertData[] = []

	public static get(buffer: Uint8Array, numVertices: number): FrameData {
		const frameData = new FrameData()
		for (let i = 0; i < numVertices; i++) {
			frameData.frameVerts.push(VertData.load(buffer, i * 24))
		}
		return frameData
	}

	public clone(): FrameData {
		const frameData = new FrameData()
		frameData.frameVerts = this.frameVerts.map((v) => v.clone())
		return frameData
	}
}

export class VertData {
	public readonly x: number
	public readonly y: number
	public readonly z: number

	public readonly nx: number
	public readonly ny: number
	public readonly nz: number

	constructor(x: number, y: number, z: number, nx: number, ny: number, nz: number) {
		this.x = x
		this.y = y
		this.z = z
		this.nx = nx
		this.ny = ny
		this.nz = nz
	}

	public static load(buffer: Uint8Array, offset: number = 0): VertData {
		return new VertData(
			new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset, true),
			new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset + 4, true),
			new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset + 8, true),
			new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset + 12, true),
			new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset + 16, true),
			new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset + 20, true),
		)
	}

	public clone(): VertData {
		return new VertData(this.x, this.y, this.z, this.nx, this.ny, this.nz)
	}
}
