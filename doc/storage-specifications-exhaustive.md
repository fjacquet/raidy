# Specifications Exhaustives des Technologies de Stockage Entreprise

Ce document recense les caracteristiques techniques et performances de toutes les technologies de stockage enterprise disponibles en 2024-2025.

---

## A. HDD 2.5" (Small Form Factor - SFF)

### A.1 HDD 15,000 RPM (Mission Critical)

| Constructeur | Modele | Capacite | Interface | IOPS R/W | Latence | Debit | MTBF | AFR | Puissance |
|--------------|--------|----------|-----------|----------|---------|-------|------|-----|-----------|
| Seagate | Exos 15E900 (15K.6) | 300GB | SAS 12Gb/s | 210/210 | 2.0ms | 300 MB/s | 2.0M h | 0.44% | 10.5W |
| Seagate | Exos 15E900 (15K.6) | 600GB | SAS 12Gb/s | 175/175 | 2.0ms | 315 MB/s | 2.0M h | 0.44% | 10.5W |
| Seagate | Exos 15E900 (15K.6) | 900GB | SAS 12Gb/s | 175/175 | 2.0ms | 315 MB/s | 2.0M h | 0.44% | 10.5W |
| HGST | Ultrastar C15K600 | 300GB | SAS 12Gb/s | 200/200 | 2.0ms | 290 MB/s | 2.0M h | 0.44% | 9.5W |
| HGST | Ultrastar C15K600 | 450GB | SAS 12Gb/s | 190/190 | 2.0ms | 295 MB/s | 2.0M h | 0.44% | 9.5W |
| HGST | Ultrastar C15K600 | 600GB | SAS 12Gb/s | 175/175 | 2.0ms | 300 MB/s | 2.0M h | 0.44% | 9.5W |

**Caracteristiques Cles 15K RPM:**
- Latence typique: 2.0ms (temps de recherche moyen)
- Secteurs: 512e ou 4Kn
- Dual-port SAS pour haute disponibilite
- Usage: OLTP, bases de donnees transactionnelles, Tier 1 legacy

**Remarque:** Les 15K RPM sont en fin de vie, remplaces par les SSD SAS pour applications mission-critical.

---

### A.2 HDD 10,000 RPM (Performance)

| Constructeur | Modele | Capacite | Interface | IOPS R/W | Latence | Debit | MTBF | AFR | Puissance |
|--------------|--------|----------|-----------|----------|---------|-------|------|-----|-----------|
| Seagate | Exos 10E2400 (Savvio) | 600GB | SAS 12Gb/s | 140/140 | 2.9ms | 260 MB/s | 2.0M h | 0.44% | 7.0W |
| Seagate | Exos 10E2400 | 1.2TB | SAS 12Gb/s | 140/140 | 2.9ms | 260 MB/s | 2.0M h | 0.44% | 7.5W |
| Seagate | Exos 10E2400 | 1.8TB | SAS 12Gb/s | 140/140 | 2.9ms | 260 MB/s | 2.0M h | 0.44% | 7.5W |
| Seagate | Exos 10E2400 | 2.4TB | SAS 12Gb/s | 140/140 | 2.9ms | 260 MB/s | 2.0M h | 0.44% | 8.0W |
| HGST | Ultrastar C10K1800 | 600GB | SAS 12Gb/s | 140/140 | 2.9ms | 254 MB/s | 2.0M h | 0.44% | 6.8W |
| HGST | Ultrastar C10K1800 | 900GB | SAS 12Gb/s | 140/140 | 2.9ms | 254 MB/s | 2.0M h | 0.44% | 7.0W |
| HGST | Ultrastar C10K1800 | 1.8TB | SAS 12Gb/s | 140/140 | 2.9ms | 241 MB/s | 2.0M h | 0.44% | 7.2W |
| WD | Ultrastar C10K1800 | 1.2TB | SAS 12Gb/s | 140/140 | 2.9ms | 254 MB/s | 2.0M h | 0.44% | 6.8W |

**Caracteristiques Cles 10K RPM:**
- Latence typique: 2.9ms
- Format: 2.5" x 15mm hauteur
- Secteurs: 512e ou 4Kn
- Usage: Serveurs d'applications, virtualisation, stockage hybride

---

### A.3 HDD 7,200 RPM (Nearline 2.5")

