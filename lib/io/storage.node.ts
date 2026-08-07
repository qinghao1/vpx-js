// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

class StorageNode {
	private readonly storage: Map<string, any> = new Map<string, any>()

	public setItem(name: string, value: any): void {
		this.storage.set(name, value)
	}

	public getItem(name: string): any {
		return this.storage.get(name)
	}
}

export const storage = new StorageNode()
