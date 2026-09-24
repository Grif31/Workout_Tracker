"""Build the Aretē brand guide as print-ready HTML for Chrome --print-to-pdf."""
import base64, io, os, pathlib

ROOT = pathlib.Path(r'C:\Users\grifv\repos\Workout_Tracker')
ASSETS = ROOT / 'src' / 'workout-tracker-native' / 'assets'
OUT = pathlib.Path(__file__).parent


def datauri(p, mime):
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()


MARK_WHITE = datauri(ASSETS / 'Arete_name.svg', 'image/svg+xml')
MARK_INK = datauri(ASSETS / 'Arete_name_dark.svg', 'image/svg+xml')
ICON = datauri(ASSETS / 'Arete_icon.png', 'image/png')

GREEK = [("Neophyte", "#888888"), ("Athlete", "#4A9EFF"), ("Hero", "#4CAF50"),
         ("Demigod", "#FF9800"), ("Olympian", "#9C27B0"), ("Titan", "#E53935"),
         ("Aret\u0113", "#FFD700")]
STRENGTH = ["Novice", "Beginner", "Intermediate", "Advanced", "Elite", "Legend"]

rank_rows = "\n".join(
    f'<div class="rank"><span class="dot" style="background:{c}"></span>'
    f'<span class="rank-name" style="color:{c}">{n}</span>'
    f'<span class="rank-hex">{c}</span></div>' for n, c in GREEK)

