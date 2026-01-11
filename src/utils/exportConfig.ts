/**
 * Configuration export utilities for Ansible and Terraform.
 * Generates infrastructure-as-code templates.
 */

import type { Drive } from '@/types/drive'
import type { CalculationResults } from '@/types/results'
import type { RaidControllerOptions, Topology, ZfsOptions } from '@/types/topology'
import { formatBytes as formatBytesUtil, type UnitSystem } from './units'

interface ExportConfig {
  drive: Drive
  driveCount: number
  hotSpares: number
  topology: Topology
  zfsOptions?: ZfsOptions
  controllerOptions: RaidControllerOptions
  results: CalculationResults
  unitSystem?: UnitSystem
}

/**
 * Generate Ansible playbook for storage configuration.
 */
export function exportToAnsible(config: ExportConfig): string {
  const {
    drive,
    driveCount,
    hotSpares,
    topology,
    zfsOptions,
    results,
    unitSystem = 'binary',
  } = config
  const { volumetry } = results
  const formatBytes = (bytes: number) => formatBytesUtil(bytes, unitSystem)

  const usableDrives = driveCount - hotSpares

  let playbook = `---
# Raidy Storage Configuration Playbook
# Generated: ${new Date().toISOString()}
#
# Topology: ${topology.type.toUpperCase()} ${topology.level}
# Drives: ${driveCount}x ${drive.model}
# Usable Capacity: ${formatBytes(volumetry.usableCapacity)}

- name: Configure Storage Array
  hosts: storage_servers
  become: yes
  vars:
    drive_count: ${usableDrives}
    hot_spares: ${hotSpares}
    drive_model: "${drive.model}"
    raid_level: "${topology.level}"
`

  if (topology.type === 'zfs' && zfsOptions) {
    playbook += `
    # ZFS Options
    zfs_pool_name: "tank"
    zfs_ashift: ${zfsOptions.ashift}
    zfs_recordsize: "${zfsOptions.recordsize / 1024}K"
    zfs_compression: ${zfsOptions.compression ? `"${zfsOptions.compressionType}"` : 'off'}
    zfs_dedup: ${zfsOptions.dedup ? 'on' : 'off'}

  tasks:
    - name: Install ZFS packages
      package:
        name:
          - zfsutils-linux
        state: present

    - name: Gather disk facts
      setup:
        gather_subset:
          - hardware
      register: disk_facts

    - name: Create ZFS pool
      command: >
        zpool create
        -o ashift={{ zfs_ashift }}
        {{ zfs_pool_name }} {{ raid_level }}
        {{ ansible_devices | select('match', '^sd[a-z]$') | list | join(' ') }}
      args:
        creates: /{{ zfs_pool_name }}

    - name: Configure ZFS dataset properties
      zfs:
        name: "{{ zfs_pool_name }}"
        state: present
        extra_zfs_properties:
          recordsize: "{{ zfs_recordsize }}"
          compression: "{{ zfs_compression }}"
          atime: "off"
          xattr: "sa"

    - name: Enable deduplication (if configured)
      zfs:
        name: "{{ zfs_pool_name }}"
        state: present
        extra_zfs_properties:
          dedup: "{{ zfs_dedup }}"
      when: zfs_dedup == "on"
`
  } else if (topology.type === 'standard') {
    const raidLevel = topology.level.toLowerCase().replace('raid', '')

    playbook += `
    # mdadm RAID Options
    raid_device: "/dev/md0"
    filesystem: "xfs"

  tasks:
    - name: Install mdadm
      package:
        name:
          - mdadm
          - xfsprogs
        state: present

    - name: Create RAID array
      command: >
        mdadm --create {{ raid_device }}
        --level=${raidLevel}
        --raid-devices={{ drive_count }}
        --spare-devices={{ hot_spares }}
        {{ ansible_devices | select('match', '^sd[a-z]$') | list | map('regex_replace', '^', '/dev/') | join(' ') }}
      args:
        creates: "{{ raid_device }}"

    - name: Wait for array to sync
      command: cat /proc/mdstat
      register: mdstat
      until: "'resync' not in mdstat.stdout"
      retries: 100
      delay: 60

    - name: Create filesystem
      filesystem:
        fstype: "{{ filesystem }}"
        dev: "{{ raid_device }}"

    - name: Mount array
      mount:
        path: /data
        src: "{{ raid_device }}"
        fstype: "{{ filesystem }}"
        opts: defaults,noatime
        state: mounted

    - name: Save mdadm configuration
      shell: mdadm --detail --scan >> /etc/mdadm/mdadm.conf
      args:
        creates: /etc/mdadm/mdadm.conf
`
  }

  return playbook
}

