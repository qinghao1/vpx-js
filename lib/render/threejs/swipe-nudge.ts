export const swipeNudge = (
	dx: number,
	dy: number,
	NUDGE: { left: number; right: number; forward: number; back: number },
): number | null => {
	const adx = Math.abs(dx)
	const ady = Math.abs(dy)
	if (adx > ady * 1.2) return dx < 0 ? NUDGE.left : NUDGE.right
	if (ady > adx * 1.2) return dy < 0 ? NUDGE.forward : NUDGE.back
	return null
}
