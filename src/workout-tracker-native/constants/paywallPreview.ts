import type { PurchasesOfferings } from 'react-native-purchases';

// Sample plans for PAYWALL_PREVIEW. Made-up prices: the real ones come from
// App Store Connect. Annual carries a free week so the trial UI shows.
const pkg = (packageType: string, identifier: string, price: number, intro?: object) => ({
  packageType,
  identifier: packageType,
  product: {
    identifier,
    price,
    priceString: `$${price.toFixed(2)}`,
    currencyCode: 'USD',
    introPrice: intro ?? null,
  },
});

const packages = [
  pkg('ANNUAL', 'preview.annual', 29.99, { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1 }),
  pkg('MONTHLY', 'preview.monthly', 4.99),
  pkg('LIFETIME', 'preview.lifetime', 59.99),
];

export const PREVIEW_OFFERINGS = {
  current: { identifier: 'preview', availablePackages: packages },
  all: {},
} as unknown as PurchasesOfferings;
