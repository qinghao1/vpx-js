import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js';
import { Table } from '../../lib/vpt/table/table.js';
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js';
import { TableMeshGenerator } from '../../lib/vpt/table/table-mesh-generator.js';

const file = process.argv[2] || 'walking_dead.vpx';
console.log(`=== HORDE lights harness: ${file} ===`);
const table = await Table.load(new NodeBinaryReader(file));
console.log(`Lights total: ${Object.keys(table.lights).length}`);
const bulbTrue = Object.values(table.lights).filter(l => l.data.bulbLight).length;
const isBulb = Object.values(table.lights).filter(l => l.isBulbLight()).length;
console.log(`data.bulbLight ${bulbTrue}, isBulbLight ${isBulb} (isBulb should be 0 for TWD, bulbTrue 165)`);
const api = new ThreeRenderApi({ applyMaterials: true });
const gen = new TableMeshGenerator(table);
const scene = gen.generateTableNode(api, { exportLightBulbLights: true });
let pointLights = 0;
scene.traverse(o => { if (o.isPointLight) pointLights++; });
console.log(`Point lights in scene: ${pointLights} (expected 165)`);
if (pointLights === 165) console.log('PASS: point lights correct');
else console.log(`FAIL: point lights ${pointLights} != 165`);
console.log(pointLights === bulbTrue ? 'PASS: point lights equal bulbTrue' : 'FAIL');

// Check HORDE primitives
const primOn = table.primitives['015_Primitive012'];
const primOff = table.primitives['015_Primitive011'];
if (primOn && primOff) {
	console.log(`015 ON mat ${primOn.data.szMaterial} DLT ${primOn.data.disableLightingTop} DLB ${primOn.data.disableLightingBelow}`);
	console.log(`015 OFF mat ${primOff.data.szMaterial} DLT ${primOff.data.disableLightingTop} DLB ${primOff.data.disableLightingBelow}`);
	let nodeOn=null, nodeOff=null;
	scene.traverse(o=>{ if(o.name==='015_Primitive012') nodeOn=o; if(o.name==='015_Primitive011') nodeOff=o; });
	if (nodeOn && nodeOff) {
		const mOn = nodeOn.children[0].material;
		const mOff = nodeOff.children[0].material;
		console.log(`015 ON initial mat ${mOn.name} col ${mOn.color.getHexString()} em ${mOn.emissive.getHexString()} int ${mOn.emissiveIntensity}`);
		console.log(`015 OFF initial mat ${mOff.name} col ${mOff.color.getHexString()} em ${mOff.emissive.getHexString()} int ${mOff.emissiveIntensity}`);
		// Simulate lamp ON
		primOn.getUpdater().applyState(nodeOn, { disableLightingTop: 1001 }, api, table);
		primOff.getUpdater().applyState(nodeOff, { disableLightingTop: 131, disableLightingBelow: 1, material: 'insertrectangle1on', map: 'insertrectangle1on' }, api, table);
		const mOn2 = nodeOn.children[0].material;
		const mOff2 = nodeOff.children[0].material;
		console.log(`015 ON after lamp ON col ${mOn2.color.getHexString()} em ${mOn2.emissive.getHexString()} int ${mOn2.emissiveIntensity}`);
		console.log(`015 OFF after lamp ON col ${mOff2.color.getHexString()} em ${mOff2.emissive.getHexString()} int ${mOff2.emissiveIntensity}`);
		if (mOn2.emissiveIntensity===1 && mOn2.color.getHexString()==='000000') console.log('PASS: HORDE ON bright');
		else console.log('FAIL: HORDE ON not bright');
		if (mOff2.emissiveIntensity===1) console.log('PASS: HORDE OFF bright after ON');
		else console.log('FAIL: HORDE OFF not bright');
	}
}
console.log('=== done ===');
