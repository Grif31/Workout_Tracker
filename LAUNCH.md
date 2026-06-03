# Aretē — Launch Timeline

---

## Week 1 — Build & Test (May 22–28)

### Day 1-2: Fix Dev Build
- [x] Resolve EAS build errors
- [x] Install dev build `.ipa` on iPhone
- [x] Connect to local Metro server (`npx expo start`)
- [ ] Confirm hot reload works

### Day 3-5: Full Device Testing
- [x] Test every screen end to end on your phone
- [x] Test against live Railway backend
- [x] Test dark mode + light mode
- [x] Test all notifications (rest timer, workout reminders)
- [x] Test workout log → save → summary → details flow
- [x] Test AI workout generation
- [ ] Test profile picture upload
- [ ] Test data export (CSV)
- [ ] Fix any bugs found

### Day 6-7: Finish Remaining Features
- [x] TrainingScreen — Strength Score entry card
- [x] ProfileScreen — Greek rank badge pill
- [x] WorkoutSummaryScreen — rank badge row

---

## Week 2 — TestFlight & Feedback (May 29 – June 4)

### Day 1: Preview Build
- [ ] Confirm `EXPO_PUBLIC_API_URL` points to Railway production URL
- [ ] Run `eas build --profile preview --platform ios`
- [ ] Submit to TestFlight: `eas submit --platform ios`
- [ ] Wait for Apple review (~24 hours)

### Day 2-3: Send to Testers
- [ ] Add testers in App Store Connect → TestFlight → External Testing
- [ ] Send invite links to testers
- [ ] Create a simple feedback form (Google Form)

### Day 4-7: Collect & Fix Feedback
- [ ] Monitor crash reports in App Store Connect
- [ ] Fix bugs reported by testers
- [ ] Push JS fixes (hot reload — no new build needed)
- [ ] Submit updated build to TestFlight if native changes were made

---

## Week 3 — App Store Submission (June 5–11)

### Day 1-2: App Store Connect Listing
- [ ] Log in to App Store Connect and create new app listing
- [ ] Write short description (30 chars max)
- [ ] Write long description (4000 chars max) — cover key features
- [ ] Choose category: **Health & Fitness**
- [ ] Set age rating: **4+**
- [ ] Add privacy policy URL: `https://aretefitnessapp.com/privacy`
- [ ] Add support URL: `https://aretefitnessapp.com`

### Day 2-3: Screenshots
- [ ] Take screenshots on iPhone (6.9" required, 6.5" recommended)
- [ ] Capture: Dashboard / home
- [ ] Capture: Live workout logging
- [ ] Capture: Exercise library
- [ ] Capture: Progress charts
- [ ] Capture: Strength Score screen
- [ ] Capture: Profile screen
- [ ] Optional: add text overlays in Figma
- [ ] Upload screenshots to App Store Connect

### Day 4: Production Build
- [ ] Run `eas build --profile production --platform ios`
- [ ] Submit: `eas submit --platform ios`

### Day 5-7: Apple Review
- [ ] Create a demo account for Apple reviewers
- [ ] Apple reviews (typically 1-3 days)
- [ ] Respond quickly if changes are requested
- [ ] Watch for common rejections: crashes on launch, missing privacy disclosures, demo account needed

---

## Week 4 — iOS Launch (June 12+)

- [ ] App approved — set release date or release immediately
- [ ] Share on social media
- [ ] Monitor reviews and ratings
- [ ] Plan first update based on user feedback

---

## Week 5+ — Android / Play Store

> The app is built for both platforms. Android submission just needs a Google service account connected to EAS.

### Setup (one-time)
- [ ] Create app in Google Play Console (play.google.com/console) under the same Google account
- [ ] Create a Google service account with "Release manager" role in Play Console → Setup → API access
- [ ] Download the service account JSON key
- [ ] Run `eas credentials --platform android` or add the key in Expo dashboard
- [ ] Add `android` block to `eas.json` submit config:
  ```json
  "android": {
    "serviceAccountKeyPath": "./path/to/service-account.json",
    "track": "internal"
  }
  ```

### Build & Submit
- [ ] Run `eas build --profile production --platform android`
- [ ] Submit: `eas submit --platform android`
- [ ] Fill out Play Store listing (description, screenshots at 1080×1920, feature graphic 1024×500)
- [ ] Set content rating, target audience, and data safety form
- [ ] Release to internal test track first, then promote to production

---

## Notes

- **JS/TS changes** (screens, components, logic) → hot reload, no new build needed
- **Native changes** (new packages, app.json plugins) → requires new EAS build
- **Apple review** typically 1-3 days; rejections add 1-2 days each
- **Google Play review** typically 1-3 days for first submission; updates are faster
- **Demo account:** create a test user on your Railway backend before submitting to either store
- **Android submission:** `eas.json` currently only has an `ios` submit block — add the `android` block (above) before running `eas submit --platform android`
