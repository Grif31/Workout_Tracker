// DRAFT: the owner is reviewing this copy before release.
// Settings paths in answers must match the Settings screen's section and row names.
export type FaqItem = { question: string; answer: string };

export const FAQ: FaqItem[] = [
  {
    question: 'What is Aretē?',
    answer:
      'Aretē is a training log for lifting and cardio. Log strength workouts, timed holds and GPS runs, rides and walks, '
      + 'track your personal records, and see how your training adds up with your Strength Score, Endurance Score and Greek Rank.',
  },
  {
    question: "What's free, and what does Premium add?",
    answer:
      'Logging workouts, GPS activities, personal records, templates, routines and your workout history are free. '
      + 'Premium adds the AI Coach, the weekly review, advanced stats, and the full breakdown of your Strength and Endurance Scores. '
      + 'Premium is available monthly, yearly or as a one-time lifetime purchase.',
  },
  {
    question: 'How do I cancel or restore my subscription?',
    answer:
      'Subscriptions are managed by Apple. Open the iPhone Settings app, tap your name, then Subscriptions. '
      + "Premium stays on until the end of the period you've paid for. "
      + 'On a new phone, open the Premium screen in Aretē and tap Restore Purchases.',
  },
  {
    question: 'How are personal records counted?',
    answer:
      'For lifts, Aretē tracks your heaviest weight and your most reps at each weight. '
      + 'For runs and rides, it tracks your best time at standard distances and your longest distance. '
      + 'Editing or deleting a workout recalculates your records.',
  },
  {
    question: 'What is the Greek Rank?',
    answer:
      'Your Greek Rank is a score from 0 to 100 built from how consistently you train, how often you train, and how much work you do. '
      + 'The ranks are Neophyte, Athlete, Hero, Demigod, Olympian, Titan and Aretē. '
      + 'Titan and Aretē also need a high Strength or Endurance Score.',
  },
  {
    question: 'How are the Strength and Endurance Scores worked out?',
    answer:
      'They compare your best lifts and your best times with standards for people of your gender, age and bodyweight. '
      + 'Add these to your profile to see your scores.',
  },
  {
    question: 'How do I switch between kg and lbs?',
    answer:
      'Go to Settings, Preferences and use the Weight Unit switch. Your past workouts, records and bodyweight are converted to the new unit.',
  },
  {
    question: 'How can I see my stats for one exercise?',
    answer:
      'Open the Progress tab, choose Exercises and tap the exercise. You will see your history, records and charts of your progress over time.',
  },
  {
    question: "What's the difference between a template and a routine?",
    answer:
      'A template is one saved workout you can start again whenever you like. '
      + 'A routine is a set of workout days you go through in order, like Push, Pull, Legs.',
  },
  {
    question: 'How do I create a routine?',
    answer:
      'Open the Coach tab, choose Plans and tap New next to Routines. Add your days and the exercises for each one.',
  },
  {
    question: 'How do routines work?',
    answer:
      "A routine's days are a rotation, not a weekly calendar. Up Next is the day after the last one you logged, whenever that was. "
      + 'After 14 days without training, the routine starts again from day 1.',
  },
  {
    question: 'Can I take notes during a workout?',
    answer:
      "Yes. Open an exercise's menu during your workout and tap Add Notes. The notes are saved with the workout.",
  },
  {
    question: 'How do supersets work?',
    answer:
      "During a workout, open an exercise's menu, tap Superset With and pick the exercise to pair it with. "
      + 'Partners are marked A1, A2 and sit together in your log. Rest starts once you finish a round, one set of each. '
      + 'For a short rest between partners, go to Settings, Preferences, Workout and set Rest Between Superset Exercises. '
      + 'Templates and routines keep their supersets.',
  },
  {
    question: 'Can I create my own exercises?',
    answer:
      'Yes. Open the Progress tab, choose Exercises and tap Create, or create one while adding exercises to a workout. '
      + 'Your custom exercises are only visible to you.',
  },
  {
    question: 'Can I create bodyweight exercises?',
    answer:
      'Yes. When creating an exercise, pick Bodyweight as the equipment, or Weighted for moves like weighted pull-ups. '
      + 'Your bodyweight then counts toward the volume for those sets.',
  },
  {
    question: 'How do I delete a custom exercise?',
    answer:
      'Open the Progress tab, choose Exercises, tap the exercise and tap Delete. Past workouts that used it are not changed.',
  },
  {
    question: 'Can I edit a workout after saving it?',
    answer:
      'Yes. Open the workout, tap the menu and choose Edit Workout. Your personal records are updated to match.',
  },
  {
    question: 'Can I bring my workouts from Hevy or Strong?',
    answer:
      'Yes. Export your workouts as a CSV file from Hevy or Strong, then go to Settings, Account, Import Data and pick the file. '
      + 'Importing the same file twice skips the workouts you already have.',
  },
  {
    question: 'Does Aretē work with Apple Health?',
    answer:
      'Yes. Turn on Sync to Apple Health in Settings, under Preferences. Finished workouts are saved to Apple Health, '
      + 'and heart rate from your watch is added to your workouts.',
  },
  {
    question: "What happens if I'm offline?",
    answer:
      "You can keep logging. A workout saved without a connection is kept on your phone and uploads automatically when you're back online.",
  },
  {
    question: 'Is my data private?',
    answer:
      "Your data is sent over an encrypted connection and we don't sell it. The Privacy Policy, under About in Settings, has the details.",
  },
  {
    question: 'How do I export or delete my data?',
    answer:
      'Go to Settings, Account. Export Data gives you a copy of your workouts. '
      + 'Delete Account removes your account, workouts and photos from our servers straight away.',
  },
  {
    question: 'I forgot my password. What do I do?',
    answer:
      "On the sign-in screen, tap Forgot Password? and we'll email you a link to reset it. "
      + "If you signed up with Apple or Google, there's no password: sign in with the same button again.",
  },
  {
    question: 'How do I contact someone for help?',
    answer:
      'Go to Settings, Help and tap Contact Us, or email support@aretefitnessapp.com.',
  },
];
