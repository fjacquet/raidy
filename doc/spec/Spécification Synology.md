**Spécification Logicielle : SynoMetric Pro**

## **1\. Vue d'ensemble**

L'objectif est de fournir une simulation précise de l'espace utile réel (après formatage et RAID) et une estimation des performances (IOPS et Débit) en fonction du matériel Synology sélectionné et de la configuration des disques.

## **2\. Entrées Utilisateur (Inputs)**

Le logiciel doit permettre de configurer trois couches distinctes :

### **A. Le Châssis (NAS/SAN)**

- **Modèle Synology :** (ex: DS923+, RS2423RP+, SA3600).
- **Contraintes associées :** Nombre de baies max, CPU (impact sur calcul RAID), Interfaces réseaux (1GbE, 10GbE, 25GbE), Support NVMe (Cache vs Pool).

### **B. Les Disques (Drive Configuration)**

L'utilisateur doit pouvoir remplir les baies ("Slots").

- **Type :** HDD (SATA/SAS), SSD (SATA/SAS), SSD NVMe.
- **Capacité unitaire :** 4TB, 8TB, 12TB, 20TB, etc.
- **Vitesse (RPM) :** 5400, 7200, 10k, 15k (pour SAS).
- **Performance unitaire (Spec sheet) :** IOPS R/W et Débit MB/s (valeurs par défaut basées sur des moyennes du marché si inconnu).

### **C. La Logique (RAID & Filesystem)**

- **Type de RAID :** Basic, JBOD, RAID 0, 1, 5, 6, 10, F1 (Flash), SHR-1, SHR-2.
- **Système de fichiers :** Btrfs (recommandé) ou EXT4.

## ---

**3\. Moteur de Calcul : Volumétrie**

Le calcul doit passer du "Raw" (Brut) au "Usable" (Réel).

### **Formules de base**

- **Conversion Marketing vs Binaire :** Les constructeurs vendent en TB ($10^{12}$), l'OS lit en TiB ($2^{40}$).
  - _Formule :_ Capacité affichée $\\approx$ Capacité disque $\\times 0.909$.
- **Overhead Système Synology :** DSM installe une partition système (RAID 1 sur tous les disques) \+ partition Swap.
  - _Estimation :_ Retirer environ \~20-30 Go par disque avant calcul RAID.

### **Algorithmes RAID (Espace disponible)**

- **RAID 0 :** Somme totale.
- **RAID 1 :** Taille du plus petit disque.
- **RAID 5 :** $(N-1) \\times \\text{taille du plus petit}$.
- **RAID 6 :** $(N-2) \\times \\text{taille du plus petit}$.
- **RAID 10 :** $(N/2) \\times \\text{taille du plus petit}$.
- **RAID F1 (Syno Spécifique) :** Similaire au RAID 5 mais avec une rotation de parité inégale pour préserver les SSD. Calcul $\\approx RAID 5$.

### **Le Cas Spécial : SHR (Synology Hybrid RAID)**

C'est la partie la plus complexe à coder. Le SHR divise les disques en "chunks" de taille égale et crée des micro-RAID.

- **SHR-1 :** Tolérance de panne de 1 disque. Utilise la somme de tous les disques moins le plus gros. Si les disques sont de tailles différentes, il optimise l'espace inutilisé par le RAID 5 classique en créant des sous-volumes RAID.
- **SHR-2 :** Tolérance de 2 disques.

### **Overhead Filesystem (Btrfs)**

- Btrfs réserve environ 4% de l'espace pour les métadonnées.
- **Résultat Final :** (Espace Post-RAID) \* 0.96.

## ---

**4\. Moteur de Calcul : Performance**

Ici, nous calculons la performance **théorique maximale**.

### **Métriques**

1. **IOPS (Input/Output Operations Per Second) :** Pour les bases de données/VMs.
2. **Throughput (MB/s) :** Pour le transfert de fichiers vidéo/gros fichiers.

### **A. Performance Disque Nue (Base)**

- HDD 7200rpm : \~80-100 IOPS.
- SSD SATA : \~5,000 \- 80,000 IOPS.
- NVMe : \~300,000+ IOPS.

### **B. Pénalité d'écriture RAID (Write Penalty)**

C'est le facteur critique pour la performance d'écriture.

