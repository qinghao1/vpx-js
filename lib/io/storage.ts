// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Minimal key-value store. */
export interface KeyValueStorage {
	setItem(name: string, value: unknown): void
	getItem(name: string): unknown
}

/** Missing keys read as "" (like VBS Empty coerced to string) on both backends. */
const map = new Map<string, unknown>()
const memoryStorage: KeyValueStorage = {
	setItem(name, value) {
		map.set(name, value)
	},
	getItem: name => map.get(name) ?? '',
}

const browserStorage: KeyValueStorage = {
	setItem: (name, value) => localStorage.setItem(name, JSON.stringify(value)),
	getItem: name => JSON.parse(localStorage.getItem(name) ?? JSON.stringify('')),
}

export const storage: KeyValueStorage = typeof localStorage !== 'undefined' ? browserStorage : memoryStorage
