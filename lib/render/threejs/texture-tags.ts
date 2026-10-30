// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Playfield texture taxonomy: which texture names count as playfield bakes.
// Single home shared by the loaders, both decode workers, the map generator,
// and material setup. Worker scheduling lives in texture-dispatch.ts; pixel
// math lives in texture-downscale.ts; both import from here.

// Canonical playfield lightmap family: base playfields, VLM/nestmap bakes, and
// pre-baked overlays all take the playfield size cap and the box-average
// downscale path.
export const RE_PLAYFIELD = /playfield|nestmap|bake|vlm/i

/** Single predicate selecting the playfield size cap and box-average path. */
export function isPlayfieldCap(name: string | undefined): boolean {
	return !!name && RE_PLAYFIELD.test(name)
}

/** Static 4096/2048 cap for the node loader and decode workers (no quality tiers there). */
export function getMaxTextureSize(name: string): number {
	return isPlayfieldCap(name) ? 4096 : 2048
}
