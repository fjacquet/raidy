# Spécification technique complète : Calculateur « ObjectSizer » pour Dell ObjectScale

## 1. Vue d'ensemble

L'objectif est de développer une application (Web ou CLI) permettant aux
architectes infrastructure de simuler la **capacité utile** et les
**performances théoriques** d'un cluster **Dell ObjectScale**. L'outil
doit prendre en compte :

- Les surcharges (overheads) liées au système de fichiers objet et à la
  protection des données.

- Les contraintes minimales de plateforme (nombre de nœuds, schéma
  d'erasure coding, réseau, etc.).

- Les bonnes pratiques de taux de remplissage (par exemple, ne pas
  dépasser 80--85 % de capacité utilisée sur un storage pool).

Le calculateur cible en priorité les déploiements ObjectScale appliance
(par ex. XF960) et les déploiements software-defined sur serveurs Dell
PowerEdge qualifiés.

------------------------------------------------------------------------

## 2. Technologies de stockage et matériel

### 2.1 Technologies supportées

Le calculateur doit autoriser la sélection de composants **validés dans
la HCL ObjectScale** (appliances ou infrastructure qualifiée) :

- **Plateformes ObjectScale**

  - Appliances ObjectScale (par ex. XF960, EXF/EX séries) -- profils
    prédéfinis dans l'outil (CPU, RAM, type et nombre de disques,
    réseau).

  - Déploiements software-defined sur serveurs Dell PowerEdge qualifiés.

- **Serveurs (nœuds)**

  - Dell PowerEdge série R (ex. R750, R760, R650, R660).

  - Dell PowerEdge série HS (ex. HS5610, HS5620) pour les environnements
    service provider, lorsque validés pour ObjectScale.

- **Médias de données (disques)**

  - **NVMe (Gen4/Gen5)** : tiers haute performance et, selon le design,
    données et métadonnées.

  - **SSD SAS/SATA Enterprise** : tiers flash « standard ».

  - **HDD NL-SAS Enterprise** : uniquement si explicitement supportés
    par le design ObjectScale ciblé (principalement pour certains
    déploiements SDS). Sur appliances XF, l'outil doit restreindre aux
    profils disques réellement disponibles (SSD TLC/QLC, capacités
    prédéfinies).

- **Protection des données locale (intra-site)**

  - **Triple mirroring** : protection par triple copie pour les
    métadonnées système et pour les données tant que le minimum de nœuds
    requis pour l'erasure coding n'est pas atteint.

  - **Erasure Coding (EC)** : schémas supportés nativement par
    ObjectScale pour les storage pools :

    - 12+4 (par défaut pour la plupart des workloads).

    - 10+2 (profil « cold/archive » plus efficient en capacité).

    - Optionnel : 24+4 (si version ObjectScale et design le supportent,
      typiquement en mode tech preview) -- à activer seulement si
      l'utilisateur coche explicitement une option « inclure les schémas
      EC en préversion ».

- **Protection des données multi-sites (inter-site)**

  - **Replication Groups globaux** et mécanisme XOR ObjectScale (pas de
    simple « x2/x3 » générique).

  - Chaque site (VDC) protège localement ses données par triple
    mirroring et/ou erasure coding ; la réplication inter-site est gérée
    au niveau des groupes de réplication.

### 2.2 Hors scope / configurations non supportées par le calculateur

L'outil doit rejeter ou marquer comme **« invalide »** les
configurations suivantes :

- **Protocoles bloc** : Fibre Channel (FC), iSCSI.

- **Protocoles fichier non ObjectScale** :

  - SMB / CIFS en natif.

  - Le calculateur est centré sur des workloads S3/ObjectScale. NFSv3
    fourni par ObjectScale peut être utilisé, mais les profils de charge
    restent modélisés comme flux S3 (objets), pas comme I/O fichier
    traditionnels.

- **Médias non enterprise** : bandes LTO, disques « desktop » / non
  enterprise, clés USB, disques non validés par la HCL.

