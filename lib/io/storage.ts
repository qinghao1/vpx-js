// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

class MemoryStorage {
	private readonly map = new Map<string, unknown>()
	public setItem(name: string, value: unknown): void {
		this.map.set(name, value)
	}
	public getItem(name: string): unknown {
		return this.map.get(name)
	}
}

class BrowserStorage {
	public setItem(name: string, value: unknown): void {
		localStorage.setItem(name, JSON.stringify(value))
	}
	public getItem(name: string): unknown {
		return JSON.parse(localStorage.getItem(name) || '""')
	}
}

export const storage = typeof localStorage !== 'undefined' ? new BrowserStorage() : new MemoryStorage()
