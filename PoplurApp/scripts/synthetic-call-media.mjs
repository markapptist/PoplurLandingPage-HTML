import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const exec = promisify(execFile);
const greetings = {
  'sim-food-001': 'Hey Mark, Sauce Boss here. I caught your post and wanted to say hi. I am one of your synthetic Poplur testers. What is the best food spot near that pin?',
  'sim-sports-002': 'Hey Mark, Pitch Side here, your synthetic sports tester. I just checked out your post. Love seeing the map get busier. Hope your day is going well.',
  'sim-music-003': 'Hey Mark, Basement Set here. I am your synthetic music tester on Poplur. I stopped by your post and sent you a message. Catch you in the chat.',
  'sim-tech-004': 'Hey Mark, Ship It here, your synthetic tech tester. Your post reached my feed. I wanted to try a quick call and say hello. See you on the map.',
  'sim-news-005': 'Hey Mark, City Desk here, your synthetic news tester. I have been exploring the posts around your pin. Just calling to say hello. Catch you in the chat.',
};

/** The runner sends a labelled animated avatar and a spoken greeting over the
 * real WebRTC tracks. No device microphone/camera or human identity is used. */
export async function installSyntheticCallMedia(frame, actor) {
  const directory = join(homedir(), '.poplur', 'synthetic-call-media');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `${actor.actorId}-v1.wav`);
  try { await access(file); } catch {
    const message = greetings[actor.actorId] || `Hey Mark, ${actor.handle.replace(/[^a-zA-Z ]/g, ' ')} here. I am one of your synthetic Poplur business testers. Just calling to say hello after seeing your post.`;
    await exec('/usr/bin/say', ['-r', '165', '-o', file, '--data-format=LEI16@24000', message]);
  }
  const audio = (await readFile(file)).toString('base64');
  await frame.evaluate(async ({ audio, handle, persona }) => {
    window.__poplurRestoreSyntheticCallMedia?.();
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const context = new AudioContext();
    void context.resume();
    const buffer = await context.decodeAudioData(Uint8Array.from(atob(audio), char => char.charCodeAt(0)).buffer);
    const destination = context.createMediaStreamDestination();
    const analyser = context.createAnalyser(); analyser.fftSize = 256; analyser.connect(destination);
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 640;
    const paint = canvas.getContext('2d');
    const levels = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(levels);
      const energy = levels.reduce((sum, value) => sum + value, 0) / levels.length / 255;
      const background = paint.createLinearGradient(0, 0, 480, 640); background.addColorStop(0, '#ff61ba'); background.addColorStop(1, '#622179');
      paint.fillStyle = background; paint.fillRect(0, 0, 480, 640);
      paint.fillStyle = '#ffcee6'; paint.beginPath(); paint.arc(240, 280, 128, 0, Math.PI * 2); paint.fill();
      paint.fillStyle = '#37132e';
      const blink = Date.now() % 4_100 < 130;
      for (const x of [196, 284]) { paint.beginPath(); paint.ellipse(x, 254, 10, blink ? 2 : 15, 0, 0, Math.PI * 2); paint.fill(); }
      paint.beginPath(); paint.ellipse(240, 320, 30, 8 + energy * 45, 0, 0, Math.PI * 2); paint.fill();
      paint.fillStyle = '#fff'; paint.textAlign = 'center'; paint.font = 'bold 32px system-ui'; paint.fillText(handle, 240, 465);
      paint.font = '20px system-ui'; paint.fillText(persona, 240, 504); paint.font = 'bold 16px system-ui'; paint.fillText('SYNTHETIC POPLUR TESTER', 240, 560);
    };
    draw(); const timer = setInterval(draw, 1000 / 15);
    const video = canvas.captureStream(15);
    let started = false;
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (!constraints?.audio) return original(constraints);
      void context.resume();
      if (!started) {
        started = true;
        // The greeting starts when the remote actually answers, so ringing never consumes the introduction.
        const wait = setInterval(async () => {
          const state = (await import('/src/webCall.ts')).callState();
          if (state.phase !== 'connected') return;
          clearInterval(wait);
          const source = context.createBufferSource(); source.buffer = buffer; source.connect(analyser); source.start();
        }, 300);
        window.__poplurSyntheticGreetingWait = wait;
      }
      return new MediaStream([...destination.stream.getAudioTracks(), ...(constraints.video ? video.getVideoTracks() : [])]);
    };
    window.__poplurRestoreSyntheticCallMedia = () => {
      navigator.mediaDevices.getUserMedia = original;
      clearInterval(timer); clearInterval(window.__poplurSyntheticGreetingWait);
      video.getTracks().forEach(track => track.stop()); destination.stream.getTracks().forEach(track => track.stop());
      void context.close(); delete window.__poplurRestoreSyntheticCallMedia;
    };
  }, { audio, handle: actor.handle, persona: actor.persona });
}
