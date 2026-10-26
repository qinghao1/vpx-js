// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { BiffParser } from '../io/biff-parser.js'

/** Maps for Biff tag dispatch. */
export interface BiffMaps {
	float?: Record<string, string>
	int?: Record<string, string>
	bool?: Record<string, string>
	string?: Record<string, string>
	wideString?: Record<string, string>
}

/**
 * Handles common Biff tag maps — assigns parser value to object field.
 * Single-target form: handleBiffTag(this, tag, buffer, len, maps)
 * @returns true if tag was handled
 */
export function handleBiffTag<T extends BiffParser>(
	target: T,
	tag: string,
	buffer: Uint8Array,
	len: number,
	maps: BiffMaps,
): boolean {
	const t = target as BiffParser & Record<string, unknown>
	if (maps.float && Object.hasOwn(maps.float, tag)) {
		t[maps.float[tag]] = target.getFloat(buffer)
		return true
	}
	if (maps.int && Object.hasOwn(maps.int, tag)) {
		t[maps.int[tag]] = target.getInt(buffer)
		return true
	}
	if (maps.bool && Object.hasOwn(maps.bool, tag)) {
		t[maps.bool[tag]] = target.getBool(buffer)
		return true
	}
	if (maps.string && Object.hasOwn(maps.string, tag)) {
		t[maps.string[tag]] = target.getString(buffer, len)
		return true
	}
	if (maps.wideString && Object.hasOwn(maps.wideString, tag)) {
		t[maps.wideString[tag]] = target.getWideString(buffer, len)
		return true
	}
	return false
}