| Constructeur | Modele | Capacite | Interface | IOPS R/W | Latence | Debit | MTBF | AFR | Puissance |
|--------------|--------|----------|-----------|----------|---------|-------|------|-----|-----------|
| Seagate | Exos 7E2000 | 1TB | SAS 12Gb/s | 100/100 | 4.16ms | 190 MB/s | 2.0M h | 0.44% | 5.0W |
| Seagate | Exos 7E2000 | 2TB | SAS 12Gb/s | 100/100 | 4.16ms | 190 MB/s | 2.0M h | 0.44% | 5.5W |
| Seagate | Enterprise Cap 2.5 | 2TB | SATA 6Gb/s | 80/80 | 4.16ms | 180 MB/s | 2.0M h | 0.44% | 4.5W |

**Caracteristiques Cles 7.2K RPM 2.5":**
- Latence typique: 4.16ms
- Densite maximale contrainte par facteur de forme
- Usage: Stockage haute densite dans chassis 2U/4U

---

## B. HDD 3.5" (Large Form Factor - LFF)

### B.1 HDD CMR (Conventional Magnetic Recording)

#### B.1.1 Nearline 7,200 RPM CMR (4-24 TB)

| Constructeur | Modele | Capacite | Interface | IOPS R/W | Debit | MTBF | AFR | Puissance Idle/Load |
|--------------|--------|----------|-----------|----------|-------|------|-----|---------------------|
| Seagate | Exos X18 | 18TB | SATA/SAS | 170/170 | 270 MB/s | 2.5M h | 0.35% | 5.0W / 7.6W |
| Seagate | Exos X20 | 20TB | SATA/SAS | 180/180 | 285 MB/s | 2.5M h | 0.35% | 5.3W / 7.8W |
| Seagate | Exos X22 | 22TB | SATA/SAS | 180/180 | 285 MB/s | 2.5M h | 0.35% | 5.5W / 8.0W |
| Seagate | Exos X24 | 24TB | SATA/SAS | 180/180 | 285 MB/s | 2.5M h | 0.35% | 5.6W / 8.3W |
| WD | Ultrastar DC HC560 | 20TB | SATA/SAS | 164/164 | 269 MB/s | 2.5M h | 0.35% | 5.4W / 7.9W |
| WD | Ultrastar DC HC570 | 22TB | SATA/SAS | 175/175 | 272 MB/s | 2.5M h | 0.35% | 5.6W / 8.2W |
| WD | Ultrastar DC HC580 | 24TB | SATA/SAS | 180/180 | 298 MB/s | 2.5M h | 0.35% | 5.7W / 8.3W |
| WD | Gold | 24TB | SATA 6Gb/s | 150/150 | 298 MB/s | 2.5M h | 0.35% | 5.6W / 8.1W |
| Toshiba | MG10 | 20TB | SATA/SAS | 166/166 | 282 MB/s | 2.5M h | 0.35% | 5.2W / 7.8W |
| Toshiba | MG10 | 22TB | SATA/SAS | 170/170 | 288 MB/s | 2.5M h | 0.35% | 5.4W / 8.0W |

**Caracteristiques Cles CMR Nearline:**
- Technologie: 9-10 plateaux helium-sealed
- Secteurs: 512e ou 4Kn
- Workload Rating: 550 TB/an
- Garantie: 5 ans
- Usage: Serveurs de fichiers, NAS, baies RAID, archivage actif

---

### B.2 HDD SMR (Shingled Magnetic Recording)

#### B.2.1 Host-Managed SMR (HM-SMR)

| Constructeur | Modele | Capacite | Interface | Debit | MTBF | AFR | Zones | Usage |
|--------------|--------|----------|-----------|-------|------|-----|-------|-------|
| Seagate | Exos X20z | 20TB | SATA 6Gb/s | 285 MB/s | 2.5M h | 0.35% | HM | Hyperscale DC |
| Seagate | Exos X26z | 26TB | SATA 6Gb/s | 290 MB/s | 2.5M h | 0.35% | HM | Hyperscale DC |
| WD | Ultrastar DC HC650 | 20TB | SATA 6Gb/s | 280 MB/s | 2.5M h | 0.35% | HM | Hyperscale DC |

**Caracteristiques Cles HM-SMR:**
- +10-15% capacite vs CMR equivalent
- Requiert pile logicielle compatible (ZFS, Ceph, Linux ZBD)
- IOPS variables selon pattern d'ecriture (sequentiel prefere)
- Non compatible Windows/macOS (support Linux uniquement)
- Usage: Workloads sequentiels, cold storage, archivage

---

### B.3 HDD HAMR (Heat-Assisted Magnetic Recording)

