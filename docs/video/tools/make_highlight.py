"""Cut the 3-minute highlight (user vs admin test accounts) out of the final video at scene boundaries.

Scenes are taken whole, so narration is never cut mid-sentence. Short audio fades hide the joins.
usage: python make_highlight.py WORK_DIR OUT_DIR
"""
import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
WORK, OUT = Path(sys.argv[1]), Path(sys.argv[2])
SEGMENTS = ['d04', 'd06', 'd07', 'd11', 'a02', 'a03', 'a04', 'a05', 'a07']
scenes = {s['id']: s for s in json.loads((WORK / 'timing.json').read_text(encoding='utf-8'))}
src, dst = OUT / 'healthpick_final.mp4', OUT / 'healthpick_highlight_3min.mp4'

parts, total, chapters = [], 0.0, []
for i, sid in enumerate(SEGMENTS):
    a, d = scenes[sid]['start'], scenes[sid]['dur']
    parts.append(f'[0:v]trim=start={a}:duration={d},setpts=PTS-STARTPTS[v{i}];'
                 f'[0:a]atrim=start={a}:duration={d},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.15,afade=t=out:st={d - 0.25}:d=0.25[a{i}]')
    chapters.append((total, sid)); total += d
graph = ';'.join(parts) + ';' + ''.join(f'[v{i}][a{i}]' for i in range(len(SEGMENTS))) + \
    f'concat=n={len(SEGMENTS)}:v=1:a=1[cv][a];[cv]fade=t=in:st=0:d=0.4,fade=t=out:st={total - 0.8}:d=0.8[v]'
x264 = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-b:v', '1000k',
        '-maxrate', '3000k', '-bufsize', '6000k', '-x264-params', 'keyint=150:min-keyint=30']
log = WORK / 'x264_hl'
run = lambda *a: subprocess.run([FF, '-y', '-hide_banner', '-loglevel', 'error', *map(str, a)], check=True)
run('-i', src, '-filter_complex', graph, '-map', '[v]', '-map', '[a]', *x264, '-pass', 1, '-passlogfile', log, '-an', '-f', 'mp4', 'NUL')
run('-i', src, '-filter_complex', graph, '-map', '[v]', '-map', '[a]', *x264, '-pass', 2, '-passlogfile', log,
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-metadata:s:a:0', 'language=kor', '-movflags', '+faststart', dst)
print(dst, f'{dst.stat().st_size / 1e6:.1f} MB', f'{total:.0f}s')
for t, sid in chapters:
    print(f'{int(t) // 60}:{int(t) % 60:02d}  {sid}')
