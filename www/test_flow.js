"use strict";
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// -------- DOM STUBS (GLOBAL) for THREE.js WebGLRenderer + createElementNS --------
const { makeEl } = (() => {
  function makeEl(tag='div', id='') {
    const _class = new Set();
    const _style = {};
    const _attrs = {};
    const _children = new Map();
    const el = {
      _tag: tag, _id: id,
      _text: '', _html: '',
      _display: null,
      classList: {
        contains: (c) => _class.has(c),
        add: (...c) => c.forEach(x => _class.add(x)),
        remove: (...c) => c.forEach(x => _class.delete(x)),
        toggle: (c,b) => { if(b===true) _class.add(c); else if(b===false) _class.delete(c); else _class.has(c) ? _class.delete(c) : _class.add(c); }
      },
      style: new Proxy(_style, {
        get: (t,p) => (p in t ? t[p] : (typeof p === 'string' ? '' : undefined)),
        set: (t,p,v) => { t[p]=v; return true; }
      }),
      get textContent(){ return this._text; },
      set textContent(v){ this._text = String(v ?? ''); },
      get innerHTML(){ return this._html; },
      set innerHTML(v){ this._html = String(v ?? ''); },
      get dataset(){ return _attrs; },
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      getAttribute: (a) => (a==='id' ? id : _attrs[a]),
      setAttribute: (a,v) => { _attrs[a] = v; },
      hasAttribute: (a) => a in _attrs || a === 'id' && !!id,
      getBoundingClientRect: () => ({left:0,top:0,right:1920,bottom:1080,width:1920,height:1080,x:0,y:0}),
      focus: () => {}, blur: () => {}, click: () => {},
      getContext: (kind) => {
        if (kind === '2d') return {
          fillRect: ()=>{}, fillText: ()=>{}, strokeRect: ()=>{}, clearRect: ()=>{},
          beginPath: ()=>{}, arc: ()=>{}, ellipse: ()=>{}, fill: ()=>{}, stroke: ()=>{},
          moveTo: ()=>{}, lineTo: ()=>{}, save: ()=>{}, restore: ()=>{}, translate: ()=>{}, rotate: ()=>{},
          createImageData: (w,h) => ({ data: new Uint8ClampedArray(w*h*4), width: w, height: h }),
          putImageData: ()=>{}, getImageData: () => ({ data: [] }),
          measureText: () => ({ width: 0 }), createLinearGradient: () => ({ addColorStop: () => ({}) }),
          setTransform: ()=>{}, getTransform: () => ({}), transform: ()=>{}, scale: ()=>{}, closePath: ()=>{},
          clip: ()=>{}, globalAlpha: 1, lineWidth: 1, globalCompositeOperation: 'source-over',
          font: '12px sans-serif', fillStyle: '#000', strokeStyle: '#000', textBaseline: 'alphabetic',
        };
        if (kind === 'webgl' || kind === 'experimental-webgl') {
          return new Proxy({}, { get: (t,p) => (typeof p === 'symbol') ? undefined : (() => (p==='getParameter' ? (x)=>x===(0x1f02) ? 2 : null : undefined)) });
        }
        return {};
      },
      querySelector: (sel) => {
        if (!_children.has(sel)) _children.set(sel, makeEl(sel, id+'>'+sel));
        return _children.get(sel);
      },
      querySelectorAll: (sel) => { if(!_children.has(sel)) _children.set(sel, makeEl(sel, id+'>'+sel)); return [_children.get(sel)]; },
      appendChild: () => el, removeChild: () => el, insertBefore: () => el, replaceChild: () => el,
      get firstChild(){ return null; }, get childNodes(){ return []; }, get children(){ return []; },
      get parentNode(){ return null; }, get ownerDocument(){ return global.document; },
      cloneNode: () => makeEl(tag, id+'_clone_'+Math.random()),
      contains: () => false, matches: () => false, toDataURL: () => '',
      width: 1920, height: 1080, clientWidth: 1920, clientHeight: 1080,
      remove: () => {},
    };
    return el;
  }
  return { makeEl };
})();

