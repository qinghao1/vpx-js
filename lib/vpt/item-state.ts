// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Render state for an item (pooled). */
export abstract class ItemState {
	public name = ''
	public isVisible = true
	public abstract clone(): ItemState
	public abstract equals(state: ItemState): boolean
	public abstract diff(state: ItemState): ItemState
	public abstract release(): void
	public getName(): string {
		return this.name
	}
}
