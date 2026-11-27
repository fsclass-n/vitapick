"""Compose the healthpick video from slides, recorded frames, overlays and narration.

Pipeline: overlays (Pillow PNG) -> per-scene clip (exact frame count, 30 fps) -> concat ->
narration track (per-scene, exact length, two-pass loudnorm -16 LUFS) -> 2-pass H.264 encode ->
SRT, 60 s highlight, thumbnail.

usage: python compose.py WORK_DIR OUT_DIR
"""
import json
import math
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

import video_scenes as v

FF = imageio_ffmpeg.get_ffmpeg_exe()
WORK, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OV, CLIPS = WORK / 'overlays', WORK / 'clips'
for d in (OV, CLIPS, OUT):
    d.mkdir(parents=True, exist_ok=True)
W, H, FPS = 1920, 1080, v.FPS
PX = W / 13.333  # slide inch -> px
FONT = 'C:/Windows/Fonts/NotoSansKR-VF.ttf'
SCENES = json.loads((WORK / 'timing.json').read_text(encoding='utf-8'))
STEM = 'healthpick_final'


def ff(*args):
    subprocess.run([FF, '-y', '-hide_banner', '-loglevel', 'error', *map(str, args)], check=True)


def font(size, weight='Bold'):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def rgba(hexv, a=255):
    hexv = hexv.lstrip('#')
    return tuple(int(hexv[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


# ---------------- overlay images ----------------
def pill(path, text, size, fg, bg, anchor, pad=(22, 11), radius=None, dot=None):
    """Transparent full-frame PNG with a rounded label; anchor = ('right'|'left', x, 'top'|'bottom', y)."""
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(img); f = font(size)
    l, t, r, b = d.textbbox((0, 0), text, font=f)
    dot_w = int(size * 0.9) if dot else 0
    bw, bh = r - l + pad[0] * 2 + dot_w, b - t + pad[1] * 2
    hx, x, vy, y = anchor
    x0 = x - bw if hx == 'right' else x
    y0 = y if vy == 'top' else y - bh
    d.rounded_rectangle((x0, y0, x0 + bw, y0 + bh), radius or bh // 2, fill=bg)
    if dot:
        cy = y0 + bh / 2; d.ellipse((x0 + pad[0], cy - size * .22, x0 + pad[0] + size * .44, cy + size * .22), fill=dot)
    d.text((x0 + pad[0] + dot_w - l, y0 + pad[1] - t), text, font=f, fill=fg)
    img.save(path)


def caption_png(path, text):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(img); f = font(34, 'Medium')
    l, t, r, b = d.textbbox((0, 0), text, font=f)
    bw, bh = r - l + 56, b - t + 28
    x0, y0 = (W - bw) // 2, H - 34 - bh
    d.rounded_rectangle((x0, y0, x0 + bw, y0 + bh), 16, fill=rgba('14261d', 205))
    d.text((x0 + 28 - l, y0 + 14 - t), text, font=f, fill=(255, 255, 255, 255))
    img.save(path)


def box_png(path, rects, pad=8):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    for x, y, w, h in rects:
        x0, y0, x1, y1 = x - pad, y - pad, x + w + pad, y + h + pad
        for g in range(10, 0, -2):  # soft outer glow
            d.rounded_rectangle((x0 - g, y0 - g, x1 + g, y1 + g), 16 + g, outline=rgba('22d3ee', 10 + (10 - g) * 3), width=2)
        d.rounded_rectangle((x0, y0, x1, y1), 14, outline=rgba('22d3ee'), width=4)
    img.save(path)


def mobile_bg(path, role):
    img = Image.new('RGBA', (W, H), rgba('f8f9f5')); d = ImageDraw.Draw(img)
    pw, ph = 434, 940; x0, y0 = (W - pw) // 2, 62
    d.rounded_rectangle((x0 - 14, y0 - 14, x0 + pw + 14, y0 + ph + 14), 44, fill=rgba('213e33'))
    title = '일반 사용자' if role == 'user' else '테스트 관리자'
    d.text((150, 380), 'MOBILE · RESPONSIVE', font=font(20), fill=rgba('5e8f68'))
    d.text((150, 418), f'모바일 · {title}', font=font(46), fill=rgba('233a32'))
    d.text((150, 492), '햄버거 ↔ X · 오른쪽 드로어', font=font(24, 'Medium'), fill=rgba('6f8273'))
    menu = ['대시보드', '식단 기록', '영양 리포트'] + (['회원 관리'] if role == 'admin' else [])
    d.text((1300, 380), f'메뉴 {len(menu)}개', font=font(40), fill=rgba('233a32'))
    for i, m in enumerate(menu):
        hl = m == '회원 관리'
        d.text((1300, 448 + i * 44), ('+ ' if hl else '· ') + m, font=font(26, 'Bold' if hl else 'Medium'),
               fill=rgba('b75243' if hl else '6f8273'))
    img.save(path)
    return x0, y0, pw, ph


def chunks(text, limit=27):
    """Split a caption into readable one-line chunks, preferring commas and sentence ends."""
    parts, cur = [], ''
    for tok in re.split(r'(?<=[,.?!])\s+|\s+', text):
        cand = (cur + ' ' + tok).strip()
        if cur and len(cand) > limit:
            parts.append(cur); cur = tok
        else:
            cur = cand
        if cur.endswith((',', '.', '?', '!')) and len(cur) >= limit * 0.55:
            parts.append(cur); cur = ''
    if cur:
        parts.append(cur)
    return parts


# ---------------- per-scene composition ----------------
def raw_to_clip(sc, out, size=None):
    """Turn screencast frames (real timestamps) into a constant-30fps clip of exact length."""
    raw = WORK / 'raw' / sc['id']; meta = json.loads((raw / 'frames.json').read_text())
    frames, t0 = meta['frames'], meta['t0']
    lines = ['ffconcat version 1.0']
    for i, fr in enumerate(frames):
        nxt = frames[i + 1]['ts'] if i + 1 < len(frames) else max(t0 + sc['dur'], meta['t1'])
        start = max(fr['ts'] - t0, 0) if i else 0.0
        dur = max(nxt - t0 - start, 0.001) if i == 0 else max(nxt - fr['ts'], 0.001)
        lines += [f"file '{(raw / fr['file']).as_posix()}'", f'duration {dur:.4f}']
    lines.append(f"file '{(raw / frames[-1]['file']).as_posix()}'")
    lst = raw / 'list.ffconcat'; lst.write_text('\n'.join(lines))
    n = round(sc['dur'] * FPS)
    vf = f'fps={FPS},tpad=stop_mode=clone:stop_duration=2' + (f',scale={size[0]}:{size[1]}:flags=lanczos' if size else '') + ',format=yuv420p'
    ff('-f', 'concat', '-safe', '0', '-i', lst, '-vf', vf, '-frames:v', n, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', out)


def compose_scene(sc, prev_clip):
    sid, dur, n = sc['id'], sc['dur'], round(sc['dur'] * FPS)
    inputs, chains, layers = [], [], []

    def add_loop(png):
        inputs.extend(['-loop', '1', '-framerate', FPS, '-t', f'{dur:.3f}', '-i', png])
        return len(inputs) // 8  # each image input adds 8 args; index offset applied below

    # base
    if 'slide' in sc:
        base_args = ['-loop', '1', '-framerate', FPS, '-t', f'{dur:.3f}', '-i', WORK / 'slides' / f"slide{sc['slide']:02d}.png"]
        base_chain = '[0:v]format=yuv420p[base]'
    elif sc.get('compare'):
        base_args = ['-loop', '1', '-framerate', FPS, '-t', f'{dur:.3f}', '-i', WORK / 'compare.png']
        base_chain = '[0:v]format=yuv420p[base]'
    elif sc.get('mobile'):
        raw = CLIPS / f'{sid}_raw.mp4'
        bgp = OV / f'{sid}_bg.png'; x0, y0, pw, ph = mobile_bg(bgp, sc['mobile'])
        raw_to_clip(sc, raw, (pw, ph))
        base_args = ['-loop', '1', '-framerate', FPS, '-t', f'{dur:.3f}', '-i', bgp, '-i', raw]
        base_chain = f'[0:v][1:v]overlay={x0}:{y0}:shortest=1,format=yuv420p[base]'
    else:
        raw = CLIPS / f'{sid}_raw.mp4'; raw_to_clip(sc, raw)
        base_args = ['-i', raw]
        base_chain = '[0:v]format=yuv420p[base]'
    n_base = sum(1 for a in base_args if a == '-i')

    def layer(png, t_in, t_out, fade=0.3):
        layers.append((png, max(t_in, 0), min(t_out, dur), fade))

    # part label
    lab = OV / f'label_{sc["part"]}_{"slide" if "slide" in sc else "web"}.png'
    if 'slide' in sc:
        pill(lab, sc['part'], 20, (255, 255, 255, 255), rgba('213e33', 230), ('right', W - 24, 'top', 20), dot=rgba('e7a875'))
    else:
        pill(lab, sc['part'], 20, (255, 255, 255, 255), rgba('213e33', 230), ('left', 24, 'bottom', H - 24), dot=rgba('e7a875'))
    layer(lab, 0, dur, 0)
    # slide highlights
    for k, (idx, rect) in enumerate(sc.get('hl', [])):
        ln = sc['lines'][idx]; png = OV / f'{sid}_hl{k}.png'
        box_png(png, [tuple(c * PX for c in rect)])
        layer(png, ln['t'], ln['t'] + ln['d'] + 0.4)
    if sc.get('compare'):
        rects = json.loads((WORK / 'compare.json').read_text())
        plan = [['table'], ['user', 'row-own'], ['admin', 'row-list', 'row-demo'], ['row-real']]
        for k, keys in enumerate(plan):
            ln = sc['lines'][k]; png = OV / f'{sid}_hl{k}.png'
            box_png(png, [rects[key] for key in keys], pad=6)
            layer(png, ln['t'], ln['t'] + ln['d'] + 0.3)
    # yellow tags
    for k, (idx, txt) in enumerate(sc.get('tags', [])):
        png = OV / f'{sid}_tag{k}.png'
        pill(png, txt, 24, rgba('1f2a1f'), rgba('facc15', 245), ('right', W - 24, 'top', 100))
        layer(png, sc['lines'][idx]['t'], dur - 0.3)
    # captions
    caps = []
    for k, ln in enumerate(sc['lines']):
        parts = chunks(ln['cap']); total = sum(len(p) for p in parts); t = ln['t']
        for j, p in enumerate(parts):
            d = ln['d'] * len(p) / total
            png = OV / f'{sid}_cap{k}_{j}.png'; caption_png(png, p)
            end = t + d if j < len(parts) - 1 else ln['t'] + ln['d'] + 0.25
            layer(png, t, end, 0.12); caps.append((sc['start'] + t, sc['start'] + end, p)); t += d

    args = list(base_args); chain = [base_chain]; cur = 'base'
    for i, (png, a, b, fd) in enumerate(layers):
        args += ['-loop', '1', '-framerate', FPS, '-t', f'{dur:.3f}', '-i', png]
        idx = n_base + i
        fades = f',fade=t=in:st={a:.3f}:d={fd}:alpha=1,fade=t=out:st={max(b - fd, a):.3f}:d={fd}:alpha=1' if fd else ''
        chain.append(f'[{idx}:v]format=rgba{fades}[o{i}]')
        chain.append(f"[{cur}][o{i}]overlay=0:0:enable='between(t,{a:.3f},{b:.3f})'[v{i}]")
        cur = f'v{i}'
    # crossfade from the previous scene's last frame
    x = sc.get('xfade', 0.25 if 'slide' in sc and prev_clip else 0)
    if x and prev_clip:
        last = CLIPS / f'{sid}_prev.png'
        ff('-sseof', '-0.1', '-i', prev_clip, '-frames:v', 1, '-update', 1, last)
        args += ['-loop', '1', '-framerate', FPS, '-t', f'{x:.3f}', '-i', last]
        pi = n_base + len(layers)
        chain.append(f'[{cur}]split[h0][t0]')
        chain.append(f'[h0]trim=end_frame={round(x * FPS)},setpts=PTS-STARTPTS[h]')
        chain.append(f'[t0]trim=start_frame={round(x * FPS)},setpts=PTS-STARTPTS[t]')
        chain.append(f'[{pi}:v]format=yuv420p,trim=end_frame={round(x * FPS)},setpts=PTS-STARTPTS[p]')
        chain.append(f"[p][h]blend=all_expr='A*(1-min(T/{x},1))+B*min(T/{x},1)'[hb]")
        chain.append('[hb][t]concat=n=2:v=1:a=0[xf]')
        cur = 'xf'
    out = CLIPS / f'{sid}.mp4'
    ff(*args, '-filter_complex', ';'.join(chain), '-map', f'[{cur}]', '-r', FPS, '-frames:v', n,
       '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', out)
    return out, caps


# ---------------- audio ----------------
def scene_audio(sc):
    out = CLIPS / f"{sc['id']}.wav"; ins, parts = [], []
    ins += ['-f', 'lavfi', '-t', f'{v.LEAD}', '-i', 'anullsrc=r=48000:cl=stereo']
    for k, ln in enumerate(sc['lines']):
        if k:
            ins += ['-f', 'lavfi', '-t', f'{v.GAP}', '-i', 'anullsrc=r=48000:cl=stereo']
        ins += ['-i', WORK / 'tts' / ln['wav']]
    cnt = sum(1 for a in ins if a == '-i')
    graph = ''.join(f'[{i}:a]' for i in range(cnt)) + f'concat=n={cnt}:v=0:a=1,apad,atrim=0:{sc["dur"]:.3f}[a]'
    ff(*ins, '-filter_complex', graph, '-map', '[a]', '-ar', 48000, '-ac', 2, '-c:a', 'pcm_s16le', out)
    return out


def loudnorm(src, dst):
    probe = subprocess.run([FF, '-hide_banner', '-i', str(src), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
                           capture_output=True, text=True).stderr
    m = json.loads(probe[probe.rfind('{'):probe.rfind('}') + 1])
    ff('-i', src, '-af', f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
       f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true",
       '-ar', 48000, '-ac', 2, '-c:a', 'pcm_s16le', dst)


def srt_time(t):
    ms = round(t * 1000); return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


def main():
    clips, caps, prev = [], [], None
    for sc in SCENES:
        clip, c = compose_scene(sc, prev); clips.append(clip); caps += c; prev = clip
        print('scene', sc['id'], 'ok')
    (CLIPS / 'video.ffconcat').write_text('ffconcat version 1.0\n' + '\n'.join(f"file '{c.as_posix()}'" for c in clips))
    master = WORK / 'video_master.mp4'
    ff('-f', 'concat', '-safe', '0', '-i', CLIPS / 'video.ffconcat', '-c', 'copy', master)
    wavs = [scene_audio(sc) for sc in SCENES]
    (CLIPS / 'audio.ffconcat').write_text('ffconcat version 1.0\n' + '\n'.join(f"file '{w.as_posix()}'" for w in wavs))
    narr, norm = WORK / 'narration.wav', WORK / 'narration_norm.wav'
    ff('-f', 'concat', '-safe', '0', '-i', CLIPS / 'audio.ffconcat', '-c', 'copy', narr)
    loudnorm(narr, norm)
    final = OUT / f'{STEM}.mp4'
    x264 = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', FPS, '-b:v', '1000k',
            '-maxrate', '3000k', '-bufsize', '6000k', '-x264-params', 'keyint=150:min-keyint=30']
    vf = f'fade=t=in:st=0:d=0.5,fade=t=out:st={v.TOTAL - 1}:d=1'
    ff('-i', master, '-vf', vf, *x264, '-pass', 1, '-passlogfile', WORK / 'x264', '-an', '-f', 'mp4', 'NUL')
    ff('-i', master, '-i', norm, '-vf', vf, '-af', f'afade=t=out:st={v.TOTAL - 1}:d=1', *x264, '-pass', 2, '-passlogfile', WORK / 'x264',
       '-c:a', 'aac', '-b:a', '160k', '-ar', 48000, '-ac', 2, '-metadata:s:a:0', 'language=kor', '-t', v.TOTAL,
       '-movflags', '+faststart', final)
    (OUT / f'{STEM}.srt').write_text('\n'.join(f'{i}\n{srt_time(a)} --> {srt_time(b)}\n{t}\n' for i, (a, b, t) in enumerate(caps, 1)),
                                     encoding='utf-8')
    hl_start = next(s['start'] for s in SCENES if s['id'] == 'a04')
    ff('-ss', hl_start, '-t', 60, '-i', final, '-vf', 'scale=1280:-2,fade=t=in:st=0:d=0.4,fade=t=out:st=59.2:d=0.8',
       '-af', 'afade=t=in:st=0:d=0.4,afade=t=out:st=59.2:d=0.8', '-c:v', 'libx264', '-preset', 'slow', '-b:v', '1000k',
       '-maxrate', '2000k', '-bufsize', '4000k', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', OUT / 'healthpick_highlight.mp4')
    thumb_t = next(s['start'] for s in SCENES if s['id'] == 'a07') + 9
    ff('-ss', thumb_t, '-i', final, '-frames:v', 1, OUT / 'video-thumbnail.png')
    print('final:', final, f'{final.stat().st_size / 1e6:.1f} MB', '| captions:', len(caps))


if __name__ == '__main__':
    main()
