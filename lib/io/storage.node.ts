// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** In-memory storage for Node. */
class StorageNode {
	private readonly map = new Map<string, unknown>()
	public setItem(name: string, value: unknown): void {
		this.map.set(name, value)
	}
	public getItem(name: string): unknown {
		return this.map.get(name)
	}
}

export const storage = new StorageNode()
