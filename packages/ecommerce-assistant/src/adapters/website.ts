// GCI Executive Desk — Task 14.2: Own Website channel adapter. NOT
// CONNECTED — no direct-sales website integration exists yet.
import type { ChannelAdapter } from './base';
import { makeStubAdapter } from './stub';

export const websiteAdapter: ChannelAdapter = makeStubAdapter('website', 'not_connected');