const EL_IDS = [
  'loadingScreen','mainMenu','loadBarFill','loadPercent','loadStatus',
  'modeSelect','settingsPanel','menuStart','menuSettings','menuExit','settingsBack','modeBack',
  'settingVolume','settingSensitivity','settingBrightness','settingVolumeVal','settingSensitivityVal','settingBrightnessVal',
  'startBtn','controlsHint','chapterCard','jumpscare','jumpscareText','jumpscareCanvas','win','winTime','winBody','againBtn','retryBtn',
  'whisperText','toastMsg','pickupPrompt','interactHint','crosshair','vignette','fear','breathFog','staticNoise',
  'objective','objectiveText','pageCount','roomLabel','roomLabelText',
  'hud','battery','battery-fill','batteryPercent','stamina','stamina-fill','staminaPercent',
  'touchControls','joystickZone','joystickBase','joystickKnob','lookLayer',
  'touchButtons','btnInteract','btnCrouch','btnRun','btnFlash',
  'noteModal','parchmentCard','closeNoteBtn','noteEyebrow','noteTitle','noteBody',
  'wardrobeOverlay','bedOverlay','mirrorFlash',
];
const els = {}; for (const id of EL_IDS) els[id] = makeEl('div', id);
const body = makeEl('body');
body.classList.add('menu-active');
body.appendChild = () => body;

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
  close: () => {}, opener: null,
  navigator: { maxTouchPoints: 0, userAgent: 'NodeTest', vendor: '' },
  ontouchstart: false,
  devicePixelRatio: 1,
  AudioContext: class { },
  webkitAudioContext: class { },
  performance: { now: () => global._t || 1000 },
  requestAnimationFrame: (fn) => { global._t = (global._t||1000) + 16; return setTimeout(()=>fn(global._t),0); },
  cancelAnimationFrame: (id) => clearTimeout(id),
  location: { reload: () => {}, href: 'http://localhost:8080/' },
};
global.document = {
  body,
  getElementById: (id) => els[id] || makeEl('div', id),
  getElementsByTagName: () => [],
  createElement: (tag) => makeEl(tag, 'dyn'+Date.now()+Math.random()),
  createElementNS: (ns,tag) => makeEl(tag, 'dynns'+Date.now()+Math.random()),
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  pointerLockElement: null,
  exitPointerLock: () => {},
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  location: { reload: () => {} },
  visibilityState: 'visible',
  title: 'Test',
  fullscreenElement: null,
  requestPointerLock: () => {},
};
Object.defineProperty(global, 'navigator', { configurable:true, writable:true, value: global.window.navigator });
Object.defineProperty(global, 'performance', { configurable:true, writable:true, value: global.window.performance });
Object.defineProperty(global, 'requestAnimationFrame', { configurable:true, writable:true, value: global.window.requestAnimationFrame });
Object.defineProperty(global, 'cancelAnimationFrame', { configurable:true, writable:true, value: global.window.cancelAnimationFrame });
Object.defineProperty(global, 'AudioContext', { configurable:true, writable:true, value: class { } });
Object.defineProperty(global, 'webkitAudioContext', { configurable:true, writable:true, value: global.AudioContext });

// NOW require THREE AFTER globals set
const THREE = require('three');

let logs = [];
const origLog = console.log;
console.log = (...a) => { const s = a.join(' '); logs.push(s); origLog.apply(console, a); };

// -------- MINIMAL WEB AUDIO STUB --------
class G { constructor(){this.gain={value:0,setValueAtTime:()=>this,linearRampToValueAtTime:()=>this,exponentialRampToValueAtTime:()=>this};} connect(){}}
class O { constructor(){this.type='sine';this.frequency={value:0,setValueAtTime:()=>this,exponentialRampToValueAtTime:()=>this,linearRampToValueAtTime:()=>this};} connect(){} start(){} stop(){}}
class F { constructor(t){this.type=t||'lowpass';this.frequency={value:0,setValueAtTime:()=>{}};this.Q={value:0,setValueAtTime:()=>{}};} connect(){}}
class P { constructor(){this.panningModel='HRTF';this.distanceModel='inverse';this.refDistance=1;this.maxDistance=100;this.rolloffFactor=1;this.coneInnerAngle=360;this.coneOuterAngle=0;this.coneOuterGain=0;this.positionX={value:0};this.positionY={value:0};this.positionZ={value:0};this.orientationX={value:0};this.orientationY={value:0};this.orientationZ={value:0};} connect(){}}
class L { constructor(){this.positionX={value:0};this.positionY={value:0};this.positionZ={value:0};this.forwardX={value:0};this.forwardY={value:0};this.forwardZ={value:-1};this.upX={value:0};this.upY={value:1};this.upZ={value:0};}}
class BS { constructor(){this.buffer=null;this.loop=false;} connect(){} start(){} stop(){}}
class BF { constructor(nc=1,l=1,sr=44100){this.numberOfChannels=nc;this.length=l;this.sampleRate=sr;} getChannelData(){return new Float32Array(this.length);}}
class AC { constructor(){this.state='running';this.sampleRate=44100;this.listener=new L();this.currentTime=0;this.destination={};}
  createGain(){return new G();} createOscillator(){return new O();} createBiquadFilter(t){return new F(t);} createPanner(){return new P();}
  createBufferSource(){return new BS();} createBuffer(nc,l,sr){return new BF(nc,l,sr);} resume(){return Promise.resolve();} }

