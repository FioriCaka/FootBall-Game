import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.152.2/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071024);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;
controls.enableRotate = true;
controls.enableZoom = true;
controls.enabled = true; // allow mouse control

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
hemi.position.set(0, 2, 0);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(3, 4, 2);
scene.add(dir);

// ground / field baseline (world Y where feet should touch)
const groundY = 0;

// approximate foot height relative to runner root (matches createRunner foot Y)
const footHeight = 0.25;

// field dimensions (X width, Z length)
const fieldWidth = 10;
const fieldLength = 20;
// Absolute Y override for GLTF models; when set to a number, models' Y will be locked to this value
const MODEL_Y_OVERRIDE = -0.01;

// Runner (low-poly procedural person)
const runnerMaterial = new THREE.MeshStandardMaterial({ color: 0xffb86b, metalness: 0.1, roughness: 0.7 });

function createRunner(material) {
  const mat = material || runnerMaterial;
  const root = new THREE.Group();

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 0.2), mat);
  torso.position.y = 0.9;
  root.add(torso);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mat);
  head.position.set(0, 1.25, 0);
  root.add(head);

  // Arms (use pivot groups so rotation happens at shoulder)
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(0.25, 1.05, 0);
  const leftUpper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), mat);
  leftUpper.position.set(0, -0.175, 0);
  leftArmPivot.add(leftUpper);
  root.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(-0.25, 1.05, 0);
  const rightUpper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), mat);
  rightUpper.position.set(0, -0.175, 0);
  rightArmPivot.add(rightUpper);
  root.add(rightArmPivot);

  // Legs
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(0.12, 0.6, 0);
  const leftUpperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.14), mat);
  leftUpperLeg.position.set(0, -0.225, 0);
  leftLegPivot.add(leftUpperLeg);
  root.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(-0.12, 0.6, 0);
  const rightUpperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.14), mat);
  rightUpperLeg.position.set(0, -0.225, 0);
  rightLegPivot.add(rightUpperLeg);
  root.add(rightLegPivot);

  // small feet
  const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.28), mat);
  leftFoot.position.set(0.12, 0.25, 0.05);
  root.add(leftFoot);
  const rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.28), mat);
  rightFoot.position.set(-0.12, 0.25, 0.05);
  root.add(rightFoot);

  return {
    root,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    torso,
    head,
    leftFoot,
    rightFoot
  };
}

const runner = createRunner(runnerMaterial);
// place runner so feet rest on the field (root y offset accounts for footHeight)
runner.root.position.set(0, groundY - footHeight, -2.5); // start near center, facing +Z
scene.add(runner.root);

// Opponent (simple robot)
const opponentMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.05, roughness: 0.6 });
const opponent = createRunner(opponentMaterial);
// opponent feet on ground
opponent.root.position.set(0, groundY - footHeight, 2.5);
opponent.root.rotation.y = Math.PI; // face toward player initially
scene.add(opponent.root);

// AI state
let aiCooldown = 0; // seconds until next allowed kick
const aiSpeed = 1.0; // movement speed multiplier for AI

// GLTF models: load higher-fidelity characters and play their animations.
const gltfLoader = new GLTFLoader();
let mixers = [];
let playerModel = null;
let opponentModel = null;

function loadCharacter(url, onReady) {
  gltfLoader.load(url, (gltf) => {
    const model = gltf.scene;
    model.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  // make models slightly smaller to better fit the scene
  model.scale.set(0.3, 0.3, 0.3);
    scene.add(model);
  const mixer = new THREE.AnimationMixer(model);
  // compute model bbox to determine lowest point so we can place feet on the ground
  const box = new THREE.Box3().setFromObject(model);
  const minY = box.min.y;
  model.userData.modelMinY = minY;
  // default offset 0; can be adjusted later without debug UI
  model.userData.offsetY = (typeof model.userData.offsetY === 'number') ? model.userData.offsetY : 0;
  // position model; if override is set, use it; otherwise align so lowest point sits on groundY with offset
  const initialY = (typeof MODEL_Y_OVERRIDE === 'number')
    ? MODEL_Y_OVERRIDE
    : (groundY - minY + (model.userData.offsetY || 0));
  model.position.y = initialY;
    // build actions map for named clips
    const actions = {};
    if (gltf.animations && gltf.animations.length) {
      gltf.animations.forEach((clip) => {
        actions[clip.name] = mixer.clipAction(clip);
      });
      // prefer Idle or first
      let startName = Object.keys(actions).find(n => /idle/i.test(n)) || Object.keys(actions)[0];
      if (startName && actions[startName]) {
        actions[startName].play();
        model.userData.currentAction = startName;
      }
    }
    model.userData.mixer = mixer;
    model.userData.actions = actions;
    mixers.push(mixer);
    onReady(model, mixer);
  }, undefined, (err) => { console.warn('GLTF load error', err); });
}

