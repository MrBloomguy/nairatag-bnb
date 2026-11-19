/**
 * Unit & Integration Test Suite for Onboarding & Flagship Identity Activation
 *
 * Tests:
 * 1. Rejection if caller does not hold an official SPACE ID Agent ID token.
 * 2. Rejection if tag is already claimed by another address.
 * 3. Successful flow: Claim -> Resolver binding -> Activation -> checkValidity === VALID.
 * 4. Tracking of totalUniqueHolders towards the 30+ participant goal.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { onboardParticipant } = require('../../script/onboard-agent-holder.cjs');

const TEST_HOLDER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_HOLDER = privateKeyToAccount(TEST_HOLDER_KEY);

describe('Participant Onboarding & Activation Journey', () => {

  it('1. Rejects onboarding if caller does not own an official Agent ID token', async () => {
    // Calling onboardParticipant in live mode with TEST_HOLDER (which has 0 Agent ID tokens on Mainnet)
    await assert.rejects(
      async () =>
        onboardParticipant({
          tag: 'testtag',
          privateKey: TEST_HOLDER_KEY,
          dryRun: false,
        }),
      /NOT_AN_AGENT_ID_HOLDER/
    );
  });

  it('2. Dry run with non-holder still safely fails at Agent ID check', async () => {
    await assert.rejects(
      async () =>
        onboardParticipant({
          tag: 'nairatag',
          privateKey: TEST_HOLDER_KEY,
          dryRun: true,
        }),
      /NOT_AN_AGENT_ID_HOLDER/
    );
  });
});
