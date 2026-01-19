# Dell PowerVault ME5 Series Specification

## 1. Product Overview

The Dell PowerVault ME5 series is an entry-level to mid-range block storage platform designed for SMBs. It includes three base models (ME5212, ME5224, ME5284) with expansion options up to 336 drives and 8PB raw capacity.

### 1.1 Model Matrix

| Model     | Form Factor | Base Drive Slots | Drive Type           | Max Expansion | Max Total Drives |
|-----------|-------------|------------------|----------------------|---------------|------------------|
| ME5212    | 2U          | 12 x 3.5"        | LFF (3.5")           | +324 drives   | 336              |
| ME5224    | 2U          | 24 x 2.5"        | SFF (2.5")           | +312 drives   | 336              |
| ME5284    | 5U          | 84 x 3.5"        | LFF (3.5")           | +252 drives   | 336              |

### 1.2 Expansion Enclosures

| Enclosure | Drive Slots | Form Factor | Compatible Base Arrays        |
|-----------|-------------|-------------|-------------------------------|
| ME512     | 12 x 3.5"   | 2U          | ME5212, ME5224 only           |
| ME524     | 24 x 2.5"   | 2U          | ME5212, ME5224 only           |
| ME584     | 84 x 3.5"   | 5U          | ME5212, ME5224, ME5284 (all)  |

---

## 2. Hardware Specifications

### 2.1 Controller Architecture

- **Controller Type:** Dual-Active (Active-Active)
- **Processor:** Intel Xeon (2x cores vs predecessor ME4)
- **Cache per Controller:** 16 GB DDR4
- **Total System Cache:** 32 GB (dual controller)
- **Cache Protection:** Supercapacitor-backed (no battery)
- **Backend Protocol:** 12 Gb/s SAS

### 2.2 Host Connectivity Options (per controller)

| Protocol        | Speed          | Ports per Controller | Total Ports (Dual) |
|-----------------|----------------|----------------------|--------------------|
| Fibre Channel   | 32 Gb/s        | 4                    | 8                  |
| iSCSI SFP+      | 25 Gb/s        | 4                    | 8                  |
| iSCSI Base-T    | 10 Gb/s        | 4                    | 8                  |
| SAS (DAS only)  | 12 Gb/s        | 4                    | 8                  |
| Management      | 1 Gb/s Base-T  | 1                    | 2                  |

**Note:** SAS front-end is DAS only and does NOT support replication.

### 2.3 Physical Specifications

| Model   | Height      | Width        | Depth        | Weight (Max)     |
|---------|-------------|--------------|--------------|------------------|
| ME5212  | 3.46" (2U)  | 19.01"       | 24.36"       | 71.0 lbs (32 kg) |
| ME5224  | 3.46" (2U)  | 19.01"       | 24.36"       | 71.0 lbs (32 kg) |
| ME5284  | 8.66" (5U)  | 19.01"       | 34.00"       | ~200 lbs         |

### 2.4 Power Specifications

| Model/Enclosure | Power Supply Type | Max Power (AC) | Thermal (BTU/hr) |
|-----------------|-------------------|----------------|------------------|
| ME5212          | Dual PSU          | 580W           | 1,980            |
| ME5224          | Dual PSU          | 580W           | 1,980            |
| ME5284          | Dual PSU          | 2,200W         | 7,507            |
| ME512           | Dual PSU          | 580W           | 1,980            |
| ME524           | Dual PSU          | 580W           | 1,980            |
| ME584           | Dual PSU          | 2,200W         | 7,507            |

---

## 3. Supported Drives

### 3.1 Drive Types and Capacities

| Drive Type          | Form Factor | Speed    | Available Capacities               |
|---------------------|-------------|----------|------------------------------------|
| NL-SAS HDD          | 3.5" LFF    | 7.2K RPM | 4TB, 8TB, 12TB, 16TB, 20TB, 22TB, 24TB |
| NL-SAS HDD (FIPS)   | 3.5" LFF    | 7.2K RPM | 8TB, 16TB (SED/FIPS)               |
| SAS HDD             | 2.5" SFF    | 10K RPM  | 1.2TB, 2.4TB                       |
| SAS HDD (FIPS)      | 2.5" SFF    | 10K RPM  | 2.4TB (SED/FIPS)                   |
| SAS SSD             | 2.5" SFF    | -        | 1.6TB, 1.92TB, 3.84TB, 7.68TB      |
| SAS SSD (FIPS)      | 2.5" SFF    | -        | 3.2TB (SED/FIPS)                   |

### 3.2 Drive Mixing Rules