// helper: find an action name in actions map by trying candidates (case-insensitive)
function findActionName(actions, candidates) {
  const keys = Object.keys(actions || {});
  for (let cand of candidates) {
    const re = new RegExp('^' + cand + '$', 'i');
    for (let k of keys) if (re.test(k)) return k;
  }
  // fallback: try contains
  for (let cand of candidates) {
    for (let k of keys) if (k.toLowerCase().includes(cand.toLowerCase())) return k;
  }
  return null;
}

// play a one-shot action (kick/jump) and revert to default after finished
function playOneShot(model, candidateNames) {
  if (!model || !model.userData || !model.userData.actions) return;
  const actions = model.userData.actions;
  const name = findActionName(actions, candidateNames);
  if (!name) return;
  const mixer = model.userData.mixer;
  const action = actions[name];
  action.reset();
  action.setLoop(THREE.LoopOnce, 0);
  action.clampWhenFinished = true;
  action.fadeIn(0.08);
  action.play();

  const onFinished = function (e) {
    if (e.action !== action) return;
    mixer.removeEventListener('finished', onFinished);
    // revert to idle/run depending on movement
    const defaultName = findActionName(actions, ['Run', 'Walk', 'Idle']) || Object.keys(actions)[0];
    if (defaultName && actions[defaultName]) {
      actions[defaultName].reset();
      actions[defaultName].fadeIn(0.12);
      actions[defaultName].play();
      model.userData.currentAction = defaultName;
    }
  };
  mixer.addEventListener('finished', onFinished);
}

// sample robot model from three.js examples (permissive demo asset)
const robotUrl = 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb';
loadCharacter(robotUrl, (model, mixer) => {
  // place on player
  playerModel = model;
  // align model X/Z with runner and place feet on ground using precomputed bbox minY
  playerModel.position.x = runner.root.position.x;
  playerModel.position.z = runner.root.position.z;
  if (playerModel.userData && typeof playerModel.userData.modelMinY === 'number') {
    playerModel.position.y = groundY - playerModel.userData.modelMinY + (playerModel.userData.offsetY || 0);
  } else {
    playerModel.position.y = runner.root.position.y;
  }
  playerModel.rotation.y = runner.root.rotation.y;
  // hide procedural runner visuals
  runner.root.visible = false;
});

loadCharacter(robotUrl, (model, mixer) => {
  opponentModel = model;
  opponentModel.position.x = opponent.root.position.x;
  opponentModel.position.z = opponent.root.position.z;
  if (opponentModel.userData && typeof opponentModel.userData.modelMinY === 'number') {
    opponentModel.position.y = groundY - opponentModel.userData.modelMinY + (opponentModel.userData.offsetY || 0);
  } else {
    opponentModel.position.y = opponent.root.position.y;
  }
  opponentModel.rotation.y = opponent.root.rotation.y;
  opponent.root.visible = false;
});

// Football field: green plane with simple white marking meshes
const planeGeo = new THREE.PlaneGeometry(fieldWidth, fieldLength);
const planeMat = new THREE.MeshStandardMaterial({ color: 0x1e7a1e, metalness: 0, roughness: 1 });
const plane = new THREE.Mesh(planeGeo, planeMat);
plane.rotation.x = -Math.PI / 2;
plane.position.y = groundY;
scene.add(plane);

// white line material (slightly emissive so it's visible)
const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.4 });
const lineHeight = 0.02;

// field border lines (thin boxes)
const halfW = fieldWidth / 2;
const halfL = fieldLength / 2;
// top border (positive Z)
const topBorder = new THREE.Mesh(new THREE.BoxGeometry(fieldWidth, lineHeight, 0.08), lineMat);
topBorder.position.set(0, groundY + 0.01, halfL);
scene.add(topBorder);
// bottom border (negative Z)
const bottomBorder = new THREE.Mesh(new THREE.BoxGeometry(fieldWidth, lineHeight, 0.08), lineMat);
bottomBorder.position.set(0, groundY + 0.01, -halfL);
scene.add(bottomBorder);
// left border (negative X)
const leftBorder = new THREE.Mesh(new THREE.BoxGeometry(0.08, lineHeight, fieldLength), lineMat);
leftBorder.position.set(-halfW, groundY + 0.01, 0);
scene.add(leftBorder);
// right border (positive X)
const rightBorder = new THREE.Mesh(new THREE.BoxGeometry(0.08, lineHeight, fieldLength), lineMat);
rightBorder.position.set(halfW, groundY + 0.01, 0);
scene.add(rightBorder);

