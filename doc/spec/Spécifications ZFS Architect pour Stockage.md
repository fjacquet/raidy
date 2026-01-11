**Spécifications du Logiciel : ZFS Architect**

## **1\. Objectif du Projet**

Créer un outil capable de simuler un pool ZFS (Zpool) pour estimer précisément :

1. **La Volumétrie :** Capacité brute vs utile (après parité, overhead, réservation).
2. **La Performance :** IOPS et Débit (Throughput) théoriques en lecture et écriture.
3. **La Validation Matérielle :** Alertes sur les configurations invalides ou dangereuses.

## ---

**2\. Entrées Utilisateur (Input)**

L'interface doit permettre de définir la topologie du stockage.

### **A. Sélection du Matériel (Disques)**

L'utilisateur doit pouvoir choisir ou définir les caractéristiques des disques :

- **Type :** HDD, SSD (SATA/SAS), NVMe.
- **Taille :** En TB ou GB (Base 10\) ou TiB/GiB (Base 2).
- **Vitesse de rotation (HDD) :** 5400, 7200, 10k, 15k RPM.
- **IOPS unitaires :** (Ex: 100 pour HDD 7200, 10k pour SSD).
- **Taille de secteur physique :** 512n, 512e, 4Kn (Impacte ashift).

### **B. Configuration ZFS (Topologie)**

- **Type de VDEV de données :**
  - Mirror (n-way).
  - RAIDZ1, RAIDZ2, RAIDZ3.
  - dRAID (Distributed RAID \- _Optionnel/Avancé_).
  - Stripe (Dangereux, mais possible).
- **Nombre de VDEVs :** Combien de groupes de disques.
- **Disques par VDEV :** La largeur du stripe.
- **VDEVs Spéciaux (Metadatas/Cache) :**
  - **SLOG (ZIL) :** Pour les écritures synchrones (SSD/Optane).
  - **L2ARC :** Cache de lecture (SSD/NVMe).
  - **Special Allocation Class :** Pour stocker les métadonnées sur du flash rapide.

### **C. Paramètres Avancés**

- **Compression :** LZ4 (Standard), ZSTD (Moderne), GZIP (Archivage), OFF.
- **Occupation cible :** ZFS ralentit au-delà de 80% ou 90% d'occupation. Le logiciel doit permettre de définir une "limite de sécurité".

## ---

**3\. Matrice de Support Matériel**

Le logiciel doit inclure une base de données de règles de compatibilité.

### **✅ Technologies Autorisées & Supportées**

| Technologie            | Usage ZFS            | Notes                                                                               |
| :--------------------- | :------------------- | :---------------------------------------------------------------------------------- |
| **HDD (CMR)**          | Data Vdev            | Standard pour le stockage de masse.                                                 |
| **SATA/SAS SSD**       | Data, L2ARC, Special | Bon ratio prix/perf.                                                                |
| **NVMe**               | Data, SLOG, L2ARC    | Latence ultra-faible.                                                               |
| **Optane (3D XPoint)** | SLOG (ZIL)           | Le roi pour les écritures synchrones.                                               |
| **HBA (IT Mode)**      | Contrôleur           | **Obligatoire.** Le contrôleur doit laisser passer les disques bruts (Passthrough). |
| **ECC RAM**            | Mémoire              | Fortement recommandée pour l'intégrité des données.                                 |

### **❌ Technologies Non Supportées / À Bannir**

Le logiciel doit afficher un **avertissement rouge bloquant** si l'utilisateur sélectionne ces options :

- **HDD SMR (Shingled Magnetic Recording) :**
  - _Raison :_ Les disques SMR "Drive Managed" provoquent des timeouts et l'éjection des disques lors du resilvering ZFS. **Incompatible.**
- **Hardware RAID Cards (Mode RAID) :**
  - _Raison :_ ZFS a besoin d'un accès direct au disque pour gérer l'intégrité (bit-rot). Le RAID matériel masque la géométrie réelle.
- **Clés USB (pour Data) :**
  - _Raison :_ Fiabilité et endurance insuffisantes pour un pool de données.