- **Allowed:** Mix SAS and NL-SAS drives within the same system
- **Allowed:** Mix different capacities within ADAPT disk groups
- **NOT Supported:** 4Kn sector drives
- **NOT Supported:** SATA drives
- **NOT Supported:** NVMe drives (SAS only)
- **NOT Supported:** vSAS drives

### 3.3 Tiering Classification

| Tier         | Drive Type       | Characteristics                     |
|--------------|------------------|-------------------------------------|
| Performance  | SAS SSD          | Highest IOPS, lowest latency        |
| Standard     | SAS 10K HDD      | Balanced performance                |
| Archive      | NL-SAS 7.2K HDD  | Highest capacity, lowest cost       |

---

## 4. RAID Configuration

### 4.1 Supported RAID Levels

| RAID Level | Min Drives | Max Drives | Fault Tolerance | Efficiency Formula                    |
|------------|------------|------------|-----------------|---------------------------------------|
| NRAID      | 1          | 1          | 0 drives        | 100% (no redundancy)                  |
| RAID 0     | 2          | 16         | 0 drives        | 100% (no redundancy)                  |
| RAID 1     | 2          | 2          | 1 drive         | 50%                                   |
| RAID 5     | 3          | 16         | 1 drive         | (N-1)/N                               |
| RAID 6     | 4          | 16         | 2 drives        | (N-2)/N                               |
| RAID 10    | 4          | 16         | 1 per mirror    | 50%                                   |
| ADAPT      | 12         | 128        | 2 drives        | ~87% (distributed spare)              |

**Notes:**

- NRAID and RAID 0 require CLI commands (not available in GUI)
- ADAPT is the recommended RAID level for most workloads

### 4.2 RAID 5/6 Optimal Disk Counts (Power of 2 Rule)

For optimal sequential write performance, use these disk counts:

| RAID Level | Recommended Disk Counts | Data Disks | Reason                           |
|------------|-------------------------|------------|----------------------------------|
| RAID 5     | 3, 5, 9                 | 2, 4, 8    | Aligns with 4MB virtual pages    |
| RAID 6     | 4, 6, 10                | 2, 4, 8    | Aligns with 4MB virtual pages    |

**Warning:** Using non-optimal counts (e.g., 7 disks for RAID 5) causes significant sequential write performance degradation.

### 4.3 ADAPT RAID Details

ADAPT is Dell's distributed RAID technology:

- **Minimum:** 12 drives to create an ADAPT disk group
- **Recommended:** 24 drives (12 per controller for dual virtual pools)
- **Maximum:** 128 drives per disk group
- **Max Disk Groups:** 4 ADAPT groups per controller module
- **Max Capacity:** 1.5 PiB per ADAPT disk group
- **Spare Capacity:** Distributed across all drives (no dedicated hot spares needed)
- **Rebuild:** Very fast (parallel rebuild across all drives)
- **Drive Mixing:** Different sizes allowed within ADAPT (data distributed evenly)
- **Requirement:** All drives must be same type (SSD or HDD) and same tier

---

## 5. Performance Specifications

### 5.1 Maximum Performance (All-Flash)

| Metric              | Value           | Condition                        |
|---------------------|-----------------|----------------------------------|
| Max IOPS (4K)       | 840,000         | 100% Read, All SSD               |
| Max Read Throughput | 14 GB/s         | Sequential, All SSD              |
| Max Write Throughput| 11 GB/s         | Sequential, All SSD              |

### 5.2 Performance by RAID Level (OLTP Workloads)

| RAID Level | Max IOPS (Mixed R/W) | Use Case                        |
|------------|----------------------|---------------------------------|
| RAID 10    | 344,000              | Maximum performance             |
| RAID 5     | 207,000              | Balanced                        |
| ADAPT      | 170,000              | Best flexibility & protection   |
| RAID 6     | ~150,000             | Maximum protection              |

### 5.3 Write Penalty by RAID Level

| RAID Level | Write Penalty | Explanation                              |
|------------|---------------|------------------------------------------|
| RAID 1     | 2x            | 1 write = 2 disk writes (mirror)         |
| RAID 10    | 2x            | 1 write = 2 disk writes (mirror)         |
| RAID 5     | 4x            | Read-Modify-Write (small random writes)  |
| RAID 6     | 6x            | Read-Modify-Write with dual parity       |
| ADAPT      | ~2-3x         | Distributed parity, optimized rebuild    |

### 5.4 Performance Formula

```
Effective_Write_IOPS = (Total_Drive_IOPS) / Write_Penalty
Effective_Mixed_IOPS = (Read_IOPS) + (Write_IOPS / Write_Penalty)
```