// center line
const centerLine = new THREE.Mesh(new THREE.BoxGeometry(fieldWidth * 0.9, lineHeight, 0.06), lineMat);
centerLine.position.set(0, groundY + 0.01, 0);
scene.add(centerLine);

// center circle and spot
const centerCircleRadius = 3.0;
const centerCircle = new THREE.Mesh(
  new THREE.RingGeometry(centerCircleRadius - 0.03, centerCircleRadius + 0.03, 48),
  lineMat
);
centerCircle.rotation.x = -Math.PI / 2;
centerCircle.position.y = groundY + 0.011;
scene.add(centerCircle);
const centerSpot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), lineMat);
centerSpot.rotation.x = -Math.PI / 2;
centerSpot.position.y = groundY + 0.011;
scene.add(centerSpot);

// penalty boxes (simple rectangles near each goal)
const penDepth = 3.0; // depth from goal line
const penWidth = 6.0; // width of penalty box
// near goal penalty box (near = positive Z)
const penNear = new THREE.Mesh(new THREE.BoxGeometry(penWidth, lineHeight, 0.08), lineMat);
penNear.position.set(0, groundY + 0.01, halfL - penDepth);
scene.add(penNear);
const penNearBack = new THREE.Mesh(new THREE.BoxGeometry(penWidth, lineHeight, 0.08), lineMat);
penNearBack.position.set(0, groundY + 0.01, halfL);
scene.add(penNearBack);
const penNearLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, lineHeight, penDepth), lineMat);
penNearLeft.position.set(-penWidth / 2, groundY + 0.01, halfL - penDepth / 2);
scene.add(penNearLeft);
const penNearRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, lineHeight, penDepth), lineMat);
penNearRight.position.set(penWidth / 2, groundY + 0.01, halfL - penDepth / 2);
scene.add(penNearRight);

// far goal penalty box (far = negative Z)
const penFar = new THREE.Mesh(new THREE.BoxGeometry(penWidth, lineHeight, 0.08), lineMat);
penFar.position.set(0, groundY + 0.01, -halfL + penDepth);
scene.add(penFar);
const penFarBack = new THREE.Mesh(new THREE.BoxGeometry(penWidth, lineHeight, 0.08), lineMat);
penFarBack.position.set(0, groundY + 0.01, -halfL);
scene.add(penFarBack);
const penFarLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, lineHeight, penDepth), lineMat);
penFarLeft.position.set(-penWidth / 2, groundY + 0.01, -halfL + penDepth / 2);
scene.add(penFarLeft);
const penFarRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, lineHeight, penDepth), lineMat);
penFarRight.position.set(penWidth / 2, groundY + 0.01, -halfL + penDepth / 2);
scene.add(penFarRight);

// corner arcs
const cornerArcRadius = 0.6;
function addCornerArc(x, z, thetaStart) {
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(cornerArcRadius - 0.03, cornerArcRadius + 0.03, 24, 1, thetaStart, Math.PI / 2),
    lineMat
  );
  arc.rotation.x = -Math.PI / 2;
  arc.position.set(x, groundY + 0.011, z);
  scene.add(arc);
}
addCornerArc(-halfW, halfL, Math.PI * 1.5); // top-left
addCornerArc(halfW, halfL, Math.PI);       // top-right
addCornerArc(-halfW, -halfL, 0);           // bottom-left
addCornerArc(halfW, -halfL, Math.PI / 2);  // bottom-right

// corner flags
function addCornerFlag(x, z, faceOutDir) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 12), poleMat);
  pole.position.set(x, groundY + 0.5, z);
  scene.add(pole);
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xffd400, metalness: 0.1, roughness: 0.8 });
  const flag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.24, 3), flagMat);
  flag.position.set(x, groundY + 0.98, z);
  // orient the flag to face outward from the field
  flag.rotation.y = faceOutDir;
  scene.add(flag);
}
addCornerFlag(-halfW, halfL, Math.PI);        // top-left faces +X
addCornerFlag(halfW, halfL, 0);                // top-right faces -X
addCornerFlag(-halfW, -halfL, Math.PI);        // bottom-left faces +X
addCornerFlag(halfW, -halfL, 0);               // bottom-right faces -X

