import { AliceConnectionsView } from '../../plugins/alice-connections/view'
import { useM2T } from './messages'
import styles from './Workspace.module.css'

/** Reuses the original profile-scoped accounts surface and its existing action handlers. */
export function AccountsPanel() {
  const t = useM2T()
  return (
    <section className={styles.accountsPanel} aria-label={t('accounts')}>
      <h2>{t('accounts')}</h2>
      <p className={styles.muted}>{t('accountsHint')}</p>
      <AliceConnectionsView />
    </section>
  )
}
