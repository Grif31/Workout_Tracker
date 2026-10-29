"""Build the App Store app previews: each trimmed screen recording in
preview/raw/ under a caption, joined into videos at the size App Store Connect
accepts for every current iPhone (886 x 1920, 30 fps, H.264, stereo AAC).

    src/venv/Scripts/python.exe src/brand/store/preview.py

Needs ffmpeg (winget install Gyan.FFmpeg). Writes preview/out/. The recordings
are not committed (they're large); edit PREVIEWS to change a caption or the order.
"""
import glob, os, pathlib, shutil, subprocess, tempfile

from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).parent
RAW = HERE / 'preview' / 'raw'
OUT = HERE / 'preview' / 'out'
FONT = HERE / 'fonts' / 'ArchivoBlack-Regular.ttf'
W, H, FPS = 886, 1920, 30

# App Store Connect takes 15 to 30 seconds per preview, so the six clips are two
# previews. Captions follow the screenshots in build.py where a clip has one; each line is centered.
PREVIEWS = {
    'arete-preview-1.mp4': [
        ('01-log.MOV', ['Log your workouts', 'with ease']),
        ('02-pr.MOV', ['Track your PRs']),
        ('03-progress.MOV', ['Your progress,', 'week by week']),
    ],
    'arete-preview-2.mp4': [
        ('04-rank.MOV', ['Earn your rank,', 'reach Aretē']),
        ('05-coach.MOV', ['A Coach built', 'for your goals']),
        # CapCut appended its logo card from 3.8 s; the third value ends the clip early
        ('06-run.MOV', ['Runs, rides,', 'walks and hikes'], 3.75),
    ],
}

# Recordings are 888 wide with the status bar (and its red recording
# indicator) in the top 100 px and the empty home-indicator strip in the
# bottom 50; all three are cut before scaling
CROP_W, CROP_H = 886, 1770
CROP = f'crop={CROP_W}:{CROP_H}:1:100'
SHOT_W = 776
SHOT_H = round(SHOT_W * CROP_H / CROP_W / 2) * 2
SHOT_X, SHOT_Y = (W - SHOT_W) // 2, 288
# The phone frame from build.py's screenshots (980 px screen there: 20 px
# #1C1C1E bezel, 118 px screen radius, 3 px #2C2C2E outline), scaled to SHOT_W
BEZEL = round(20 * SHOT_W / 980)
RADIUS = round(118 * SHOT_W / 980)
OUTLINE = 3
BEZEL_COLOR, OUTLINE_COLOR = (28, 28, 30), (44, 44, 46)
CAPTION_SIZE, CAPTION_TOP, CAPTION_STEP = 72, 88, 86
# Seconds of crossfade between clips, and of fade in from / out to black.
# Each crossfade overlaps two clips, so a preview runs FADE shorter per join.
FADE = 0.4