// simple goal nets as line grids behind each goal
function makeGrid(width, height, step, color=0xffffff) {
  const geo = new THREE.BufferGeometry();
  const lines = [];
  const halfWg = width / 2;
  // vertical lines
  for (let x = -halfWg; x <= halfWg + 1e-6; x += step) {
    lines.push(x, 0, 0, x, height, 0);
  }
  // horizontal lines
  for (let y = 0; y <= height + 1e-6; y += step) {
    lines.push(-halfWg, y, 0, halfWg, y, 0);
  }
  const pos = new Float32Array(lines);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color, opacity: 0.5, transparent: true });
  const mesh = new THREE.LineSegments(geo, mat);
  return mesh;
}
// (goal nets will be created after goal posts where goalWidthX/goalZ are defined)

// goal areas (6-yard boxes) and penalty spots/arcs
const gaDepth = 1.5;
const gaWidth = 3.0;
// near goal area (positive Z)
const gaNearFront = new THREE.Mesh(new THREE.BoxGeometry(gaWidth, lineHeight, 0.08), lineMat);
gaNearFront.position.set(0, groundY + 0.01, halfL - gaDepth);
scene.add(gaNearFront);
const gaNearLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, lineHeight, gaDepth), lineMat);
gaNearLeft.position.set(-gaWidth / 2, groundY + 0.01, halfL - gaDepth / 2);
scene.add(gaNearLeft);
const gaNearRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, lineHeight, gaDepth), lineMat);
gaNearRight.position.set(gaWidth / 2, groundY + 0.01, halfL - gaDepth / 2);
scene.add(gaNearRight);
// far goal area (negative Z)
const gaFarFront = new THREE.Mesh(new THREE.BoxGeometry(gaWidth, lineHeight, 0.08), lineMat);
gaFarFront.position.set(0, groundY + 0.01, -halfL + gaDepth);
scene.add(gaFarFront);
const gaFarLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, lineHeight, gaDepth), lineMat);
gaFarLeft.position.set(-gaWidth / 2, groundY + 0.01, -halfL + gaDepth / 2);
scene.add(gaFarLeft);
const gaFarRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, lineHeight, gaDepth), lineMat);
gaFarRight.position.set(gaWidth / 2, groundY + 0.01, -halfL + gaDepth / 2);
scene.add(gaFarRight);

// penalty spots
const penaltySpotDist = 2.0; // distance from goal line
const penaltySpotNear = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), lineMat);
penaltySpotNear.rotation.x = -Math.PI / 2;
penaltySpotNear.position.set(0, groundY + 0.011, halfL - penaltySpotDist);
scene.add(penaltySpotNear);
const penaltySpotFar = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), lineMat);
penaltySpotFar.rotation.x = -Math.PI / 2;
penaltySpotFar.position.set(0, groundY + 0.011, -halfL + penaltySpotDist);
scene.add(penaltySpotFar);

// penalty arcs (semi-circles outside the penalty box)
const penaltyArcRadius = 2.0;
const penArcNear = new THREE.Mesh(new THREE.RingGeometry(penaltyArcRadius - 0.03, penaltyArcRadius + 0.03, 48, 1, Math.PI, Math.PI), lineMat);
penArcNear.rotation.x = -Math.PI / 2;
penArcNear.position.set(0, groundY + 0.011, halfL - penaltySpotDist);
scene.add(penArcNear);
const penArcFar = new THREE.Mesh(new THREE.RingGeometry(penaltyArcRadius - 0.03, penaltyArcRadius + 0.03, 48, 1, 0, Math.PI), lineMat);
penArcFar.rotation.x = -Math.PI / 2;
penArcFar.position.set(0, groundY + 0.011, -halfL + penaltySpotDist);
scene.add(penArcFar);


// Goals (simple zones) — placed on Z axis so forward (W) moves toward the goal
const goalZ = 9.5;
const goalWidthX = 2.0;

// Goal posts (simple blocks)
function makePost(x, z) {
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.6 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), postMat);
  post.position.set(x, groundY + 0.6, z);
  scene.add(post);
  return post;
}

// near goal (positive Z) -- swapped so player spawns on correct side
const postA1 = makePost(-goalWidthX, goalZ);
const postA2 = makePost(goalWidthX, goalZ);
const crossA = new THREE.Mesh(new THREE.BoxGeometry(goalWidthX * 2, 0.12, 0.12), new THREE.MeshStandardMaterial({ color:0xffffff }));
crossA.position.set(0, groundY + 1.2, goalZ);
scene.add(crossA);

// far goal (negative Z)
const postB1 = makePost(-goalWidthX, -goalZ);
const postB2 = makePost(goalWidthX, -goalZ);
const crossB = new THREE.Mesh(new THREE.BoxGeometry(goalWidthX * 2, 0.12, 0.12), new THREE.MeshStandardMaterial({ color:0xffffff }));
crossB.position.set(0, groundY + 1.2, -goalZ);
scene.add(crossB);

