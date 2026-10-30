// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Q = require('..');

function freshKey() {
  return Q.generateKey();
}

function charterFleet(key) {
  return Q.charter({ key, mode: 'road', fleetName: 'North Depot Autonomous Fleet', homeBase: 'Rotterdam Depot 4', unitCount: 120, operatorLabel: 'Quantova Logistics' });
}

test('a chartered fleet is a well formed signed record of the operator', () => {
  const operator = freshKey();
  const fleet = charterFleet(operator);
  assert.strictEqual(fleet.format, 'qfleet/1');
  assert.strictEqual(fleet.type, 'charter');
  assert.strictEqual(fleet.algorithm, 'ML-DSA-65');
  assert.strictEqual(fleet.signer.id, Q.keyId(operator));
  assert.strictEqual(fleet.statement.operatorKeyId, Q.keyId(operator));
  assert.match(fleet.statement.fleetId, /^[0-9a-f]{32}$/);
  assert.strictEqual(Buffer.from(fleet.signer.publicKey, 'base64').length, Q.PUBLIC_KEY_BYTES);
  assert.strictEqual(Buffer.from(fleet.signature, 'base64').length, Q.SIGNATURE_BYTES);
});

test('the audit, service and transfer records chain to the same fleet', () => {
  const operator = freshKey();
  const auditor = freshKey();
  const provider = freshKey();
  const buyer = freshKey();
  const fleet = charterFleet(operator);
  const aud = Q.audit({ key: auditor, charter: fleet, standard: 'ISO 39001 2025' });
  const serv = Q.service({ key: provider, record: fleet, serviceKind: 'inspection', depot: 'Depot 4 Bay 2' });
  const moved = Q.transfer({ key: operator, record: serv, to: Q.keyId(buyer), toLabel: 'Acme Mobility' });
  assert.strictEqual(aud.statement.fleetId, fleet.statement.fleetId);
  assert.strictEqual(aud.statement.charterRef, Q.recordRef(fleet));
  assert.strictEqual(serv.statement.priorRef, Q.recordRef(fleet));
  assert.strictEqual(moved.statement.fleetId, fleet.statement.fleetId);
  assert.strictEqual(moved.statement.fromKeyId, Q.keyId(operator));
  assert.strictEqual(moved.statement.toKeyId, Q.keyId(buyer));
  assert.strictEqual(moved.statement.priorRef, Q.recordRef(serv));
});

test('invalid inputs are refused before anything is signed', () => {
  const key = freshKey();
  const base = { key, mode: 'road', fleetName: 'F', homeBase: 'B', unitCount: 1 };
  assert.throws(() => Q.charter(Object.assign({}, base, { mode: 'teleport' })), /mode must be one of/);
  assert.throws(() => Q.charter(Object.assign({}, base, { unitCount: 1.5 })), /unitCount must be a whole number/);
  assert.throws(() => Q.charter(Object.assign({}, base, { unitCount: 10000001 })), /unitCount is larger than/);
  assert.throws(() => Q.charter(Object.assign({}, base, { fleetName: '' })), /fleetName cannot be empty/);
  assert.throws(() => Q.charter(Object.assign({}, base, { homeBase: '' })), /homeBase cannot be empty/);
  assert.throws(() => Q.charter(Object.assign({}, base, { unknownField: 1 })), /is not an option of charter/);
  const fleet = charterFleet(key);
  assert.throws(() => Q.service({ key, record: fleet, serviceKind: 'wash', depot: 'D' }), /serviceKind must be one of/);
});

test('a transfer refuses a recipient equal to the sender', () => {
  const holder = freshKey();
  const fleet = charterFleet(holder);
  assert.throws(() => Q.transfer({ key: holder, record: fleet, to: Q.keyId(holder) }), /the receiving key must differ/);
});

test('a signing key must be a well formed 32 byte seed', () => {
  assert.throws(() => charterFleet(new Uint8Array(16)), /32 byte Uint8Array seed/);
  assert.throws(() => charterFleet(new Uint8Array(32)), /too few different byte values/);
});

test('a well formed record verifies and a type mismatch is invalid', async () => {
  const operator = freshKey();
  const fleet = charterFleet(operator);
  const ok = await Q.verify(fleet, { type: 'charter', network: 'testnet', requireAnchor: false, strict: false });
  assert.strictEqual(ok.status, 'valid');
  assert.strictEqual(ok.type, 'charter');
  assert.strictEqual(ok.fleetId, fleet.statement.fleetId);
  const wrongType = await Q.verify(fleet, { type: 'audit', network: 'testnet', requireAnchor: false, strict: false });
  assert.strictEqual(wrongType.status, 'invalid');
  const wrongSigner = await Q.verify(fleet, { type: 'charter', network: 'testnet', requireAnchor: false, strict: false, signerKeyId: Q.keyId(freshKey()) });
  assert.strictEqual(wrongSigner.status, 'invalid');
});

test('a tampered statement no longer verifies', async () => {
  const operator = freshKey();
  const fleet = charterFleet(operator);
  const forged = JSON.parse(JSON.stringify(fleet));
  forged.statement.unitCount = forged.statement.unitCount + 1;
  const r = await Q.verify(forged, { type: 'charter', network: 'testnet', requireAnchor: false, strict: false });
  assert.strictEqual(r.status, 'invalid');
  assert.ok(r.checks.some((c) => c.name === 'signature' && !c.ok));
});

test('the prior link binds a record to the record before it', async () => {
  const operator = freshKey();
  const provider = freshKey();
  const fleet = charterFleet(operator);
  const serv = Q.service({ key: provider, record: fleet, serviceKind: 'inspection', depot: 'Depot 4 Bay 2' });
  const good = await Q.verify(serv, { type: 'service', network: 'testnet', requireAnchor: false, strict: false, prior: fleet });
  assert.ok(good.checks.some((c) => c.name === 'prior' && c.ok));
  const otherFleet = charterFleet(operator);
  const bad = await Q.verify(serv, { type: 'service', network: 'testnet', requireAnchor: false, strict: false, prior: otherFleet });
  assert.strictEqual(bad.status, 'invalid');
  assert.ok(bad.checks.some((c) => c.name === 'prior' && !c.ok));
});

test('fleetRef is deterministic for the same secret and reference and differs otherwise', () => {
  const secret = new Uint8Array(32);
  globalThis.crypto.getRandomValues(secret);
  const a = Q.fleetRef(secret, 'FLEET 2026 0001');
  const b = Q.fleetRef(secret, 'FLEET 2026 0001');
  const c = Q.fleetRef(secret, 'FLEET 2026 0002');
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('the kind and constants are the ones pinned for the fleet line', () => {
  assert.strictEqual(Q.KIND, 1402);
  assert.strictEqual(Q.FORMAT, 'qfleet/1');
  assert.deepStrictEqual([...Q.TYPES], ['charter', 'audit', 'service', 'transfer', 'retire']);
  assert.deepStrictEqual([...Q.MODES], ['road', 'rail', 'air', 'marine', 'warehouse', 'mixed']);
  assert.deepStrictEqual([...Q.SERVICE_KINDS], ['inspection', 'repair', 'overhaul', 'software', 'recall']);
});
