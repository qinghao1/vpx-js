// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export interface Sources {
	vpx?: string
	rom?: string
}

/** `href` with `?vpx` / `?rom` set to the open table and ROM (and the `?table` alias dropped); other options stay. */
export function withSourceParams(href: string, { vpx, rom }: Sources): URL {
	const url = new URL(href)
	url.searchParams.delete('table')
	for (const [key, value] of Object.entries({ vpx, rom })) {
		if (value) url.searchParams.set(key, value)
		else url.searchParams.delete(key)
	}
	return url
}