/**
 * Generate Terraform configuration for cloud storage.
 */
export function exportToTerraform(config: ExportConfig): string {
  const { drive, driveCount, topology, results, unitSystem = 'binary' } = config
  const { volumetry } = results
  const formatBytes = (bytes: number) => formatBytesUtil(bytes, unitSystem)

  // Calculate disk size in GB
  const diskSizeGb = Math.ceil(drive.capacity_raw / 1024 ** 3)

  const terraform = `# Raidy Storage Configuration - Terraform
# Generated: ${new Date().toISOString()}
#
# Topology: ${topology.type.toUpperCase()} ${topology.level}
# Drives: ${driveCount}x ${drive.model} (${diskSizeGb} GB each)
# Usable Capacity: ${formatBytes(volumetry.usableCapacity)}

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP Zone"
  type        = string
  default     = "us-central1-a"
}

# Storage Disks
resource "google_compute_disk" "storage_disk" {
  count = ${driveCount}

  name = "storage-disk-\${count.index}"
  type = "${drive.type.includes('SSD') ? 'pd-ssd' : 'pd-standard'}"
  zone = var.zone
  size = ${diskSizeGb}

  labels = {
    purpose     = "storage-array"
    raid_level  = "${topology.level.toLowerCase()}"
    managed_by  = "terraform"
    generated   = "raidy"
  }
}

# Storage Instance
resource "google_compute_instance" "storage_server" {
  name         = "storage-server"
  machine_type = "n2-standard-8"
  zone         = var.zone

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 50
    }
  }

  # Attach all storage disks
  dynamic "attached_disk" {
    for_each = google_compute_disk.storage_disk
    content {
      source      = attached_disk.value.self_link
      device_name = "storage-\${attached_disk.key}"
    }
  }

  network_interface {
    network = "default"
    access_config {}
  }

  metadata_startup_script = <<-EOF
    #!/bin/bash
    apt-get update
    ${
      topology.type === 'zfs'
        ? `
    apt-get install -y zfsutils-linux
    # ZFS pool will be created manually or via Ansible
    `
        : `
    apt-get install -y mdadm xfsprogs
    # RAID array will be created manually or via Ansible
    `
    }
  EOF

  tags = ["storage-server"]

  labels = {
    purpose    = "storage-array"
    managed_by = "terraform"
    generated  = "raidy"
  }
}

# Firewall for NFS/iSCSI (if needed)
resource "google_compute_firewall" "storage_access" {
  name    = "storage-access"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["2049", "3260"]  # NFS, iSCSI
  }

  source_ranges = ["10.0.0.0/8"]
  target_tags   = ["storage-server"]
}

output "storage_server_ip" {
  description = "Internal IP of storage server"
  value       = google_compute_instance.storage_server.network_interface[0].network_ip
}

output "disk_ids" {
  description = "IDs of attached storage disks"
  value       = google_compute_disk.storage_disk[*].id
}

output "total_raw_capacity_gb" {
  description = "Total raw capacity in GB"
  value       = ${diskSizeGb * driveCount}
}

output "estimated_usable_capacity_gb" {
  description = "Estimated usable capacity in GB"
  value       = ${Math.ceil(volumetry.usableCapacity / 1024 ** 3)}
}
`

  return terraform
}

/**
 * Generate YAML configuration summary.
 */
