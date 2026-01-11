# **Project Name: Raidy**

### **Type: Single Page Application (SPA) / Progressive Web App (PWA)**

### **Goal: The definitive, browser-based simulator for modern storage infrastructure (NVMe, ZFS, S2D, Cloud Hybrid).**

## ---

**1\. Technical Architecture**

### **1.1. Technology Stack**

* **Core:** React (Functional Components \+ Hooks) or Svelte 5\.  
* **Language:** TypeScript (Strict Mode). *Critical for maintaining complex math type-safety.*  
* **State Management:** URL-based State (Zustand or Recoil syncs to URL Hash).  
  * *Why:* Enables "Copy URL to Share" without a backend database.  
* **Math Engine:** Pure TypeScript for logic; Web Workers for Monte Carlo simulations (Resilience engine).  
* **Visualization:** Recharts (for simple graphs) \+ D3.js (for custom Capacity Waterfall charts).  
* **Styling:** Tailwind CSS (Mobile responsive, Dark Mode native).  
* **Deployment:** Static hosting (Vercel / Netlify / GitHub Pages).

### **1.2. Data Flow**

1. **Initialization:** App loads drive\_db.json (static asset).  
2. **Input:** User modifies configuration (RAID level, Drive Count, File System).  
3. **Process:** React useEffect hooks trigger recalculation across 4 Logic Modules.  
4. **Output:** Dashboard updates real-time. URL Hash updates silently.

## ---

**2\. Data Structure (The "Database")**

Since there is no backend, the "intelligence" lives in strictly typed JSON definitions.

### **2.1. Drive Definitions (drives.json)**

TypeScript

interface Drive {  
  id: string;          // e.g., "wd-gold-24tb"  
  model: string;  
  type: "HDD" | "SSD\_SATA" | "SSD\_SAS" | "SSD\_NVMe";  
  capacity\_raw: number; // Bytes  
  sector\_size: 512 | 4096;  
  performance: {  
    iops\_read: number;  
    iops\_write: number;  
    bandwidth\_read\_mb: number; // Sequential  
    bandwidth\_write\_mb: number;  
  };  
  reliability: {  
    ure\_rate: 14 | 15 | 16 | 17; // 10^-x  
    afre: number; // Annual Failure Rate %  
    dwpd: number; // Drive Writes Per Day (for SSD life)  
  };  
  power: {  
    idle\_watts: number;  
    load\_watts: number;  
  };  
  cost\_avg: number; // USD (Base reference)  
}

## ---

**3\. Core Logic Modules**

### **3.1. Module A: Volumetry & Efficiency Engine**

*Handles the "How much space do I actually get?" question.*

**Supported Topologies:**

1. **Standard RAID:** 0, 1, 10, 5, 6, 50, 60\.  
2. **ZFS:** Stripe, Mirror, RAID-Z1/Z2/Z3, **dRAID**.  
3. **S2D (Storage Spaces Direct):** Mirror, Dual Parity, MAP (Mirror-Accelerated Parity).  
4. **Proprietary:** Synology SHR, NetApp RAID-DP.

**Critical Calculations (The "2026" Logic):**

* ZFS Overhead (The "Slop" Factor):

  $$Capacity\_{ZFS} \= (Raw \- Parity) \\times 0.96875 \\text{ (1/32 reserved)} \\times \\text{CompressionRatio}$$  
  * *Constraint:* If ashift=12 (4Kn drives) and small files are selected, apply "Padding Overhead" penalty.  
* **S2D Efficiency:**  
  * *Mirror:* $50\\%$ or $33\\%$.  
  * *Dual Parity:* $Efficiency \= \\frac{Nodes \- 2}{Nodes}$ (simplified for columnar calculation).  
  * *Reserve:* Subtract 1 drive equivalent per node if "Automatic Rebuild Reserve" is checked.  
* **Veeam/Reflink Logic:**  
  * User Toggle: \[x\] File System supports Reflink (XFS/ReFS)  
  * If True: BackupSize \= Full \+ (Incrementals \* ChangeRate)  
  * If False: BackupSize \= (Full \* Retention) \+ (Incrementals \* ChangeRate)

### **3.2. Module B: Performance & Bottleneck Engine**

*Handles the "Where is my choke point?" question.*

The Chain Calculation:  
Compare the throughput of these 4 layers; the lowest value is the System Max.

