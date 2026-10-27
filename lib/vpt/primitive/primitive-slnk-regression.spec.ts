import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import type { IEmulator } from '../../game/iemulator.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import type { IRenderApi } from '../../render/irender-api.js'
import type { Primitive } from './primitive.js'
import { PrimitiveData } from './primitive-data.js'
import { PRIMITIVE_ADDITIVE_KIND } from './primitive-material-protocol.js'

function stubEmulator(lamps: Record<number, number>): IEmulator {
	return {
		emuSimulateCycle: () => 0,
		setSwitchInput: () => true,
		getLampState: (n: number) => lamps[n] ?? 0,
		getSolenoidState: () => 0,
		getGIState: () => 0,
	} as unknown as IEmulator
}

function stringRecord(tag: string, value: string): Uint8Array {
	const text = new TextEncoder().encode(value)
	const payload = new Uint8Array(4 + text.length)
	new DataView(payload.buffer).setInt32(0, text.length, true)
	payload.set(text, 4)
	const record = new Uint8Array(8 + payload.length)
	new DataView(record.buffer).setInt32(0, payload.length + 4, true)
	record.set(new TextEncoder().encode(tag), 4)
	record.set(payload, 8)
	return record
}

function endRecord(): Uint8Array {
	const record = new Uint8Array(8)
	new DataView(record.buffer).setInt32(0, 4, true)
	record.set(new TextEncoder().encode('ENDB'), 4)
	return record
}

function storageFromRecords(records: Uint8Array[]): Storage {
	return {
		streamFiltered: async (_name: string, _offset: number, next: (r: ReadResult) => Promise<number | null>) => {
			for (const data of records) {
				if ((await next({ data, storageOffset: 0 })) === null) break
			}
		},
	} as unknown as Storage
}

describe('The VPinball primitive controller link', () => {
	it('should parse the SLNK tag', async () => {
		const data = await PrimitiveData.fromStorage(
			storageFromRecords([
				stringRecord('SLNK', 'ctrl://pinmame/state?group=10&mapping=11'),
				stringRecord('LMAP', 'L1'),
				endRecord(),
			]),
			'Prim1',
			true,
		)
		expect(data.stateSrcLink).toBe('ctrl://pinmame/state?group=10&mapping=11')
		expect(data.szLightmap).toBe('L1')
	})

	describe('SLNK vs lightmap exclusivity (upstream primitive.cpp:932-940)', () => {
		function slnkFixture(lamp: number | undefined) {
			const table = new TableBuilder()
				.addMaterial('insertOn', { baseColor: 0xffffff })
				.addPrimitive('SlnkPrim', {
					szMaterial: 'insertOn',
					szLightmap: 'L1',
					stateSrcLink: 'ctrl://pinmame/state?group=10&mapping=11',
					addBlend: true,
					alpha: 100,
					color: 0xffffff,
					staticRendering: false,
				})
				.build() as unknown as Record<string, any>
			// Lightmap lamp at half intensity: the fallback ratio is 0.5.
			table.lights = {
				L1: {
					data: { intensity: 10, intensityScale: 1 },
					getState: () => ({ intensity: 5 }),
				},
			}
			const primitive = (table.primitives as unknown as Record<string, Primitive>).SlnkPrim!
			expect(primitive, 'SlnkPrim must exist').toBeDefined()
			const updater = primitive.getUpdater()
			if (lamp !== undefined) updater.setEmuProvider(() => stubEmulator({ 11: lamp }))
			let intensity = -1
			const material = {
				userData: {
					__primitiveKind: PRIMITIVE_ADDITIVE_KIND,
					__uTint: { value: { set: () => {}, getHex: () => 0xffffff } },
					__uIntensity: { value: 0 },
					__uFlat: {
						value: {
							set: () => ({ multiplyScalar: () => {} }),
							multiplyScalar: () => {},
						},
					},
				},
			}
			const node = { children: [{ material }] }
			const renderApi = new TestRenderApi() as unknown as IRenderApi<any, any, any>
			const capture = () => {
				intensity = (material.userData.__uIntensity as { value: number }).value
				return intensity
			}
			return { table, updater, material, node, renderApi, capture }
		}

		it('should apply a resolved SLNK link instead of the lightmap (never both)', () => {
			const { table, updater, node, renderApi, capture } = slnkFixture(0.25)
			updater.applyState(node, {} as any, renderApi, table as any)
			// Upstream: 100 * 0.25 with the lightmap suppressed — not 100 * 0.25 * 0.5.
			expect(capture()).toBeCloseTo(0.25, 1e-5)
		})

		it('should fall back to the lightmap when SLNK does not resolve', () => {
			const { table, updater, node, renderApi, capture } = slnkFixture(undefined)
			updater.applyState(node, {} as any, renderApi, table as any)
			expect(capture()).toBeCloseTo(0.5, 1e-5)
		})

		it('should suppress the lightmap even when the link value equals script alpha scale', () => {
			const { table, updater, node, renderApi, capture } = slnkFixture(1)
			updater.applyState(node, {} as any, renderApi, table as any)
			// Link resolves at full: alpha stays 100, lightmap must not halve it.
			expect(capture()).toBeCloseTo(1, 1e-5)
		})
	})
})
