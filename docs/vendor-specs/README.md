# Vendor specifications

The source material the calculation engines were built from: per-platform capacity, overhead and
protection rules gathered from vendor documentation, mostly in French.

**These are historical inputs, not a maintained reference.** They were last touched in January
2026; BeeGFS, Longhorn, PowerVault ADAPT and the vSAN ESA recalibration all landed after. Where a
document and the code disagree, the code and its tests win — the engines are covered by validation
vectors carrying their own citations (`tests/fixtures/*-vectors.ts`), which is the sourcing that
gets kept current.

They live here because deleting them would throw away the reasoning behind numbers nobody could
otherwise re-derive, and because until the 2026-08-05 documentation sweep they sat in a top-level
`doc/` directory one letter away from this one, referenced from nowhere and found by nobody.

| File | Platform |
|---|---|
| `Spécification ZFS.md` | ZFS |
| `Spécification S2D.md` | Storage Spaces Direct |
| `Spécification Ceph.md` | Ceph |
| `Spécification NetApp.md` | NetApp ONTAP |
| `Spécification Nutanix.md` | Nutanix AOS |
| `Spécification Synology.md` | Synology SHR / RAID F1 |
| `Spécification PowerFlex.md`, `PowerFlexEC.md` | Dell PowerFlex |
| `Spécification ObjectScale.md`, `Specification technique complète – Calculateur ObjectSizer pour Dell ObjectScale.md` | Dell ObjectScale |
| `Specification PowerVault ME5.md` | Dell PowerVault ME5 |
| `storage-specifications-exhaustive.md` | Cross-platform summary |
| `raidy Design Spec.md` | Original product design |

Newer platform work is specced under [`../superpowers/specs/`](../superpowers/specs/) instead,
which is where anything written from 2026-08 onward lives.
