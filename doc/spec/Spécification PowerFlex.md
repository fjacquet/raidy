**Spécification Logicielle : PowerFlex Calculator (Ultimate Edition)**

## **1. Vision du Produit**

Un outil de modélisation pour architectes et ingénieurs stockage permettant de dimensionner des clusters Dell PowerFlex (HCI ou Two-Layer). Le logiciel doit comparer les modes de protection (Mirroring vs Compression vs Erasure Coding) et prédire les goulots d'étranglement.

## ---

**2. Module d'Entrée : Configuration du Cluster**

L'interface doit permettre de définir le "Hardware Pool".

### **2.1 Paramètres Physiques (Node Level)**

- **Type de Nœud :**
  - _PowerFlex Node (Appliance/Rack)_
  - _Custom Node (Dell PowerEdge R660/R760)_
- **CPU :** Fréquence et nombre de cœurs (Impacte la performance en mode Compression/EC).
- **RAM :** Quantité (Le mode "Ultra/FG" consomme plus de RAM pour les métadonnées).
- **Réseau (Backend/Frontend) :** 25GbE, 100GbE (Obligatoire pour NVMe/Ultra).

### **2.2 Paramètres de Stockage**

- **Type de Media :** NVMe (Requis pour Ultra), SAS SSD. _HDD est exclu._
- **Capacité Unitaire :** 1.92TB, 3.84TB, 7.68TB, 15.36TB.
- **Quantité :** 4 à 24 disques par nœud.

## ---

**3. Module de Calcul : Volumétrie & Protection**

Le moteur doit supporter trois algorithmes de protection distincts selon le choix de l'utilisateur.

### **Mode A : PowerFlex Standard (Performance Pur)**

_Technologie : Medium Granularity (MG) \- Mesh Mirroring._

- **Usage :** Bases de données haute performance, pas de compression.
- Formule Utile :

  $$C\_{utile} \= \\frac{C\_{raw} \\times (1 \- \\%\_{spare})}{2}$$

  (Division par 2 car 2 copies exactes).

### **Mode B : PowerFlex Ultra (Efficacité)**

_Technologie : Fine Granularity (FG) \- Mesh Mirroring \+ Compression Inline._

- **Condition :** Disques NVMe obligatoires.
- Formule Effective :

  $$C\_{effective} \= \\left( \\frac{C\_{raw} \\times (1 \- \\%\_{overhead\\\_FG})}{2} \\right) \\times R\_{comp}$$

- **Variables :**
  - $\\%\_{overhead\\\_FG}$ : \~12-15% (Réservé pour logs et métadonnées fines).
  - $R\_{comp}$ : Taux de compression (Input utilisateur : ex. 2:1 pour DB, 4:1 pour VDI).

### **Mode C : Erasure Coding (Haute Densité / Simulation)**

_Technologie : Erasure Coding distribué (similaire à vSAN RAID 5/6)._

- **Usage :** Archivage, Object Storage, ou comparaison compétitive.
- **Schémas Supportés :** 4+1 (RAID5-like), 4+2 (RAID6-like), 8+2, 12+4.
- Formule Utile :

  $$C\_{utile\\\_EC} \= C\_{raw} \\times \\frac{N\_{data}}{N\_{data} \+ M\_{parity}} \\times (1 \- \\%\_{overhead})$$

  Exemple : En 4+2, l'efficacité brute est de 66% (contre 50% en mirroring).

## ---

**4. Module de Calcul : Performance (IOPS & Latence)**

Le logiciel doit calculer le **"Point de Rupture"** (Bottleneck). La performance réelle est la valeur la plus basse entre les trois limites ci-dessous.

### **4.1 Limite Backend (Disques & Write Penalty)**

C'est ici que le choix de la technologie (Mirror vs EC) impacte le calcul.

- **Calcul IOPS Total Disques :** $Total\\\_IOPS\_{backend} \= N\_{disks} \\times IOPS\_{per\\\_disk}$
- **Pénalité d'écriture (Write Penalty \- WP) :**
  - _Mode Standard/Ultra (Mirroring) :_ $WP \= 2$ (1 écriture client \= 2 écritures disque).
  - _Mode Erasure Coding :_
    - Séquentiel : $WP \\approx 1.2$ (Full stripe write).
    - Aléatoire : $WP \= N\_{parity} \+ 1$ (Read-Modify-Write). _Pour du 4+2, WP \= 3 à 4._

$$IOPS\_{frontend\\\_max} \= \\frac{Total\\\_IOPS\_{backend}}{R\_{ratio} \+ (W\_{ratio} \\times WP)}$$

### **4.2 Limite Nœud (CPU & Software Overhead)**

Le logiciel doit appliquer un "malus" CPU selon le mode :

- **Standard :** 100% de la capacité IOPS du nœud disponible.
- **Ultra (Compression) :** Malus de \-15% IOPS (Coût du calcul LZ4).
- **Erasure Coding :** Malus de \-30% IOPS en écriture (Calcul de parité lourd).

### **4.3 Limite Réseau**

$$Throughput\_{max} \= N\_{nodes} \\times Speed\_{NIC} \\times 0.8 \\text{ (Efficience TCP/IP)}$$

## ---

**5. Matrice de Compatibilité (Règles Métier)**

Le logiciel doit inclure un validateur automatique (Checklist) avant de lancer le calcul.

| Composant              | Standard (MG)     | Ultra (FG/Comp)          | Erasure Coding    |
| :--------------------- | :---------------- | :----------------------- | :---------------- |
| **Disques**            | NVMe, SAS SSD     | **NVMe (Requis)**        | NVMe, SAS SSD     |
| **Réseau**             | 10GbE min         | **25GbE min**            | 25GbE min         |
| **NTP**                | Recommandé        | **Strict (Obligatoire)** | Recommandé        |
| **RAID Contrôleur**    | Passthrough (HBA) | Passthrough (HBA)        | Passthrough (HBA) |
| **Mélange de Disques** | Oui (même pool)   | **Non (Strict)**         | Non recommandé    |

### **Technologies "Non Supportées" (Blacklist)**

- **HDD Rotatifs :** Exclus pour tout mode "Performance" ou "Ultra".
- **RAID Matériel (PERC, SmartArray) :** Interdit. PowerFlex doit voir les disques bruts.
- **Réseau 1GbE :** Interdit.
- **SATA SSD :** Non supporté pour le mode Ultra (Latency trop élevée).

## ---

**6. Interface Utilisateur & Scénarios**

L'UI doit proposer trois onglets principaux :

### **Onglet 1 : "Sizer" (Dimensionnement)**

- Entrée des besoins (ex: J'ai besoin de 500TB utiles et 1M IOPS).
- Suggestion automatique du nombre de nœuds.

### **Onglet 2 : "Simulator" (Comparatif)**

- Un graphique à barres côte-à-côte :
  - Barre Bleue : **PowerFlex Standard** (Plus de disques, latence ultra-basse).
  - Barre Verte : **PowerFlex Ultra** (Moins de disques, compression active).
  - Barre Orange : **Erasure Coding** (Capacité max, mais attention aux écritures aléatoires).

### **Onglet 3 : "Stress Test" (Performance)**

- Curseurs pour modifier le R/W Ratio (70/30, 50/50, 100% Write).
- Visualisation immédiate de la chute d'IOPS si on passe en Erasure Coding avec 100% Random Write (démonstration pédagogique).
