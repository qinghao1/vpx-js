// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export interface HudStats {
	mode: 'viewer' | 'play' | 'paused'
	backend: string
	draws: number
	triangles: number
	balls: number
	engineReady: boolean
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

/** Write only on change: the HUD refreshes at 2 Hz and steady values must cost no style work. */
function set(node: HTMLElement, text: string): void {
	if (node.textContent !== text) node.textContent = text
}

/** Binds the debug panel's `[data-stat]` cells once; the returned updater writes the live values. */
export function createStatsView(root: HTMLElement): (stats: HudStats) => void {
	const cells: Record<string, HTMLElement> = {}
	for (const node of root.querySelectorAll<HTMLElement>('[data-stat]')) cells[node.dataset.stat!] = node
	return ({ mode, backend, draws, triangles, balls, engineReady }) => {
		set(cells.mode, mode)
		cells.mode.dataset.state = mode
		set(cells.backend, backend)
		set(cells.draws, String(draws))
		set(cells.triangles, compact.format(triangles))
		set(cells.balls, String(balls))
		set(cells.engine, engineReady ? 'Ready' : 'Loading…')
		cells.engine.classList.toggle('is-muted', !engineReady)
	}
}
