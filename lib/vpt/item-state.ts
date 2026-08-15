// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Render state for an item (pooled). */
export abstract class ItemState {
	public name = ''
	public isVisible = true

	public clone(): ItemState {
		const copy = new (this.constructor as new () => any)()
		return Object.assign(copy, this)
	}

	public equals(state: ItemState): boolean {
		const keys = Object.keys(this) as (keyof this)[]
		for (const k of keys) {
			if (this[k] !== (state as any)[k]) return false
		}
		return true
	}

	public diff(state: ItemState): ItemState {
		const result = this.clone()
		const keys = Object.keys(this) as (keyof this)[]
		for (const k of keys) {
			if ((result as any)[k] === (state as any)[k] && k !== 'name') {
				delete (result as any)[k]
			}
		}
		return result
	}

	public release(): void {}

	public getName(): string {
		return this.name
	}
}
