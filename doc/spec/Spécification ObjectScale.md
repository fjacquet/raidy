# Spécification Technique : Calculateur "ObjectSizer" pour Dell ObjectScale

## 1. Vue d'ensemble

L'objectif est de développer une application (Web ou CLI) permettant aux architectes infra de simuler la capacité utile et les performances théoriques d'un cluster Dell ObjectScale. L'outil doit prendre en compte les surcharges (overhead) spécifiques au système de fichiers objet et à la protection des données.

## 2. Technologies de Stockage et Matériel

### 2.1 Technologies Autorisées (Supportées)

Le calculateur doit autoriser la sélection des composants validés par la HCL (Hardware Compatibility List) de Dell ObjectScale :

- **Serveurs (Noeuds):**
  - Dell PowerEdge Série R (ex: R750, R760, R650, R660).
  - Dell PowerEdge Série HS (ex: HS5610, HS5620) - Optimisés pour les fournisseurs de services Cloud.
- **Disques de Données (Media):**
  - **NVMe (Gen4/Gen5):** Pour les tiers "haute performance" et métadonnées.
  - **SSD SAS/SATA:** Pour les tiers "flash standard".
  - **HDD NL-SAS (7.2k RPM):** Pour le stockage capacitif (ObjectScale supporte les disques haute densité 20TB+).
- **Protection des données:**
  - Erasure Coding (EC) flexible (ex: 12+4, 10+2, 4+2).
  - Réplication (x2, x3) pour les petits clusters ou géo-distribution.

### 2.2 Technologies Non Supportées (Hors Scope)

L'outil doit rejeter ou marquer comme "Invalide" les configurations suivantes :

- **Protocoles Block/Fichier natifs:** Fibre Channel (FC), iSCSI, NFS/SMB (ObjectScale est S3 natif).
- **Média:** Bandes LTO (Tape), Disques Consumer (non-enterprise), Clés USB boot.
- **Architectures mixtes:** Mélange de types de disques (ex: HDD et NVMe) au sein du _même_ Object Store (bucket pool) de manière non contrôlée.
- **RAID Matériel:** ObjectScale gère la protection au niveau logiciel. Le RAID matériel (RAID 5/6) sur le contrôleur PERC doit être désactivé ou mis en mode "HBA/Passthrough".

---

## 3. Paramètres d'Entrée (Inputs Utilisateur)

L'interface doit recueillir les données suivantes :

### A. Configuration Physique

1. **Nombre de Nœuds (Nodes):** (Min: 3 ou 4 selon le schéma EC).
2. **Type de Disque:** [NVMe | SSD | HDD].
3. **Capacité par Disque (Raw):** (ex: 3.84 TB, 16 TB, 22 TB).
4. **Nombre de Disques par Nœud:** (ex: 24 pour un R760xd2).
5. **Réseau (Frontend/Backend):** (ex: 25GbE, 100GbE, 200GbE).

### B. Configuration Logique (ObjectScale)

1. **Schéma de Protection (Erasure Coding):**
   - _Sélection:_ 4+2, 8+4, 10+2, 12+4 (Classic Dell EC), ou Réplication x3.
   - _Impact:_ Définit le ratio d'efficacité.
2. **Taille Moyenne des Objets:** (ex: 100 KB, 1 MB, 100 MB). _Crucial pour le calcul de performance._
3. **Ratio Lecture/Écriture:** (ex: 80% Read / 20% Write).

---

## 4. Algorithmes de Calcul (Moteur Logique)

### 4.1 Calcul de Volumétrie (Capacity)

Le logiciel doit appliquer la cascade de calcul suivante :

1. Capacité Brute Totale (Raw Cluster):

$$Raw_{total} = N_{nodes} \times N_{drives} \times Size_{drive}$$

2. Overhead de Formatage & Système:
   Déduire ~10-15% pour le formatage disque, l'OS (Kubernetes/Linux) et la réservation de maintenance.

3. Efficacité de Protection (EC Ratio):
   Si EC est $k+m$ (ex: 12+4), le ratio est :

$$Ratio_{EC} = \frac{k}{k+m}$$

(Exemple 12+4 : 12/16 = 0.75 soit 75% d'efficacité).

4. Capacité Utile (Usable):

$$Usable = (Raw_{total} - SystemOverhead) \times Ratio_{EC}$$

Note: Si Réplication x3, diviser par 3.

### 4.2 Calcul de Performance (Estimation)

C'est la partie critique pour ObjectScale. Les formules doivent être basées sur des abaques :

1. **IOPS Totaux (Petits Objets):**
   - Limité par le média (Disque).
   - $$IOPS_{cluster} = (IOPS_{drive} \times N_{drives} \times N_{nodes}) \times Penalite_{EC}$$
   - _Note:_ L'EC a une pénalité en écriture (Write Penalty) due aux calculs de parité, contrairement à la réplication.

2. **Débit / Throughput (Gros Objets - MB/s):**
   - Le goulot d'étranglement est souvent le Réseau, pas le disque.
   - $$Throughput_{max} = min(Disk_{throughput}, Network_{bandwidth})$$
   - _Formule Network:_ Si 4 nœuds en 100GbE => Théorique 400Gbps, mais ObjectScale utilise une partie pour le trafic Est-Ouest (rebalance/réplication). Appliquer un facteur de sécurité de 0.6.

---

## 5. Sorties Attendues (Outputs)

Le logiciel doit générer un tableau de bord (Dashboard) :

### Section Volumétrie

- **Capacité Brute:** XX PB.
- **Capacité Utile:** XX PB.
- **Perte due à la protection:** XX TB (Indiquer clairement le "coût" de la résilience).

### Section Performance

- **IOPS Estimés:** (Pour la taille d'objet spécifiée).
- **Bande passante (Throughput):** Lecture vs Écriture (GB/s).
- **Latence estimée:** (Basée sur le type de média, ex: NVMe < 1ms, HDD > 10ms).

### Section Alertes (Règles Métier)

- _Alerte:_ "Attention, un schéma EC 12+4 nécessite au minimum 16 'Fault Domains' (disques ou nœuds) pour une sécurité maximale."
- _Alerte:_ "Le réseau 25GbE bridera la performance de vos disques NVMe."

---

## 6. Architecture Logicielle Suggérée

Stack moderne recommandée :

- **Backend:** Python (avec FastAPI) ou Go (Golang). Idéal pour les calculs mathématiques rapides.
- **Frontend:** React.js ou Vue.js (pour des curseurs interactifs "sliders" de capacité).
- **Format de données:** JSON pour stocker les profils matériels (Specs des disques Dell, limites CPU).
- **Déploiement:** Conteneur Docker (pour rester dans la philosophie ObjectScale/K8s).
