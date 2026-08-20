import {
	ClampToEdgeWrapping,
	Color,
	DataTexture,
	DoubleSide,
	NearestFilter,
	NoColorSpace,
	RedFormat,
	UnsignedByteType,
	Vector2,
} from 'three'
import { Fn, float, fract, length, smoothstep, texture, uniform, uv, vec2, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'

export class GpuDmdNodeController {
	public readonly material: MeshBasicNodeMaterial
	private dataTexture: DataTexture
	private readonly texNode: any
	private readonly uResolution: any
	private readonly uLedColor: any
	private readonly uDotRadius: any
	private readonly uGlowIntensity: any
	private readonly uDynamicScale: any
	private lastHash = -1

	constructor(width = 128, height = 32) {
		const buffer = new Uint8Array(width * height)
		this.dataTexture = new DataTexture(buffer, width, height, RedFormat, UnsignedByteType)
		this.dataTexture.magFilter = NearestFilter
		this.dataTexture.minFilter = NearestFilter
		this.dataTexture.generateMipmaps = false
		this.dataTexture.wrapS = ClampToEdgeWrapping
		this.dataTexture.wrapT = ClampToEdgeWrapping
		this.dataTexture.colorSpace = NoColorSpace
		this.dataTexture.needsUpdate = true

		this.uResolution = uniform(new Vector2(width, height))
		this.uLedColor = uniform(new Color(0xff8800))
		this.uDotRadius = uniform(0.42)
		this.uGlowIntensity = uniform(0.18)
		this.uDynamicScale = uniform(1.0)

		this.material = new MeshBasicNodeMaterial()
		this.texNode = texture(this.dataTexture)

		this.material.colorNode = Fn(() => {
			const currentUv = vec2(uv().x, float(1.0).sub(uv().y))
			const sample = this.texNode.sample(currentUv)
			const brightness = sample.r.mul(this.uDynamicScale)
			const gridCoord = fract(currentUv.mul(this.uResolution)).sub(vec2(0.5, 0.5))
			const distFromCenter = length(gridCoord)
			const dotShape = smoothstep(this.uDotRadius, this.uDotRadius.sub(float(0.06)), distFromCenter)
			const glow = smoothstep(float(0.5), float(0.0), distFromCenter).mul(this.uGlowIntensity)
			const intensity = dotShape.add(glow).mul(brightness)
			const rgb = this.uLedColor.mul(intensity)
			return vec4(rgb, float(1.0))
		})()

		this.material.side = DoubleSide
		this.material.depthWrite = false
		this.material.depthTest = true
		this.material.toneMapped = false
		this.material.transparent = false
		this.material.polygonOffset = true
		this.material.polygonOffsetFactor = -4
		this.material.polygonOffsetUnits = -8
	}

	public updateFrame(rawFrame: Uint8Array, width: number, height: number): void {
		if (!rawFrame || rawFrame.length < width * height) return

		let hash = 0
		let maxVal = 0
		const len = width * height
		const u32Len = len >> 2
		const u32 = new Uint32Array(rawFrame.buffer, rawFrame.byteOffset, u32Len)
		for (let i = 0; i < u32Len; i++) {
			const word = u32[i]!
			hash = (hash * 31 + word) | 0
			const b0 = word & 0xff
			const b1 = (word >> 8) & 0xff
			const b2 = (word >> 16) & 0xff
			const b3 = (word >> 24) & 0xff
			const m01 = b0 > b1 ? b0 : b1
			const m23 = b2 > b3 ? b2 : b3
			const mw = m01 > m23 ? m01 : m23
			if (mw > maxVal) maxVal = mw
		}
		for (let i = u32Len << 2; i < rawFrame.length; i++) {
			const v = rawFrame[i]!
			hash = (hash * 31 + v) | 0
			if (v > maxVal) maxVal = v
		}
		if (hash === this.lastHash) return
		this.lastHash = hash
		this.uDynamicScale.value = maxVal <= 3 ? 85.0 : maxVal <= 15 ? 17.0 : 1.0

		if (this.dataTexture.image.width !== width || this.dataTexture.image.height !== height) {
			this.dataTexture.dispose()
			const newBuf = new Uint8Array(width * height)
			newBuf.set(rawFrame.subarray(0, width * height))
			this.dataTexture = new DataTexture(newBuf, width, height, RedFormat, UnsignedByteType)
			this.dataTexture.magFilter = NearestFilter
			this.dataTexture.minFilter = NearestFilter
			this.dataTexture.generateMipmaps = false
			this.dataTexture.wrapS = ClampToEdgeWrapping
			this.dataTexture.wrapT = ClampToEdgeWrapping
			this.dataTexture.colorSpace = NoColorSpace
			this.dataTexture.needsUpdate = true
			this.material.map = this.dataTexture
			if (this.texNode) this.texNode.value = this.dataTexture
			this.uResolution.value.set(width, height)
		} else {
			const buf = this.dataTexture.image.data as Uint8Array
			buf.set(rawFrame.subarray(0, width * height))
			this.dataTexture.needsUpdate = true
		}
	}

	public getTexture(): DataTexture {
		return this.dataTexture
	}
}
