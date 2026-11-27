"""Verify the final video: format, exact length, size limits, narration loudness per scene, flicker.

usage: python check_final.py WORK_DIR OUT_DIR
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

import video_scenes as v

FF = imageio_ffmpeg.get_ffmpeg_exe()
WORK, OUT = Path(sys.argv[1]), Path(sys.argv[2])
final, hl = OUT / 'healthpick_final.mp4', OUT / 'healthpick_highlight.mp4'
scenes = json.loads((WORK / 'timing.json').read_text(encoding='utf-8'))
ok = True


def check(cond, msg):
    global ok
    ok &= bool(cond)
    print(('PASS ' if cond else 'FAIL ') + msg)


def probe(path):
    return subprocess.run([FF, '-hide_banner', '-i', str(path)], capture_output=True, text=True).stderr


info = probe(final)
dur = re.search(r'Duration: (\d+):(\d+):([\d.]+)', info)
seconds = int(dur[1]) * 3600 + int(dur[2]) * 60 + float(dur[3])
check(abs(seconds - v.TOTAL) <= 0.1, f'length {seconds:.2f}s (target {v.TOTAL}s)')
check('h264 (High)' in info and '1920x1080' in info and '30 fps' in info, 'video H.264 High 1920x1080 30fps')
check(re.search(r'Audio: aac \(LC\).*48000 Hz, stereo', info) and '(kor)' in info, 'audio AAC-LC 48kHz stereo, language kor')
size = final.stat().st_size / 1e6
check(size <= 95, f'final size {size:.1f} MB (<= 95 MB)')
check(hl.stat().st_size / 1e6 <= 10, f'highlight size {hl.stat().st_size / 1e6:.1f} MB (<= 10 MB)')

# narration audible in every scene (mean volume of the spoken part)
quiet = []
for sc in scenes:
    a = sc['start'] + sc['lines'][0]['t']; b = sc['start'] + sc['speech_end']
    out = subprocess.run([FF, '-hide_banner', '-ss', f'{a:.2f}', '-t', f'{b - a:.2f}', '-i', str(final), '-vn',
                          '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    mean = float(re.search(r'mean_volume: (-?[\d.]+) dB', out)[1])
    if mean <= -35:
        quiet.append((sc['id'], mean))
check(not quiet, f'narration audible in all {len(scenes)} scenes' + (f' — quiet: {quiet}' if quiet else ''))
loud = subprocess.run([FF, '-hide_banner', '-i', str(final), '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
                      capture_output=True, text=True).stderr
lufs = float(json.loads(loud[loud.rfind('{'):loud.rfind('}') + 1])['input_i'])
check(-17.5 <= lufs <= -14.5, f'integrated loudness {lufs:.1f} LUFS (target -16)')

# flicker: single-frame brightness spikes outside scene boundaries
out = subprocess.run([FF, '-hide_banner', '-i', str(final), '-vf', 'scale=320:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG',
                      '-an', '-f', 'null', '-'], capture_output=True, text=True).stderr
y = [float(m) for m in re.findall(r'YAVG=([\d.]+)', out)]
bounds = [round(sc['start'] * v.FPS) for sc in scenes]
near = lambda i: any(abs(i - b) <= 20 for b in bounds) or i < 20 or i > len(y) - 35
spikes = [i for i in range(1, len(y) - 1)
          if abs(y[i] - y[i - 1]) >= 4 and abs(y[i + 1] - y[i]) >= 4 and (y[i] - y[i - 1]) * (y[i + 1] - y[i]) < 0 and not near(i)]
check(len(y) == v.TOTAL * v.FPS, f'{len(y)} frames analysed (expected {v.TOTAL * v.FPS})')
check(not spikes, 'no single-frame flashes' + (f' — at {[round(i / v.FPS, 2) for i in spikes[:10]]}s' if spikes else ''))
sys.exit(0 if ok else 1)
