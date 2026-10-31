// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { Material } from '../material.js'

describe('Table name lookups', () => {
	it('resolves materials case-insensitively, last wins', () => {
		const table = new TableBuilder().addMaterial('Red').addMaterial('RED', { opacity: 0.5 }).build()
		expect(table.getMaterial('red')).toBe(table.getMaterial('RED'))
		expect(table.getMaterial('Red')?.opacity).toEqual(0.5)
		expect(table.getMaterial('missing')).toBeUndefined()
	})

	it('sees materials pushed after the first lookup', () => {
		const table = new TableBuilder().addMaterial('Red').build()
		expect(table.getMaterial('Red')?.name).toEqual('Red')
		const blue = new Material()
		blue.name = 'Blue'
		table.data?.materials.push(blue)
		expect(table.getMaterial('blue')).toBe(blue)
	})

	it('resolves textures case-insensitively by key and by texture name', () => {
		const table = new TableBuilder().build()
		table.textures = {
			Playfield: { getName: () => 'pfTex' },
		} as never
		expect(table.getTexture('playfield')).toBe(table.textures.Playfield)
		expect(table.getTexture('PFTEX')).toBe(table.textures.Playfield)
		expect(table.getTexture('missing')).toBeUndefined()
	})

	it('sees textures added after the first lookup', () => {
		const table = new TableBuilder().build()
		table.textures = {} as never
		expect(table.getTexture('late')).toBeUndefined()
		table.textures = { Late: { getName: () => 'late' } } as never
		expect(table.getTexture('LATE')).toBe(table.textures.Late)
	})
})
