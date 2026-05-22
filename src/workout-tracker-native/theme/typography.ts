export const typography = {
  fontSize: {
    xs:  11,  // micro labels, axis text, badges
    sm:  14,  // secondary body text
    md:  16,  // primary body text
    lg:  20,  // screen titles
    xl:  22,  // stat values, large labels
    xxl: 28,  // display numbers
  },
  fontWeight: {
    regular: '400' as const,
    bold: 'bold' as const,
  },
  title:  { fontSize: 30 },
  body:   { fontSize: 15 },
  button: { fontSize: 16, fontWeight: '600' as const },
};
