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
  PCFSoftShadowMap,
  PerspectiveCamera,
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
  distance: 5.6,
  elevationDeg: 70,
  azimuthDeg: 22,
  fov: 40,
  lookAt: new Vector3(0, 0.3, 0),
};

function granite(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context for the counter');
  ctx.fillStyle = '#3a3e45';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const shade = Math.round(40 + Math.random() * 100);
    ctx.fillStyle = `rgba(${shade},${shade},${shade + 8},${(0.2 + Math.random() * 0.5).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(7, 7);
  texture.anisotropy = 4;
  return texture;
}

export function createViewer(gl: HTMLCanvasElement, pieces: Piece[]): Viewer {
  const renderer = new WebGLRenderer({ canvas: gl, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  scene.background = new Color(0x14171c);
  scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;

  const camera = new PerspectiveCamera(CAMERA.fov, 1, 0.05, 80);
  const elevation = (CAMERA.elevationDeg * Math.PI) / 180;
  const azimuth = (CAMERA.azimuthDeg * Math.PI) / 180;
  camera.position.set(
    CAMERA.lookAt.x + CAMERA.distance * Math.cos(elevation) * Math.sin(azimuth),
    CAMERA.lookAt.y + CAMERA.distance * Math.sin(elevation),
    CAMERA.lookAt.z + CAMERA.distance * Math.cos(elevation) * Math.cos(azimuth),
  );
  camera.lookAt(CAMERA.lookAt);

  // --- light --------------------------------------------------------------------
  scene.add(new HemisphereLight(0xdce6ff, 0x2a2b33, 0.55));
  const sun = new DirectionalLight(0xfff2de, 2.5);
  sun.position.set(2.6, 5.6, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 16;
  sun.shadow.camera.left = -3.6;
  sun.shadow.camera.right = 3.6;
  sun.shadow.camera.top = 3.6;
  sun.shadow.camera.bottom = -3.6;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // --- the counter, which doubles as the pail's floor ---------------------------
  const counter = new Mesh(
    new CylinderGeometry(counterSize / 2, counterSize / 2, U(20), 64),
    new MeshStandardMaterial({ map: granite(), roughness: 0.88, metalness: 0.02 }),
  );
  counter.position.y = -U(20) / 2;
  counter.receiveShadow = true;
  counter.name = 'counter';
  scene.add(counter);

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

  // --- the pieces ---------------------------------------------------------------
  for (const piece of pieces) {
    const mesh = new Mesh(
      pieceGeometry(piece.spec),
      new MeshStandardMaterial({ color: new Color(piece.spec.color), roughness: 0.45, metalness: 0 }),
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
    const meshes = candidates.map((piece) => piece.mesh);
    // The lid is in the list so anything behind it, including a piece that already
    // fell in, stays out of reach.
    for (const hit of raycaster.intersectObjects([...meshes, lid], false)) {
      if (hit.object === lid) return null;
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
    inspect,
    debug: { scene, sun },
  };
}
