// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import type { IRenderApi } from '../../render/irender-api.js'
import type { EmuFloatState } from '../state-link.js'
import { FlasherAddBlend, FlasherData } from './flasher-data.js'
import { FlasherState } from './flasher-state.js'
import { FlasherUpdater } from './flasher-updater.js'

/** FlasherData's constructor is private; construct fixtures through a minimal cast. */
function createFlasherData(name: string): FlasherData {
	const ctor = FlasherData as unknown as new (itemName: string) => FlasherData
	return new ctor(name)
}

function stubEmulator(lamps: Record<number, number>): EmuFloatState {
	return {
		getLampState: (n: number) => lamps[n] ?? 0,
		getSolenoidState: () => 0,
		getGIState: () => 0,
	}
}

/** Additive-overlay fixture exposing the live intensity uniform. */
function slnkFixture(lamp: number | undefined, lightState: { intensity: number; intensityScale: number }) {
	const table = new TableBuilder().build() as unknown as Record<string, any>
	table.lights = {
		L1: { data: { intensity: 10 }, getState: () => lightState },
	}
	const data = createFlasherData('SlnkFlasher')
	data.addBlendMode = FlasherAddBlend.Add
	data.szLightmap = 'L1'
	data.stateSrcLink = 'ctrl://pinmame/state?group=10&mapping=11'
	const state = FlasherState.claim('SlnkFlasher', true, 0xffffff, 100)
	const updater = new FlasherUpdater(state, data)
	if (lamp !== undefined) updater.setEmuProvider(() => stubEmulator({ 11: lamp }))
	const material = {
		needsUpdate: false,
		userData: { __uTint: { value: { set: () => {} } }, __uIntensity: { value: 0 } },
	}
	const node = {
		visible: false,
		traverse: (callback: (child: unknown) => void) => callback({ isMesh: true, material }),
	}
	const renderApi = new TestRenderApi() as unknown as IRenderApi<any, any, any>
	return { table, updater, state, node, material, renderApi }
}

describe('The VPinball flasher controller link', () => {
	it('should apply a resolved SLNK link instead of the lightmap (never both)', () => {
		const { table, updater, state, node, material, renderApi } = slnkFixture(0.25, {
			intensity: 5,
			intensityScale: 1,
		})
		updater.applyState(node, state, renderApi, table as any)
		// Upstream: 100 * 0.25 with the lightmap suppressed — not 100 * 0.25 * 0.5.
		expect(node.visible).toBe(true)
		expect(material.userData.__uIntensity.value).toBeCloseTo(0.25, 1e-5)
	})

	it('should fall back to the lightmap when SLNK does not resolve', () => {
		const { table, updater, state, node, material, renderApi } = slnkFixture(undefined, {
			intensity: 5,
			intensityScale: 1,
		})
		updater.applyState(node, state, renderApi, table as any)
		expect(material.userData.__uIntensity.value).toBeCloseTo(0.5, 1e-5)
	})

	it('should hide the flasher when the linked lamp scale is zero (upstream yields alpha 0)', () => {
		const { table, updater, state, node, renderApi } = slnkFixture(undefined, { intensity: 0, intensityScale: 0 })
		updater.applyState(node, state, renderApi, table as any)
		expect(node.visible).toBe(false)
	})
})