| Constructeur | Modele | Capacite | Interface | Debit | MTBF | Statut |
|--------------|--------|----------|-----------|-------|------|--------|
| Seagate | Mozaic 3+ | 30TB | SATA/SAS | 295 MB/s | 2.5M h | Production 2024 |
| Seagate | Mozaic 3+ | 32TB | SATA/SAS | 300 MB/s | 2.5M h | Production Q4 2024 |
| Seagate | Mozaic 4+ | 36TB | SATA/SAS | 305 MB/s | 2.5M h | Q1 2025 |
| Seagate | Mozaic 4+ | 40TB | SATA/SAS | 310 MB/s | 2.5M h | 2026 (annonce) |
| Seagate | (Roadmap) | 50TB | SATA/SAS | TBD | 2.5M h | 2028 (roadmap) |

**Caracteristiques Cles HAMR:**
- Technologie: Laser chauffe localement le media pour ecriture
- Densite: 3+ Tb/in2 (vs 1.14 Tb/in2 PMR)
- Plateforme "Mozaic" avec 10+ plateaux
- MTBF maintenu a 2.5M heures
- Usage: Hyperscale, cloud storage, archivage massive scale

---

### B.4 HDD Dual Actuator (Mach.2)

| Constructeur | Modele | Capacite | Interface | IOPS R/W | Debit | MTBF | AFR |
|--------------|--------|----------|-----------|----------|-------|------|-----|
| Seagate | Exos 2X18 | 18TB | SATA/SAS | 304/560 | 554 MB/s | 2.5M h | 0.35% |
| Seagate | Exos 2X24 | 24TB | SATA/SAS | TBD | ~600 MB/s | 2.5M h | 0.35% |

**Caracteristiques Cles Dual Actuator:**
- Deux actuateurs independants sur un disque
- IOPS effectifs: 2x un disque standard
- Debit sequentiel: ~2x standard (via parallelisation)
- Latence: Identique au single actuator (~4.16ms)
- Usage: Workloads mixtes, virtualisation, bases de donnees sur HDD

---

## C. SSD SATA 2.5" (Enterprise)

### C.1 SSD SATA Read-Intensive (RI) - 1 DWPD

| Constructeur | Modele | Capacite | IOPS R/W | Debit R/W | DWPD | MTBF | Puissance |
|--------------|--------|----------|----------|-----------|------|------|-----------|
| Samsung | PM893 | 960GB | 98K/30K | 550/520 MB/s | 1 | 2.0M h | 3.1W |
| Samsung | PM893 | 1.92TB | 98K/30K | 550/520 MB/s | 1 | 2.0M h | 3.5W |
| Samsung | PM893 | 3.84TB | 98K/30K | 550/520 MB/s | 1 | 2.0M h | 3.8W |
| Samsung | PM893 | 7.68TB | 98K/30K | 550/520 MB/s | 1 | 2.0M h | 4.2W |
| Samsung | PM897 | 3.84TB | 97K/60K | 560/530 MB/s | 3 | 2.0M h | 4.5W |
| Micron | 5400 Pro | 960GB | 95K/32K | 540/520 MB/s | 1.5 | 2.0M h | 3.0W |
| Micron | 5400 Pro | 1.92TB | 95K/36K | 540/520 MB/s | 1.5 | 2.0M h | 3.4W |
| Micron | 5400 Pro | 3.84TB | 95K/36K | 540/520 MB/s | 1.5 | 2.0M h | 3.8W |
| Micron | 5400 Pro | 7.68TB | 95K/36K | 540/520 MB/s | 1.5 | 2.0M h | 4.3W |
| Micron | 5400 Max | 1.92TB | 95K/70K | 540/520 MB/s | 5 | 2.0M h | 4.8W |
| KIOXIA | HK6-R | 960GB | 88K/18K | 560/320 MB/s | 1 | 2.5M h | 2.8W |
| KIOXIA | HK6-R | 1.92TB | 88K/18K | 560/310 MB/s | 1 | 2.5M h | 3.0W |
| KIOXIA | HK6-R | 3.84TB | 88K/18K | 560/300 MB/s | 1 | 2.5M h | 3.3W |

**Caracteristiques Cles SSD SATA:**
- Interface limitee a ~550-560 MB/s (SATA III 6Gb/s)
- Latence: 50-100 us (vs 2-4ms HDD)
- Power Loss Protection (PLP) standard
- Usage: Boot drives, read caches, VDI, web servers

---

## D. SSD SAS 2.5" (Enterprise)

### D.1 SSD SAS 12Gb/s

