// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect, it } from 'vitest'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { RubberData } from './rubber.js'

/** Craft BIFF float records (len + tag + float32) terminated by ENDB. */
function records(tags: Array<[string, number]>): Uint8Array {
	const out = new Uint8Array(tags.length * 12 + 8)
	const view = new DataView(out.buffer)
	let pos = 0
	for (const [tag, value] of tags) {
		view.setInt32(pos, 8, true)
		for (let i = 0; i < 4; i++) out[pos + 4 + i] = tag.charCodeAt(i)
		view.setFloat32(pos + 8, value, true)
		pos += 12
	}
	view.setInt32(pos, 4, true)
	out.set([0x45, 0x4e, 0x44, 0x42], pos + 4) // ENDB
	return out
}

async function load(tags: Array<[string, number]>): Promise<RubberData> {
	const record = records(tags)
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
	return RubberData.fromStorage(storage as unknown as Storage, 'Rubber')
}

it('folds a -1 hit height into the parsed height like upstream Rubber::Load', async () => {
	const data = await load([
		['HTTP', 40],
		['HTHI', -1],
	])
	expect(data.height).toBe(40)
	expect(data.hitHeight).toBe(40)
})

it('folds a missing hit height into the parsed height like upstream', async () => {
	const data = await load([['HTTP', 40]])
	expect(data.hitHeight).toBe(40)
})

it('keeps an explicit hit height', async () => {
	const data = await load([
		['HTTP', 40],
		['HTHI', 32],
	])
	expect(data.hitHeight).toBe(32)
})
