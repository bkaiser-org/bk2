---
name: address-model
description: Use when creating or reading an address — emails, phones, postal addresses, websites/social links, or bank/IBAN details for a person or org. Covers the flat top-level `addresses` collection, the `parentKey` link, the channel→value-field mapping, and the favorite-address → `favEmail`/`favPhone` replication.
---

# Address Model

How contact details (email, phone, postal, web, bank) are stored. One model, `AddressModel`
(`libs/shared/models/.../address.model.ts`), covers every channel.

## Flat collection, linked by `parentKey`

Addresses live in a **top-level `addresses` collection** (`AddressCollection = 'addresses'`) — **not**
a subcollection. Each address points at its owner via **`parentKey` = the owner's `bkey`** (a
person's or org's key). Tenant-scoped like everything else (`tenants: [tenantId]`, set by the
constructor; `array-contains` queries — see the **`tenant-model`** skill).

## One model, many channels

`addressChannel` (default `'email'`) selects **which value field carries the data**:

| `addressChannel` | value field(s) |
|---|---|
| `email` | `email` |
| `phone` | `phone` |
| `web` | `url` (also social-media links/ids) |
| `postal` | `streetName`, `streetNumber`, `addressValue2` (c/o), `zipCode`, `city`, `countryCode` |
| `bank` | `iban` (+ `url` for the ezs/QR url) |

Plus `addressUsage` (default `'home'`: home/work/…, with `addressUsageLabel` for a custom usage),
and flags `isFavorite`, `isCc`, `isValidated`, `isArchived`. `tags`/`notes`, and `index` (search).

## Favorite → parent replication (DB-triggered CF)

A Cloud Function, triggered by writes to `addresses`, mirrors the **favorite** address of each
channel onto its parent person: the favorite `email` address → `person.favEmail`, the favorite
`phone` → `person.favPhone`. **Do not set `favEmail`/`favPhone` directly** — create a favorite
address and let the CF replicate. (You never call the CF; the `addresses` write triggers it.)

## Recipe — give a person a favorite email

```ts
const a = new AddressModel(tenantId);
a.addressChannel = 'email';
a.email = '<email>';
a.isFavorite = true;
a.parentKey = personKey;   // = person.bkey
a.isArchived = false;
// → addressService.create(a)
//   (or, from a runbook agent, firestore_add_document into 'addresses')
```

A CF then replicates it to `person.favEmail`. Swap `addressChannel`/value field for a phone, postal,
web, or bank address.

## Note — service vs raw write
`addressService.create` populates the search `index` and derived fields. A raw Firestore write (e.g.
via MCP) skips that; the record is valid and self-heals on the first in-app edit/save.

## Related
- Tenant scoping, persons & users: **`tenant-model`** skill.
- Bootstrapping a tenant's first admin (creates a person + favorite email address):
  **`provision-tenant`** skill.