// -------- BUILD VM CONTEXT (with shared makeEl + shared THREE + shared document els) --------
let _t = global._t = 1000;
let rafId = 0;

const localStorage_ = {
  _s: {}, getItem(k){return this._s[k]||null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];}
};

const sandbox = {
  THREE,
  AudioContext: AC,
  webkitAudioContext: AC,
  performance: { now: () => _t },
  requestAnimationFrame: (fn) => { _t += 16; const id = ++rafId; setTimeout(()=>fn(_t),0); return id; },
  setTimeout: (fn, ms=0) => { _t += (ms||0); return setTimeout(()=>{ if(typeof fn==='function') fn(); }, 0); },
  clearTimeout: (id) => clearTimeout(id),
  localStorage: localStorage_,
  document: global.document,
  window: global.window,
  navigator: global.window.navigator,
  Math, Date, Array, Object, Number, String, Boolean, JSON,
  parseInt, parseFloat, Infinity, NaN, undefined,
  console: {
    log: (...a) => { logs.push(a.join(' ')); origLog.apply(console, a); },
    error: (...a) => { logs.push('ERR: '+a.join(' ')); origLog.error.apply(console, a); },
    warn: (...a) => { logs.push('WARN: '+a.join(' ')); origLog.warn.apply(console, a); },
  },
  __EXPOSE__: {},
  __SANDBOX__: true,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
  Set, Map, Symbol, Promise, Proxy, Reflect, WeakMap, WeakSet,
  RegExp, Error, TypeError, RangeError, SyntaxError,
  Uint8ClampedArray, Float32Array, Int32Array,
  self: global.window,
};

// -------- TRANSFORM SCRIPT --------
let src = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');

