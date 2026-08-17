// GCI Executive Desk — Task 14.2: Tradeling channel adapter. NOT CONNECTED —
// no Tradeling API integration exists. Tradeling is a B2B marketplace
// (different business model from NOON/Amazon's B2C) — a real adapter would
// map Tradeling's own metrics onto this same PlatformSummary shape; the
// unified dashboard doesn't require the underlying business model to match,
// only the key metrics an owner needs to be comparable (Task 14.2 §十六).
import type { ChannelAdapter } from './base';
import { makeStubAdapter } from './stub';

export const tradelingAdapter: ChannelAdapter = makeStubAdapter('tradeling', 'not_connected');
