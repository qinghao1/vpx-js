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
 * @returns true if tag was handled
 */
export function handleBiffTag(
	obj: Record<string, unknown>,
	parser: BiffParser,
	tag: string,
	buffer: Uint8Array,
	len: number,
	maps: BiffMaps,
): boolean {
	if (maps.float && tag in maps.float) {
		obj[maps.float[tag]] = (parser as unknown as { getFloat: (b: Uint8Array) => number }).getFloat(buffer)
		return true
	}
	if (maps.int && tag in maps.int) {
		obj[maps.int[tag]] = (parser as unknown as { getInt: (b: Uint8Array) => number }).getInt(buffer)
		return true
	}
	if (maps.bool && tag in maps.bool) {
		obj[maps.bool[tag]] = (parser as unknown as { getBool: (b: Uint8Array) => boolean }).getBool(buffer)
		return true
	}
	if (maps.string && tag in maps.string) {
		obj[maps.string[tag]] = (parser as unknown as { getString: (b: Uint8Array, l: number) => string }).getString(
			buffer,
			len,
		)
		return true
	}
	if (maps.wideString && tag in maps.wideString) {
		obj[maps.wideString[tag]] = (
			parser as unknown as { getWideString: (b: Uint8Array, l: number) => string }
		).getWideString(buffer, len)
		return true
	}
	return false
}
