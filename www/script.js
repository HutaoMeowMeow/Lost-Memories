(function(){
  "use strict";

  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  // ---------- DIFFICULTY CONFIG ----------
  let difficulty = 'normal';
  const DIFF = {
    calm:      { entitySpeedMult: 0.75, batteryDrain: 0.55, hearingMult: 0.7,  spawnDelay: 4000 },
    normal:    { entitySpeedMult: 1.0,  batteryDrain: 1.0,  hearingMult: 1.0,  spawnDelay: 1500 },
    nightmare: { entitySpeedMult: 1.28, batteryDrain: 2.8,  hearingMult: 1.4,  spawnDelay: 500 }
  };

  // ---------- SETTINGS ----------
  const SETTINGS_KEY = 'hollowground_settings';
  let gameSettings = { volume: 70, sensitivity: 5, brightness: 100 };
  let audioCtx = null;
  let droneGain = null;
  let stalkerPanner = null;
  let stalkerVoiceBus = null;

  function loadSettings(){
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if (saved) gameSettings = { ...gameSettings, ...saved };
    } catch (_) {}
  }

  function saveSettings(){
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(gameSettings));
    applySettings();
  }

  function applySettings(){
    if (typeof renderer !== 'undefined' && renderer){
      renderer.toneMappingExposure = 0.62 * (gameSettings.brightness / 100);
    }
    if (droneGain) droneGain.gain.value = 0.055 * (gameSettings.volume / 100);
    if (stalkerVoiceBus) stalkerVoiceBus.gain.value = 0.22 * (gameSettings.volume / 100);
  }

  loadSettings();

  // Start loading UI immediately — world build runs synchronously afterward.
  const loadingScreen = document.getElementById('loadingScreen');
  const mainMenu = document.getElementById('mainMenu');
  const loadBarFill = document.getElementById('loadBarFill');
  const loadPercent = document.getElementById('loadPercent');
  const loadStatus = document.getElementById('loadStatus');

  const LOADING_MESSAGES = [
    'Something is waking up...',
    'Listening to the walls...',
    'Counting footsteps in the dark...',
    'The doors are already locked...',
    'It knows you are coming...',
    'Preparing your invitation...'
  ];

  function runLoadingScreen(){
    let progress = 0;
    let msgIdx = 0;
    if (loadStatus) loadStatus.textContent = LOADING_MESSAGES[0];

    const tick = () => {
      progress += 1.5 + Math.random() * 4;
      if (progress > 100) progress = 100;
      if (loadBarFill) loadBarFill.style.width = progress + '%';
      if (loadPercent) loadPercent.textContent = Math.floor(progress) + '%';

      const nextMsg = Math.floor(progress / 18);
      if (loadStatus && nextMsg > msgIdx && nextMsg < LOADING_MESSAGES.length){
        msgIdx = nextMsg;
        loadStatus.textContent = LOADING_MESSAGES[msgIdx];
      }

      if (progress < 100){
        requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          if (loadingScreen) loadingScreen.classList.add('fade-out');
          setTimeout(() => {
            if (loadingScreen) loadingScreen.classList.add('hidden');
            if (mainMenu) mainMenu.classList.remove('hidden');
          }, 900);
        }, 500);
      }
    };

    requestAnimationFrame(tick);
  }

  runLoadingScreen();

  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      difficulty = btn.dataset.diff;
    });
  });

  // ---------- MAP & WORLD CONFIG ----------
  const CELL = 6;
  const WALL_H = 5.4;

  const MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,1,1,0,1,1,1,1,1,1,0,1,1,1,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,1,1,0,1,1,1,1,1,1,0,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ];
  const ROWS = MAP.length, COLS = MAP[0].length;
  const EXIT = { r:1, c:13 };

  function cellCenter(r,c){
    return new THREE.Vector3((c - COLS/2)*CELL, 0, (r - ROWS/2)*CELL);
  }

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const SAFE_SPAWN_LOCATIONS = [
    { r: 13, c: 1, yaw: 0 },
    { r: 13, c: 6, yaw: Math.PI / 2 },
    { r: 7, c: 4, yaw: Math.PI / 4 },
    { r: 8, c: 8, yaw: -Math.PI / 2 },
    { r: 4, c: 3, yaw: -Math.PI / 4 },
    { r: 4, c: 11, yaw: Math.PI },
    { r: 11, c: 3, yaw: 0 }
  ];

  // Pages sit on furniture surfaces — never floating in mid-air
  const FURNITURE_PAGE_ANCHORS = [
    { cell: { r: 1, c: 5 }, surfaceY: 0.91, offX: 0.12, offZ: 0.08, tiltX: 0.08, label: "Nightstand" },
    { cell: { r: 2, c: 1 }, surfaceY: 0.87, offX: 0.0, offZ: 0.15, tiltX: 0.12, label: "Vanity" },
    { cell: { r: 3, c: 8 }, surfaceY: 0.94, offX: -0.1, offZ: 0.0, tiltX: 0.06, label: "Bathroom Sink" },
    { cell: { r: 8, c: 3 }, surfaceY: 0.53, offX: -0.25, offZ: 0.1, tiltX: 0.1, label: "Coffee Table" },
    { cell: { r: 9, c: 5 }, surfaceY: 1.02, offX: 0.3, offZ: 0.0, tiltX: 0.05, label: "Bookshelf" },
    { cell: { r: 6, c: 11 }, surfaceY: 1.11, offX: 0.6, offZ: -0.15, tiltX: 0.04, label: "Kitchen Counter" },
    { cell: { r: 9, c: 11 }, surfaceY: 0.91, offX: -0.3, offZ: 0.2, tiltX: 0.07, label: "Dining Table" },
    { cell: { r: 12, c: 1 }, surfaceY: 0.96, offX: 0.1, offZ: 0.2, tiltX: 0.09, label: "Study Desk" },
    { cell: { r: 13, c: 9 }, surfaceY: 0.97, offX: 0.2, offZ: -0.1, tiltX: 0.06, label: "Console Table" },
    { cell: { r: 1, c: 2 }, surfaceY: 0.88, offX: 0.5, offZ: 0.6, tiltX: 0.18, label: "Master Bed" },
    { cell: { r: 6, c: 4 }, surfaceY: 0.57, offX: 0.45, offZ: 0.15, tiltX: 0.1, label: "TV Stand" }
  ];

  const MIN_PAGE_SPAWN_CELLS = 4;
  let currentSpawnCell = { r: 7, c: 7 };

  function pageSpawnDistanceCells(a, b){
    return Math.hypot(a.r - b.r, a.c - b.c);
  }

  // DISTINCT LORE TITLES & CREEPY HANDWRITTEN NOTES FOR THE 3 PAGES
  const PAGE_NOTES = [
    {
      eyebrow: "JOURNAL PAGE 1 OF 3",
      title: "JOURNAL ENTRY I — THE INVITATION",
      body: "\"Day one. The heavy oak doors chained themselves shut behind me at midnight. I followed an invitation nobody sent, up the porch steps of a house forgotten by time. The air in here is freezing cold and thick with decay. Something inside is breathing in the dark... waiting for me to step into the shadows.\""
    },
    {
      eyebrow: "JOURNAL PAGE 2 OF 3",
      title: "JOURNAL ENTRY II — THE AWAKENING",
      body: "\"IT HAS AWAKENED! There's a second set of footprints in the dust. They match mine, but they're following me backwards. I heard a bone-chilling screech echo through the halls—The Watcher is hunting me right now! I must keep moving and find the last page before it catches me!\""
    },
    {
      eyebrow: "JOURNAL PAGE 3 OF 3",
      title: "JOURNAL ENTRY III — THE ESCAPE",
      body: "\"THE CHAINS HAVE BROKEN! As I picked up this final page, I heard the heavy iron lock shatter at the front entrance. The Gothic exit doors are unlocked and cracked open! RUN FOR THE MAIN EXIT NOW BEFORE THE SHADOW CONSUMES YOU FOR GOOD!\""
    }
  ];

  const HIDE_SPOTS = [ {r:4,c:5}, {r:9,c:5}, {r:9,c:11} ];
  const WHISPERS = [
    "closer...", "behind you...", "look at me...", "i remember your face...", "don't turn around...", "it's right behind you...", "run..."
  ];

  function roomNameAt(r,c){
    if (r <= 4)  return c <= 6 ? "BEDROOM" : "BATHROOM";
    if (r >= 6 && r <= 9) return c <= 6 ? "LIVING ROOM" : "KITCHEN & DINING";
    if (r >= 11) return "ENTRY HALL & STUDY";
    return "HALLWAY";
  }

  // ---------- SCENE & RENDERER SETUP ----------
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020101, 0.062);
  scene.background = new THREE.Color(0x020101);

  const initialSpawn = SAFE_SPAWN_LOCATIONS[Math.floor(Math.random() * SAFE_SPAWN_LOCATIONS.length)];

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 200);
  camera.position.copy(cellCenter(initialSpawn.r, initialSpawn.c));
  camera.position.y = 1.6;

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);
  applySettings();

  const ambientLight = new THREE.AmbientLight(0x1a1210, 0.42);
  scene.add(ambientLight);

  const horrorFill = new THREE.HemisphereLight(0x1a0808, 0x050403, 0.18);
  scene.add(horrorFill);

  // ---------- PROCEDURAL PBR TEXTURES & MATERIALS ----------
  function addGrime(ctx, w, h){
    ctx.fillStyle = 'rgba(15, 10, 6, 0.28)';
    for (let i=0; i<16; i++){
      ctx.beginPath();
      ctx.ellipse(Math.random()*w, Math.random()*h, 12+Math.random()*28, 8+Math.random()*20, Math.random()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = 1.5;
    for (let i=0; i<8; i++){
      let x = Math.random()*w, y = Math.random()*h;
      ctx.beginPath(); ctx.moveTo(x,y);
      const segs = 4+Math.floor(Math.random()*7);
      for (let s=0; s<segs; s++){
        x += (Math.random()-0.5)*35;
        y += (Math.random()-0.5)*35;
        ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
  }

  function generateNormalFromCanvas(canvas){
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0,0,w,h);
    const data = imgData.data;

    const normCanvas = document.createElement('canvas');
    normCanvas.width = w; normCanvas.height = h;
    const normCtx = normCanvas.getContext('2d');
    const normData = normCtx.createImageData(w,h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const left  = (x > 0) ? data[i - 4] : data[i];
        const right = (x < w - 1) ? data[i + 4] : data[i];
        const up    = (y > 0) ? data[i - w * 4] : data[i];
        const down  = (y < h - 1) ? data[i + w * 4] : data[i];

        const dx = (right - left) / 255.0;
        const dy = (down - up) / 255.0;
        const dz = 1.0 / 2.0;

        const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const nx = (dx / len) * 0.5 + 0.5;
        const ny = (dy / len) * 0.5 + 0.5;
        const nz = (dz / len) * 0.5 + 0.5;

        normData.data[i]     = Math.floor(nx * 255);
        normData.data[i + 1] = Math.floor(ny * 255);
        normData.data[i + 2] = Math.floor(nz * 255);
        normData.data[i + 3] = 255;
      }
    }
    normCtx.putImageData(normData, 0, 0);
    return new THREE.CanvasTexture(normCanvas);
  }

  function makeWallpaperTexture(base, stripe, wainscot){
    const w=512, h=512;
    const cnv = document.createElement('canvas'); cnv.width=w; cnv.height=h;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0,0,w,h);

    ctx.fillStyle = stripe;
    for (let x=0; x<w; x+=64) ctx.fillRect(x, 0, 24, h);

    ctx.strokeStyle = stripe; ctx.lineWidth = 3;
    for (let y=32; y<h; y+=96){
      for (let x=12; x<w; x+=64){
        ctx.beginPath(); ctx.arc(x+12, y, 16, 0, Math.PI*2); ctx.stroke();
      }
    }

    for (let i=0; i<8000; i++){
      const val = Math.floor(Math.random()*40);
      ctx.fillStyle = `rgba(${val},${val},${val},0.08)`;
      ctx.fillRect(Math.random()*w, Math.random()*h, 2, 2);
    }
    addGrime(ctx, w, h);

    ctx.fillStyle = wainscot;
    ctx.fillRect(0, h-160, w, 160);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, h-160, w, 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    for (let x=0; x<w; x+=80){
      ctx.strokeRect(x+8, h-148, 64, 136);
    }

    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const bumpMap = generateNormalFromCanvas(cnv);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    return { map: tex, bumpMap };
  }

  function makeTileTexture(base, line, wainscot){
    const w=512, h=512;
    const cnv = document.createElement('canvas'); cnv.width=w; cnv.height=h;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = line; ctx.lineWidth = 4;
    for (let x=0; x<=w; x+=64){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let y=0; y<=h; y+=64){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

    addGrime(ctx, w, h);

    ctx.fillStyle = wainscot;
    ctx.fillRect(0, h-140, w, 140);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, h-140, w, 6);

    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const bumpMap = generateNormalFromCanvas(cnv);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    return { map: tex, bumpMap };
  }

  function makePlankTexture(base, line){
    const w=512, h=512, plankH=64;
    const cnv = document.createElement('canvas'); cnv.width=w; cnv.height=h;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0,0,w,h);

    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for(let y=0; y<h; y+=2){
      if(Math.random()<0.65) ctx.fillRect(0,y,w,1);
    }

    ctx.strokeStyle = line; ctx.lineWidth = 5;
    for (let y=0; y<h; y+=plankH){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    for (let y=0; y<h; y+=plankH*2) { ctx.beginPath(); ctx.moveTo(w*0.5,y); ctx.lineTo(w*0.5,y+plankH); ctx.stroke(); }
    for (let y=plankH; y<h; y+=plankH*2) { ctx.beginPath(); ctx.moveTo(w*0.25,y); ctx.lineTo(w*0.25,y+plankH); ctx.stroke(); }

    addGrime(ctx, w, h);

    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const bumpMap = generateNormalFromCanvas(cnv);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    return { map: tex, bumpMap };
  }

  function makeStoneTexture(){
    const w=256, h=256;
    const cnv = document.createElement('canvas'); cnv.width=w; cnv.height=h;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#22201e'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#0e0d0c'; ctx.lineWidth = 4;
    for(let y=0; y<=h; y+=32){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    }
    for(let y=0; y<h; y+=32){
      const offset = (y % 64 === 0) ? 0 : 32;
      for(let x=offset; x<=w; x+=64){
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+32); ctx.stroke();
      }
    }
    addGrime(ctx, w, h);
    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const bumpMap = generateNormalFromCanvas(cnv);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    return { map: tex, bumpMap };
  }

  const bedroomTex  = makeWallpaperTexture('#261720','#1c1017','#100a0d');
  const bathroomTex = makeTileTexture('#242e30','rgba(0,0,0,0.45)','#0e1314');
  const livingTex   = makeWallpaperTexture('#1a2215','#13190e','#090e06');
  const kitchenTex  = makeWallpaperTexture('#241f14','#1c170e','#0e0b06');
  const entryTex    = makeWallpaperTexture('#201a14','#17120e','#0b0805');
  const stoneTex    = makeStoneTexture();

  const bedroomWallMat  = new THREE.MeshStandardMaterial({ map: bedroomTex.map, bumpMap: bedroomTex.bumpMap, bumpScale: 0.05, color:0x8e767e, roughness:0.88, metalness: 0.1 });
  const bathroomWallMat = new THREE.MeshStandardMaterial({ map: bathroomTex.map, bumpMap: bathroomTex.bumpMap, bumpScale: 0.06, color:0x7e9396, roughness:0.45, metalness: 0.2 });
  const livingWallMat   = new THREE.MeshStandardMaterial({ map: livingTex.map, bumpMap: livingTex.bumpMap, bumpScale: 0.05, color:0x79886c, roughness:0.88, metalness: 0.1 });
  const kitchenWallMat  = new THREE.MeshStandardMaterial({ map: kitchenTex.map, bumpMap: kitchenTex.bumpMap, bumpScale: 0.05, color:0x8b7e5f, roughness:0.88, metalness: 0.1 });
  const entryWallMat    = new THREE.MeshStandardMaterial({ map: entryTex.map, bumpMap: entryTex.bumpMap, bumpScale: 0.05, color:0x7f7463, roughness:0.88, metalness: 0.1 });
  const stoneMat        = new THREE.MeshStandardMaterial({ map: stoneTex.map, bumpMap: stoneTex.bumpMap, bumpScale: 0.08, color:0x55504c, roughness:0.9 });

  const floorTex = makePlankTexture('#181007', '#0a0602');
  floorTex.map.repeat.set(COLS*1.2, ROWS*1.2);
  floorTex.bumpMap.repeat.set(COLS*1.2, ROWS*1.2);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex.map, bumpMap: floorTex.bumpMap, bumpScale: 0.06, color:0x8c7c69, roughness:0.82, metalness:0.1 });
  const ceilMat  = new THREE.MeshStandardMaterial({ color:0x080605, roughness:0.95 });

  // Wood & Furniture Materials
  const woodMatDark  = new THREE.MeshStandardMaterial({ color:0x1c130b, roughness:0.8 });
  const woodMatMid   = new THREE.MeshStandardMaterial({ color:0x2c1f14, roughness:0.85 });
  const woodMatMahogany = new THREE.MeshStandardMaterial({ color:0x3c180e, roughness:0.75 });
  const fabricMat    = new THREE.MeshStandardMaterial({ color:0x3a3236, roughness:0.95 });
  const fabricCushion= new THREE.MeshStandardMaterial({ color:0x2c2628, roughness:0.9 });
  const brassMat     = new THREE.MeshStandardMaterial({ color:0x8a703a, metalness:0.85, roughness:0.25 });
  const ironMat      = new THREE.MeshStandardMaterial({ color:0x1a1a1a, metalness:0.9, roughness:0.4 });
  const porcelainMat = new THREE.MeshStandardMaterial({ color:0xd0d0d0, roughness:0.3, metalness:0.1 });
  const chromeMat    = new THREE.MeshStandardMaterial({ color:0xa0a0a0, metalness:0.92, roughness:0.15 });

  const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);

  function wallMatForCell(r,c){
    if (r <= 5) return c <= 7 ? bedroomWallMat : bathroomWallMat;
    if (r <= 10) return c <= 7 ? livingWallMat : kitchenWallMat;
    return entryWallMat;
  }

  const wallBoxes = [];
  for (let r=0; r<ROWS; r++){
    for (let c=0; c<COLS; c++){
      const pos = cellCenter(r,c);
      if (MAP[r][c] === 1){
        const wall = new THREE.Mesh(wallGeo, wallMatForCell(r,c));
        wall.position.set(pos.x, WALL_H/2, pos.z);
        wall.receiveShadow = true;
        wall.castShadow = true;
        scene.add(wall);
        wallBoxes.push({
          minX: pos.x - CELL/2, maxX: pos.x + CELL/2,
          minZ: pos.z - CELL/2, maxZ: pos.z + CELL/2
        });

        // Add Crown Molding & Baseboard Trims
        const baseboard = new THREE.Mesh(
          new THREE.BoxGeometry(CELL*1.01, 0.28, CELL*1.01),
          woodMatDark
        );
        baseboard.position.set(pos.x, 0.14, pos.z);
        scene.add(baseboard);

        const crownMolding = new THREE.Mesh(
          new THREE.BoxGeometry(CELL*1.01, 0.22, CELL*1.01),
          woodMatDark
        );
        crownMolding.position.set(pos.x, WALL_H - 0.11, pos.z);
        scene.add(crownMolding);
      }
    }
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS*CELL, ROWS*CELL), floorMat);
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(COLS*CELL, ROWS*CELL), ceilMat);
  ceiling.rotation.x = Math.PI/2;
  ceiling.position.set(0, WALL_H, 0);
  scene.add(ceiling);

  // ---------- LIGHTS & FLASHLIGHT ----------
  const lamps = [];
  const candleLights = [];
  const hideSpots = [];
  const mirrors = [];
  let ambientExtinguished = false;

  function addLamp(cellR, cellC, intensity=0.9, dist=10){
    const pos = cellCenter(cellR, cellC);
    const bulbY = WALL_H*0.72;
    const light = new THREE.PointLight(0xffb463, intensity, dist, 2);
    light.position.set(pos.x, bulbY, pos.z);
    light.castShadow = true;
    light.shadow.mapSize.width = 256;
    light.shadow.mapSize.height = 256;
    light.shadow.bias = -0.002;
    scene.add(light);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshBasicMaterial({ color:0xffdfaa })
    );
    bulb.position.copy(light.position);
    scene.add(bulb);

    const cordLen = WALL_H - bulbY;
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, cordLen, 8),
      new THREE.MeshStandardMaterial({ color:0x0a0a0a, roughness:0.9 })
    );
    cord.position.set(pos.x, bulbY + cordLen/2, pos.z);
    scene.add(cord);

    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.3, 12, 1, true),
      new THREE.MeshStandardMaterial({ color:0x221a12, side:THREE.DoubleSide, roughness:0.85 })
    );
    shade.position.set(pos.x, bulbY+0.18, pos.z);
    scene.add(shade);

    lamps.push({ light, bulb, base: intensity, flickerPhase: Math.random()*100, willDie: Math.random()<0.4, deadUntil:0 });
    return light;
  }
  addLamp(2, 3, 0.65, 9);
  addLamp(2, 11, 0.5, 8);
  addLamp(7, 2, 0.7, 10);
  addLamp(7, 11, 0.7, 10);
  addLamp(12, 6, 0.6, 11);

  const hallDread = new THREE.PointLight(0x8a1010, 0.35, 8, 2);
  hallDread.position.set(cellCenter(5, 7).x, 2.8, cellCenter(5, 7).z);
  scene.add(hallDread);

  const flashlight = new THREE.SpotLight(0xfff2dc, 2.8, 30, Math.PI/6.2, 0.42, 1.4);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.width = 512;
  flashlight.shadow.mapSize.height = 512;
  flashlight.shadow.camera.near = 0.2;
  flashlight.shadow.camera.far = 32;
  flashlight.shadow.bias = -0.001;

  const flashTarget = new THREE.Object3D();
  scene.add(flashlight, flashTarget);
  flashlight.target = flashTarget;
  let flashlightOn = true;
  let flashFlickerT = 0;

  // ---------- REALISTIC GOTHIC FRONT EXIT DOOR SYSTEM ----------
  const exitPos = cellCenter(EXIT.r, EXIT.c);

  const archGroup = new THREE.Group();
  archGroup.position.set(exitPos.x, 0, exitPos.z);

  const archThickness = 0.8;
  const doorWidth = CELL * 0.75;
  const doorHeight = WALL_H * 0.85;

  const archLeft = new THREE.Mesh(new THREE.BoxGeometry(archThickness, doorHeight + 0.4, archThickness), stoneMat);
  archLeft.position.set(-doorWidth/2 - archThickness/2, (doorHeight+0.4)/2, 0);
  archLeft.castShadow = archLeft.receiveShadow = true;

  const archRight = new THREE.Mesh(new THREE.BoxGeometry(archThickness, doorHeight + 0.4, archThickness), stoneMat);
  archRight.position.set(doorWidth/2 + archThickness/2, (doorHeight+0.4)/2, 0);
  archRight.castShadow = archRight.receiveShadow = true;

  const archTop = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + archThickness*2, WALL_H - doorHeight, archThickness), stoneMat);
  archTop.position.set(0, doorHeight + (WALL_H - doorHeight)/2, 0);
  archTop.castShadow = archTop.receiveShadow = true;

  archGroup.add(archLeft, archRight, archTop);

  const signCanvas = document.createElement('canvas'); signCanvas.width = 256; signCanvas.height = 64;
  const signCtx = signCanvas.getContext('2d');
  signCtx.fillStyle = '#14100c'; signCtx.fillRect(0,0,256,64);
  signCtx.strokeStyle = '#8a703a'; signCtx.lineWidth = 4; signCtx.strokeRect(4,4,248,56);
  signCtx.fillStyle = '#d4af37'; signCtx.font = 'bold 24px serif'; signCtx.textAlign = 'center';
  signCtx.fillText('MAIN EXIT', 128, 40);
  const signTex = new THREE.CanvasTexture(signCanvas);
  const signPlaque = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7 }));
  signPlaque.position.set(0, doorHeight + 0.3, archThickness/2 + 0.02);
  archGroup.add(signPlaque);

  scene.add(archGroup);

  const exitDoorPivotL = new THREE.Group();
  exitDoorPivotL.position.set(exitPos.x - doorWidth/2, 0, exitPos.z);

  const exitDoorPivotR = new THREE.Group();
  exitDoorPivotR.position.set(exitPos.x + doorWidth/2, 0, exitPos.z);

  const panelW = doorWidth / 2;
  const doorThickness = 0.16;

  function createGothicDoorLeaf(sign){
    const leafGroup = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(panelW, doorHeight, doorThickness), woodMatMahogany);
    leaf.position.set(sign * panelW/2, doorHeight/2, 0);
    leaf.castShadow = leaf.receiveShadow = true;
    leafGroup.add(leaf);

    for (let y = 0.5; y < doorHeight; y += 1.0) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(panelW*0.9, 0.08, doorThickness*1.15), ironMat);
      strap.position.set(sign * panelW/2, y, 0);
      leafGroup.add(strap);
    }

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 12), ironMat);
    ring.position.set(sign * (panelW*0.8), doorHeight*0.5, doorThickness/2 + 0.03);
    leafGroup.add(ring);

    return leafGroup;
  }

  exitDoorPivotL.add(createGothicDoorLeaf(1));
  exitDoorPivotR.add(createGothicDoorLeaf(-1));
  scene.add(exitDoorPivotL, exitDoorPivotR);

  const chainGroup = new THREE.Group();
  chainGroup.position.set(exitPos.x, doorHeight*0.5, exitPos.z + 0.12);

  const padlock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.1), ironMat);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 12, Math.PI), ironMat);
  shackle.position.y = 0.12;
  chainGroup.add(padlock, shackle);

  for (let i = -3; i <= 3; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 8), ironMat);
    link.position.set(i * 0.08, 0, 0);
    link.rotation.y = i % 2 === 0 ? 0 : Math.PI/2;
    chainGroup.add(link);
  }
  scene.add(chainGroup);

  const exitLight = new THREE.PointLight(0xd4af37, 0, 14);
  exitLight.position.set(exitPos.x, 2.2, exitPos.z + 0.5);
  scene.add(exitLight);

  // ---------- DOORS & ROOM ARCHITECTURE ----------
  const doors = [];
  function addSwingDoor(r,c,axis){
    const pos = cellCenter(r,c);
    const doorW = CELL * 0.96;
    const doorH = WALL_H * 0.82;
    const thick = 0.12;

    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const jambThickness = 0.18;
    const jambDepth = CELL * 0.36;
    const jambMat = woodMatDark;

    if (axis === 'x'){
      const jambL = new THREE.Mesh(new THREE.BoxGeometry(jambThickness, doorH + 0.2, jambDepth), jambMat);
      jambL.position.set(-doorW/2 - jambThickness/2, doorH/2, 0);
      jambL.castShadow = jambL.receiveShadow = true;
      group.add(jambL);

      const jambR = new THREE.Mesh(new THREE.BoxGeometry(jambThickness, doorH + 0.2, jambDepth), jambMat);
      jambR.position.set(doorW/2 + jambThickness/2, doorH/2, 0);
      jambR.castShadow = jambR.receiveShadow = true;
      group.add(jambR);

      const jambTop = new THREE.Mesh(new THREE.BoxGeometry(doorW + jambThickness*2, (WALL_H - doorH), jambDepth), jambMat);
      jambTop.position.set(0, doorH + (WALL_H - doorH)/2, 0);
      jambTop.castShadow = jambTop.receiveShadow = true;
      group.add(jambTop);
    } else {
      const jambL = new THREE.Mesh(new THREE.BoxGeometry(jambDepth, doorH + 0.2, jambThickness), jambMat);
      jambL.position.set(0, doorH/2, -doorW/2 - jambThickness/2);
      jambL.castShadow = jambL.receiveShadow = true;
      group.add(jambL);

      const jambR = new THREE.Mesh(new THREE.BoxGeometry(jambDepth, doorH + 0.2, jambThickness), jambMat);
      jambR.position.set(0, doorH/2, doorW/2 + jambThickness/2);
      jambR.castShadow = jambR.receiveShadow = true;
      group.add(jambR);

      const jambTop = new THREE.Mesh(new THREE.BoxGeometry(jambDepth, (WALL_H - doorH), doorW + jambThickness*2), jambMat);
      jambTop.position.set(0, doorH + (WALL_H - doorH)/2, 0);
      jambTop.castShadow = jambTop.receiveShadow = true;
      group.add(jambTop);
    }

    const pivot = new THREE.Group();
    const hingeOffset = axis === 'x' ? doorW/2 : 0;
    const hingeOffsetZ = axis === 'z' ? doorW/2 : 0;
    pivot.position.set(axis==='x'?-hingeOffset:0, doorH/2, axis==='z'?-hingeOffsetZ:0);

    const panelGeo = new THREE.BoxGeometry(axis==='x'?doorW+0.04:thick, doorH+0.04, axis==='x'?thick:doorW+0.04);
    const panel = new THREE.Mesh(panelGeo, woodMatMid);
    panel.position.set(axis==='x'? doorW/2 : 0, 0, axis==='z'? doorW/2 : 0);
    panel.castShadow = panel.receiveShadow = true;
    pivot.add(panel);

    const knobGroup = new THREE.Group();
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), brassMat);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.14), brassMat);
    knobGroup.add(knob, plate);
    knobGroup.position.set(axis==='x'? doorW*0.88 : 0, -0.1, axis==='z'? doorW*0.88 : 0);
    pivot.add(knobGroup);

    group.add(pivot);
    scene.add(group);

    doors.push({ pivot, closedY:0, openY: Math.PI*0.42*(Math.random()<0.5?1:-1), state:0, center:pos, triggerR: CELL*0.85, slammed:false });
    return group;
  }

  addSwingDoor(5,3,'x');
  addSwingDoor(5,10,'x');
  addSwingDoor(10,3,'x');
  addSwingDoor(10,10,'x');

  const beamMat = new THREE.MeshStandardMaterial({ color:0x0f0a06, roughness:0.92 });
  for (let r=2; r<ROWS-1; r+=3){
    const beam = new THREE.Mesh(new THREE.BoxGeometry(COLS*CELL*0.94, 0.24, 0.32), beamMat);
    beam.position.set(0, WALL_H-0.15, cellCenter(r,0).z);
    beam.castShadow = true;
    scene.add(beam);
  }

  // ---------- DUST MOTES (VOLUMETRIC FLASHLIGHT BEAM PARTICLES) ----------
  const MOTE_COUNT = 90;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MOTE_COUNT * 3);
  const moteColors = new Float32Array(MOTE_COUNT * 3);
  const moteSpeed = [];
  for (let i = 0; i < MOTE_COUNT; i++) {
    motePos[i*3]     = (Math.random() - 0.5) * COLS * CELL;
    motePos[i*3+1]   = Math.random() * WALL_H;
    motePos[i*3+2]   = (Math.random() - 0.5) * ROWS * CELL;
    moteColors[i*3]   = 0.05;
    moteColors[i*3+1] = 0.04;
    moteColors[i*3+2] = 0.03;
    moteSpeed.push({ vy: 0.03 + Math.random() * 0.07, phase: Math.random() * 10 });
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(moteColors, 3));
  const moteMat = new THREE.PointsMaterial({
    size: 0.06,
    transparent: true,
    opacity: 0.85,
    vertexColors: true,
    sizeAttenuation: true
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  scene.add(motes);

  function registerCollisionBox(x, z, w, d){
    wallBoxes.push({
      minX: x - w/2, maxX: x + w/2,
      minZ: z - d/2, maxZ: z + d/2
    });
  }

  function addRug(cellR, cellC, w, d, color){
    const pos = cellCenter(cellR, cellC);
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color, roughness:0.98 })
    );
    rug.rotation.x = -Math.PI/2;
    rug.position.set(pos.x, 0.02, pos.z);
    rug.receiveShadow = true;
    scene.add(rug);
  }

  function createBloodSplatter(x, y, z, rotX, rotY, scaleW=1.4, scaleH=1.4){
    const cnv = document.createElement('canvas'); cnv.width = 128; cnv.height = 128;
    const ctx = cnv.getContext('2d');

    ctx.fillStyle = 'rgba(120, 8, 8, 0.88)';
    ctx.beginPath();
    ctx.arc(64, 64, 25+Math.random()*15, 0, Math.PI*2);
    ctx.fill();

    for(let i=0; i<14; i++){
      ctx.beginPath();
      const angle = Math.random()*Math.PI*2;
      const dist = 20 + Math.random()*38;
      ctx.arc(64 + Math.cos(angle)*dist, 64 + Math.sin(angle)*dist, 2+Math.random()*6, 0, Math.PI*2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(cnv);
    const splash = new THREE.Mesh(
      new THREE.PlaneGeometry(scaleW, scaleH),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false })
    );
    splash.position.set(x, y, z);
    splash.rotation.set(rotX, rotY, 0);
    scene.add(splash);
  }

  createBloodSplatter(cellCenter(7,2).x, 0.03, cellCenter(7,2).z, -Math.PI/2, 0, 1.8, 1.8);
  createBloodSplatter(cellCenter(1,11).x + 0.6, 0.03, cellCenter(1,11).z - 0.3, -Math.PI/2, 0, 1.4, 1.4);
  createBloodSplatter(cellCenter(9,10).x - 0.4, 0.03, cellCenter(9,10).z, -Math.PI/2, 0, 1.6, 1.6);
  createBloodSplatter(exitPos.x - 1.2, WALL_H*0.4, exitPos.z + CELL/2 - 0.04, 0, 0, 1.5, 1.5);

  function createRitualCircle(x, z){
    const cnv = document.createElement('canvas'); cnv.width = 256; cnv.height = 256;
    const ctx = cnv.getContext('2d');
    ctx.strokeStyle = 'rgba(160, 20, 20, 0.78)';
    ctx.lineWidth = 4;

    ctx.beginPath(); ctx.arc(128, 128, 100, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(128, 128, 90, 0, Math.PI*2); ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const px = 128 + 90 * Math.cos(angle);
      const py = 128 + 90 * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    const tex = new THREE.CanvasTexture(cnv);
    const circle = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.82, depthWrite: false })
    );
    circle.rotation.x = -Math.PI/2;
    circle.position.set(x, 0.025, z);
    scene.add(circle);
  }
  createRitualCircle(cellCenter(8,4).x, cellCenter(8,4).z);

  function addCandle(x, y, z){
    const candleMat = new THREE.MeshStandardMaterial({ color:0xe2d6be, roughness:0.6 });
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.22, 8), candleMat);
    candle.position.set(x, y + 0.11, z);
    candle.castShadow = true;
    scene.add(candle);

    const flameMat = new THREE.MeshBasicMaterial({ color:0xffaa33 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 6), flameMat);
    flame.position.set(x, y + 0.25, z);
    scene.add(flame);

    const cLight = new THREE.PointLight(0xff9922, 0.75, 4.5);
    cLight.position.set(x, y + 0.28, z);
    cLight.castShadow = false;
    scene.add(cLight);

    candleLights.push({ light: cLight, flame, baseIntensity: 0.75, phase: Math.random()*50 });
  }

  addCandle(cellCenter(8,3).x, 0.52, cellCenter(8,3).z);
  addCandle(cellCenter(1,5).x + 0.2, 0.92, cellCenter(1,5).z - 0.2);
  addCandle(cellCenter(12,1).x + 0.4, 0.96, cellCenter(12,1).z - 0.2);

  // ---------- HOUSE FURNITURE & INTERACTIVE SPOTS ----------
  function createBed(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    const bedPos = new THREE.Vector3(pos.x, 0, pos.z - CELL/2 + 1.5);
    group.position.copy(bedPos);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 3.0), woodMatDark);
    frame.position.y = 0.25;
    frame.castShadow = frame.receiveShadow = true;
    group.add(frame);

    const headboard = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.16), woodMatMahogany);
    headboard.position.set(0, 0.9, -1.4);
    headboard.castShadow = headboard.receiveShadow = true;
    group.add(headboard);

    const footboard = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 0.16), woodMatMahogany);
    footboard.position.set(0, 0.5, 1.4);
    footboard.castShadow = footboard.receiveShadow = true;
    group.add(footboard);

    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 2.7), new THREE.MeshStandardMaterial({ color:0xd0c4b4, roughness:0.9 }));
    mattress.position.set(0, 0.6, 0.05);
    mattress.castShadow = mattress.receiveShadow = true;
    group.add(mattress);

    const pillowMat = new THREE.MeshStandardMaterial({ color:0xe8e0d4, roughness:0.85 });
    const pillow1 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.5), pillowMat);
    pillow1.position.set(-0.6, 0.9, -1.0); pillow1.rotation.y = 0.08; pillow1.castShadow = true;
    const pillow2 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.5), pillowMat);
    pillow2.position.set(0.6, 0.9, -1.0); pillow2.rotation.y = -0.08; pillow2.castShadow = true;
    group.add(pillow1, pillow2);

    const blanket = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.15, 1.6), new THREE.MeshStandardMaterial({ color:0x4a1f1f, roughness:0.95 }));
    blanket.position.set(0, 0.85, 0.5); blanket.castShadow = blanket.receiveShadow = true;
    group.add(blanket);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z - CELL/2 + 1.5, 2.6, 3.2);

    hideSpots.push({
      id: 'bed_' + cellR + '_' + cellC,
      type: 'bed',
      pos: bedPos.clone(),
      radius: 2.2,
      occupied: false,
      label: 'UNDER MASTER BED'
    });
  }
  createBed(1, 2);

  function createNightstand(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z - CELL/2 + 0.5);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.8), woodMatMid);
    body.position.y = 0.45;
    body.castShadow = body.receiveShadow = true;
    group.add(body);

    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), brassMat);
    handle.position.set(0, 0.5, 0.42);
    group.add(handle);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z - CELL/2 + 0.5, 0.9, 0.9);
  }
  createNightstand(1, 5);

  function createWardrobe(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    const wPos = new THREE.Vector3(pos.x - CELL/2 + 0.5, 0, pos.z);
    group.position.copy(wPos);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.5, 1.7), woodMatDark);
    body.position.y = 1.25;
    body.castShadow = body.receiveShadow = true;
    group.add(body);

    scene.add(group);
    registerCollisionBox(wPos.x, wPos.z, 0.9, 1.8);

    hideSpots.push({
      id: 'wardrobe_' + cellR + '_' + cellC,
      type: 'wardrobe',
      pos: wPos.clone(),
      radius: 1.8,
      occupied: false,
      label: 'INSIDE WARDROBE'
    });
  }
  createWardrobe(4, 1);
  createWardrobe(9, 1);

  function createVanity(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    const vPos = new THREE.Vector3(pos.x - CELL/2 + 0.4, 0, pos.z);
    group.position.copy(vPos);

    const table = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 1.4), woodMatMid);
    table.position.y = 0.425;
    table.castShadow = table.receiveShadow = true;
    group.add(table);

    const mirrorFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16), woodMatDark);
    mirrorFrame.rotation.z = Math.PI/2;
    mirrorFrame.position.set(-0.25, 1.35, 0);
    mirrorFrame.castShadow = true;
    group.add(mirrorFrame);

    const mirrorGlass = new THREE.Mesh(new THREE.CircleGeometry(0.36, 16), new THREE.MeshStandardMaterial({color:0x556677, metalness:0.85, roughness:0.2}));
    mirrorGlass.rotation.y = Math.PI/2;
    mirrorGlass.position.set(-0.22, 1.35, 0);
    group.add(mirrorGlass);

    scene.add(group);
    registerCollisionBox(vPos.x, vPos.z, 0.75, 1.5);

    mirrors.push({
      id: 'vanity_' + cellR + '_' + cellC,
      pos: new THREE.Vector3(vPos.x + 0.18, 1.35, vPos.z),
      normal: new THREE.Vector3(1, 0, 0),
      triggered: false
    });
  }
  createVanity(2, 1);

  addRug(2, 3, 3.2, 3.4, 0x5c2a2a);

  function createBathtub(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x + CELL/2 - 0.6, 0, pos.z);

    const outerTub = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 1.8), porcelainMat);
    outerTub.position.y = 0.375;
    outerTub.castShadow = outerTub.receiveShadow = true;
    group.add(outerTub);

    const waterMat = new THREE.MeshStandardMaterial({ color:0x152220, roughness:0.1, metalness:0.8 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), waterMat);
    water.rotation.x = -Math.PI/2;
    water.position.set(0, 0.6, 0);
    group.add(water);

    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2), chromeMat);
    faucet.position.set(0, 0.8, -0.75);
    group.add(faucet);

    scene.add(group);
    registerCollisionBox(pos.x + CELL/2 - 0.6, pos.z, 1.2, 1.9);
  }
  createBathtub(1, 13);

  function createToilet(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z - CELL/2 + 0.5);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.7), porcelainMat);
    base.position.y = 0.225;
    base.castShadow = true;
    group.add(base);

    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.3), porcelainMat);
    tank.position.set(0, 0.65, -0.2);
    tank.castShadow = true;
    group.add(tank);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z - CELL/2 + 0.5, 0.6, 0.8);
  }
  createToilet(1, 8);

  function createVanitySink(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    const vsPos = new THREE.Vector3(pos.x - CELL/2 + 0.5, 0, pos.z);
    group.position.copy(vsPos);

    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 1.4), woodMatDark);
    cabinet.position.y = 0.45;
    cabinet.castShadow = cabinet.receiveShadow = true;
    group.add(cabinet);

    const sinkBasin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.8), porcelainMat);
    sinkBasin.position.set(0, 0.92, 0);
    sinkBasin.castShadow = sinkBasin.receiveShadow = true;
    group.add(sinkBasin);

    const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 1.2), woodMatDark);
    mirrorFrame.position.set(0.38, 1.65, 0);
    mirrorFrame.castShadow = true;
    group.add(mirrorFrame);

    const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.0), new THREE.MeshStandardMaterial({ color:0x556677, metalness:0.85, roughness:0.2 }));
    mirrorGlass.rotation.y = Math.PI / 2;
    mirrorGlass.position.set(0.35, 1.65, 0);
    group.add(mirrorGlass);

    scene.add(group);
    registerCollisionBox(vsPos.x, vsPos.z, 0.9, 1.5);

    mirrors.push({
      id: 'sink_' + cellR + '_' + cellC,
      pos: new THREE.Vector3(vsPos.x + 0.35, 1.65, vsPos.z),
      normal: new THREE.Vector3(1, 0, 0),
      triggered: false
    });
  }
  createVanitySink(3, 8);

  function createSofa(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x - CELL/2 + 0.7, 0, pos.z);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 2.7), fabricMat);
    base.position.y = 0.225;
    base.castShadow = base.receiveShadow = true;
    group.add(base);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 2.7), fabricMat);
    back.position.set(-0.4, 0.725, 0);
    back.castShadow = true;
    group.add(back);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.58, 0.32), fabricMat);
    armL.position.set(0, 0.5, -1.35);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.58, 0.32), fabricMat);
    armR.position.set(0, 0.5, 1.35);
    group.add(armL, armR);

    scene.add(group);
    registerCollisionBox(pos.x - CELL/2 + 0.7, pos.z, 1.2, 2.8);
  }
  createSofa(8, 1);

  function createCoffeeTable(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.9), woodMatMid);
    top.position.y = 0.48;
    top.castShadow = top.receiveShadow = true;
    group.add(top);

    for (let legX of [-0.65, 0.65]){
      for (let legZ of [-0.35, 0.35]){
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.44), woodMatDark);
        leg.position.set(legX, 0.22, legZ);
        group.add(leg);
      }
    }

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 1.6, 1.0);
  }
  createCoffeeTable(8, 3);

  function createBookshelf(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z + CELL/2 - 0.4);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.3, 0.65), woodMatDark);
    frame.position.y = 1.15;
    frame.castShadow = frame.receiveShadow = true;
    group.add(frame);

    const bookColors = [0x5c2a2a, 0x2a3e5c, 0x3e5c2a, 0x5c502a];
    for (let shelfY of [0.5, 1.0, 1.55]){
      for (let b=0; b<6; b++){
        const bMat = new THREE.MeshStandardMaterial({color: bookColors[b%bookColors.length]});
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.42), bMat);
        book.position.set(-0.6 + b*0.22, shelfY, 0);
        group.add(book);
      }
    }

    scene.add(group);
    registerCollisionBox(pos.x, pos.z + CELL/2 - 0.4, 1.8, 0.75);
  }
  createBookshelf(9, 5);

  let clockPendulum = null;
  function createGrandfatherClock(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x - CELL/2 + 0.4, 0, pos.z);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.5, 0.65), woodMatMahogany);
    body.position.y = 1.25;
    body.castShadow = true;
    group.add(body);

    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshStandardMaterial({color:0xe0d4bc, roughness:0.4}));
    face.rotation.y = Math.PI/2;
    face.position.set(0.29, 2.05, 0);
    group.add(face);

    clockPendulum = new THREE.Group();
    clockPendulum.position.set(0.2, 1.6, 0);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8), brassMat);
    rod.position.y = -0.4;
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12), brassMat);
    bob.position.y = -0.8;
    clockPendulum.add(rod, bob);
    group.add(clockPendulum);

    scene.add(group);
    registerCollisionBox(pos.x - CELL/2 + 0.4, pos.z, 0.65, 0.75);
  }
  createGrandfatherClock(6, 1);

  addRug(8, 3, 3.8, 2.8, 0x2a2e3a);

  const tvPos = cellCenter(6, 4);
  const tvStand = new THREE.Group();
  tvStand.position.set(tvPos.x, 0, tvPos.z - CELL/2 + 0.4);

  const standTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.55), woodMatDark);
  standTop.position.y = 0.52;
  standTop.castShadow = true;
  tvStand.add(standTop);

  for (const lx of [-0.45, 0.45]){
    const sLeg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.45), woodMatDark);
    sLeg.position.set(lx, 0.26, 0);
    sLeg.castShadow = true;
    tvStand.add(sLeg);
  }

  const tvBody = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.65), new THREE.MeshStandardMaterial({color:0x1a1a1a, roughness:0.8}));
  tvBody.position.set(0, 0.92, 0);
  tvBody.castShadow = true;
  tvStand.add(tvBody);
  scene.add(tvStand);
  registerCollisionBox(tvPos.x, tvPos.z - CELL/2 + 0.4, 1.0, 0.75);

  const tvCanvas = document.createElement('canvas'); tvCanvas.width=64; tvCanvas.height=48;
  const tvCtx = tvCanvas.getContext('2d');
  const tvTex = new THREE.CanvasTexture(tvCanvas);
  const tvImgData = tvCtx.createImageData(tvCanvas.width, tvCanvas.height);
  const tvScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.65,0.46),
    new THREE.MeshBasicMaterial({ map: tvTex })
  );
  tvScreen.position.set(tvPos.x, 0.92 + 0.05, tvPos.z - CELL/2 + 0.4 + 0.33);
  scene.add(tvScreen);

  let tvStaticFrame = 0;
  function drawTvStatic(){
    tvStaticFrame++;
    if (tvStaticFrame % 4 !== 0) return;
    const data = tvImgData.data;
    for (let i=0; i<data.length; i+=4){
      const v = Math.random()*255;
      data[i]=v*0.7; data[i+1]=v*0.75; data[i+2]=v*0.85; data[i+3]=255;
    }
    tvCtx.putImageData(tvImgData,0,0);
    tvTex.needsUpdate = true;
  }

  function createKitchenCounter(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z - CELL/2 + 0.5);

    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 0.95), woodMatMid);
    base.position.y = 0.5;
    base.castShadow = base.receiveShadow = true;
    group.add(base);

    const top = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.1, 1.0), new THREE.MeshStandardMaterial({color:0x1e1e1e, roughness:0.4}));
    top.position.y = 1.05;
    group.add(top);

    const backsplash = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.6, 0.06), new THREE.MeshStandardMaterial({color:0x2a2a2a, roughness:0.6}));
    backsplash.position.set(0, 1.35, -0.47);
    group.add(backsplash);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z - CELL/2 + 0.5, 3.3, 1.05);
  }
  createKitchenCounter(6, 11);

  function createDiningSet(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 1.9), woodMatMahogany);
    top.position.y = 0.85;
    top.castShadow = top.receiveShadow = true;
    group.add(top);

    for (let lx of [-0.85, 0.85]){
      for (let lz of [-0.85, 0.85]){
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.8), woodMatDark);
        leg.position.set(lx, 0.4, lz);
        group.add(leg);
      }
    }

    for (const cx of [-1.35, 1.35]){
      for (const cz of [-0.85, 0.85]){
        const chair = new THREE.Group();
        chair.position.set(cx, 0, cz);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.45), woodMatMid);
        seat.position.y = 0.48;
        seat.castShadow = true;
        chair.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.06), woodMatDark);
        back.position.set(0, 0.78, -0.2);
        back.castShadow = true;
        chair.add(back);
        for (const lx of [-0.16, 0.16]){
          for (const lz of [-0.16, 0.16]){
            const cLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.48, 6), woodMatDark);
            cLeg.position.set(lx, 0.24, lz);
            chair.add(cLeg);
          }
        }
        group.add(chair);
      }
    }

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 2.3, 2.3);
  }
  createDiningSet(9, 11);

  const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.0, 0.85), new THREE.MeshStandardMaterial({color:0xaaaaaa, roughness:0.4, metalness:0.6}));
  fridge.position.set(cellCenter(6,8).x + CELL/2 - 0.5, 1.0, cellCenter(6,8).z - CELL/2 + 0.5);
  fridge.castShadow = true;
  scene.add(fridge);
  registerCollisionBox(cellCenter(6,8).x + CELL/2 - 0.5, cellCenter(6,8).z - CELL/2 + 0.5, 1.05, 0.95);

  addRug(9, 11, 2.6, 2.6, 0x3a2c1c);

  function createDesk(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    const dPos = new THREE.Vector3(pos.x - CELL/2 + 0.4, 0, pos.z);
    group.position.copy(dPos);

    const top = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.1, 1.7), woodMatMahogany);
    top.position.y = 0.9;
    top.castShadow = top.receiveShadow = true;
    group.add(top);

    for (const lx of [-0.28, 0.28]){
      for (const lz of [-0.7, 0.7]){
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.85, 8), woodMatDark);
        leg.position.set(lx, 0.425, lz);
        leg.castShadow = true;
        group.add(leg);
      }
    }

    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 0.55), woodMatMid);
    drawer.position.set(0, 0.72, 0.45);
    drawer.castShadow = true;
    group.add(drawer);

    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), brassMat);
    handle.position.set(0, 0.72, 0.74);
    group.add(handle);

    scene.add(group);
    registerCollisionBox(dPos.x, dPos.z, 0.85, 1.8);
  }
  createDesk(12, 1);

  function createConsoleTable(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    const cPos = new THREE.Vector3(pos.x, 0, pos.z + CELL/2 - 0.4);
    group.position.copy(cPos);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.65), woodMatMahogany);
    top.position.y = 0.94;
    top.castShadow = top.receiveShadow = true;
    group.add(top);

    for (const lx of [-0.8, 0.8]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.94, 0.1), woodMatDark);
      leg.position.set(lx, 0.47, 0);
      leg.castShadow = true;
      group.add(leg);
    }

    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.5), woodMatMid);
    shelf.position.set(0, 0.35, 0);
    group.add(shelf);

    scene.add(group);
    registerCollisionBox(cPos.x, cPos.z, 1.9, 0.65);
  }
  createConsoleTable(13, 9);

  addRug(12, 7, 4.2, 2.4, 0x3a1f1f);

  function addCobweb(x, y, z, rotY, scale){
    const cnv = document.createElement('canvas');
    cnv.width = 128; cnv.height = 128;
    const ctx = cnv.getContext('2d');
    ctx.strokeStyle = 'rgba(200, 195, 185, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++){
      const angle = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(64 + Math.cos(angle) * 60, 64 + Math.sin(angle) * 60);
      ctx.stroke();
    }
    for (let r = 12; r <= 55; r += 10){
      ctx.beginPath();
      ctx.arc(64, 64, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(cnv);
    const web = new THREE.Mesh(
      new THREE.PlaneGeometry(scale, scale),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
    );
    web.position.set(x, y, z);
    web.rotation.y = rotY;
    scene.add(web);
  }

  addCobweb(cellCenter(1, 1).x - 2.8, 4.2, cellCenter(1, 1).z - 2.5, 0.3, 1.8);
  addCobweb(cellCenter(8, 1).x - 2.8, 3.8, cellCenter(8, 1).z - 2.5, -0.2, 1.5);
  addCobweb(cellCenter(12, 13).x + 2.8, 4.0, cellCenter(12, 13).z + 2.5, Math.PI, 1.6);
  addCobweb(cellCenter(3, 13).x + 2.8, 3.5, cellCenter(3, 13).z + 2.5, Math.PI + 0.4, 1.4);

  function addOverturnedChair(x, z, rotY){
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), woodMatMid);
    seat.position.set(0, 0.25, 0);
    seat.rotation.z = Math.PI / 2;
    seat.castShadow = true;
    group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.06), woodMatDark);
    back.position.set(0, 0.55, -0.22);
    back.rotation.z = Math.PI / 2;
    group.add(back);
    for (const lx of [-0.18, 0.18]){
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.5, 6), woodMatDark);
      leg.position.set(lx, 0.12, 0.15);
      leg.rotation.x = 0.4;
      group.add(leg);
    }
    scene.add(group);
  }
  addOverturnedChair(cellCenter(7, 5).x, cellCenter(7, 5).z, 1.2);
  addOverturnedChair(cellCenter(11, 8).x + 0.5, cellCenter(11, 8).z - 0.3, -0.8);

  function addWallStain(x, y, z, rotY, w, h){
    const cnv = document.createElement('canvas');
    cnv.width = 64; cnv.height = 128;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = 'rgba(40, 25, 15, 0.55)';
    ctx.beginPath();
    ctx.ellipse(32, 64, 20 + Math.random() * 8, 50 + Math.random() * 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(25, 15, 8, 0.4)';
    ctx.beginPath();
    ctx.ellipse(32, 90, 12, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(cnv);
    const stain = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.7, depthWrite: false })
    );
    stain.position.set(x, y, z);
    stain.rotation.y = rotY;
    scene.add(stain);
  }
  addWallStain(cellCenter(5, 7).x + 2.95, 2.2, cellCenter(5, 7).z, Math.PI / 2, 0.8, 1.6);
  addWallStain(cellCenter(10, 1).x - 2.95, 1.8, cellCenter(10, 1).z, -Math.PI / 2, 0.7, 1.4);
  addWallStain(cellCenter(1, 10).x, 2.5, cellCenter(1, 10).z - 2.95, 0, 0.9, 1.8);

  createBloodSplatter(cellCenter(12, 7).x + 0.8, 0.03, cellCenter(12, 7).z, -Math.PI / 2, 0.5, 1.2, 1.2);
  createBloodSplatter(cellCenter(4, 11).x, 0.03, cellCenter(4, 11).z + 0.5, -Math.PI / 2, 0.3, 1.0, 1.0);

  // ---------- REALISTIC PAGE PLACEMENT ON FURNITURE ----------
  const pageMat = new THREE.MeshStandardMaterial({
    color: 0xc4a060,
    emissive: 0x2a1808,
    emissiveIntensity: 0.12,
    roughness: 0.88,
    side: THREE.DoubleSide
  });
  const pageGeo = new THREE.BoxGeometry(0.26, 0.006, 0.36);

  const pages = [];
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(pageGeo, pageMat);
    scene.add(mesh);
    pages.push({ mesh, pos: new THREE.Vector3(), collected: false, cellKey: '' });
  }

  let pagesCollected = 0;

  function placePageOnFurniture(p, anchor){
    const center = cellCenter(anchor.cell.r, anchor.cell.c);
    p.pos.set(center.x + anchor.offX, anchor.surfaceY + 0.004, center.z + anchor.offZ);
    p.cellKey = anchor.cell.r + ',' + anchor.cell.c;
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.set(-Math.PI / 2 + anchor.tiltX, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.15);
    p.mesh.visible = true;
    p.collected = false;
  }

  function randomizePages(spawnCell){
    const spawn = spawnCell || currentSpawnCell;
    const eligible = FURNITURE_PAGE_ANCHORS.filter(a =>
      pageSpawnDistanceCells(a.cell, spawn) >= MIN_PAGE_SPAWN_CELLS
    );
    const pool = eligible.length >= 3 ? eligible : FURNITURE_PAGE_ANCHORS;
    const selected = shuffleArray(pool).slice(0, 3);
    selected.forEach((anchor, i) => placePageOnFurniture(pages[i], anchor));
    pagesCollected = 0;
    document.getElementById('pageCount').textContent = '0 / 3';
    document.getElementById('objective').classList.remove('unlocked');
  }

  // ---------- BATTERY PICKUPS ----------
  function createBatteryMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 12), bodyMat);
    body.position.y = 0.09;
    body.castShadow = true;
    group.add(body);

    const bandMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.9 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.08, 12), bandMat);
    band.position.y = 0.09;
    group.add(band);

    return group;
  }

  const CANDIDATE_BATTERY_SPAWNS = [
    { r: 1, c: 5, offX: 0.35, h: 0.92, offZ: 0.25 },
    { r: 3, c: 8, offX: -0.45, h: 0.95, offZ: 0.0 },
    { r: 8, c: 3, offX: -0.4, h: 0.52, offZ: 0.2 },
    { r: 6, c: 11, offX: 0.85, h: 1.12, offZ: -0.25 },
    { r: 9, c: 11, offX: -0.5, h: 0.92, offZ: 0.3 },
    { r: 12, c: 1, offX: -0.4, h: 0.96, offZ: 0.25 },
    { r: 13, c: 9, offX: 0.45, h: 0.94, offZ: 0.0 }
  ];

  const batteries = [];
  for (let i = 0; i < 4; i++) {
    const mesh = createBatteryMesh();
    mesh.rotation.z = Math.PI / 2;
    const glow = new THREE.PointLight(0x4cd964, 0.6, 2.5);
    scene.add(mesh, glow);
    batteries.push({ mesh, glow, pos: new THREE.Vector3(), collected: false });
  }

  function randomizeBatteries(pageCellKeys) {
    const blocked = new Set(pageCellKeys);
    const pool = shuffleArray(CANDIDATE_BATTERY_SPAWNS.filter(s => !blocked.has(s.r + ',' + s.c)));
    const selected = pool.slice(0, 4);
    selected.forEach((item, i) => {
      const b = batteries[i];
      const center = cellCenter(item.r, item.c);
      b.pos.set(center.x + item.offX, item.h, center.z + item.offZ);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.y = Math.random() * Math.PI;
      b.mesh.visible = true;
      b.glow.position.set(b.pos.x, b.pos.y + 0.15, b.pos.z);
      b.glow.visible = true;
      b.collected = false;
    });
    for (let i = selected.length; i < batteries.length; i++) {
      batteries[i].collected = true;
      batteries[i].mesh.visible = false;
      batteries[i].glow.visible = false;
    }
  }

  function randomizeCollectibles(spawnCell){
    randomizePages(spawnCell);
    randomizeBatteries(pages.map(p => p.cellKey));
  }

  randomizeCollectibles(currentSpawnCell);

  // ---------- REFLECTIVE MIRROR JUMPSCARE OBJECT & AUDIOS ----------
  const mirrorWatcherMesh = new THREE.Group();
  const mirrorBodyMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, emissive: 0x220000, emissiveIntensity: 0.35 });
  const mirrorEyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const mShroud = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.0, 8, 1, true), mirrorBodyMat);
  mShroud.position.y = 1.0;
  mShroud.rotation.x = 0.18;
  const mHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), mirrorBodyMat);
  mHead.position.set(0, 2.05, 0.1);
  mHead.scale.set(0.82, 1.2, 0.72);
  const mEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), mirrorEyeMat);
  mEyeL.position.set(-0.07, 2.08, 0.22);
  const mEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), mirrorEyeMat);
  mEyeR.position.set(0.08, 2.06, 0.22);
  mirrorWatcherMesh.add(mShroud, mHead, mEyeL, mEyeR);
  mirrorWatcherMesh.visible = false;
  scene.add(mirrorWatcherMesh);

  let mirrorScareActive = false;
  let mirrorScareTimer = 0;
  let scareTriggerYaw = 0;
  let hidingType = null;
  const mirrorFlashEl = document.getElementById('mirrorFlash');

  // ---------- ENTITY: "THE WATCHER" ----------
  const fleshMat = new THREE.MeshStandardMaterial({
    color: 0x0a0606,
    roughness: 0.98,
    metalness: 0.02,
    emissive: 0x1a0000,
    emissiveIntensity: 0.08
  });
  const shroudMat = new THREE.MeshStandardMaterial({
    color: 0x020202,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide
  });
  const eyeMat  = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const eyeGlow = new THREE.PointLight(0xff1111, 0, 7);
  const auraLight = new THREE.PointLight(0x660000, 0, 4);

  const entityGroup = new THREE.Group();

  const torsoPivot = new THREE.Group();

  const shroud = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.55, 10, 1, true), shroudMat);
  shroud.position.y = 1.28;
  shroud.rotation.x = 0.2;
  shroud.castShadow = true;
  torsoPivot.add(shroud);

  const ribcage = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.45, 6), fleshMat);
  ribcage.position.set(0, 1.35, 0.04);
  ribcage.rotation.x = 0.32;
  ribcage.castShadow = true;
  torsoPivot.add(ribcage);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 2.42, 0.18);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), fleshMat);
  skull.scale.set(0.78, 1.18, 0.68);
  skull.castShadow = true;
  headPivot.add(skull);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.1), fleshMat);
  jaw.position.set(0, -0.16, 0.1);
  jaw.rotation.x = 0.35;
  headPivot.add(jaw);

  const mouthVoid = new THREE.Mesh(
    new THREE.PlaneGeometry(0.11, 0.035),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  mouthVoid.position.set(0, -0.12, 0.14);
  headPivot.add(mouthVoid);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), eyeMat);
  eyeL.position.set(-0.065, 0.05, 0.13);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeMat);
  eyeR.position.set(0.075, 0.03, 0.13);
  eyeGlow.position.set(0, 0.04, 0.15);
  headPivot.add(eyeL, eyeR, eyeGlow);
  torsoPivot.add(headPivot);

  function makeArm(sign){
    const shoulder = new THREE.Group();
    shoulder.position.set(sign * 0.38, 2.05, 0.06);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.026, 0.95, 5), shroudMat);
    upper.position.y = -0.48;
    upper.rotation.z = sign * 0.12;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.95;

    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.016, 1.05, 5), shroudMat);
    fore.position.y = -0.52;
    elbow.add(fore);

    const hand = new THREE.Group();
    hand.position.y = -1.05;
    for (let i = 0; i < 5; i++){
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.003, 0.32 + i * 0.03, 4), fleshMat);
      finger.position.set((i - 2) * 0.022, -0.16, 0.015);
      finger.rotation.x = 0.45 + i * 0.04;
      finger.rotation.z = (i - 2) * 0.06;
      hand.add(finger);
    }
    elbow.add(hand);
    shoulder.add(elbow);
    return { shoulder, elbow, hand };
  }
  const armL = makeArm(-1), armR = makeArm(1);
  torsoPivot.add(armL.shoulder, armR.shoulder);

  function makeLeg(sign){
    const hip = new THREE.Group();
    hip.position.set(sign * 0.16, 0.15, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.038, 0.75, 5), fleshMat);
    thigh.position.y = 0.38;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = 0.75;
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.022, 0.72, 5), fleshMat);
    shin.position.y = 0.36;
    knee.add(shin);
    hip.add(knee);
    return { hip, knee };
  }
  const legL = makeLeg(-1), legR = makeLeg(1);
  entityGroup.add(torsoPivot, legL.hip, legR.hip);

  auraLight.position.set(0, 1.6, 0);
  entityGroup.add(auraLight);

  scene.add(entityGroup);

  const spawnPos = cellCenter(7,7);
  entityGroup.position.copy(spawnPos);
  entityGroup.visible = false;
  let entityActive = false;
  let entityState = 'idle';
  let entityBaseSpeed = 2.5;
  let entityTargetPos = null;
  let lastKnownPlayerPos = null;
  let searchTimer = 0;
  let entWalkPhase = 0;
  let entTwitchT = 0;
  let entHeadTwitchTarget = 0;
  let entHeadTwitchCur = 0;
  const PATROL_POINTS = [ cellCenter(2,9), cellCenter(7,2), cellCenter(9,9), cellCenter(12,3) ];
  let patrolIdx = 0;

  function resetEntity(){
    entityGroup.position.copy(spawnPos);
    entityGroup.position.y = 0;
    entityGroup.rotation.set(0, 0, 0);
    entityGroup.scale.set(1, 1, 1);
    entityGroup.visible = false;
    entityActive = false;
    entityState = 'idle';
    entityTargetPos = null;
    lastKnownPlayerPos = null;
    searchTimer = 0;
    entWalkPhase = 0;
    entHeadTwitchCur = 0;
    entHeadTwitchTarget = 0;
    patrolIdx = 0;
    eyeGlow.intensity = 0;
    auraLight.intensity = 0;
    headPivot.rotation.set(0, 0, 0);
    shroud.rotation.x = 0.2;
  }

  function animateEntity(dt, currentSpeed, distToPlayer, hunting){
    const cycleSpeed = 5.0 + currentSpeed * 2.0;
    entWalkPhase += dt * cycleSpeed;
    const swing = Math.sin(entWalkPhase) * (0.55 + Math.min(0.4, currentSpeed * 0.12));
    legL.hip.rotation.x = swing;
    legR.hip.rotation.x = -swing;
    legL.knee.rotation.x = Math.max(0, -Math.sin(entWalkPhase + 0.6)) * 0.85;
    legR.knee.rotation.x = Math.max(0, -Math.sin(entWalkPhase + 0.6 + Math.PI)) * 0.85;

    const bob = Math.abs(Math.sin(entWalkPhase * 0.5)) * 0.05;
    entityGroup.position.y = bob;

    const armReach = hunting ? 0.35 : 0.15;
    armL.shoulder.rotation.x = -0.25 + swing * 0.4 - armReach;
    armR.shoulder.rotation.x = -0.25 - swing * 0.4 - armReach;
    armL.elbow.rotation.x = hunting ? -0.55 : -0.25;
    armR.elbow.rotation.x = hunting ? -0.55 : -0.25;

    entTwitchT -= dt;
    if (entTwitchT <= 0){
      entTwitchT = hunting ? (0.08 + Math.random() * 0.2) : (0.45 + Math.random() * 0.9);
      entHeadTwitchTarget = (Math.random() - 0.5) * (hunting ? 1.8 : 0.6);
    }
    entHeadTwitchCur += (entHeadTwitchTarget - entHeadTwitchCur) * Math.min(1, dt * 18);
    headPivot.rotation.y = entHeadTwitchCur;
    headPivot.rotation.z = Math.sin(entWalkPhase * 0.35) * 0.12 + (hunting ? 0.08 : 0);
    headPivot.rotation.x = hunting ? 0.22 : 0.1;

    shroud.rotation.x = 0.2 + (hunting ? 0.12 : 0) + Math.sin(entWalkPhase * 0.25) * 0.04;
    shroud.rotation.z = Math.sin(entWalkPhase * 0.2) * 0.03;

    const closeness = Math.max(0, Math.min(1, 1 - distToPlayer / 6));
    const stretch = 1 + closeness * 0.18;
    entityGroup.scale.set(1, stretch, 1);

    const eyeIntensity = hunting ? (1.8 + closeness * 4.5) : 0.15;
    eyeGlow.intensity = eyeIntensity;
    auraLight.intensity = hunting ? (0.35 + closeness * 1.2) : 0;
    eyeMat.color.setRGB(1.0, 0.1 + closeness * 0.25, 0.08 + closeness * 0.1);

    fleshMat.emissiveIntensity = 0.08 + closeness * 0.25;
    shroudMat.opacity = 0.88 + closeness * 0.1;
  }

  // ---------- PAPER NOTE UI OVERLAY MECHANIC ----------
  let isNoteOpen = false;
  const noteModal = document.getElementById('noteModal');
  const noteEyebrow = document.getElementById('noteEyebrow');
  const noteTitle = document.getElementById('noteTitle');
  const noteBody = document.getElementById('noteBody');
  const closeNoteBtn = document.getElementById('closeNoteBtn');

  function openPaperNote(pageIndex){
    const data = PAGE_NOTES[pageIndex];
    if (!data) return;

    noteEyebrow.textContent = data.eyebrow;
    noteTitle.textContent = data.title;
    noteBody.textContent = data.body;

    isNoteOpen = true;
    noteModal.classList.remove('hidden');
    noteModal.classList.add('active');

    // Release mouse cursor so player can click close button or view paper
    if (document.pointerLockElement) document.exitPointerLock();

    playPageChime();
  }

  function closePaperNote(){
    if (!isNoteOpen) return;
    isNoteOpen = false;
    noteModal.classList.remove('active');
    noteModal.classList.add('hidden');

    // Seamlessly return to 1st person gameplay
    if (gameRunning && !gameOver && !isTouch){
      renderer.domElement.requestPointerLock();
    }
  }

  closeNoteBtn.addEventListener('click', closePaperNote);
  noteModal.addEventListener('click', (e) => {
    if (e.target === noteModal) closePaperNote();
  });

  // ---------- PLAYER STATE ----------
  let yaw = 0, pitch = 0;
  const move = { f:false, b:false, l:false, r:false, run:false, crouch:false };
  let pointerLocked = false;
  let gameRunning = false;
  let isHiding = false;
  let hidingSpot = null;
  let preHidePos = null;
  let hideExitCooldown = 0;
  let stamina = 100;
  let staminaExhausted = false;
  let footstepTimer = 0;
  let bobPhase = 0;
  let baseEyeHeight = 1.6;
  let crouchLerp = 0;
  const BASE_FOV = 75;
  const SPRINT_FOV = 84;
  const WALK_FOV = 75;
  const INJURED_FOV = 70;

  let trapPinTimer = 0;
  let trapSlowTimer = 0;

  document.addEventListener('mousemove', (e) => {
    if (!pointerLocked || isNoteOpen) return;
    yaw -= e.movementX * 0.0022 * (gameSettings.sensitivity / 5);
    pitch -= e.movementY * 0.0022 * (gameSettings.sensitivity / 5);
    pitch = Math.max(-Math.PI/2 + 0.05, Math.min(Math.PI/2 - 0.05, pitch));
  });

  document.addEventListener('keydown', (e) => {
    if (isNoteOpen){
      if (e.code === 'KeyE' || e.code === 'Escape'){
        e.preventDefault();
        closePaperNote();
        return;
      }
    }

    switch(e.code){
      case 'KeyW': move.f = true; break;
      case 'KeyS': move.b = true; break;
      case 'KeyA': move.l = true; break;
      case 'KeyD': move.r = true; break;
      case 'ShiftLeft': case 'ShiftRight': move.run = true; break;
      case 'KeyC': move.crouch = !move.crouch; break;
      case 'KeyF': toggleFlashlight(); break;
      case 'KeyE': tryInteract(); break;
      case 'Escape': if (isNoteOpen) closePaperNote(); break;
    }
  });
  document.addEventListener('keyup', (e) => {
    switch(e.code){
      case 'KeyW': move.f = false; break;
      case 'KeyS': move.b = false; break;
      case 'KeyA': move.l = false; break;
      case 'KeyD': move.r = false; break;
      case 'ShiftLeft': case 'ShiftRight': move.run = false; break;
    }
  });

  function toggleFlashlight(){
    if (battery <= 0 || isNoteOpen) return;
    flashlightOn = !flashlightOn;
    playClick();
  }

  // ---------- TOUCH CONTROLS ----------
  const touchControlsEl = document.getElementById('touchControls');
  const joystickZone = document.getElementById('joystickZone');
  const joystickKnob = document.getElementById('joystickKnob');
  const lookLayer = document.getElementById('lookLayer');
  const btnFlash = document.getElementById('btnFlash');
  const btnRun = document.getElementById('btnRun');
  const btnCrouch = document.getElementById('btnCrouch');
  const btnInteract = document.getElementById('btnInteract');

  let joyVec = { x:0, y:0 };
  let joyTouchId = null, joyCenter = { x:0, y:0 };
  const JOY_RADIUS = 45;

  function joyStart(e){
    if (isNoteOpen) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    joyTouchId = t.identifier;
    const rect = joystickZone.getBoundingClientRect();
    joyCenter = { x: rect.left+rect.width/2, y: rect.top+rect.height/2 };
    joyUpdate(t);
  }
  function joyUpdate(t){
    let dx = t.clientX - joyCenter.x, dy = t.clientY - joyCenter.y;
    const dist = Math.hypot(dx,dy);
    if (dist > JOY_RADIUS){ dx = dx/dist*JOY_RADIUS; dy = dy/dist*JOY_RADIUS; }
    joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    joyVec.x = dx / JOY_RADIUS;
    joyVec.y = -dy / JOY_RADIUS;
  }
  function joyEnd(id){
    if (id !== joyTouchId) return;
    joyTouchId = null;
    joyVec.x = 0; joyVec.y = 0;
    joystickKnob.style.transform = 'translate(0px,0px)';
  }
  joystickZone.addEventListener('touchstart', joyStart, { passive:false });
  document.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches){
      if (t.identifier === joyTouchId){ e.preventDefault(); joyUpdate(t); }
    }
  }, { passive:false });
  document.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) joyEnd(t.identifier);
  });
  document.addEventListener('touchcancel', (e) => {
    for (const t of e.changedTouches) joyEnd(t.identifier);
  });

  let lookTouchId = null, lastLook = { x:0, y:0 };
  lookLayer.addEventListener('touchstart', (e) => {
    if (isNoteOpen) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lastLook = { x:t.clientX, y:t.clientY };
  }, { passive:false });
  document.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches){
      if (t.identifier === lookTouchId && !isNoteOpen){
        e.preventDefault();
        const dx = t.clientX - lastLook.x, dy = t.clientY - lastLook.y;
        yaw -= dx * 0.0045 * (gameSettings.sensitivity / 5);
        pitch -= dy * 0.0045 * (gameSettings.sensitivity / 5);
        pitch = Math.max(-Math.PI/2 + 0.05, Math.min(Math.PI/2 - 0.05, pitch));
        lastLook = { x:t.clientX, y:t.clientY };
      }
    }
  }, { passive:false });
  document.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookTouchId) lookTouchId = null;
  });

  let touchRunActive = false;
  btnRun.addEventListener('click', () => {
    if (isNoteOpen) return;
    touchRunActive = !touchRunActive;
    btnRun.classList.toggle('active', touchRunActive);
  });
  btnCrouch.addEventListener('click', () => {
    if (isNoteOpen) return;
    move.crouch = !move.crouch;
    btnCrouch.classList.toggle('active', move.crouch);
  });
  btnFlash.addEventListener('click', () => {
    toggleFlashlight();
    btnFlash.classList.toggle('active', flashlightOn);
  });
  btnInteract.addEventListener('click', () => tryInteract());
  btnFlash.classList.add('active');

  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  const PLAYER_RADIUS = 0.35;
  const extraCollisionBoxes = [];
  function addCollisionBox(minX, maxX, minZ, maxZ){
    extraCollisionBoxes.push({ minX, maxX, minZ, maxZ });
  }
  function collides(x, z){
    for (const b of wallBoxes){
      if (x + PLAYER_RADIUS > b.minX && x - PLAYER_RADIUS < b.maxX &&
          z + PLAYER_RADIUS > b.minZ && z - PLAYER_RADIUS < b.maxZ){
        return true;
      }
    }
    for (const b of extraCollisionBoxes){
      if (x + PLAYER_RADIUS > b.minX && x - PLAYER_RADIUS < b.maxX &&
          z + PLAYER_RADIUS > b.minZ && z - PLAYER_RADIUS < b.maxZ){
        return true;
      }
    }
    return false;
  }

  function findSafePosition(x, z){
    if (!collides(x, z)) return { x, z };
    for (let dist = 0.4; dist <= 2.8; dist += 0.4){
      for (let a = 0; a < 12; a++){
        const angle = (a / 12) * Math.PI * 2;
        const tx = x + Math.cos(angle) * dist;
        const tz = z + Math.sin(angle) * dist;
        if (!collides(tx, tz)) return { x: tx, z: tz };
      }
    }
    return { x, z };
  }

  function exitHide(){
    isHiding = false;
    hidingType = null;
    document.getElementById('wardrobeOverlay').classList.add('hidden');
    document.getElementById('bedOverlay').classList.add('hidden');
    move.crouch = false;
    if (isTouch) btnCrouch.classList.remove('active');
    crouchLerp = 0;

    let tx, tz;
    if (preHidePos && hidingSpot){
      const spot = hidingSpot.pos;
      const dx = preHidePos.x - spot.x;
      const dz = preHidePos.z - spot.z;
      const dist = Math.hypot(dx, dz) || 1;
      const minDist = 2.0;
      if (dist < minDist){
        tx = spot.x + (dx / dist) * minDist;
        tz = spot.z + (dz / dist) * minDist;
      } else {
        tx = preHidePos.x;
        tz = preHidePos.z;
      }
    } else if (preHidePos){
      tx = preHidePos.x;
      tz = preHidePos.z;
    } else if (hidingSpot){
      tx = hidingSpot.pos.x + 2.0;
      tz = hidingSpot.pos.z + 2.0;
    } else {
      return;
    }

    const safe = findSafePosition(tx, tz);
    camera.position.x = safe.x;
    camera.position.z = safe.z;

    if (hidingSpot) hidingSpot.occupied = false;
    hidingSpot = null;
    preHidePos = null;
    hideExitCooldown = 0.75;
  }

  const whisperDiv = document.getElementById('whisperText');
  function showWhisper(){
    if (!entityActive) return;
    const w = WHISPERS[Math.floor(Math.random()*WHISPERS.length)];
    whisperDiv.textContent = w;
    whisperDiv.style.opacity = 0.95;
    clearTimeout(showWhisper._t);
    showWhisper._t = setTimeout(() => { whisperDiv.style.opacity = 0; }, 2000);
  }

  const toastDiv = document.getElementById('toastMsg');
  function showToast(text){
    if (!toastDiv) return;
    toastDiv.textContent = text;
    toastDiv.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toastDiv.classList.remove('show'); }, 2800);
  }

  const interactHintEl = document.getElementById('interactHint');

  function tryInteract(){
    if (!gameRunning) return;

    if (isNoteOpen){
      closePaperNote();
      return;
    }

    if (isHiding){
      exitHide();
      return;
    }

    if (currentChapter === 2){
      for (const obj of chapter2Objects){
        if (obj.used) continue;
        const d = camera.position.distanceTo(obj.pos);
        if (d < obj.radius){
          obj.onInteract();
          return;
        }
      }
    }

    // Check Pages
    for (const p of pages){
      if (p.collected) continue;
      const d = camera.position.distanceTo(p.pos);
      if (d < 2.6){
        p.collected = true;
        p.mesh.visible = false;
        pagesCollected++;
        document.getElementById('pageCount').textContent = pagesCollected + ' / 3';

        // POP UP FULLSCREEN AGED PARCHMENT PAPER NOTE OVERLAY
        openPaperNote(pagesCollected - 1);

        // Trigger MONSTER CHASE & PERMANENT AMBIENT LIGHT EXTINCTION ON 2ND PAGE!
        if (pagesCollected === 2){
          playStinger();
          showToast("PAGE 2 COLLECTED — LIGHTS EXTINGUISHED & THE WATCHER IS HUNTING!");
          entityGroup.visible = true;
          entityActive = true;
          entityState = 'hunting';
          lastKnownPlayerPos = camera.position.clone();
          showWhisper();

          ambientExtinguished = true;
          ambientLight.intensity = 0.08;
          lamps.forEach(l => {
            l.light.intensity = 0;
            if (l.bulb) l.bulb.material.color.setHex(0x151210);
          });
          candleLights.forEach(c => {
            c.light.intensity = 0;
            if (c.flame) c.flame.visible = false;
          });

          for (const d of doors){
            if (Math.hypot(d.center.x-entityGroup.position.x, d.center.z-entityGroup.position.z) < CELL*2.5) d.slammed = true;
          }
        }

        // Unlock Exit Door when 3rd page is picked up!
        if (pagesCollected === 3){
          exitLight.intensity = 2.2;
          chainGroup.visible = false;
          exitDoorPivotL.rotation.y = Math.PI * 0.12;
          exitDoorPivotR.rotation.y = -Math.PI * 0.12;
          document.getElementById('objective').classList.add('unlocked');
          document.getElementById('pageCount').textContent = '3 / 3 — EXIT UNLOCKED!';
          showToast("CHAINS BROKEN! ESCAPE THROUGH THE MAIN EXIT!");
          playChainBreak();
        }
        return;
      }
    }

    // Check Batteries
    for (const b of batteries){
      if (b.collected) continue;
      const d = camera.position.distanceTo(b.pos);
      if (d < 2.6){
        b.collected = true;
        b.mesh.visible = false;
        b.glow.visible = false;
        battery = Math.min(100, battery + 50);
        if (battery > 0 && !flashlightOn) flashlightOn = true;
        playBatteryChime();
        showToast("+50% FLASHLIGHT BATTERY");
        return;
      }
    }

    // Check Exit Door interaction
    const distToExit = Math.hypot(camera.position.x-exitPos.x, camera.position.z-exitPos.z);
    if (distToExit < 2.8){
      if (currentChapter === 1){
        if (pagesCollected < 3){
          showToast("THE EXIT IS CHAINED SHUT — FIND ALL 3 PAGES");
          console.log('[Ch1 Exit] interact but pagesCollected=' + pagesCollected + '/3 — chained.');
        } else {
          console.log('[Ch1 Exit] 3/3 collected. Transitioning to Chapter 2...');
          startChapter2();
        }
      } else {
        showToast("THE HOUSE IS BEHIND YOU.");
      }
      return;
    }

    if (hideExitCooldown > 0) return;

    for (const spot of hideSpots){
      if (spot.occupied) continue;
      const d = Math.hypot(camera.position.x-spot.pos.x, camera.position.z-spot.pos.z);
      if (d < spot.radius){
        preHidePos = camera.position.clone();
        isHiding = true;
        hidingType = spot.type;
        hidingSpot = spot;
        spot.occupied = true;
        move.crouch = true;
        if (isTouch) btnCrouch.classList.add('active');

        if (spot.type === 'bed'){
          camera.position.set(spot.pos.x, 0.38, spot.pos.z);
          document.getElementById('bedOverlay').classList.remove('hidden');
          showToast("HIDING UNDER THE BED — STAY STILL!");
        } else {
          camera.position.set(spot.pos.x, 1.35, spot.pos.z);
          document.getElementById('wardrobeOverlay').classList.remove('hidden');
          showToast("HIDING INSIDE WARDROBE — STAY STILL!");
        }
        return;
      }
    }
  }

  // ---------- GAME STATE ----------
  let battery = 100;
  let startTime = 0;
  let gameOver = false;

  const overlay = document.getElementById('modeSelect');
  const settingsPanel = document.getElementById('settingsPanel');
  const menuStart = document.getElementById('menuStart');
  const menuSettings = document.getElementById('menuSettings');
  const menuExit = document.getElementById('menuExit');
  const settingsBack = document.getElementById('settingsBack');
  const modeBack = document.getElementById('modeBack');
  const settingVolume = document.getElementById('settingVolume');
  const settingSensitivity = document.getElementById('settingSensitivity');
  const settingBrightness = document.getElementById('settingBrightness');
  const settingVolumeVal = document.getElementById('settingVolumeVal');
  const settingSensitivityVal = document.getElementById('settingSensitivityVal');
  const settingBrightnessVal = document.getElementById('settingBrightnessVal');
  const startBtn = document.getElementById('startBtn');
  const controlsHint = document.getElementById('controlsHint');
  const chapterCard = document.getElementById('chapterCard');
  const jumpscare = document.getElementById('jumpscare');
  const jumpscareText = document.getElementById('jumpscareText');
  const jumpscareCanvas = document.getElementById('jumpscareCanvas');
  const winScreen = document.getElementById('win');
  const againBtn = document.getElementById('againBtn');
  const retryBtn = document.getElementById('retryBtn');
  const fearDiv = document.getElementById('fear');
  const breathFogDiv = document.getElementById('breathFog');
  const batteryFill = document.getElementById('battery-fill');
  const batteryPercent = document.getElementById('batteryPercent');
  const staminaFill = document.getElementById('stamina-fill');
  const staminaPercent = document.getElementById('staminaPercent');
  const roomLabelEl = document.getElementById('roomLabelText');
  const pickupPromptEl = document.getElementById('pickupPrompt');
  const objectiveEl = document.getElementById('objective');
  const objectiveTextEl = document.getElementById('objectiveText');
  const pageCountEl = document.getElementById('pageCount');

  let currentChapter = 1;
  let chapter2State = 'inactive';
  let chapter2StartedAt = 0;
  let chapter2ObjectiveComplete = false;
  let forestGroup = null;
  let forestBuilt = false;
  let forestCenter = null;
  const chapter2Objects = [];
  const chapter2Traps = [];
  let chapter2GeneratorOn = false;
  let chapter2LiftPowered = false;
  let chapter2LiftActivated = false;
  let chapter2DescendTimer = 0;
  let chapter2LockTimer = 0;
  let chapter2CatacombsPos = null;
  let stalkerActive = false;
  let stalkerGroup = null;
  let stalkerState = 'patrol';
  let stalkerTarget = null;
  let stalkerLastKnownPos = null;
  let stalkerHearPos = null;
  let stalkerHearTimer = 0;
  let stalkerVoiceTimer = 0;
  let chapter2GeneratorMesh = null;
  let chapter2ChapelConsoleMesh = null;
  let chapter2LiftGroup = null;
  let chapter2LiftBaseY = 0;
  let chapter2LiftT = 0;
  let chapter2StartPos = null;
  let chapter2WatchtowerPos = null;
  let chapter2ChapelPos = null;
  const stalkerPatrolPoints = [];
  let stalkerPatrolIdx = 0;
  const forestStaticBoxes = [];
  const chapter2TrapPool = [];
  let playerHealth = 100;
  let _stalkerPrevState = 'patrol';

  if (isTouch){
    controlsHint.textContent = 'Left joystick to move · drag anywhere else to look · buttons to run / crouch / flashlight / use';
  }

  function pickRandomSpawn(){
    const candidates = [];
    for (let r = 1; r < ROWS - 1; r++){
      for (let c = 1; c < COLS - 1; c++){
        if (MAP[r][c] !== 0) continue;
        const pos = cellCenter(r, c);
        if (!collides(pos.x, pos.z)) {
          candidates.push({ r, c, yaw: Math.random() * Math.PI * 2 });
        }
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)] || SAFE_SPAWN_LOCATIONS[0];
  }

  function startGame(){
    if (gameRunning || gameOver) return;
    document.body.classList.remove('menu-active');
    overlay.classList.add('hidden');
    chapterCard.classList.remove('hidden');
    setTimeout(() => { chapterCard.classList.add('hidden'); }, 4200);

    currentChapter = 1;
    chapter2State = 'inactive';
    chapter2StartedAt = 0;
    chapter2ObjectiveComplete = false;
    extraCollisionBoxes.length = 0;
    chapter2Objects.length = 0;
    chapter2Traps.length = 0;
    if (forestGroup) forestGroup.visible = false;
    scene.fog.density = 0.062;
    scene.background.set(0x020101);
    objectiveTextEl.textContent = 'PAGES';
    objectiveEl.classList.remove('unlocked');
    pageCountEl.textContent = '0 / 3';

    const spawn = pickRandomSpawn();
    currentSpawnCell = { r: spawn.r, c: spawn.c };
    randomizeCollectibles(currentSpawnCell);
    chainGroup.visible = true;
    exitDoorPivotL.rotation.y = 0;
    exitDoorPivotR.rotation.y = 0;
    exitLight.intensity = 0;

    ambientExtinguished = false;
    ambientLight.intensity = 0.42;
    lamps.forEach(l => {
      l.light.intensity = l.base;
      if (l.bulb) l.bulb.material.color.setHex(0xffdfaa);
    });
    candleLights.forEach(c => {
      c.light.intensity = c.baseIntensity;
      if (c.flame) c.flame.visible = true;
    });
    mirrors.forEach(m => m.triggered = false);
    doors.forEach(d => { d.slammed = false; d.creptOpen = false; d.lastDist = null; });

    resetEntity();
    hideSpots.forEach(s => { s.occupied = false; });
    document.getElementById('wardrobeOverlay').classList.add('hidden');
    document.getElementById('bedOverlay').classList.add('hidden');
    if (whisperDiv) whisperDiv.style.opacity = 0;
    fearDiv.style.opacity = 0;
    breathFogDiv.style.opacity = 0;

    camera.position.copy(cellCenter(spawn.r, spawn.c));
    camera.position.y = baseEyeHeight;
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
    yaw = spawn.yaw;

    battery = 100;
    playerHealth = 100;
    flashlightOn = true;
    stamina = 100;
    staminaExhausted = false;
    isHiding = false;
    hidingSpot = null;
    preHidePos = null;
    hideExitCooldown = 0;
    move.crouch = false;

    gameRunning = true;
    startTime = performance.now();
  }

  function setChapterCard(eyebrow, title, bodyHtml){
    const eb = chapterCard.querySelector('.eyebrow');
    const h1 = chapterCard.querySelector('h1');
    const p = chapterCard.querySelector('p');
    if (eb) eb.textContent = eyebrow;
    if (h1) h1.textContent = title;
    if (p) p.innerHTML = bodyHtml;
    chapterCard.classList.remove('hidden');
    setTimeout(() => { chapterCard.classList.add('hidden'); }, 5200);
  }

  function ensureChapter2World(){
    if (!forestBuilt){
      forestBuilt = true;
      forestCenter = exitPos.clone().add(new THREE.Vector3(CELL * 6.5, 0, -CELL * 22));
      forestGroup = new THREE.Group();
      forestGroup.visible = false;
      scene.add(forestGroup);

      const groundMat = new THREE.MeshStandardMaterial({ color: 0x0b1208, roughness: 1, metalness: 0 });
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 520, 1, 1), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(forestCenter.x, 0, forestCenter.z);
      ground.receiveShadow = true;
      forestGroup.add(ground);

      const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x1a120b, roughness: 1, metalness: 0 });
      const treeNeedleMat = new THREE.MeshStandardMaterial({ color: 0x0a1409, roughness: 0.95, metalness: 0 });

      for (let i = 0; i < 220; i++){
        const x = forestCenter.x + (Math.random() - 0.5) * 460;
        const z = forestCenter.z + (Math.random() - 0.5) * 460;
        if (Math.hypot(x - exitPos.x, z - exitPos.z) < 32) continue;

        const h = 5.8 + Math.random() * 6.5;
        const r = 0.22 + Math.random() * 0.22;

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r, h * 0.62, 6), treeTrunkMat);
        trunk.position.set(x, (h * 0.62) * 0.5, z);
        trunk.castShadow = true;
        trunk.receiveShadow = true;

        const needles = new THREE.Mesh(new THREE.ConeGeometry(r * 2.8, h, 7), treeNeedleMat);
        needles.position.set(x, h * 0.62 + (h * 0.5), z);
        needles.castShadow = true;
        needles.receiveShadow = true;

        forestGroup.add(trunk, needles);
        forestStaticBoxes.push({ minX: x - 0.8, maxX: x + 0.8, minZ: z - 0.8, maxZ: z + 0.8 });
      }

      const rockMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 1, metalness: 0 });
      for (let i = 0; i < 45; i++){
        const x = forestCenter.x + (Math.random() - 0.5) * 420;
        const z = forestCenter.z + (Math.random() - 0.5) * 420;
        if (Math.hypot(x - exitPos.x, z - exitPos.z) < 26) continue;
        const s = 0.6 + Math.random() * 1.2;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
        rock.position.set(x, s * 0.45, z);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true;
        rock.receiveShadow = true;
        forestGroup.add(rock);
        forestStaticBoxes.push({ minX: x - s, maxX: x + s, minZ: z - s, maxZ: z + s });
      }

      chapter2StartPos = exitPos.clone().add(new THREE.Vector3(0, 0, -CELL * 3.2));
      chapter2WatchtowerPos = forestCenter.clone().add(new THREE.Vector3(-CELL * 3.2, 0, -CELL * 18));
      chapter2ChapelPos = forestCenter.clone().add(new THREE.Vector3(CELL * 9, 0, -CELL * 32));

      const tower = new THREE.Group();
      tower.position.copy(chapter2WatchtowerPos);
      const towerMat = new THREE.MeshStandardMaterial({ color: 0x1a1511, roughness: 1, metalness: 0 });
      const legGeo = new THREE.CylinderGeometry(0.12, 0.18, 10, 6);
      const platformGeo = new THREE.BoxGeometry(5.2, 0.3, 5.2);
      const railsGeo = new THREE.BoxGeometry(5.2, 1.0, 0.2);
      const legOffsets = [ [-2.0, -2.0], [2.0, -2.0], [-2.0, 2.0], [2.0, 2.0] ];
      for (const [ox, oz] of legOffsets){
        const leg = new THREE.Mesh(legGeo, towerMat);
        leg.position.set(ox, 5, oz);
        leg.castShadow = true;
        leg.receiveShadow = true;
        tower.add(leg);
      }
      const platform = new THREE.Mesh(platformGeo, towerMat);
      platform.position.set(0, 10, 0);
      platform.castShadow = true;
      platform.receiveShadow = true;
      tower.add(platform);
      const railN = new THREE.Mesh(railsGeo, towerMat);
      railN.position.set(0, 10.65, -2.5);
      const railS = railN.clone(); railS.position.z = 2.5;
      const railE = railN.clone(); railE.rotation.y = Math.PI / 2; railE.position.set(2.5, 10.65, 0);
      const railW = railE.clone(); railW.position.x = -2.5;
      tower.add(railN, railS, railE, railW);
      forestGroup.add(tower);

      chapter2GeneratorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.9), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.85, metalness: 0.15 }));
      chapter2GeneratorMesh.position.copy(chapter2WatchtowerPos).add(new THREE.Vector3(2.8, 0.5, 3.4));
      chapter2GeneratorMesh.castShadow = true;
      chapter2GeneratorMesh.receiveShadow = true;
      forestGroup.add(chapter2GeneratorMesh);

      const chapel = new THREE.Group();
      chapel.position.copy(chapter2ChapelPos);
      const chapelMat = new THREE.MeshStandardMaterial({ color: 0x141214, roughness: 0.9, metalness: 0 });
      const chapelBody = new THREE.Mesh(new THREE.BoxGeometry(14, 6.8, 10), chapelMat);
      chapelBody.position.y = 3.4;
      chapelBody.castShadow = true;
      chapelBody.receiveShadow = true;
      const chapelRoof = new THREE.Mesh(new THREE.ConeGeometry(8.5, 3.6, 4), chapelMat);
      chapelRoof.rotation.y = Math.PI / 4;
      chapelRoof.position.y = 8.6;
      chapelRoof.castShadow = true;
      chapelRoof.receiveShadow = true;
      chapel.add(chapelBody, chapelRoof);
      forestGroup.add(chapel);

      chapter2ChapelConsoleMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x222533, roughness: 0.65, metalness: 0.25 }));
      chapter2ChapelConsoleMesh.position.copy(chapter2ChapelPos).add(new THREE.Vector3(0, 0.55, 6.2));
      chapter2ChapelConsoleMesh.castShadow = true;
      chapter2ChapelConsoleMesh.receiveShadow = true;
      forestGroup.add(chapter2ChapelConsoleMesh);

      chapter2LiftGroup = new THREE.Group();
      chapter2LiftGroup.position.copy(chapter2ChapelPos).add(new THREE.Vector3(0, 0, 0));
      chapter2LiftBaseY = 0;
      const liftMat = new THREE.MeshStandardMaterial({ color: 0x1a1818, roughness: 0.95, metalness: 0.25 });
      const liftFrameMat = new THREE.MeshStandardMaterial({ color: 0x4a1818, roughness: 0.75, metalness: 0.3, emissive: 0x200505, emissiveIntensity: 0.18 });
      const liftFloor = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 4.2), liftMat);
      liftFloor.position.y = 0.09;
      liftFloor.receiveShadow = true;
      liftFloor.castShadow = true;
      const liftRailN = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, 0.12), liftFrameMat);
      liftRailN.position.set(0, 0.78, -2.06);
      const liftRailS = liftRailN.clone(); liftRailS.position.z = 2.06;
      const liftRailE = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 4.2), liftFrameMat);
      liftRailE.position.set(2.06, 0.78, 0);
      const liftRailW = liftRailE.clone(); liftRailW.position.x = -2.06;
      const gateFront = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.9, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a1212, roughness: 0.9, metalness: 0.15, transparent:true, opacity: 0.6 }));
      gateFront.position.set(0, 1.03, 2.06);
      const gateBack = gateFront.clone(); gateBack.position.z = -2.06;
      const liftLight = new THREE.PointLight(0xff6830, 0.85, 14, 2);
      liftLight.position.set(0, 1.75, 0);
      chapter2LiftGroup.add(liftFloor, liftRailN, liftRailS, liftRailE, liftRailW, gateFront, gateBack, liftLight);
      forestGroup.add(chapter2LiftGroup);

      chapter2CatacombsPos = forestCenter.clone().add(new THREE.Vector3(CELL * 42, 0, CELL * 18));
      const catacombs = new THREE.Group();
      catacombs.position.copy(chapter2CatacombsPos);
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x090a0c, roughness: 1, metalness: 0 });
      const catFloor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, 1, 1), stoneMat);
      catFloor.rotation.x = -Math.PI / 2;
      catFloor.receiveShadow = true;
      catacombs.add(catFloor);

      const wallMat = new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 1, metalness: 0 });
      const wallN = new THREE.Mesh(new THREE.BoxGeometry(90, 6, 1.2), wallMat);
      wallN.position.set(0, 3, -45);
      const wallS = wallN.clone(); wallS.position.z = 45;
      const wallE = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6, 90), wallMat);
      wallE.position.set(45, 3, 0);
      const wallW = wallE.clone(); wallW.position.x = -45;
      catacombs.add(wallN, wallS, wallE, wallW);

      const supportMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 1, metalness: 0 });
      const supportGeo = new THREE.CylinderGeometry(0.55, 0.6, 6, 7);
      const supports = [ [-22, -22], [22, -22], [-22, 22], [22, 22] ];
      for (const [sx, sz] of supports){
        const col = new THREE.Mesh(supportGeo, supportMat);
        col.position.set(sx, 3, sz);
        col.castShadow = true;
        col.receiveShadow = true;
        catacombs.add(col);
      }

      const catLight = new THREE.PointLight(0x8aa0b8, 0.55, 65, 2.0);
      catLight.position.set(0, 3.2, 0);
      catacombs.add(catLight);

      forestGroup.add(catacombs);

      const cx = chapter2CatacombsPos.x, cz = chapter2CatacombsPos.z;
      forestStaticBoxes.push({ minX: cx - 45, maxX: cx + 45, minZ: cz - 46, maxZ: cz - 44 });
      forestStaticBoxes.push({ minX: cx - 45, maxX: cx + 45, minZ: cz + 44, maxZ: cz + 46 });
      forestStaticBoxes.push({ minX: cx + 44, maxX: cx + 46, minZ: cz - 45, maxZ: cz + 45 });
      forestStaticBoxes.push({ minX: cx - 46, maxX: cx - 44, minZ: cz - 45, maxZ: cz + 45 });

      stalkerGroup = new THREE.Group();
      const stalkerMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.95, metalness: 0, emissive: 0x060007, emissiveIntensity: 0.35 });
      const stalkerBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.2, 4, 8), stalkerMat);
      stalkerBody.position.y = 1.3;
      stalkerBody.castShadow = true;
      stalkerGroup.add(stalkerBody);
      const stalkerHead = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), stalkerMat);
      stalkerHead.position.set(0, 2.2, 0.1);
      stalkerHead.castShadow = true;
      stalkerGroup.add(stalkerHead);
      const stalkerEyeMat = new THREE.MeshBasicMaterial({ color: 0xff1a1a });
      const stalkerEye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), stalkerEyeMat);
      stalkerEye.position.set(0.12, 2.22, 0.32);
      const stalkerEye2 = stalkerEye.clone(); stalkerEye2.position.x = -0.12;
      stalkerGroup.add(stalkerEye, stalkerEye2);
      stalkerGroup.visible = false;
      forestGroup.add(stalkerGroup);

      if (chapter2TrapPool.length === 0){
        const trapMat = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.75, metalness: 0.35 });
        for (let i = 0; i < 8; i++){
          const x = forestCenter.x + (Math.random() - 0.5) * 260;
          const z = forestCenter.z + (Math.random() - 0.5) * 260;
          const trap = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 6, 14), trapMat);
          trap.rotation.x = Math.PI / 2;
          trap.position.set(x, 0.04, z);
          trap.receiveShadow = true;
          forestGroup.add(trap);
          chapter2TrapPool.push({ mesh: trap, pos: trap.position.clone(), sprung: false });
        }
      }
    }

    extraCollisionBoxes.length = 0;
    chapter2Objects.length = 0;
    chapter2Traps.length = 0;
    for (const b of forestStaticBoxes){
      addCollisionBox(b.minX, b.maxX, b.minZ, b.maxZ);
    }

    if (chapter2GeneratorMesh){
      addCollisionBox(chapter2GeneratorMesh.position.x - 0.8, chapter2GeneratorMesh.position.x + 0.8, chapter2GeneratorMesh.position.z - 0.7, chapter2GeneratorMesh.position.z + 0.7);
      chapter2Objects.push({
        id: 'generator',
        pos: chapter2GeneratorMesh.position.clone(),
        radius: 2.2,
        used: false,
        onInteract: () => {
          if (!chapter2GeneratorOn){
            chapter2GeneratorOn = true;
            showToast('GENERATOR ONLINE — POWER RESTORED');
            playBatteryChime();
            stalkerHearPos = chapter2GeneratorMesh.position.clone();
            stalkerHearTimer = 5.5;
            chapter2State = 'toChapel';
            pageCountEl.textContent = 'REACH THE CHAPEL';
            console.log('[Ch2] generator online -> state=toChapel');
          } else {
            showToast('THE GENERATOR IS ALREADY RUNNING.');
          }
        }
      });
    }

    if (chapter2ChapelConsoleMesh){
      addCollisionBox(chapter2ChapelConsoleMesh.position.x - 0.8, chapter2ChapelConsoleMesh.position.x + 0.8, chapter2ChapelConsoleMesh.position.z - 0.6, chapter2ChapelConsoleMesh.position.z + 0.6);
      chapter2Objects.push({
        id: 'chapelConsole',
        pos: chapter2ChapelConsoleMesh.position.clone(),
        radius: 2.2,
        used: false,
        onInteract: () => {
          if (!chapter2GeneratorOn){
            showToast('THE CONSOLE IS DEAD — FIND POWER');
            playClick();
            console.log('[Ch2] chapel console interact: no power.');
            return;
          }
          if (!chapter2LiftActivated){
            chapter2LiftActivated = true;
            chapter2State = 'descending';
            chapter2DescendTimer = 6.5;
            chapter2LockTimer = 6.5;
            pageCountEl.textContent = 'DESCENDING...';
            objectiveEl.classList.add('unlocked');
            if (chapter2LiftGroup){
              const lx = chapter2LiftGroup.position.x;
              const lz = chapter2LiftGroup.position.z;
              const safe = findSafePosition(lx, lz);
              camera.position.x = safe.x;
              camera.position.z = safe.z;
              camera.position.y = baseEyeHeight + 0.18;
              yaw = Math.PI;
              pitch = 0;
            }
            playDoorCreak();
            stalkerHearPos = chapter2ChapelConsoleMesh.position.clone();
            stalkerHearTimer = 4.5;
            if (mirrorFlashEl) mirrorFlashEl.classList.add('active');
            setTimeout(() => { if (mirrorFlashEl) mirrorFlashEl.classList.remove('active'); }, 260);
            console.log('[Ch2] chapel console -> lift activated. desc=6.5s');
          } else if (chapter2State === 'descending'){
            showToast('THE LIFT IS ALREADY DESCENDING.');
          }
        }
      });
    }

    for (const t of chapter2TrapPool){
      t.sprung = false;
      chapter2Traps.push(t);
    }
  }

  function startChapter2(){
    if (currentChapter !== 1) return;
    if (pagesCollected < 3) return;

    currentChapter = 2;
    chapter2State = 'toWatchtower';
    chapter2StartedAt = performance.now();
    chapter2ObjectiveComplete = false;
    chapter2GeneratorOn = false;
    chapter2LiftPowered = false;
    chapter2LiftActivated = false;
    chapter2DescendTimer = 0;
    chapter2LockTimer = 0;
    stalkerActive = true;
    stalkerState = 'patrol';
    stalkerTarget = null;
    stalkerLastKnownPos = null;
    stalkerHearPos = null;
    stalkerHearTimer = 0;
    stalkerVoiceTimer = 2.5;
    stalkerPatrolPoints.length = 0;
    stalkerPatrolIdx = 0;

    ensureChapter2World();
    forestGroup.visible = true;
    if (stalkerGroup){
      stalkerPatrolPoints.push(forestCenter.clone().add(new THREE.Vector3(-CELL * 10, 0, -CELL * 6)));
      stalkerPatrolPoints.push(forestCenter.clone().add(new THREE.Vector3(CELL * 6, 0, -CELL * 10)));
      stalkerPatrolPoints.push(forestCenter.clone().add(new THREE.Vector3(CELL * 14, 0, -CELL * 24)));
      stalkerPatrolPoints.push(forestCenter.clone().add(new THREE.Vector3(-CELL * 8, 0, -CELL * 22)));
      stalkerGroup.position.copy(stalkerPatrolPoints[0]);
      stalkerGroup.visible = true;
    }

    entityActive = false;
    entityGroup.visible = false;

    ambientExtinguished = true;
    ambientLight.intensity = 0.12;
    lamps.forEach(l => { l.light.intensity = 0; if (l.bulb) l.bulb.material.color.setHex(0x151210); });
    candleLights.forEach(c => { c.light.intensity = 0; if (c.flame) c.flame.visible = false; });

    scene.fog.color.setHex(0x020304);
    scene.fog.density = 0.038;
    scene.background.set(0x020304);

    objectiveTextEl.textContent = 'OBJECTIVE';
    objectiveEl.classList.remove('unlocked');
    pageCountEl.textContent = 'REACH THE WATCHTOWER';

    camera.position.copy(chapter2StartPos);
    camera.position.y = baseEyeHeight;
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
    yaw = 0;
    pitch = 0;
    trapPinTimer = 0;
    trapSlowTimer = 0;
    chapter2LiftT = 0;
    _stalkerPrevState = 'patrol';

    roomLabelEl.textContent = 'WHISPERING PINES';

    if (isNoteOpen){
      closePaperNote();
    }
    if (gameRunning && !gameOver && !isTouch){
      try {
        renderer.domElement.requestPointerLock();
      } catch(e){}
    }

    setChapterCard('CHAPTER TWO', 'THE WHISPERING PINES', 'Cold air knifes through the trees. Every step is swallowed by pine needles.<br><br>Something out here can <em>wear</em> your voice.');
    showToast('DAY 2 — THE WHISPERING PINES');
    playerHealth = 100;
    console.log('[Ch2] startChapter2 OK — state=toWatchtower, stalker=patrol, pos=', chapter2StartPos);
  }

  startBtn.addEventListener('click', () => {
    initAudio();
    applySettings();
    if (isTouch){
      touchControlsEl.classList.add('active');
      startGame();
    } else {
      renderer.domElement.requestPointerLock();
    }
  });

  function showMenuScreen(screen){
    loadingScreen.classList.add('hidden');
    mainMenu.classList.toggle('hidden', screen !== 'main');
    settingsPanel.classList.toggle('hidden', screen !== 'settings');
    overlay.classList.toggle('hidden', screen !== 'mode');
    document.body.classList.add('menu-active');
  }

  menuStart.addEventListener('click', () => {
    initAudio();
    showMenuScreen('mode');
  });
  menuSettings.addEventListener('click', () => {
    settingVolume.value = gameSettings.volume;
    settingSensitivity.value = gameSettings.sensitivity;
    settingBrightness.value = gameSettings.brightness;
    settingVolumeVal.textContent = gameSettings.volume + '%';
    settingSensitivityVal.textContent = gameSettings.sensitivity;
    settingBrightnessVal.textContent = gameSettings.brightness + '%';
    showMenuScreen('settings');
  });
  settingsBack.addEventListener('click', () => showMenuScreen('main'));
  modeBack.addEventListener('click', () => showMenuScreen('main'));
  menuExit.addEventListener('click', () => {
    if (window.close && !window.opener) window.close();
    showToast('Close the tab to leave the house.');
    loadStatus.textContent = 'The house does not let go easily...';
  });

  function bindSettingInput(input, key, valEl, suffix){
    input.addEventListener('input', () => {
      gameSettings[key] = parseInt(input.value, 10);
      if (valEl) valEl.textContent = gameSettings[key] + (suffix || '');
      saveSettings();
    });
  }
  bindSettingInput(settingVolume, 'volume', settingVolumeVal, '%');
  bindSettingInput(settingSensitivity, 'sensitivity', settingSensitivityVal, '');
  bindSettingInput(settingBrightness, 'brightness', settingBrightnessVal, '%');

  againBtn.addEventListener('click', () => location.reload());
  retryBtn.addEventListener('click', () => location.reload());

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    if (pointerLocked && !isNoteOpen) startGame();
  });

  // ---------- PROCEDURAL AUDIO DESIGN ----------
  let spatialOneShotPanner = null;
  let spatialOneShotBus = null;
  function ensureSpatialOneShot(){
    if (!audioCtx) return null;
    if (!spatialOneShotBus){
      spatialOneShotBus = audioCtx.createGain();
      spatialOneShotBus.gain.value = 1.0;
      spatialOneShotBus.connect(audioCtx.destination);
    }
    if (!spatialOneShotPanner){
      spatialOneShotPanner = audioCtx.createPanner();
      spatialOneShotPanner.panningModel = 'HRTF';
      spatialOneShotPanner.distanceModel = 'inverse';
      spatialOneShotPanner.refDistance = 1.5;
      spatialOneShotPanner.maxDistance = 30;
      spatialOneShotPanner.rolloffFactor = 1.4;
      spatialOneShotPanner.connect(spatialOneShotBus);
    }
    return spatialOneShotPanner;
  }

  function initAudio(){
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const vol = gameSettings.volume / 100;
    if (!stalkerVoiceBus){
      stalkerVoiceBus = audioCtx.createGain();
      stalkerVoiceBus.gain.value = 0.22 * vol;
      stalkerVoiceBus.connect(audioCtx.destination);
    }
    if (!stalkerPanner){
      stalkerPanner = audioCtx.createPanner();
      stalkerPanner.panningModel = 'HRTF';
      stalkerPanner.distanceModel = 'inverse';
      stalkerPanner.refDistance = 2.0;
      stalkerPanner.maxDistance = 42;
      stalkerPanner.rolloffFactor = 1.2;
      stalkerPanner.coneInnerAngle = 70;
      stalkerPanner.coneOuterAngle = 165;
      stalkerPanner.coneOuterGain = 0.35;
      stalkerPanner.connect(stalkerVoiceBus);
    }
    ensureSpatialOneShot();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = 38;
    gain.gain.value = 0.055 * vol;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start();
    droneGain = gain;

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine'; osc2.frequency.value = 52;
    gain2.gain.value = 0.022 * vol;
    osc2.connect(gain2); gain2.connect(audioCtx.destination);
    osc2.start();

    const osc3 = audioCtx.createOscillator();
    const gain3 = audioCtx.createGain();
    osc3.type = 'triangle'; osc3.frequency.value = 73;
    gain3.gain.value = 0.008 * vol;
    osc3.connect(gain3); gain3.connect(audioCtx.destination);
    osc3.start();
  }

  let _noiseBuf = null;
  function getNoiseBuffer(){
    if (!_noiseBuf && audioCtx){
      const len = Math.floor(audioCtx.sampleRate * 1.0);
      const b = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
      _noiseBuf = b;
    }
    return _noiseBuf;
  }

  function updateAudioListener(){
    if (!audioCtx) return;
    const L = audioCtx.listener;
    const p = camera.position;
    const f = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).normalize();
    L.positionX.value = p.x;
    L.positionY.value = p.y;
    L.positionZ.value = p.z;
    L.forwardX.value = f.x;
    L.forwardY.value = f.y;
    L.forwardZ.value = f.z;
    L.upX.value = 0;
    L.upY.value = 1;
    L.upZ.value = 0;
  }

  function playMimicWhisper(pos, strength){
    if (!audioCtx || !stalkerPanner) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const buf = getNoiseBuffer();
    if (!buf) return;

    stalkerPanner.positionX.value = pos.x;
    stalkerPanner.positionY.value = pos.y;
    stalkerPanner.positionZ.value = pos.z;

    const src = audioCtx.createBufferSource();
    src.buffer = buf;

    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 820 + Math.random() * 420;
    bp.Q.value = 7 + Math.random() * 6;

    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800 + Math.random() * 800;
    lp.Q.value = 0.7;

    const g = audioCtx.createGain();
    g.gain.value = 0.0001;
    const peak = (0.16 + strength * 0.22) * (gameSettings.volume / 100);
    g.gain.linearRampToValueAtTime(peak, audioCtx.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.65);

    src.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(stalkerPanner);

    src.start();
    src.stop(audioCtx.currentTime + 0.7);
  }

  function playTrapSnap(pos){
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const panner = ensureSpatialOneShot();
    if (panner && pos){
      panner.positionX.value = pos.x;
      panner.positionY.value = 0.05;
      panner.positionZ.value = pos.z;
    }
    const osc = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 2.2;

    osc.type = 'square';
    osc2.type = 'sawtooth';
    osc.frequency.value = 220;
    osc2.frequency.value = 110;
    osc.frequency.exponentialRampToValueAtTime(920, audioCtx.currentTime + 0.015);
    osc2.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.12);
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.30 * (gameSettings.volume / 100), audioCtx.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
    osc.connect(bp);
    osc2.connect(bp);
    bp.connect(gain);
    gain.connect(panner ? panner : audioCtx.destination);
    osc.start(); osc2.start();
    osc.stop(audioCtx.currentTime + 0.24);
    osc2.stop(audioCtx.currentTime + 0.24);
  }

  function playClick(){
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square'; osc.frequency.value = 850;
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime+0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.06);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime+0.07);
  }

  function playPageChime(){
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.35);
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.55);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  }

  function playBatteryChime(){
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [520, 780].forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = f;
      gain.gain.value = 0.0001;
      const t0 = audioCtx.currentTime + i*0.07;
      gain.gain.linearRampToValueAtTime(0.06, t0+0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0+0.4);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0+0.45);
    });
  }

  function playChainBreak(){
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.8);
    gain.gain.value = 0.3;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.85);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.9);
  }

  function playDoorCreak(){
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(85, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(145, audioCtx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.65);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.7);
  }

  function playDoorSlam(){
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(65, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.32);
  }

  function playMirrorStinger(){
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.55);
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.45, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.65);
  }

  function playFootstep(surface){
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    let type = 'triangle';
    let f = 115 + Math.random()*20;
    let peak = 0.04;
    let dur = 0.12;
    if (surface === 'tile'){
      f = 240; dur = 0.14;
    } else if (surface === 'needles'){
      type = 'sawtooth';
      f = 900 + Math.random()*300;
      peak = 0.028;
      dur = 0.08;
    } else if (surface === 'twig'){
      type = 'square';
      f = 220 + Math.random()*90;
      peak = 0.05;
      dur = 0.06;
    }
    osc.type = type;
    osc.frequency.value = f;
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(peak, audioCtx.currentTime+0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+dur);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime+dur+0.02);
  }

  function playStinger(){
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 110;
    osc.frequency.exponentialRampToValueAtTime(24, audioCtx.currentTime+0.75);
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.55, audioCtx.currentTime+0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.95);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime+1.0);
  }

  let lastBeat = 0;
  function heartbeat(intensity){
    if (!audioCtx) return;
    const now = performance.now();
    const interval = 900 - intensity*580;
    if (now - lastBeat < interval) return;
    lastBeat = now;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = 54;
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.16 + intensity*0.18, audioCtx.currentTime+0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.25);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime+0.3);
  }

  function renderJumpscareGraphic(){
    if (!jumpscareCanvas) return;
    jumpscareCanvas.width = window.innerWidth;
    jumpscareCanvas.height = window.innerHeight;
    const ctx = jumpscareCanvas.getContext('2d');
    const w = jumpscareCanvas.width, h = jumpscareCanvas.height;

    ctx.fillStyle = '#0a0000'; ctx.fillRect(0,0,w,h);

    const centerX = w/2, centerY = h/2;
    ctx.fillStyle = '#ff1111';
    ctx.beginPath();
    ctx.arc(centerX - 90, centerY - 40, 24, 0, Math.PI*2);
    ctx.arc(centerX + 90, centerY - 40, 24, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX - 90, centerY - 40, 8, 0, Math.PI*2);
    ctx.arc(centerX + 90, centerY - 40, 8, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = 'rgba(180, 10, 10, 0.6)';
    for (let i = 0; i < 40; i++) {
      ctx.fillRect(Math.random()*w, Math.random()*h, 3+Math.random()*6, 40+Math.random()*120);
    }
  }

  function triggerJumpscare(caughtWhileHiding){
    gameOver = true;
    gameRunning = false;
    if (document.pointerLockElement) document.exitPointerLock();
    touchControlsEl.classList.remove('active');
    if (isNoteOpen) closePaperNote();
    playStinger();
    renderJumpscareGraphic();
    jumpscareText.textContent = caughtWhileHiding
      ? "It dragged you from the shadows. Hiding only works if you hold perfectly still..."
      : "The thing in the house doesn't need to catch you. It just needs you to stop running.";
    jumpscare.classList.remove('hidden');
  }

  function triggerWin(){
    gameOver = true;
    gameRunning = false;
    if (document.pointerLockElement) document.exitPointerLock();
    touchControlsEl.classList.remove('active');
    if (isNoteOpen) closePaperNote();
    const secs = Math.floor((performance.now()-startTime)/1000);
    const eyebrow = winScreen.querySelector('.eyebrow');
    const title = winScreen.querySelector('h1');
    const teaser = winScreen.querySelector('.teaser');
    const winBody = document.getElementById('winBody');
    if (currentChapter === 2){
      if (eyebrow) eyebrow.textContent = 'CHAPTER TWO — DESCENDED';
      if (title) title.textContent = 'THE LIFT TOOK YOU DEEPER';
      document.getElementById('winTime').textContent = `Chapter Two cleared in ${secs} seconds.`;
      if (winBody){
        winBody.textContent = 'Rust groans and cables scream as the chapel lift drops you into a place that should not exist beneath the pines. The air tastes of wet stone and something older. Something down here has been whispering your name for a very long time.';
      }
      if (teaser) teaser.textContent = 'DAY 3: THE CATACOMBS — COMING SOON';
    } else {
      if (eyebrow) eyebrow.textContent = 'CHAPTER ONE — ESCAPED';
      if (title) title.textContent = 'YOU BROKE THE CHAINS';
      document.getElementById('winTime').textContent = `Chapter One survived in ${secs} seconds.`;
      if (winBody){
        winBody.textContent = 'You burst into the cold night air as the heavy oak doors slam shut behind you. Somewhere in the house, a low guttural screech echoes into the darkness...';
      }
      if (teaser) teaser.textContent = 'DAY 2: THE WHISPERING PINES — COMING SOON';
    }
    winScreen.classList.remove('hidden');
    console.log('[Win] triggerWin — chapter=' + currentChapter + ', secs=' + secs);
  }

  // ---------- STATIC NOISE CANVAS ----------
  const staticCanvas = document.getElementById('staticNoise');
  const staticCtx = staticCanvas.getContext('2d');
  let staticImgData = null;

  function resizeStatic(){
    staticCanvas.width = 160;
    staticCanvas.height = Math.round(160 * window.innerHeight/window.innerWidth);
    staticImgData = staticCtx.createImageData(staticCanvas.width, staticCanvas.height);
  }
  resizeStatic();

  function drawStatic(){
    if (!staticImgData) return;
    const data = staticImgData.data;
    for (let i=0; i<data.length; i+=4){
      const v = Math.random()*255;
      data[i]=v; data[i+1]=v; data[i+2]=v; data[i+3]=255;
    }
    staticCtx.putImageData(staticImgData,0,0);
  }

  // ---------- MAIN ANIMATION LOOP ----------
  const clock = new THREE.Clock();
  let lastRoomCheck = 0;
  let whisperTimer = 0;
  let staminaRegenDelay = 0;

  const _flashDir = new THREE.Vector3();
  const _lookTarget = new THREE.Vector3();
  let moteUpdateFrame = 0;

  function animate(){
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    // FIX: when the parchment note overlay is open, stop updating AND stop
    // re-rendering the 3D scene entirely. Previously the full render loop
    // (physics, entity AI, lighting flicker, particle updates, and a fresh
    // WebGL render) kept running every frame underneath the note's
    // fullscreen backdrop-filter blur. The browser has to recompute that
    // blur over a live-updating canvas 60x/sec, which is the real source
    // of the lag/stutter you feel right when a page is picked up. Since
    // nothing needs to visibly change while you're just reading the note,
    // we simply skip the frame — the last rendered frame stays on the
    // canvas and only needs to be blurred once.
    if (isNoteOpen){
      return;
    }

    if (clockPendulum) {
      clockPendulum.rotation.z = Math.sin(performance.now()*0.0025) * 0.25;
    }

    if (gameRunning && !gameOver){
      const cfg = DIFF[difficulty];

      if (hideExitCooldown > 0) hideExitCooldown -= dt;
      if (currentChapter === 2 && chapter2LockTimer > 0) chapter2LockTimer -= dt;

      if (!isNoteOpen){
        camera.rotation.order = 'YXZ';
        camera.rotation.y = yaw;
        camera.rotation.x = isHiding ? pitch*0.4 : pitch;
      }

      const crouchTarget = move.crouch ? 1 : 0;
      crouchLerp += (crouchTarget - crouchLerp) * Math.min(1, dt*8);
      const targetEyeHeight = baseEyeHeight - crouchLerp*0.55;

      if (trapPinTimer > 0) trapPinTimer -= dt;
      if (trapSlowTimer > 0) trapSlowTimer -= dt;

      let moving = false;
      let surfaceNoisy = false;
      let runWanted = false;

      if (!isHiding && !isNoteOpen && chapter2LockTimer <= 0 && trapPinTimer <= 0){
        const forwardInput = Math.max(-1, Math.min(1, ((move.f?1:0)-(move.b?1:0)) + joyVec.y));
        const strafeInput  = Math.max(-1, Math.min(1, ((move.r?1:0)-(move.l?1:0)) + joyVec.x));
        const inputMag = Math.min(1, Math.hypot(forwardInput, strafeInput));
        moving = inputMag > 0.05;

        runWanted = (move.run || touchRunActive) && !move.crouch && stamina > 2 && !staminaExhausted && trapSlowTimer <= 0;
        const crouchSlow = move.crouch ? 0.55 : 1.0;
        const hurtSlow = (trapSlowTimer > 0) ? 0.45 : 1.0;
        const speedBase = (runWanted ? 4.8 : 2.6) * crouchSlow * hurtSlow;
        const speed = speedBase * dt * inputMag;

        const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
        const dx = forwardInput*(-sinY) + strafeInput*(cosY);
        const dz = forwardInput*(-cosY) + strafeInput*(-sinY);
        const mag = Math.hypot(dx,dz) || 1;
        const stepX = (dx/mag)*speed;
        const stepZ = (dz/mag)*speed;

        const nx = camera.position.x + stepX;
        const nz = camera.position.z + stepZ;
        if (!collides(nx, camera.position.z)) camera.position.x = nx;
        if (!collides(camera.position.x, nz)) camera.position.z = nz;

        if (runWanted && moving){
          stamina -= dt*8.5;
          if (stamina <= 0){ stamina = 0; staminaExhausted = true; }
          staminaRegenDelay = 0.5;
        } else {
          staminaRegenDelay -= dt;
          if (staminaRegenDelay <= 0){
            stamina += dt*18;
            if (stamina > 100) stamina = 100;
            if (stamina > 30) staminaExhausted = false;
          }
        }

        if (moving){
          bobPhase += dt * (runWanted ? 11.5 : 6.5);
          footstepTimer -= dt;
          if (footstepTimer <= 0){
            footstepTimer = runWanted ? 0.27 : 0.44;
            if (currentChapter === 2){
              playFootstep(Math.random() < 0.25 ? 'twig' : 'needles');
            } else {
              const gr = Math.round(camera.position.z / CELL + ROWS/2);
              const gc = Math.round(camera.position.x / CELL + COLS/2);
              playFootstep(roomNameAt(gr,gc)==='BATHROOM' ? 'tile' : 'wood');
            }
            surfaceNoisy = runWanted;
            if (currentChapter === 2 && runWanted){
              stalkerHearPos = camera.position.clone();
              stalkerHearTimer = 2.2;
            }
          }
        } else {
          bobPhase *= 0.9;
        }
        camera.position.y = targetEyeHeight;
      } else if (trapPinTimer > 0){
        camera.position.y = targetEyeHeight - 0.08;
      } else {
        camera.position.y = targetEyeHeight - (isHiding ? 0.3 : 0);
      }

      {
        let targetFov = BASE_FOV;
        if (currentChapter === 2){
          if (trapSlowTimer > 0 || playerHealth < 35){
            targetFov = INJURED_FOV;
          } else if (runWanted && stamina > 8){
            targetFov = SPRINT_FOV;
          } else if (moving){
            targetFov = WALK_FOV + 1.5;
          } else {
            targetFov = WALK_FOV;
          }
        } else {
          targetFov = runWanted ? SPRINT_FOV : BASE_FOV;
        }
        camera.fov = camera.fov + (targetFov - camera.fov) * (1 - Math.exp(-dt * 9));
        camera.updateProjectionMatrix();
      }

      flashlight.position.set(camera.position.x, camera.position.y+0.2, camera.position.z);
      _flashDir.set(0, 0, -1).applyEuler(camera.rotation);
      flashTarget.position.set(camera.position.x+_flashDir.x, camera.position.y+_flashDir.y, camera.position.z+_flashDir.z);

      // Candle light flickering
      for (const c of candleLights){
        c.phase += dt * 15;
        c.light.intensity = c.baseIntensity + Math.sin(c.phase)*0.15 + (Math.random()-0.5)*0.1;
      }

      // Flashlight flicker on low battery
      flashFlickerT += dt;
      let flickerMod = 1;
      if (flashlightOn && battery < 15 && battery > 0){
        flickerMod = (Math.sin(flashFlickerT*40) > -0.3) ? 1 : 0.15;
      }
      flashlight.intensity = (flashlightOn && !isHiding && battery > 0) ? Math.max(0.15, (battery/100))*2.8*flickerMod : 0;

      if (flashlightOn && battery > 0 && !isHiding && !isNoteOpen){
        battery -= dt*1.0*cfg.batteryDrain;
        if (battery < 0) battery = 0;
        if (battery === 0) flashlightOn = false;
      }
      batteryFill.style.width = battery + '%';
      if (batteryPercent) batteryPercent.textContent = Math.round(battery) + '%';
      batteryFill.classList.toggle('low', battery < 20 && battery > 0);
      staminaFill.style.width = stamina + '%';
      if (staminaPercent) staminaPercent.textContent = Math.round(stamina) + '%';

      if (battery < 25){
        drawStatic();
        staticCanvas.style.opacity = Math.max(0.06, (0.25 - battery/100) * 0.9);
      } else {
        staticCanvas.style.opacity = 0.035;
        if (moteUpdateFrame % 12 === 0) drawStatic();
      }

      let breathAmt = 0;
      let fearAmt = 0;

      lastRoomCheck += dt;
      if (lastRoomCheck > 0.4){
        lastRoomCheck = 0;
        if (currentChapter === 1){
          const gr = Math.round(camera.position.z / CELL + ROWS/2);
          const gc = Math.round(camera.position.x / CELL + COLS/2);
          roomLabelEl.textContent = roomNameAt(gr, gc);
        } else if (currentChapter === 2){
          let lbl = 'WHISPERING PINES';
          if (chapter2State === 'descending' || chapter2State === 'catacombs' || chapter2State === 'arrived') lbl = 'CATACOMBS APPROACH';
          if (chapter2State === 'catacombs') lbl = 'CATACOMBS';
          if (chapter2WatchtowerPos && Math.hypot(camera.position.x-chapter2WatchtowerPos.x, camera.position.z-chapter2WatchtowerPos.z) < 18) lbl = 'WATCHTOWER';
          if (chapter2ChapelPos && Math.hypot(camera.position.x-chapter2ChapelPos.x, camera.position.z-chapter2ChapelPos.z) < 22) lbl = 'CHAPEL';
          if (roomLabelEl.textContent !== lbl){
            roomLabelEl.textContent = lbl;
            console.log('[Ch2] area label changed ->', lbl);
          }
        }
      }

      let nearPage = currentChapter === 2 ? false : (() => {
        for (const p of pages){
          if (p.collected) continue;
          if (camera.position.distanceTo(p.pos) < 2.6) return true;
        }
        return false;
      })();

      let nearBattery = currentChapter === 2 ? false : (() => {
        for (const b of batteries){
          if (b.collected) continue;
          if (camera.position.distanceTo(b.pos) < 2.6) return true;
        }
        return false;
      })();

      let nearExit = false;
      const distToExit = Math.hypot(camera.position.x-exitPos.x, camera.position.z-exitPos.z);
      if (distToExit < 2.8 && currentChapter === 1) nearExit = true;

      let nearChapter2 = null;
      if (currentChapter === 2){
        for (const o of chapter2Objects){
          const d = camera.position.distanceTo(o.pos);
          if (d < (o.radius || 2.2)){
            nearChapter2 = o;
            break;
          }
        }
      }

      let nearHide = false;
      let nearHideSpot = null;
      if (!isHiding && currentChapter === 1){
        for (const spot of hideSpots){
          if (spot.occupied) continue;
          const d = Math.hypot(camera.position.x-spot.pos.x, camera.position.z-spot.pos.z);
          if (d < spot.radius){
            nearHide = true;
            nearHideSpot = spot;
            break;
          }
        }
      }

      if (!isNoteOpen){
        if (nearChapter2){
          if (nearChapter2.id === 'generator'){
            pickupPromptEl.textContent = chapter2GeneratorOn ? '[ E ] GENERATOR (RUNNING)' : '[ E ] START GENERATOR';
          } else if (nearChapter2.id === 'chapelConsole'){
            if (!chapter2GeneratorOn){
              pickupPromptEl.textContent = '[ E ] LIFT CONSOLE (NO POWER)';
            } else if (chapter2LiftActivated){
              pickupPromptEl.textContent = '[ E ] LIFT DESCENDING...';
            } else if (chapter2State === 'toChapel'){
              pickupPromptEl.textContent = '[ E ] CALL LIFT';
            } else {
              pickupPromptEl.textContent = '[ E ] ACTIVATE LIFT';
            }
          } else {
            pickupPromptEl.textContent = '[ E ] INTERACT';
          }
          pickupPromptEl.classList.add('show');
        } else if (nearExit){
          pickupPromptEl.textContent = pagesCollected === 3 ? '[ E ] ESCAPE HOUSE' : '[ E ] EXIT (CHAINED SHUT)';
          pickupPromptEl.classList.add('show');
        } else if (nearPage) {
          pickupPromptEl.textContent = '[ E ] PICK UP PAGE';
          pickupPromptEl.classList.add('show');
        } else if (nearBattery) {
          pickupPromptEl.textContent = '[ E ] PICK UP BATTERY';
          pickupPromptEl.classList.add('show');
        } else {
          pickupPromptEl.classList.remove('show');
        }

        if (currentChapter === 2 && !nearChapter2){
          if (chapter2State === 'toWatchtower'){
            interactHintEl.textContent = 'HEAD NORTHWEST — REACH THE WATCHTOWER';
            interactHintEl.classList.add('show');
          } else if (chapter2State === 'toChapel'){
            interactHintEl.textContent = 'SOUTHWEST — HEAD TO THE CHAPEL';
            interactHintEl.classList.add('show');
          } else if (chapter2State === 'descending'){
            interactHintEl.textContent = 'STAND ON THE LIFT — IT IS DESCENDING';
            interactHintEl.classList.add('show');
          } else if (chapter2State === 'catacombs'){
            interactHintEl.classList.remove('show');
          } else {
            interactHintEl.classList.remove('show');
          }
        } else if (isHiding){
          interactHintEl.textContent = hidingType === 'bed' ? '[ E ] EXIT UNDER BED' : '[ E ] EXIT WARDROBE';
          interactHintEl.classList.add('show');
        } else if (nearHide){
          interactHintEl.textContent = nearHideSpot ? ('[ E ] HIDE (' + nearHideSpot.label + ')') : '[ E ] HIDE';
          interactHintEl.classList.add('show');
        } else {
          interactHintEl.classList.remove('show');
        }
      } else {
        pickupPromptEl.classList.remove('show');
        interactHintEl.classList.remove('show');
      }

      if (currentChapter === 2 && chapter2State === 'descending'){
        chapter2DescendTimer -= dt;
        const descDuration = 6.5;
        const t01 = 1 - Math.max(0, Math.min(1, chapter2DescendTimer / descDuration));
        chapter2LiftT = t01;
        if (chapter2LiftGroup){
          const eased = t01 < 0.5 ? 2*t01*t01 : 1 - Math.pow(-2*t01+2,2)/2;
          chapter2LiftGroup.position.y = -eased * 42;
          const shake = Math.sin(t01 * 60) * 0.02 * (1 - Math.abs(t01 - 0.5) * 1.6);
          chapter2LiftGroup.position.x = (chapter2ChapelPos.x || 0) + shake;
        }
        if (chapter2DescendTimer <= 0){
          if (mirrorFlashEl) mirrorFlashEl.classList.remove('active');
          chapter2State = 'arrived';
          chapter2LockTimer = 1.2;
          if (chapter2CatacombsPos){
            camera.position.copy(chapter2CatacombsPos);
            camera.position.y = targetEyeHeight;
          }
          scene.fog.color.setHex(0x020203);
          scene.fog.density = 0.065;
          scene.background.set(0x020203);
          ambientLight.intensity = 0.08;
          roomLabelEl.textContent = 'CATACOMBS';
          showToast('YOU HAVE ARRIVED IN THE CATACOMBS');
          console.log('[Ch2] Lift descent completed -> arrived catacombs.');
          setTimeout(() => {
            chapter2ObjectiveComplete = true;
            triggerWin();
          }, 1200);
        }
      } else if (chapter2LiftGroup && currentChapter === 2){
        chapter2LiftGroup.position.y = 0;
      }

      // Dust motes — update every other frame when flashlight is on
      moteUpdateFrame++;
      const updateMotes = (moteUpdateFrame % 2 === 0);
      if (updateMotes){
        const mp = motes.geometry.attributes.position.array;
        const mc = motes.geometry.attributes.color.array;
        const flashPos = flashlight.position;
        _flashDir.set(0, 0, -1).applyEuler(camera.rotation).normalize();
        const coneCos = Math.cos(flashlight.angle * 1.05);
        const flashActive = flashlightOn && battery > 0 && !isHiding;

        for (let i=0; i<MOTE_COUNT; i++){
          const s = moteSpeed[i];
          s.phase += dt*0.4;
          mp[i*3]   += Math.sin(s.phase)*0.0015;
          mp[i*3+1] += s.vy*dt*0.35;
          mp[i*3+2] += Math.cos(s.phase*0.7)*0.0015;
          if (mp[i*3+1] > WALL_H) mp[i*3+1] = 0.1;

          let r = 0.03, g = 0.025, b = 0.02;
          if (flashActive){
            const dx = mp[i*3] - flashPos.x;
            const dy = mp[i*3+1] - flashPos.y;
            const dz = mp[i*3+2] - flashPos.z;
            const dist = Math.hypot(dx, dy, dz);
            if (dist > 0.3 && dist < flashlight.distance){
              const dot = (dx*_flashDir.x + dy*_flashDir.y + dz*_flashDir.z) / dist;
              if (dot > coneCos){
                const distFactor = 1.0 - (dist / flashlight.distance);
                const coneFactor = (dot - coneCos) / (1.0 - coneCos);
                const intensity = Math.pow(distFactor * coneFactor, 0.6) * 1.5;
                r = Math.min(1.0, 0.08 + 0.85*intensity);
                g = Math.min(1.0, 0.06 + 0.7*intensity);
                b = Math.min(1.0, 0.04 + 0.45*intensity);
              }
            }
          }
          mc[i*3]   = r;
          mc[i*3+1] = g;
          mc[i*3+2] = b;
        }
        motes.geometry.attributes.position.needsUpdate = true;
        motes.geometry.attributes.color.needsUpdate = true;
      }

      drawTvStatic();

      // Dynamic door creak & slam mechanics
      for (const d of doors){
        const distP = Math.hypot(camera.position.x-d.center.x, camera.position.z-d.center.z);

        if (!d.creptOpen && distP < 4.2 && !d.slammed){
          d.creptOpen = true;
          d.openY = (Math.PI * 0.42) * (Math.random() < 0.5 ? 1 : -1);
          playDoorCreak();
        }

        if (d.lastDist && d.lastDist < 1.3 && distP >= 1.6 && !d.slammed && Math.random() < 0.22){
          d.slammed = true;
          playDoorSlam();
        }
        d.lastDist = distP;

        const wantOpen = distP < d.triggerR || (d.creptOpen && !d.slammed);
        const target = d.slammed ? d.closedY : (wantOpen ? d.openY : d.closedY);
        d.pivot.rotation.y += (target - d.pivot.rotation.y) * Math.min(1, dt * (d.slammed?12:2.5));
      }

      // Ambient lamp flickering & extinction
      if (ambientExtinguished){
        for (const l of lamps) l.light.intensity = 0;
        for (const c of candleLights) c.light.intensity = 0;
      } else {
        for (const l of lamps){
          l.flickerPhase += dt * (4 + Math.random()*8);
          if (l.willDie && l.deadUntil <= 0 && Math.random() < 0.003){
            l.deadUntil = 0.2 + Math.random()*1.0;
          }
          if (l.deadUntil > 0){
            l.deadUntil -= dt;
            l.light.intensity = l.base * 0.04;
          } else {
            const flicker = Math.sin(l.flickerPhase) > 0.9 ? 0.2 : (0.85 + Math.random()*0.15);
            l.light.intensity = l.base * flicker;
          }
        }
      }

      // Reflective mirror jumpscare check
      if (!isHiding && !isNoteOpen && !gameOver){
        const camPos = camera.position;
        const camDir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).normalize();

        for (const m of mirrors){
          if (m.triggered) continue;
          const distToMirror = camPos.distanceTo(m.pos);
          if (distToMirror < 2.5){
            const toMirror = m.pos.clone().sub(camPos).normalize();
            const lookDot = camDir.dot(toMirror);
            if (lookDot > 0.72){ // Player looking directly into mirror
              m.triggered = true;
              mirrorScareActive = true;
              mirrorScareTimer = 0.7;
              scareTriggerYaw = yaw;

              const behindPos = camPos.clone().sub(camDir.clone().multiplyScalar(1.2));
              behindPos.y = 0;
              mirrorWatcherMesh.position.copy(behindPos);
              mirrorWatcherMesh.lookAt(camPos.x, 1.5, camPos.z);
              mirrorWatcherMesh.visible = true;

              if (mirrorFlashEl) mirrorFlashEl.classList.add('active');
              playMirrorStinger();
              break;
            }
          }
        }

        if (mirrorScareActive){
          mirrorScareTimer -= dt;
          const yawDiff = Math.abs(yaw - scareTriggerYaw);
          if (mirrorScareTimer <= 0 || yawDiff > 0.45){
            mirrorScareActive = false;
            mirrorWatcherMesh.visible = false;
            if (mirrorFlashEl) mirrorFlashEl.classList.remove('active');
          }
        }
      }

      // ENTITY AI
      if (entityActive){
        const ex = entityGroup.position.x, ez = entityGroup.position.z;
        const distToPlayer = Math.hypot(camera.position.x-ex, camera.position.z-ez);

        const flashlightBoost = (flashlightOn && !isHiding) ? 1.4 : 1.0;
        const crouchStealth = move.crouch ? 0.55 : 1.0;
        const noiseBoost = (surfaceNoisy ? 1.3 : 1.0) * (moving && !move.crouch ? 1.15 : 1.0);
        const hearingRange = 9 * cfg.hearingMult * flashlightBoost * crouchStealth * noiseBoost;

        const canSense = !isHiding && distToPlayer < hearingRange;

        if (canSense && entityState !== 'hunting'){
          entityState = 'hunting';
          lastKnownPlayerPos = camera.position.clone();
          showWhisper();
          playStinger();
          for (const d of doors){
            if (Math.hypot(d.center.x-ex, d.center.z-ez) < CELL*2.2) d.slammed = true;
          }
        }

        if (entityState === 'hunting'){
          if (canSense) lastKnownPlayerPos = camera.position.clone();
          entityTargetPos = lastKnownPlayerPos;
          searchTimer = 4.5;
        } else if (entityState === 'searching'){
          searchTimer -= dt;
          if (searchTimer <= 0){
            entityState = 'patrol';
            for (const d of doors) d.slammed = false;
          }
        } else if (entityState === 'patrol'){
          const p = PATROL_POINTS[patrolIdx];
          entityTargetPos = p;
          if (Math.hypot(ex-p.x, ez-p.z) < 1.0){
            patrolIdx = (patrolIdx+1) % PATROL_POINTS.length;
          }
        }

        let curEntSpeed = 0;
        if (entityTargetPos){
          const toPx = entityTargetPos.x - ex, toPz = entityTargetPos.z - ez;
          const distTarget = Math.hypot(toPx, toPz);
          if (distTarget > 0.2){
            const nx2 = toPx/distTarget, nz2 = toPz/distTarget;
            const stateSpeedMult = entityState==='hunting' ? (isNoteOpen ? 0.4 : 1.35) : entityState==='searching' ? 0.9 : 0.6;
            const moveDist = entityBaseSpeed * cfg.entitySpeedMult * stateSpeedMult * dt;
            curEntSpeed = moveDist/dt;
            const tryX = ex + nx2*moveDist, tryZ = ez + nz2*moveDist;
            if (!collides(tryX, ez)) entityGroup.position.x = tryX;
            if (!collides(entityGroup.position.x, tryZ)) entityGroup.position.z = tryZ;
          } else if (entityState === 'hunting'){
            entityState = 'searching';
            searchTimer = 4.0;
          }
        }
        _lookTarget.set(camera.position.x, entityGroup.position.y + 2.2, camera.position.z);
        entityGroup.lookAt(_lookTarget);
        animateEntity(dt, curEntSpeed, distToPlayer, entityState === 'hunting');

        const dist = distToPlayer;
        const fAmt = isHiding ? Math.max(0, Math.min(0.5, 1 - dist/14)) : Math.max(0, Math.min(1, 1 - dist/14));
        fearAmt = Math.max(fearAmt, fAmt);
        breathAmt = Math.max(breathAmt, fAmt*0.6);

        whisperTimer -= dt;
        if (entityState==='hunting' && dist < 10 && whisperTimer <= 0){
          whisperTimer = 2.5 + Math.random()*2;
          showWhisper();
        }

        if (!isHiding && dist < 1.15 && !isNoteOpen){
          triggerJumpscare(false);
        } else if (isHiding && dist < 1.4 && moving && !isNoteOpen){
          triggerJumpscare(true);
        }
      }

      if (currentChapter === 2 && stalkerActive && stalkerGroup){
        const sx = stalkerGroup.position.x, sz = stalkerGroup.position.z;
        const px = camera.position.x, pz = camera.position.z;
        const distToPlayer = Math.hypot(px - sx, pz - sz);

        if (stalkerHearTimer > 0){
          stalkerHearTimer -= dt;
          if (stalkerHearTimer <= 0){
            stalkerHearTimer = 0;
            stalkerHearPos = null;
            if (stalkerState !== 'chase') stalkerState = 'patrol';
          } else if (stalkerState !== 'chase'){
            stalkerState = 'investigate';
          }
        }

        const flashBoost = (flashlightOn && !isHiding) ? 1.25 : 1.0;
        const crouchStealth = move.crouch ? 0.75 : 1.0;
        const noiseBoost = (surfaceNoisy ? 1.65 : (moving ? 1.05 : 0.7));
        const senseRange = 10.5 * cfg.hearingMult * flashBoost * noiseBoost * crouchStealth;
        const canSense = (chapter2LockTimer <= 0) && !isHiding && distToPlayer < senseRange;

        if (canSense){
          stalkerState = 'chase';
          stalkerLastKnownPos = camera.position.clone();
        } else if (stalkerState === 'chase' && stalkerLastKnownPos){
          if (distToPlayer < senseRange * 1.25){
            stalkerLastKnownPos = camera.position.clone();
          } else {
            const dlast = Math.hypot(px - stalkerLastKnownPos.x, pz - stalkerLastKnownPos.z);
            if (dlast > 18) stalkerLastKnownPos = null;
          }
        }

        let target = null;
        if (stalkerState === 'patrol'){
          target = stalkerPatrolPoints[stalkerPatrolIdx] || forestCenter;
        } else if (stalkerState === 'investigate'){
          target = stalkerHearPos || stalkerLastKnownPos || stalkerPatrolPoints[stalkerPatrolIdx] || forestCenter;
        } else if (stalkerState === 'chase'){
          target = stalkerLastKnownPos || camera.position;
        }

        if (target){
          const tx = target.x - sx, tz = target.z - sz;
          const d = Math.hypot(tx, tz);
          if (d > 0.2){
            const nx = tx / d, nz = tz / d;
            const baseSpeed = stalkerState === 'chase' ? 3.2 : stalkerState === 'investigate' ? 2.4 : 1.75;
            const spd = baseSpeed * cfg.entitySpeedMult;
            const step = spd * dt;
            const tryX = sx + nx * step, tryZ = sz + nz * step;
            if (!collides(tryX, sz)) stalkerGroup.position.x = tryX;
            if (!collides(stalkerGroup.position.x, tryZ)) stalkerGroup.position.z = tryZ;
          } else if (stalkerState === 'patrol' && stalkerPatrolPoints.length){
            stalkerPatrolIdx = (stalkerPatrolIdx + 1) % stalkerPatrolPoints.length;
          } else if (stalkerState === 'investigate' && stalkerHearTimer <= 0){
            stalkerState = 'patrol';
          }
        }

        if (stalkerState === 'chase'){
          _lookTarget.set(camera.position.x, stalkerGroup.position.y + 2.0, camera.position.z);
          stalkerGroup.lookAt(_lookTarget);
        } else if (target){
          _lookTarget.set(target.x, stalkerGroup.position.y + 1.6, target.z);
          stalkerGroup.lookAt(_lookTarget);
        }

        if (_stalkerPrevState !== stalkerState){
          console.log('[Ch2 Stalker FSM]', _stalkerPrevState, '->', stalkerState, '| distToPlayer=', Math.round(distToPlayer*10)/10, '| hear=', !!stalkerHearPos);
          _stalkerPrevState = stalkerState;
        }

        if (stalkerPanner){
          stalkerPanner.positionX.value = stalkerGroup.position.x;
          stalkerPanner.positionY.value = stalkerGroup.position.y + 1.6;
          stalkerPanner.positionZ.value = stalkerGroup.position.z;
          if (typeof stalkerPanner.orientationX !== 'undefined'){
            const fwd = new THREE.Vector3(0,0,-1).applyEuler(stalkerGroup.rotation).normalize();
            stalkerPanner.orientationX.value = fwd.x;
            stalkerPanner.orientationY.value = 0;
            stalkerPanner.orientationZ.value = fwd.z;
          }
        }

        stalkerVoiceTimer -= dt;
        if (stalkerVoiceTimer <= 0){
          const chasing = stalkerState === 'chase';
          stalkerVoiceTimer = chasing ? (2.2 + Math.random() * 2.0) : (4.6 + Math.random() * 4.0);
          const stalkerPos3 = new THREE.Vector3(stalkerGroup.position.x, stalkerGroup.position.y + 1.6, stalkerGroup.position.z);
          playMimicWhisper(stalkerPos3, chasing ? 0.95 : 0.55 + Math.random() * 0.35);
        }

        const stalkFear = Math.max(0, Math.min(0.95, 1 - distToPlayer / 14));
        fearAmt = Math.max(fearAmt, stalkFear);
        breathAmt = Math.max(breathAmt, stalkFear * 0.45);

        if (chapter2LockTimer <= 0 && distToPlayer < 1.25 && !isNoteOpen){
          triggerJumpscare(false);
        }
      }

      if (currentChapter === 2 && chapter2Traps.length && chapter2LockTimer <= 0){
        for (const t of chapter2Traps){
          if (t.sprung) continue;
          const d = Math.hypot(camera.position.x - t.pos.x, camera.position.z - t.pos.z);
          if (d < 0.85){
            t.sprung = true;
            if (t.mesh) {
              t.mesh.scale.set(1.25, 1.25, 1.25);
              t.mesh.rotation.z = 0.35;
            }
            const dmg = 34;
            playerHealth -= dmg;
            if (playerHealth < 0) playerHealth = 0;
            trapPinTimer = 1.1;
            trapSlowTimer = 8.0;
            stamina = Math.max(0, stamina - 30);
            showToast('BEAR TRAP — YOU\'RE BLEEDING (-' + dmg + ' HP)');
            playTrapSnap(t.pos);
            stalkerHearPos = t.pos.clone();
            stalkerHearTimer = 6.0;
            if (mirrorFlashEl) mirrorFlashEl.classList.add('active');
            setTimeout(() => { if (mirrorFlashEl) mirrorFlashEl.classList.remove('active'); }, 240);
            console.log('[Ch2] TRAP sprung at pos=', t.pos, 'playerHealth=', playerHealth);
            if (playerHealth <= 0){
              setTimeout(() => triggerJumpscare(false), 280);
            }
            break;
          }
        }
      }

      if (currentChapter === 2){
        fearAmt = Math.max(fearAmt, Math.max(0, Math.min(0.9, 1 - playerHealth / 100)));
      }

      updateAudioListener();
      fearDiv.style.opacity = fearAmt;
      breathFogDiv.style.opacity = breathAmt;
      heartbeat(fearAmt);
    }

    renderer.render(scene, camera);
  }
  animate();

  function handleResize(){
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeStatic();
  }
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => setTimeout(handleResize, 300));
})();