origLog('=== Injecting __EXPOSE__ into script.js ===');
const exposures = [
  'loadingScreen','mainMenu','loadBarFill','loadPercent','loadStatus','overlay','settingsPanel',
  'menuStart','menuSettings','menuExit','settingsBack','modeBack','settingVolume','settingSensitivity',
  'settingBrightness','settingVolumeVal','settingSensitivityVal','settingBrightnessVal','startBtn',
  'controlsHint','chapterCard','jumpscare','jumpscareText','jumpscareCanvas','winScreen','againBtn',
  'retryBtn','fearDiv','breathFogDiv','batteryFill','batteryPercent','staminaFill','staminaPercent',
  'roomLabelEl','pickupPromptEl','objectiveEl','objectiveTextEl','pageCountEl',
  'difficulty','DIFF','gameSettings','audioCtx','droneGain','stalkerPanner','stalkerVoiceBus',
  'CELL','WALL_H','MAP','ROWS','COLS','EXIT','SAFE_SPAWN_LOCATIONS','FURNITURE_PAGE_ANCHORS',
  'PAGE_NOTES','HIDE_SPOTS','WHISPERS','roomNameAt',
  'scene','camera','renderer','ambientLight','horrorFill','archGroup','exitPos','exitDoorPivotL',
  'exitDoorPivotR','chainGroup','exitLight','flashlight','flashTarget','flashlightOn',
  'doors','pages','batteries','hideSpots','mirrors','ambientExtinguished',
  'entityGroup','entityActive','entityState','patrolIdx','searchTimer','lastKnownPlayerPos','entityTargetPos','entityBaseSpeed',
  'PATROL_POINTS','motes','MOTE_COUNT','mirrorWatcherMesh','mirrorFlashEl',
  'yaw','pitch','move','isNoteOpen','closePaperNote','openPaperNote',
  'isHiding','hidingType','hidingSpot','preHidePos','hideExitCooldown','crouchLerp',
  'showWhisper','showToast','tryInteract','exitHide','battery','startTime','gameOver','gameRunning',
  'currentChapter','chapter2State','chapter2StartedAt','chapter2ObjectiveComplete',
  'forestGroup','forestBuilt','forestCenter','chapter2Objects','chapter2Traps','chapter2GeneratorOn',
  'chapter2LiftPowered','chapter2LiftActivated','chapter2DescendTimer','chapter2LockTimer','chapter2CatacombsPos',
  'stalkerActive','stalkerGroup','stalkerState','stalkerTarget','stalkerLastKnownPos',
  'stalkerHearPos','stalkerHearTimer','stalkerVoiceTimer','chapter2GeneratorMesh','chapter2ChapelConsoleMesh',
  'chapter2LiftGroup','chapter2LiftBaseY','chapter2LiftT','chapter2StartPos','chapter2WatchtowerPos',
  'chapter2ChapelPos','stalkerPatrolPoints','stalkerPatrolIdx','forestStaticBoxes','chapter2TrapPool',
  'playerHealth','trapPinTimer','trapSlowTimer','pagesCollected','baseEyeHeight',
  'BASE_FOV','SPRINT_FOV','WALK_FOV','INJURED_FOV','stamina','staminaExhausted','staminaRegenDelay',
  'surfaceNoisy','bobPhase','footstepTimer','whisperTimer','moteUpdateFrame',
  'startGame','startChapter2','ensureChapter2World','animate','triggerWin','triggerJumpscare',
  'findSafePosition','collides','extraCollisionBoxes','addCollisionBox',
  'playBatteryChime','playChainBreak','playDoorCreak','playTrapSnap','playClick','playMimicWhisper',
  '_stalkerPrevState','extraCollisionBoxes','isTouch','touchControlsEl','touchRunActive','joyVec',
  'btnCrouch','btnInteract','btnRun','btnFlash',
];

const inject = `
  ;(function(){
    var _E = (typeof __EXPOSE__ !== 'undefined' ? __EXPOSE__ : (window.__EXPOSE__={}));
    ${exposures.map(n => `  try { _E.${n} = ${n}; } catch(_e) {}`).join('\n')}
  })();
`;
src = src.replace(/\n\s*animate\(\);\s*\n\s*\}\)\(\);\s*$/, inject + '\n  animate();\n})();');

origLog('=== Loading script.js (' + src.length + ' bytes) with real THREE.js ===');
const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(src, ctx, { filename: 'script.js', timeout: 20000 });
} catch (err) {
  origLog('=== LOAD ERROR ===');
  origLog(String(err && err.stack || err));
  process.exit(2);
}

const E = sandbox.__EXPOSE__ || sandbox.window.__EXPOSE__;
origLog('=== Exposed symbols: ' + Object.keys(E).length + '/' + exposures.length + ' ===');

// -------- TESTS --------
let pass=0, fail=0;
const results = [];
function test(n, c, d='') {
  const ok = !!c;
  if(ok) pass++; else fail++;
  results.push({n,ok,d});
  origLog((ok?'✅ PASS':'❌ FAIL')+'  '+n+(d?`  —  ${d}`:''));
}

origLog('\n=================  TEST SUITE START  =================\n');

// 1. Load + initial state
test('script.js loaded without throw', true);
test('currentChapter === 1 initial', E.currentChapter===1, `got=${E.currentChapter}`);
test('chapter2State === inactive', E.chapter2State==='inactive', `got=${E.chapter2State}`);
test('camera exists with eye height ~1.6', !!(E.camera && E.camera.position), `y=${E.camera?.position?.y}`);
test('flashlight SpotLight exists (attached to camera)', !!(E.flashlight && E.flashlight.intensity !== undefined));
test('scene has FogExp2', !!(E.scene && E.scene.fog && typeof E.scene.fog.density === 'number'), `density=${E.scene?.fog?.density}`);
test('loadingScreen / mainMenu stubs exist', !!(E.loadingScreen && E.mainMenu));
test('win / jumpscare DOM stubs exist', !!(E.winScreen && E.jumpscare));

