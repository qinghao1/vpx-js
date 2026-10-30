// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Header-only dimensions for the loader's regular formats (PNG, JPEG, GIF,
 * BMP, WebP); null when unknown. Dependency-free so both the main-thread
 * loader and the image-decode worker can import it.
 */
export function probeEncodedSize(data: Uint8Array): { width: number; height: number } | null {
	try {
		if (data.length < 10) return null
		// GIF dims live at bytes 6-9: probe them below the 16-byte floor the other containers need.
		if (data.length < 16 && (data[0] !== 0x47 || data[1] !== 0x49 || data[2] !== 0x46)) return null
		// PNG: width/height BE32 at 16/20 (8-byte signature + IHDR length + type).
		if (
			data[0] === 0x89 &&
			data[1] === 0x50 &&
			data[2] === 0x4e &&
			data[3] === 0x47 &&
			data[4] === 0x0d &&
			data[5] === 0x0a &&
			data[6] === 0x1a &&
			data[7] === 0x0a
		) {
			if (data.length < 26) return null
			// The first chunk must be IHDR; anything else is not a decodable PNG header.
			if (data[12] !== 0x49 || data[13] !== 0x48 || data[14] !== 0x44 || data[15] !== 0x52) return null
			const width = data[16] * 16777216 + (data[17] << 16) + (data[18] << 8) + data[19]
			const height = data[20] * 16777216 + (data[21] << 16) + (data[22] << 8) + data[23]
			return width > 0 && height > 0 ? { width, height } : null
		}
		// JPEG: scan segment headers for a SOF marker (C0-CF minus DHT/DAC/JPG).
		if (data[0] === 0xff && data[1] === 0xd8) {
			let i = 2
			// SOF dims live in the early headers: cap the scan well above any
			// real header block. Anything later falls back to full decode.
			const end = Math.min(data.length, 64 * 1024)
			while (i + 9 <= end) {
				// Skip fill bytes and resync on stray bytes: neither carries
				// dims, so stepping over stays safe-direction (null at worst).
				if (data[i] !== 0xff) {
					i++
					continue
				}
				if (data[i + 1] === 0xff) {
					i++
					continue
				}
				const marker = data[i + 1]
				if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
					i += 2
					continue
				}
				// SOS starts entropy-coded data: dims live before it, so stop here.
				if (marker === 0xda) return null
				const len = (data[i + 2] << 8) + data[i + 3]
				// A length under 2 cannot advance the scan: step over the bogus
				// header and keep looking instead of bailing with a guess.
				if (len < 2) {
					i += 2
					continue
				}
				if (i + len + 2 > data.length) return null
				if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
					// Only SOF needs the larger bound: its dims sit at fixed
					// offsets, so a short SOF is corrupt, not skippable.
					if (len < 7) return null
					const height = (data[i + 5] << 8) + data[i + 6]
					const width = (data[i + 7] << 8) + data[i + 8]
					return width > 0 && height > 0 ? { width, height } : null
				}
				i += 2 + len
			}
			return null
		}
		// GIF: width/height LE16 at 6/8.
		if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
			if (data.length < 10) return null
			const width = data[6] + (data[7] << 8)
			const height = data[8] + (data[9] << 8)
			return width > 0 && height > 0 ? { width, height } : null
		}
		// BMP: DIB header at 14 (12-byte core uses LE16, info headers LE32).
		if (data[0] === 0x42 && data[1] === 0x4d && data.length >= 26) {
			const dibSize = data[14] + (data[15] << 8) + (data[16] << 16) + data[17] * 16777216
			if (dibSize === 12) {
				const width = data[18] + (data[19] << 8)
				const height = data[20] + (data[21] << 8)
				return width > 0 && height > 0 ? { width, height } : null
			}
			const width = data[18] + (data[19] << 8) + (data[20] << 16) + data[21] * 16777216
			let height = data[22] + (data[23] << 8) + (data[24] << 16) + data[25] * 16777216
			if (height >= 2147483648) height -= 4294967296
			if (height < 0) height = -height
			return width > 0 && height > 0 ? { width, height } : null
		}
		// WebP: RIFF....WEBP chunk at 12 (VP8X canvas, VP8L packed, VP8 frame header).
		if (
			data[0] === 0x52 &&
			data[1] === 0x49 &&
			data[2] === 0x46 &&
			data[3] === 0x46 &&
			data[8] === 0x57 &&
			data[9] === 0x45 &&
			data[10] === 0x42 &&
			data[11] === 0x50
		) {
			const fourcc = String.fromCharCode(data[12], data[13], data[14]) + String.fromCharCode(data[15])
			if (fourcc === 'VP8X' && data.length >= 30) {
				const width = 1 + (data[24] + (data[25] << 8) + (data[26] << 16))
				const height = 1 + (data[27] + (data[28] << 8) + (data[29] << 16))
				return width > 0 && height > 0 ? { width, height } : null
			}
			if (fourcc === 'VP8L' && data.length >= 25 && data[20] === 0x2f) {
				const b0 = data[21]
				const b1 = data[22]
				const b2 = data[23]
				const b3 = data[24]
				const width = 1 + (((b1 & 0x3f) << 8) | b0)
				const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
				return width > 0 && height > 0 ? { width, height } : null
			}
			if (fourcc === 'VP8 ' && data.length >= 30 && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
				const width = ((data[27] << 8) + data[26]) & 0x3fff
				const height = ((data[29] << 8) + data[28]) & 0x3fff
				return width > 0 && height > 0 ? { width, height } : null
			}
		}
	} catch {
		return null
	}
	return null
}

/** Fit dimensions within max (aspect-preserving floor math); null when already fitting or unknowable. */
export function cappedTarget(
	natural: { width: number; height: number } | null,
	max: number,
): { width: number; height: number } | null {
	if (!natural || !(natural.width > 0) || !(natural.height > 0)) return null
	if (typeof max !== 'number' || !(max > 0)) return null
	if (natural.width <= max && natural.height <= max) return null
	const scale = Math.min(max / natural.width, max / natural.height)
	return {
		width: Math.max(1, Math.floor(natural.width * scale)),
		height: Math.max(1, Math.floor(natural.height * scale)),
	}
}

/**
 * Capped decode size from encoded headers alone (no pixel allocation).
 * Null when the image already fits or the size is unknowable — callers then
 * fall back to full decode.
 */
export function cappedDecodeTarget(data: Uint8Array, max: number): { width: number; height: number } | null {
	return cappedTarget(probeEncodedSize(data), max)
}
