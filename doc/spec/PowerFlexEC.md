Spécification Logicielle : **PowerFlex Calculator (Ultimate Edition)**

### 1. Vision du Produit

Un **outil de modélisation** destiné aux architectes et ingénieurs
stockage permettant de **dimensionner des clusters Dell PowerFlex** dans
les contextes suivants :

- Clusters **PowerFlex 4.x** avec layouts **Medium Granularity (MG)** et
  **Fine Granularity (FG) + compression**.

- Simulation de clusters **PowerFlex 5.0 Ultra (SAE / Erasure Coding)**
  ou de **solutions concurrentes** basées sur l'Erasure Coding (RAID 5/6
  like).

L'objectif du logiciel est de :

- Comparer les modes de **protection / efficacité de capacité**
  (mirroring MG, FG+compression, EC).

- Prévoir les **goulots d'étranglement** en IOPS / bande passante / CPU
  / réseau.

- Fournir une **vue pédagogique** pour les discussions avant-vente, les
  ateliers d'architecture et les comparatifs compétitifs.

> **Note de terminologie :** *Dans cette spécification, "Ultra" est
> utilisé pour désigner soit la release officielle **PowerFlex 5.0 Ultra
> (SAE + EC)**, soit un **mode interne du calculateur orienté Erasure
> Coding**. Ce label ne doit pas être confondu avec les layouts MG/FG de
> PowerFlex 4.x.*

------------------------------------------------------------------------

### 2. Module d'Entrée : Configuration du Cluster

L'interface doit permettre de définir un **"Hardware Pool"** comprenant
:

- Les caractéristiques des **nœuds**.

- La configuration des **médias de stockage**.

- Les **paramètres réseau**.

- Les choix de **layout (MG, FG, EC)** et de **compression**.

#### 2.1 Paramètres Physiques (Node Level)

Le calculateur doit permettre de définir, pour chaque type de nœud :

- **Type de Nœud :**

  - **PowerFlex Node** (Appliance / Rack).

  - **Custom Node** (ex. Dell PowerEdge R660 / R760).

- **CPU :**

  - Nombre de cœurs et fréquence.

  - Impact direct sur les modes **FG + compression** et **Erasure
    Coding**, où le calculateur appliquera un **coût CPU** (malus IOPS
    configurable).

- **Mémoire (RAM + Mémoire Persistante) :**

<!-- -->

