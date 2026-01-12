# Spécification Logicielle : S2D Sizer & PerfCalc

## 1. Vue d'Ensemble

Le logiciel doit permettre à l'architecte système de modéliser un cluster Azure Stack HCI ou Windows Server S2D (2 à 16 nœuds) pour obtenir :

1. **Volumétrie :** Capacité brute, capacité utilisable, empreinte de la réserve.
2. **Performance :** Estimation des IOPS et du débit (Throughput) en fonction du "Working Set".

---

## 2. Module d'Entrée : Configuration Matérielle

L'utilisateur doit pouvoir configurer les éléments suivants.

### A. Configuration du Cluster (Niveau Nœud)

- **Nombre de Nœuds :** 2 à 16.
- **CPU :** Nombre de cœurs (impact sur la décompression/dedup).
- **RAM :** Quantité totale (impact sur le cache en mémoire CSV).
- **Réseau (Interconnect) :**
  - Type : TCP/IP standard ou RDMA (RoCEv2 / iWARP).
  - Vitesse : 10, 25, 40, 100 Gbps.
  - Nombre de cartes : 1 ou 2 (MPIO).

### B. Configuration du Stockage (Niveau Drive)

Le logiciel doit catégoriser les disques selon les rôles S2D (Cache vs Capacité).

Technologies Supportées (Liste Blanche) :
Le logiciel doit accepter les types de bus et médias suivants :

- **Bus :** NVMe (PCIe), SATA, SAS.
- **Média :**
  - **NVMe :** High Perf / Low Latency.
  - **SSD :** Mixed Use (MU) ou Read Intensive (RI).
  - **HDD :** 7.2K, 10K, 15K RPM.
- **Mode de connexion :** "Directly Attached" via HBA (Passthrough) ou JBOD certifié SES.

### C. Technologies Non Supportées (Liste Noire)

Le logiciel **doit rejeter** ou afficher une alerte critique si l'utilisateur tente d'ajouter :

- **Contrôleurs RAID Hardware :** Tout contrôleur présentant un volume RAID (0, 1, 5, etc.) à l'OS. S2D requiert un accès direct au disque (HBA mode "IT").
- **Disques USB / Firewire / SD Cards :** Non supportés pour le pool de stockage.
- **Disques boot (OS) :** Ne peuvent pas faire partie du pool S2D.
- **SAN / iSCSI / FC LUNs :** Un stockage distant ne peut pas être utilisé comme "disque local" pour construire un pool S2D.
- **Disques 512n (Natif) :** Dépréciés (S2D préfère 512e ou 4Kn).

---

## 3. Moteur de Calcul (Logic Core)

### A. Algorithme d'Assignation du Cache

Le logiciel doit appliquer automatiquement la logique S2D :

1. **All-Flash (NVMe + SSD) :** NVMe = Cache, SSD = Capacité.
2. **Hybride (NVMe + HDD) :** NVMe = Cache, HDD = Capacité.
3. **Hybride (SSD + HDD) :** SSD = Cache, HDD = Capacité.
4. **All-NVMe :** Pas de cache automatique (sauf si configuré manuellement), tout est capacité/performance.

_Règle :_ Les disques de cache ne comptent **pas** dans la capacité utilisable.

### B. Calcul de Volumétrie

Le moteur doit calculer selon la formule :

$$CapaciteUtilisable = \frac{(CapaciteBrute - Reserve) \times Efficacite}{OverheadFS}$$

1. **Capacité Brute :** Somme de tous les disques de _Capacité_ (exclure les disques de Cache).
2. **Réserve (Spare) :**
   - L'utilisateur choisit : "Drive Failure" (réserve de X disques) ou "Node Failure" (réserve de 1 nœud complet).
   - _Calcul :_ Soustraire cette quantité de la capacité brute.
3. **Efficacité (Résilience) :**
   - **Mirror 2-Way :** 50% efficacité (Cluster 2 nœuds).
   - **Mirror 3-Way :** 33% efficacité (Cluster 3+ nœuds).
   - **Dual Parity (Erasure Coding) :** 50% à 80% selon le nombre de nœuds (ex: 4 nœuds = 50%, 16 nœuds = ~80%).
   - **Mirror-Accelerated Parity (MAP) :** Mixte (ex: 10% Mirror / 90% Parity).

### C. Calcul de Performance (Estimation)

C'est la partie la plus complexe. Le logiciel doit estimer :

1. **Performance Cache (Write Tier) :**
   - Somme des IOPS max des disques Cache.
   - Limite imposée par le réseau (Si IOPS Disques > Bandwidth Réseau, alors Plafond = Réseau).
2. **Performance Capacité (Cold Tier) :**
   - Important pour les lectures hors-cache.
3. **Impact de la Résilience :**
   - _Mirror :_ Écriture réseau x2 ou x3 (Faible latence, haute charge réseau).
   - _Parity :_ Écriture complexe (Lourde charge CPU + Réseau).
4. **Input Utilisateur "Working Set" :**
   - L'utilisateur définit le % de lecture/écriture (ex: 70/30).
   - Si la taille des données chaudes < Taille du Cache total -> Performance Max.
   - Si taille des données chaudes > Taille du Cache -> Pénalité de performance (Tipping point).

---

## 4. Interface Utilisateur (Dashboard)

L'interface doit présenter deux jauges principales et un tableau détaillé.

### Visualisation

- **Graphique Volumétrie :** Une barre empilée montrant [OS][cache (indisponible)] [Réserve][parité/overhead] [**Espace Utilisable Réel**].
- **Graphique Performance :** Courbe estimée IOPS vs Latence.

### Alertes de configuration (Règles métiers)

- _Alerte :_ "Vous avez moins de 2 disques de cache par nœud (Microsoft recommande min 2)."
- _Alerte :_ "Le ratio Cache/Capacité est inférieur à 10% (Risque de performance)."
- _Erreur :_ "RAID Controller détecté."

---

## 5. Exemple de Structure de Données (JSON)

Pour stocker une configuration, voici le format de données suggéré :

```json
{
  "cluster": {
    "nodes": 4,
    "network_speed_gbps": 25,
    "rdma_enabled": true
  },
  "storage_per_node": {
    "slots_populated": 8,
    "cache_drives": [
      { "type": "NVMe", "size_tb": 1.6, "quantity": 2, "iops_rating": 300000 }
    ],
    "capacity_drives": [
      { "type": "HDD", "size_tb": 8, "quantity": 6, "rpm": 7200 }
    ]
  },
  "settings": {
    "resiliency": "Mirror-Accelerated Parity",
    "map_ratio": 0.2,
    "reserve_strategy": "OneNode"
  }
}
```