- RAID 0/1/10 : Penalty \= 2 (On lit, on écrit).
- RAID 5 / SHR-1 : Penalty \= 4 (Lire donnée, lire parité, calculer nouvelle parité, écrire donnée, écrire parité).
- RAID 6 / SHR-2 : Penalty \= 6 (Calcul double parité).

Formule IOPS Effectifs (Écriture) :

$$IOPS\_{Total} \= \\frac{\\text{Somme des IOPS unitaires}}{\\text{RAID Write Penalty}}$$

### **C. Goulots d'étranglement (Bottlenecks)**

Le logiciel doit appliquer un "cap" (plafond) basé sur le matériel :

1. **Network Cap :**
   - 1GbE \= Max \~110 MB/s.
   - 10GbE \= Max \~1100 MB/s.
2. **SATA Interface Cap :** 6 Gb/s (\~550 MB/s par SSD).
3. **CPU Cap :** Les modèles bas de gamme (série J) saturent en calcul de parité RAID 5/6/SHR bien avant d'atteindre la vitesse max des disques.

## ---

**5\. Matrice des Technologies (Supportées vs Non-Supportées)**

Cette section est cruciale pour guider l'utilisateur.

| Catégorie           | Technologies Supportées (Autorisées) | Technologies Non-Supportées / Non-Recommandées | Notes Techniques                                                                                             |
| :------------------ | :----------------------------------- | :--------------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| **RAID**            | Basic, JBOD, RAID 0, 1, 5, 6, 10     | **RAID-Z, RAID-Z2, RAID-Z3**                   | Synology n'utilise pas le RAID ZFS natif, mais MDADM \+ LVM.                                                 |
| **Spécifique Syno** | **SHR-1, SHR-2, RAID F1**            | Drobo BeyondRAID, Unraid Parity                | SHR est propriétaire (LVM auto-management). F1 est pour les All-Flash.                                       |
| **Filesystem**      | **Btrfs, EXT4**, EXT3 (Legacy)       | **ZFS (Natif), XFS, NTFS (Root), APFS**        | Btrfs est "on top of" MDADM chez Synology (pas de ZFS pool). NTFS supporté uniquement en disque externe USB. |
| **Disques**         | SATA HDD/SSD, SAS HDD/SSD, M.2 NVMe  | **Disques "4Kn" natifs sur vieux modèles**     | Certains vieux contrôleurs ne gèrent pas le 4K natif.                                                        |
| **Cache**           | SSD R/W Cache, NVMe Cache            | Cache Tiering manuel (ex: Qtier QNAP)          | Synology gère le cache automatiquement, pas de tiering manuel blocs par blocs.                               |
| **Architecture**    | Linux MDRAID \+ LVM                  | Hardware RAID Controller                       | Les Synology sont des "Software RAID".                                                                       |

## ---

**6\. Interface Utilisateur (Wireframe concept)**

Je suggère une interface en 3 colonnes :

1. **Panneau Configuration (Gauche) :**
   - Sélecteur Dropdown pour le modèle de NAS (charge les specs JSON en background).
   - Grille visuelle des baies (Bays) : L'utilisateur clique sur une baie pour y assigner un disque.
   - Toggle Switch : "Activer Cache SSD".
2. **Visualisation (Centre) :**
   - **Barre de volumétrie :** \[ Système (Gris) | Perdu RAID (Rouge) | Utilisable (Vert) | Non utilisé (Hachuré) \].
   - Un graphique camembert montrant l'efficacité du stockage (Espace brut vs Espace utile).
3. **Tableau de Bord Performance (Droite) :**
   - Jauges de vitesse (Speedometers).
   - **Lecture Séquentielle (MB/s)** vs **Écriture Séquentielle**.
   - **Lecture Aléatoire (IOPS)** vs **Écriture Aléatoire**.
   - _Alerte intelligente :_ "Attention : Votre réseau 1GbE bridera votre performance RAID de 90%."

## **7\. Suggestion de Stack Technique**

Étant donné que tu es développeur et fan de tech :

- **Backend (Logique de calcul) :** Python (pour la facilité des maths) ou Go (pour la performance).
- **Frontend :** React ou Vue.js avec une librairie de graphiques comme _Chart.js_ ou _D3.js_ pour visualiser les baies et les jauges.
- **Data :** Un fichier JSON géant contenant les specs de tous les modèles Synology (CPU, Max RAM, Max Bays).