| Constructeur | Modele | Capacite | IOPS R/W | Debit R/W | DWPD | MTBF | Puissance |
|--------------|--------|----------|----------|-----------|------|------|-----------|
| KIOXIA | PM6-R (24G SAS) | 960GB | 595K/100K | 4,300/1,150 MB/s | 1 | 2.5M h | 12W |
| KIOXIA | PM6-R | 1.92TB | 595K/100K | 4,300/1,150 MB/s | 1 | 2.5M h | 12W |
| KIOXIA | PM6-R | 3.84TB | 595K/90K | 4,300/1,100 MB/s | 1 | 2.5M h | 12W |
| KIOXIA | PM6-R | 7.68TB | 580K/85K | 4,200/1,050 MB/s | 1 | 2.5M h | 13W |
| KIOXIA | PM6-R | 15.36TB | 560K/80K | 4,100/950 MB/s | 1 | 2.5M h | 14W |
| KIOXIA | PM6-R | 30.72TB | 520K/70K | 4,000/900 MB/s | 1 | 2.5M h | 15W |
| KIOXIA | PM6-V (Mixed) | 1.6TB | 595K/160K | 4,300/2,700 MB/s | 3 | 2.5M h | 14W |
| KIOXIA | PM6-V | 3.2TB | 595K/160K | 4,300/2,700 MB/s | 3 | 2.5M h | 14W |
| KIOXIA | PM6-V | 6.4TB | 580K/150K | 4,200/2,600 MB/s | 3 | 2.5M h | 14W |
| KIOXIA | PM6-V | 12.8TB | 560K/140K | 4,100/2,500 MB/s | 3 | 2.5M h | 15W |
| KIOXIA | PM6-M (Write) | 800GB | 595K/245K | 4,300/4,100 MB/s | 10 | 2.5M h | 18W |
| KIOXIA | PM6-M | 1.6TB | 595K/240K | 4,300/4,100 MB/s | 10 | 2.5M h | 18W |
| KIOXIA | PM6-M | 3.2TB | 580K/230K | 4,200/4,000 MB/s | 10 | 2.5M h | 19W |
| KIOXIA | PM7 (24G SAS) | 1.92TB | 720K/175K | 4,200/4,100 MB/s | 1 | 2.5M h | 14W |
| KIOXIA | PM7 | 3.84TB | 720K/170K | 4,200/4,100 MB/s | 1 | 2.5M h | 14W |
| KIOXIA | PM7 | 7.68TB | 700K/160K | 4,100/4,000 MB/s | 1 | 2.5M h | 15W |
| KIOXIA | PM7 | 15.36TB | 680K/150K | 4,000/3,800 MB/s | 1 | 2.5M h | 16W |

**Caracteristiques Cles SSD SAS 24G:**
- Interface 24Gb/s SAS = 2x 12Gb/s legacy
- Dual-port pour haute disponibilite
- Latence: 60-100 us
- Usage: Baies de stockage enterprise, SAN FC/iSCSI

---

## E. NVMe SSD (Enterprise)

### E.1 NVMe M.2 (Enterprise)

| Constructeur | Modele | Capacite | IOPS R/W | Debit R/W | DWPD | Interface | Puissance |
|--------------|--------|----------|----------|-----------|------|-----------|-----------|
| Samsung | PM9A3 M.2 | 960GB | 800K/150K | 5,600/2,000 MB/s | 1 | PCIe 4.0 x4 | 8W |
| Samsung | PM9A3 M.2 | 1.92TB | 900K/170K | 6,400/2,700 MB/s | 1 | PCIe 4.0 x4 | 9W |
| Samsung | PM9A3 M.2 | 3.84TB | 1,000K/180K | 6,800/3,000 MB/s | 1 | PCIe 4.0 x4 | 10W |
| Micron | 7400 Pro M.2 | 960GB | 230K/60K | 4,400/1,000 MB/s | 1 | PCIe 4.0 x4 | 6W |
| Micron | 7400 Pro M.2 | 1.92TB | 430K/95K | 6,500/2,200 MB/s | 1 | PCIe 4.0 x4 | 8W |
| Micron | 7400 Pro M.2 | 3.84TB | 520K/105K | 6,600/2,700 MB/s | 1 | PCIe 4.0 x4 | 9W |

**Caracteristiques Cles NVMe M.2:**
- Format: M.2 22110 (110mm) ou 2280 (80mm)
- Contraintes thermiques: Dissipateur requis
- Capacite max: ~3.84TB (limite forme facteur)
- Usage: Boot drives, acceleration cache, edge computing

---

### E.2 NVMe U.2/U.3 (Enterprise TLC)

