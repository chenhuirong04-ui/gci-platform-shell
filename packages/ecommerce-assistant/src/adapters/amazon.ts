// GCI Executive Desk — Task 14.2: Amazon channel adapter. NOT CONNECTED —
// no Amazon API integration exists. Explicitly out of scope this round
// (Task 14.2 §十七). Swap this file's body for a real implementation of
// ChannelAdapter when Amazon is actually connected; no other file in this
// package needs to change.
import type { ChannelAdapter } from './base';
import { makeStubAdapter } from './stub';

export const amazonAdapter: ChannelAdapter = makeStubAdapter('amazon', 'not_connected');