export function exportToYaml(config: ExportConfig): string {
  const {
    drive,
    driveCount,
    hotSpares,
    topology,
    zfsOptions,
    controllerOptions,
    results,
    unitSystem = 'binary',
  } = config
  const { volumetry, performance, sustainability, tco } = results
  const formatBytes = (bytes: number) => formatBytesUtil(bytes, unitSystem)

  let yaml = `# Raidy Storage Configuration
# Generated: ${new Date().toISOString()}

hardware:
  drive:
    model: "${drive.model}"
    type: ${drive.type}
    capacity_bytes: ${drive.capacity_raw}
    capacity_formatted: "${formatBytes(drive.capacity_raw)}"
  count: ${driveCount}
  hot_spares: ${hotSpares}

topology:
  type: ${topology.type}
  level: ${topology.level}
`

  if (topology.type === 'zfs' && zfsOptions) {
    yaml += `  zfs:
    ashift: ${zfsOptions.ashift}
    recordsize: ${zfsOptions.recordsize}
    compression: ${zfsOptions.compression}
    compression_type: ${zfsOptions.compressionType}
    dedup: ${zfsOptions.dedup}
`
  }

  yaml += `
controller:
  type: ${controllerOptions.controller}
  stripe_size: ${controllerOptions.stripeSize}
  write_policy: ${controllerOptions.writePolicy}

capacity:
  raw_bytes: ${volumetry.rawCapacity}
  raw_formatted: "${formatBytes(volumetry.rawCapacity)}"
  usable_bytes: ${volumetry.usableCapacity}
  usable_formatted: "${formatBytes(volumetry.usableCapacity)}"
  effective_bytes: ${volumetry.effectiveCapacity}
  effective_formatted: "${formatBytes(volumetry.effectiveCapacity)}"
  efficiency_percent: ${volumetry.efficiency.toFixed(2)}

performance:
  max_read_throughput_mbs: ${Math.round(performance.maxReadThroughputMBs)}
  max_write_throughput_mbs: ${Math.round(performance.maxWriteThroughputMBs)}
  max_read_iops: ${Math.round(performance.maxReadIOPS)}
  max_write_iops: ${Math.round(performance.maxWriteIOPS)}
  bottleneck: "${performance.bottleneckDescription}"

power:
  total_watts: ${Math.round(sustainability.powerBreakdown.total)}
  drives_watts: ${Math.round(sustainability.powerBreakdown.drives)}
  servers_watts: ${Math.round(sustainability.powerBreakdown.servers)}
  cooling_watts: ${Math.round(sustainability.powerBreakdown.cooling)}
  annual_kwh: ${Math.round(sustainability.annualEnergyKwh)}
  annual_co2_kg: ${Math.round(sustainability.annualCO2Kg)}

cost:
  hardware_usd: ${Math.round(tco.hardwareCost)}
  energy_5yr_usd: ${Math.round(tco.totalEnergyCost)}
  maintenance_usd: ${Math.round(tco.maintenanceCost)}
  replacement_usd: ${Math.round(tco.replacementCost)}
  total_tco_usd: ${Math.round(tco.totalCost)}
  cost_per_usable_tb: ${tco.costPerTB.toFixed(2)}
  cost_per_effective_tb: ${tco.costPerEffectiveTB.toFixed(2)}
`

  return yaml
}

/**
 * Download content as a file.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export to Ansible playbook and download.
 */
export function downloadAnsible(config: ExportConfig): void {
  const content = exportToAnsible(config)
  downloadFile(content, 'storage-playbook.yml', 'application/x-yaml')
}

/**
 * Export to Terraform and download.
 */
export function downloadTerraform(config: ExportConfig): void {
  const content = exportToTerraform(config)
  downloadFile(content, 'storage.tf', 'text/plain')
}

/**
 * Export to YAML and download.
 */
export function downloadYaml(config: ExportConfig): void {
  const content = exportToYaml(config)
  downloadFile(content, 'storage-config.yml', 'application/x-yaml')
}
