// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Render state for an item (pooled). */
export abstract class ItemState {
	public name = ''
	public isVisible = true

	private static readonly _keysCache = new WeakMap<Function, string[]>()

	private _keys(): string[] {
		const ctor = this.constructor as Function
		let keys = ItemState._keysCache.get(ctor)
		if (!keys) {
			keys = Object.keys(this)
			ItemState._keysCache.set(ctor, keys)
		}
		return keys
	}

	public clone(): ItemState {
		const copy = new (this.constructor as new () => any)()
		return Object.assign(copy, this)
	}

	public copyFrom(state: ItemState): void {
		for (const k of this._keys()) {
			;(this as any)[k] = (state as any)[k]
		}
	}

	public equals(state: ItemState): boolean {
		if (!state) return false
		for (const k of this._keys()) {
			if ((this as any)[k] !== (state as any)[k]) return false
		}
		return true
	}

	public diff(state: ItemState): ItemState {
		const result = this.clone()
		for (const k of this._keys()) {
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
