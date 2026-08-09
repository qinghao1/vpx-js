import { NodeBinaryReader } from '../lib/io/binary-reader.node.js'
import { Table } from '../lib/vpt/table/table.js'

const t = await Table.load(new NodeBinaryReader('../example-table.vpx'))
for (const [k, v] of Object.entries(t.flashers)) {
	const d = v.data
	if (d.isDMD) {
		console.log(
			'Flasher',
			k,
			'isDMD',
			d.isDMD,
			'center',
			JSON.stringify(d.center),
			'height',
			d.height,
			'pts',
			d.dragPoints?.map(p => `(${p.vertex.x},${p.vertex.y})`).join(' '),
		)
		const xs = d.dragPoints.map(p => p.vertex.x),
			ys = d.dragPoints.map(p => p.vertex.y)
		console.log('  w', Math.max(...xs) - Math.min(...xs), 'h', Math.max(...ys) - Math.min(...ys))
	}
}
for (const [k, v] of Object.entries(t.textboxes)) {
	if (v.data.isDMD) console.log('Textbox DMD', k)
}
console.log('table dims', t.getDimensions())
