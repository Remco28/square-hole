/**
 * The left panel is a mirror, nothing more. There is no reaction detection and
 * no overlay: the joke is that the person getting upset about the shape sorter
 * is you, watching yourself.
 */

export async function startMirror(video: HTMLVideoElement): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  const open = async (constraints: MediaStreamConstraints): Promise<MediaStream> =>
    navigator.mediaDevices.getUserMedia(constraints);

  let stream: MediaStream;
  try {
    // On a phone this is the selfie camera; on a desktop it is whatever is built in.
    stream = await open({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch {
    try {
      stream = await open({ video: true, audio: false });
    } catch {
      return false;
    }
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
  } catch {
    return false;
  }
  return true;
}