- **Partitionnement Mixte (Windows/ZFS) :**
  - _Raison :_ ZFS préfère gérer le disque entier.

## ---

**4\. Logique de Calcul (Moteur Mathématique)**

Voici les formules que tu devras implémenter.

### **A. Calcul de Volumétrie**

ZFS a plusieurs couches de "perte" d'espace.

1. Conversion Décimale vers Binaire : Les vendeurs vendent en TB ($10^{12}$), les OS voient des TiB ($2^{40}$).

   $$C\_{base} \= C\_{market} \\times \\left( \\frac{10^{12}}{2^{40}} \\right) \\approx C\_{market} \\times 0.909$$

2. Overhead RAIDZ (Parité) :
   Soit $N$ le nombre de disques par VDEV et $P$ le niveau de parité (1, 2 ou 3).

   $$Efficacit\\acute{e}\_{RAID} \= \\frac{N \- P}{N}$$

3. **Slop Space & Metadata :** ZFS réserve environ 1/64ème (ou 1.6%) pour le "slop space" et un overhead variable pour les métadonnées. Compte une perte fixe de sécurité de **3.2%**.
4. Formule Finale (Estimée) :

   $$Capacit\\acute{e}\_{Utile} \= (N\_{Vdevs} \\times (DisquesPerVdev \- Parit\\acute{e}) \\times C\_{base}) \\times (1 \- Overhead\_{ZFS})$$

### **B. Calcul de Performance (Le point critique)**

C'est ici que la plupart des calculateurs échouent.

1\. IOPS en Lecture (Read IOPS)
En lecture, ZFS peut solliciter tous les disques.

$$IOPS\_{Read} \\approx N\_{TotalDisks} \\times IOPS\_{SingleDisk}$$
2\. IOPS en Écriture (Write IOPS) \- La règle d'or
Pour les écritures aléatoires, un VDEV RAIDZ a la performance d'un seul disque, quel que soit le nombre de disques dans ce VDEV (car il faut calculer et écrire la parité sur toute la stripe).

$$IOPS\_{Write(Random)} \\approx N\_{Vdevs} \\times IOPS\_{SingleDisk}$$

(C'est pourquoi pour la performance (bases de données, VMs), on privilégie les VDEVs en Mirror plutôt qu'en RAIDZ).
3\. Débit Séquentiel (Throughput)

$$Throughput\_{Seq} \\approx (N\_{TotalDisks} \- N\_{ParityDisks}) \\times Vitesse\_{DiskMB/s}$$

## ---

**5\. Interface Utilisateur (Wireframe Suggestion)**

L'écran principal doit être divisé en trois panneaux :

1. **Le Constructeur (Gauche) :**
   - Bouton "Ajouter VDEV".
   - Dropdown pour le type de disque (ex: "WD Red Pro 10TB").
   - Slider pour le nombre de disques.
   - Sélecteur de topologie (RAIDZ2, Mirror, etc.).
2. **Le Tableau de Bord (Centre/Droite) \- Mise à jour en temps réel :**
   - **Jauge de Capacité :** Affichant "Brut", "Après RAID", "Réellement Utilisable".
   - **Jauge de Performance :**
     - Barre verte : Lecture (MB/s et IOPS).
     - Barre orange : Écriture (MB/s et IOPS).
   - **Score de Fiabilité :** (Ex: "Excellent \- Tolère la perte de 2 disques sans perte de données").
3. **Le Panneau d'Alertes (Bas) :**
   - Affiche les warnings (ex: "Attention: RAIDZ1 avec des disques \> 2TB est risqué").
   - Affiche les erreurs (ex: "Erreur: Disques SMR détectés dans un VDEV ZFS").

## ---

**6\. Stack Technique Recommandée**

Puisque tu es fan de technologie, voici une stack moderne et portable :

- **Langage :** Python (backend de calcul solide) ou Rust (pour la précision et la sécurité).
- **Frontend :** React ou Vue.js avec une librairie de graphiques comme **Chart.js** ou **D3.js** pour visualiser les vdevs.
- **Distribution :** Electron (pour une app desktop Windows/Mac/Linux) ou Docker container (pour hébergement web/homelab).