| Constructeur | Modele | Capacite | IOPS R/W | Debit R/W | DWPD | Interface | Puissance |
|--------------|--------|----------|----------|-----------|------|-----------|-----------|
| Samsung | PM9A3 U.2 | 960GB | 900K/180K | 6,500/2,000 MB/s | 1 | PCIe 4.0 x4 | 10W |
| Samsung | PM9A3 U.2 | 1.92TB | 1,000K/190K | 6,900/3,500 MB/s | 1 | PCIe 4.0 x4 | 11W |
| Samsung | PM9A3 U.2 | 3.84TB | 1,100K/200K | 6,900/4,000 MB/s | 1 | PCIe 4.0 x4 | 12W |
| Samsung | PM9A3 U.2 | 7.68TB | 1,100K/200K | 6,900/4,100 MB/s | 1 | PCIe 4.0 x4 | 13W |
| Samsung | PM9A3 U.2 | 15.36TB | 1,100K/200K | 6,900/4,100 MB/s | 1 | PCIe 4.0 x4 | 14W |
| Micron | 7400 Pro U.3 | 960GB | 530K/100K | 6,600/2,100 MB/s | 1 | PCIe 4.0 x4 | 10W |
| Micron | 7400 Pro U.3 | 1.92TB | 650K/130K | 6,600/3,600 MB/s | 1 | PCIe 4.0 x4 | 11W |
| Micron | 7400 Pro U.3 | 3.84TB | 850K/165K | 6,600/5,000 MB/s | 1 | PCIe 4.0 x4 | 12W |
| Micron | 7400 Pro U.3 | 7.68TB | 1,000K/190K | 6,600/5,400 MB/s | 1 | PCIe 4.0 x4 | 14W |
| Micron | 7400 Max U.3 | 1.6TB | 620K/180K | 6,600/4,200 MB/s | 3 | PCIe 4.0 x4 | 14W |
| Micron | 7400 Max U.3 | 3.2TB | 800K/200K | 6,600/5,200 MB/s | 3 | PCIe 4.0 x4 | 15W |
| Micron | 7400 Max U.3 | 6.4TB | 1,000K/215K | 6,600/5,400 MB/s | 3 | PCIe 4.0 x4 | 16W |
| KIOXIA | CM6-R U.3 | 960GB | 900K/90K | 6,900/2,800 MB/s | 1 | PCIe 4.0 x4 | 11W |
| KIOXIA | CM6-R U.3 | 1.92TB | 1,000K/100K | 6,900/4,000 MB/s | 1 | PCIe 4.0 x4 | 12W |
| KIOXIA | CM6-R U.3 | 3.84TB | 1,100K/110K | 6,900/4,000 MB/s | 1 | PCIe 4.0 x4 | 13W |
| KIOXIA | CM6-R U.3 | 7.68TB | 1,200K/120K | 6,900/4,000 MB/s | 1 | PCIe 4.0 x4 | 14W |
| KIOXIA | CM6-R U.3 | 15.36TB | 1,300K/140K | 6,850/4,000 MB/s | 1 | PCIe 4.0 x4 | 17W |
| KIOXIA | CM6-R U.3 | 30.72TB | 1,400K/170K | 6,850/4,000 MB/s | 1 | PCIe 4.0 x4 | 20W |
| KIOXIA | CM6-V U.3 | 1.6TB | 1,200K/240K | 6,900/5,300 MB/s | 3 | PCIe 4.0 x4 | 16W |
| KIOXIA | CM6-V U.3 | 3.2TB | 1,300K/260K | 6,900/5,300 MB/s | 3 | PCIe 4.0 x4 | 17W |
| KIOXIA | CM6-V U.3 | 6.4TB | 1,400K/280K | 6,900/5,300 MB/s | 3 | PCIe 4.0 x4 | 18W |

**Caracteristiques Cles NVMe U.2/U.3:**
- Format: 2.5" x 7mm ou 15mm hauteur
- Hot-plug capable (U.3 tri-mode)
- Dual-port possible (certains modeles)
- Usage: Workloads mixtes, bases de donnees, virtualisation

---

### E.3 NVMe EDSFF E1.S / E3.S (Enterprise)

| Constructeur | Modele | Format | Capacite | IOPS R/W | Debit R/W | DWPD | Interface |
|--------------|--------|--------|----------|----------|-----------|------|-----------|
| Samsung | PM9D3 E1.S | E1.S 15mm | 1.92TB | 1,600K/350K | 7,000/4,200 MB/s | 1 | PCIe 5.0 x4 |
| Samsung | PM9D3 E1.S | E1.S 15mm | 3.84TB | 1,800K/380K | 7,000/5,000 MB/s | 1 | PCIe 5.0 x4 |
| Samsung | PM9D3 E1.S | E1.S 15mm | 7.68TB | 2,000K/400K | 7,000/5,500 MB/s | 1 | PCIe 5.0 x4 |
| Micron | 9550 E3.S | E3.S | 3.84TB | 2,000K/400K | 14,000/7,000 MB/s | 1 | PCIe 5.0 x4 |
| Micron | 9550 E3.S | E3.S | 7.68TB | 2,500K/450K | 14,000/8,000 MB/s | 1 | PCIe 5.0 x4 |
| Micron | 9550 E3.S | E3.S | 15.36TB | 3,000K/500K | 14,000/9,000 MB/s | 1 | PCIe 5.0 x4 |
| Micron | 9550 E3.S | E3.S | 30.72TB | 3,300K/550K | 14,000/10,000 MB/s | 1 | PCIe 5.0 x4 |

