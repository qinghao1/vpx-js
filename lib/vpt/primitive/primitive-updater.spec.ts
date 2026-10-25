// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import { spy } from 'sinon'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Player } from '../../game/player.js'
import {
	createPrimitiveAdditiveMaterial,
	createPrimitiveBdlMaterial,
	setPrimitiveMap,
} from '../../render/threejs/nodes/primitive-bdl-node.js'
import { createUnshadedBakedNodeMaterial } from '../../render/threejs/nodes/unshaded-baked-node.js'
import { Vertex3D } from '../../util/vector.js'
import type { Table } from '../table/table.js'
import type { PrimitiveState } from './primitive-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VPinball primitive updater', () => {
	let table: Table
	let player: Player

	beforeEach(() => {
		table = new TableBuilder()
			.addMaterial('mat')
			.addPrimitive('pStatic', { staticRendering: true })
			.addPrimitive('pDynamic', { staticRendering: false })
			.build()

		// init player
		player = new Player(table).init()
	})

	it('should update visibility even when static rendering is enabled', () => {
		table.primitives.pStatic.getApi().Visible = false
		const states = player.popStates()
		expect(states.getState<PrimitiveState>('pStatic').isVisible).to.equal(false)
		states.getState<PrimitiveState>('pStatic').release()
	})

	it('should update visibility when static rendering is disabled', () => {
		table.primitives.pDynamic.getApi().Visible = false
		const states = player.popStates()
		expect(states.getState<PrimitiveState>('pDynamic').isVisible).to.equal(false)
		states.getState<PrimitiveState>('pDynamic').release()
	})

	it('should update the material', () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.primitives.pDynamic.getUpdater().applyState(null, { material: 'mat' } as PrimitiveState, renderApi, table)
		expect(renderApi.applyMaterial).to.have.been.calledOnce
	})

	it('should render script off-state (BDL=1) as unlit albedo through the BDL mix', () => {
		// Native material.sh DoPointLight: BDL == 1.0 swaps the point lights for the
		// kept-for-compat 2x diffuse bug; the table script parks off-state inserts at
		// BlendDisableLighting = 1 (pure unlit albedo), never at scene-lit 0.
		table = new TableBuilder()
			.addMaterial('insertrectangle1off', { baseColor: 0xc8e1ff })
			.addPrimitive('bevel', {
				szMaterial: 'insertrectangle1off',
				szImage: 'insertrectangle1off',
				depthBias: 500,
				alpha: 100,
			})
			.build()
		const renderApi = new TestRenderApi()
		const map = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1)
		const mesh = {
			name: '015_Primitive011',
			material: createPrimitiveBdlMaterial({ map, albedo: 0xffffff, opacity: 1, bdl: 0 }),
		}
		table.primitives.bevel
			.getUpdater()
			.applyState(mesh, { disableLightingTop: 1 } as PrimitiveState, renderApi, table)
		const mat = mesh.material as any
		expect(mat.userData.__uBDL.value, 'off-state bevel must be fully unlit').to.equal(1)
		expect(mat.userData.__uAlbedo.value.getHex(), 'off-state albedo must be base tint').to.equal(0xc8e1ff)
		expect(mat.transparent, 'off-state bevel stays opaque').to.equal(false)
		expect(mat.depthWrite, 'off-state bevel keeps writing depth').to.equal(true)
		expect(mat.emissiveMap, 'BDL shader carries no emissiveMap').to.equal(null)
	})

	it('should carry HDR lamp overdrive on emissive, never subtracting lit (no black inserts)', () => {
		// TWD drives lit flares at BDL 130..8500. Native evaluates mix(lit, diffuse, BDL)
		// per light (~BDL x diffuse into the tonemapper). The composite keeps diffuse
		// only below BDL 1 and puts the overdrive on emissive, which can only add light.
		table = new TableBuilder()
			.addMaterial('insertonledwhite1', { baseColor: 0xffffff })
			.addPrimitive('well', {
				szMaterial: 'insertonledwhite1',
				szImage: 'rectdotson3',
				depthBias: 600,
				alpha: 100,
			})
			.build()
		const renderApi = new TestRenderApi()
		const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
		const mesh: any = {
			name: '015_Primitive012',
			visible: true,
			material: createPrimitiveBdlMaterial({ map, albedo: 0xffffff, opacity: 1, bdl: 0 }),
		}
		table.primitives.well
			.getUpdater()
			.applyState(mesh, { disableLightingTop: 875 } as PrimitiveState, renderApi, table)
		const mat = mesh.material as any
		expect(mat.userData.__uBDL.value, 'HDR overdrive rides the emissive uniform').to.equal(875)
		expect(mat.userData.__uDim.value, 'overdriven diffuse is fully dimmed').to.equal(0)
		expect(mat.userData.__uCarry.value, 'overdrive carry equals BDL for BDL >> 1').to.equal(875)
		expect(mat.emissiveNode, 'unlit travels on emissive, never outputNode mix').to.not.equal(null)
		expect(mat.outputNode, 'no outputNode mix to drive negative').to.equal(null)
		table.primitives.well
			.getUpdater()
			.applyState(mesh, { disableLightingTop: 0 } as PrimitiveState, renderApi, table)
		expect(mat.userData.__uDim.value, 'undriven diffuse stays fully lit').to.equal(1)
	})

	it('should keep an undriven insert (BDL=0) scene-lit with no unlit bias', () => {
		table = new TableBuilder()
			.addMaterial('insertrectangle1off', { baseColor: 0xc8e1ff })
			.addPrimitive('bevel', {
				szMaterial: 'insertrectangle1off',
				szImage: 'insertrectangle1off',
				depthBias: 500,
				alpha: 100,
			})
			.build()
		const renderApi = new TestRenderApi()
		const map = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1)
		const mesh = {
			name: '015_Primitive011',
			material: createPrimitiveBdlMaterial({ map, albedo: 0xffffff, opacity: 1, bdl: 0 }),
		}
		table.primitives.bevel
			.getUpdater()
			.applyState(mesh, { disableLightingTop: 0 } as PrimitiveState, renderApi, table)
		const mat = mesh.material as any
		expect(mat.userData.__uBDL.value, 'undriven bevel must stay scene-lit').to.equal(0)
		expect(mat.userData.__uAlbedo.value.getHex(), 'undriven bevel keeps its diffuse').to.equal(0xc8e1ff)
	})

	it('should hold BDL intent in uniforms while the insert map is still streaming', () => {
		table = new TableBuilder()
			.addMaterial('inserttriangle3on', { baseColor: 0xffffff })
			.addPrimitive('bevel', {
				szMaterial: 'inserttriangle3on',
				szImage: 'inserttriangle3on',
				depthBias: 500,
				alpha: 100,
			})
			.build()
		const renderApi = new TestRenderApi()
		const mesh = {
			name: '015_Primitive011',
			material: createPrimitiveBdlMaterial({ albedo: 0xffffff, opacity: 1, bdl: 0 }),
		}
		table.primitives.bevel
			.getUpdater()
			.applyState(mesh, { disableLightingTop: 7 } as PrimitiveState, renderApi, table)
		const mat = mesh.material as any
		expect(mat.userData.__uBDL.value, 'BDL intent lives in the uniform, not a stash').to.equal(7)
		expect(mat.userData.__uAlbedo.value.getHex(), 'flat albedo never flashes white').to.equal(0xffffff)
		const map = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1)
		setPrimitiveMap(mat, map, 'inserttriangle3on')
		expect(mat.userData.__uBDL.value, 'arrival keeps the script BDL').to.equal(7)
		expect(mat.userData.__map, 'arrival attaches the albedo').to.equal(map)
	})

	it('should overdrive lit ON sockets without clamping and keep them opaque lenses', () => {
		table = new TableBuilder()
			.addMaterial('insertonledwhite1', { baseColor: 0xffffff })
			.addPrimitive('well', {
				szMaterial: 'insertonledwhite1',
				szImage: 'rectdotson3',
				depthBias: 600,
				alpha: 100,
			})
			.build()
		const renderApi = new TestRenderApi()
		const map = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1)
		const mesh = {
			name: '015_Primitive012',
			material: createPrimitiveBdlMaterial({ map, albedo: 0xffffff, opacity: 1, bdl: 0 }),
		}
		table.primitives.well
			.getUpdater()
			.applyState(mesh, { disableLightingTop: 7 } as PrimitiveState, renderApi, table)
		const mat = mesh.material as any
		expect(mat.userData.__uBDL.value, 'lit well must overdrive, not clamp').to.equal(7)
		table.primitives.well
			.getUpdater()
			.applyState(mesh, { disableLightingTop: 0 } as PrimitiveState, renderApi, table)
		// Native hides unlit ON sockets via script Visible=false, not transparency: the parked
		// material stays an opaque unlit lens (TWD 015_Primitive012, addBlend=false).
		expect(mat.opacity, 'undriven well stays an opaque lens').to.equal(1)
		expect(mat.transparent, 'undriven well stays opaque').to.equal(false)
		expect(mat.depthWrite, 'undriven well keeps writing depth').to.equal(true)
		expect(mat.userData.__uBDL.value, 'undriven well must not glow').to.equal(0)
	})

	it('should keep the authored alpha cutout on BDL inserts', () => {
		table = new TableBuilder()
			.addMaterial('insertrectangle1off', { baseColor: 0xc8e1ff })
			.addPrimitive('bevel', {
				szMaterial: 'insertrectangle1off',
				szImage: 'insertrectangle1off',
				depthBias: 500,
				alpha: 100,
			})
			.build()
		const renderApi = new TestRenderApi()
		const map = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1)
		const mesh = {
			name: '015_Primitive011',
			material: createPrimitiveBdlMaterial({
				map,
				albedo: 0xffffff,
				opacity: 1,
				bdl: 0,
				alphaTestValue: 1 / 255,
			}),
		}
		table.primitives.bevel
			.getUpdater()
			.applyState(mesh, { disableLightingTop: 1 } as PrimitiveState, renderApi, table)
		const mat = mesh.material as any
		expect(mat.alphaTest, 'BDL pass must keep the lens cutout').to.be.closeTo(1 / 255, 1e-6)
	})

	it('should shade baked surfaces with their base tint, not full white', () => {
		table = new TableBuilder()
			.addMaterial('CabinetBake', { baseColor: 0x323232 })
			.addPrimitive('cabinet', {
				szMaterial: 'CabinetBake',
				szImage: 'cabinet_bake',
			})
			.build()
		const renderApi = new TestRenderApi()
		const map = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1)
		map.needsUpdate = true
		const mesh = {
			name: 'primitive-cabinet',
			material: createUnshadedBakedNodeMaterial({ map }),
		}
		table.primitives.cabinet
			.getUpdater()
			.applyState(mesh, { disableLightingTop: 1 } as PrimitiveState, renderApi, table)
		const mat = mesh.material as any
		expect(mat.userData.__uTintColor?.value.getHex(), 'baked tint must carry the dark base').to.equal(0x323232)
	})

	it('should keep script HDR on additive overlays (alpha 250 => 2.5x, not clamped to 1)', () => {
		// Native fs_unshaded: result = staticColor*tex with staticColor = color*(alpha/100),
		// blend SRC_ALPHA,ONE (RenderDevice::EnableAlphaBlend(true)). TWD drives GI overlays at
		// opacity 200-250, so the overlay intensity must stay unclamped HDR for bloom to catch it.
		table = new TableBuilder()
			.addMaterial('VLM.Bake', { baseColor: 0xffffff })
			.addPrimitive('gi', {
				szMaterial: 'VLM.Bake',
				szImage: 'gi_overlay',
				addBlend: true,
				alpha: 250,
				color: 0xffffff,
			})
			.build()
		const renderApi = new TestRenderApi()
		const map = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1)
		const mesh = {
			name: 'LM_GI0_Playfield',
			visible: true,
			material: createPrimitiveAdditiveMaterial({ map, tint: 0xffffff, intensity: 0 }),
		}
		table.primitives.gi.getUpdater().applyState(mesh, { alpha: 250 } as PrimitiveState, renderApi, table)
		const mat = mesh.material as any
		expect(mat.userData.__uIntensity.value, 'GI overlay at alpha 250 must stay 2.5x HDR').to.be.closeTo(2.5, 1e-6)
		expect(mat.toneMapped, 'native tonemaps every pass').to.equal(true)
		table.primitives.gi.getUpdater().applyState(mesh, { alpha: 0 } as PrimitiveState, renderApi, table)
		expect(mesh.visible, 'additive with nothing to add skips the draw').to.equal(false)
	})

	it('should not force script-hidden BDL wells visible (native primitive.cpp:1037)', () => {
		// TWD parks the off-state flare 015_Primitive012 at visible=false; the updater
		// forced every BDL mesh visible, so dark recessed sockets covered the playfield
		// and inserts read as unlit outlines.
		table = new TableBuilder()
			.addMaterial('insertonledwhite1', { baseColor: 0xffffff })
			.addPrimitive('well', {
				szMaterial: 'insertonledwhite1',
				szImage: 'rectdotson3',
				depthBias: 600,
				alpha: 100,
			})
			.build()
		const renderApi = new TestRenderApi()
		const map = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1)
		const mesh: any = {
			name: '015_Primitive012',
			visible: false,
			material: createPrimitiveBdlMaterial({ map, albedo: 0xffffff, opacity: 1, bdl: 0 }),
		}
		// TestRenderApi.applyVisibility is a no-op, so the mesh flag simulates what the
		// real render API applied; applyColor must leave it alone either way.
		table.primitives.well
			.getUpdater()
			.applyState(mesh, { isVisible: false, disableLightingTop: 0 } as PrimitiveState, renderApi, table)
		expect(mesh.visible, 'script-hidden well must stay hidden').to.equal(false)
		mesh.visible = true
		table.primitives.well
			.getUpdater()
			.applyState(mesh, { isVisible: true, disableLightingTop: 800 } as PrimitiveState, renderApi, table)
		expect(mesh.visible, 'script-shown flare must stay shown').to.equal(true)
	})

	it('should keep additive rgb unscaled by lamp level (native fs_unshaded.sc)', () => {
		// Native unlit-with-texture is result = staticColor * tex under SRC_ALPHA,ONE:
		// the lamp level rides alpha only. Baking it into rgb too squares the level
		// (2.5x GI becomes 6.25x) and washes the playfield pink-white.
		table = new TableBuilder()
			.addMaterial('VLM.Bake', { baseColor: 0xffffff })
			.addPrimitive('gi', {
				szMaterial: 'VLM.Bake',
				szImage: 'gi_overlay',
				addBlend: true,
				alpha: 250,
				color: 0x96b4ff,
			})
			.build()
		const renderApi = new TestRenderApi()
		const map = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1)
		const mesh: any = {
			name: 'LM_GI0_Playfield',
			visible: true,
			material: createPrimitiveAdditiveMaterial({ map, tint: 0xffffff, intensity: 0 }),
		}
		table.primitives.gi.getUpdater().applyState(mesh, { alpha: 250 } as PrimitiveState, renderApi, table)
		const mat = mesh.material as any
		expect(mat.userData.__uIntensity.value, 'lamp level rides the alpha uniform').to.be.closeTo(2.5, 1e-6)
		expect(mat.userData.__uTint.value.getHex(), 'rgb tint must stay unscaled (no squared intensity)').to.equal(
			0x96b4ff,
		)
	})

	it('should keep script-hidden additive overlays hidden', () => {
		table = new TableBuilder()
			.addMaterial('VLM.Bake', { baseColor: 0xffffff })
			.addPrimitive('gi', {
				szMaterial: 'VLM.Bake',
				szImage: 'gi_overlay',
				addBlend: true,
				alpha: 250,
				color: 0xffffff,
			})
			.build()
		const renderApi = new TestRenderApi()
		const map = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1)
		const mesh: any = {
			name: 'LM_GI0_Playfield',
			visible: false,
			material: createPrimitiveAdditiveMaterial({ map, tint: 0xffffff, intensity: 0 }),
		}
		table.primitives.gi
			.getUpdater()
			.applyState(mesh, { isVisible: false, alpha: 250 } as PrimitiveState, renderApi, table)
		expect(mesh.visible, 'script-hidden overlay must stay hidden even with content').to.equal(false)
	})

	it('should update the transformation matrix', () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMatrixToNode')
		table.primitives.pDynamic
			.getUpdater()
			.applyState(null, { size: new Vertex3D(1.5, 1, 1) } as PrimitiveState, renderApi, table)
		table.primitives.pDynamic
			.getUpdater()
			.applyState(null, { rotation: new Vertex3D(45, 0, 0) } as PrimitiveState, renderApi, table)
		table.primitives.pDynamic
			.getUpdater()
			.applyState(null, { translation: new Vertex3D(50, 10, 0) } as PrimitiveState, renderApi, table)
		table.primitives.pDynamic
			.getUpdater()
			.applyState(null, { objectRotation: new Vertex3D(0, 45, 0) } as PrimitiveState, renderApi, table)
		expect(renderApi.applyMatrixToNode).to.have.been.callCount(4)
	})
})