1. **Media Limit:** $N\_{drives} \\times DriveSpeed \\times Penalty\_{RAID}$  
   * *RAID 5/6 Write Penalty:* Divide by 4 (R5) or 6 (R6) if Random I/O.  
2. **Controller/CPU Limit:**  
   * *Software RAID (mdadm/ZFS):* Cap at \~12GB/s per CPU core (estimation).  
   * *Hardware RAID:* Cap at card limit (e.g., Broadcom 9600 \= 24GB/s).  
   * *GPU (GRAID):* Cap at PCIe Gen limits (e.g., 60GB/s).  
3. **Bus Limit:**  
   * PCIe Gen4 x8: \~14 GB/s.  
   * PCIe Gen5 x16: \~63 GB/s.  
4. **Network Limit (Front-end):**  
   * $100\\text{GbE} \\approx 11.5 \\text{ GB/s}$ (after TCP overhead).

**Advanced Output:**

* **XFS Stripe Alignment:** Calculate sunit and swidth values based on RAID chunk size inputs.

### **3.3. Module C: Resilience (Monte Carlo)**

*Handles the "Will I lose data?" question.*

Instead of a simple formula, use a **JavaScript Web Worker** to run 10,000 simulations:

1. **Input:** Drive Count, RAID Level, Drive Size, Read Speed (Rebuild speed).  
2. **Simulation:**  
   * Fail Drive 1 at $T=0$.  
   * Calculate Rebuild Time: $T\_{rebuild} \= Capacity / Speed$.  
   * Roll Dice for URE (Unrecoverable Read Error) on remaining bits during $T\_{rebuild}$.  
   * Roll Dice for 2nd Drive failure during $T\_{rebuild}$.  
3. **Output:** "99.999% Probability of Survival" (Survival Rate).

### **3.4. Module D: Sustainability & TCO**

*Handles the "What is the Carbon/Financial Cost?" question.*

**Formulas:**

* **Energy Use:** $(N \\times Watts\_{drive}) \+ Watts\_{server} \+ (Watts\_{total} \\times PUE\_{cooling\\\_overhead})$  
* **CO2 Emissions:** $kWh\_{annual} \\times CarbonIntensity\_{grid}$ (User selectable region: e.g., Switzerland (Low), Germany (High)).  
* **Flash Endurance:** Calculate if the chosen SSD will survive the 5-year workload based on DWPD.

## ---

**4\. UI/UX Specification**

### **4.1. Layout Strategy (The "Cockpit")**

Split screen layout. Fixed Input on Left, Reactive Output on Right.

### **4.2. Inputs (Accordion Style)**

* **Hardware:** Drive model selector, Count, Server Count.  
* **Topology:** RAID/ZFS/S2D selection.  
* **Workload:** Read/Write %, Block Size (4K/64K/1M), Dataset size.  
* **Advanced:** Compression Ratio (LZ4/ZSTD), Dedup Ratio, Network Speed.

### **4.3. Visual Outputs**

1. **The Sankey Diagram (Volumetry):**  
   * Flow: Raw TB $\\to$ RAID Overhead $\\to$ FileSystem Overhead $\\to$ **Usable Space**.  
   * *Why:* Visually explains to a boss where the TBs went.  
2. **The Speedometer (Performance):**  
   * A gauge showing current throughput vs Max Possible.  
   * *Red Zone:* Annotated "Network Bottleneck" if Network \< Media.  
3. **The Matrix (Recommendation):**  
   * Display mkfs commands and zpool create command strings ready to copy-paste.

## ---

**5\. Export & Share Capabilities**

* **Share:**  
  * Generate Share Link: Serializes the JSON state $\\to$ Base64 String $\\to$ Updates URL.  
* **Report:**  
  * Download PDF: Uses jspdf-autotable to render a clean, white-labeled PDF with the configuration summary and the "Waterfall" chart.  
* **Copy Config:**  
  * Copies a JSON block or YAML block (for Ansible/Terraform) representing the storage setup.

## ---

**6\. Testing & Validation Plan**

* **Unit Tests:**  
  * Verify RAID 5/6 math against industry standard formulas.  
  * Verify ZFS overhead matches OpenZFS documentation.  
* **Browser Benchmarks:**  
  * Ensure the Web Worker simulation doesn't crash a mobile browser.  
* **Comparison:**  
  * Validate results against *WintelGuy* (Legacy) and *NetApp Storage Efficiency Calculator* to ensure accuracy within 1%.

### 