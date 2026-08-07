// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * handy function to calculate between the 0 based index offset and the wpc 8x8 matrix based index.
 */
export class OffsetIndex {
	public readonly zeroBasedIndex: number
	public readonly wpcMatrixIndex: number

	public static fromZeroBased(zeroBasedIndex: number): OffsetIndex {
		const wpcMatrixIndex = OffsetIndex.mapIndexToMatrixIndex(zeroBasedIndex)
		return new OffsetIndex(zeroBasedIndex, wpcMatrixIndex)
	}

	public static fromWpcMatrix(wpcMatrixIndex: number): OffsetIndex {
		const zeroBasedIndex = OffsetIndex.mapMatrixIndexToIndex(wpcMatrixIndex)
		return new OffsetIndex(zeroBasedIndex, wpcMatrixIndex)
	}

	/**
	 * convert zero based index to matrix input, 0 -> 11, 8 -> 21
	 */
	public static mapIndexToMatrixIndex(index: number): number {
		const row = Math.floor(index / 8)
		const column = Math.floor(index % 8)
		return 10 * row + 11 + column
	}

	/**
	 * convert matrix index to zero based input, 11 -> 0, 21 -> 8
	 */
	public static mapMatrixIndexToIndex(index: number): number {
		const row = Math.floor((index - 11) / 10)
		const column = Math.floor((index - 11) % 10)
		return 8 * row + column
	}

	constructor(zeroBasedIndex: number, wpcMatrixIndex: number) {
		this.zeroBasedIndex = zeroBasedIndex
		this.wpcMatrixIndex = wpcMatrixIndex
		if (this.zeroBasedIndex < 0 || this.wpcMatrixIndex < 0) {
			throw new Error('NEGATIVE_INDEX_DETECTED')
		}
	}
}