def ffmpeg(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    # winget adds ffmpeg to PATH only for shells opened after the install
    hits = glob.glob(os.path.expandvars(
        r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\ffmpeg-*\bin\\' + name + '.exe'))
    if not hits:
        raise SystemExit(f'{name} not found: winget install Gyan.FFmpeg')
    return hits[0]


def duration(path: pathlib.Path) -> float:
    out = subprocess.run([ffmpeg('ffprobe'), '-v', 'error', '-show_entries', 'format=duration',
                          '-of', 'default=nw=1:nk=1', str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout)


def frame_layers(tmp: pathlib.Path):
    """frame.png: the phone frame (outline, then bezel), drawn once over the full canvas.
    mask.png: the rounded corners the footage is cut to."""
    def around(pad):
        return (SHOT_X - pad, SHOT_Y - pad, SHOT_X + SHOT_W + pad - 1, SHOT_Y + SHOT_H + pad - 1)
    frame = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(frame)
    draw.rounded_rectangle(around(BEZEL + OUTLINE), RADIUS + BEZEL + OUTLINE, fill=OUTLINE_COLOR + (255,))
    draw.rounded_rectangle(around(BEZEL), RADIUS + BEZEL, fill=BEZEL_COLOR + (255,))
    frame.save(tmp / 'frame.png')
    mask = Image.new('L', (SHOT_W, SHOT_H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, SHOT_W - 1, SHOT_H - 1), RADIUS, fill=255)
    mask.save(tmp / 'mask.png')


def segment(clip: pathlib.Path, lines: list[str], end: float | None, tmp: pathlib.Path, index: int) -> pathlib.Path:
    secs = end or duration(clip)
    # drawtext reads each line from a file: no filter escaping for commas or the macron
    texts = []
    for n, line in enumerate(lines):
        f = tmp / f'cap{index}_{n}.txt'
        f.write_text(line, encoding='utf-8')
        texts.append(
            f"drawtext=fontfile=font.ttf:textfile={f.name}:fontsize={CAPTION_SIZE}:fontcolor=0xF2F2F7"
            f":x=(w-text_w)/2:y={CAPTION_TOP + n * CAPTION_STEP}")
    # The frame is a filled rounded box behind the footage; the footage, cut
    # to the screen radius, covers all of it but the bezel and outline
    graph = (
        f"color=c=0x0D0D0D:s={W}x{H}:r={FPS}:d={secs},{','.join(texts)}[bg];"
        f"[bg][1:v]overlay=0:0[framed];"
        f"[0:v]{CROP},scale={SHOT_W}:{SHOT_H},fps={FPS},format=rgba[shot];"
        f"[2:v]format=gray[mask];[shot][mask]alphamerge[rounded];"
        f"[framed][rounded]overlay={SHOT_X}:{SHOT_Y}:shortest=1,format=yuv420p[v]"
    )
    # Near-lossless and silent: join() encodes the final file once, with its audio
    target = tmp / f'seg{index}.mp4'
    subprocess.run([
        ffmpeg('ffmpeg'), '-v', 'error', '-y', '-t', f'{secs:.3f}', '-i', str(clip),
        '-loop', '1', '-i', 'frame.png', '-loop', '1', '-i', 'mask.png', '-filter_complex', graph,
        '-map', '[v]', '-t', f'{secs:.3f}', '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', str(target),
    ], cwd=tmp, check=True)
    return target


def join(parts: list[pathlib.Path], target: pathlib.Path, tmp: pathlib.Path):
    lengths = [duration(p) for p in parts]
    total = sum(lengths) - FADE * (len(parts) - 1)
    chain, label, offset = [], '0:v', 0.0
    for i in range(1, len(parts)):
        offset += lengths[i - 1] - FADE
        chain.append(f"[{label}][{i}:v]xfade=transition=fade:duration={FADE}:offset={offset:.3f}[x{i}]")
        label = f'x{i}'
    chain.append(f"[{label}]fade=t=in:st=0:d={FADE},fade=t=out:st={total - FADE:.3f}:d={FADE},"
                 f"format=yuv420p[v]")
    inputs = [arg for p in parts for arg in ('-i', p.name)]
    subprocess.run([
        ffmpeg('ffmpeg'), '-v', 'error', '-y', *inputs,
        # the phone's own audio could hold mic noise; previews play muted anyway
        '-f', 'lavfi', '-t', f'{total:.3f}', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-filter_complex', ';'.join(chain), '-map', '[v]', '-map', f'{len(parts)}:a',
        '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-r', str(FPS), '-b:v', '11M',
        '-maxrate', '12M', '-bufsize', '24M', '-c:a', 'aac', '-b:a', '256k',
        '-movflags', '+faststart', str(target),
    ], cwd=tmp, check=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp_name:
        tmp = pathlib.Path(tmp_name)
        shutil.copy(FONT, tmp / 'font.ttf')
        frame_layers(tmp)
        index = 0
        for name, clips in PREVIEWS.items():
            parts = []
            for clip, lines, *end in clips:
                parts.append(segment(RAW / clip, lines, end[0] if end else None, tmp, index))
                index += 1
            target = OUT / name
            join(parts, target, tmp)
            secs = duration(target)
            if not 15 <= secs <= 30:
                raise SystemExit(f'{name} is {secs:.1f}s; App Store Connect needs 15 to 30')
            print(f'wrote {name} ({secs:.1f}s)')


if __name__ == '__main__':
    main()