// simple goal nets as line grids behind each goal (create after goalWidthX and goalZ exist)
const netWidth = goalWidthX * 2;
const netHeight = 1.2;
const netStep = 0.2;
// near goal net (slightly behind the goal line)
const netNear = makeGrid(netWidth, netHeight, netStep);
netNear.position.set(0, groundY, goalZ + 0.1);
scene.add(netNear);
// far goal net
const netFar = makeGrid(netWidth, netHeight, netStep);
netFar.position.set(0, groundY, -goalZ - 0.1);
// flip to face the field (no effect for lines but keep consistent)
netFar.rotation.y = Math.PI;
scene.add(netFar);

// Ball (football)
const ballRadius = 0.15;
const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.6 });
const ballGeo = new THREE.SphereGeometry(ballRadius, 16, 12);
const ball = new THREE.Mesh(ballGeo, ballMat);
// place ball on top of the field (slight offset to avoid z-fighting)
ball.position.set(0, ballRadius + groundY + 0.02, 0);
scene.add(ball);
let ballVel = new THREE.Vector3(0, 0, 0);
const ballFriction = 0.96; // per-frame multiplier (approx)
const gravity = -9.8; // small vertical gravity for pop

// (goal constants declared above)

// HUD / scoring elements
const scoreAEl = document.getElementById('scoreA');
const scoreBEl = document.getElementById('scoreB');
let scoreA = 0, scoreB = 0;
const resetBtn = document.getElementById('reset');
resetBtn.addEventListener('click', resetBall);

function resetBall() {
  ball.position.set(0, ballRadius + groundY + 0.02, 0);
  ballVel.set(0, 0, 0);
}

// Kick input (space) — charge mechanic
const kickChargeEl = document.getElementById('kickCharge');
let kickCharging = false;
let kickCharge = 0;
const maxKickCharge = 2.0; // seconds to max power

function doKick(charge) {
  // find nearest foot world position
  const footWorld = new THREE.Vector3();
  const leftPos = new THREE.Vector3();
  const rightPos = new THREE.Vector3();
  runner.leftFoot.getWorldPosition(leftPos);
  runner.rightFoot.getWorldPosition(rightPos);
  const dLeft = leftPos.distanceTo(ball.position);
  const dRight = rightPos.distanceTo(ball.position);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(runner.root.quaternion).setY(0).normalize();

  let usedFootPos = null;
  if (dLeft < dRight && dLeft < 0.9) usedFootPos = leftPos;
  else if (dRight < 0.9) usedFootPos = rightPos;

  const power = 4 + Math.min(maxKickCharge, charge) * 6; // base + charge

  if (usedFootPos) {
    footWorld.copy(usedFootPos);
    // direction from foot to ball with forward bias
    const dir = new THREE.Vector3().subVectors(ball.position, footWorld).setY(0);
    if (dir.lengthSq() < 0.0001) dir.copy(forward);
    dir.normalize();
    dir.add(forward.clone().multiplyScalar(0.25)).normalize();
    ballVel.add(dir.multiplyScalar(power));
    // add upward based on charge
    ballVel.y = Math.max(ballVel.y, 1.0 + charge * 2.0);
  } else {
    // not near foot: small poke in facing direction
    ballVel.add(forward.multiplyScalar(Math.max(1.0, power * 0.4)));
    ballVel.y = Math.max(ballVel.y, 0.6 + charge);
  }
}
// UI
const speedEl = document.getElementById('speed');
const wireBtn = document.getElementById('wire');
let speed = parseFloat(speedEl.value);
let wire = false;

speedEl.addEventListener('input', (e) => { speed = parseFloat(e.target.value); });
wireBtn.addEventListener('click', () => { wire = !wire; runnerMaterial.wireframe = wire; });

// Runner animation state
let runCycle = 0; // phase for limb animation
const runSpeedFactor = 6.0; // how fast the cycle progresses per 'speed'
const moveSpeed = 1.2; // world units per second at speed==1
// Input state for player control
const keys = {};
let autoRun = false; // when true, runner moves automatically; false => player control

window.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  // start charging on Space
  if (e.code === 'Space' && !kickCharging) {
    kickCharging = true;
    kickCharge = 0;
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
  // release kick
  if (e.code === 'Space' && kickCharging) {
    doKick(kickCharge);
    // play a kick animation on the player model if available
    playOneShot(playerModel, ['Kick', 'Punch', 'Jump', 'Tackle']);
    kickCharging = false;
    kickCharge = 0;
    if (kickChargeEl) kickChargeEl.style.width = '0%';
  }
});

