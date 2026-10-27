import { expect } from 'chai'
import {
	AddEquation,
	AdditiveBlending,
	BackSide,
	CustomBlending,
	DataTexture,
	DoubleSide,
	MeshStandardMaterial,
	OneFactor,
	OneMinusSrcAlphaFactor,
	SrcAlphaFactor,
} from 'three'
import { cloneMaterialForWrite } from '../material-shared.js'
import { setGlobalEmissionScale, ThreeNodeMaterialGenerator } from '../three-node-material-generator.js'
import {
	bdlDiffuseFactor,
	bdlEmissiveCarry,
	belowFactor,
	clonePrimitiveNodeMaterial,
	createPrimitiveAdditiveMaterial,
	createPrimitiveBdlMaterial,
	isPrimitiveNodeMaterial,
	updatePrimitiveAdditive,
	updatePrimitiveBdl,
} from './primitive-bdl-node.js'
import {
	BAKED_PLACEHOLDER_ALPHA,
	cloneBakedNodeMaterial,
	createUnshadedBakedNodeMaterial,
	isBakedNodeMaterial,
	setBakedMap,
} from './unshaded-baked-node.js'

type AdditiveMaterialWithCompat = ReturnType<typeof createPrimitiveAdditiveMaterial> & { emissiveIntensity: number }

describe('native BDL composite factors', () => {
	it('blends fractional BDL as mix(lit, diffuse, BDL) like upstream DoPointLight', () => {
		// Upstream lightLoop sums TWO DoPointLight mixes (NUM_LIGHTS=2), each
		// contributing BDL x diffuse, so the single composite carry is 2*BDL while
		// the summed lit result scales by (1-BDL). BDL 0.5 yields half lit plus 1x
		// diffuse, matching upstream (1-0.5)*(r0+r1) + 2*0.5*diffuse.
		expect(bdlDiffuseFactor(0)).to.equal(1)
		expect(bdlDiffuseFactor(0.5)).to.equal(0.5)
		expect(bdlDiffuseFactor(0.25)).to.equal(0.75)
		expect(bdlEmissiveCarry(0)).to.equal(0)
		expect(bdlEmissiveCarry(0.5)).to.equal(1)
		expect(bdlEmissiveCarry(0.25)).to.equal(0.5)
	})

	it('applies the 2x compat bug at exactly BDL 1', () => {
		expect(bdlDiffuseFactor(1)).to.equal(0)
		expect(bdlEmissiveCarry(1)).to.equal(2)
	})

	it('dims diffuse fully for script overdrive (HDR rides emissive, never subtracts)', () => {
		// Native mix() extrapolates past 1, but its flare regime is dominated by
		// 2*BDL*diffuse: lightLoop sums two per-light mixes (NUM_LIGHTS=2) and each
		// per-light result is ~0 in the dark cabinet. The composite's lit input is
		// three.js scene lighting on another scale, so the diffuse factor clamps at
		// 0: overdrive can only add light, never blacken inserts that render as
		// bright HDR flares upstream (see primitive-updater.spec.ts). A 1x carry
		// would render every overdriven insert half-bright and pop 2x at BDL=1.
		expect(bdlDiffuseFactor(130)).to.equal(0)
		expect(bdlEmissiveCarry(130)).to.equal(260)
		expect(bdlDiffuseFactor(8589)).to.equal(0)
		expect(bdlEmissiveCarry(8589)).to.equal(17178)
	})

	it('stays continuous through BDL=1 like upstream (no 2x pop on script fades)', () => {
		// Upstream is continuous at BDL=1: the mix-sum limit from either side is
		// 2x diffuse, equal to the kept-for-compat path value. The composite must
		// match so script fades through 1.0 do not pop.
		expect(bdlEmissiveCarry(0.999)).to.be.closeTo(2, 0.01)
		expect(bdlEmissiveCarry(1)).to.equal(2)
		expect(bdlEmissiveCarry(1.001)).to.be.closeTo(2, 0.01)
	})

	it('computes belowFactor matching native (1 - below) ramp clamped to 0', () => {
		expect(belowFactor(0)).to.equal(1)
		expect(belowFactor(1)).to.equal(0)
		expect(belowFactor(-1)).to.equal(2)
		expect(belowFactor(2)).to.equal(0)
	})
})