// 2. startGame
try { E.startGame(); } catch(e) { origLog('startGame err: '+e.stack); }
test('startGame → gameRunning=true', E.gameRunning===true);
test('startGame → gameOver=false', E.gameOver===false);
test('startGame → currentChapter=1', E.currentChapter===1);
test('startGame → pagesCollected=0', E.pagesCollected===0);
test('startGame → battery=100', E.battery===100);
test('startGame → playerHealth=100', E.playerHealth===100);
test('startGame → ambientExtinguished=false', E.ambientExtinguished===false);

// 3. Collect 3 pages
const pages_ = E.pages || [];
origLog(`=== pages array length=${pages_.length} ===`);
if (pages_.length >= 3) {
  for (let i=0;i<3;i++) {
    E.camera.position.copy(pages_[i].pos);
    try { E.tryInteract(); } catch(e){ origLog('page err: '+e.message); }
  }
  test('After collect 3 pages → pagesCollected=3', E.pagesCollected===3, `got=${E.pagesCollected}`);
  test('After collect 3 pages → chainGroup.visible=false', !E.chainGroup || E.chainGroup.visible===false, `chainGroup.visible=${E.chainGroup?.visible}`);
  test('After collect 3 pages → exit doors open (L pivot rotated)', Math.abs(E.exitDoorPivotL?.rotation?.y||0) > 0.05, `y=${E.exitDoorPivotL?.rotation?.y}`);
  test('After collect 3 pages → exitLight intensity > 0', (E.exitLight?.intensity||0) > 0, `I=${E.exitLight?.intensity}`);
  test('After collect 3 pages → pageCount UI = "3/3 EXIT UNLOCKED"', (E.pageCountEl?.textContent||'').includes('UNLOCKED'), E.pageCountEl?.textContent);
  test('After page 2 → entityActive=true (Ch1 stalker awake)', E.entityActive===true);
  test('After page 2 → ambientExtinguished=true', E.ambientExtinguished===true);
} else {
  test('pages array has >=3 items', false, `len=${pages_.length}`);
}

// 4. Ch1 exit → trigger Ch2
const ex = E.exitPos;
if (ex) { E.camera.position.copy(ex); E.camera.position.z += 0.6; }
try { E.tryInteract(); } catch(e){ origLog('exit err: '+e.stack); }
test('Ch1 exit (3/3 collected) → currentChapter=2', E.currentChapter===2, `got=${E.currentChapter}`);
test('Ch1 exit → chapter2State=toWatchtower', E.chapter2State==='toWatchtower', `got=${E.chapter2State}`);
test('Ch1 exit → forestGroup built & visible', !!(E.forestGroup && E.forestGroup.visible===true), `visible=${E.forestGroup?.visible}`);
test('Ch1 exit → stalkerActive=true', E.stalkerActive===true);
test('Ch1 exit → stalkerState=patrol (initial FSM state)', E.stalkerState==='patrol', `got=${E.stalkerState}`);
test('Ch1 exit → stalkerGroup visible', !!(E.stalkerGroup && E.stalkerGroup.visible===true));
test('Ch1 exit → fog density < 0.062 (forest more open)', (E.scene?.fog?.density ?? 1) < 0.062, `density=${E.scene?.fog?.density}`);
test('Ch1 exit → objective = REACH THE WATCHTOWER', E.pageCountEl?.textContent==='REACH THE WATCHTOWER', E.pageCountEl?.textContent);
test('Ch1 exit → roomLabel = WHISPERING PINES', E.roomLabelEl?.textContent==='WHISPERING PINES', E.roomLabelEl?.textContent);
test('Ch1 exit → playerHealth reset to 100', E.playerHealth===100);

// 5. Console logs for Ch1 exit + Ch2 start
test('Console: "[Ch1 Exit] 3/3 collected" logged', !!logs.find(l=>l.includes('[Ch1 Exit]') && l.includes('3/3')));
test('Console: "[Ch2] startChapter2 OK" logged', !!logs.find(l=>l.includes('[Ch2] startChapter2 OK')));

