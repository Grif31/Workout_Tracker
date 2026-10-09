// Categorical data-viz palette (CVD-validated), NOT a themed UI color: chart
// series need fixed, checked hues rather than the accent-derived theme tokens.
// Used where a chart splits one total into a few named parts (Weekly Summary's
// muscle donut, the push / pull / legs bar), so the two read as one system.
// "Other" (a folded-tail bucket) gets muted gray instead of a 6th hue since it
// isn't a real distinct entity worth a scarce categorical slot.
export const CATEGORICAL_COLORS = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
  otherLight: '#898781',
  otherDark: '#898781',
};
