**Spécification : Ceph Sizing & Performance Calculator**

## **1\. Objectif du Logiciel**

Fournir une estimation précise de la **capacité utile** (Volumétrie) et des **performances théoriques** (IOPS, Débit, Latence) d'un cluster Ceph en fonction du matériel et de la configuration logicielle choisis.

## **2\. Module d'Entrée (Inputs Utilisateur)**

Le logiciel doit permettre de définir l'architecture physique et logique.

### **A. Configuration Matérielle (Par Nœud)**

- **Nombre de Nœuds (Hosts):** Entier (min 3 pour la redondance).
- **CPU:** Nombre de Cores / Fréquence (impacte les IOPS, surtout pour les petits blocs).
- **RAM:** Quantité totale (Règle empirique Ceph : \~4GB par OSD \+ Overhead).
- **Disques de Données (OSD):**
  - Quantité par nœud.
  - Type : HDD, SSD (SATA/SAS), NVMe.
  - Capacité unitaire (TB).
  - IOPS constructeur (R/W).
  - Bande passante constructeur (MB/s).
- **Disques de Journal/DB (Optionnel \- WAL/DB Offload):**
  - Si séparation des WAL/DB (ex: Données sur HDD, Metadata sur NVMe).
  - Ratio (ex: 1 NVMe pour 4 HDD).
- **Réseau (Frontend & Backend):**
  - Vitesse d'interface (1Gb, 10Gb, 25Gb, 100Gb+).
  - Bonding (LACP, Active-Backup).

### **B. Configuration Logique (Pools)**

- **Méthode de Protection :**
  - **Réplication :** Facteur de réplication (ex: 2, 3, 4).
  - **Erasure Coding (EC) :** Schéma $k \+ m$ (ex: 4+2, 8+3).
