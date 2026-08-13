import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js';
import { Table } from '../../lib/vpt/table/table.js';
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js';
import { TableMeshGenerator } from '../../lib/vpt/table/table-mesh-generator.js';
import { Player } from '../../lib/game/player.js';

const file = process.argv[2] || 'walking_dead.vpx';
console.log(`=== everything dark harness: ${file} ===`);
const table = await Table.load(new NodeBinaryReader(file));
console.log(`Lights total: ${Object.keys(table.lights).length}`);
const bulbTrue = Object.values(table.lights).filter(l => l.data.bulbLight).length;
console.log(`bulbLight true: ${bulbTrue}`);

const api = new ThreeRenderApi({ applyMaterials: true });
const gen = new TableMeshGenerator(table);
const scene = gen.generateTableNode(api, { exportLightBulbLights: true });

let pointLights = [];
scene.traverse(o => { if (o.isPointLight) pointLights.push(o); });
console.log(`Point lights in scene: ${pointLights.length}`);
const avg = pointLights.reduce((a,b)=>a+b.intensity,0)/ (pointLights.length||1);
console.log(`Avg point light intensity: ${avg.toFixed(2)} sample ${pointLights.slice(0,3).map(p=>p.intensity).join(', ')}`);
if (file.includes('walking_dead') && pointLights.length === 165) console.log('PASS: 165 point lights');
else if (!file.includes('walking_dead')) console.log(`point lights ${pointLights.length}`);

let meshes=[];
scene.traverse(o=>{ if(o.isMesh) meshes.push(o); });
let baked=0, nonBaked=0;
for(const m of meshes){
  if(m.material.userData?.__isBaked) baked++;
  else nonBaked++;
}
console.log(`Meshes ${meshes.length} baked ${baked} nonBaked ${nonBaked}`);

// Check GI lights initial state for walking_dead
if (table.lights['106']) {
  for(const n of ['106','107']){
    const l=table.lights[n];
    if(l) console.log(`${n} data state ${l.data.state} intensity ${l.data.intensity} LightState ${l.getState().intensity} isOn ${l.data.isOn()}`);
  }
  if(table.lights['106']?.getState().intensity>0) console.log('PASS: GI 106 initial bright');
  else console.log('FAIL: GI 106 initial dark (LightState 0)');
}

// Light Player test with small fixture to avoid heavy walking_dead script
try {
  const smallTable = await Table.load(new NodeBinaryReader('test/fixtures/table-light.vpx'));
  const smallPlayer = new Player(smallTable).init();
  const l = smallTable.lights['Surface'];
  console.log(`Small table Surface initial ${l.getState().intensity} isOn ${l.data.isOn()}`);
  if(l.getState().intensity>0) console.log('PASS: small table initial bright');
  else console.log('FAIL: small table initial dark');
  l.getApi().State = 1;
  smallPlayer.updateAnimations(20);
  console.log(`After State On t20 intensity ${l.getState().intensity}`);
  if(l.getState().intensity>0) console.log('PASS: small table after On bright');
} catch (e) {
  console.log('Player test skipped', e.message);
}

// Playfield base check
let pf=null;
scene.traverse(o=>{ if(o.name==='playfield_mesh') pf=o});
if(pf){
  const m=pf.children[0].material;
  console.log(`playfield_mesh mat ${m.name} col ${m.color.getHexString()} em ${m.emissive.getHexString()} int ${m.emissiveIntensity} baked ${m.userData.__isBaked}`);
  if(m.color.getHex()!==0x000000 || m.emissiveIntensity>0) console.log('PASS: playfield not completely dark');
  else console.log('FAIL: playfield dark');
}

console.log('=== done ===');
