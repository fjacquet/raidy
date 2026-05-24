/**
 * Sizing guide section: Platform-Specific Notes.
 * Covers ZFS, vSAN ESA, Ceph, S2D, and Nutanix specifics.
 */

import { useTranslation } from 'react-i18next'

function PlatformBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h5>
      {children}
    </div>
  )
}

export function PlatformGuide() {
  const { t } = useTranslation('guide')

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('platforms.intro')}</p>

      <div className="space-y-5">
        <PlatformBlock title={t('platforms.zfs.title')}>
          <div className="space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
            <p>{t('platforms.zfs.slop')}</p>
            <p>{t('platforms.zfs.ashift')}</p>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-600 italic">
            {t('platforms.zfs.source')}
          </p>
        </PlatformBlock>

        <PlatformBlock title={t('platforms.vsanEsa.title')}>
          <div className="space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
            <p>{t('platforms.vsanEsa.adaptive')}</p>
            <p>{t('platforms.vsanEsa.nvme')}</p>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-600 italic">
            {t('platforms.vsanEsa.source')}
          </p>
        </PlatformBlock>

        <PlatformBlock title={t('platforms.ceph.title')}>
          <div className="space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
            <p>{t('platforms.ceph.nearfull')}</p>
            <p>{t('platforms.ceph.ec')}</p>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-600 italic">
            {t('platforms.ceph.source')}
          </p>
        </PlatformBlock>

        <PlatformBlock title={t('platforms.s2d.title')}>
          <div className="space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
            <p>{t('platforms.s2d.reserve')}</p>
            <p>{t('platforms.s2d.map')}</p>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-600 italic">
            {t('platforms.s2d.source')}
          </p>
        </PlatformBlock>

        <PlatformBlock title={t('platforms.nutanix.title')}>
          <div className="space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
            <p>{t('platforms.nutanix.ec')}</p>
            <p>{t('platforms.nutanix.overhead')}</p>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-600 italic">
            {t('platforms.nutanix.source')}
          </p>
        </PlatformBlock>
      </div>
    </div>
  )
}
