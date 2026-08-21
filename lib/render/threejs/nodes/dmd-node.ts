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
import {
	clamp,
	Fn,
	float,
	floor,
	fract,
	fwidth,
	length,
	max,
	mix,
	smoothstep,
	texture,
	uniform,
	uv,
	vec2,
	vec4,
} from 'three/tsl'
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
			const currentUv = clamp(vec2(uv().x, float(1.0).sub(uv().y)), vec2(0.0, 0.0), vec2(0.99999, 0.99999))
			const gridPos = currentUv.mul(this.uResolution)
			const cellUv = floor(gridPos).add(vec2(0.5, 0.5)).div(this.uResolution)
			const sample = this.texNode.sample(cellUv)
			const brightness = sample.r.mul(this.uDynamicScale)

			// Screen-space cell derivative: smoothly blend from circular dots (close-up) to solid cells (distant/play mode)
			const cellDeriv = fwidth(gridPos)
			const cellScale = max(cellDeriv.x, cellDeriv.y)
			const blendToSquare = clamp(cellScale.mul(float(3.0)).sub(float(0.3)), float(0.0), float(1.0))

			const gridCoord = fract(gridPos).sub(vec2(0.5, 0.5))
			const distFromCenter = length(gridCoord)
			const aa = cellScale.mul(float(0.5)).max(float(0.02))

			const edge0 = this.uDotRadius.sub(aa.mul(float(0.5)))
			const edge1 = this.uDotRadius.add(aa.mul(float(0.5)))
			const roundDot = float(1.0).sub(smoothstep(edge0, edge1, distFromCenter))

			const glow = float(1.0)
				.sub(smoothstep(float(0.0), float(0.5), distFromCenter))
				.mul(this.uGlowIntensity)

			const shapeWithGlow = roundDot.add(glow.mul(float(1.0).sub(blendToSquare)))
			const intensity = mix(shapeWithGlow, float(1.0), blendToSquare).mul(brightness)
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

	public setLedColor(color: Color | number): void {
		if (typeof color === 'number') {
			this.uLedColor.value.setHex(color)
		} else {
			this.uLedColor.value.copy(color)
		}
	}

	public setDotRadius(radius: number): void {
		this.uDotRadius.value = radius
	}

	public setGlowIntensity(intensity: number): void {
		this.uGlowIntensity.value = intensity
	}

	public updateFrame(rawFrame: Uint8Array, width: number, height: number): void {
		if (!rawFrame || rawFrame.length < width * height) return

		let hash = 0
		let maxVal = 0
		const len = width * height
		if (rawFrame.byteOffset % 4 === 0) {
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
			for (let i = u32Len << 2; i < len; i++) {
				const v = rawFrame[i]!
				hash = (hash * 31 + v) | 0
				if (v > maxVal) maxVal = v
			}
		} else {
			for (let i = 0; i < len; i++) {
				const v = rawFrame[i]!
				hash = (hash * 31 + v) | 0
				if (v > maxVal) maxVal = v
			}
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
			this.texNode.value = this.dataTexture
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