- **Mix de médias non contrôlé dans un même storage pool** :

  - Mélange de nœuds avec des profils disques fondamentalement
    différents (ex. NVMe only et HDD only) dans un même storage pool
    sans profil spécifique.

  - L'outil peut autoriser plusieurs « classes de stockage » mais doit
    garder une homogénéité par storage pool.

- **RAID matériel** avec masquage des disques :

  - ObjectScale gère la protection au niveau logiciel ; sur
    infrastructure PowerEdge, les contrôleurs doivent être en mode HBA /
    passthrough (ou JBOD) et non en RAID 5/6.

------------------------------------------------------------------------

## 3. Paramètres d'entrée (inputs utilisateur)

L'interface doit recueillir au minimum les données suivantes.

### 3.1 Contexte général

- **Version d'ObjectScale** (ex. 4.1, 4.2) -- permet de savoir si
  certaines options (ex. 24+4) sont disponibles.

- **Type de déploiement** : \[Appliance XF / EXF / EX / SDS sur
  PowerEdge\].

- **Nombre de sites (VDC) dans le groupe de réplication** : 1, 2, 3, ...
  -- utilisé pour calculer le surcoût de protection géo-distribuée.

### 3.2 Configuration physique par site

Par site (VDC), l'utilisateur doit saisir :

1.  **Nombre de nœuds de stockage** dans le storage pool principal.

2.  **Profil de nœud** (préconfiguré en fonction de la plateforme) :

    - Nombre de disques de données par nœud.

    - Capacité brute par disque (ex. 3.84 TB, 15.36 TB, 30.72 TB, 61
      TB...).

    - Type de média (NVMe, SSD SAS/SATA, HDD NL-SAS).

3.  **Réseau** :

    - Bande passante front-end (par nœud) : 25 GbE, 100 GbE, 200 GbE,
      etc.

    - Bande passante back-end (si différente).

4.  **Taux de remplissage cible du storage pool** :

    - Pourcentage maximum souhaité (ex. 80 %). L'outil doit empêcher les
      designs qui amènent systématiquement le pool au-delà de \~90 %,
      seuil au-delà duquel ObjectScale peut refuser les écritures.

5.  **Réserve opérationnelle / capacité libre souhaitée** :

    - ex. 10--20 % de marge pour rebalance, erasure coding, pannes et
      croissance.

### 3.3 Configuration logique ObjectScale par site

1.  **Schéma de protection (erasure coding / mirroring)**

    - Options supportées :

      - Triple mirroring.

      - EC 12+4.

      - EC 10+2.

      - Optionnel : EC 24+4 (si autorisé).

    - Pour chaque schéma EC, le calculateur doit imposer les **minimums
      de nœuds** :

      - 12+4 : min. 5 nœuds dans le storage pool.

      - 10+2 : min. 7 nœuds dans le storage pool.

      - 24+4 (le cas échéant) : min. 8 nœuds (à confirmer selon la
        version).

      - En dessous de ces seuils, le système fonctionne en triple
        mirroring pour les données.

2.  **Taille moyenne des objets**

    - Taille d'objet typique (ex. 10 KB, 100 KB, 1 MB, 100 MB, 1 GB).

    - Possibilité de définir plusieurs classes (small / medium / large)
      si nécessaire.

3.  **Ratio lecture / écriture**

    - ex. 80 % lecture / 20 % écriture.

    - Possibilité de déclarer un profil « write-heavy » (par ex.
      ingestion) ou « read-heavy » (analytics / archive).

4.  **Profil de workload**

    - Principalement objets petits (≤ 128 KB).

    - Mix équilibré.

    - Principalement objets volumineux (≥ 1 MB).

Ce profil oriente les abaques IOPS vs débit (MB/s) utilisées par le
moteur de calcul.

------------------------------------------------------------------------

## 4. Moteur logique de calcul

### 4.1 Calcul de capacité

Pour chaque site :

1.  **Capacité brute totale (Raw_cluster)**

