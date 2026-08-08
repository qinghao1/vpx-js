import fs from 'node:fs';
import path from 'node:path';
const candidates = [
  '/home/qinghao1/projects/qinghao1.com/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js',
  '/home/qinghao1/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js',
];
let puppeteerPath=null;
for(const c of candidates) if(fs.existsSync(c)) {puppeteerPath=c; break;}
if(!puppeteerPath) throw new Error('puppeteer-core not found');
const puppeteer = (await import(puppeteerPath)).default;
const url = process.argv.find(a=>a.startsWith('--url='))?.split('=')[1] || 'http://localhost:3000/walking-dead.html';
const out = process.argv.find(a=>a.startsWith('--out='))?.split('=')[1] || '/tmp';
console.log(`[harness-dmd] url=${url} out=${out}`);
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--window-size=1280,900','--disable-gpu-sandbox']
});
const page = await browser.newPage();
await page.setViewport({width:1280,height:900});
page.on('console', m=>{
  const t=m.text();
  if(/PinMAME|GameName|DMD|Ready|Parsed|Framed|created|emu|Player/.test(t)) console.log(`[browser:${m.type()}] ${t.slice(0,2500)}`);
});
page.on('pageerror', e=> console.log('[pageerror]', e.message.slice(0,3000)));
console.log('[harness-dmd] goto');
await page.goto(url,{waitUntil:'domcontentloaded', timeout:30000});
console.log('[harness-dmd] waiting for viewer Ready (up to 30s)');
let viewerReady=false;
for(let i=0;i<30;i++){
  await new Promise(r=>setTimeout(r,1000));
  const s=await page.evaluate(()=>({
    title: document.getElementById('load-title')?.innerText||'',
    log: document.getElementById('log')?.innerText||'',
    stats: document.getElementById('stats')?.innerText||'',
    dmdMeshes: window.viewer?.dmdMeshes?.length||0
  }));
  if(s.title==='Ready' || s.stats.includes('Ready')){
    console.log(`[harness-dmd] viewer Ready at ${i}s dmdMeshes=${s.dmdMeshes} stats=${s.stats.slice(0,120).replace(/\n/g,' | ')}`);
    viewerReady=true;
    break;
  }
  if(i%5===0) console.log(`[harness-dmd] ${i}s title=${s.title} dmd=${s.dmdMeshes} stats=${s.stats.slice(0,80).replace(/\n/g,' | ')}`);
}
if(!viewerReady) console.log('[harness-dmd] viewer not ready, continuing anyway');
console.log('[harness-dmd] switching to play mode');
await page.evaluate(()=>{
  const sel=document.getElementById('mode');
  if(sel){ sel.value='play'; sel.dispatchEvent(new Event('change',{bubbles:true})); }
  if(window.viewer) window.viewer.viewerMode='play';
});
await new Promise(r=>setTimeout(r,2000));
console.log('[harness-dmd] waiting for play emu (up to 20s)');
let playReady=false;
for(let i=0;i<20;i++){
  await new Promise(r=>setTimeout(r,1000));
  const s=await page.evaluate(()=>({
    stats: document.getElementById('stats')?.innerText||'',
    log: document.getElementById('log')?.innerText||'',
    dmdMeshes: window.viewer?.dmdMeshes?.length||0,
    emu: (window.viewer?.player||window.player)?.getPhysics?.()?.emu?.constructor.name||'none',
    emuInit: (window.viewer?.player||window.player)?.getPhysics?.()?.emu?.isInitialized?.()
  }));
  if(s.stats.includes('PLAY') && s.emu!=='none'){
    console.log(`[harness-dmd] play Ready at ${i}s emu=${s.emu} init=${s.emuInit} dmd=${s.dmdMeshes} stats=${s.stats.slice(0,120).replace(/\n/g,' | ')}`);
    playReady=true;
    break;
  }
  if(i%5===0) console.log(`[harness-dmd] ${i}s play waiting emu=${s.emu} dmd=${s.dmdMeshes} stats=${s.stats.slice(0,80).replace(/\n/g,' | ')}`);
}
console.log('[harness-dmd] injecting DMD test pattern');
const inject = await page.evaluate(()=>{
  try{
    const viewer = window.viewer;
    const emu = (window.viewer?.player||window.player)?.getPhysics?.()?.emu;
    if(!viewer) return 'no viewer';
    if(!emu) return 'no emu';
    const W=128,H=32;
    const frame=new Uint8Array(W*H);
    // Create visible amber pattern: border + diagonal + central block
    for(let y=0;y<H;y++){
      for(let x=0;x<W;x++){
        let v=0;
        if(x<1||x>=W-1||y<1||y>=H-1) v=15; // border
        else if(Math.abs(x - y*4) <1) v=10; // diagonal
        else if(x>20 && x<108 && y>8 && y<24){
          // checker + text area
          if((Math.floor(x/8)+Math.floor(y/8))%2===0) v=15;
          else v=6;
          // make "DMD" letters via simple block font (approx)
          // Draw a simple "VPX" pattern in center
          // For visibility, create 3 vertical bars for "III" effect
          if(y>12 && y<20){
            if((x>30&&x<38)||(x>50&&x<58)||(x>70&&x<78)||(x>90&&x<98)) v=15;
          }
        } else if((x%16===0)||(y%8===0)) v=2;
        frame[y*W+x]=v;
      }
    }
    // Also try emulatorState.setDmd if available
    try{
      if(emu.emulatorState?.setDmd) emu.emulatorState.setDmd(frame);
      else if(emu.emulatorState) emu.emulatorState.applyPinmame?.(new Uint8Array(64), new Uint8Array(8), new Uint8Array(4));
      // fallback: directly set viewer's dmdFallback override? we can monkey patch getDmdFrame
      const orig = emu.getDmdFrame?.bind(emu);
      // monkey patch to return our frame
      emu.getDmdFrame = ()=>frame;
      emu.getDmdDimensions = ()=>({x:W,y:H, isVector2:true});
    }catch(e){ console.log('setDmd monkey err', e.message)}
    // Also force dimensions
    try{
      viewer.dmdW=W; viewer.dmdH=H; viewer._dmdLastHash=-1;
    }catch{}
    // Force render
    try{
      viewer._ensureDmdTexture();
      viewer._renderDmd();
      viewer._pollPinmame();
      if(viewer._renderDmd) viewer._renderDmd();
    }catch(e){ console.log('render err', e.message)}
    // Ensure texture update
    if(viewer.dmdTexture) viewer.dmdTexture.needsUpdate=true;
    // Check frame via player
    const got = (window.viewer?.player||window.player)?.getDmdFrame?.();
    return `injected ${frame.length} got=${got?.length} max=${Math.max(...frame)} emu=${emu.constructor.name} dmdMeshes=${viewer.dmdMeshes?.length} texture=${!!viewer.dmdTexture} canvas=${!!viewer.dmdCanvas}`;
  }catch(e){
    return 'inject err '+e.stack?.slice(0,2000);
  }
});
console.log('[harness-dmd] inject result', inject);
await new Promise(r=>setTimeout(r,800));
const afterRender = await page.evaluate(()=>{
  const v=window.viewer;
  const emu=(window.viewer?.player||window.player)?.getPhysics?.()?.emu;
  return {
    dmdDisplay: getComputedStyle(document.getElementById('dmd-wrap')).display,
    dmdCanvasDisplay: document.getElementById('dmd')? getComputedStyle(document.getElementById('dmd')).display:'no-canvas',
    dmdStatus: document.getElementById('dmd-status')?.innerText||'',
    stats: document.getElementById('stats')?.innerText||'',
    dmdMeshes: v?.dmdMeshes?.map(m=>({name:m.name, pos:`${m.position.x.toFixed(1)},${m.position.y.toFixed(1)},${m.position.z.toFixed(1)}`, rot:`${(m.rotation.x*180/Math.PI).toFixed(1)},${(m.rotation.y*180/Math.PI).toFixed(1)},${(m.rotation.z*180/Math.PI).toFixed(1)}`, visible:m.visible, hasMap:!!m.material?.map, hasEmissive:!!m.material?.emissiveMap})),
    worldPos: (()=>{ try{ const m=v?.dmdMeshes?.[0]; if(!m) return null; const p=new THREE.Vector3(); m.getWorldPosition(p); return `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`; }catch(e){return 'err '+e.message}})(),
    cam: (()=>{ try{ const c=window.camera; return `${c.position.x.toFixed(1)},${c.position.y.toFixed(1)},${c.position.z.toFixed(1)}`; }catch{return ''}})()
  };
});
console.log('[harness-dmd] afterRender', JSON.stringify(afterRender,null,2));
// Now position camera to look at DMD on table
console.log('[harness-dmd] positioning camera to DMD');
const camInfo = await page.evaluate(()=>{
  try{
    const viewer=window.viewer;
    const mesh=viewer?.dmdMeshes?.[0];
    if(!mesh) return 'no mesh';
    const THREE = window.THREE;
    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);
    // Also need to consider mesh rotation: DMD plane is vertical facing south (+Z world). Camera should be south of DMD looking north, slightly up.
    // Compute offset based on world axes: we assume Y up, Z north-south, X east-west
    // Try offsets Empirically: try multiple offsets and pick one that shows DMD
    // Current play cam is at 0,47,135 target 0,-3,6 -> looking from south towards north, slightly down
    // DMD at height 635 local -> world Y approx? Let's get worldPos Y
    // For walking_dead DMD worldPos previously at ~? we will log
    // Choose camera offset 35 units south (+Z) and 20 up (+Y)
    const cam=window.camera;
    const controls=window.controls;
    // Save original
    const origPos=cam.position.clone();
    const origTarget=controls.target.clone();
    // Offset south (+Z) and up (+Y)
    const offset = new THREE.Vector3(0, 18, 45);
    // For DMD at north end, south is positive Z, so add to worldPos
    cam.position.copy(worldPos).add(offset);
    // Slight X centered
    controls.target.copy(worldPos);
    cam.updateMatrixWorld();
    controls.update();
    if(window.renderer && window.scene) window.renderer.render(window.scene, cam);
    return `worldPos ${worldPos.x.toFixed(2)},${worldPos.y.toFixed(2)},${worldPos.z.toFixed(2)} cam ${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)},${cam.position.z.toFixed(1)} target ${controls.target.x.toFixed(1)},${controls.target.y.toFixed(1)},${controls.target.z.toFixed(1)} origPos ${origPos.x.toFixed(1)},${origPos.y.toFixed(1)},${origPos.z.toFixed(1)}`;
  }catch(e){ return 'cam err '+e.stack?.slice(0,2000)}
});
console.log('[harness-dmd] camInfo', camInfo);
await new Promise(r=>setTimeout(r,600));
let shotPath = path.join(out, 'dmd_on_table.png');
await page.screenshot({path:shotPath});
console.log(`[harness-dmd] screenshot 1 -> ${shotPath} ${fs.statSync(shotPath).size} bytes`);
await new Promise(r=>setTimeout(r,400));
// Also take a second shot from slightly different angle: overview
const camInfo2 = await page.evaluate(()=>{
  try{
    const viewer=window.viewer;
    const mesh=viewer?.dmdMeshes?.[0];
    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);
    const cam=window.camera;
    const controls=window.controls;
    // overview: higher up, further south
    cam.position.copy(worldPos).add(new THREE.Vector3(0, 35, 80));
    controls.target.copy(worldPos).add(new THREE.Vector3(0, -5, -10));
    cam.updateMatrixWorld(); controls.update();
    if(window.renderer && window.scene) window.renderer.render(window.scene, cam);
    return `overview cam ${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)},${cam.position.z.toFixed(1)}`;
  }catch(e){return 'err '+e.message}
});
console.log('[harness-dmd] camInfo2', camInfo2);
await new Promise(r=>setTimeout(r,600));
let shotPath2 = path.join(out, 'dmd_overview.png');
await page.screenshot({path:shotPath2});
console.log(`[harness-dmd] screenshot 2 -> ${shotPath2} ${fs.statSync(shotPath2).size} bytes`);
// Also take play camera shot for comparison
await page.evaluate(()=>{
  try{
    const viewer=window.viewer;
    // restore play camera
    try{ viewer.setupPlayCamera(); }catch{}
    if(window.renderer && window.scene && window.camera) window.renderer.render(window.scene, window.camera);
  }catch{}
});
await new Promise(r=>setTimeout(r,600));
let shotPath3 = path.join(out, 'dmd_play_cam.png');
await page.screenshot({path:shotPath3});
console.log(`[harness-dmd] screenshot 3 (play cam) -> ${shotPath3} ${fs.statSync(shotPath3).size} bytes`);
await browser.close();
console.log('[harness-dmd] done');
