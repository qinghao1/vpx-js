#!/usr/bin/env node
// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { closeSync, existsSync, futimesSync, lstatSync, openSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { NodeBinaryReader } from '../lib/io/binary-reader.node.js'
import { Table } from '../lib/vpt/table/table.js'
import { run } from './cli.js'

run(async () => {
	const argSrc = process.argv[2]
	if (!argSrc) {
		console.log(
			'Prints or saves the table script of a Visual Pinball table.\n\nUSAGE: vptscript <source.vpx | folder> [--save]\n',
		)
		return
	}

	const vpxPath = resolve(argSrc)
	if (!existsSync(vpxPath)) {
		throw new Error(`The path "${vpxPath}" does not exist.`)
	}

	const writeToFile = process.argv.includes('--save')
	const isFolder = lstatSync(vpxPath).isDirectory()
	let vpxFiles: string[]
	if (isFolder) {
		vpxFiles = readdirSync(vpxPath)
			.filter(entry => /\.vp[xt]$/i.test(entry))
			.map(entry => resolve(vpxPath, entry))
	} else {
		if (!/\.vp[xt]$/i.test(vpxPath)) {
			throw new Error('File must be a .vpx or .vpt file.')
		}
		vpxFiles = [vpxPath]
	}
	for (const vpxFile of vpxFiles) {
		try {
			const vpt = await Table.load(new NodeBinaryReader(vpxFile), {
				loadTableScript: true,
				tableDataOnly: true,
			})

			if (writeToFile) {
				const destPath = dirname(vpxFile)
				const destName = basename(vpxFile)
				const destFile = resolve(destPath, `${destName.slice(0, -3)}vbs`)

				console.log('[vptscript] Writing to "%s".', destFile)
				writeFileSync(destFile, vpt.tableScript ?? '')

				// update timestamp
				const srcStat = statSync(vpxFile)
				const destFs = openSync(destFile, 'r+')
				futimesSync(destFs, srcStat.atime, srcStat.mtime)
				closeSync(destFs)
			} else {
				// Scriptless tables print empty (getTableScript throws when unset).
				console.log(vpt.tableScript ?? '')
			}
		} catch (error) {
			console.error(error)
			process.exitCode = 1
		}
	}
})
