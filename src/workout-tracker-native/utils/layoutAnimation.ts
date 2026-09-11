import { LayoutAnimation, Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Call right before a state update that adds/removes rows so the height change
// animates instead of snapping.
//
// NOT for expand/collapse of a single container — use components/Collapsible
// there. LayoutAnimation drives the container's height and the children's fade
// on separate timelines, so the content ends up hanging over an already-shrunk
// box. Its strength is the opposite case: many sibling rows each sliding to a
// different new position, which it diffs and animates natively for free.
export function animateNextLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

// Inserting/removing one row in a list: the row itself fades while its siblings
// slide to their new positions. Shorter than the 300ms easeInEaseOut preset —
// a set row is small, and 300ms reads as sluggish mid-workout.
export function animateNextRowChange() {
  LayoutAnimation.configureNext({
    duration: 200,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'easeInEaseOut' },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  });
}
