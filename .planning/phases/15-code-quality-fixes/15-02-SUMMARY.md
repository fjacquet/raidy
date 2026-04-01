# Summary: 15-02 — PowerStore Per-Model Overhead Rates

**Status**: COMPLETE
**Date**: 2026-04-01
**Requirement**: QUALITY-02

## What was done
- Added `model` field to `PowerStoreOptions` interface (`'powerstore_3200' | 'powerstore_5200t' | 'powerstore_5200q' | 'custom'`)
- Added `POWERSTORE_MODEL_OVERHEAD` lookup table exported from `src/types/topology.ts`:
  - powerstore_3200 → 5%
  - powerstore_5200q → 5% (Dell Sizer reference, preserves existing default)
  - powerstore_5200t → 7% (T-Series all-flash, higher metadata density)
- Updated `DEFAULT_POWERSTORE_OPTIONS` to use `model: 'powerstore_5200q'` (backward compatible)
- Updated `configStore.ts` default `powerstoreOptions` with `model: 'powerstore_5200q' as const`
- Added model selector `SegmentedControl` to `DellOptionsPanel.tsx` PowerStore section
- Added conditional system overhead slider (visible only for `model === 'custom'`)
- Added `model` and `systemOverhead` i18n keys to all 4 locale `topology.json` files
- Fixed test fixtures: added `model` field to inline `powerstoreOptions` objects in test files

## Verification
- `npm run typecheck` → 0 errors ✓
- `npm run lint` → 0 errors ✓
- `npm test -- --run` → 881/881 tests pass ✓
