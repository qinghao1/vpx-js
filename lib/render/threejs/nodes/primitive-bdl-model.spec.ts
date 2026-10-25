import { expect } from 'chai'
import {
	AddEquation,
	AdditiveBlending,
	BackSide,
	CustomBlending,
	DoubleSide,
	MeshStandardMaterial,
	OneFactor,
	OneMinusSrcAlphaFactor,
	SrcAlphaFactor,
} from 'three'
import { cloneMaterialForWrite } from '../material-shared.js'
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
import { cloneBakedNodeMaterial, createUnshadedBakedNodeMaterial, isBakedNodeMaterial } from './unshaded-baked-node.js'

describe('native BDL composite factors', () => {
	it('keeps diffuse fully lit below BDL 1 (native lit path, no dim ramp)', () => {
		expect(bdlDiffuseFactor(0)).to.equal(1)
		expect(bdlDiffuseFactor(0.5)).to.equal(1)
		expect(bdlEmissiveCarry(0)).to.equal(0)
		expect(bdlEmissiveCarry(0.5)).to.equal(0)
	})

	it('applies the 2x compat bug at exactly BDL 1', () => {
		expect(bdlDiffuseFactor(1)).to.equal(0)
		expect(bdlEmissiveCarry(1)).to.equal(2)
	})

	it('carries ~BDL x diffuse for script overdrive (native per-light mix)', () => {
		expect(bdlDiffuseFactor(130)).to.equal(0)
		expect(bdlEmissiveCarry(130)).to.equal(130)
		expect(bdlEmissiveCarry(8589)).to.equal(8589)
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
		})
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
			emissionScale: 0.75,
			alphaTestValue: 0.2,
		})
		expect(material.depthWrite).to.equal(true)
		expect(material.transparent).to.equal(false)
		expect(material.blending).to.equal(CustomBlending)
		expect(material.alphaTest).to.equal(0.2)
		expect(material.toneMapped).to.equal(false)
		expect(isBakedNodeMaterial(material)).to.equal(true)
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

	it('clones primitive additive material preserving side and intensity', () => {
		const originalMaterial = createPrimitiveAdditiveMaterial({
			tint: 0x0000ff,
			intensity: 3.5,
			doubleSided: true,
		})
		originalMaterial.userData.pendingMap = 'additive_overlay'
		const clonedMaterial = clonePrimitiveNodeMaterial(originalMaterial)

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
