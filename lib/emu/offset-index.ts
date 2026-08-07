// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Maps between 0-based index and WPC 8×8 matrix index (e.g. 0→11, 8→21). */
export class OffsetIndex {
	public readonly zeroBasedIndex: number
	public readonly wpcMatrixIndex: number

	public static fromZeroBased(zeroBasedIndex: number): OffsetIndex {
		return new OffsetIndex(zeroBasedIndex, OffsetIndex.mapIndexToMatrixIndex(zeroBasedIndex))
	}

	public static fromWpcMatrix(wpcMatrixIndex: number): OffsetIndex {
		return new OffsetIndex(OffsetIndex.mapMatrixIndexToIndex(wpcMatrixIndex), wpcMatrixIndex)
	}

	/** 0-based → WPC matrix (0→11, 8→21). */
	public static mapIndexToMatrixIndex(index: number): number {
		return 10 * Math.floor(index / 8) + 11 + (index % 8)
	}

	/** WPC matrix → 0-based (11→0, 21→8). */
	public static mapMatrixIndexToIndex(index: number): number {
		return 8 * Math.floor((index - 11) / 10) + ((index - 11) % 10)
	}

	constructor(zeroBasedIndex: number, wpcMatrixIndex: number) {
		this.zeroBasedIndex = zeroBasedIndex
		this.wpcMatrixIndex = wpcMatrixIndex
		if (zeroBasedIndex < 0 || wpcMatrixIndex < 0) throw new Error('NEGATIVE_INDEX_DETECTED')
	}
}
