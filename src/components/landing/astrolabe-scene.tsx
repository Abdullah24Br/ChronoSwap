"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// The landing hero: a brass astrolabe whose rete carries three people (A, B, C). Beads of time
// travel A → B → C → A along the barter cycle and change from brass (given) to turquoise
// (received) on the way. Colours mirror the design tokens in globals.css.
const BRASS = new THREE.Color("#d4a24c");
const BRASS_DARK = new THREE.Color("#8f6a2a");
const TURQUOISE = new THREE.Color("#35c9b8");
const PARCHMENT = new THREE.Color("#ece4d2");
const PLATE = new THREE.Color("#121a33");

export interface AstrolabeSceneProps {
  /** 0 at the top of the page, 1 once the hero has scrolled away (driven by GSAP / scroll). */
  progressRef: RefObject<number>;
}

export default function AstrolabeScene({ progressRef }: AstrolabeSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  // Stop rendering while the hero is off screen (battery, NFR-5).
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={host} className="absolute inset-0">
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 6.2], fov: 38 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        aria-hidden
      >
        <Environment />
        <ambientLight intensity={0.25} />
        <directionalLight position={[3, 4, 5]} intensity={1.6} color="#ffe6b8" />
        <directionalLight position={[-4, -2, 3]} intensity={0.5} color="#9fe8de" />
        <Astrolabe progressRef={progressRef} />
      </Canvas>
    </div>
  );
}

/** Soft studio reflections so the brass reads as metal (no external HDR file to download). */
function Environment() {
  const gl = useThree((state) => state.gl);
  const env = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return texture;
  }, [gl]);
  useEffect(() => () => env.dispose(), [env]);
  // Attached to the scene as scene.environment.
  return <primitive object={env} attach="environment" />;
}

function circlePoints(radius: number, cx = 0, cy = 0, segments = 128) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, 0));
  }
  return pts;
}

function EngravedCircle({ radius, cx = 0, cy = 0, opacity = 0.22, z = 0.012 }: { radius: number; cx?: number; cy?: number; opacity?: number; z?: number }) {
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(circlePoints(radius, cx, cy)), [radius, cx, cy]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineLoop geometry={geometry} position-z={z}>
      <lineBasicMaterial color={PARCHMENT} transparent opacity={opacity} />
    </lineLoop>
  );
}

/** Degree ticks engraved on the limb: every 5°, longer every 30°. */
function LimbTicks() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 72;
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const long = i % 6 === 0;
      const len = long ? 0.16 : 0.08;
      const r = 1.9 - len / 2;
      p.set(Math.cos(a) * r, Math.sin(a) * r, 0.03);
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
      s.set(len, long ? 0.018 : 0.01, 0.01);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={BRASS} metalness={1} roughness={0.3} />
    </instancedMesh>
  );
}

/** Positions of the three people on the rete's ecliptic ring (an equilateral triangle). */
const NODE_ANGLES = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];
const RETE_RADIUS = 1.05;
const RETE_CENTER = new THREE.Vector3(0, 0.12, 0);

function nodePosition(i: number, target = new THREE.Vector3()) {
  const a = NODE_ANGLES[i % 3];
  return target.set(RETE_CENTER.x + Math.cos(a) * RETE_RADIUS, RETE_CENTER.y + Math.sin(a) * RETE_RADIUS, 0.09);
}

const BEADS_PER_EDGE = 5;

// Scratch objects reused every frame (one hero on the page, so module scope is fine).
const tmp = {
  m: new THREE.Matrix4(),
  q: new THREE.Quaternion(),
  s: new THREE.Vector3(),
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  p: new THREE.Vector3(),
  c: new THREE.Color(),
};