describe('primitive BDL node material', () => {
	it('preserves mat.side = DoubleSide / BackSide based on doubleSided flag', () => {
		const doubleSidedMaterial = createPrimitiveBdlMaterial({ doubleSided: true })
		expect(doubleSidedMaterial.side).to.equal(DoubleSide)

		const backSideMaterial = createPrimitiveBdlMaterial({ doubleSided: false })
		expect(backSideMaterial.side).to.equal(BackSide)

		const defaultSideMaterial = createPrimitiveBdlMaterial({})
		expect(defaultSideMaterial.side).to.equal(DoubleSide)
	})

	it('configures custom blending and depth write matching native fs_basic.sc', () => {
		const material = createPrimitiveBdlMaterial({
			albedo: 0xff0000,
			opacity: 0.8,
			alphaTestValue: 0.5,
		})
		expect(material.blending).to.equal(CustomBlending)
		expect(material.blendSrc).to.equal(SrcAlphaFactor)
		expect(material.blendDst).to.equal(OneMinusSrcAlphaFactor)
		expect(material.blendEquation).to.equal(AddEquation)
		expect(material.blendSrcAlpha).to.equal(OneFactor)
		expect(material.blendDstAlpha).to.equal(OneMinusSrcAlphaFactor)
		expect(material.blendEquationAlpha).to.equal(AddEquation)
		expect(material.alphaTest).to.equal(0.5)
		expect(material.toneMapped).to.equal(true)
	})

	it('carries file PBR metalness/roughness instead of hardcoded plastic', () => {
		const material = createPrimitiveBdlMaterial({ metalness: 1, roughness: 0.1 })
		expect(material.metalness).to.equal(1)
		expect(material.roughness).to.equal(0.1)
	})

	it('defaults BDL metalness/roughness to legacy non-metal plastic', () => {
		const material = createPrimitiveBdlMaterial({})
		expect(material.metalness).to.equal(0)
		expect(material.roughness).to.equal(0.4)
	})

	it('updates BDL uniforms via updatePrimitiveBdl', () => {
		const material = createPrimitiveBdlMaterial({ bdl: 0 })
		updatePrimitiveBdl(material, { bdl: 1, albedo: 0x00ff00, opacity: 0.5, below: 0.5 })
		const userData = material.userData as Record<string, { value: unknown }>
		expect(userData.__uBDL.value).to.equal(1)
		expect(userData.__uLitF.value).to.equal(0)
		expect(userData.__uCarry.value).to.equal(2)
		expect(userData.__uAlpha.value).to.equal(0.5)
		expect(userData.__uBelowF.value).to.equal(0.5)
	})

	it('propagates the fractional mix ramp to uniforms on BDL update', () => {
		const material = createPrimitiveBdlMaterial({ bdl: 0 })
		const userData = material.userData as Record<string, { value: unknown }>
		updatePrimitiveBdl(material, { bdl: 0.5 })
		expect(userData.__uBDL.value).to.equal(0.5)
		expect(userData.__uLitF.value).to.equal(0.5)
		expect(userData.__uCarry.value).to.equal(1)
		updatePrimitiveBdl(material, { bdl: 130 })
		// Overdrive dims diffuse fully; the HDR carry rides emissive (see above).
		expect(userData.__uLitF.value).to.equal(0)
		expect(userData.__uCarry.value).to.equal(260)
	})

	it('bakes the fractional mix ramp into creation-path uniforms', () => {
		const material = createPrimitiveBdlMaterial({ bdl: 0.5 })
		const userData = material.userData as Record<string, { value: unknown }>
		expect(userData.__uBDL.value).to.equal(0.5)
		expect(userData.__uLitF.value).to.equal(0.5)
		expect(userData.__uCarry.value).to.equal(1)
	})
})

describe('primitive additive node material', () => {
	it('preserves mat.side = DoubleSide / BackSide based on doubleSided flag', () => {
		const doubleSidedMaterial = createPrimitiveAdditiveMaterial({ doubleSided: true })
		expect(doubleSidedMaterial.side).to.equal(DoubleSide)

		const backSideMaterial = createPrimitiveAdditiveMaterial({ doubleSided: false })
		expect(backSideMaterial.side).to.equal(BackSide)
	})

	it('configures additive blending and unlit properties matching native primitive.cpp', () => {
		const material = createPrimitiveAdditiveMaterial({
			tint: 0xffff00,
			intensity: 2.5,
		}) as AdditiveMaterialWithCompat
		expect(material.blending).to.equal(AdditiveBlending)
		expect(material.transparent).to.equal(true)
		expect(material.depthWrite).to.equal(false)
		expect(material.depthTest).to.equal(true)
		expect(material.toneMapped).to.equal(true)
		expect(material.emissiveIntensity).to.equal(2.5)

		material.emissiveIntensity = 4.0
		expect(material.emissiveIntensity).to.equal(4.0)
	})

	it('updates additive uniforms via updatePrimitiveAdditive', () => {
		const material = createPrimitiveAdditiveMaterial({ tint: 0xffffff, intensity: 1.0 })
		updatePrimitiveAdditive(material, { tint: 0xff0000, intensity: 3.0 })
		const userData = material.userData as Record<string, { value: unknown }>
		expect(userData.__uIntensity.value).to.equal(3.0)
	})
})