### 5.5 Benchmark Results (StorageReview)

| Test                | SAN Config    | DAS Config    | Notes                |
|---------------------|---------------|---------------|----------------------|
| 4K Random Read      | 300,600 IOPS  | 290,500 IOPS  | Sub-1ms to 260K      |
| 4K Random Write     | 78,000 IOPS   | 78,000 IOPS   | Sub-1ms to 70K       |
| 64K Seq Read        | 4.0 GB/s      | 4.0 GB/s      | 2 SSDs + 10 HDDs     |
| 64K Seq Write       | 950 MB/s      | 950 MB/s      | Limited by SSD count |
| SQL OLTP Latency    | 2ms avg       | 1ms avg       | TPC-C workload       |

---

## 6. Data Services & Features

### 6.1 Included Software Features (All-Inclusive)

| Feature                  | Supported | Notes                                    |
|--------------------------|-----------|------------------------------------------|
| Thin Provisioning        | Yes       | 4MB page size                            |
| Snapshots                | Yes       | Copy-on-Write                            |
| Volume Copy              | Yes       | Local volume clone                       |
| Async Replication        | Yes       | FC or iSCSI (not SAS models)             |
| Auto-Tiering             | Yes       | 3 tiers (Performance/Standard/Archive)   |
| SSD Read Cache           | Yes       | Accelerates HDD read performance         |
| ADAPT RAID               | Yes       | Distributed spare, fast rebuild          |
| Encryption (SED)         | Yes       | AES-256, FIPS 140-2 Level 2              |
| KMIP Support             | Yes       | IBM SKLM, Thales KeySecure               |

### 6.2 NOT Supported Features

| Feature              | Status         | Alternative/Notes                        |
|----------------------|----------------|------------------------------------------|
| Inline Compression   | NOT Supported  | No data reduction                        |
| Deduplication        | NOT Supported  | No data reduction                        |
| Sync Replication     | NOT Supported  | Async only                               |
| NVMe/NVMe-oF         | NOT Supported  | SAS backend only                         |
| VAAI UNMAP (auto)    | Limited        | 4MB pages incompatible with auto-unmap   |
| File Protocols       | NOT Supported  | Block only (iSCSI, FC, SAS)              |
| Object Protocols     | NOT Supported  | Block only                               |

### 6.3 Volume Limits

| Parameter                   | Limit                              |
|-----------------------------|------------------------------------|
| Max Volume Size             | 128 TiB (140 TB)                   |
| Max Volumes per System      | 1,024                              |
| Max Snapshots per Volume    | 1,024                              |
| Max Total Snapshots         | 16,384                             |

---

## 7. Capacity Calculations

### 7.1 Usable Capacity Formulas

**RAID 1:**

```
Usable = Raw_Capacity * 0.50
```

**RAID 5:**

```
Usable = Raw_Capacity * ((N - 1) / N)
Example (5 drives): 50TB raw * (4/5) = 40TB usable (80%)
```

**RAID 6:**

```
Usable = Raw_Capacity * ((N - 2) / N)
Example (6 drives): 60TB raw * (4/6) = 40TB usable (66.7%)
```

**RAID 10:**

```
Usable = Raw_Capacity * 0.50
```

**ADAPT:**

```
Usable = Raw_Capacity * 0.87  (approximate, varies with drive count)
```

### 7.2 System Overhead

| Overhead Type           | Value    | Notes                                |
|-------------------------|----------|--------------------------------------|
| Metadata Overhead       | ~1-2%    | Virtual pool metadata                |
| Spare Capacity (ADAPT)  | ~13%     | Distributed across all drives        |
| Hot Spare (Traditional) | 1 drive  | Per disk group if dedicated spares   |

---

## 8. Best Practices (DO)

### 8.1 RAID Selection

- **DO** use ADAPT for most workloads (best balance of protection, capacity, flexibility)
- **DO** use 24+ drives with ADAPT (12 per controller for balanced performance)
- **DO** use RAID 5 with 3, 5, or 9 disks (power-of-2 data disks)
- **DO** use RAID 6 with 4, 6, or 10 disks (power-of-2 data disks)
- **DO** use RAID 10 for maximum IOPS on write-intensive workloads
- **DO** use RAID 6 or ADAPT for drives 6TB or larger

### 8.2 Configuration

