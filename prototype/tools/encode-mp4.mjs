import { execFileSync } from 'child_process';
import ffmpeg from 'ffmpeg-static';

const args = [
  '-y',
  '-framerate', '24',
  '-i', 'frames/f%04d.png',
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-crf', '18',
  '-preset', 'slow',
  '-movflags', '+faststart',
  '-an',
  '../trailer.mp4',
];
console.log('ffmpeg', args.join(' '));
execFileSync(ffmpeg, args, { stdio: 'inherit' });
console.log('encoded ../trailer.mp4');
