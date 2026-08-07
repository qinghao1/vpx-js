// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Browser-backed key-value storage (localStorage). */
class StorageBrowser {
	public setItem(name: string, value: any): void {
		localStorage.setItem(name, JSON.stringify(value))
	}
	public getItem(name: string): any {
		return JSON.parse(localStorage.getItem(name) || '""')
	}
}

export const storage = new StorageBrowser()
