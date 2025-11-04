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
runner.root.position.set(0, 0, -2.5); // start near center, facing +Z
scene.add(runner.root);

// Opponent (simple robot)
const opponentMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.05, roughness: 0.6 });
const opponent = createRunner(opponentMaterial);
opponent.root.position.set(0, 0, 2.5);
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
  playerModel.position.copy(runner.root.position);
  playerModel.rotation.y = runner.root.rotation.y;
  // hide procedural runner visuals
  runner.root.visible = false;
});

loadCharacter(robotUrl, (model, mixer) => {
  opponentModel = model;
  opponentModel.position.copy(opponent.root.position);
  opponentModel.rotation.y = opponent.root.rotation.y;
  opponent.root.visible = false;
});

// subtle ground/plane reflection
const planeGeo = new THREE.PlaneGeometry(20, 20);
const planeMat = new THREE.MeshStandardMaterial({ color: 0x06080a, metalness: 0, roughness: 1 });
const plane = new THREE.Mesh(planeGeo, planeMat);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -1.6;
scene.add(plane);


// Goals (simple zones) — placed on Z axis so forward (W) moves toward the goal
const goalZ = 9.5;
const goalWidthX = 2.0;

// Goal posts (simple blocks)
function makePost(x, z) {
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.6 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), postMat);
  post.position.set(x, 0.6, z);
  scene.add(post);
  return post;
}

// near goal (positive Z) -- swapped so player spawns on correct side
const postA1 = makePost(-goalWidthX, goalZ);
const postA2 = makePost(goalWidthX, goalZ);
const crossA = new THREE.Mesh(new THREE.BoxGeometry(goalWidthX * 2, 0.12, 0.12), new THREE.MeshStandardMaterial({ color:0xffffff }));
crossA.position.set(0, 1.2, goalZ);
scene.add(crossA);

// far goal (negative Z)
const postB1 = makePost(-goalWidthX, -goalZ);
const postB2 = makePost(goalWidthX, -goalZ);
const crossB = new THREE.Mesh(new THREE.BoxGeometry(goalWidthX * 2, 0.12, 0.12), new THREE.MeshStandardMaterial({ color:0xffffff }));
crossB.position.set(0, 1.2, -goalZ);
scene.add(crossB);

// Ball (football)
const ballRadius = 0.15;
const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.6 });
const ballGeo = new THREE.SphereGeometry(ballRadius, 16, 12);
const ball = new THREE.Mesh(ballGeo, ballMat);
ball.position.set(0, ballRadius + 0.02, 0);
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
  ball.position.set(0, ballRadius + 0.02, 0);
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
  if (distAI > 0.1) {
    const dirAI = toBallAI.clone().normalize();
    // move toward ball (avoid penetrating the ball)
    const moveAI = dirAI.multiplyScalar(aiSpeed * moveSpeed * Math.min(1, dt * 60) * 0.016);
    // simple steering: step towards ball
    opponent.root.position.x += moveAI.x;
    opponent.root.position.z += moveAI.z;
    // rotate to face movement
    const targetAngleAI = Math.atan2(moveAI.x, moveAI.z);
    let diffAI = targetAngleAI - opponent.root.rotation.y;
    while (diffAI > Math.PI) diffAI -= Math.PI * 2;
    while (diffAI < -Math.PI) diffAI += Math.PI * 2;
    opponent.root.rotation.y += diffAI * Math.min(1, dt * 6);
  }
  // AI kick if close enough and cooldown passed
  if (distAI < 0.9 && aiCooldown <= 0) {
    // kick toward the near goal (near goal is at positive Z)
    const aimDir = new THREE.Vector3(0, 0, 1); // towards near goal
    // if opponent is nearer the opposite side, flip aim
    if (opponent.root.position.z < 0) aimDir.set(0,0,-1);
    // apply impulse
    ballVel.add(aimDir.multiplyScalar(3.5 + Math.random() * 2.0));
    ballVel.y = 1.2 + Math.random() * 0.8;
    aiCooldown = 1.2 + Math.random() * 1.2;
  }

  // legs & arms: larger amplitude when moving, small idle movement otherwise
  const curLegAmp = moving ? legAmp : 0.18;
  const curArmAmp = moving ? armAmp : 0.15;

  runner.leftLegPivot.rotation.x = Math.sin(runCycle) * curLegAmp;
  runner.rightLegPivot.rotation.x = Math.sin(runCycle + Math.PI) * curLegAmp;
  runner.leftArmPivot.rotation.x = Math.sin(runCycle + Math.PI) * curArmAmp;
  runner.rightArmPivot.rotation.x = Math.sin(runCycle) * curArmAmp;

  // bob
  runner.root.position.y = Math.abs(Math.sin(runCycle)) * (moving ? 0.06 : 0.01);

  // movement (player-controlled or auto)
  if (inputLen > 0.001) {
    // normalize
    inputX /= inputLen; inputZ /= inputLen;
    const vx = inputX * moveSpeed * speed * dt;
    const vz = inputZ * moveSpeed * speed * dt;
    runner.root.position.x += vx;
    runner.root.position.z += vz;

    // rotate to face movement direction (smooth)
    const targetAngle = Math.atan2(vx, vz);
    const cur = runner.root.rotation.y || 0;
    // lerp angle (shortest)
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

  // Camera target follows the runner smoothly; OrbitControls retains user control of camera position
  const desiredTarget = new THREE.Vector3(runner.root.position.x, runner.root.position.y + 0.9, runner.root.position.z);
  controls.target.lerp(desiredTarget, Math.min(1, dt * 8));
  // update animation mixers
  if (mixers && mixers.length) mixers.forEach(m => m.update(dt));

  // sync player GLTF model to procedural root
  if (playerModel) {
    // smoothly follow position and rotation
    playerModel.position.lerp(runner.root.position, Math.min(1, dt * 10));
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
    opponentModel.position.lerp(opponent.root.position, Math.min(1, dt * 10));
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

// Small keyboard shortcut: press H to randomize color
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') {
    runnerMaterial.color.setHex(Math.random() * 0xffffff);
  }
});
