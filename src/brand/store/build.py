"""Build the App Store screenshots: each raw capture in ios-6.9/ inside a phone
frame, under a headline, at the 6.9" size App Store Connect requires.

    src/venv/Scripts/python.exe src/brand/store/build.py

Renders with headless Chrome (fonts come from Google Fonts, so it needs a
network connection) and writes ios-6.9-framed/. Edit SLIDES to change a caption.
"""
import base64, pathlib, subprocess, tempfile

from PIL import Image

HERE = pathlib.Path(__file__).parent
RAW = HERE / 'ios-6.9'
OUT = HERE / 'ios-6.9-framed'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
W, H = 1320, 2868

SLIDES = [
    ('01-home.png', 'Log your workouts with ease'),
    ('02-workout-detail.png', 'Complete workout breakdown'),
    ('03-progress.png', 'Your progress, week by week'),
    ('04-strength-score.png', 'How strong are you?'),
    ('05-greek-rank.png', 'Earn your rank, reach Aret\u0113'),
    ('06-coach-insights.png', 'A coach that learns from your training'),
    ('07-ai-routine.png', 'Programs built for you'),
    ('08-pr-dashboard.png', 'Track your PRs'),
    ('09-personal-records.png', 'Every record in one place'),
    ('10-exercise-library.png', 'Full exercise library with demos'),
]

# Screen width inside the frame; height follows the capture's own aspect
SCREEN_W = 980
SCREEN_H = round(SCREEN_W * H / W)
BEZEL = 20


def page(shot: pathlib.Path, caption: str) -> str:
    img = 'data:image/png;base64,' + base64.b64encode(shot.read_bytes()).decode()
    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&display=block">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: {W}px; height: {H}px; overflow: hidden; }}
  body {{
    background:
      radial-gradient(ellipse 900px 700px at 50% 30%, rgba(48, 209, 88, 0.16), transparent 70%),
      #0D0D0D;
    display: flex; flex-direction: column; align-items: center;
  }}
  h1 {{
    font-family: 'Archivo Black', 'Arial Black', sans-serif; font-weight: 400;
    font-size: 104px; line-height: 1.08; letter-spacing: -0.01em;
    color: #F2F2F7; text-align: center;
    width: 1160px; height: 400px; margin-top: 150px;
    display: flex; align-items: center; justify-content: center;
  }}
  .phone {{
    margin-top: 20px; padding: {BEZEL}px;
    background: #1C1C1E; border-radius: 138px;
    box-shadow: 0 0 0 3px #2C2C2E, 0 40px 120px rgba(0, 0, 0, 0.7);
  }}
  .phone img {{
    display: block; width: {SCREEN_W}px; height: {SCREEN_H}px; border-radius: 118px;
  }}
</style></head>
<body>
  <h1>{caption}</h1>
  <div class="phone"><img src="{img}"></div>
</body></html>"""


def main():
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for name, caption in SLIDES:
            html = pathlib.Path(tmp) / (name + '.html')
            html.write_text(page(RAW / name, caption), encoding='utf-8')
            target = OUT / name
            subprocess.run([
                CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                '--force-device-scale-factor=1', f'--window-size={W},{H}',
                '--virtual-time-budget=8000', f'--screenshot={target}', html.as_uri(),
            ], check=True, capture_output=True)
            # App Store Connect refuses screenshots with an alpha channel
            Image.open(target).convert('RGB').save(target)
            print('wrote', target.name)


if __name__ == '__main__':
    main()
