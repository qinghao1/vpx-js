// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { expect } from 'chai'

// The production bundle leaves three.js bare for the jsDelivr import map in
// ../index.html, so each pin must equal the version the bundler resolves and
// satisfy the demo's committed dependency range (the demo install may be
// absent, e.g. CI jobs that only install the root dependencies).
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const mapSource = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1]
expect(mapSource, 'index.html contains an import map').to.be.a('string')
const imports = (JSON.parse(mapSource!) as { imports: Record<string, string> }).imports

const requireNear = createRequire(import.meta.url)
const versionOf = (name: string): string => {
	const entry = requireNear.resolve(name)
	const pkg = JSON.parse(readFileSync(join(dirname(entry), '..', 'package.json'), 'utf8')) as { version: string }
	return pkg.version
}

const demoRange = (name: string): string => {
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
		dependencies: Record<string, string>
	}
	return pkg.dependencies[name]
}

const parts = (s: string): [number, number, number] => {
	const [a = 0, b = 0, c = 0] = s.split('.').map(Number)
	return [a, b, c]
}

const below = (v: [number, number, number], w: [number, number, number]): boolean =>
	v[0] !== w[0] ? v[0] < w[0] : v[1] !== w[1] ? v[1] < w[1] : v[2] < w[2]

/** Minimal `^` range check (`^1.2.3` → `>=1.2.3 <2.0.0`, `^0.2.3` → `>=0.2.3 <0.3.0`). */
const satisfiesCaret = (version: string, range: string): boolean => {
	if (!range.startsWith('^')) return version === range
	if (!/^\d+\.\d+\.\d+$/.test(range.slice(1)) || !/^\d+\.\d+\.\d+$/.test(version)) return false
	const low = parts(range.slice(1))
	const v = parts(version)
	if (below(v, low)) return false
	const high: [number, number, number] = [...low]
	const fixed = high.findIndex(n => n !== 0)
	high[fixed === -1 ? 2 : fixed]! += 1
	for (let i = fixed === -1 ? 3 : fixed + 1; i < 3; i++) high[i] = 0
	return below(v, high)
}

describe('cdn import-map pins match three.js versions', () => {
	for (const [key, file] of [
		['three', 'build/three.module.js'],
		['three/webgpu', 'build/three.webgpu.js'],
		['three/tsl', 'build/three.tsl.js'],
		['three-mesh-bvh', 'build/index.module.js'],
	] as const) {
		it(`${key} pins the resolved version`, () => {
			const pkg = key.split('/')[0]
			const pinned = imports[key]?.match(
				new RegExp(`^https://cdn\\.jsdelivr\\.net/npm/${pkg}@([\\d.]+)/${file}$`),
			)?.[1]
			expect(pinned, `${key} import-map entry`).to.equal(versionOf(pkg))
		})

		it(`${key} pin satisfies the demo dependency range`, () => {
			const pkg = key.split('/')[0]
			const pinned = imports[key]?.match(/@([\d.]+)\//)?.[1]
			expect(pinned, `${key} import-map entry`).to.be.a('string')
			expect(satisfiesCaret(pinned!, demoRange(pkg)), `${pkg}@${pinned} vs ${demoRange(pkg)}`).to.be.true
		})
	}

	it('every jsDelivr three URL in the page satisfies the demo range', () => {
		const seen: string[] = []
		for (const match of html.matchAll(/cdn\.jsdelivr\.net\/npm\/(three(?:-mesh-bvh)?)@([\d.]+)\//g)) {
			seen.push(match[0])
			expect(satisfiesCaret(match[2], demoRange(match[1])), match[0]).to.be.true
		}
		expect(seen.length, 'jsDelivr three URLs').to.be.greaterThan(0)
	})
})
