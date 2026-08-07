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
 * Idiomatic single-target form: handleBiffTag(this, tag, buffer, len, maps)
 * Legacy dual-target form (obj, parser, tag, buffer, len, maps) still supported
 * during migration but will be removed.
 * @returns true if tag was handled
 */
export function handleBiffTag<T extends BiffParser>(target: T, tag: string, buffer: Uint8Array, len: number, maps: BiffMaps): boolean
export function handleBiffTag(
	obj: Record<string, unknown>,
	parser: BiffParser,
	tag: string,
	buffer: Uint8Array,
	len: number,
	maps: BiffMaps,
): boolean
export function handleBiffTag(
	targetOrObj: unknown,
	parserOrTag: unknown,
	tagOrBuffer: unknown,
	bufferOrLen: unknown,
	lenOrMaps: unknown,
	maybeMaps?: unknown,
): boolean {
	// Detect legacy 6-arg form: (obj, parser, tag, buffer, len, maps)
	if (maybeMaps !== undefined) {
		const obj = targetOrObj as Record<string, unknown>
		const parser = parserOrTag as BiffParser
		const tag = tagOrBuffer as string
		const buffer = bufferOrLen as Uint8Array
		const len = lenOrMaps as number
		const maps = maybeMaps as BiffMaps
		if (maps.float && tag in maps.float) {
			obj[maps.float[tag]] = parser.getFloat(buffer)
			return true
		}
		if (maps.int && tag in maps.int) {
			obj[maps.int[tag]] = parser.getInt(buffer)
			return true
		}
		if (maps.bool && tag in maps.bool) {
			obj[maps.bool[tag]] = parser.getBool(buffer)
			return true
		}
		if (maps.string && tag in maps.string) {
			obj[maps.string[tag]] = parser.getString(buffer, len)
			return true
		}
		if (maps.wideString && tag in maps.wideString) {
			obj[maps.wideString[tag]] = parser.getWideString(buffer, len)
			return true
		}
		return false
	}
	// Modern 5-arg form: (target, tag, buffer, len, maps)
	const target = targetOrObj as BiffParser & Record<string, unknown>
	const tag = parserOrTag as string
	const buffer = tagOrBuffer as Uint8Array
	const len = bufferOrLen as number
	const maps = lenOrMaps as BiffMaps
	if (maps.float && tag in maps.float) {
		target[maps.float[tag]] = target.getFloat(buffer)
		return true
	}
	if (maps.int && tag in maps.int) {
		target[maps.int[tag]] = target.getInt(buffer)
		return true
	}
	if (maps.bool && tag in maps.bool) {
		target[maps.bool[tag]] = target.getBool(buffer)
		return true
	}
	if (maps.string && tag in maps.string) {
		target[maps.string[tag]] = target.getString(buffer, len)
		return true
	}
	if (maps.wideString && tag in maps.wideString) {
		target[maps.wideString[tag]] = target.getWideString(buffer, len)
		return true
	}
	return false
}