- (Raw\_{cluster} = N\_{nodes} N\_{drives_per_node} Size\_{drive})

2.  **Surcharge système / formatage / réserve**

    - L'outil doit appliquer un facteur d'overhead configurable (par
      défaut entre 10 et 20 %) pour refléter :

      - Formatage disque et métadonnées système.

      - Capacité réservée pour les opérations de rebalance, erasure
        coding et rebuild.

      - Marge opérationnelle voulue (capacité libre cible).

- (Raw\_{usable_before_protection} = Raw\_{cluster} (1 -
  Overhead\_{system}))

3.  **Efficacité de protection locale (EC / mirroring)**

    - Pour **triple mirroring** :

    <!-- -->

    - (Ratio\_{prot} = )

    <!-- -->

    - Pour **EC k+m** :

    <!-- -->

    - (Ratio\_{prot} = )

      - 12+4 → efficacité théorique ≈ 75 %.

      - 10+2 → efficacité théorique ≈ 83 %.

      - 24+4 → efficacité théorique ≈ 86 % (si utilisé).

4.  **Capacité utile locale (par site)**

- (Usable\_{local} = Raw\_{usable_before_protection} Ratio\_{prot})

5.  **Overhead de protection géo-distribuée (multi-sites)**

    - Si plusieurs sites sont membres d'un même Replication Group
      global, l'outil doit appliquer un **coefficient d'overhead géo**
      dépendant :

      - Du nombre de sites.

      - Du schéma de protection (12+4 vs 10+2).

    - Ces coefficients doivent être alignés sur les abaques officielles
      ObjectScale (table interne) et documentés dans le code/source du
      calculateur.

6.  **Capacité utile globale (fédération)**

    - En agrégant les capacités utiles par site et en appliquant, si
      nécessaire, un facteur d'efficacité globale lié à la topologie de
      réplication.

### 4.2 Estimation de performances

L'estimation de performance doit rester indicative et basée sur des
abaques / profils validés (par plateforme et type de média). On
distingue :

1.  **IOPS (objets petits)**

    - Les petits objets sont généralement limités par :

      - La capacité CPU / mémoire et la pile S3.

      - Les IOPS par disque (surtout pour HDD / SSD) et, dans certains
        cas, le réseau.

    - Formule générique :

    <!-- -->

    - (IOPS\_{cluster} = IOPS\_{drive} (N\_{drives_per_node} N\_{nodes})
      Penalite\_{EC} Facteur\_{profil_objet})

      - **Penalite_EC** :

        - Écritures EC subissent une pénalité liée au calcul de parité
          (plus forte en 12+4 qu'en 10+2).

        - Les lectures sont généralement proches de la somme des
          capacités des disques, sous réserve de la bande passante
          réseau.

      - **Facteur_profil_objet** : coefficient différent selon taille
        d'objet et mix lecture/écriture.

2.  **Débit séquentiel / throughput (gros objets)**

    - Le débit maximal est le **min** entre :

      - Débit disque agrégé.

      - Bande passante réseau agrégée front-end.

- (Throughput\_{max} = min(Throughput\_{disque}, BW\_{reseau}))

  - Exemple :

    - 4 nœuds à 100 GbE → 400 Gbit/s théoriques.

    - Appliquer un facteur de sécurité (ex. 0,5--0,6) pour tenir compte
      du trafic est/ouest (erasure coding, rebalance, replication
      inter-site, gestion).

3.  **Latence estimée**

    - Basée sur :

      - Type de média (NVMe \<\< SSD SAS \< HDD).

      - Classe d'objet (petit vs gros).

      - Charge (IOPS vs capacité CPU/nœud).

    - La latence sera fournie sous forme de fourchette (ex. « \< 2 ms »,
      « 5--15 ms », etc.) en fonction de profils préconfigurés.

------------------------------------------------------------------------

## 5. Sorties attendues (outputs)

Le calculateur doit présenter un tableau de bord synthétique incluant au
minimum :

### 5.1 Section capacité

- **Capacité brute totale (par site / globale)**.

- **Capacité utile locale par storage pool** (après overhead système et
  schéma de protection).

- **Capacité utile globale (fédération)** en tenant compte de la
  réplication inter-site.

- **Coût de la protection** : différentiel entre capacité brute et
  capacité utile (en TB / PB et en pourcentage).

- **Taux de remplissage projeté** : niveau de remplissage estimé après
  ingestion des données cibles.

### 5.2 Section performance

- **IOPS estimés** pour la taille d'objet spécifiée (lecture / écriture
  séparées si possible).