- Le calculateur doit gérer trois profils :

  - **Profil MG (4.x -- Medium Granularity)**
    - RAM standard, dimensionnée via un modèle simplifié (par exemple "X
      Go + Y Go par To brut").
    - Pas de mémoire persistante obligatoire.
  - **Profil FG + Compression (4.x -- Fine Granularity)**
    - RAM supplémentaire pour métadonnées FG.
    - **Mémoire persistante (SDPM ou NVDIMM) requise** pour
      l'"acceleration pool" interne (logs, compression, métadonnées).
    - Le calculateur doit intégrer une **formule de sizing** (RAM +
      SDPM) en fonction du nombre et de la capacité des disques.
  - **Profil Ultra / SAE (5.0 -- Erasure Coding)**
    - PMEM (SDPM/NVDIMM) **recommandée** pour le write cache distribué,
      mais non obligatoire dans le modèle.
    - Le calculateur doit permettre de modéliser la présence ou non de
      PMEM et d'ajuster légèrement les performances en conséquence
      (optionnel).

<!-- -->

- **Réseau (Backend / Frontend) :**

<!-- -->

- Le calculateur doit gérer la **vitesse de lien** par nœud :

  - **Vitesses supportées dans l'outil** : 10 GbE, 25 GbE, 100 GbE.

  - **Recommandations intégrées :**

    - Mode **MG (4.x)** :
      - 10 GbE minimal,
      - 25/100 GbE recommandés pour les clusters de forte taille.
    - Mode **FG + Compression (4.x)** :
      - 25 GbE minimal recommandé.
    - Mode **EC / Ultra / NVMe/TCP** :
      - 25 ou 100 GbE fortement recommandés.

  - Le calculateur doit dériver le **throughput maximal théorique** par
    nœud à partir de la vitesse des NIC.

#### 2.2 Paramètres de Stockage

Le module d'entrée doit permettre de définir, par type de nœud et par
Storage Pool :

- **Type de Média (vu par le calculateur)**

<!-- -->

- Le calculateur modélise les types suivants :

  - **MG (4.x -- Medium Granularity)**

    - HDD, SSD SAS/SATA, NVMe.

    - Par simplification, le calculateur peut **exclure les HDD** des
      scénarios de performance (option : "HDD non modélisés"), tout en
      indiquant clairement qu'il s'agit d'un **choix de l'outil**, pas
      d'une limitation produit.

  - **FG + Compression (4.x -- Fine Granularity)**

    - Médias **full-flash** uniquement : SSD ou NVMe.

    - Obligation d'avoir de la **mémoire persistante** (SDPM/NVDIMM) sur
      les nœuds concernés.

  - **EC / Ultra (5.0 -- SAE / Erasure Coding)**

    - Médias **SSD/NVMe** homogènes dans le Device Group.

<!-- -->

- **Capacité Unitaire (par disque) :**

  - 1,92 TB, 3,84 TB, 7,68 TB, 15,36 TB (liste extensible dans l'outil).

- **Quantité de disques par nœud :**

  - Intervalle configurable, par exemple **4 à 24 disques** par nœud,
    avec contrôle de cohérence (limites physiques dépendant du châssis
    sélectionné).

- **Homogénéité des Storage Pools :**

  - Le calculateur doit supposer **un type de média homogène par Storage
    Pool**.

  - Le mélange HDD/SSD/NVMe dans un même pool est **considéré comme non
    supporté dans le modèle** (même si certains cas sont techniquement
    possibles).

------------------------------------------------------------------------

### 3. Module de Calcul : Volumétrie & Protection

Le moteur doit supporter **trois algorithmes de protection distincts**,
sélectionnés par l'utilisateur :

- **Mode A : PowerFlex 4.x -- MG (Performance)**
- **Mode B : PowerFlex 4.x -- FG + Compression (Efficacité)**
- **Mode C : Erasure Coding (Ultra / SAE / Compétiteur)**

#### 3.1 Mode A : PowerFlex 4.x -- MG (Performance Pur)

- **Technologie modélisée :** Medium Granularity (MG) -- mirroring
  distribué.

- **Usage typique dans l'outil :**

  - Bases de données à forte intensité I/O.
  - Workloads latence très basse sans compression.

- **Hypothèse de protection :** 2 copies (FTT=1).

- **Formule de capacité utile (simplifiée) :**

\[ C\_{utile} = \]

- **Paramètres :**

  - ( C\_{raw} ) : capacité brute totale du Storage Pool (somme de tous
    les disques).
  - ( %\_{spare} ) : pourcentage de spare distribué (configurable : ex.
    20--25 %).

#### 3.2 Mode B : PowerFlex 4.x -- FG + Compression (Efficacité)

- **Technologie modélisée :** Fine Granularity (FG) -- mirroring +
  inline compression.

- **Usage typique :**

  - Workloads compressibles (DB, VDI, virtualisation générale).
  - Environnements avec usage intensif de snapshots.

- **Hypothèse de protection :** 2 copies (mirroring, FTT=1), comme MG.

- **Overhead FG :**

<!-- -->

- Le calculateur modélise un overhead global \*\*(%\_{overhead_FG})\*\*
  qui regroupe :

  - Overhead métadonnées FG.

  - Over-provisioning nécessaire à la LSA (log-structured array) et à la
    compression.

<!-- -->

- **Formule de capacité effective (simplifiée) :**

\[ C\_{effective} = ( ) R\_{comp} \]

- **Paramètres :**

  - ( C\_{raw} ) : capacité brute totale du Storage Pool FG.

  - ( %\_{overhead_FG} ) : paramètre utilisateur ou par défaut (ex.
    12--15 %).

  - ( R\_{comp} ) : taux de compression cible (input utilisateur).

    - Exemples typiques dans l'UI :
      - 1,5:1 -- workloads peu compressibles.
      - 2:1 -- bases de données.
      - 3--4:1 -- VDI / postes virtuels.

- Le modèle ne distingue pas la capacité utilisée par les snapshots :
  l'UI peut prévoir un **slider "% snapshots"** qui augmente
  artificiellement la consommation logique avant compression.

#### 3.3 Mode C : Erasure Coding (Ultra / SAE / Compétiteur)

- **Technologie modélisée :** Erasure Coding distribué.

- **Interprétation dans le calculateur :**

  - Soit un cluster **PowerFlex 5.0 Ultra (SAE, 2+2, 8+2, etc.)**.

  - Soit une **solution concurrente EC** (ex. vSAN RAID5/6) pour
    comparatif.

- **Schémas EC supportés :**

  - 4+1 (RAID5-like)

  - 4+2 (RAID6-like)

  - 8+2

  - 12+4

- **Formule de capacité utile :**

\[ C\_{utile_EC} = C\_{raw} (1 - %\_{overhead}) \]

- **Paramètres :**

  - ( C\_{raw} ) : capacité brute totale.
  - ( N\_{data} ) : nombre de "data chunks".
  - ( M\_{parity} ) : nombre de "parity chunks".
  - ( %\_{overhead} ) : overhead additionnel (spare + métadonnées,
    configurable).

- **Exemple pédagogique :**

  - En 4+2 : efficacité brute = 4 / 6 ≈ 66 %.

  - En 8+2 : efficacité brute = 8 / 10 = 80 %.

- **Optionnelle :** l'outil peut permettre d'ajouter un **taux de
  compression** par-dessus l'EC pour modéliser PowerFlex Ultra ou des
  solutions EC compressées (même formule que FG, mais sans division par
  2).

------------------------------------------------------------------------

### 4. Module de Calcul : Performance (IOPS & Latence)

Le logiciel doit calculer, pour chaque scénario, un **"Point de
Rupture"** (bottleneck).\
La performance effective côté client est le **minimum** entre :

- La **limite backend** (disques + write penalty).

- La **limite CPU / logiciel** par nœud.

- La **limite réseau** (NIC × nœuds × efficience).

#### 4.1 Limite Backend (Disques & Write Penalty)

- **IOPS totaux Backend :**

\[ Total_IOPS\_{backend} = N\_{disks} IOPS\_{per_disk} \]

- ( N\_{disks} ) : nombre total de disques dans le Storage Pool.

- ( IOPS\_{per_disk} ) : valeur par défaut ou saisie utilisateur (ex.
  5000 IOPS pour un SSD, etc.).

- **Pénalité d'écriture (Write Penalty -- WP) :**

<!-- -->

- Le calculateur doit modéliser la pénalité d'écriture en fonction du
  mode :

  - **Mode A (MG -- mirroring)**

    - ( WP = 2 )
      - 1 écriture client = 2 écritures disque.

  - **Mode B (FG + Compression -- mirroring)**

    - Même penalty de base ( WP = 2 ).
    - L'impact de la compression est pris en compte dans le **malus
      CPU**, pas dans WP.

  - **Mode C (EC)**

    - **Séquentiel (full stripe write)** :
      - ( WP ,1--1,2 ) (écritures alignées).
    - **Aléatoire (read-modify-write)** :
      - Modèle simplifié :\
        \[ WP = M\_{parity} + 1 \] Par exemple, en 4+2, ( WP ) (avec
        marge 3--4 selon la granularité).

<!-- -->

- **IOPS max côté frontend (modèle R/W) :**

\[ IOPS\_{frontend_max} = \]

- **Paramètres :**

  - ( R\_{ratio} ) : proportion de lectures (ex. 0,7 pour 70 %).
  - ( W\_{ratio} ) : proportion d'écritures (0,3 pour 30 %).
  - Le calculateur doit proposer des presets : 70/30, 50/50, 100 % read,
    100 % write.

#### 4.2 Limite Nœud (CPU & Overhead Logiciel)

Le logiciel doit appliquer un **"malus CPU"** selon le mode de
protection :

- **Standard MG (4.x -- performance)**

  - Capacité IOPS de référence : 100 %.

- **FG + Compression (4.x)**

  - Coût CPU de la compression.
  - Modèle simplifié : **--15 % IOPS** vs MG au même hardware.

- **Erasure Coding (Ultra / SAE / Compétiteur)**

  - Coût CPU sur les opérations d'écriture (calcul de parité,
    reconstruction).
  - Modèle simplifié :
    - --30 % IOPS en écriture,
    - impact moindre sur la lecture (paramétrable).

Le calculateur doit prendre le **minimum** entre :

- IOPS_limit_backend (section précédente).

- IOPS_limit_CPU (profil CPU × malus).

#### 4.3 Limite Réseau

Le throughput maximal réseau côté frontend peut être modélisé par :

\[ Throughput\_{max} = N\_{nodes} Speed\_{NIC} Efficiency \]

- ( N\_{nodes} ) : nombre de nœuds participant au cluster.

- ( Speed\_{NIC} ) : débit par nœud (ex. 10, 25, 100 Gb/s).

- ( Efficiency ) : facteur d'efficience réseau (par défaut **0,8** pour
  overhead TCP/IP, protocoles, etc.).

