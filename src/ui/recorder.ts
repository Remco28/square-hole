/**
 * Records the finished meme, entirely in the browser.
 *
 * Both panels are drawn into one fixed 2:1 canvas and that canvas is what gets
 * recorded. Drawing to a canonical size rather than to whatever the page happens
 * to be showing means a phone user recording a stacked layout still gets a
 * normal side-by-side video out of it.
 *
 * Audio is a single mixed track when available: the game sounds (via the
 * `SfxEngine`'s `MediaStreamAudioDestinationNode`, mic already folded in) or,
 * as a fallback, the raw mic. Video-only when neither is attached.
 */

const PANEL = 960;

export interface Recording {
  url: string;
  extension: string;
  seconds: number;
}

export class MemeRecorder {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private lastSeconds = 0;
  private listener: ((recording: Recording) => void) | null = null;
  /** Extra audio (game mix or mic fallback) stapled onto the recording. */
  private audio: MediaStreamTrack[] = [];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = PANEL * 2;
    this.canvas.height = PANEL;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context for the recorder');
    this.ctx = ctx;
  }

  get supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && typeof this.canvas.captureStream === 'function';
  }

  get recording(): boolean {
    return this.recorder !== null;
  }

  get seconds(): number {
    return this.recorder ? (performance.now() - this.startedAt) / 1000 : this.lastSeconds;
  }

  onFinished(listener: (recording: Recording) => void): void {
    this.listener = listener;
  }

  /** Live tracks to mix into the next recording. Replaces any previous set. */
  attachAudio(tracks: (MediaStreamTrack | null | undefined)[]): void {
    this.audio = tracks.filter(
      (t): t is MediaStreamTrack => !!t && t.readyState === 'live',
    );
  }

  clearAudio(): void {
    this.audio = [];
  }

  start(): boolean {
    if (!this.supported || this.recorder) return false;
    const video = this.canvas.captureStream(60);
    // Keep our own stream so stopping the recording never kills a shared mic.
    const stream = new MediaStream([
      ...video.getVideoTracks(),
      ...this.audio.filter((t) => t.readyState === 'live'),
    ]);
    const mimeType = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined,
    );

    this.chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    recorder.onstop = () => {
      const type = mimeType ?? 'video/webm';
      const extension = type.includes('mp4') ? 'mp4' : 'webm';
      this.listener?.({
        url: URL.createObjectURL(new Blob(this.chunks, { type })),
        extension,
        seconds: this.lastSeconds,
      });
      // Audio tracks belong to the shared sound engine, not this recording.
      this.stream?.getVideoTracks().forEach((track) => track.stop());
      this.stream = null;
      this.chunks = [];
    };

    recorder.start(1000);
    this.recorder = recorder;
    this.stream = stream;
    this.startedAt = performance.now();
    return true;
  }

  stop(): void {
    const recorder = this.recorder;
    if (!recorder) return;
    this.lastSeconds = this.seconds;
    this.recorder = null;
    recorder.stop();
  }

  /** Called once per rendered frame, right after the 3D canvas has drawn. */
  capture(video: HTMLVideoElement | null, gl: HTMLCanvasElement): void {
    if (!this.recorder) return;
    const { ctx } = this;
    ctx.fillStyle = '#0d0f13';
    ctx.fillRect(0, 0, PANEL, PANEL);

    if (video && video.videoWidth > 0) {
      // Centre-crop the camera to a square, mirrored, exactly as it looks on screen.
      const side = Math.min(video.videoWidth, video.videoHeight);
      const sx = (video.videoWidth - side) / 2;
      const sy = (video.videoHeight - side) / 2;
      ctx.save();
      ctx.translate(PANEL, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, side, side, 0, 0, PANEL, PANEL);
      ctx.restore();
    }

    ctx.drawImage(gl, PANEL, 0, PANEL, PANEL);
  }
}
