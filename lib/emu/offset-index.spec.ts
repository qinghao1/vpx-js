// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { OffsetIndex } from './offset-index.js'

chai.use((sinonChai as any).default ?? sinonChai)
describe('The Offset Index calculator', () => {
	it('should convert 0 -> 11', () => {
		const result: OffsetIndex = OffsetIndex.fromZeroBased(0)
		expect(result.wpcMatrixIndex).to.equal(11)
		expect(result.zeroBasedIndex).to.equal(0)
	})

	it('should convert 7 -> 18', () => {
		const result: number = OffsetIndex.fromZeroBased(7).wpcMatrixIndex
		expect(result).to.equal(18)
	})

	it('should convert 8 -> 21', () => {
		const result: number = OffsetIndex.fromZeroBased(8).wpcMatrixIndex
		expect(result).to.equal(21)
	})

	it('should convert 63 -> 88', () => {
		const result: number = OffsetIndex.fromZeroBased(63).wpcMatrixIndex
		expect(result).to.equal(88)
	})

	it('should convert 11 -> 0', () => {
		const result: OffsetIndex = OffsetIndex.fromWpcMatrix(11)
		expect(result.wpcMatrixIndex).to.equal(11)
		expect(result.zeroBasedIndex).to.equal(0)
	})

	it('should convert 21 -> 8', () => {
		const result: OffsetIndex = OffsetIndex.fromWpcMatrix(21)
		expect(result.wpcMatrixIndex).to.equal(21)
		expect(result.zeroBasedIndex).to.equal(8)
	})

	it('should detect invalid index', () => {
		expect(() => OffsetIndex.fromWpcMatrix(0)).to.throw(/NEGATIVE_INDEX_DETECTED/)
	})
})