Le calculateur doit convertir ce throughput en **IOPS max** pour un
**block size** donné (ex. 8K) et prendre en compte ce plafond comme
limite supplémentaire.

------------------------------------------------------------------------

### 5. Matrice de Compatibilité (Règles Métier)

Avant de lancer les calculs, le logiciel doit exécuter un **validateur
automatique** (checklist) qui vérifie la cohérence de la configuration.\
En cas de violation d'une règle, l'UI doit :

- Afficher un **message d'erreur ou d'avertissement** explicite.

- Proposer, si possible, une **correction automatique** (ex. ajuster la
  taille de NIC, refuser un mix HDD/SSD, etc.).

#### 5.1 Matrice (vue logique)

*(À représenter en tableau dans l'UI -- version textuelle ci-dessous.)*

- **Composant : Disques**

  - **Mode MG (4.x)**
    - Autorisé dans le modèle : HDD, SSD SAS/SATA, NVMe.
    - **Règle : un seul type de média par Storage Pool**.
  - **Mode FG + Compression (4.x)**
    - Autorisé : **SSD ou NVMe uniquement** (full flash).
    - HDD interdits dans l'outil pour ce mode.
  - **Mode EC / Ultra (5.0 / compétiteur)**
    - Autorisé : SSD/NVMe homogènes.

- **Composant : Réseau**

  - **MG (4.x)** : 10 GbE min, 25/100 GbE recommandés.

  - **FG + Compression** : 25 GbE min recommandé.

  - **EC / Ultra / NVMe/TCP** : 25 ou 100 GbE fortement recommandés.

- **Composant : NTP**

  - Tous les modes : **NTP obligatoire** (l'outil doit considérer "NTP
    absent" comme configuration invalide).

- **Composant : RAID contrôleur**

  - Tous les modes : **HBA / passthrough requis**.
  - Les contrôleurs RAID matériels (PERC, SmartArray, etc.) sont
    **interdits** dans le modèle (les disques doivent être visibles en
    mode "raw").

- **Composant : Mélange de disques dans un même pool**

  - MG : mélange de types de disques **marqué comme "non recommandé"**
    dans le calculateur.

  - FG + Compression : **non autorisé**.

  - EC / Ultra : **non recommandé** ; l'outil peut bloquer ou au minimum
    générer un avertissement fort.

#### 5.2 Technologies "Non Supportées" (Blacklist -- au niveau du calculateur)

Le logiciel doit considérer comme **non supportés** (et bloquer) les
choix suivants :

- **HDD rotatifs** dans les scénarios **"performance" ou "Ultra"** (dans
  l'outil).
  - L'utilisateur pourra les utiliser en MG si l'option est
    explicitement activée, mais ils sont exclus par défaut.
- **RAID matériel (PERC, SmartArray, etc.)**
  - Toujours interdits : les disques doivent être présentés en mode HBA
    / JBOD.
- **Réseau 1 GbE**
  - Toujours interdit (bottleneck trop sévère / hors scope de l'outil).
- **SATA SSD pour FG / Ultra dans le calculateur**
  - Supportés en théorie, mais **considérés comme "non recommandés"** :
    - L'outil ne proposera pas SATA pour les scénarios FG/Ultra, à cause
      de la **latence et de l'endurance**.
    - Si l'utilisateur force ce choix, l'outil doit afficher un
      avertissement clair.

------------------------------------------------------------------------

### 6. Interface Utilisateur & Scénarios

L'UI doit être structurée en **trois onglets principaux** :

#### 6.1 Onglet 1 : "Sizer" (Dimensionnement)

Objectif : partir d'un **besoin métier** et proposer une configuration
minimale de cluster.

- **Entrées principales :**

  - Capacité utile requise (ex. 500 TB utiles).

  - IOPS cible (ex. 1M IOPS).

  - R/W ratio moyen (ex. 70/30).

  - Taux de compression attendu pour les données (si mode FG/EC
    compressé).

  - Contraintes éventuelles :

    - Nombre de nœuds max,
    - Type de nœud,
    - Type de média (SSD vs NVMe).

- **Sorties attendues :**

  - **Nombre de nœuds** minimal par mode (MG, FG+Comp, EC).

  - **Capacité brute vs utile vs effective** pour chaque mode.

  - **IOPS/max** calculés et comparaison avec la demande.

  - **Alerte** si la demande IOPS/latence dépasse ce que le cluster peut
    offrir (goulot d'étranglement CPU, backend ou réseau).

#### 6.2 Onglet 2 : "Simulator" (Comparatif)

Objectif : offrir une **vue graphique comparée** des différents modes de
protection.

- **Représentation graphique recommandée :**

  - Un graphique à barres (bar chart) côte-à-côte, par mode :

    - Barre bleue : **PowerFlex 4.x -- MG** (plus de disques, latence la
      plus basse).

    - Barre verte : **PowerFlex 4.x -- FG + Compression** (moins de
      disques, meilleure efficacité de capacité).

    - Barre orange : **Erasure Coding (Ultra / SAE / Compétiteur)**
      (capacité maximale, profil d'écriture plus sensible, mais point
      d'efficacité maximal).

- **Pour chaque barre, afficher :**

  - **Nombre de nœuds** nécessaires.

  - **Capacité brute / utile / effective**.

  - **IOPS max** estimés.

  - Profil de **latence relative** (ex. icône ou indice : 1 = très
    basse, 3 = plus élevée).

- **Scénarios d'usage typiques :**

  - Comparer **PowerFlex 4.x MG vs FG** sur un même besoin.

  - Comparer **PowerFlex 4.x vs Ultra / EC** pour illustrer les gains en
    efficacité de capacité.

  - Comparer **PowerFlex vs compétiteur EC** (avec un profil de write
    penalty plus agressif pour le compétiteur, si souhaité).

#### 6.3 Onglet 3 : "Stress Test" (Performance)

Objectif : montrer de façon **pédagogique** l'impact de la charge, du
profil R/W et du mode de protection sur les performances.

- **Contrôles utilisateur (sliders / sélecteurs) :**

  - R/W Ratio : presets 70/30, 50/50, 100 % read, 100 % write.

  - Block size : 4K, 8K, 16K, 32K.

  - Mode de protection : MG, FG+Comp, EC.

- **Visualisation :**

  - Graphiques IOPS / throughput en fonction des paramètres.

  - Visualisation de la **chute d'IOPS** lorsque :

    - On augmente la proportion d'écritures **random** en mode EC.

    - On active la **compression** sur un workload CPU-limited.

- **Cas pédagogique clé :**

  - Scénario "100 % Random Write en EC (4+2 ou 8+2)" :

    - Montrer la diminution de performance vs MG/FG.

    - Permettre de comparer un **EC "théorique" (compétiteur)** vs un
      **EC optimisé type SAE** (avec un write penalty moins sévère, pour
      illustrer l'architecture Ultra).

------------------------------------------------------------------------

### Annexe A -- Paramètres par défaut et hypothèses de calcul

Cette annexe définit les **valeurs par défaut** et **hypothèses
simplifiées** utilisées par le PowerFlex Calculator.\
Toutes ces valeurs doivent être modifiables dans l'UI, mais les défauts
servent de base "opinionée" alignée sur les bonnes pratiques Dell et sur
le comportement du PowerFlex Sizer.

#### A.1 Profils disques et IOPS par défaut

**A.1.1 Types de médias modélisés**

- **HDD 10K / 7,2K (mode MG uniquement)**

  - Utilisés uniquement si l'option "autoriser HDD" est activée.
  - Non proposés par défaut dans les scénarios orientés performance.

- **SSD SAS/SATA**

- **NVMe SSD**

**A.1.2 IOPS de base par disque (valeurs par défaut)**

Ces valeurs sont indicatives et servent de base au calcul
`IOPS_total_backend = N_disks × IOPS_per_disk`.

  --------------------------------------------------------------
  Type de média        Profil d'I/O (4K     IOPS/disk (défaut)
                       random)              
  -------------------- -------------------- --------------------
  HDD 10K              100 % Read           150

  HDD 10K              70/30 R/W            120

  SSD SAS              100 % Read           8 000

  SSD SAS              70/30 R/W            6 000

  SSD SATA             70/30 R/W            5 000

  NVMe (U.2/U.3)       100 % Read           120 000

  NVMe (U.2/U.3)       70/30 R/W            80 000
  --------------------------------------------------------------

#### A.2 Taux de compression par type de workload

Les taux ci-dessous correspondent à des **"DRR cibles"** plausibles en
FG (4.x) ou en EC + compression (5.0).

  ------------------------------------------------------------
  Type de workload           Symbole UI    Taux par défaut
                                           `R_comp`
  -------------------------- ------------- -------------------
  Base de données OLTP / ERP DB            2:1

  Bases de données           Analytics     1,5:1
  analytiques                              

  VDI / postes virtuels      VDI           3:1

  Virtualisation généraliste General       2:1
  (VM mix)                   Purpose       

  Fichiers non structurés    File          1,5:1
  (file share)                             

  Workloads non              NoComp        1,0:1
  compressibles                            
  ------------------------------------------------------------

Le calculateur doit :

- Proposer ces **profils de compression** dans un menu déroulant.
- Permettre un **taux personnalisé** (ex. 2,3:1) pour affiner.

#### A.3 Overhead FG / EC / Spare -- valeurs par défaut

**A.3.1 Overhead FG (Mode B -- FG + Compression)**

Dans le calculateur, utiliser un paramètre agrégé :

- `overhead_FG` **par défaut : 15 %**
- Plage modifiable : 10--25 %.

La formule de l'annexe principale devient :

\[ C\_{effective} = ( ) R\_{comp} \]

**A.3.2 Spare distribué (MG & FG)**

Pour simplifier :

- **Spare MG (Mode A)** :
  - Valeur par défaut : **20 %**.
  - Plage configurable : 10--30 %.
- **Spare FG (Mode B)** :
  - Spare système (comme MG) + overhead FG.
  - Dans l'UI, il peut être présenté séparément, mais pour la formule on
    agrège l'overhead FG comme vu plus haut.

**A.3.3 Overhead EC (Mode C -- Erasure Coding)**

Outre l'efficacité brute ( N\_{data} / (N\_{data} + M\_{parity}) ), on
ajoute un **overhead global** (métadonnées, spare, write cache, etc.) :

  -------------------------------------------------------------
  Schéma EC Efficacité      Overhead global `overhead_EC`
            brute           (défaut)
  --------- --------------- -----------------------------------
  4+1       80 %            15 %

  4+2       66 %            15 %

  8+2       80 %            10 %

  12+4      75 %            10 %
  -------------------------------------------------------------

\[ C\_{utile_EC} = C\_{raw} (1 - %\_{overhead_EC}) \]

#### A.4 Hypothèses CPU (malus par mode)

Pour rendre le modèle pédagogique, le calculateur applique un
**coefficient "CPU_efficiency"** par mode.

  -------------------------------------------------------------
  Mode                           CPU_efficiency sur IOPS max
  ------------------------------ ------------------------------
  MG (4.x -- mirroring)          100 %

  FG + compression (4.x)         85 %

  EC -- compétiteur RAID 5/6     70 %

  EC -- PowerFlex Ultra / SAE    85 %
  (5.0)                          
  -------------------------------------------------------------

#### A.5 Hypothèses réseau

**A.5.1 Efficience réseau**

Le modèle utilise un facteur global `Efficiency` pour les liens Ethernet
:

- Valeur par défaut : **0,8** (80 % d'efficacité).
- Plage configurable : 0,7--0,9.

\[ Throughput\_{max} = N\_{nodes} Speed\_{NIC} Efficiency \]

**A.5.2 Conversions débit ↔ IOPS**

Pour un block size donné `BS` :

\[ IOPS\_{max_net} = \]

- Block sizes proposés : 4K, 8K, 16K, 32K (défaut : 8K).

#### A.6 Profils de workloads par défaut

  ---------------------------------------------------------------
  Profil          R/W ratio            Block size     Compression
  --------------- --------------- --------------- ---------------
  OLTP (DB)       70/30                        8K             2:1

  OLAP / DW       80/20                       32K           1,5:1

  VDI             80/20                        4K             3:1

  VM mix          70/30                        8K             2:1
  (vSphere)                                       

  Backup /        50/50                       64K           1,5:1
  Archive                                         

  Non             50/50                        8K             1:1
  compressible                                    
  ---------------------------------------------------------------

#### A.7 Récapitulatif des principaux paramètres par défaut

  -------------------------------------------------------------
  Paramètre                      Valeur par défaut
  ------------------------------ ------------------------------
  Spare MG                       20 %

  Overhead FG agrégé             15 %

  Overhead EC 4+2                15 %

  Overhead EC 8+2                10 %

  CPU_efficiency MG              100 %

  CPU_efficiency FG+Comp         85 %

  CPU_efficiency EC compétiteur  70 %

  CPU_efficiency EC PowerFlex    85 %
  Ultra                          

  Efficience réseau              0,8

  Block size par défaut          8K

  Taux de compression DB         2:1

  Taux de compression VDI        3:1

  Taux de compression général    2:1
  -------------------------------------------------------------
