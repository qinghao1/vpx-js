import { AddEquation, AdditiveBlending, CustomBlending, OneFactor, OneMinusSrcAlphaFactor } from 'three'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Vertex2D } from '../../math/vector.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { applyAbsorbBlendState } from '../../render/threejs/nodes/primitive-bdl-node.js'
import { ThreeNodeMaterialGenerator } from '../../render/threejs/three-node-material-generator.js'
import { DragPoint } from '../dragpoint.js'
import { Flasher } from './flasher.js'
import { FlasherAddBlend, FlasherData } from './flasher-data.js'
import { FlasherState } from './flasher-state.js'
import { FlasherUpdater } from './flasher-updater.js'

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
		const renderApi = new TestRenderApi() as unknown as IRenderApi<any, any, any>
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
			expect(meshes.flasher?.addBlend, `legacy boolean for mode ${mode}`).toBe(addBlend)
		}
	})

	it('builds absorb materials as premultiplied-over, add materials as plain additive', () => {
		const generator = makeGenerator()
		const build = (mode?: number): any =>
			(generator as any).getMaterial(
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
		expect(add.userData.__absorbBlend, 'add must not absorb').toBeFalsy()

		const legacy = build(undefined)
		expect(legacy.blending, 'legacy boolean callers keep additive').toBe(AdditiveBlending)

		const absorb = build(FlasherAddBlend.Absorb)
		expect(absorb.blending, 'absorb must be premultiplied-over, not additive').toBe(CustomBlending)
		expect(absorb.blendSrc, 'absorb src factor (ONE)').toBe(OneFactor)
		expect(absorb.blendDst, 'absorb dst factor (INVSRC_ALPHA)').toBe(OneMinusSrcAlphaFactor)
		expect(absorb.blendEquation, 'absorb equation (ADD)').toBe(AddEquation)
		expect(absorb.blendSrcAlpha, 'absorb alpha src factor').toBe(OneFactor)
		expect(absorb.blendDstAlpha, 'absorb alpha dst factor').toBe(OneMinusSrcAlphaFactor)
		expect(absorb.userData.__addBlend, 'absorb stays an overlay').toBe(true)
		expect(absorb.userData.__absorbBlend, 'absorb marker').toBe(true)
	})

	it('stamps absorb state through the shared helper, matching the generator', () => {
		// The generator and the per-frame updater stamp must not drift into a
		// byte-copy again: both go through applyAbsorbBlendState. AB_ADD is
		// deliberately excluded — it stays plain additive, not upstream's
		// reverse-subtract, pending golden review.
		const generator = makeGenerator()
		const fromGenerator = (generator as any).getMaterial(
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
		const stub: Record<string, any> = { userData: {} }
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
		expect(stub.userData.__absorbBlend, 'shared helper absorb marker').toBe(true)
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
		expect(key(undefined), 'legacy keys keep their shape').not.toContain('undefined')
	})

	it('stamps premultiplied-over onto live absorb materials while keeping the additive uniform path', () => {
		const table = new TableBuilder().build()
		const data = quadData('AbsorbLive')
		data.addBlendMode = FlasherAddBlend.Absorb
		data.intensityScale = 2
		const state = FlasherState.claim('AbsorbLive', true, 0xff8844, 80)
		const updater = new FlasherUpdater(state, data)

		let tintColor = 0
		const targetMesh = {
			isMesh: true,
			material: {
				// Simulates a forked clone rebuilt as plain additive: blending must be repaired.
				blending: AdditiveBlending,
				needsUpdate: false,
				userData: {
					__uTint: { value: { set: (hex: number) => (tintColor = hex) } },
					__uIntensity: { value: 0 },
				},
			},
		}
		const node = {
			visible: false,
			traverse: (callback: (child: unknown) => void) => callback(targetMesh),
		}
		const renderApi = new TestRenderApi() as unknown as IRenderApi<any, any, any>
		updater.applyState(node, state, renderApi, table)

		expect(node.visible).toBe(true)
		expect(tintColor, 'absorb shares the additive tint path').toBe(0xff8844)
		expect(targetMesh.material.userData.__uIntensity.value).toBeCloseTo((80 * 2) / 100, 1e-5)
		const mat = targetMesh.material as Record<string, any>
		expect(mat.blending, 'live absorb material must absorb').toBe(CustomBlending)
		expect(mat.blendSrc).toBe(OneFactor)
		expect(mat.blendDst).toBe(OneMinusSrcAlphaFactor)
		expect(mat.blendEquation).toBe(AddEquation)
		expect(mat.userData.__absorbBlend).toBe(true)
	})

	it('leaves add and plain materials alone in the updater', () => {
		const table = new TableBuilder().build()
		const renderApi = new TestRenderApi() as unknown as IRenderApi<any, any, any>

		const addData = quadData('AddUntouched')
		addData.addBlend = true
		const addState = FlasherState.claim('AddUntouched', true, 0xff8844, 80)
		const addUpdater = new FlasherUpdater(addState, addData)
		const addMat = { blending: AdditiveBlending, needsUpdate: false, userData: {} }
		const addNode = {
			visible: false,
			traverse: (callback: (child: unknown) => void) => callback({ isMesh: true, material: addMat }),
		}
		addUpdater.applyState(addNode, addState, renderApi, table)
		expect(addNode.visible).toBe(true)
		expect(addMat.blending, 'add keeps its material blending').toBe(AdditiveBlending)
		expect((addMat.userData as Record<string, unknown>).__absorbBlend).toBeFalsy()

		const plainData = quadData('PlainUntouched')
		const plainState = FlasherState.claim('PlainUntouched', true, 0x112233, 50)
		const plainUpdater = new FlasherUpdater(plainState, plainData)
		const plainMat: { opacity?: number; transparent?: boolean; needsUpdate?: boolean } = { opacity: 1 }
		const plainNode = {
			visible: false,
			traverse: (callback: (child: unknown) => void) => callback({ isMesh: true, material: plainMat }),
		}
		plainUpdater.applyState(plainNode, plainState, renderApi, table)
		expect(plainNode.visible).toBe(true)
		expect(plainMat.opacity).toBeCloseTo(0.5, 1e-5)
	})
})
