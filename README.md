# QFleet

QFleet is a live production post quantum operations and maintenance record tool for autonomous vehicle and robot fleets on the Quantova network. It proves the charter, operations audit, maintenance service, transfer and retirement of a managed fleet, and it lets any third party confirm that history without trusting the party that created it.

QFleet proves records without disclosing them. Fleet identities and operator details stay private on the systems of the party that holds them. Only a salted cryptographic commitment is written to the chain, and no commercial detail is ever published.

## What it records

Each record is a signed envelope of one of five types.

1. charter, an operator states the mode, name, home base and unit count of a new managed fleet.
2. audit, an auditor certifies that a chartered fleet was assessed against a named operations safety standard.
3. service, a maintenance provider records a completed service of one kind at a named depot.
4. transfer, the operator of a fleet hands it to another party.
5. retire, the holder withdraws a fleet from service and states why.

Every record is signed with ML-DSA-65 under FIPS 204 by the party whose role it names, and each later record links to the one before it so the whole life of a fleet forms a chain.

## Proving the time

A record on its own carries only the claim of its signer. Anchoring a record on the Quantova network through Qstamp adds a post quantum evidence anchor that fixes the latest moment the record existed, provable against the record and the signer by anyone, without claiming a regulated timestamp status that Quantova Inc does not hold.

## Install

```
npm install @quantovainc/qfleet
```

## Use

```js
const qfleet = require('@quantovainc/qfleet');

const operator = qfleet.generateKey();
const fleet = qfleet.charter({
  key: operator,
  mode: 'road',
  fleetName: 'North Depot Autonomous Fleet',
  homeBase: 'Rotterdam Depot 4',
  unitCount: 120,
  operatorLabel: 'Quantova Logistics',
});

const anchored = await qfleet.anchor(fleet, { seed, index: 0, network: 'testnet' });
const result = await qfleet.verify(anchored[0], { type: 'charter', network: 'testnet' });
```

## What a record does not establish

1. It does not show that the stated facts are true. It shows only that the signer stated them and that the statement existed unchanged at a point in time.
2. It does not identify a natural or legal person. The signer is a chain address, and linking an address to an operator, auditor or maintenance provider is a separate attestation.
3. The labels are text written by the signer, they are not a verified identity.

## License

Apache-2.0 OR MIT