- **Bande passante estimée** (GB/s) en lecture et en écriture.

- **Latence estimée** (fourchettes par type de média et profil de
  charge).

### 5.3 Section alertes et règles métier

Le calculateur doit générer des alertes lisibles, par exemple :

- **Alertes capacité / protection**

  - « Le storage pool utilise 12+4 EC avec seulement 4 nœuds --
    en-dessous du minimum recommandé, les données resteront en triple
    mirroring. »

  - « Le taux de remplissage projeté dépasse 90 % sur ce storage pool,
    ce qui peut bloquer les écritures. Augmentez la capacité ou réduisez
    la volumétrie. »

- **Alertes résilience**

  - « Avec cette topologie (nombre de nœuds / disques), la perte tolérée
    de nœuds est limitée (ex. 1 nœud). Ajouter des nœuds améliorera la
    tolérance de panne pour 12+4. »

  - « Le groupe de réplication global inclut N sites ; vérifiez que la
    capacité est suffisante pour absorber un scénario de perte
    définitive d'un site (Permanent Site Outage). »

- **Alertes réseau / performance**

  - « Le réseau front-end à 25 GbE risque de limiter les performances de
    vos nœuds NVMe pour ce profil de workload. »

  - « Le débit requis par les clients dépasse la bande passante réseau
    agrégée disponible au niveau du cluster. »

------------------------------------------------------------------------

## 6. Architecture logicielle suggérée

Une stack moderne est recommandée :

