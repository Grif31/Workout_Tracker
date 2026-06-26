from flask import Blueprint, render_template_string

legal_bp = Blueprint('legal', __name__)

# ── Homepage ──────────────────────────────────────────────────────────────────

HOMEPAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aretē Fitness — Pursue Excellence</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif;
      background: #0D0D0D;
      color: #F2F2F7;
      line-height: 1.6;
    }

    /* ── Header ── */
    header {
      text-align: center;
      padding: 80px 24px 64px;
    }
    .logo img {
      height: clamp(56px, 12vw, 90px);
      width: auto;
      display: block;
      margin: 0 auto;
    }
    .tagline {
      margin-top: 14px;
      font-size: 1.1rem;
      color: #8E8E93;
      letter-spacing: 0.3px;
    }
    .cta-row {
      display: flex;
      gap: 14px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 40px;
    }
    .btn {
      display: inline-block;
      padding: 14px 30px;
      border-radius: 14px;
      font-size: 0.97rem;
      font-weight: 700;
      text-decoration: none;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.82; }
    .btn-green  { background: #30D158; color: #000; }
    .btn-ghost  { background: transparent; color: #F2F2F7; border: 1.5px solid #3A3A3C; }
    .btn-ghost:hover { border-color: #636366; opacity: 1; }

    /* ── Divider ── */
    .divider {
      height: 1px;
      background: #1C1C1E;
      max-width: 680px;
      margin: 0 auto;
    }

    /* ── Sections ── */
    .section {
      max-width: 680px;
      margin: 0 auto;
      padding: 64px 24px;
    }
    .section-label {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.4px;
      color: #30D158;
      margin-bottom: 10px;
    }
    .section-title {
      font-size: 1.75rem;
      font-weight: 800;
      color: #F2F2F7;
      margin-bottom: 24px;
      letter-spacing: -0.5px;
    }

    /* ── Support card ── */
    .support-card {
      background: #1C1C1E;
      border: 1px solid #2C2C2E;
      border-radius: 18px;
      padding: 36px 32px;
      text-align: center;
    }
    .support-card p {
      color: #8E8E93;
      font-size: 0.97rem;
      margin-bottom: 24px;
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
    }

    /* ── FAQ ── */
    .faq-list { display: flex; flex-direction: column; gap: 10px; }
    details {
      background: #1C1C1E;
      border: 1px solid #2C2C2E;
      border-radius: 14px;
      overflow: hidden;
    }
    details[open] { border-color: #3A3A3C; }
    summary {
      padding: 18px 20px;
      font-size: 0.97rem;
      font-weight: 600;
      color: #F2F2F7;
      cursor: pointer;
      list-style: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    summary::-webkit-details-marker { display: none; }
    .faq-icon {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #2C2C2E;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      color: #30D158;
      font-weight: 700;
      line-height: 1;
    }
    details[open] .faq-icon-plus  { display: none; }
    details:not([open]) .faq-icon-minus { display: none; }
    .faq-body {
      padding: 0 20px 18px;
      color: #8E8E93;
      font-size: 0.93rem;
      line-height: 1.7;
    }
    .faq-body a { color: #30D158; text-decoration: none; }
    .faq-body a:hover { text-decoration: underline; }

    /* ── Footer ── */
    footer {
      border-top: 1px solid #1C1C1E;
      text-align: center;
      padding: 36px 24px 48px;
    }
    .footer-links { display: flex; gap: 28px; justify-content: center; flex-wrap: wrap; }
    .footer-links a {
      color: #636366;
      text-decoration: none;
      font-size: 0.88rem;
      transition: color 0.15s;
    }
    .footer-links a:hover { color: #8E8E93; }
    .footer-copy {
      margin-top: 20px;
      font-size: 0.82rem;
      color: #3A3A3C;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <header>
    <div class="logo"><img src="/static/arete_name.png" alt="Aretē Fitness"></div>
    <p class="tagline">Pursue excellence. Track every rep.</p>
    <div class="cta-row">
      <a href="https://apps.apple.com/app/id6744030558" class="btn btn-green">Download on the App Store</a>
      <a href="mailto:support@aretefitnessapp.com" class="btn btn-ghost">Contact Support</a>
    </div>
  </header>

  <div class="divider"></div>

  <!-- Support -->
  <div class="section">
    <p class="section-label">Support</p>
    <h2 class="section-title">We're here to help</h2>
    <div class="support-card">
      <p>Have a question, found a bug, or want to request a feature? Send us an email and we'll get back to you as soon as possible.</p>
      <a href="mailto:support@aretefitnessapp.com" class="btn btn-green">support@aretefitnessapp.com</a>
    </div>
  </div>

  <div class="divider"></div>

  <!-- FAQ -->
  <div class="section">
    <p class="section-label">FAQ</p>
    <h2 class="section-title">Frequently Asked Questions</h2>
    <div class="faq-list">

      <details>
        <summary>
          What is Aretē Fitness?
          <span class="faq-icon">
            <span class="faq-icon-plus">+</span>
            <span class="faq-icon-minus">−</span>
          </span>
        </summary>
        <div class="faq-body">
          Aretē is a workout tracking app for iOS focused on helping you measure and pursue excellence in your training. Log strength and cardio workouts, track personal records, monitor your progress over time, and get AI-generated programs tailored to your goals.
        </div>
      </details>

      <details>
        <summary>
          Is Aretē free?
          <span class="faq-icon">
            <span class="faq-icon-plus">+</span>
            <span class="faq-icon-minus">−</span>
          </span>
        </summary>
        <div class="faq-body">
          The core workout logging features are free. Aretē Premium unlocks the AI Coach, AI-generated workout templates and routines, and additional customisation options. Premium is available as a monthly subscription, annual subscription, or one-time lifetime purchase.
        </div>
      </details>

      <details>
        <summary>
          What is the Greek Rank system?
          <span class="faq-icon">
            <span class="faq-icon-plus">+</span>
            <span class="faq-icon-minus">−</span>
          </span>
        </summary>
        <div class="faq-body">
          Your Greek Rank is a score from 0–100 that reflects your overall training excellence across consistency, strength, volume, and dedication. Ranks progress from Neophyte through Athlete, Hero, Demigod, Olympian, Titan, and finally Aretē — the pinnacle of training achievement.
        </div>
      </details>

      <details>
        <summary>
          How does the AI Coach work?
          <span class="faq-icon">
            <span class="faq-icon-plus">+</span>
            <span class="faq-icon-minus">−</span>
          </span>
        </summary>
        <div class="faq-body">
          The AI Coach (Premium) analyses your recent training history, personal records, and goals to generate personalised workout templates and full weekly routines. You can configure your goal, experience level, available equipment, and session length to get programs that fit your life.
        </div>
      </details>

      <details>
        <summary>
          Is my workout data secure?
          <span class="faq-icon">
            <span class="faq-icon-plus">+</span>
            <span class="faq-icon-minus">−</span>
          </span>
        </summary>
        <div class="faq-body">
          Yes. All data is transmitted over HTTPS and stored securely. Passwords are never stored in plain text. We do not sell your data or share it with third parties beyond what is necessary to operate the app (see our <a href="/privacy">Privacy Policy</a> for full details).
        </div>
      </details>

      <details>
        <summary>
          How do I cancel my subscription?
          <span class="faq-icon">
            <span class="faq-icon-plus">+</span>
            <span class="faq-icon-minus">−</span>
          </span>
        </summary>
        <div class="faq-body">
          Subscriptions are managed through the Apple App Store. Go to Settings → Apple ID → Subscriptions on your iPhone to cancel at any time. Your Premium access continues until the end of the current billing period.
        </div>
      </details>

      <details>
        <summary>
          How do I delete my account?
          <span class="faq-icon">
            <span class="faq-icon-plus">+</span>
            <span class="faq-icon-minus">−</span>
          </span>
        </summary>
        <div class="faq-body">
          You can delete your account from within the app (Settings → Account → Delete Account) or by emailing <a href="mailto:support@aretefitnessapp.com">support@aretefitnessapp.com</a>. All your data is permanently deleted within 30 days.
        </div>
      </details>

    </div>
  </div>

  <div class="divider"></div>

  <!-- Footer -->
  <footer>
    <div class="footer-links">
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms of Service</a>
      <a href="mailto:support@aretefitnessapp.com">Contact Support</a>
    </div>
    <p class="footer-copy">© 2025 Aretē Fitness. All rights reserved.</p>
  </footer>

</body>
</html>"""

# ── Legal pages ────────────────────────────────────────────────────────────────

STYLE = """
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         max-width: 780px; margin: 0 auto; padding: 40px 24px 80px;
         color: #1a1a1a; line-height: 1.7; }
  h1   { font-size: 2rem; font-weight: 700; margin-bottom: 4px; }
  h2   { font-size: 1.15rem; font-weight: 700; margin-top: 36px; margin-bottom: 8px; }
  p, li { font-size: 0.97rem; color: #333; }
  ul   { padding-left: 20px; }
  li   { margin-bottom: 6px; }
  .meta { font-size: 0.85rem; color: #888; margin-bottom: 40px; }
  a    { color: #007aff; }
"""

PRIVACY = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — Aretē Fitness</title>
  <style>{{ style }}</style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p class="meta">Aretē Fitness &nbsp;·&nbsp; Last updated: June 2026</p>

  <p>This Privacy Policy explains how Aretē Fitness ("we", "us", or "our") collects, uses, and protects
  your information when you use the Aretē app and website at aretefitnessapp.com. By using Aretē,
  you agree to the practices described below.</p>

  <h2>1. Information We Collect</h2>
  <p><strong>Account information:</strong> When you register, we collect your name, email address,
  and a securely hashed password. If you sign in with Apple or Google, we receive a unique identifier
  and, optionally, your name and email from those providers.</p>

  <p><strong>Fitness data:</strong> We store the workout data you log — exercises, sets, reps, weight,
  RPE, cardio duration, distance, and workout dates. We also store bodyweight entries, body
  measurements, and personal records you accumulate over time.</p>

  <p><strong>Profile information:</strong> Optionally, you may upload a profile picture and provide
  a bio. Profile pictures are stored securely on our servers.</p>

  <p><strong>GPS and location data:</strong> If you use the GPS cardio tracking feature, we collect
  your GPS route (encoded as a polyline) for that activity. Location access is only used during an
  active GPS workout session and only when you explicitly start one.</p>

  <p><strong>Health data:</strong> If you enable Apple Health or Android Health Connect sync, we
  read or write workout data to those platforms. This data stays on your device and is governed by
  Apple's and Google's respective privacy policies. We do not transmit raw health data to our servers.</p>

  <p><strong>Device token:</strong> To send you push notifications (rest timer alerts, workout
  reminders, re-engagement messages), we store a push notification token associated with your
  account.</p>

  <p><strong>Usage data:</strong> We do not collect analytics, crash reports, or behavioural
  tracking data beyond what is necessary to operate the service.</p>

  <h2>2. How We Use Your Information</h2>
  <ul>
    <li>To provide, maintain, and improve the Aretē app and its features</li>
    <li>To calculate your Strength Score, personal records, and progress statistics</li>
    <li>To generate AI-powered workout routines and templates (your preferences are sent to our AI service)</li>
    <li>To send push notifications you have opted into</li>
    <li>To process in-app purchases and manage your subscription status</li>
    <li>To respond to support requests sent to support@aretefitnessapp.com</li>
  </ul>

  <h2>3. Third-Party Services</h2>
  <ul>
    <li><strong>Anthropic</strong> — the AI Coach feature sends your training preferences (goal,
        experience level, equipment, schedule) and aggregated training statistics to Anthropic's
        Claude API to generate personalised workout suggestions and insights. No personal
        identifying information (name, email, or account ID) is included in these requests.
        See <a href="https://www.anthropic.com/privacy">anthropic.com/privacy</a>.</li>
    <li><strong>RevenueCat</strong> — manages in-app subscriptions and purchase verification.
        RevenueCat may receive your App Store account identifier and purchase history.
        See <a href="https://www.revenuecat.com/privacy">revenuecat.com/privacy</a>.</li>
    <li><strong>Expo / Expo Push Service</strong> — delivers push notifications to your device.</li>
    <li><strong>Apple Sign In / Google Sign In</strong> — optional sign-in methods. The respective
        privacy policies of Apple and Google apply.</li>
    <li><strong>Railway</strong> — our backend infrastructure and database hosting provider.
        Data is stored on Railway's servers. See <a href="https://railway.app/legal/privacy">railway.app/legal/privacy</a>.</li>
  </ul>

  <h2>4. Data Retention</h2>
  <p>We retain your account and fitness data for as long as your account is active. You may
  export your data at any time from Settings → Account → Export Data. You may delete your
  account directly in the app (Settings → Account → Delete Account) or by contacting us at
  <a href="mailto:support@aretefitnessapp.com">support@aretefitnessapp.com</a>; all account
  and fitness data is permanently deleted within 30 days.</p>

  <h2>5. Data Security</h2>
  <p>Passwords are hashed using industry-standard algorithms and never stored in plain text.
  All data is transmitted over HTTPS. Access to the database is restricted to authorised
  infrastructure only.</p>

  <h2>6. Children's Privacy</h2>
  <p>Aretē is not directed at children under 13. We do not knowingly collect personal information
  from children under 13. If you believe a child has provided us with personal information, please
  contact us and we will delete it promptly.</p>

  <h2>7. Your Rights</h2>
  <ul>
    <li>Export your workout data as CSV (Settings → Account → Export Data)</li>
    <li>Update your profile information (Settings → Account → Edit Profile)</li>
    <li>Delete your account and all associated data in-app (Settings → Account → Delete Account)</li>
    <li>Opt out of push notifications at any time via your device settings or the in-app notification settings</li>
    <li>Contact us at <a href="mailto:support@aretefitnessapp.com">support@aretefitnessapp.com</a> for any privacy-related requests</li>
  </ul>

  <h2>8. Changes to This Policy</h2>
  <p>We may update this Privacy Policy from time to time. We will notify you of significant changes
  by posting the new policy on this page with an updated date. Continued use of Aretē after changes
  constitutes acceptance of the updated policy.</p>

  <h2>9. Contact Us</h2>
  <p>If you have questions about this Privacy Policy, please contact us at:<br>
  <a href="mailto:support@aretefitnessapp.com">support@aretefitnessapp.com</a></p>
</body>
</html>"""

TERMS = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service — Aretē Fitness</title>
  <style>{{ style }}</style>
</head>
<body>
  <h1>Terms of Service</h1>
  <p class="meta">Aretē Fitness &nbsp;·&nbsp; Last updated: June 2026</p>

  <p>These Terms of Service ("Terms") govern your use of the Aretē Fitness mobile application
  and website at aretefitnessapp.com (collectively, the "Service"), operated by Aretē Fitness ("we",
  "us", or "our"). By creating an account or using the Service, you agree to these Terms.</p>

  <h2>1. Eligibility</h2>
  <p>You must be at least 13 years old to use Aretē. By using the Service, you represent that
  you meet this requirement and that all information you provide is accurate.</p>

  <h2>2. Account Registration</h2>
  <p>You are responsible for maintaining the confidentiality of your account credentials and for
  all activity that occurs under your account. Notify us immediately at
  <a href="mailto:support@aretefitnessapp.com">support@aretefitnessapp.com</a> if you suspect
  unauthorised access.</p>

  <h2>3. Subscriptions and Billing</h2>
  <p>Aretē offers optional premium subscriptions (monthly and annual) and a one-time lifetime
  purchase, processed through the Apple App Store via RevenueCat.</p>
  <ul>
    <li><strong>Free trial:</strong> New subscribers may receive a free trial period. The trial
        automatically converts to a paid subscription unless cancelled at least 24 hours before
        the trial ends.</li>
    <li><strong>Auto-renewal:</strong> Subscriptions automatically renew at the end of each billing
        period unless cancelled at least 24 hours before renewal. Payment is charged to your Apple
        ID at confirmation of purchase.</li>
    <li><strong>Cancellation:</strong> You may cancel your subscription at any time through your
        Apple ID account settings. Cancellation takes effect at the end of the current billing
        period; no partial refunds are issued.</li>
    <li><strong>Refunds:</strong> All purchases are subject to Apple's refund policies. We do not
        process refunds directly.</li>
    <li><strong>Price changes:</strong> We reserve the right to change subscription pricing with
        reasonable advance notice.</li>
  </ul>

  <h2>4. Acceptable Use</h2>
  <p>You agree not to:</p>
  <ul>
    <li>Use the Service for any unlawful purpose</li>
    <li>Attempt to gain unauthorised access to any part of the Service or its infrastructure</li>
    <li>Reverse-engineer, decompile, or disassemble any part of the Service</li>
    <li>Upload content that is harmful, offensive, or infringes on third-party rights</li>
    <li>Use automated tools to scrape or extract data from the Service</li>
  </ul>

  <h2>5. Health and Fitness Disclaimer</h2>
  <p><strong>Aretē is not a medical service.</strong> The information and features provided —
  including workout suggestions, AI-generated routines, strength scores, and progress tracking —
  are for general fitness and informational purposes only. They are not a substitute for
  professional medical advice, diagnosis, or treatment. AI-generated content is produced by
  Anthropic's Claude model and may not always reflect current exercise science best practices;
  use it as a starting point, not a prescription. Consult a qualified healthcare provider
  before starting any new exercise programme, especially if you have a medical condition or injury.
  You use the Service at your own risk.</p>

  <h2>6. Intellectual Property</h2>
  <p>All content, design, software, and trademarks within the Service are owned by or licensed
  to Aretē Fitness. You may not copy, modify, distribute, or create derivative works without our
  express written permission. Your workout data remains yours; you may export it at any time from
  Settings → Account → Export Data.</p>

  <h2>7. User Content</h2>
  <p>By uploading a profile picture or other content to the Service, you grant us a limited,
  non-exclusive licence to store and display that content solely for the purpose of operating
  the Service. We do not claim ownership of your personal fitness data.</p>

  <h2>8. Termination</h2>
  <p>We reserve the right to suspend or terminate your account if you violate these Terms. You
  may delete your account at any time by contacting support@aretefitnessapp.com. Upon termination,
  your data will be deleted within 30 days.</p>

  <h2>9. Disclaimers and Limitation of Liability</h2>
  <p>The Service is provided "as is" without warranties of any kind. To the fullest extent
  permitted by law, Aretē Fitness is not liable for any indirect, incidental, special, or
  consequential damages arising from your use of the Service, including but not limited to
  loss of data, personal injury, or property damage resulting from fitness activities.</p>

  <h2>10. Changes to These Terms</h2>
  <p>We may update these Terms from time to time. We will notify you of material changes by
  posting the updated Terms on this page. Continued use of the Service after changes are posted
  constitutes your acceptance of the new Terms.</p>

  <h2>11. Governing Law</h2>
  <p>These Terms are governed by the laws of the United States. Any disputes shall be resolved
  in the jurisdiction where Aretē Fitness operates.</p>

  <h2>12. Contact Us</h2>
  <p>Questions about these Terms? Contact us at:<br>
  <a href="mailto:support@aretefitnessapp.com">support@aretefitnessapp.com</a></p>
</body>
</html>"""


@legal_bp.route('/')
def homepage():
    return HOMEPAGE


@legal_bp.route('/privacy')
def privacy():
    return render_template_string(PRIVACY, style=STYLE)


@legal_bp.route('/terms')
def terms():
    return render_template_string(TERMS, style=STYLE)
