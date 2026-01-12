# Spécification Logicielle : Nutanix Acropolis Storage & Performance Calculator

## 1. Objectif du Projet

Développer une application permettant aux architectes et administrateurs système d'estimer la capacité utile réelle (après réduction de données et réplication) et les performances théoriques (IOPS, Latence, Throughput) d'un cluster Nutanix AOS.

## 2. Périmètre Technologique

### A. Technologies de Stockage Supportées (Entrées valides)

Le logiciel doit gérer les configurations matérielles suivantes :

- **Tiering :**
  - **All-Flash (AF) :** NVMe + SSD (SATA/SAS).
  - **Hybrid :** SSD (Cache/Hot tier) + HDD (Cold tier).
  - **Memory :** Utilisation de la RAM pour le cache en lecture (OpLog).
- **Topologies de Disques :**
  - SATA SSD, SAS SSD, NVMe, HDD (7.2k, 10k, 15k).
- **Mécanismes de protection & Efficacité :**
  - Replication Factor (RF2 et RF3).
  - Compression (Inline & Post-process).
  - Deduplication (Cache & Capacity tiers).
  - Erasure Coding (EC-X).

### B. Technologies Non Supportées / Hors Périmètre (À rejeter ou ignorer)

L'outil doit explicitement exclure ou signaler comme "Non-Nutanix Native" :

- **RDM (Raw Device Mapping) :** Disques physiques passés directement à la VM sans couche AOS.
- **Stockage Externe :** LUNs provenant d'une baie SAN tierce (ex: NetApp, EMC) connectée en iSCSI aux VMs (le calcul de perf ne peut pas s'appliquer ici).
- **Tape Drives / VTL :** Non géré par DSF.
- **Floppy Images / ISOs :** Exclus des calculs de performance (uniquement capacité basique).

---

## 3. Module 1 : Calcul de Volumétrie (Capacité)

L'objectif est de passer du "Raw Storage" (Brut) au "Effective Usable Storage" (Utile effectif).

### Entrées Utilisateur (Inputs)

1. **Nombre de Nœuds :** $N$ (ex: 4 nœuds).
2. **Disques par Nœud :** Quantité et taille (ex: 2x 1.92TB SSD + 4x 10TB HDD).
3. **Facteur de Réplication (RF) :** RF2 (Standard) ou RF3 (Haute Disponibilité).
4. **Optimisations (Toggles) :**
   - Compression activée ? (Ratio estimé : ex. 1.5:1).
   - Deduplication activée ? (Ratio estimé : ex. 1.2:1).
   - Erasure Coding (EC-X) activé ?

### Logique de Calcul (Backend)

Le logiciel doit appliquer les formules suivantes.

1. Calcul de la capacité Brute Cluster ($C_{raw}$):

$$C_{raw} = N \times \sum (Disk_{qty} \times Disk_{size})$$

1. Réservation Système (CVM & Overhead):

Il faut soustraire l'espace réservé par le système de fichiers (environ 5-10% pour les snapshots, métadonnées, et reconstruction).

$$C_{formatted} = C_{raw} \times 0.90$$

1. Application du RF (Replication Factor):

C'est la réduction la plus impactante.

$$C_{usable\_phy} = \frac{C_{formatted}}{RF}$$

(Où $RF = 2$ ou $RF = 3$)

1. Application de l'Erasure Coding (Si activé):

Si EC-X est activé (généralement sur les données froides), le ratio change. Pour un striping 4:1 (RF2) :

$$C_{usable\_ec} = C_{formatted} \times 0.75$$

> Approximation, car EC ne s'applique pas à tout

1. Capacité Effective (Avec réduction de données):

$$C_{effective} = C_{usable} \times (Ratio_{comp} \times Ratio_{dedup})$$

### Sorties (Outputs)

- Tableau comparatif : Raw vs Usable (RF2) vs Usable (RF3).
- Gains estimés grâce à la compression/dedup (en TB économisés).

---

## 4. Module 2 : Calcul de Performance (IOPS & Throughput)

Ce module est complexe car Nutanix repose sur la localité des données (Data Locality).

### Entrées Utilisateur - Performance (Inputs)

1. **Type de Workload :**
   - VDI (Random, petits blocs).
   - Base de données (Random/Sequential mix).
   - Big Data / Backup (Sequential, gros blocs).
2. **Ratio Read/Write :** (ex: 70/30).
3. **Taille de Bloc (Block Size) :** 4K, 8K, 32K, 64K+.
4. **Specs Matérielles des Disques :** IOPS max par SSD/NVMe (ex: 30,000 IOPS par disque).

### Logique de Calcul - Performance (Backend)

1. Calcul de l'IOPS Brut Théorique :

Attention : Dans un système hybride, seuls les SSD/NVMe comptent pour les IOPS performants (Hot tier). Les HDD fournissent de la capacité, pas de la performance transactionnelle.

$$IOPS_{max\_cluster} = N \times (SSD_{qty} \times IOPS_{ssd\_unit})$$

1. Pénalité d'écriture (Write Penalty) :

Nutanix écrit les données deux fois (RF2) ou trois fois (RF3) de manière synchrone avant d'acquitter l'écriture (Oplog).

- Read Penalty = 1 (Localité des données = lecture locale).
- Write Penalty = 2 (RF2) ou 3 (RF3).

L'IOPS effectif ($IOPS_{eff}$) se calcule ainsi :

$$IOPS_{eff} = \frac{IOPS_{max\_cluster}}{(\%Read \times 1) + (\%Write \times RF)}$$

1. Impact de la Latence Réseau :

Ajouter une latence fixe pour la réplication CVM-to-CVM (Inter-node replication).

- Si NVMe/RoCE (RDMA) : +0.1ms latence.
- Si 10GbE standard : +0.5ms latence.

### Sorties - Performance (Outputs)

- **IOPS Max (Read 100%)** vs **IOPS Max (Write 100%)**.
- **Throughput estimé :**
  $$TP = IOPS_{eff} \times BlockSize$$
- **Avertissement de goulot d'étranglement :** Si le Throughput dépasse la bande passante réseau des nœuds (ex: 2x 10GbE).

---

## 5. Interface Utilisateur (Wireframe concept)

L'interface doit être divisée en trois panneaux :

1. **Panneau de Gauche (Configuration Hardware) :**
   - Menu déroulant pour le modèle de nœud (NX-1000, NX-3000, etc.) ou "Custom".
   - Sliders pour le nombre de nœuds.
   - Sélecteur pour le type de disques.
2. **Panneau Central (Scénario) :**
   - Choix du RF (2 ou 3).
   - Toggles pour Compression/Dedup.
   - Définition du profil I/O (Read/Write ratio).
3. **Panneau de Droite (Résultats - Dashboard) :**
   - Jauge circulaire pour la capacité (Utilisée vs Libre).
   - Graphique en barres pour les IOPS (Read vs Write).
   - Alertes rouges pour les configurations non supportées (ex: HDD seul pour VDI).

---

## 6. Architecture Technique Suggérée

Pour un développement moderne et portable (Windows/Linux/Web) :

- **Langage :** Python (pour la logique mathématique robuste).
- **Backend Framework :** FastAPI ou Flask.
- **Frontend :** React ou Vue.js (pour la réactivité des jauges en temps réel).
- **Bibliothèques Python :**
  - pandas (gestion des profils disques et matrices de calcul).
  - matplotlib ou plotly (génération des graphiques de performance).
- **Export :** Capacité à générer un rapport PDF ou CSV.
