import { execFileSync } from 'child_process';
import ffmpeg from 'ffmpeg-static';

const args = [
  '-y',
  '-framerate', '24',
  '-i', 'frames/f%04d.png',
  '-c:v', 'libwebp',
  '-lossless', '0',
  '-q:v', '78',
  '-compression_level', '5',
  '-loop', '0',
  '-an',
  '../trailer.webp',
];
console.log('ffmpeg', args.join(' '));
execFileSync(ffmpeg, args, { stdio: 'inherit' });
console.log('encoded ../trailer.webp');