describe('unshaded baked node material', () => {
	it('preserves mat.side = DoubleSide / BackSide based on doubleSided flag', () => {
		const doubleSidedMaterial = createUnshadedBakedNodeMaterial({ doubleSided: true })
		expect(doubleSidedMaterial.side).to.equal(DoubleSide)

		const backSideMaterial = createUnshadedBakedNodeMaterial({ doubleSided: false })
		expect(backSideMaterial.side).to.equal(BackSide)
	})

	it('configures baked unshaded material properties', () => {
		const material = createUnshadedBakedNodeMaterial({
			tint: 0x808080,
			alphaTestValue: 0.2,
		})
		expect(material.depthWrite).to.equal(true)
		expect(material.transparent).to.equal(false)
		expect(material.blending).to.equal(CustomBlending)
		expect(material.alphaTest).to.equal(0.2)
		expect(material.toneMapped).to.equal(false)
		expect(isBakedNodeMaterial(material)).to.equal(true)
	})

	it('defaults an unset doubleSided flag to DoubleSide like primitive materials', () => {
		expect(createUnshadedBakedNodeMaterial({}).side).to.equal(DoubleSide)
		expect(createPrimitiveBdlMaterial({}).side).to.equal(DoubleSide)
	})

	it('emits nothing for pending textures (zero placeholder alpha under SrcAlpha blending)', () => {
		// WebGPU applies CustomBlending even with transparent=false, so the
		// placeholder alpha must be 0 or the quad renders opaque black until
		// the texture streams in.
		expect(BAKED_PLACEHOLDER_ALPHA).to.equal(0)
		const pending = createUnshadedBakedNodeMaterial({ mapName: 'tex.png', doubleSided: true })
		expect(pending.blending).to.equal(CustomBlending)
		expect(pending.blendSrc).to.equal(SrcAlphaFactor)
		expect(pending.blendDst).to.equal(OneMinusSrcAlphaFactor)
		expect(pending.transparent).to.equal(false)
	})

	it('switches from the placeholder to textured output when the map arrives', () => {
		const material = createUnshadedBakedNodeMaterial({ mapName: 'tex.png', doubleSided: true })
		const placeholderNode = material.colorNode
		const tex = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
		expect(setBakedMap(material, tex, 'tex.png')).to.equal(true)
		expect(material.colorNode).to.not.equal(placeholderNode)
	})

	it('keeps baked albedo full-bright without an emission-scale slot', () => {
		// Upstream never dims the diffuse albedo: the global emission scale only
		// weights the light terms (Renderer.cpp SetupShaders scales
		// fenvEmissionScale/cAmbient_LightRange/point-light emission, while
		// fs_basic.sc lightLoop and fs_unshaded.sc multiply the unscaled
		// diffuse). Scaling the baked albedo starved lamp-free areas such as
		// the Walking Dead apron at scale 0.25 to near-black.
		const material = createUnshadedBakedNodeMaterial({ tint: 0x808080, mapName: 'tex.png' })
		const userData = material.userData as Record<string, { value?: { getHex?: () => number } }>
		expect(userData.__uTint?.value?.getHex?.()).to.equal(0x808080)
		expect(userData.__uEmissionScale).to.equal(undefined)
	})

	it('ignores the global emission scale for baked materials from the generator', () => {
		setGlobalEmissionScale(0.25)
		try {
			const generator = new ThreeNodeMaterialGenerator({ hasTexture: () => false } as any)
			const material = generator.getMaterial(
				{ name: 'VLM.Bake.Active', baseColor: 0x808080 } as any,
				'VLM.Nestmap0',
			)
			expect(isBakedNodeMaterial(material)).to.equal(true)
			const userData = (material as any).userData as Record<string, { value?: { getHex?: () => number } }>
			expect(userData.__uTint?.value?.getHex?.()).to.equal(0x808080)
			expect(userData.__uEmissionScale).to.equal(undefined)
		} finally {
			setGlobalEmissionScale(1)
		}
	})

	it('cloned baked materials carry no emission-scale slot', () => {
		const cloned = cloneBakedNodeMaterial(createUnshadedBakedNodeMaterial({ tint: 0xffffff }))
		expect((cloned as any).userData.__uEmissionScale).to.equal(undefined)
	})
})

