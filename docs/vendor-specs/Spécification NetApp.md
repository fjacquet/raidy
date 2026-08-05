**Spécifications : NetApp Architect Calculator**

## **1\. Vue d'ensemble**

Le logiciel est une application (Web ou Desktop) permettant aux architectes et ingénieurs de simuler la capacité effective et les performances (IOPS/Latence) d'une infrastructure de stockage NetApp. Il doit permettre de comparer différentes configurations matérielles et logicielles.

## **2\. Périmètre Technologique**

### **2.1 Technologies Supportées (Scope In)**

Le logiciel doit prendre en charge les gammes actuelles et les protocoles modernes de l'écosystème NetApp (ONTAP & SANtricity).

| Catégorie               | Séries / Technologies                                 | Détails                                               |
| :---------------------- | :---------------------------------------------------- | :---------------------------------------------------- |
| **Hardware (Flash)**    | **AFF A-Series** (A150, A250, A400, A800, A900)       | NVMe pur, haute performance.                          |
| **Hardware (Flash)**    | **AFF C-Series** (C250, C400, C800)                   | QLC Flash (Capacité optimisée).                       |
| **Hardware (Block)**    | **ASA** (All SAN Array)                               | Optimisé pour LUNs (Symetric Active/Active).          |
| **Hardware (Hybrid)**   | **FAS Series** (FAS2700, FAS2800, FAS9000)            | Disques rotatifs (NL-SAS) \+ SSD Cache (Flash Pool).  |
| **Hardware (E-Series)** | **EF-Series & E-Series**                              | Calcul brut, Video surveillance, HPC (OS SANtricity). |
| **Software-Defined**    | **ONTAP Select**                                      | Version virtuelle d'ONTAP sur serveurs commodity.     |
| **Cloud**               | **CVO** (Cloud Volumes ONTAP)                         | AWS, Azure, Google Cloud.                             |
| **Disques**             | NVMe SSD, SAS SSD, NL-SAS                             | 960GB à 30TB+                                         |
| **RAID**                | RAID-DP, RAID-TEC, Dynamic Disk Pools (DDP)           | Gestion de la parité.                                 |
| **Protocoles**          | NFS (v3, v4.1), SMB, iSCSI, FC, NVMe/FC, NVMe/TCP, S3 |                                                       |

### **2.2 Technologies Non Supportées (Scope Out)**

Ces technologies sont soit obsolètes, soit hors du périmètre "Core Storage".