**Caracteristiques Cles EDSFF:**
- E1.S: 118.75mm x 32.5mm (remplace M.2 pour enterprise)
- E3.S: 76mm x 7.5mm hauteur (remplace U.2)
- Meilleure gestion thermique que U.2/M.2
- Usage: Data centers nouvelle generation, AI/ML, HPC

---

### E.4 NVMe QLC (High Density)

| Constructeur | Modele | Capacite | IOPS R/W | Debit R/W | DWPD | Interface | Puissance |
|--------------|--------|----------|----------|-----------|------|-----------|-----------|
| Solidigm | D5-P5336 U.2 | 30.72TB | 700K/40K | 7,000/2,400 MB/s | 0.58 | PCIe 4.0 x4 | 20W |
| Solidigm | D5-P5336 U.2 | 61.44TB | 800K/45K | 7,000/2,800 MB/s | 0.58 | PCIe 4.0 x4 | 24W |
| Solidigm | D5-P5336 E1.L | 61.44TB | 850K/50K | 7,000/3,000 MB/s | 0.58 | PCIe 4.0 x4 | 25W |
| Solidigm | D5-P5336 E3.S | 61.44TB | 900K/55K | 7,000/3,200 MB/s | 0.58 | PCIe 4.0 x4 | 26W |
| Solidigm | D5-P5336 E3.S | 122.88TB | 930K/60K | 7,000/3,500 MB/s | 0.58 | PCIe 4.0 x4 | 28W |
| Samsung | PM9C3a | 15.36TB | 750K/70K | 7,200/2,500 MB/s | 0.6 | PCIe 5.0 x4 | 18W |
| Samsung | PM9C3a | 30.72TB | 800K/75K | 7,200/3,000 MB/s | 0.6 | PCIe 5.0 x4 | 22W |
| Micron | 6550 ION | 30.72TB | 750K/65K | 10,000/3,000 MB/s | 0.5 | PCIe 5.0 x4 | 22W |
| Micron | 6550 ION | 61.44TB | 850K/70K | 10,000/4,000 MB/s | 0.5 | PCIe 5.0 x4 | 25W |

**Caracteristiques Cles QLC:**
- Endurance: 0.3-0.6 DWPD (vs 1-3 TLC)
- Cout/TB: ~40% inferieur au TLC
- Latence lecture: Comparable TLC
- Latence ecriture: 2-3x plus elevee que TLC
- Usage: Read-intensive, archivage actif, CDN, media streaming

---

## F. Storage Class Memory (SCM)

### F.1 Intel Optane (3D XPoint)

| Constructeur | Modele | Capacite | IOPS R/W | Debit R/W | DWPD | Latence R/W | Interface |
|--------------|--------|----------|----------|-----------|------|-------------|-----------|
| Intel | Optane P5810X | 400GB | 1,380K/330K | 7,200/5,500 MB/s | 100 | 5us/5us | PCIe 4.0 x4 |
| Intel | Optane P5810X | 800GB | 1,380K/330K | 7,200/5,500 MB/s | 100 | 5us/5us | PCIe 4.0 x4 |
| Intel | Optane P5810X | 1.6TB | 1,380K/330K | 7,200/5,500 MB/s | 100 | 5us/5us | PCIe 4.0 x4 |
| Intel | Optane P5800X | 400GB | 1,500K/360K | 7,200/5,500 MB/s | 100 | 6us/6us | PCIe 4.0 x4 |
| Intel | Optane P5800X | 800GB | 1,500K/360K | 7,200/5,500 MB/s | 100 | 6us/6us | PCIe 4.0 x4 |
| Intel | Optane P5800X | 1.6TB | 1,500K/360K | 7,200/5,500 MB/s | 100 | 6us/6us | PCIe 4.0 x4 |

**Caracteristiques Cles Intel Optane:**
- Technologie: 3D XPoint (non-NAND)
- Latence: 5-10 us (vs 80-100 us NAND)
- Endurance: 100 DWPD (extreme)
- QoS: Latence deterministe (faible jitter)
- **Statut: Fin de production annoncee par Intel, stock restant uniquement**
- Usage: ZFS SLOG, write cache, metadata acceleration

---

