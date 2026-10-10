import { useT } from '../lib/i18n'
import { restoreAlicePreview } from './bridge'
import styles from './PreviewNotice.module.css'
export function PreviewNotice() {
  const t = useT()
  return (
    <aside className={styles.notice} aria-label={t('alice.preview')}>
      <span>
        <strong>{t('alice.preview')}</strong>
        <small>{t('alice.previewDescription')}</small>
      </span>
      <button onClick={restoreAlicePreview}>{t('alice.restoreDemo')}</button>
      <a href="https://github.com/klar690-cmd/Alice" target="_blank" rel="noreferrer">
        {t('alice.source')}
      </a>
    </aside>
  )
}