HTML = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Aret\u0113 Brand Guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wdth,wght@62..125,400..800&display=block">
<style>
  @page {{ size: 8.5in 11in; margin: 0; }}
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: #0D0D0D; color: #F2F2F7; line-height: 1.55;
  }}
  .page {{
    width: 8.5in; height: 11in; padding: 0.82in 0.9in 0.7in;
    background: #0D0D0D; position: relative; overflow: hidden;
    page-break-after: always; display: flex; flex-direction: column;
  }}
  .page:last-child {{ page-break-after: auto; }}

  /* running head + folio */
  .rh {{ font-family: 'Archivo', sans-serif; font-weight: 600; font-stretch: 112%;
        font-size: 7.5pt; letter-spacing: 0.18em; text-transform: uppercase;
        color: #48484A; display: flex; justify-content: space-between;
        padding-bottom: 7px; border-bottom: 1px solid #1C1C1E; margin-bottom: 30px; }}
  .folio {{ position: absolute; left: 0.9in; right: 0.9in; bottom: 0.46in;
           font-family: 'Archivo', sans-serif; font-size: 7.5pt; color: #3A3A3C;
           letter-spacing: 0.06em; display: flex; justify-content: space-between; }}

  h2 {{ font-family: 'Archivo Black','Arial Black',sans-serif; font-weight: 400;
       font-size: 25pt; letter-spacing: -0.015em; line-height: 1.12; margin-bottom: 7px; }}
  .kicker {{ font-family:'Archivo',sans-serif; font-weight:600; font-stretch:112%;
            font-size: 7.5pt; letter-spacing: 0.16em; text-transform: uppercase;
            color: #30D158; margin-bottom: 9px; }}
  .lede {{ color: #A1A1A6; font-size: 10.5pt; max-width: 5.9in; margin-bottom: 26px; }}
  h3 {{ font-family:'Archivo',sans-serif; font-weight: 700; font-size: 11pt;
       color: #F2F2F7; margin-bottom: 7px; letter-spacing: -0.005em; }}
  p, li {{ font-size: 9.6pt; color: #C7C7CC; }}
  .muted {{ color: #8E8E93; }}
  ul {{ list-style: none; }}
  li {{ position: relative; padding-left: 15px; margin-bottom: 5px; }}
  li::before {{ content: "\\00b7"; position: absolute; left: 3px; color: #30D158; font-weight: 700; }}
  .block {{ margin-bottom: 22px; }}
  .two {{ display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }}
  .rule {{ height: 1px; background: #1C1C1E; margin: 20px 0; }}

  table {{ width: 100%; border-collapse: collapse; font-size: 9pt; }}
  th {{ font-family:'Archivo',sans-serif; font-weight: 600; font-stretch:112%;
       text-transform: uppercase; letter-spacing: 0.1em; font-size: 7pt;
       color: #8E8E93; text-align: left; padding: 0 8px 6px 0;
       border-bottom: 1px solid #2C2C2E; }}
  td {{ padding: 6px 8px 6px 0; border-bottom: 1px solid #1C1C1E; color: #C7C7CC;
       vertical-align: top; }}
  td.k {{ color: #F2F2F7; font-weight: 600; white-space: nowrap; }}
  .mono {{ font-family: 'Consolas','SF Mono',Menlo,monospace; font-size: 8.4pt;
          color: #8E8E93; letter-spacing: 0.01em; }}

  /* cover */
  .cover {{ align-items: center; justify-content: center; text-align: center; }}
  .cover-mark {{ width: 4.5in; }}
  .cover-slogan {{ font-family:'Archivo',sans-serif; font-weight: 600; font-stretch:112%;
                  font-size: 11pt; letter-spacing: 0.22em; color: #30D158;
                  text-transform: uppercase; margin-top: 34px; }}
  .cover-rule {{ width: 2.1in; height: 1px; background: #2C2C2E; margin: 26px auto; }}
  .cover-title {{ font-family:'Archivo Black',sans-serif; font-size: 13pt; letter-spacing: 0.02em; }}
  .cover-foot {{ position: absolute; bottom: 0.7in; left: 0; right: 0; text-align: center;
                font-size: 8.5pt; color: #3A3A3C; letter-spacing: 0.06em; }}

  /* logo page */
  .markbox {{ background: #141416; border: 1px solid #2C2C2E; border-radius: 10px;
             padding: 26px 20px; text-align: center; }}
  .markbox.light {{ background: #F2F2F7; border-color: #E5E5EA; }}
  .markbox img {{ width: 2.05in; }}
  .markbox .cap {{ font-family:'Archivo',sans-serif; font-size: 7pt; letter-spacing: 0.14em;
                  text-transform: uppercase; margin-top: 16px; color: #8E8E93; }}
  .markbox.light .cap {{ color: #6C6C70; }}
  .iconbox img {{ width: 0.95in; border-radius: 16px; }}

  /* colour */
  .sw {{ border-radius: 8px; height: 0.72in; border: 1px solid rgba(255,255,255,0.09); }}
  .sw-lab {{ font-family:'Archivo',sans-serif; font-size: 7.4pt; margin-top: 7px;
            letter-spacing: 0.04em; color: #F2F2F7; font-weight: 600; }}
  .sw-hex {{ font-family:'Consolas',monospace; font-size: 7.6pt; color: #8E8E93; }}
  .grid5 {{ display: grid; grid-template-columns: repeat(5,1fr); gap: 13px; }}
  .grid4 {{ display: grid; grid-template-columns: repeat(4,1fr); gap: 13px; }}
  .hero-sw {{ display: grid; grid-template-columns: 1.55in 1fr; gap: 22px; align-items: center;
             background: #141416; border: 1px solid #2C2C2E; border-radius: 10px; padding: 18px; }}
  .hero-sw .chip {{ height: 1.15in; border-radius: 8px; background: #30D158; }}

  /* type specimens */
  .spec {{ border-bottom: 1px solid #1C1C1E; padding: 13px 0; }}
  .spec:last-child {{ border-bottom: none; }}
  .spec-lab {{ font-family:'Archivo',sans-serif; font-size: 7pt; letter-spacing: 0.14em;
              text-transform: uppercase; color: #636366; margin-bottom: 6px; }}
  .s-black {{ font-family:'Archivo Black',sans-serif; font-size: 21pt; letter-spacing: -0.01em; }}
  .s-bold {{ font-family:'Archivo',sans-serif; font-weight: 700; font-size: 14pt; }}
  .s-semi {{ font-family:'Archivo',sans-serif; font-weight: 600; font-stretch: 112%;
            font-size: 10.5pt; letter-spacing: 0.22em; text-transform: uppercase; }}
  .s-xb {{ font-family:'Archivo',sans-serif; font-weight: 800; font-stretch: 75%; font-size: 27pt; }}
  .s-body {{ font-size: 10pt; color: #C7C7CC; }}

  /* voice */
  .vt td {{ font-size: 8.8pt; }}
  .on {{ color: #F2F2F7; }}

  /* ranks */
  .rank {{ display: flex; align-items: center; gap: 11px; padding: 7px 0;
          border-bottom: 1px solid #1C1C1E; }}
  .dot {{ width: 11px; height: 11px; border-radius: 50%; flex: none; }}
  .rank-name {{ font-family:'Archivo Black',sans-serif; font-size: 11.5pt; flex: 1; }}
  .rank-hex {{ font-family:'Consolas',monospace; font-size: 8pt; color: #636366; }}
  .ladder {{ display: flex; gap: 6px; flex-wrap: wrap; }}
  .step {{ font-family:'Archivo',sans-serif; font-weight: 600; font-size: 8pt;
          padding: 5px 10px; border: 1px solid #2C2C2E; border-radius: 40px; color: #C7C7CC; }}
  .price {{ background: #141416; border: 1px solid #2C2C2E; border-radius: 10px; padding: 14px 16px; }}
  .price.best {{ border-color: #30D158; }}
  .price-lab {{ font-family:'Archivo',sans-serif; font-weight: 600; font-size: 7.5pt; letter-spacing: 0.14em;
               text-transform: uppercase; color: #8E8E93; }}
  .price-num {{ font-family:'Archivo',sans-serif; font-weight: 800; font-stretch: 75%; font-size: 24pt;
               color: #F2F2F7; line-height: 1.1; margin-top: 4px; }}
  .price-num small {{ font-size: 11pt; }}
  .price-sub {{ font-size: 8.4pt; color: #8E8E93; margin-top: 2px; }}
  .grid3 {{ display: grid; grid-template-columns: repeat(3,1fr); gap: 13px; }}
  .fp td {{ font-size: 8.8pt; }}
  .yes {{ color: #30D158; font-weight: 600; }}
  .contact td {{ border-bottom: 1px solid #1C1C1E; }}
</style>
</head>
<body>

<!-- 1. COVER -->
<section class="page cover">
  <img class="cover-mark" src="{MARK_WHITE}" alt="Aret\u0113">
  <div class="cover-slogan">Pursue Excellence</div>
  <div class="cover-rule"></div>
  <div class="cover-title">Brand Guide</div>
  <div class="cover-foot">aretefitnessapp.com</div>
</section>

<!-- 2. PRODUCT -->
<section class="page">
  <div class="rh"><span>Aret\u0113 Brand Guide</span><span>The product</span></div>
  <p class="kicker">01 / The product</p>
  <h2>What we're selling</h2>
  <p class="lede">Aret\u0113 is a workout tracker for lifting and cardio that turns training into a rank.
  Log every set and every run in one app, then see where you stand: against your own records,
  against other lifters and runners, and on a seven-rank ladder earned by showing up.</p>

  <div class="two block">
    <div>
      <h3>Who it's for</h3>
      <p>Anyone who exercises. The core audience is people who strength train and people who do
      cardio, and the many who do both. It suits a first-year lifter as well as someone chasing a
      400 lb deadlift, because scores are measured against lifters of the same bodyweight.</p>
    </div>
    <div>
      <h3>Why it stands out</h3>
      <p>Most fitness trackers are a logbook for lifting or a GPS app for running. Aret\u0113 does both
      in one place and measures the result, so progress feels like climbing something rather
      than filling in a spreadsheet.</p>
    </div>
  </div>

  <h3>The hooks</h3>
  <table class="block" style="margin-top:8px">
    <tr><td class="k" style="width:1.6in">Greek Rank</td><td>Seven ranks from Neophyte to Aret\u0113, earned by consistency and training volume. Free for everyone.</td></tr>
    <tr><td class="k">Strength Score</td><td>Ranks each lift against lifters of the same sex, bodyweight and age, then rolls them into one overall percentile.</td></tr>
    <tr><td class="k">Endurance Score</td><td>The Strength Score for runners. Ranks your best running times, from 400 m to the marathon, against runners of the same sex and age.</td></tr>
    <tr><td class="k">PRs and share cards</td><td>Every personal record is caught automatically and becomes a card users post themselves.</td></tr>
    <tr><td class="k">AI Coach</td><td>Builds a workout or a full multi-week routine in seconds, and reads recent training to say when to push and when to deload.</td></tr>
    <tr><td class="k">GPS cardio</td><td>Runs, walks and rides tracked on a map, in the same app as the lifting log.</td></tr>
  </table>

  <h3>Aretē Premium pricing</h3>
  <p class="muted" style="font-size:8.8pt;margin-bottom:2px">The app itself is free to download and use. These prices are for Premium only.</p>
  <div class="grid3" style="margin-top:9px;margin-bottom:10px">
    <div class="price best"><div class="price-lab">Annual &middot; lead with this</div>
      <div class="price-num">$29.99<small>/yr</small></div>
      <div class="price-sub">One-week free trial, then $2.50 a month. Half the monthly price</div></div>
    <div class="price"><div class="price-lab">Monthly</div>
      <div class="price-num">$4.99<small>/mo</small></div>
      <div class="price-sub">Cancel anytime</div></div>
    <div class="price"><div class="price-lab">Lifetime</div>
      <div class="price-num">$60</div>
      <div class="price-sub">One-time. May be retired, so don't feature it</div></div>
  </div>
  <p class="muted" style="font-size:8.8pt">Only the annual plan has the <strong style="color:#F2F2F7">one-week free trial</strong>.
  Launching on both iPhone and Android.</p>

  <div class="folio"><span>Aret\u0113</span><span>2</span></div>
</section>

<!-- 3. NAME + SLOGAN -->
<section class="page">
  <div class="rh"><span>Aret\u0113 Brand Guide</span><span>Name and slogan</span></div>
  <p class="kicker">02 / The name</p>
  <h2>Aret\u0113</h2>
  <p class="lede">From the Greek \u1f00\u03c1\u03b5\u03c4\u03ae: excellence realized through struggle and pursuit,
  rather than excellence handed to you. That is the whole positioning. The app does not just log
  workouts, it measures the pursuit and marks progress toward it.</p>

  <div class="two block">
    <div>
      <h3>Spelling</h3>
      <p>The <strong>\u0113</strong> is a macron e (U+0113), not a plain "e". Use the macron in all UI copy,
      marketing copy and prose.</p>
      <p style="margin-top:8px">Drop it only where the character set cannot render it, such as file
      names, bundle identifiers and URLs. Those use the plain form: <span class="mono">aretefitnessapp.com</span>,
      <span class="mono">com.aretefitness.app</span>.</p>
    </div>
    <div>
      <h3>Pronunciation</h3>
      <p><em>ar-eh-TAY.</em> Three syllables, stress on the last.</p>
      <h3 style="margin-top:16px">In copy</h3>
      <p>The brand is <strong>Aretē</strong> on its own, with the macron, in mixed case.
      "Fitness App" belongs to the domain, not the name.</p>
    </div>
  </div>

  <div class="rule"></div>

  <p class="kicker">03 / The slogan</p>
  <h2 style="font-size:21pt">Pursue Excellence</h2>
  <p class="lede" style="margin-bottom:18px">The name translated into an instruction. It stands on its own
  without the app beside it and does not go stale as features change.</p>

  <div class="two">
    <div>
      <h3>Setting</h3>
      <p>Title case, two words, with no trailing period when it stands alone. Uppercase in
      eyebrows and small labels. Beside the wordmark on dark grounds, it sits below the mark.</p>
    </div>
    <div>
      <h3>Wording</h3>
      <p>The two words are fixed. It is always "Pursue Excellence", with nothing added and no
      punctuation of its own. Where it meets another line, it ends in a period and the next line
      starts fresh.</p>
    </div>
  </div>

  <div style="margin-top:18px">
    <h3>Supporting lines</h3>
    <table>
      <tr><td class="k" style="width:1.35in">Extended</td><td>Pursue excellence. Track every rep.</td></tr>
      <tr><td class="k">Descriptor</td><td>Aret\u0113 is a workout tracking app focused on helping you measure and
      pursue excellence in your training.</td></tr>
    </table>
  </div>

  <div class="folio"><span>Aret\u0113</span><span>3</span></div>
</section>

<!-- 4. LOGO -->
<section class="page">
  <div class="rh"><span>Aret\u0113 Brand Guide</span><span>Logo</span></div>
  <p class="kicker">04 / Logo</p>
  <h2>The mark</h2>
  <p class="lede">The "A" crossbar is a literal barbell, with weight plates as the crossbar ends.
  The monogram <em>is</em> the equipment, not a barbell icon placed beside a letter. Keep that
  construction intact if the mark is ever redrawn.</p>

  <div class="two block">
    <div class="markbox"><img src="{MARK_WHITE}" alt="White wordmark">
      <div class="cap">White &middot; on dark</div></div>
    <div class="markbox light"><img src="{MARK_INK}" alt="Ink wordmark">
      <div class="cap">Ink &middot; on light</div></div>
  </div>

  <div class="two block" style="align-items:start">
    <div>
      <h3>Two variants only</h3>
      <table>
        <tr><td class="k">White</td><td>On <span class="mono">#0D0D0D</span>, <span class="mono">#141416</span>,
          <span class="mono">#1C1C1E</span></td></tr>
        <tr><td class="k">Ink</td><td>On <span class="mono">#F2F2F7</span>, <span class="mono">#FFFFFF</span>,
          cream</td></tr>
      </table>
      <p class="muted" style="margin-top:9px;font-size:8.8pt">Never place either variant on an accent
      fill, or on a photo without a dark overlay of at least 60%.</p>

      <h3 style="margin-top:17px">Clear space and minimum size</h3>
      <p style="font-size:9pt">The unit <strong>x</strong> is the height of the lowercase "e", about 38% of the
      wordmark's height. Keep at least <strong>1x</strong> clear on every side.</p>
      <table style="margin-top:8px">
        <tr><th>Mark</th><th>Digital</th><th>Print</th></tr>
        <tr><td class="k">Wordmark</td><td>28 px tall</td><td>20 mm wide</td></tr>
        <tr><td class="k">Icon</td><td>20 px</td><td>6 mm</td></tr>
      </table>
    </div>
    <div>
      <div class="markbox iconbox" style="padding:20px"><img src="{ICON}" alt="Icon mark">
        <div class="cap">Icon mark</div></div>
      <h3 style="margin-top:17px">Keeping it intact</h3>
      <p style="font-size:9pt">Use the supplied files as they are: original proportions, upright,
      flat white or ink with no effects. Accent colors and PR gold stay out of the mark. The barbell
      and the "A" are one drawing, and "ret\u0113" is artwork with its macron, not live type.</p>
    </div>
  </div>

  <div class="folio"><span>Aret\u0113</span><span>4</span></div>
</section>

<!-- 5. COLOR -->
<section class="page">
  <div class="rh"><span>Aret\u0113 Brand Guide</span><span>Color</span></div>
  <p class="kicker">05 / Color</p>
  <h2>Green is the constant</h2>
  <p class="lede">Inside the app, users pick their own accent from eight presets and the whole UI
  re-themes around it. Anywhere outside the app, where one fixed color is needed, Green is canonical.</p>

  <div class="hero-sw block">
    <div class="chip"></div>
    <div>
      <h3 style="font-size:13pt">Aret\u0113 Green</h3>
      <p class="mono" style="font-size:10pt;color:#30D158">#30D158</p>
      <p style="margin-top:7px;font-size:8.9pt">Marketing accent on dark. Black text on the fill.
      Contrast 9.10 on <span class="mono">#141416</span>. Never set bright green text on a light background.</p>
    </div>
  </div>

  <h3>Gold is achievement, and only achievement</h3>
  <div class="grid4 block" style="margin-top:11px">
    <div><div class="sw" style="background:#f9de73"></div><div class="sw-lab">PR gold</div><div class="sw-hex">#f9de73</div></div>
    <div><div class="sw" style="background:#ad9206"></div><div class="sw-lab">PR gold text</div><div class="sw-hex">#ad9206</div></div>
    <div><div class="sw" style="background:#FFF3C4"></div><div class="sw-lab">PR gold bg</div><div class="sw-hex">#FFF3C4</div></div>
    <div><div class="sw" style="background:#FFD700"></div><div class="sw-lab">Aret\u0113 rank gold</div><div class="sw-hex">#FFD700</div></div>
  </div>
  <p class="muted" style="font-size:8.8pt;margin-top:-10px">Two distinct golds. PR gold marks a personal
  record. The brighter rank gold is reserved for the single highest rank, so it reads as rarer.</p>

  <div class="rule"></div>

  <h3>Neutrals, the default marketing surface</h3>
  <div class="grid5" style="margin-top:11px">
    <div><div class="sw" style="background:#0D0D0D"></div><div class="sw-lab">Background</div><div class="sw-hex">#0D0D0D</div></div>
    <div><div class="sw" style="background:#1C1C1E"></div><div class="sw-lab">Surface</div><div class="sw-hex">#1C1C1E</div></div>
    <div><div class="sw" style="background:#2C2C2E"></div><div class="sw-lab">Border</div><div class="sw-hex">#2C2C2E</div></div>
    <div><div class="sw" style="background:#F2F2F7"></div><div class="sw-lab">Text primary</div><div class="sw-hex">#F2F2F7</div></div>
    <div><div class="sw" style="background:#8E8E93"></div><div class="sw-lab">Text secondary</div><div class="sw-hex">#8E8E93</div></div>
  </div>

  <div class="folio"><span>Aret\u0113</span><span>5</span></div>
</section>

<!-- 6. TYPE -->
<section class="page">
  <div class="rh"><span>Aret\u0113 Brand Guide</span><span>Typography</span></div>
  <p class="kicker">06 / Typography</p>
  <h2>One family for marketing</h2>
  <p class="lede">Archivo carries every marketing surface. The product UI uses the operating system
  font, so the app loads no custom typeface at all.</p>

  <div class="spec">
    <div class="spec-lab">Headlines &middot; Archivo Black &middot; sentence case</div>
    <div class="s-black">Track every rep</div>
  </div>
  <div class="spec">
    <div class="spec-lab">Subheads &middot; Archivo Bold 700</div>
    <div class="s-bold">Measure your excellence</div>
  </div>
  <div class="spec">
    <div class="spec-lab">Slogan and labels &middot; Archivo SemiBold 600 &middot; 112% width</div>
    <div class="s-semi">Pursue Excellence</div>
  </div>
  <div class="spec">
    <div class="spec-lab">Stat numbers &middot; Archivo ExtraBold 800 &middot; 75% width</div>
    <div class="s-xb">285 lbs</div>
  </div>
  <div class="spec">
    <div class="spec-lab">Body &middot; system font</div>
    <div class="s-body">Log strength and cardio workouts, track personal records, and monitor
    progress over time.</div>
  </div>

  <div class="rule"></div>
  <div class="two">
    <div>
      <h3>Loading</h3>
      <p class="mono" style="font-size:7.6pt;line-height:1.5">fonts.googleapis.com/css2?family=<br>Archivo+Black&amp;family=Archivo:<br>wdth,wght@62..125,600..800</p>
      <p style="margin-top:8px;font-size:8.8pt">Fallbacks: <span class="mono">'Archivo Black','Arial Black',sans-serif</span>
      for headlines, Archivo then the system stack elsewhere.</p>
    </div>
    <div>
      <h3>Scope</h3>
      <p style="font-size:9pt">Archivo Black is for headlines only. Paragraphs and buttons use the
      lighter Archivo weights or the system font. Archivo is the only display face, and when it is
      unavailable the fallback stack takes over. Round geometric faces such as Poppins or Montserrat
      clash with its squared shapes.</p>
    </div>
  </div>

  <div class="folio"><span>Aret\u0113</span><span>6</span></div>
</section>

<!-- 7. VOICE -->
<section class="page">
  <div class="rh"><span>Aret\u0113 Brand Guide</span><span>Voice</span></div>
  <p class="kicker">07 / Voice</p>
  <h2>Confident, never hyped</h2>
  <p class="lede">The achievement is the excitement. Aret\u0113 states what happened and what it means,
  and lets the number carry the weight.</p>

  <div class="two block">
    <div>
      <h3>Principles</h3>
      <ul>
        <li><strong>Confident, not hype-y.</strong> No exclamation points, nothing "revolutionary"</li>
        <li><strong>Benefit first.</strong> Say what the user gets before naming the mechanism</li>
        <li><strong>Plain and short</strong>, except for the app's own vocabulary: Greek Rank,
          Strength Score. Those are used directly and explained once</li>
        <li><strong>Second person, active voice</strong></li>
      </ul>
    </div>
    <div>
      <h3>Rules</h3>
      <ul>
        <li>Celebrate with the number, not punctuation. No emoji in UI copy</li>
        <li><strong>No em dashes in user-facing text.</strong> Use a period, colon or middle dot</li>
        <li>Title Case for buttons and titles. Sentence case, ending in a period, for messages
          and empty states</li>
        <li>Errors name what failed and what to do next</li>
        <li>Empty states point to the next step</li>
        <li>US spelling</li>
      </ul>
    </div>
  </div>

  <h3>In practice</h3>
  <table class="vt" style="margin-top:9px">
    <tr><th style="width:1.5in">Where</th><th>How it reads</th></tr>
    <tr><td class="k">Daily reminder</td><td class="on">Time to train</td></tr>
    <tr><td class="k">Workout summary</td><td class="on">Workout complete.</td></tr>
    <tr><td class="k">Rank up</td><td class="on">You've reached Elite</td></tr>
    <tr><td class="k">PR banner</td><td class="on">New PR: Max Weight</td></tr>
    <tr><td class="k">Error</td><td class="on">Couldn't Load Workouts / Check your connection and try again.</td></tr>
    <tr><td class="k">Empty state</td><td class="on">No templates yet. Save a workout as a template to reuse it.</td></tr>
  </table>

  <p class="muted" style="margin-top:14px;font-size:8.8pt">Preferred words: <strong style="color:#C7C7CC">workout</strong>
  (not session), <strong style="color:#C7C7CC">exercise</strong> (not movement),
  <strong style="color:#C7C7CC">PR</strong> (not personal best), <strong style="color:#C7C7CC">bodyweight</strong>
  (one word), <strong style="color:#C7C7CC">225 lbs</strong> (lowercase, with a space).</p>

  <div class="folio"><span>Aret\u0113</span><span>7</span></div>
</section>

<!-- 8. MARKETING -->
<section class="page">
  <div class="rh"><span>Aret\u0113 Brand Guide</span><span>Marketing</span></div>
  <p class="kicker">08 / Marketing</p>
  <h2>Free to start, Premium to go further</h2>
  <p class="lede">The free app is a complete tracker, and that is worth saying out loud. Premium
  is pitched as the coach and the ranking, never as unlocking the basics.</p>

  <table class="fp block">
    <tr><th>Feature</th><th style="width:1.35in">Free</th><th style="width:1.35in">Premium</th></tr>
    <tr><td class="k">Strength, cardio and GPS logging, PRs, Greek Rank, share cards</td><td class="yes">Included</td><td class="yes">Included</td></tr>
    <tr><td class="k">Workout templates</td><td>Up to 5</td><td class="yes">Unlimited</td></tr>
    <tr><td class="k">Routines</td><td>Up to 2</td><td class="yes">Unlimited</td></tr>
    <tr><td class="k">Strength Score and Endurance Score</td><td class="muted">Headline score</td><td class="yes">Full breakdown</td></tr>
    <tr><td class="k">AI Coach workouts, routines and insights</td><td class="muted">Not included</td><td class="yes">Included</td></tr>
    <tr><td class="k">Weekly muscle volume</td><td class="muted">Sets per muscle</td><td class="yes">MEV, MAV, MRV zones</td></tr>
  </table>

  <div class="two block">
    <div>
      <h3>Imagery</h3>
      <p>At launch, marketing shows the product itself: real app screens with realistic data (a new
      PR, a Strength Score, a routine), Archivo headlines and the wordmark on a dark background.
      No stock fitness photography. Gold appears only on PRs and rank ups.</p>
      <p style="margin-top:8px">Later photography is shot in-house: real lifters in real gyms, low
      directional light, black and white by default, candid effort rather than posing.</p>
    </div>
    <div>
      <h3>Share cards</h3>
      <p>Users share five cards straight from the app: PR, workout, weekly summary, Strength Score and
      cardio. Each is dark, carries the wordmark and <span class="mono">aretefitnessapp.com</span>, and leads
      with one large number. Reposting them is the easiest social proof there is.</p>
    </div>
  </div>

  <h3>Sample copy</h3>
  <table class="vt" style="margin-top:8px">
    <tr><th style="width:1.5in">Where</th><th>How it reads</th></tr>
    <tr><td class="k">App Store subtitle</td><td class="on">Lifting and cardio, ranked</td></tr>
    <tr><td class="k">Ad headline</td><td class="on">See where your lifts rank.</td></tr>
    <tr><td class="k">Instagram caption</td><td class="on">Your squat has a percentile. Find out what it is.</td></tr>
    <tr><td class="k">Trial offer</td><td class="on">Try Premium free for a week with the annual plan.</td></tr>
    <tr><td class="k">Free tier</td><td class="on">Every workout, every run, every PR. Free.</td></tr>
  </table>
  <p class="muted" style="margin-top:12px;font-size:8.6pt">Any number quoted in public copy must be a real
  result from the app, never an invented one.</p>

  <div class="folio"><span>Aret\u0113</span><span>8</span></div>
</section>

<!-- 9. RANKS + CONTACT -->
<section class="page">
  <div class="rh"><span>Aret\u0113 Brand Guide</span><span>Ranks</span></div>
  <p class="kicker">09 / Progression</p>
  <h2>Two ladders</h2>
  <p class="lede">The naming rises from mortal to hero to divine, and finally to the abstract virtue
  itself. Nothing goes above Aret\u0113. Greek vocabulary is for ranks only. Features keep plain names:
  "Coach", not "Oracle".</p>

  <div class="two">
    <div>
      <h3>Greek Rank <span class="muted" style="font-weight:400">&middot; whole account</span></h3>
      <div style="margin-top:8px">{rank_rows}</div>
    </div>
    <div>
      <h3>Strength and Endurance Score <span class="muted" style="font-weight:400">&middot; percentile</span></h3>
      <div class="ladder" style="margin-top:10px">
        {"".join(f'<span class="step">{s}</span>' for s in STRENGTH)}
      </div>
      <p style="margin-top:10px;font-size:8.8pt">Both scores share these six tiers. The Strength Score
      ranks lifts and the Endurance Score ranks running pace. A score of 70 means stronger or faster than
      70% of comparable lifters or runners.</p>
      <p style="margin-top:6px;font-size:8.8pt">The Endurance Score reads running only, at eight distances
      from 400 m to the marathon. The best result at 5K or longer counts for 70% and the best short
      distance for 30%.</p>
      <p style="margin-top:6px;font-size:8.8pt">Neither adds to Greek Rank, but the higher of the two
      must be strong enough to reach Titan and Aret\u0113.</p>
      <h3 style="margin-top:20px">Naming rules</h3>
      <ul>
        <li>Extend an existing ladder rather than inventing a third</li>
        <li>Gold is only ever the top tier</li>
        <li>Color never identifies a tier alone. Pair it with an icon or letter</li>
        <li>Capitalize ranks as proper nouns</li>
      </ul>
    </div>
  </div>

  <div class="rule" style="margin:14px 0 14px"></div>

  <h3>Contact</h3>
  <table class="contact" style="margin-top:8px;max-width:4.6in">
    <tr><td class="k" style="width:1.3in">Web</td><td class="mono">aretefitnessapp.com</td></tr>
    <tr><td class="k">Support</td><td class="mono">support@aretefitnessapp.com</td></tr>
    <tr><td class="k">Instagram</td><td class="mono">@aretefitnessapp</td></tr>
    <tr><td class="k">App Store</td><td class="mono">apps.apple.com/app/id6744030558</td></tr>
  </table>


  <div class="folio"><span>Aret\u0113</span><span>9</span></div>
</section>

</body>
</html>
"""

(OUT / 'guide.html').write_text(HTML, encoding='utf-8')
print('wrote guide.html', len(HTML), 'bytes')