### F.2 KIOXIA XL-FLASH (FL6 Series)

| Constructeur | Modele | Capacite | IOPS R/W | Debit R/W | DWPD | Latence R/W | Interface |
|--------------|--------|----------|----------|-----------|------|-------------|-----------|
| KIOXIA | FL6 | 800GB | 1,500K/400K | 3,000/1,500 MB/s | 60 | 29us/8us | PCIe 4.0 x4 |
| KIOXIA | FL6 | 1.6TB | 1,500K/400K | 3,000/1,500 MB/s | 60 | 29us/8us | PCIe 4.0 x4 |
| KIOXIA | FL6 | 3.2TB | 1,500K/400K | 3,000/1,500 MB/s | 60 | 29us/8us | PCIe 4.0 x4 |

**Caracteristiques Cles KIOXIA XL-FLASH:**
- Technologie: SLC 3D NAND (single-level cell)
- Latence: 8-29 us (inferieure au TLC/QLC)
- Endurance: 60 DWPD
- Alternative viable a Optane post-discontinuation
- Usage: ZFS SLOG, Ceph WAL/DB, metadata tiering

---

### F.3 Samsung Z-NAND (SZ985)

| Constructeur | Modele | Capacite | IOPS R/W | Debit R/W | DWPD | Latence R/W | Interface |
|--------------|--------|----------|----------|-----------|------|-------------|-----------|
| Samsung | SZ985 | 240GB | 750K/170K | 3,200/1,500 MB/s | 30 | 12us/16us | PCIe 3.0 x4 |
| Samsung | SZ985 | 480GB | 750K/170K | 3,200/1,500 MB/s | 30 | 12us/16us | PCIe 3.0 x4 |
| Samsung | SZ985 | 800GB | 750K/170K | 3,200/1,500 MB/s | 30 | 12-20us | PCIe 3.0 x4 |

**Caracteristiques Cles Samsung Z-NAND:**
- Technologie: Optimized SLC NAND
- Latence: 12-20 us
- Endurance: 30 DWPD
- **Statut: Production limitee, modele niche**
- Usage: Cache haute performance, metadata acceleration

---

## G. Comparaison des Metriques par Technologie

### G.1 IOPS par Technologie

| Technologie | IOPS Read (typ) | IOPS Write (typ) | Latence (typ) |
|-------------|-----------------|------------------|---------------|
| HDD 15K RPM | 175-210 | 175-210 | 2.0 ms |
| HDD 10K RPM | 140 | 140 | 2.9 ms |
| HDD 7.2K RPM | 75-100 | 75-100 | 4.16 ms |
| HDD Dual Act. | 300-400 | 400-600 | 4.16 ms |
| SSD SATA | 90-100K | 30-70K | 50-100 us |
| SSD SAS 24G | 520-720K | 70-245K | 60-100 us |
| NVMe U.2 Gen4 | 800K-1.4M | 100-280K | 60-80 us |
| NVMe EDSFF Gen5 | 1.6M-3.3M | 350-550K | 40-60 us |
| NVMe QLC | 700K-930K | 40-70K | 80-120 us |
| SCM Optane | 1.38-1.5M | 330-360K | 5-6 us |
| SCM XL-FLASH | 1.5M | 400K | 8-29 us |
| SCM Z-NAND | 750K | 170K | 12-20 us |

### G.2 Debit par Technologie

| Technologie | Read Max | Write Max | Interface |
|-------------|----------|-----------|-----------|
| HDD 15K RPM | 315 MB/s | 315 MB/s | SAS 12Gb/s |
| HDD 10K RPM | 260 MB/s | 260 MB/s | SAS 12Gb/s |
| HDD 7.2K RPM | 298 MB/s | 298 MB/s | SATA/SAS |
| HDD HAMR | 310 MB/s | 310 MB/s | SATA/SAS |
| HDD Dual Act. | 554 MB/s | 554 MB/s | SATA/SAS |
| SSD SATA | 560 MB/s | 530 MB/s | SATA 6Gb/s |
| SSD SAS 24G | 4,300 MB/s | 4,100 MB/s | SAS 24Gb/s |
| NVMe U.2 Gen4 | 6,900 MB/s | 5,400 MB/s | PCIe 4.0 x4 |
| NVMe EDSFF Gen5 | 14,000 MB/s | 10,000 MB/s | PCIe 5.0 x4 |
| NVMe QLC | 10,000 MB/s | 4,000 MB/s | PCIe 4/5 x4 |
| SCM Optane | 7,200 MB/s | 5,500 MB/s | PCIe 4.0 x4 |

### G.3 Endurance (DWPD) par Technologie

