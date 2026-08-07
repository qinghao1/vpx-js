// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export abstract class ItemState {
	public name: string = ''
	public isVisible: boolean = true

	/**
	 * Clones the state.
	 *
	 * Note that returned clone is always recycled (i.e. retrieved from the object
	 * pool), so it should be released after usage.
	 */
	public abstract clone(): ItemState
	public abstract equals(state: ItemState): boolean
	public abstract diff(state: ItemState): ItemState
	public abstract release(): void

	public getName() {
		return this.name
	}
}