- **Type de Workload (Profil d'usage) :**
  - Block (RBD), Object (RGW), ou File (CephFS).
  - Pattern I/O : Séquentiel vs Aléatoire.
  - Taille de bloc (4k, 64k, 4M).
  - Ratio Lecture/Écriture (ex: 70/30).

## ---

**3\. Module de Calcul : Volumétrie**

Le cœur du calcul de capacité doit prendre en compte les pertes liées à la protection et aux recommandations de sécurité (Full Ratio).

**Formules Clés (en LaTeX) :**

1. Capacité Brute ($C\_{raw}$) :

   $$C\_{raw} \= N\_{nodes} \\times N\_{osd\\\_per\\\_node} \\times C\_{disk}$$

2. **Efficacité du Stockage ($E$) :**
   - Pour la Réplication ($R$) :
     $$E \= \\frac{1}{R}$$
   - Pour l'Erasure Coding ($k, m$) :
     $$E \= \\frac{k}{k+m}$$
3. Capacité Utile Théorique ($C\_{usable}$) :

   $$C\_{usable} \= C\_{raw} \\times E$$

4. Capacité Utile Réelle (Safe Max) :
   Ceph ne doit jamais être rempli à 100%. Le seuil par défaut nearfull est souvent à 85%.

   $$C\_{safe} \= C\_{usable} \\times 0.85$$

**Règle Spéciale :** Le logiciel doit alerter si la taille du WAL/DB (sur NVMe dédié) est trop petite pour supporter les données des HDD associés (recommandation : min 4% de la capacité du HDD pour le DB BlueStore).

## ---

**4\. Module de Calcul : Performance**

C'est la partie la plus critique. Ceph introduit une pénalité d'écriture (Write Penalty) due à la distribution des données.

### **A. Calcul des IOPS (Input/Output Operations Per Second)**

1. **IOPS Bruts du Cluster ($IOPS\_{raw}$) :** Somme des IOPS de tous les disques.
2. **IOPS en Lecture :** Proche du brut, limité par le réseau.
3. **IOPS en Écriture (Write Penalty) :**
   - Chaque écriture client génère plusieurs IOs sur les disques.
   - Réplication ($R$) :
     $$IOPS\_{write} \= \\frac{IOPS\_{raw} \\times WriteRatio}{R}$$
   - Erasure Coding : Pénalité plus élevée (Read-Modify-Write pour les petits blocs), souvent facteur 2x à 4x selon la taille du bloc.

### **B. Calcul du Throughput (Débit MB/s)**

Le logiciel doit identifier le goulot d'étranglement (Bottleneck) entre :

1. **Vitesse Disque :** Somme des débits séquentiels des disques.
2. Vitesse Réseau :

   $$T\_{network} \= \\frac{Bandwidth\_{link} \\times N\_{nodes}}{ReplicationFactor}$$

   Note : Le trafic de réplication consomme de la bande passante "Backend".

### **C. Latence Estimée**

Difficile à calculer exactement, mais le logiciel doit fournir des ordres de grandeur basés sur la topologie :

- **Base Latency :** Latence média (ex: NVMe 0.1ms, HDD 10ms).
- **Network Latency :** Ajout de \~0.05ms à 0.5ms selon le réseau.
- **Software Overhead :** Ceph ajoute du temps CPU (CRC check, placement CRUSH).
  - _Calcul :_
    $$Latence\_{total} \\approx (Latence\_{media} \\times 2\) \+ Latence\_{reseau} \+ Overhead\_{cpu}$$

## ---

**5\. Matrice de Compatibilité Technologique**

Le logiciel doit valider les choix de l'utilisateur avec une liste stricte.

### **✅ Technologies Supportées (Autorisées)**

| Type              | Détails                         | Usage Recommandé                                         |
| :---------------- | :------------------------------ | :------------------------------------------------------- |
| **HDD SATA/SAS**  | 7.2k RPM, 10k RPM, 15k RPM      | Stockage de masse (Bulk), Object Storage, Cold Data.     |
| **SSD SATA/SAS**  | TLC, MLC, QLC (avec cache SLC)  | Usage général, RBD, Hot Data.                            |
| **NVMe (PCIe)**   | U.2, M.2, AIC                   | Performance extrême, WAL/DB offload.                     |
| **Optane / PMEM** | Intel Optane DC                 | Ultra-low latency pour WAL/DB (Metadata).                |
| **Réseau**        | Ethernet (TCP/IP)               | Standard 10/25/40/100 GbE.                               |
| **JBOD / HBA**    | Mode "IT Mode" ou "Passthrough" | **Obligatoire.** Ceph doit voir le disque physique brut. |

### **❌ Technologies Non Supportées (Interdites / Avertissements)**

Le logiciel doit afficher une **ERREUR BLOQUANTE** ou un **AVERTISSEMENT ROUGE** pour :

1. **Hardware RAID (RAID 5/6/10/0) :** Ceph gère sa propre redondance. Mettre du RAID matériel sous Ceph cache la géométrie du disque, tue les performances et complique la maintenance.
2. **Disques SMR (Shingled Magnetic Recording) :** Surtout les "Drive Managed SMR". Ils causent des latences énormes qui font tomber les OSD Ceph. **Strictement interdit.**
3. **Réseau WiFi / CPL :** Latence trop instable pour le protocole de consensus (Paxos/Raft) des moniteurs Ceph.
4. **Stockage "Partagé" (SAN/NAS) en Backend :** Monter un LUN iSCSI ou un NFS pour le formater en OSD est une hérésie architecturale.
5. **Tape (Bande LTO) :** Ceph n'est pas conçu pour gérer la latence d'accès séquentiel des bandes.
6. **Clés USB / Cartes SD :** Trop faible endurance pour héberger le système ou les données (sauf pour boot OS _read-only_ strict, mais déconseillé pour OSD).

## ---

**6\. Sorties (Outputs) & Dashboard**

Le logiciel générera un rapport visuel :

1. **Jauge de Capacité :**
   - RAW vs USABLE vs SAFE USABLE.
2. **Graphe de Performance :**
   - Courbe IOPS estimée en fonction de la taille des blocs (4K \-\> 4M).
   - Ligne rouge indiquant le goulot d'étranglement (ex: "Limité par le Réseau 10GbE").
3. **Score de Viabilité :**
   - Calculer le ratio RAM/OSD (Si \< 2GB \-\> "Danger").
   - Calculer le ratio CPU/OSD (Si \< 1 Core/OSD sur NVMe \-\> "Bottleneck CPU").

## **7\. Stack Technique Suggérée**

Pour un développement rapide et robuste :

- **Backend :** Python (pour les calculs mathématiques et la logique).
- **Frontend :** React.js ou Vue.js (pour les jauges interactives).
- **Format de config :** JSON ou YAML pour sauvegarder les specs des clusters.