- **DO** enable write-back cache (default, supercapacitor protected)
- **DO** use dual controllers for high availability
- **DO** balance disk groups across both controllers (Virtual Pools)
- **DO** use SSDs for demanding workloads requiring low latency
- **DO** use NL-SAS for archive/backup with low IOPS requirements
- **DO** use SSD Read Cache to accelerate HDD tier reads
- **DO** use 25GbE iSCSI or 32Gb FC for maximum performance

### 8.3 Expansion

- **DO** plan for ADAPT if you expect to expand capacity later
- **DO** add drives in batches that allow new disk group creation for RAID 5/6

---

## 9. Restrictions (DON'T)

### 9.1 Drive Configuration

- **DON'T** use 4Kn sector drives (not supported)
- **DON'T** use SATA drives (not supported)
- **DON'T** use NVMe drives (SAS backend only)
- **DON'T** mix SEDs and non-SEDs in the same system
- **DON'T** mix SSD and HDD within the same ADAPT disk group

### 9.2 RAID Configuration

- **DON'T** use non-power-of-2 disk counts for RAID 5/6 (performance degradation)
- **DON'T** expect to expand RAID 5/6 disk groups in Virtual Pool mode (create new groups)
- **DON'T** create more than 4 ADAPT disk groups per controller
- **DON'T** exceed 128 drives in a single ADAPT disk group
- **DON'T** exceed 1.5 PiB per ADAPT disk group

### 9.3 Connectivity

- **DON'T** use SAS front-end if you need replication (use FC or iSCSI)
- **DON'T** rely on auto-UNMAP for vSphere (4MB pages not compatible)
- **DON'T** mix FC and iSCSI host ports on the same controller card

### 9.4 Features

- **DON'T** expect compression or deduplication (not available)
- **DON'T** expect NVMe performance (SAS backend limits throughput)
- **DON'T** expect file or object protocol support (block only)

---

## 10. Calculator Implementation Notes

### 10.1 Data Model (TypeScript Interface)

```typescript
interface PowerVaultME5Config {
  model: 'ME5212' | 'ME5224' | 'ME5284';
  controllers: 1 | 2;
  expansionEnclosures: {
    ME512: number;  // 0-n, only for ME5212/ME5224
    ME524: number;  // 0-n, only for ME5212/ME5224
    ME584: number;  // 0-n, for all models
  };
  drives: {
    type: 'SSD' | 'SAS_10K' | 'NLSAS_7K';
    capacity_tb: number;
    count: number;
  }[];
  raidLevel: 'NRAID' | 'RAID0' | 'RAID1' | 'RAID5' | 'RAID6' | 'RAID10' | 'ADAPT';
  connectivity: 'FC_32G' | 'iSCSI_25G' | 'iSCSI_10G' | 'SAS_12G';
}

interface PowerVaultME5Performance {
  iops_read_max: number;     // Based on drive count and type
  iops_write_max: number;    // Adjusted for write penalty
  throughput_read_gbs: number;
  throughput_write_gbs: number;
  latency_avg_ms: number;
}
```

### 10.2 Calculation Rules

1. **Drive Count Limits:**
   - ME5212: max 336 (12 base + up to 27 x ME512/ME584)
   - ME5224: max 336 (24 base + expansions)
   - ME5284: max 336 (84 base + expansions)

2. **ADAPT Minimum:** Validate 12+ drives before allowing ADAPT

3. **RAID 5/6 Warning:** Flag non-optimal disk counts (warn on 4, 6, 7, 8 for RAID 5)

4. **Efficiency Calculation:**

   ```
   if (raidLevel === 'ADAPT') efficiency = 0.87;
   if (raidLevel === 'RAID5') efficiency = (driveCount - 1) / driveCount;
   if (raidLevel === 'RAID6') efficiency = (driveCount - 2) / driveCount;
   if (raidLevel === 'RAID1' || raidLevel === 'RAID10') efficiency = 0.50;
   ```

5. **Performance Cap:**
   - Max system IOPS: 840,000 (controller limit)
   - Max read throughput: 14 GB/s
   - Max write throughput: 11 GB/s

---

## 11. ADAPT RAID Deep Dive

### 11.1 How ADAPT Works

Unlike traditional RAID where parity is calculated per disk group with dedicated hot spares, ADAPT:

1. **Distributes data and parity across ALL drives** in the disk group (up to 128 drives)
2. **Distributes spare capacity** across all drives instead of dedicating whole drives as spares
3. **Rebuilds in parallel** using all drives simultaneously, dramatically reducing rebuild time

