/**
 * The reaction mic. Separate from the mirror's camera request so denying the
 * mic never costs the mirror, and denying the camera never costs the reaction.
 *
 * The stream is never played locally (no feedback): it is folded into the
 * recording mix by `SfxEngine.attachMic`, or attached to the recorder raw as
 * a fallback when audio synthesis is unavailable.
 */

let cached: MediaStream | null = null;

export async function requestMic(): Promise<MediaStream | null> {
  const live = cached?.getAudioTracks().some((t) => t.readyState === 'live');
  if (cached && live) return cached;
  stopMic();
  if (!navigator.mediaDevices?.getUserMedia) return null;
  try {
    cached = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    return cached;
  } catch {
    return null;
  }
}

export function stopMic(): void {
  try {
    cached?.getTracks().forEach((t) => t.stop());
  } catch {
    /* already stopped */
  }
  cached = null;
}