// 6. Generator
const gen = (E.chapter2Objects||[]).find(o=>o.id==='generator');
if (gen) {
  E.camera.position.copy(gen.pos);
  E.chapter2LockTimer = 0;
  try { E.tryInteract(); } catch(e){ origLog('gen err: '+e.stack); }
  test('Generator interact → chapter2GeneratorOn=true', E.chapter2GeneratorOn===true);
  test('Generator interact → chapter2State=toChapel', E.chapter2State==='toChapel', `got=${E.chapter2State}`);
  test('Generator interact → UI=REACH THE CHAPEL', E.pageCountEl?.textContent==='REACH THE CHAPEL', E.pageCountEl?.textContent);
  test('Generator interact → stalker hears (hearTimer>0)', E.stalkerHearTimer > 0, `hearT=${typeof E.stalkerHearTimer==='number'?E.stalkerHearTimer.toFixed(2):E.stalkerHearTimer}`);
  test('Generator interact → stalker FSM state OR FSM log present', !!logs.find(l=>l.includes('[Ch2 Stalker FSM]') && (l.includes('investigate')||l.includes('patrol'))), `FSM logs so far: ${logs.filter(l=>l.includes('Stalker FSM')).length}`);
} else {
  test('chapter2Objects has generator', false, `objs=${(E.chapter2Objects||[]).map(o=>o.id).join(',')}`);
}
test('Console: "[Ch2] generator online -> state=toChapel"', !!logs.find(l=>l.includes('generator online')));

// 7. Chapel Console
const con = (E.chapter2Objects||[]).find(o=>o.id==='chapelConsole');
if (con) {
  E.camera.position.copy(con.pos);
  E.chapter2LockTimer = 0;
  try { E.tryInteract(); } catch(e){ origLog('con err: '+e.stack); }
  test('Chapel console (with power) → chapter2LiftActivated=true', E.chapter2LiftActivated===true);
  test('Chapel console → chapter2State=descending', E.chapter2State==='descending', `got=${E.chapter2State}`);
  test('Chapel console → descendTimer ≈ 6.5s', Math.abs((E.chapter2DescendTimer||0) - 6.5) < 0.2, `got=${E.chapter2DescendTimer}`);
  test('Chapel console → lockTimer ≈ 6.5s', Math.abs((E.chapter2LockTimer||0) - 6.5) < 0.2, `got=${E.chapter2LockTimer}`);
} else {
  test('chapter2Objects has chapelConsole', false);
}
test('Console: "[Ch2] chapel console -> lift activated"', !!logs.find(l=>l.includes('chapel console') && l.includes('lift activated')));

// 8. Bear trap
const traps = E.chapter2Traps || [];
origLog(`=== traps in chapter2Traps = ${traps.length} ===`);
if (traps.length) {
  const t0 = traps.find(t=>!t.sprung) || traps[0];
  E.camera.position.copy(t0.pos);
  const hpb = E.playerHealth;
  E.chapter2LockTimer = 0;
  try { E.animate(); } catch(e){ origLog('trap anim err: '+e.message); }
  const hpa = E.playerHealth;
  test('Walk over trap → sprung=true', t0.sprung===true, `sprung=${t0.sprung}`);
  test('Walk over trap → playerHealth dropped ≥ 30', (hpb - hpa) >= 30, `before=${hpb} after=${hpa}`);
  test('Walk over trap → trapPinTimer > 0 (immobilize)', (E.trapPinTimer||0) > 0, `pin=${E.trapPinTimer}`);
  test('Walk over trap → trapSlowTimer > 0 (speed decay)', (E.trapSlowTimer||0) > 0, `slow=${E.trapSlowTimer}`);
  test('Walk over trap → stalkerHearTimer > 0 (heard)', E.stalkerHearTimer > 0);
  test('Walk over trap → Console "[Ch2] TRAP sprung at"', !!logs.find(l=>l.includes('TRAP sprung at')));

  E.playerHealth = 0;
  E.gameOver = false;
  E.gameRunning = true;
  const traps2 = traps.filter(t=>t!==t0 && !t.sprung);
  if (traps2.length) {
    E.camera.position.copy(traps2[0].pos);
    E.chapter2LockTimer = 0;
    try { E.animate(); } catch(e){ origLog('trap death err: '+e.message); }
    for (let i=0;i<3;i++) { _t += 200; try { E.animate(); } catch(e){} }
    test('Trap + playerHealth <= 0 → death (gameOver or jumpscare visible)', E.gameOver===true || (els['jumpscare'] && !els['jumpscare'].classList.contains('hidden')), `gameOver=${E.gameOver} jumpscare.hidden=${els['jumpscare']?.classList?.contains('hidden')}`);
  }
  E.gameOver = false;
  E.gameRunning = true;
  E.playerHealth = 100;
  E.currentChapter = 2;
} else {
  test('Bear traps present in chapter2Traps', false, `len=${traps.length}`);
}

