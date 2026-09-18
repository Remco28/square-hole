import {
  ACESFilmicToneMapping,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  TorusGeometry,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Plane,
  PMREMGenerator,
  Raycaster,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CARRY_Y,
  LID_TOP_Y,
  LID_BOTTOM_Y,
  PIECE_T,
  PAIL_DEPTH,
  PAIL_OUTER_R,
  PAIL_WALL,
  U,
} from '../config';
import { counterSize, lidGeometry, pailGeometry, pieceGeometry } from '../geometry/bodies';
import type { Piece } from '../sim/world';

/**
 * Stylised rather than photo-real: a moulded white lid over a pale pail on a
 * speckled counter. The look exists to make the hole silhouettes read instantly,
 * because reading the silhouette is the entire game.
 */

export interface Viewer {
  gl: HTMLCanvasElement;
  render(): void;
  sync(pieces: Piece[]): void;
  /** The piece under the pointer, or null. */
  pick(pieces: Piece[], clientX: number, clientY: number): Piece | null;
  /** Where the pointer ray crosses the height a carried piece rides at. */
  carryPoint(clientX: number, clientY: number): { x: number; z: number } | null;
  /** Viewport pixels for a world point, so overlays and tools can find the scene. */
  project(point: { x: number; y: number; z: number }): { x: number; y: number };
  resize(): void;
  rotateView(steps: number): void;
  /** Escape hatch for live diagnosis from the console (`agent-browser eval`). */
  debug: { scene: Scene; sun: DirectionalLight };
  /** What the pointer ray hits: mesh name, world point, face normal. */
  inspect(clientX: number, clientY: number): {
    mesh: string;
    point: [number, number, number];
    normal: [number, number, number];
  } | null;
}

/**
 * The whole game is read off the lid's silhouettes, so the camera looks down at
 * them fairly squarely. The elevation is also a playability number: the pieces
 * rest on the counter around a pail that is roughly nine times their thickness,
 * so a shallow view puts the pail between the camera and the far pieces and they
 * cannot be picked up at all. At this angle the counter is visible all the way
 * round and every piece stays in arm's reach.
 */
const CAMERA = {
  distance: 6.2,
  elevationDeg: 74,
  azimuthDeg: 22,
  fov: 40,
  lookAt: new Vector3(0, 0.45, 0),
};