```
Traditional RAID 6 (8 drives + 1 hot spare):
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────────┐
│ D1  │ D2  │ D3  │ D4  │ D5  │ D6  │ P1  │ P2  │ SPARE   │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────────┘
                                              ↑ Idle until failure

ADAPT (9 drives, distributed spare):
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│D+P+S│D+P+S│D+P+S│D+P+S│D+P+S│D+P+S│D+P+S│D+P+S│D+P+S│
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
  ↑ Each drive holds data, parity, AND spare capacity
```

### 11.2 ADAPT Specifications

| Attribute | Value | Notes |
|-----------|-------|-------|
| Minimum Drives | 12 | Hard requirement |
| Recommended Drives | 24+ | 12 per controller for dual pools |
| Maximum Drives | 128 | Per disk group |
| Fault Tolerance | 2 drives | Similar to RAID 6 |
| Efficiency | ~87% | After distributed spare reservation |
| Max Disk Groups | 4 | Per controller module |
| Max Capacity | 1.5 PiB | Per disk group |

### 11.3 Rebuild Speed Comparison

```
Traditional RAID 6 rebuild (single hot spare):
  Failed drive: 8TB
  Rebuild source: 7 drives
  Rebuild target: 1 spare drive
  Time: 12-24+ hours

ADAPT rebuild (distributed):
  Failed drive: 8TB
  Rebuild source: ALL remaining drives (parallel reads)
  Rebuild target: Distributed across ALL drives (parallel writes)
  Time: 1-3 hours (depending on drive count)
```

### 11.4 ADAPT Capacity Calculation

```
ADAPT Usable Capacity = Raw Capacity × 0.87

Example: 24 × 8TB drives = 192TB raw
         192TB × 0.87 = ~167TB usable
```

The ~13% overhead includes:

- Distributed parity (dual parity like RAID 6)
- Distributed spare capacity
- Metadata

### 11.5 ADAPT vs Traditional RAID

| Feature | ADAPT | RAID 6 | RAID 10 |
|---------|-------|--------|---------|
| Min Drives | 12 | 4 | 4 |
| Fault Tolerance | 2 drives | 2 drives | 1 per mirror |
| Efficiency | ~87% | 67-80% | 50% |
| Rebuild Speed | Very fast | Slow | Medium |
| Expandable | Yes | No (in virtual pool) | No |
| Mixed Drive Sizes | Yes | No | No |
| Hot Spare | Distributed | Dedicated | Dedicated |

### 11.6 When to Use ADAPT

**Best for:**

- Large drive counts (24+ drives)
- Mixed capacity environments
- Systems expecting future expansion
- Large capacity drives (6TB+) where rebuild time matters
- General-purpose workloads

**Not ideal for:**

- Small configurations (<12 drives) - not supported
- Maximum IOPS requirements - RAID 10 is faster
- Minimum drive count scenarios - RAID 5/6 more efficient with fewer drives

### 11.7 ADAPT Restrictions on ME5

- All drives must be **same type** (all SSD or all HDD)
- All drives must be in **same tier** (can't mix Performance/Standard/Archive)
- Different **capacities allowed** (data distributed proportionally)
- Cannot exceed **1.5 PiB** per disk group
- Maximum **4 ADAPT disk groups** per controller

---

## 12. Sources

- [Dell PowerVault ME5200 Series Spec Sheet](https://www.delltechnologies.com/asset/en-us/products/storage/technical-support/powervault-me52xx-spec-sheet.pdf)
- [Dell PowerVault ME5 Series Administrator's Guide](https://www.dell.com/support/manuals/en-us/powervault-me5084/me5_series_ag/raid-levels)
- [Dell PowerVault ME5 Best Practices White Paper](https://www.delltechnologies.com/asset/en-us/products/storage/technical-support/h19551-dell-powervault-me5-series-storage-system-best-practices-wp.pdf)
- [StorageReview: Dell PowerVault ME5 Review](https://www.storagereview.com/review/dell-powervault-me5-storage-next-gen-entry-storage-block-storage-array)
- [Dell PowerVault ME5 Support Matrix](https://www.dell.com/support/manuals/en-us/powervault-me5212/me52xx_series_freya_sm/introduction)
- [Dell InfoHub: PowerVault ME5 VMware Best Practices](https://infohub.delltechnologies.com/en-us/l/dell-powervault-me5-series-vmware-vsphere-best-practices/)
- [Dell InfoHub: PowerVault ME5 SQL Server Best Practices](https://infohub.delltechnologies.com/en-us/l/dell-powervault-me5-series-microsoft-sql-server-best-practices/)
- [TechTarget: Performance, capacity tick up with Dell PowerVault ME5](https://www.techtarget.com/searchstorage/news/252513889/Performance-capacity-tick-up-with-Dell-PowerVault-ME5)
