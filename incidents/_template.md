---
title: Inventory sync is failing
# degraded (slow or flaky), partial (some things don't work) or major (it's down)
impact: major
# Component ids from site.config.mjs, comma-separated. A group id (episodic) means every component in it.
components: inventory-accounts
# Only when writing it up afterwards: when it started, if that was before the first update below.
# start: 2026-11-02 13:30
---

<!--
Copy this file to incidents/2026-11-02-short-name.md (files starting with _ are skipped) and replace the
example. Every update is a heading: Investigating, Identified, Monitoring, Update or Resolved, then the
time. Times without an offset are Europe/Budapest; add Z or +01:00 to say otherwise. The incident is over
once its newest update is Resolved.
-->

## Resolved · 2026-11-02 14:40

The fix is deployed, and sync works again. Changes made while it was down sync on the next try.

## Identified · 2026-11-02 14:10

Today's database migration broke a sync policy. Rolling it back.

## Investigating · 2026-11-02 13:55

Sync fails with an error for every household. Data on your devices is safe.
