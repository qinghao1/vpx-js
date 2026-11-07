// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export interface FrameReading {
	/** Presents per second while rendering; 0 when the window presented nothing back-to-back (idle). */
	fps: number
	/** Whether most of the window was spent rendering: only then does `fps` say anything about the GPU. */
	busy: boolean
}

/**
 * FPS for a dirty-gated loop: only back-to-back presents count, so idle gaps
 * never drag the rate down, and gaps over `maxGapMs` are stalls (hidden tab,
 * blocked main thread), not frames. Feed it every loop tick; it returns a
 * reading each time a `windowMs` window closes.
 */
export function createFrameMeter(start: number, { windowMs = 500, maxGapMs = 250 } = {}) {
	let frames = 0
	let busyMs = 0
	let lastTick = start
	let lastPresented = false
	let windowStart = start
	return (timestamp: number, presented: boolean): FrameReading | undefined => {
		const gap = timestamp - lastTick
		if (presented && lastPresented && gap < maxGapMs) {
			frames++
			busyMs += gap
		}
		lastPresented = presented
		lastTick = timestamp
		if (timestamp - windowStart < windowMs) return undefined
		const reading = { fps: busyMs > 0 ? Math.round((frames * 1000) / busyMs) : 0, busy: busyMs >= windowMs / 2 }
		frames = 0
		busyMs = 0
		windowStart = timestamp
		return reading
	}
}