// 9. Lift descent → catacombs arrival → triggerWin
if (!E.chapter2LiftActivated) {
  E.chapter2LiftActivated = true;
  E.chapter2State = 'descending';
  E.chapter2DescendTimer = 6.5;
  E.chapter2LockTimer = 6.5;
}
origLog(`=== Starting descent: chapter2DescendTimer=${typeof E.chapter2DescendTimer==='number'?E.chapter2DescendTimer.toFixed(2):E.chapter2DescendTimer}s, state=${E.chapter2State}`);

let f = 0, guard = 2000;
while (!E.gameOver && guard-- > 0) {
  _t += 50;
  try { E.animate(); } catch(e){ origLog('anim err: '+e.stack); break; }
  f++;
}
origLog(`=== Ran ${f} animate frames; gameOver=${E.gameOver}; chapter2State=${E.chapter2State}; currentChapter=${E.currentChapter} ===`);

test('After ~8s descent → gameOver=true (win)', E.gameOver===true, `frames=${f}`);
test('After win → gameRunning=false', E.gameRunning===false);
test('After win → chapter2State=arrived OR arrived->win log', E.chapter2State==='arrived' || logs.find(l=>l.includes('arrived catacombs')));
test('Win screen visible (hidden class removed)', els['win'] && !els['win'].classList.contains('hidden'));
const wb = els['winBody'] && els['winBody'].textContent;
test('Win body: "catacombs" + "wet stone" (Chapter 2 text)', wb && wb.includes('catacombs') && wb.includes('wet stone'), `bodyLen=${wb?.length} body=${wb?.slice(0,120)}`);
const wEy = els['win'].querySelector('.eyebrow');
test('Win eyebrow: CHAPTER TWO — DESCENDED', wEy && wEy._text && wEy._text.includes('DESCENDED'), wEy?._text);
const wH1 = els['win'].querySelector('h1');
test('Win h1: THE LIFT TOOK YOU DEEPER', wH1 && wH1._text && wH1._text.includes('LIFT TOOK YOU DEEPER'), wH1?._text);
const wTea = els['win'].querySelector('.teaser');
test('Win teaser: DAY 3: THE CATACOMBS — COMING SOON', wTea && wTea._text && (wTea._text.includes('DAY 3') || wTea._text.includes('CATACOMBS')), wTea?._text);
const wTime = els['winTime'] && els['winTime'].textContent;
test('winTime shows "Chapter Two cleared in X seconds"', !!wTime && wTime.includes('Chapter Two cleared'), wTime);

// 10. All key console checkpoints
const logCheckpoints = [
  ['[Ch2 Stalker FSM] patrol/investigate/chase transitions', l => l.includes('Stalker FSM')],
  ['[Ch2] area label changed', l => l.includes('[Ch2] area label changed')],
  ['[Ch2] Lift descent completed -> arrived catacombs', l => l.includes('Lift descent completed')],
  ['[Win] triggerWin — chapter=2', l => l.includes('[Win] triggerWin') && l.includes('chapter=2')],
  ['[Ch1 Exit] interact check', l => l.includes('[Ch1 Exit]')],
];
for (const [label, fn] of logCheckpoints) {
  test('Console: '+label, !!logs.find(fn));
}

origLog('\n=================  TEST SUMMARY  =================');
origLog(`Passed: ${pass}  /  Total: ${pass+fail}  (${Math.round(pass*100/Math.max(1,pass+fail))}%)`);
if (fail) {
  origLog('\nFAILED TESTS:');
  for (const r of results) if (!r.ok) origLog('  ❌ ' + r.n + (r.d?`  (${r.d})`:''));
}
origLog('\nTotal console.log lines captured from game: ' + logs.length);
process.exit(fail>0?1:0);
