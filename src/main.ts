import { holeCentres } from './geometry/bodies';
import { createViewer, type Viewer } from './render/scene';
import { Grabber } from './sim/grab';
import { createSim, type Sim, type Substep } from './sim/world';
import { ImpactWatcher } from './audio/impacts';
import { SfxEngine } from './audio/sfx';
import { requestMic, stopMic } from './ui/mic';
import { MemeRecorder } from './ui/recorder';
import { startMirror } from './ui/webcam';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('gl');
const video = $<HTMLVideoElement>('cam');
const hint = $<HTMLParagraphElement>('hint');
const mirrorNote = $<HTMLParagraphElement>('mirror-note');
const recordButton = $<HTMLButtonElement>('record');
const resetButton = $<HTMLButtonElement>('reset');
const rotateLeft = $<HTMLButtonElement>('rotate-left');
const rotateRight = $<HTMLButtonElement>('rotate-right');

const recorder = new MemeRecorder();
const sfx = new SfxEngine();
const impacts = new ImpactWatcher();
let mirrorLive = false;

// Browsers only start audio from a real gesture. First touch unlocks the
// synth so gameplay clatters work even if the user never records.
const unlockAudio = (): void => {
  void sfx.unlock();
};
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

function download(url: string, extension: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = `square-hole-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${extension}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function recordingLabel(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

async function main(): Promise<void> {
  let sim: Sim;
  let viewer: Viewer;
  try {
    sim = await createSim();
    viewer = createViewer(canvas, sim.pieces);
  } catch (error) {
    hint.hidden = false;
    hint.textContent = 'This needs WebGL. Try a browser with hardware acceleration on.';
    console.error(error);
    return;
  }

  const grabber = new Grabber({
    element: canvas,
    pick: (x, y) => viewer.pick(sim.pieces, x, y),
    atY: (x, y, height) => viewer.pointAt(x, y, height),
    onChange: (piece) => {
      canvas.dataset.holding = piece ? 'true' : 'false';
      if (piece) hint.hidden = true;
    },
  });

  // The hand runs inside the fixed step so a carried piece follows the pointer
  // exactly, even on the step anything else is moving underneath it.
  const drivers: Substep = {
    before(dt) {
      grabber.before(dt);
    },
  };

  // --- controls ---------------------------------------------------------------
  const rotate = (steps: number) => () => {
    grabber.drop();
    viewer.rotateView(steps);
  };
  rotateLeft.addEventListener('click', rotate(-1));
  rotateRight.addEventListener('click', rotate(1));

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.key === 'q' || event.key === 'Q' || event.key === 'ArrowLeft') grabber.rotateSteps(-1);
    if (event.key === 'e' || event.key === 'E' || event.key === 'ArrowRight') grabber.rotateSteps(1);
    if (event.key === 'Escape') grabber.drop();
  });

  resetButton.addEventListener('click', () => {
    grabber.drop();
    sim.reset();
  });

  // --- recording --------------------------------------------------------------
  if (!recorder.supported) {
    recordButton.disabled = true;
    recordButton.textContent = 'No recorder';
    recordButton.title = 'This browser cannot record a canvas stream.';
  }
  recorder.onFinished(({ url, extension }) => {
    recordButton.disabled = false;
    download(url, extension);
    recordButton.dataset.saved = 'true';
    recordButton.textContent = 'Saved';
    window.setTimeout(() => {
      if (recorder.recording) return;
      recordButton.dataset.saved = 'false';
      recordButton.textContent = 'Record';
    }, 2500);
  });
  recordButton.addEventListener('click', () => {
    void (async () => {
      if (recorder.recording) {
        recordButton.disabled = true;
        recorder.stop();
        sfx.detachMic();
        stopMic();
        recorder.clearAudio();
        recordButton.dataset.recording = 'false';
        recordButton.textContent = 'Saving…';
        return;
      }
      recordButton.disabled = true;
      recordButton.dataset.saved = 'false';
      recordButton.textContent = 'Starting…';
      try {
      // A click is a gesture, so the synth can start here if it hasn't yet.
      await sfx.unlock();
      const mic = await requestMic();
      if (sfx.ready) {
        // Game + mic arrive as one mixed track; never monitor the mic locally.
        sfx.attachMic(mic);
        recorder.attachAudio([sfx.recordTrack]);
      } else if (mic) {
        // Synth unavailable: the reaction still gets recorded, video-only for clicks.
        recorder.attachAudio(mic.getAudioTracks());
      }
      if (recorder.start()) {
        recordButton.dataset.recording = 'true';
        recordButton.textContent = '0:00';
      } else {
        sfx.detachMic();
        stopMic();
        recorder.clearAudio();
        recordButton.textContent = 'Record';
      }
      } catch (error) {
        sfx.detachMic();
        stopMic();
        recorder.clearAudio();
        recordButton.textContent = 'Try again';
        console.error('Recording could not start', error);
      } finally {
        recordButton.disabled = false;
      }
    })();
  });
  window.setInterval(() => {
    if (recorder.recording) recordButton.textContent = recordingLabel(recorder.seconds);
  }, 250);

  // --- the mirror -------------------------------------------------------------
  // The puzzle must work even if the camera never arrives.
  void startMirror(video).then((ok) => {
    mirrorLive = ok;
    if (ok) return;
    mirrorNote.hidden = false;
    mirrorNote.textContent =
      'No camera. The puzzle still works — allow camera access and reload for the mirror.';
  });

  // --- layout -----------------------------------------------------------------
  const resize = () => viewer.resize();
  new ResizeObserver(resize).observe(canvas.parentElement ?? canvas);
  window.addEventListener('resize', resize);

  // --- loop -------------------------------------------------------------------
  let last = performance.now();
  const frame = (now: number): void => {
    const elapsed = Math.min((now - last) / 1000, 0.25);
    last = now;

    // Nothing to integrate while every piece is asleep and no hand is holding one.
    if (grabber.holding || !sim.asleep()) sim.step(elapsed, drivers);
    for (const hit of impacts.observe(
      sim.pieces.map((piece) => {
        const p = piece.body.translation();
        const v = piece.body.linvel();
        return { x: p.x, y: p.y, z: p.z, vy: v.y, speed: Math.hypot(v.x, v.y, v.z) };
      }),
      sim.settled(),
      now / 1000,
    )) {
      sfx.play(hit.name, hit.strength);
    }
    viewer.sync(sim.pieces);
    viewer.render();
    recorder.capture(mirrorLive ? video : null, canvas);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    // A handle for inspecting and poking at the running sim from the console:
    // `squareHole.sim.pieces[0].body.translation()`, `squareHole.viewer.project(...)`.
    Object.assign(window, { squareHole: { sim, viewer, grabber, holeCentres, sfx, recorder } });
  }
}

void main();