describe('material cloning parity and fork-safety', () => {
	it('clones primitive BDL material preserving side and uniforms', () => {
		const originalMaterial = createPrimitiveBdlMaterial({
			albedo: 0x00ff00,
			opacity: 0.7,
			bdl: 1.0,
			below: 0.25,
			doubleSided: false,
		})
		originalMaterial.userData.pendingMap = 'test_map'
		const clonedMaterial = clonePrimitiveNodeMaterial(originalMaterial)

		expect(isPrimitiveNodeMaterial(clonedMaterial)).to.equal(true)
		expect(clonedMaterial.side).to.equal(BackSide)
		expect(clonedMaterial.userData.pendingMap).to.equal('test_map')
		const clonedUserData = clonedMaterial.userData as Record<string, { value: unknown }>
		expect(clonedUserData.__uBDL.value).to.equal(1.0)
		expect(clonedUserData.__uLitF.value).to.equal(0)
		expect(clonedUserData.__uCarry.value).to.equal(2)
		expect(clonedUserData.__uAlpha.value).to.equal(0.7)
	})

	it('clones primitive BDL material preserving PBR metalness/roughness', () => {
		const originalMaterial = createPrimitiveBdlMaterial({ metalness: 1, roughness: 0.1 })
		originalMaterial.metalness = 1
		originalMaterial.roughness = 0.2
		const clonedMaterial = clonePrimitiveNodeMaterial(originalMaterial)
		expect(clonedMaterial.metalness).to.equal(1)
		expect(clonedMaterial.roughness).to.equal(0.2)
	})

	it('clones primitive additive material preserving side and intensity', () => {
		const originalMaterial = createPrimitiveAdditiveMaterial({
			tint: 0x0000ff,
			intensity: 3.5,
			doubleSided: true,
		})
		originalMaterial.userData.pendingMap = 'additive_overlay'
		const clonedMaterial = clonePrimitiveNodeMaterial(originalMaterial) as AdditiveMaterialWithCompat

		expect(isPrimitiveNodeMaterial(clonedMaterial)).to.equal(true)
		expect(clonedMaterial.side).to.equal(DoubleSide)
		expect(clonedMaterial.userData.pendingMap).to.equal('additive_overlay')
		expect(clonedMaterial.emissiveIntensity).to.equal(3.5)
	})

	it('clones baked node material preserving side and pending keys', () => {
		const originalMaterial = createUnshadedBakedNodeMaterial({
			tint: 0xffffff,
			doubleSided: false,
		})
		originalMaterial.userData.pendingMap = 'baked_playfield'
		const clonedMaterial = cloneBakedNodeMaterial(originalMaterial)

		expect(isBakedNodeMaterial(clonedMaterial)).to.equal(true)
		expect(clonedMaterial.side).to.equal(BackSide)
		expect(clonedMaterial.userData.pendingMap).to.equal('baked_playfield')
	})

	it('routes through cloneMaterialForWrite for all material variants', () => {
		const bdlMaterial = createPrimitiveBdlMaterial({ doubleSided: true })
		const bakedMaterial = createUnshadedBakedNodeMaterial({ doubleSided: false })
		const standardMaterial = new MeshStandardMaterial()
		standardMaterial.side = BackSide

		const clonedBdl = cloneMaterialForWrite(bdlMaterial)
		const clonedBaked = cloneMaterialForWrite(bakedMaterial)
		const clonedStandard = cloneMaterialForWrite(standardMaterial)

		expect(isPrimitiveNodeMaterial(clonedBdl)).to.equal(true)
		expect(clonedBdl.side).to.equal(DoubleSide)

		expect(isBakedNodeMaterial(clonedBaked)).to.equal(true)
		expect(clonedBaked.side).to.equal(BackSide)

		expect(clonedStandard.side).to.equal(BackSide)
		expect(clonedStandard).to.not.equal(standardMaterial)
	})
})