- **OS Legacy :** 7-Mode (Obsolète).
- **Hardware EOL (End of Life) :** FAS8000 series, FAS2500 series, AFF8000 (sauf demande spécifique d'archive).
- **SolidFire / HCI :** Element OS (Architecture scale-out spécifique, exclue pour simplifier la v1).
- **Tape/VTL :** Pas de calcul de performance séquentielle sur bande.
- **Switching :** Le dimensionnement des switchs Cluster/Interconnect n'est pas inclus (supposé non-bloquant).

## ---

**3\. Module de Calcul de Volumétrie (Capacity Sizing)**

L'objectif est de passer du "Raw Capacity" (Brut) au "Effective Capacity" (Utilisable réel).

### **3.1 Entrées Utilisateur (Inputs)**

- **Modèle de Baie :** (ex: AFF A400).
- **Quantité & Type de disques :** (ex: 24x 3.8TB NVMe SSD).
- **Type de RAID :** RAID-DP (double parité) ou RAID-TEC (triple parité \- recommandé pour disques \>10TB).
- **Partitionnement Root :** ADPv1 ou ADPv2 (Advanced Drive Partitioning \- crucial pour les petits systèmes afin de ne pas perdre de disques entiers pour l'OS).

### **3.2 Algorithme de Calcul**

Le logiciel doit appliquer les réductions en cascade.

1. Right-Sizing (Base 10 vs Base 2\) : Conversion de la capacité marketing (TB) en capacité binaire (TiB).

   $$C\_{TiB} \\approx C\_{TB} \\times 0.909$$

2. **Overhead WAFL & Checksum :** Soustraire environ 1-2% pour le système de fichier WAFL.
3. **RAID Penalty :**
   - RAID-DP : $N\_{disques} \- 2$ par RAID Group.
   - RAID-TEC : $N\_{disques} \- 3$ par RAID Group.
4. **Snapshot Reserve :** Pourcentage réservé aux snapshots (défaut 5% ou 0% sur les nouveaux AFF).
5. Efficacité des données (Data Reduction Ratio \- DRR) :
   Le logiciel doit permettre de choisir un profil de données ou d'entrer un ratio manuel (ex: 3:1).
   - _Technologies à factoriser :_ Zéro-détection \+ Déduplication inline \+ Compression inline \+ Compaction \+ Déduplication post-process.

Formule simplifiée de la Capacité Effective ($C\_{eff}$) :

$$C\_{eff} \= (C\_{raw} \- C\_{raid\\\_overhead} \- C\_{root\\\_aggr}) \\times (1 \- \\%\_{snap\\\_res}) \\times R\_{efficiency}$$

## ---

**4\. Module de Calcul de Performance (Performance Sizing)**

C'est la partie la plus critique. Elle doit estimer si le contrôleur (CPU/RAM) ou les disques (Backend) seront le goulot d'étranglement.

### **4.1 Entrées Utilisateur (Workload Definition)**

- **Type d'IO :** Lecture / Écriture (ex: 70% Read / 30% Write).
- **Aléatoire vs Séquentiel :** (ex: 100% Random pour VDI / SQL).
- **Taille de Bloc (Block Size) :** 4KB, 8KB, 32KB, 64KB, etc.
- **Protocole :** (L'overhead du iSCSI est plus élevé que le FC pour le CPU).

### **4.2 Logique de Simulation**

Le moteur doit comparer la demande aux limites du matériel (basé sur des abaques ou benchmarks type SPECfs).

1. **Calcul des IOPS Disque (Backend) :**
   - Pour les HDD (SAS/NL-SAS), calculer la limite mécanique.
   - Pour les SSD/NVMe, la limite est souvent le bus SAS/PCIe ou le CPU.
2. **Calcul de la charge Contrôleur (Headroom) :**
   - Chaque modèle (A250, A400, etc.) a une courbe de latence "Optimal Point".
   - Si $IOPS\_{demandés} \> IOPS\_{max\\\_controller}$, la latence explose exponentiellement.
3. **Impact de l'efficacité sur la performance :**
   - La compression/déduplication consomme des cycles CPU (augmente la latence contrôleur) mais réduit les écritures disques (réduit la latence backend). Le logiciel doit équilibrer ces deux facteurs.

### **4.3 Sorties (Outputs)**

- **IOPS Max Supportés** à X ms de latence (ex: 150k IOPS @ 1ms).
- **Throughput (Débit)** en MB/s ou GB/s.
- **Utilisation CPU estimée :** (ex: 65%).
- **Goulot d'étranglement identifié :** (ex: "Limité par le CPU Controller" ou "Limité par le nombre de disques").

## ---

**5\. Interface Utilisateur (UI/UX)**

Pour un fan de technologie, l'interface doit être "Dark Mode", réactive et dense en informations.

- **Dashboard :** Vue scindée. À gauche les configurations (Inputs), à droite les jauges de performance et barres de capacité en temps réel.
- **Visualisation Physique :** \- Afficher une représentation graphique de la baie remplie (Drawio-like).
- **Comparateur :** Possibilité de mettre deux configurations côte à côte (ex: AFF A250 vs AFF C250) pour voir le Delta Prix/Perf (si intégration d'une liste de prix).
- **Export :** Génération d'un rapport PDF "Executive Summary" et d'un CSV détaillé.

## **6\. Architecture Technique (Suggestion de Stack)**

- **Frontend :** React.js ou Vue.js (pour la réactivité des jauges lors du changement de curseurs). Chart.js pour les courbes de latence.
- **Backend :** Python (Django/FastAPI) ou Go. Python est recommandé pour les bibliothèques mathématiques (NumPy) si les calculs de files d'attente (Queuing Theory) deviennent complexes.
- **Database :** PostgreSQL ou SQLite. Stockage des spécifications matérielles (Specs des contrôleurs, limites des disques) en format JSON/Relationnel.
