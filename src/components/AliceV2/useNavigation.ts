import { Network } from 'lucide-react'
import { createElement, useEffect, useMemo, useRef } from 'react'
import { useStore } from 'zustand'

import { sha256 } from '../../lib/aliceV2/compile'
import { createAliceV2UiStore } from '../../stores/aliceV2UiStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import { type M2Locale, m2Translate } from './messages'
import type { SidebarNavigationEntry } from './Navigation'

/** Presentation-only entry. The node store uses M1 fake execution and session memory. */
export function useAliceV2Navigation() {
  const profileId = useProjectsStore((s) => s.activeProfileId),
    projectId = useProjectsStore((s) => s.activeProjectId ?? 'm2_demo'),
    language = useProjectsStore((s) => s.preferences.language),
    activeView = useUiStore((s) => s.activeView)
  const locale: M2Locale = language === 'pt-BR' || language === 'zh-CN' ? language : 'en'
  // Native profile IDs may start with digits or exceed M1's ID length. Keep the real ID untouched.
  const graphProfileId = `profile_${sha256(profileId).slice(0, 48)}`
  const sessions = useRef(new Map<string, ReturnType<typeof createAliceV2UiStore>>())
  const store = useMemo(() => {
    const key = JSON.stringify([graphProfileId, projectId])
    const existing = sessions.current.get(key)
    if (existing) return existing
    const t = (key: Parameters<typeof m2Translate>[1]) => m2Translate(locale, key)
    const next = createAliceV2UiStore(
      graphProfileId,
      {
        names: [t('teamBuild'), t('teamPlan')],
        roles: [t('managerRole'), t('workerRole'), t('auditRole')],
        prompts: [t('rootPrompt'), t('workerPrompt'), t('auditPrompt')],
        copy: t('copy'),
        newAgent: t('newAgent'),
        newPrompt: t('newPrompt'),
      },
      projectId,
    )
    if (sessions.current.size >= 24) sessions.current.delete(sessions.current.keys().next().value!)
    sessions.current.set(key, next)
    return next
    // Language changes do not discard graph edits; a different profile starts its own demo state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphProfileId, projectId])
  const enabled = useStore(store, (s) => s.enabled)
  useEffect(() => {
    if (enabled && activeView !== 'home') store.getState().leave()
  }, [activeView, enabled, store])
  const enter = () => {
    useUiStore.getState().setActiveView('home')
    store.getState().setView('editor')
    store.getState().enter()
  }
  const leave = () => {
    store.getState().leave()
    useUiStore.getState().setActiveView('home')
  }
  const entry: SidebarNavigationEntry = {
    label: m2Translate(locale, 'links'),
    icon: createElement(Network, { size: 14 }),
    selected: enabled,
    onSelect: enter,
  }
  return { store, enabled, locale, entry, enter, leave }
}