| Technologie | DWPD Typique | P/E Cycles | Garantie |
|-------------|--------------|------------|----------|
| SSD SATA RI | 1-1.5 | 3,000 TLC | 5 ans |
| SSD SATA MU | 3-5 | 6,000 TLC | 5 ans |
| SSD SAS RI | 1 | 3,000 TLC | 5 ans |
| SSD SAS MU | 3 | 6,000 TLC | 5 ans |
| SSD SAS WI | 10 | 25,000 TLC | 5 ans |
| NVMe TLC RI | 1 | 3,000 | 5 ans |
| NVMe TLC MU | 3 | 10,000 | 5 ans |
| NVMe QLC | 0.3-0.6 | 1,000 | 5 ans |
| SCM Optane | 100 | N/A (3D XPoint) | 5 ans |
| SCM XL-FLASH | 60 | 100,000 SLC | 5 ans |
| SCM Z-NAND | 30 | 50,000+ SLC | 5 ans |

### G.4 Cout par TB (Estimation 2024-2025)

| Technologie | USD/TB (approx) | Tendance |
|-------------|-----------------|----------|
| HDD 7.2K CMR (20TB+) | $12-18/TB | Stable |
| HDD HAMR (30TB+) | $15-22/TB | Baisse |
| HDD SMR | $10-14/TB | Stable |
| SSD SATA RI | $60-90/TB | Baisse |
| SSD SAS RI | $100-150/TB | Baisse |
| NVMe TLC RI | $70-120/TB | Baisse |
| NVMe TLC MU | $150-250/TB | Stable |
| NVMe QLC | $40-60/TB | Baisse |
| SCM Optane | $1,500-3,000/TB | Hausse (stock) |
| SCM XL-FLASH | $800-1,200/TB | Stable |

---

## H. Recommandations par Cas d'Usage

### H.1 Workloads Read-Intensive (80%+ reads)

| Priorite | Technologie | Capacite | Justification |
|----------|-------------|----------|---------------|
| 1 | NVMe QLC | 30-122TB | Meilleur cout/TB, latence acceptable |
| 2 | NVMe TLC RI | 7-30TB | Performance superieure si budget OK |
| 3 | SSD SATA RI | 3-8TB | Legacy, baies existantes |

### H.2 Workloads Write-Intensive (50%+ writes)

| Priorite | Technologie | Capacite | Justification |
|----------|-------------|----------|---------------|
| 1 | NVMe TLC MU 3DWPD | 1.6-6.4TB | Equilibre performance/endurance |
| 2 | SSD SAS PM6-M 10DWPD | 0.8-3.2TB | Extreme endurance |
| 3 | SCM XL-FLASH 60DWPD | 0.8-3.2TB | Ultra-endurance, latence minimale |

### H.3 Cold Storage / Archivage

| Priorite | Technologie | Capacite | Justification |
|----------|-------------|----------|---------------|
| 1 | HDD HAMR | 30-40TB | Densite maximale |
| 2 | HDD CMR Nearline | 20-24TB | Mature, fiable |
| 3 | NVMe QLC 122TB | 61-122TB | Si acces random necessaire |

### H.4 Metadata / Cache / SLOG

| Priorite | Technologie | Capacite | Justification |
|----------|-------------|----------|---------------|
| 1 | SCM Optane P5810X | 400GB-1.6TB | Latence minimale (si stock dispo) |
| 2 | KIOXIA FL6 XL-FLASH | 800GB-3.2TB | Alternative Optane viable |
| 3 | NVMe TLC MU Optane-gone | 400GB-1.6TB | Fallback si SCM indispo |

---

## I. Sources et References

- [Seagate Enterprise Datasheets](https://www.seagate.com/enterprise-storage/)
- [WD/HGST Ultrastar Specifications](https://www.westerndigital.com/products/data-center-drives)
- [KIOXIA Enterprise SSD Portfolio](https://americas.kioxia.com/en-us/business/ssd/enterprise-ssd.html)
- [Samsung Semiconductor SSD](https://semiconductor.samsung.com/ssd/)
- [Micron Data Center SSD](https://www.micron.com/products/ssd)
- [Solidigm Enterprise SSD](https://www.solidigm.com/products/data-center.html)
- [Intel Optane Technology](https://www.intel.com/content/www/us/en/products/memory-storage/optane-dc-persistent-memory.html)
- [StorageReview Enterprise SSD Reviews](https://www.storagereview.com/)
- [AnandTech Storage Analysis](https://www.anandtech.com/tag/ssd)
- [Blocks and Files Industry News](https://blocksandfiles.com/)

---

*Document genere le 2025-01-11 - Donnees basees sur specifications constructeurs et benchmarks independants*