function plasticGrain(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context for the counter');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  let seed = 17;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 45000; i++) {
    const shade = Math.round(100 + random() * 56);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(random() * size, random() * size, 1, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.anisotropy = 4;
  return texture;
}

export function createViewer(gl: HTMLCanvasElement, pieces: Piece[]): Viewer {
  const renderer = new WebGLRenderer({ canvas: gl, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  scene.background = new Color(0x14171c);
  scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.65;

  const camera = new PerspectiveCamera(CAMERA.fov, 1, 0.5, 40);
  const elevation = (CAMERA.elevationDeg * Math.PI) / 180;
  const azimuth = (CAMERA.azimuthDeg * Math.PI) / 180;
  camera.position.set(
    CAMERA.lookAt.x + CAMERA.distance * Math.cos(elevation) * Math.sin(azimuth),
    CAMERA.lookAt.y + CAMERA.distance * Math.sin(elevation),
    CAMERA.lookAt.z + CAMERA.distance * Math.cos(elevation) * Math.cos(azimuth),
  );
  camera.lookAt(CAMERA.lookAt);
  let viewAngle = azimuth;
  const rotateView = (steps: number): void => {
    viewAngle += steps * Math.PI / 6;
    camera.position.x = CAMERA.lookAt.x + CAMERA.distance * Math.cos(elevation) * Math.sin(viewAngle);
    camera.position.z = CAMERA.lookAt.z + CAMERA.distance * Math.cos(elevation) * Math.cos(viewAngle);
    camera.lookAt(CAMERA.lookAt);
    camera.updateMatrixWorld();
  };

  // --- light --------------------------------------------------------------------
  scene.add(new HemisphereLight(0xeaf0ff, 0x817568, 1.1));
  const sun = new DirectionalLight(0xfff2de, 1.5);
  sun.position.set(-1.8, 7, 1.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 16;
  sun.shadow.camera.left = -3.6;
  sun.shadow.camera.right = 3.6;
  sun.shadow.camera.top = 3.6;
  sun.shadow.camera.bottom = -3.6;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.006;
  // PCFSoft ignores radius; regular PCF gives this light an actual soft edge.
  sun.shadow.radius = 5;
  scene.add(sun);

  // --- the counter, which doubles as the pail's floor ---------------------------
  const counter = new Mesh(
    new PlaneGeometry(counterSize * 4, counterSize * 4),
    new MeshStandardMaterial({ color: 0xaaa397, roughness: 0.96, metalness: 0 }),
  );
  counter.rotation.x = -Math.PI / 2;
  counter.position.y = -0.001;
  counter.receiveShadow = true;
  counter.name = 'counter';
  scene.add(counter);

  const grain = plasticGrain();
  const plastic = new MeshPhysicalMaterial({
    color: 0xf5f2e9,
    roughness: 0.38,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.5,
  });

  // --- the pail -----------------------------------------------------------------
  const pail = new Mesh(
    pailGeometry(),
    new MeshPhysicalMaterial({
      color: 0xe8e4d8,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.4,
      clearcoatRoughness: 0.6,
      bumpMap: grain,
      bumpScale: 0.001,
    }),
  );
  pail.castShadow = true;
  pail.receiveShadow = true;
  pail.name = 'pail';
  scene.add(pail);

  // A dark sleeve and floor inside, so the pail reads as a cavity rather than a tube.
  // The sleeve stands just inside the bore wall: coplanar with it, the two
  // surfaces z-fight and the bore shows striped bands through the lid's holes.
  const cavity = new MeshStandardMaterial({ color: 0x1d2027, roughness: 0.95, side: BackSide });
  const sleeve = new Mesh(
    new CylinderGeometry(
      U(PAIL_OUTER_R - PAIL_WALL - 1.5),
      U(PAIL_OUTER_R - PAIL_WALL - 1.5),
      U(PAIL_DEPTH - 2),
      48,
      1,
      true,
    ),
    cavity,
  );
  sleeve.position.y = U(PAIL_DEPTH) / 2;
  sleeve.name = 'sleeve';
  scene.add(sleeve);
  const pailFloor = new Mesh(new CircleGeometry(U(PAIL_OUTER_R - PAIL_WALL), 48), cavity.clone());
  (pailFloor.material as MeshStandardMaterial).side = DoubleSide;
  pailFloor.rotation.x = -Math.PI / 2;
  pailFloor.position.y = 0.004;
  pailFloor.name = 'pailFloor';
  scene.add(pailFloor);

  // --- the lid ------------------------------------------------------------------
  const lid = new Mesh(lidGeometry(), plastic);
  lid.position.y = LID_TOP_Y;
  lid.castShadow = true;
  lid.receiveShadow = true;
  lid.name = 'lid';
  scene.add(lid);

  // Snap-fit seam and foot ring; the rounded lid edge is part of its mesh.
  for (const [radius, tube, height] of [
    [PAIL_OUTER_R + 1, 1.2, PAIL_DEPTH - 1],
    [PAIL_OUTER_R - 0.5, 1.4, 3],
  ]) {
    const ring = new Mesh(new TorusGeometry(U(radius), U(tube), 12, 128), plastic);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = U(height);
    ring.castShadow = true;
    ring.receiveShadow = true;
    scene.add(ring);
  }

  // --- the pieces ---------------------------------------------------------------
  for (const piece of pieces) {
    const mesh = new Mesh(
      pieceGeometry(piece.spec),
      new MeshPhysicalMaterial({ color: new Color(piece.spec.color), roughness: 0.36, metalness: 0,
        clearcoat: 0.3, clearcoatRoughness: 0.4, bumpMap: grain, bumpScale: 0.0015 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `piece-${piece.spec.kind}`;
    piece.mesh = mesh;
    scene.add(mesh);
  }

  const sync = (list: Piece[]): void => {
    for (const piece of list) {
      const translation = piece.body.translation();
      const rotation = piece.body.rotation();
      piece.mesh.position.set(translation.x, translation.y, translation.z);
      piece.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      piece.mesh.updateMatrix();
    }
  };

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const carryPlane = new Plane(new Vector3(0, 1, 0), -CARRY_Y);
  const hitPoint = new Vector3();

  const toNdc = (clientX: number, clientY: number): Vector2 => {
    const rect = gl.getBoundingClientRect();
    return pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  };

  const pick = (candidates: Piece[], clientX: number, clientY: number): Piece | null => {
    sync(candidates);
    scene.updateMatrixWorld();
    raycaster.setFromCamera(toNdc(clientX, clientY), camera);
    const reachable = candidates.filter((piece) => {
      const p = piece.body.translation();
      return Math.hypot(p.x, p.z) > U(PAIL_OUTER_R) || p.y + U(PIECE_T) > LID_BOTTOM_Y;
    });
    const meshes = reachable.map((piece) => piece.mesh);
    // A block wedged in a bore stays selectable through the lip. Fully deposited
    // blocks are filtered out above so picking never reaches into the pail.
    for (const hit of raycaster.intersectObjects([...meshes, lid], false)) {
      if (hit.object === lid) continue;
      const piece = candidates.find((candidate) => candidate.mesh === hit.object);
      if (piece) return piece;
    }
    return null;
  };

  const carryPoint = (clientX: number, clientY: number): { x: number; z: number } | null => {
    scene.updateMatrixWorld();
    raycaster.setFromCamera(toNdc(clientX, clientY), camera);
    if (!raycaster.ray.intersectPlane(carryPlane, hitPoint)) return null;
    return { x: hitPoint.x, z: hitPoint.z };
  };

  const projected = new Vector3();
  const project = (point: { x: number; y: number; z: number }): { x: number; y: number } => {
    const rect = gl.getBoundingClientRect();
    projected.set(point.x, point.y, point.z).project(camera);
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    };
  };

  const faceNormal = new Vector3();
  const inspect = (clientX: number, clientY: number) => {
    sync([]);
    scene.updateMatrixWorld();
    raycaster.setFromCamera(toNdc(clientX, clientY), camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    const hit = hits[0];
    if (!hit) return null;
    const mesh = hit.object as Mesh;
    const geometry = mesh.geometry as BufferGeometry;
    if (hit.face) {
      faceNormal.set(hit.face.normal.x, hit.face.normal.y, hit.face.normal.z);
      if (geometry.hasAttribute('normal')) {
        // Interpolated vertex normal: what the shading actually uses.
        const n = geometry.getAttribute('normal');
        const { a, b, c } = { a: hit.face.a, b: hit.face.b, c: hit.face.c };
        faceNormal
          .set(0, 0, 0)
          .add(new Vector3(n.getX(a), n.getY(a), n.getZ(a)))
          .add(new Vector3(n.getX(b), n.getY(b), n.getZ(b)))
          .add(new Vector3(n.getX(c), n.getY(c), n.getZ(c)))
          .normalize();
      }
      faceNormal.transformDirection(mesh.matrixWorld);
    }
    const name: string = mesh.name || mesh.type;
    return {
      mesh: name,
      point: [hit.point.x, hit.point.y, hit.point.z].map((v) => +v.toFixed(3)) as [
        number,
        number,
        number,
      ],
      normal: [faceNormal.x, faceNormal.y, faceNormal.z].map((v) => +v.toFixed(3)) as [
        number,
        number,
        number,
      ],
    };
  };

  const resize = (): void => {
    const width = gl.clientWidth || 1;
    const height = gl.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  resize();
  return {
    gl,
    render: () => renderer.render(scene, camera),
    sync,
    pick,
    carryPoint,
    project,
    resize,
    rotateView,
    inspect,
    debug: { scene, sun },
  };
}
