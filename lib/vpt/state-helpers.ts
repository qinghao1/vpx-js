// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Removes key from diff if equal to orig. */
export function omitEqual<T extends object>(diff: T, orig: T, key: keyof T): void {
	if (diff[key] === orig[key]) delete (diff as Record<string, unknown>)[key as string]
}