/** Beads of time flowing A → B → C → A, brass when they leave, turquoise when they arrive. */
function TimeBeads() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const total = BEADS_PER_EDGE * 3;

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    for (let edge = 0; edge < 3; edge++) {
      nodePosition(edge, tmp.a);
      nodePosition(edge + 1, tmp.b);
      for (let k = 0; k < BEADS_PER_EDGE; k++) {
        const u = (t * 0.16 + k / BEADS_PER_EDGE) % 1;
        // Ease in and out so beads gather at each person, like hours changing hands.
        const e = u * u * (3 - 2 * u);
        tmp.p.lerpVectors(tmp.a, tmp.b, e);
        tmp.p.z += Math.sin(e * Math.PI) * 0.18; // a slight arc off the plate
        const size = 0.035 + Math.sin(e * Math.PI) * 0.03;
        tmp.s.setScalar(size);
        const i = edge * BEADS_PER_EDGE + k;
        mesh.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, tmp.s));
        mesh.setColorAt(i, tmp.c.copy(BRASS).lerp(TURQUOISE, e));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, total]}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Rete() {
  const ring = useMemo(() => new THREE.TorusGeometry(RETE_RADIUS, 0.018, 12, 160), []);
  const edges = useMemo(() => {
    const pts = [0, 1, 2, 0].map((i) => nodePosition(i).setZ(0.06));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  useEffect(
    () => () => {
      ring.dispose();
      edges.dispose();
    },
    [ring, edges],
  );

  // Star pointers ("flames") around the ring, as on a real rete.
  const pointers = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => {
        const a = (i / 11) * Math.PI * 2 + 0.31;
        const r = RETE_RADIUS + (i % 2 ? 0.28 : 0.42);
        return { a, r };
      }),
    [],
  );

  return (
    <group>
      <mesh geometry={ring} position={[RETE_CENTER.x, RETE_CENTER.y, 0.06]}>
        <meshStandardMaterial color={BRASS} metalness={1} roughness={0.28} />
      </mesh>
      <line>
        <primitive object={edges} attach="geometry" />
        <lineBasicMaterial color={PARCHMENT} transparent opacity={0.35} />
      </line>
      {pointers.map(({ a, r }, i) => (
        <mesh
          key={i}
          position={[RETE_CENTER.x + Math.cos(a) * r, RETE_CENTER.y + Math.sin(a) * r, 0.06]}
          rotation={[0, 0, a - Math.PI / 2]}
        >
          <coneGeometry args={[0.035, 0.22, 3]} />
          <meshStandardMaterial color={BRASS} metalness={1} roughness={0.32} />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => {
        const p = nodePosition(i);
        return (
          <group key={i} position={p}>
            <mesh>
              <sphereGeometry args={[0.085, 32, 32]} />
              <meshStandardMaterial color={BRASS} metalness={1} roughness={0.2} />
            </mesh>
            <mesh>
              <torusGeometry args={[0.13, 0.008, 8, 48]} />
              <meshBasicMaterial color={TURQUOISE} toneMapped={false} transparent opacity={0.8} />
            </mesh>
          </group>
        );
      })}
      <TimeBeads />
    </group>
  );
}

function Astrolabe({ progressRef }: AstrolabeSceneProps) {
  const root = useRef<THREE.Group>(null);
  const rete = useRef<THREE.Group>(null);
  const alidade = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const { size } = useThree();

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const mater = useMemo(() => new THREE.TorusGeometry(2, 0.075, 32, 200), []);
  const limb = useMemo(() => new THREE.RingGeometry(1.6, 1.93, 160), []);
  const plate = useMemo(() => new THREE.CircleGeometry(1.6, 128), []);
  useEffect(
    () => () => {
      mater.dispose();
      limb.dispose();
      plate.dispose();
    },
    [mater, limb, plate],
  );

  const almucantars = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({ r: 1.18 - i * 0.12, cy: 0.32 + i * 0.075 })),
    [],
  );

  const narrow = size.width < 520;

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const p = Math.min(Math.max(progressRef.current ?? 0, 0), 1);
    if (root.current) {
      // Tilted like an instrument on a desk; straightens and recedes as the page scrolls.
      const targetX = -0.42 + p * 0.42 + pointer.current.y * 0.08;
      const targetY = 0.32 - p * 0.32 + pointer.current.x * 0.12;
      root.current.rotation.x += (targetX - root.current.rotation.x) * Math.min(1, delta * 3);
      root.current.rotation.y += (targetY - root.current.rotation.y) * Math.min(1, delta * 3);
      const scale = (narrow ? 0.78 : 1) * (1 - p * 0.18);
      root.current.scale.setScalar(scale);
      root.current.position.y = Math.sin(t * 0.6) * 0.04 - p * 0.4;
    }
    if (rete.current) rete.current.rotation.z = t * 0.07; // the sky turns
    if (alidade.current) alidade.current.rotation.z = -t * 0.11;
  });

  return (
    <group ref={root}>
      <mesh geometry={mater}>
        <meshStandardMaterial color={BRASS} metalness={1} roughness={0.25} />
      </mesh>
      <mesh geometry={limb} position-z={0.005}>
        <meshStandardMaterial color={BRASS_DARK} metalness={0.9} roughness={0.45} side={THREE.DoubleSide} />
      </mesh>
      <LimbTicks />
      <mesh geometry={plate}>
        <meshStandardMaterial color={PLATE} metalness={0.35} roughness={0.75} />
      </mesh>
      {/* Engraved plate: tropics, equator, and the horizon's almucantars. */}
      <EngravedCircle radius={1.55} opacity={0.3} />
      <EngravedCircle radius={1.02} opacity={0.24} />
      <EngravedCircle radius={0.66} opacity={0.24} />
      {almucantars.map(({ r, cy }, i) => (
        <EngravedCircle key={i} radius={r} cy={cy} opacity={0.1 + (i % 3 === 0 ? 0.08 : 0)} />
      ))}
      <group ref={rete} position-z={0.02}>
        <Rete />
      </group>
      <group ref={alidade} position-z={0.16}>
        <mesh>
          <boxGeometry args={[3.7, 0.05, 0.02]} />
          <meshStandardMaterial color={BRASS} metalness={1} roughness={0.22} />
        </mesh>
        <mesh position-z={0.02}>
          <cylinderGeometry args={[0.07, 0.07, 0.06, 32]} />
          <meshStandardMaterial color={BRASS} metalness={1} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}
