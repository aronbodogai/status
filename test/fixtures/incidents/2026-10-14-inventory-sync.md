---
title: Inventory sync is failing
impact: major
components: inventory-accounts
---

## Resolved · 2026-10-14 15:20

The fix is deployed, and sync works again. Changes made while it was down sync on the next try.

## Identified · 2026-10-14 14:35

A database migration broke the **sync** policy. Rolling it back.

## Investigating · 2026-10-14 14:05

Sync fails for every household. Data on your devices is safe.
