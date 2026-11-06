import { AddEquation, AdditiveBlending, CustomBlending, OneFactor, OneMinusSrcAlphaFactor } from 'three'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { Vertex2D } from '../../math/vector.js'
import type { IRenderApi } from '../../render/irender-api.js'
import {
	applyAbsorbBlendState,
	clonePrimitiveNodeMaterial,
	createPrimitiveAdditiveMaterial,
} from '../../render/threejs/nodes/primitive-bdl-node.js'
import { ThreeNodeMaterialGenerator } from '../../render/threejs/three-node-material-generator.js'
import { DragPoint } from '../dragpoint.js'
import { Flasher } from './flasher.js'
import { FlasherAddBlend, FlasherData } from './flasher-data.js'

/** FlasherData's constructor is private; construct fixtures through a minimal cast. */
function createFlasherData(name: string): FlasherData {
	const ctor = FlasherData as unknown as new (itemName: string) => FlasherData
	return new ctor(name)
}

/** Flasher's constructor is private; construct fixtures through a minimal cast. */
function createFlasher(data: FlasherData): Flasher {
	const ctor = Flasher as unknown as new (data: FlasherData) => Flasher
	return new ctor(data)
}

function quadData(name: string): FlasherData {
	const data = createFlasherData(name)
	data.dragPoints = [
		Object.assign(new DragPoint(), { vertex: new Vertex2D(0, 0) }),
		Object.assign(new DragPoint(), { vertex: new Vertex2D(100, 0) }),
		Object.assign(new DragPoint(), { vertex: new Vertex2D(100, 100) }),
		Object.assign(new DragPoint(), { vertex: new Vertex2D(0, 100) }),
	]
	return data
}

function makeGenerator(): ThreeNodeMaterialGenerator {
	return new ThreeNodeMaterialGenerator({
		hasTexture: () => false,
		getTexture: () => undefined,
	} as any)
}

describe('Flasher absorb parity (upstream flasher.cpp SetupAddBlendState; AB_ADD still approximate)', () => {
	it('threads the tri-state mode through getMeshes instead of collapsing absorb to additive', () => {
		const table = new TableBuilder().build()
		const renderApi = {} as unknown as IRenderApi<any, any, any>
		const cases = [
			{ mode: FlasherAddBlend.None, addBlend: false },
			{ mode: FlasherAddBlend.Add, addBlend: true },
			{ mode: FlasherAddBlend.Absorb, addBlend: true },
		] as const
		for (const { mode, addBlend } of cases) {
			const data = quadData(`ModeFlasher${mode}`)
			data.addBlendMode = mode
			const meshes = createFlasher(data).getMeshes(table, renderApi, {})
			expect(meshes.flasher?.addBlendMode, `mode ${mode} must survive getMeshes`).toBe(mode)
			expect(meshes.flasher?.addBlend, `boolean fallback for mode ${mode}`).toBe(addBlend)
		}
	})

	it('builds absorb materials as premultiplied-over, add materials as plain additive', () => {
		const generator = makeGenerator()
		const build = (mode?: number): any =>
			generator.getMaterial(
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				true,
				0,
				undefined,
				true,
				undefined,
				0,
				mode,
			)

		const add = build(FlasherAddBlend.Add)
		expect(add.blending, 'add must stay plain additive').toBe(AdditiveBlending)
		expect(add.userData.__addBlend, 'add stays an overlay').toBe(true)
		expect(add.userData.__blend, 'add keeps the additive mode').toBe('additive')

		const legacy = build(undefined)
		expect(legacy.blending, 'boolean callers keep additive').toBe(AdditiveBlending)

		const absorb = build(FlasherAddBlend.Absorb)
		expect(absorb.blending, 'absorb must be premultiplied-over, not additive').toBe(CustomBlending)
		expect(absorb.blendSrc, 'absorb src factor (ONE)').toBe(OneFactor)
		expect(absorb.blendDst, 'absorb dst factor (INVSRC_ALPHA)').toBe(OneMinusSrcAlphaFactor)
		expect(absorb.blendEquation, 'absorb equation (ADD)').toBe(AddEquation)
		expect(absorb.blendSrcAlpha, 'absorb alpha src factor').toBe(OneFactor)
		expect(absorb.blendDstAlpha, 'absorb alpha dst factor').toBe(OneMinusSrcAlphaFactor)
		expect(absorb.userData.__addBlend, 'absorb stays an overlay').toBe(true)
		expect(absorb.userData.__blend, 'absorb marker').toBe('absorb')
	})

	it('stamps absorb state matching the generator', () => {
		// AB_ADD is excluded — it takes the modulate-vs-add path instead.
		const generator = makeGenerator()
		const fromGenerator = generator.getMaterial(
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			true,
			0,
			undefined,
			true,
			undefined,
			0,
			FlasherAddBlend.Absorb,
		)
		// The helper sets blend factors only; the caller declares the mode, and the
		// encoding follows the flag on rebuilds.
		const stub = createPrimitiveAdditiveMaterial({ modulateVsAdd: 0.5 })
		stub.userData.__blend = 'absorb'
		applyAbsorbBlendState(stub)
		for (const key of [
			'blending',
			'blendSrc',
			'blendDst',
			'blendEquation',
			'blendSrcAlpha',
			'blendDstAlpha',
			'blendEquationAlpha',
		] as const) {
			expect(stub[key], `shared helper ${key} must match the generator`).toBe(fromGenerator[key])
		}
	})

	it('caches add and absorb materials separately', () => {
		const generator = makeGenerator()
		const key = (mode?: number): string =>
			generator.getKey(
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				true,
				0,
				undefined,
				true,
				undefined,
				0,
				mode,
			)
		expect(key(FlasherAddBlend.Absorb), 'absorb key must differ from add').not.toBe(key(FlasherAddBlend.Add))
		expect(key(undefined), 'boolean keys keep their shape').not.toContain('undefined')
	})

	it('carries absorb state across for-write clones', () => {
		const src = createPrimitiveAdditiveMaterial({ modulateVsAdd: 0.5, absorb: true })
		const cloned = clonePrimitiveNodeMaterial(src)
		expect(cloned.blending, 'clone keeps premultiplied-over').toBe(CustomBlending)
		expect(cloned.userData.__blend, 'clone keeps the absorb mode').toBe('absorb')
	})

	it('passes modulateVsAdd through on the absorb arm', () => {
		const generator = makeGenerator()
		const mat = generator.getMaterial(
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			true,
			0,
			undefined,
			true,
			undefined,
			0,
			FlasherAddBlend.Absorb,
			undefined,
			undefined,
			undefined,
			0.5,
		)
		// Native's absorb arm derives the src alpha from m_modulate_vs_add; the
		// uniform is required for overdrive correctness.
		expect(mat.userData.__uModulate?.value, 'absorb keeps the modulate uniform').toBeCloseTo(0.5, 12)
		expect(mat.userData.__blend, 'absorb mode still applies').toBe('absorb')
	})
})