// Animation
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // advance run cycle
  runCycle += dt * speed * runSpeedFactor;
  const legAmp = 1.0; // radians
  const armAmp = 0.9;

  // determine input vector (WASD or arrow keys)
  let inputX = 0, inputZ = 0;
  if (keys.ArrowLeft || keys.a || keys.A) inputX -= 1;
  if (keys.ArrowRight || keys.d || keys.D) inputX += 1;
  if (keys.ArrowUp || keys.w || keys.W) inputZ -= 1;
  if (keys.ArrowDown || keys.s || keys.S) inputZ += 1;

  const inputLen = Math.hypot(inputX, inputZ);
  const moving = inputLen > 0.001 || autoRun;

  // --- Opponent AI: simple chase the ball and kick when close ---
  if (aiCooldown > 0) aiCooldown -= dt;
  // vector from opponent to ball (XZ)
  const toBallAI = new THREE.Vector3().subVectors(ball.position, opponent.root.position).setY(0);
  const distAI = toBallAI.length();
  if (distAI > 0.05) {
    // move toward the ball with a consistent dt-based speed
    const dirAI = toBallAI.clone().normalize();
    const moveSpeedAI = aiSpeed * moveSpeed * 1.0; // scaling
    const moveAI = dirAI.clone().multiplyScalar(moveSpeedAI * dt);
    opponent.root.position.x += moveAI.x;
    opponent.root.position.z += moveAI.z;
    // rotate to face movement direction (smooth)
    const targetAngleAI = Math.atan2(dirAI.x, dirAI.z);
    let diffAI = targetAngleAI - opponent.root.rotation.y;
    while (diffAI > Math.PI) diffAI -= Math.PI * 2;
    while (diffAI < -Math.PI) diffAI += Math.PI * 2;
    opponent.root.rotation.y += diffAI * Math.min(1, dt * 6);
  }

  // AI kick: when close enough to the ball, kick it toward the opponent goal (the goal on the opposite Z side)
  const kickRange = 1.0;
  if (distAI < kickRange && aiCooldown <= 0) {
    // determine which goal is the opponent's target: kick toward the goal on the opposite side of the field
    const targetSign = (opponent.root.position.z < 0) ? 1 : -1; // if AI is on negative side, aim positive Z, else aim negative Z
    const aimDir = new THREE.Vector3(0, 0, targetSign).normalize();
    // add some randomization and power
    const power = 3.8 + Math.random() * 2.2;
    ballVel.add(aimDir.multiplyScalar(power));
    ballVel.y = Math.max(ballVel.y, 1.0 + Math.random() * 1.0);
    aiCooldown = 1.0 + Math.random() * 1.5;
  }

  // legs & arms: larger amplitude when moving, small idle movement otherwise
  const curLegAmp = moving ? legAmp : 0.18;
  const curArmAmp = moving ? armAmp : 0.15;

  runner.leftLegPivot.rotation.x = Math.sin(runCycle) * curLegAmp;
  runner.rightLegPivot.rotation.x = Math.sin(runCycle + Math.PI) * curLegAmp;
  runner.leftArmPivot.rotation.x = Math.sin(runCycle + Math.PI) * curArmAmp;
  runner.rightArmPivot.rotation.x = Math.sin(runCycle) * curArmAmp;

  // bob: keep base at ground (feet on field) and add a small vertical bob for motion
  const bob = Math.abs(Math.sin(runCycle)) * (moving ? 0.06 : 0.01);
  runner.root.position.y = (groundY - footHeight) + bob;

  // movement (player-controlled or auto)
  if (inputLen > 0.001) {
    // normalize input
    inputX /= inputLen; inputZ /= inputLen;
    // compute camera-relative directions on XZ plane
    const camForward = new THREE.Vector3();
    camera.getWorldDirection(camForward); // points where camera looks
    camForward.y = 0;
    camForward.normalize();
    const camRight = new THREE.Vector3();
    camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

  // movement vector: combine camera right and forward scaled by input
  // NOTE: flip the sign on the forward term so pressing 'forward' (inputZ = -1) moves in the camera-facing direction
    const moveVec = new THREE.Vector3();
    moveVec.addScaledVector(camRight, inputX);
    moveVec.addScaledVector(camForward, -inputZ);
    if (moveVec.lengthSq() > 0.0001) moveVec.normalize();

    // apply movement
    const moveDelta = moveVec.clone().multiplyScalar(moveSpeed * speed * dt);
    runner.root.position.add(moveDelta);

    // rotate to face movement direction (smooth)
    const targetAngle = Math.atan2(moveVec.x, moveVec.z);
    const cur = runner.root.rotation.y || 0;
    let diff = targetAngle - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    runner.root.rotation.y = cur + diff * Math.min(1, dt * 8);
  } else if (autoRun) {
    // simple auto-forward along +X when enabled
    runner.root.position.x += dt * moveSpeed * speed;
  }

  // clamp to plane bounds (-9.5..9.5)
  const limit = 9.5;
  runner.root.position.x = Math.max(-limit, Math.min(limit, runner.root.position.x));
  runner.root.position.z = Math.max(-limit, Math.min(limit, runner.root.position.z));

  // small foot tilt for contact
  runner.leftFoot.rotation.x = Math.max(0, -Math.sin(runCycle)) * 0.2;
  runner.rightFoot.rotation.x = Math.max(0, -Math.sin(runCycle + Math.PI)) * 0.2;

  // Ball physics
  // vertical
  if (ball.position.y > ballRadius + 0.001 || ballVel.y > 0.001) {
    ballVel.y += gravity * dt;
  }
  // integrate
  ball.position.x += ballVel.x * dt;
  ball.position.y += ballVel.y * dt;
  ball.position.z += ballVel.z * dt;

  // simple friction on horizontal plane
  const damp = Math.pow(ballFriction, dt * 60);
  ballVel.x *= damp;
  ballVel.z *= damp;
  // collision with runner (2D) - gentle push while in contact; kicks handled on Space release
  const toBall = new THREE.Vector3();
  toBall.subVectors(ball.position, runner.root.position);
  const dist2d = Math.hypot(toBall.x, toBall.z);
  const contactDist = 0.45 + ballRadius; // approx foot/torso reach
  if (dist2d < contactDist) {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(runner.root.quaternion).setY(0).normalize();
    const pushPower = 0.4 * speed + (moving ? 0.6 : 0.0);
    ballVel.x += forward.x * pushPower;
    ballVel.z += forward.z * pushPower;
  }

  // simple goal-post collisions (reflect off posts)
  const posts = [postA1, postA2, postB1, postB2];
  const postRadius = 0.08;
  for (let p of posts) {
    const pv = new THREE.Vector3();
    p.getWorldPosition(pv);
    const toPost = new THREE.Vector3().subVectors(ball.position, pv);
    const d = Math.hypot(toPost.x, toPost.z);
    if (d < postRadius + ballRadius) {
      // reflect horizontal velocity against post normal
      const normal = toPost.setY(0).normalize();
      const v = new THREE.Vector3(ballVel.x, 0, ballVel.z);
      v.reflect(normal).multiplyScalar(0.6);
      ballVel.x = v.x; ballVel.z = v.z;
      // push ball out of penetration
      ball.position.x = pv.x + normal.x * (postRadius + ballRadius + 0.01);
      ball.position.z = pv.z + normal.z * (postRadius + ballRadius + 0.01);
    }
  }

  // ground bounce with restitution
  const restitution = 0.25; // small bounce
  if (ball.position.y <= ballRadius + 0.001) {
    ball.position.y = ballRadius;
    if (ballVel.y < -0.1) {
      ballVel.y = -ballVel.y * restitution;
      // lose some horizontal speed on bounce
      ballVel.x *= 0.92;
      ballVel.z *= 0.92;
    } else {
      ballVel.y = 0;
    }
  }

  // kick charge HUD update
  if (kickCharging) {
    kickCharge = Math.min(maxKickCharge, kickCharge + dt);
    if (kickChargeEl) kickChargeEl.style.width = (kickCharge / maxKickCharge * 100) + '%';
  }

  // goal detection on Z axis (swapped: near goal at +goalZ now)
  if (ball.position.z > goalZ && Math.abs(ball.position.x) < goalWidthX) {
    // Home scores (near goal)
    scoreA += 1;
    scoreAEl.textContent = String(scoreA);
    resetBall();
  } else if (ball.position.z < -goalZ && Math.abs(ball.position.x) < goalWidthX) {
    // Away scores (far goal)
    scoreB += 1;
    scoreBEl.textContent = String(scoreB);
    resetBall();
  }

  // If the ball goes outside the field (not a goal), place it at the nearest corner inside the field
  // This makes throw-ins / out-of-bounds appear at the corner nearest to where it left
  const outLeft = ball.position.x < -halfW;
  const outRight = ball.position.x > halfW;
  const outTop = ball.position.z > halfL;
  const outBottom = ball.position.z < -halfL;
  if (outLeft || outRight || outTop || outBottom) {
    // if it was a goal we already handled above; here we handle other outs
    const inset = 0.6; // how far inside from the corner to place the ball
    // four corners (x,z)
    const corners = [
      new THREE.Vector3(-halfW + inset, ballRadius + groundY + 0.02, halfL - inset), // top-left
      new THREE.Vector3(halfW - inset, ballRadius + groundY + 0.02, halfL - inset),  // top-right
      new THREE.Vector3(-halfW + inset, ballRadius + groundY + 0.02, -halfL + inset), // bottom-left
      new THREE.Vector3(halfW - inset, ballRadius + groundY + 0.02, -halfL + inset)   // bottom-right
    ];
    // find nearest corner to where the ball left the field
    let best = corners[0];
    let bestD = ball.position.distanceToSquared(corners[0]);
    for (let i = 1; i < corners.length; i++) {
      const d = ball.position.distanceToSquared(corners[i]);
      if (d < bestD) { bestD = d; best = corners[i]; }
    }
    ball.position.copy(best);
    ballVel.set(0, 0, 0);
  }

  // Camera target follows the runner smoothly; OrbitControls retains user control of camera position
  const desiredTarget = new THREE.Vector3(runner.root.position.x, runner.root.position.y + 0.9, runner.root.position.z);
  controls.target.lerp(desiredTarget, Math.min(1, dt * 8));
  // update animation mixers
  if (mixers && mixers.length) mixers.forEach(m => m.update(dt));

  // sync player GLTF model to procedural root
  if (playerModel) {
    // smoothly follow X/Z; lock Y using override if set, else ground alignment with offset
    const baseY = (typeof MODEL_Y_OVERRIDE === 'number')
      ? MODEL_Y_OVERRIDE
      : ((playerModel.userData && typeof playerModel.userData.modelMinY === 'number')
        ? (groundY - playerModel.userData.modelMinY) + (playerModel.userData.offsetY || 0)
        : runner.root.position.y);
    const targetPos = new THREE.Vector3(runner.root.position.x, baseY, runner.root.position.z);
    // lock Y directly; lerp X/Z for smoothness
    playerModel.position.y = baseY;
    playerModel.position.x += (targetPos.x - playerModel.position.x) * Math.min(1, dt * 10);
    playerModel.position.z += (targetPos.z - playerModel.position.z) * Math.min(1, dt * 10);
    const ry = runner.root.rotation.y;
    playerModel.rotation.y += (ry - playerModel.rotation.y) * Math.min(1, dt * 8);
    // pick animation based on movement
    if (playerModel.userData && playerModel.userData.actions) {
      const actions = playerModel.userData.actions;
      const desired = findActionName(actions, moving ? ['Run', 'Walk'] : ['Idle', 'Stand']);
      const cur = playerModel.userData.currentAction;
      if (desired && desired !== cur) {
        if (cur && actions[cur]) actions[cur].fadeOut(0.12);
        actions[desired].reset(); actions[desired].fadeIn(0.18); actions[desired].play();
        playerModel.userData.currentAction = desired;
      }
    }
  }

  // sync opponent GLTF model and animation state
  if (opponentModel) {
    const baseY2 = (typeof MODEL_Y_OVERRIDE === 'number')
      ? MODEL_Y_OVERRIDE
      : ((opponentModel.userData && typeof opponentModel.userData.modelMinY === 'number')
        ? (groundY - opponentModel.userData.modelMinY) + (opponentModel.userData.offsetY || 0)
        : opponent.root.position.y);
    const targetPos2 = new THREE.Vector3(opponent.root.position.x, baseY2, opponent.root.position.z);
    opponentModel.position.y = baseY2;
    opponentModel.position.x += (targetPos2.x - opponentModel.position.x) * Math.min(1, dt * 10);
    opponentModel.position.z += (targetPos2.z - opponentModel.position.z) * Math.min(1, dt * 10);
    const ry2 = opponent.root.rotation.y;
    opponentModel.rotation.y += (ry2 - opponentModel.rotation.y) * Math.min(1, dt * 8);
    if (opponentModel.userData && opponentModel.userData.actions) {
      const actions = opponentModel.userData.actions;
      const oppMoving = typeof distAI === 'number' ? distAI > 0.25 : true;
      const desired = findActionName(actions, oppMoving ? ['Run', 'Walk'] : ['Idle', 'Stand']);
      const cur = opponentModel.userData.currentAction;
      if (desired && desired !== cur) {
        if (cur && actions[cur]) actions[cur].fadeOut(0.12);
        actions[desired].reset(); actions[desired].fadeIn(0.18); actions[desired].play();
        opponentModel.userData.currentAction = desired;
      }
    }
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

// Resize
window.addEventListener('resize', onWindowResize);
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// (Debug UI removed)

// Small keyboard shortcut: press H to randomize color
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') {
    runnerMaterial.color.setHex(Math.random() * 0xffffff);
  }
});