- **Backend** :

  - Python (FastAPI) ou Go (Golang) pour les calculs et l'API.

  - Moteur de règles / profils (par ex. fichiers YAML/JSON contenant les
    abaques par plateforme : IOPS/nœud, throughput, coefficients
    d'overhead EC et géo, etc.).

- **Frontend** :

  - Application Web moderne (React.js, Vue.js, Angular) avec sliders et
    sélecteurs pour les paramètres clés (nombre de nœuds, schéma EC,
    taille d'objet, etc.).

  - Affichage graphique des courbes capacité/performance en fonction du
    nombre de nœuds.

- **Format de données** :

  - JSON pour les échanges API et le stockage des profils matériels
    (plateformes ObjectScale, types de disques, limites réseau, abaques
    performance).

- **Déploiement** :

  - Conteneur Docker, exécution sur Kubernetes, en cohérence avec
    l'écosystème ObjectScale.

  - Possibilité d'exposer l'API à d'autres outils d'architecture /
    configurateurs existants.

------------------------------------------------------------------------

## Annexe A -- Abaques de capacité / protection locale

### A.1 -- Schémas de protection locaux ObjectScale (site unique)

  ---------------------------------------------------------------------------------
  Schéma de    Usage principal       Efficacité       Overhead    Remarques clés
  protection                         capacité (usable (raw /      
                                     / raw)           usable)     
  ------------ --------------------- ---------------- ----------- -----------------
  Triple       Données/métadonnées   ≈ 33 % (1/3)     3,0×        Protection locale
  mirroring    avant seuil EC,                                    par 3 copies
               petites configs,                                   complètes, très
               métadonnées                                        robuste mais
                                                                  coûteux en
                                                                  capacité.

  EC 12+4      Schéma par défaut     ≈ 75 % (12/16)   1,33×       Taux de
               (regular archive)                                  protection ≈ 33 %
                                                                  ; protège jusqu'à
                                                                  4 fragments
                                                                  perdus (disques
                                                                  ou combinaisons
                                                                  nœuds/disques),
                                                                  min 5 nœuds
                                                                  recommandés.

  EC 10+2      Cold/archive (données ≈ 83 % (10/12)   1,20×       Taux de
               peu accédées)                                      protection ≈ 20 %
                                                                  ; protège jusqu'à
                                                                  2 fragments
                                                                  perdus, min 7
                                                                  nœuds
                                                                  recommandés.

  EC 24+4      Haute efficacité à    ≈ 85 % (≈ 24/28) ≈ 1,18×     Option 4.2 tech
  (tech        très grande échelle                                preview,
  preview)                                                        nécessite min. 8
                                                                  nœuds et tolère
                                                                  jusqu'à 4 disques
                                                                  en panne ; à
                                                                  réserver aux
                                                                  designs validés.
  ---------------------------------------------------------------------------------

Formule d'utilisation typique dans le moteur :

    Capacité_utile_locale = Capacité_brute_après_overhead_système × Efficacité_capacité

------------------------------------------------------------------------

## Annexe B -- Abaques d'overhead de protection multi-sites (Replication Group)

### B.1 -- Overhead global en fonction du nombre de sites

*Définition* : **Facteur d'overhead** = (capacité brute totale pour
stocker les données + protection locale + protection géo) / capacité
utile.

  -------------------------------------------------------------
         \# sites dans le         EC 12+4 --         EC 10+2 --
        Replication Group    Overhead global    Overhead global
  ----------------------- ------------------ ------------------
                        1              1,33×              1,20×

                        2              2,67×              2,40×

                        3              2,00×              1,80×

                        4              1,77×              1,60×

                        5              1,67×              1,50×

                        6              1,60×              1,44×

                        7              1,55×              1,40×

               8 (max RG)              1,52×              1,37×
  -------------------------------------------------------------

Efficacité globale (ordre de grandeur) :

    Efficacité_globale ≈ 1 / Facteur_overhead

Exemples :

- 12+4, 1 site : 1 / 1,33 ≈ 75 %.

- 12+4, 3 sites : 1 / 2,00 ≈ 50 %.

- 10+2, 3 sites : 1 / 1,80 ≈ 56 %.

Ces valeurs supposent que la **même quantité de données uniques** est
écrite sur chaque site (condition pour que l'optimisation XOR
fonctionne).

------------------------------------------------------------------------

## Annexe C -- Abaques de résilience locale (EC 12+4 et 10+2)

### C.1 -- Résilience locale EC 12+4 en fonction du nombre de nœuds

  -------------------------------------------------------------
    \# nœuds dans le     Fragments par Protection typique
                 VDC              nœud assurée\*
  ------------------ ----------------- ------------------------
                   5                 4 Jusqu'à 4 disques en
                                       panne ou 1 nœud complet.

                6--7                 3 Jusqu'à 4 disques ou 1
                                       nœud + 1 disque sur un
                                       autre nœud.

               8--15                 2 Jusqu'à 4 disques ou 2
                                       nœuds ou 1 nœud + 2
                                       disques répartis.

                ≥ 16                 1 Jusqu'à 4 nœuds ou
                                       combinaisons
                                       équivalentes de nœuds +
                                       disques.
  -------------------------------------------------------------

\* Hypothèses « best case » avec une distribution uniforme des
fragments. Certains scénarios peuvent être moins favorables si plus de
fragments se retrouvent sur un même nœud.

Message type possible dans le calculateur :

> « Avec 8 nœuds en 12+4, l'EC permet de tolérer jusqu'à 2 nœuds
> complets en panne (scénarios favorables), tout en restant protégé
> contre des défaillances disques supplémentaires. »

### C.2 -- Résilience locale EC 10+2 en fonction du nombre de nœuds

  -------------------------------------------------------------
    \# nœuds dans le     Fragments par Protection typique
                 VDC              nœud assurée\*
  ------------------ ----------------- ------------------------
                ≤ 11                 2 Jusqu'à 2 disques ou 1
                                       nœud complet.

                ≥ 12                 1 Perte de 2 nœuds entiers
                                       ou tout nombre de
                                       disques répartis sur 2
                                       nœuds.
  -------------------------------------------------------------

Là aussi, ce sont des scénarios « best case » avec distribution uniforme
des fragments sur les nœuds.

Ces tableaux permettent de :

- Valider si la **tolérance de panne** est cohérente avec le besoin
  client.

- Générer des **alertes** si le nombre de nœuds est trop bas pour le
  niveau de résilience attendu.

------------------------------------------------------------------------

## Annexe D -- Gabarits d'abaques de performance

Les documents publics donnent des tendances (par exemple, amélioration
des IOPS/latences sur petites tailles d'objets et hauts débits par nœud
sur les plateformes all-flash), mais pas de table détaillée IOPS/nœud
utilisable telle quelle pour un sizing conservateur.

L'annexe D définit donc des **gabarits structurés**, à remplir avec les
chiffres de bench internes / officiels.

### D.1 -- Gabarit « profil plate-forme » (par type de nœud)

    Plateforme        : ObjectScale XF960 / EXF900 / R7725xd SDS …
    Type média        : NVMe / SSD SAS / HDD
    Version OS        : ObjectScale 4.x
    Schéma EC         : 12+4 / 10+2 / 24+4 (si applicable)

    Paramètres de référence (à définir par bench interne) :
    - Taille d’objet « small » (KB)      : ex. 10 KB
    - Taille d’objet « medium » (KB)     : ex. 100 KB
    - Taille d’objet « large » (KB)      : ex. 1024 KB (1 MB)

    Pour chaque combinaison {taille d’objet, profil R/W} :

    - IOPS_read_ref        : … (par nœud)
    - IOPS_write_ref       : … (par nœud)
    - BW_read_ref (GB/s)   : … (par nœud)
    - BW_write_ref (GB/s)  : … (par nœud)
    - Latence_cible (ms)   : … (hors saturation)

### D.2 -- Gabarit d'abaque « performance par profil de workload »

  ----------------------------------------------------------------------------------------------------------
  Profil         Taille R/W (%) Plateforme / Schéma   IOPS       IOPS       BW lecture BW         Latence
  workload        objet         média        EC       lecture /  écriture / / nœud     écriture / cible (ms)
                                                      nœud (ref) nœud (ref) (GB/s)     nœud       
                                                                                       (GB/s)     
  ------------ -------- ------- ------------ -------- ---------- ---------- ---------- ---------- ----------
  Small object    10 KB   80/20 XF960 NVMe   12+4     (à         (à         (à         (à         (à
  OLTP                                                définir)   définir)   définir)   définir)   définir)

  Ingestion      100 KB   20/80 XF960 NVMe   12+4     ...        ...        ...        ...        ...
  continue                                                                                        

  Archive /        1 MB    95/5 X560 HDD /   10+2     ...        ...        ...        ...        ...
  cold reads                    SSD QLC                                                           

  Analytics        4 MB   70/30 R7725xd NVMe 12+4     ...        ...        ...        ...        ...
  séquentiel                    (SDS)                                                             
  ----------------------------------------------------------------------------------------------------------

Le moteur peut ensuite :

1.  **Interpoler** entre ces points de référence pour des profils
    intermédiaires.

2.  Appliquer les pénalités EC en écriture (plus fortes pour 12+4 que
    pour 10+2).

3.  Appliquer la contrainte réseau :

<!-- -->

    Throughput_cluster_max ≈ min( N_nœuds × BW_read_ref_par_nœud , BW_reseau_frontend_agrégé × facteur_sécurité )

avec un **facteur_sécurité** typique 0,5--0,6 pour tenir compte du
trafic est/ouest (EC, XOR, rebalance, geo).
