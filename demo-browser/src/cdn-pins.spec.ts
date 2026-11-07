// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { readFileSync } from 'node:fs'
import { expect } from 'chai'

// The production bundle leaves three.js bare for the jsDelivr import map in
// ../index.html, so its pins must equal the installed versions exactly.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const mapSource = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1]
expect(mapSource, 'index.html contains an import map').to.be.a('string')
const imports = (JSON.parse(mapSource!) as { imports: Record<string, string> }).imports

const versionOf = (name: string): string =>
	(
		JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8')) as {
			version: string
		}
	).version

describe('cdn import-map pins match installed three.js versions', () => {
	for (const [key, file] of [
		['three', 'build/three.module.js'],
		['three/webgpu', 'build/three.webgpu.js'],
		['three/tsl', 'build/three.tsl.js'],
		['three-mesh-bvh', 'build/index.module.js'],
	] as const) {
		it(`${key} pins the installed version`, () => {
			const pkg = key.split('/')[0]
			const pinned = imports[key]?.match(
				new RegExp(`^https://cdn\\.jsdelivr\\.net/npm/${pkg}@([\\d.]+)/${file}$`),
			)?.[1]
			expect(pinned, `${key} import-map entry`).to.equal(versionOf(pkg))
		})
	}

	it('every jsDelivr three pin in the page matches the installed version', () => {
		for (const match of html.matchAll(/cdn\.jsdelivr\.net\/npm\/(three(?:-mesh-bvh)?)@([\d.]+)\//g)) {
			expect(match[2], `${match[1]} pin`).to.equal(versionOf(match[1]))
		}
	})
})
