import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'

import { preferredAliceName } from '../../lib/aliceEntry'
import { useT } from '../../lib/i18n'
import { getProfileImageUrl, getProfileInitial } from '../../lib/profile'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import styles from './WelcomeModal.module.css'

const PRODUCT_NAME = 'Alice'

function daysSince(ts: number | null): number {
  if (!ts) return 1
  const diff = Date.now() - ts
  const days = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1
  return Math.max(1, days)
}

export function WelcomeModal() {
  const t = useT()
  const open = useUiStore((s) => s.openModal === 'welcome')
  const closeModal = useUiStore((s) => s.closeModal)
  const preferences = useProjectsStore((s) => s.preferences)
  const displayName = preferredAliceName(preferences.displayName)
  const setPreferences = useProjectsStore((s) => s.setPreferences)
  const firstLaunchAt = useProjectsStore((s) => s.preferences.firstLaunchAt)

  const days = useMemo(() => daysSince(firstLaunchAt), [firstLaunchAt])
  const initial = getProfileInitial(displayName)
  const avatarUrl = getProfileImageUrl(preferences)
  const [imgFailed, setImgFailed] = useState(false)
  const [name, setName] = useState(displayName)
  const trimmedName = preferredAliceName(name)

  useEffect(() => {
    if (!open) return
    setName(displayName)
    setImgFailed(false)
  }, [open, displayName, avatarUrl])

  const start = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trimmedName) return
    setPreferences({
      displayName: trimmedName,
      accountCreated: true,
      onboardingDone: true,
      alwaysStartOnHome: true,
    })
    useUiStore.getState().setActiveView('home')
    closeModal()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && open && closeModal()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby={undefined}>
          <Dialog.Close asChild>
            <button type="button" aria-label={t('common.close')} className={styles.close}>
              <X size={16} />
            </button>
          </Dialog.Close>

          <div className={styles.body}>
            <div className={styles.avatarWrap}>
              {!avatarUrl || imgFailed ? (
                <div className={styles.avatarFallback}>{initial}</div>
              ) : (
                <img
                  className={styles.avatar}
                  src={avatarUrl}
                  alt={t('welcome.photoAlt', { name: displayName })}
                  onError={() => setImgFailed(true)}
                />
              )}
            </div>

            <div className={styles.eyebrow}>
              {t('welcome.dayCount', { days, product: PRODUCT_NAME })}
            </div>

            <Dialog.Title className={styles.title}>
              {trimmedName
                ? t('welcome.greeting', { name: trimmedName })
                : t('welcome.greetingNew')}
            </Dialog.Title>

            <p className={styles.subtitle}>{t('welcome.subtitle')}</p>

            <form onSubmit={start}>
              <div className={styles.nameField}>
                <label htmlFor="welcome-display-name">{t('welcome.nameLabel')}</label>
                <input
                  id="welcome-display-name"
                  className={styles.nameInput}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('onboarding.namePlaceholder')}
                  autoComplete="nickname"
                  maxLength={60}
                  aria-describedby="welcome-name-hint"
                />
                <p id="welcome-name-hint" className={styles.nameHint}>
                  {t('welcome.nameHint')}
                </p>
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={closeModal}>
                  {t('common.skip')}
                </button>
                <button type="submit" className={styles.primary} disabled={!trimmedName}>
                  {t('common.start')}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
