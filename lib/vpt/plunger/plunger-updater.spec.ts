// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import { spy } from 'sinon'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vector.js'
import { Enums } from '../enums.js'
import type { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import { Plunger } from './plunger.js'
import { PlungerData } from './plunger-data.js'
import type { PlungerState } from './plunger-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

async function loadPlunger(type: number): Promise<Plunger> {
	const record = new Uint8Array(8)
	new DataView(record.buffer).setInt32(0, 4, true)
	record.set([0x45, 0x4e, 0x44, 0x42], 4) // ENDB
	const storage = {
		async streamFiltered(
			_name: string,
			_offset: number,
			next: (result: ReadResult) => Promise<number | null>,
		): Promise<void> {
			let pos = 0
			while (pos < record.length) {
				const consumed = await next({ data: record.subarray(pos), storageOffset: pos })
				if (consumed === null) break
				pos += consumed
			}
		},
	}
	const data = await PlungerData.fromStorage(storage as unknown as Storage, 'Plunger')
	data.name = 'plunger'
	data.center = new Vertex2D(500, 500)
	data.type = type
	return new Plunger('Plunger', data)
}

class GroupApi extends TestRenderApi {
	public readonly applied: Array<{ mesh: string; node: string }> = []

	constructor(private readonly nodes: Record<string, { name: string }>) {
		super()
	}

	public override findInGroup(_parent: any, _name: string): any {
		return this.nodes[_name]
	}

	public override applyMeshToNode(mesh: Mesh, node: any): void {
		this.applied.push({ mesh: mesh.name, node: node.name })
	}
}

describe('The VPinball plunger updater', () => {
	let table: Table

	beforeEach(() => {
		table = new TableBuilder().build()
	})

	it('should apply the flat mesh to the flat node', async () => {
		const plunger = await loadPlunger(Enums.PlungerType.PlungerTypeFlat)
		const renderApi = new GroupApi({ flat: { name: 'flat' } })

		plunger.getUpdater().applyState({}, plunger.getState(), renderApi as any, table)

		expect(renderApi.applied).to.deep.equal([{ mesh: 'flat', node: 'flat' }])
	})

	it('should apply rod and spring meshes to their nodes', async () => {
		const plunger = await loadPlunger(Enums.PlungerType.PlungerTypeModern)
		const renderApi = new GroupApi({ rod: { name: 'rod' }, spring: { name: 'spring' } })

		plunger.getUpdater().applyState({}, plunger.getState(), renderApi as any, table)

		expect(renderApi.applied).to.deep.equal([
			{ mesh: 'rod', node: 'rod' },
			{ mesh: 'spring', node: 'spring' },
		])
	})

	it('should apply visibility', async () => {
		const plunger = await loadPlunger(Enums.PlungerType.PlungerTypeModern)
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyVisibility')

		plunger.getUpdater().applyState({}, { isVisible: false } as PlungerState, renderApi as any, table)

		expect(renderApi.applyVisibility).to.have.been.calledOnceWith(false, {})
	})

	it('should merge partial states without losing the frame', async () => {
		const plunger = await loadPlunger(Enums.PlungerType.PlungerTypeModern)
		const renderApi = new TestRenderApi()

		plunger.getUpdater().applyState({}, { frame: 7 } as PlungerState, renderApi as any, table)

		expect(plunger.getState().frame).to.equal(7)
		expect(plunger.getState().isVisible).to.equal(true)
	})
})
