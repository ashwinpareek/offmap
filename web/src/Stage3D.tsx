import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import gsap from "gsap";

export type Cube = { layer: number; out: boolean; rank: number; delay: number };

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const span = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const bounce = gsap.parseEase("bounce.out");

/** Slot j of a stepped pyramid whose bottom level is base x base cubes. */
function pyramid(j: number, base: number): [number, number, number] {
  let level = 0;
  let side = base;
  while (side > 1 && j >= side * side) {
    j -= side * side;
    side--;
    level++;
  }
  j = Math.min(j, side * side - 1);
  const off = (side - 1) / 2;
  return [((j % side) - off) * 1.06, 0.5 + level * 1.03, (Math.floor(j / side) - off) * 1.06];
}

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/**
 * The method as a lit 3D scene. Every answer is a cube. Surface answers stack into three
 * pyramids (the three approaches everyone gets), then shrink into a row at the back; each new
 * round drops in as its own pyramid and the rule-breakers are knocked off the top.
 */
export default function Stage3D({ cubes, layers, progress, ambient = false }: { cubes: Cube[]; layers: number; progress: MutableRefObject<number>; ambient?: boolean }) {
  const mount = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = mount.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.NoToneMapping; // page colours must match the canvas exactly

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    // studio reflections, so the cubes read as glazed objects and not flat colour
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.3;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8fbbc3, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-9, 20, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
    sun.shadow.radius = 6;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xff9ccd, 0.7);
    rim.position.set(12, 6, -10);
    scene.add(rim);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.2 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const geo = new RoundedBoxGeometry(1, 1, 1, 4, 0.13);
    const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.14 });
    const mesh = new THREE.InstancedMesh(geo, mat, cubes.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);

    // where each cube lives in each phase
    const rand = rng(7);
    const perRank = [0, 0, 0];
    const counts = [0, 1, 2].map((r) => cubes.filter((c) => c.layer === 0 && c.rank === r).length);
    const perLayer = new Map<number, number>();
    const rowIndex = new Map<number, number>();
    const rowTotal = new Map<number, number>();
    cubes.forEach((c) => !c.out && rowTotal.set(c.layer, (rowTotal.get(c.layer) ?? 0) + 1));
    const plan = cubes.map((c) => {
      const scatter = new THREE.Vector3((rand() - 0.5) * 34, 0.8 + rand() * 6.5, (rand() - 0.5) * 14);
      const spin = new THREE.Vector3(rand() * 6, rand() * 6, rand() * 6);
      let home: THREE.Vector3;
      let size = 1;
      if (c.layer === 0) {
        size = 0.86;
        if (c.rank < 3) {
          const base = counts[c.rank] > 30 ? 5 : counts[c.rank] > 14 ? 4 : 3;
          const [x, y, z] = pyramid(perRank[c.rank]++, base);
          home = new THREE.Vector3((c.rank - 1) * 8.2 + x * size, y * size, z * size);
        } else home = new THREE.Vector3((rand() - 0.5) * 30, 0.43, rand() < 0.5 ? 4.6 + rand() * 2.6 : -4.4 - rand() * 1.6);
      } else {
        size = 1.5;
        const j = perLayer.get(c.layer) ?? 0;
        perLayer.set(c.layer, j + 1);
        const [x, y, z] = pyramid(j, 4);
        home = new THREE.Vector3(x * size, y * size, z * size);
      }
      const i = rowIndex.get(c.layer) ?? 0;
      if (!c.out) rowIndex.set(c.layer, i + 1);
      const total = rowTotal.get(c.layer) ?? 1;
      const row = new THREE.Vector3(-14 + (i / Math.max(total - 1, 1)) * 28, 0.16, -10 - c.layer * 1.6);
      return { scatter, spin, home, row, size, side: home.x >= 0 ? 1 : -1 };
    });

    const INK = new THREE.Color("#0a2230");
    const FOAM = new THREE.Color("#eaf3f2");
    const PINK = new THREE.Color("#ff5fa8");
    const GLOW = new THREE.Color("#ff9ccd");
    const SHADES = [INK, new THREE.Color("#2f6d80"), new THREE.Color("#8fbbc3"), new THREE.Color("#c3d0ce")];
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const target = new THREE.Vector3();
    let w = 0;
    let h = 0;
    let seen = true;
    const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    const onPointer = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    // glow on the dark final stage only; skipped on small screens and in the hero
    const fancy = !ambient && window.matchMedia("(min-width: 900px)").matches;
    const TONES = ["#f1f4f2", "#d2e3e2", "#8fbbc3", "#0f3d52"].map((c) => new THREE.Color(c));
    const bg = new THREE.Color();
    let composer: EffectComposer | null = null;
    let bloom: UnrealBloomPass | null = null;
    if (fancy) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0, 0.7, 0.72);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      scene.background = bg;
    }

    const size = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      composer?.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    size();
    const io = new IntersectionObserver(([e]) => (seen = e.isIntersecting));
    io.observe(canvas);

    const frame = (time: number) => {
      if (!seen || !w) return;
      const p = progress.current;
      const seg = Math.min(layers - 1, Math.floor(p * layers));
      const t = p * layers - seg;
      const dark = seg >= 3 ? span(t, 0, 0.3) : 0;
      const last = seg === layers - 1;

      cubes.forEach((c, i) => {
        const pl = plan[i];
        let s = pl.size;
        dummy.rotation.set(0, 0, 0);
        if (c.layer > seg) s = 0;
        else if (c.layer < seg) {
          dummy.position.copy(pl.row);
          s = c.out ? 0 : 0.34;
        } else if (c.layer === 0) {
          const g = span(t, 0.06 + c.delay * 0.5, 0.42 + c.delay * 0.5);
          dummy.position.lerpVectors(pl.scatter, pl.home, g);
          dummy.position.y += Math.sin(time * 0.8 + i) * 0.35 * (1 - g);
          dummy.rotation.set(pl.spin.x * (1 - g) + time * 0.2 * (1 - g), pl.spin.y * (1 - g), pl.spin.z * (1 - g));
          const settle = span(t, 0.72 + c.delay * 0.25, 0.97);
          dummy.position.lerp(pl.row, settle);
          s = mix(pl.size, 0.34, settle);
        } else {
          const drop = bounce(Math.min(1, Math.max(0, (t - c.delay * 0.35) / 0.3)));
          dummy.position.copy(pl.home);
          dummy.position.y += (1 - drop) * 22;
          if (t < c.delay * 0.35) s = 0;
          if (c.out) {
            const f = span(t, 0.5 + c.delay * 0.2, 0.74 + c.delay * 0.2);
            dummy.position.x += pl.side * f * 13 + (pl.home.x === 0 ? f * 6 : 0);
            dummy.position.y += Math.sin(f * Math.PI) * 5 - f * pl.home.y * 0.9;
            dummy.rotation.set(f * 7, f * 3, f * 5);
            s *= 1 - span(t, 0.7, 0.8);
          } else if (!last) {
            const settle = span(t, 0.76 + c.delay * 0.2, 0.97);
            dummy.position.lerp(pl.row, settle);
            s = mix(s, s ? 0.34 : 0, settle);
          } else {
            const glow = span(t, 0.72, 0.92);
            dummy.position.x *= 1 + glow * 1.1;
            dummy.position.z *= 1 + glow * 1.1;
            dummy.position.y += glow * (1.2 + Math.sin(time * 1.4 + i) * 0.35);
            dummy.rotation.y = glow * (time * 0.5 + i);
            s *= 1 + glow * 0.12;
          }
        }
        dummy.scale.setScalar(Math.max(s, 0.0001));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        col.copy(c.layer === 0 ? SHADES[c.rank] : INK);
        if (c.layer === 0 ? c.rank === 0 : true) col.lerp(FOAM, dark);
        if (c.layer === seg && c.out) col.lerp(PINK, span(t, 0.36, 0.48));
        if (c.layer === seg && last && !c.out) col.lerp(GLOW, span(t, 0.72, 0.92));
        mesh.setColorAt(i, col);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      // camera: a slow orbit that pushes in on the last survivors
      const narrow = w / h < 0.9;
      const zoom = last ? span(t, 0.72, 0.95) : 0;
      pointer.sx += (pointer.x - pointer.sx) * 0.05;
      pointer.sy += (pointer.y - pointer.sy) * 0.05;
      const dist = ambient ? 34 : (narrow ? 96 : 40) - (seg > 0 ? (narrow ? 44 : 9) : 0) - zoom * (narrow ? 10 : 5);
      const angle = Math.sin(time * 0.15) * 0.07 + (ambient ? 0 : (p - 0.5) * 0.7) + pointer.sx * 0.1;
      camera.position.set(Math.sin(angle) * dist, (narrow ? 20 : 13) - zoom * 2 - pointer.sy * 1.6, Math.cos(angle) * dist);
      target.set(ambient ? -7 : 0, ambient ? 2.6 : (narrow ? 13 : 4.6) - (seg > 0 ? (narrow ? 5 : 0.8) : 0), 0);
      camera.lookAt(target);
      if (composer && bloom) {
        if (seg === 0) bg.copy(TONES[0]);
        else bg.lerpColors(TONES[Math.min(seg - 1, 3)], TONES[Math.min(seg, 3)], span(t, 0, 0.3));
        bloom.strength = dark * 0.55;
        composer.render();
      } else renderer.render(scene, camera);
    };
    gsap.ticker.add(frame);
    window.addEventListener("resize", size);
    return () => {
      gsap.ticker.remove(frame);
      window.removeEventListener("resize", size);
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      env.dispose();
      pmrem.dispose();
      composer?.dispose();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }, [cubes, layers, progress]);

  return <canvas ref={mount} className="seq-canvas stage3d" aria-hidden="true" />;
}
