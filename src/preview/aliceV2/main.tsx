import '../../bootstrap'
import '../../styles/reset.css'
import '../../styles/theme.css'
import '../../plugins/theme-pack/cream-rose.css'

import { Plug } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useStore } from 'zustand'

import App from '../../App'
import { LocaleContext, m2Translate } from '../../components/AliceV2/messages'
import { AliceV2Workspace } from '../../components/AliceV2/Workspace'
import { initPluginHost } from '../../lib/plugins'
import { themeContributionToCss } from '../../lib/themeTokens'
import { watchPluginThemeStyles } from '../../lib/themeTokens'
import { CREAM_ROSE_THEME } from '../../plugins/theme-pack/creamRose'
import { createAliceV2UiStore } from '../../stores/aliceV2UiStore'
import { useUiStore } from '../../stores/uiStore'
import { PreviewNotice } from '../PreviewNotice'

const style = document.createElement('style')
style.textContent = themeContributionToCss(CREAM_ROSE_THEME)
document.head.appendChild(style)
watchPluginThemeStyles()
void initPluginHost()
const t = (key: Parameters<typeof m2Translate>[1]) => m2Translate('pt-BR', key)
const store = createAliceV2UiStore('m2_session', {
  names: [t('teamBuild'), t('teamPlan')],
  roles: [t('managerRole'), t('workerRole'), t('auditRole')],
  prompts: [t('rootPrompt'), t('workerPrompt'), t('auditPrompt')],
  copy: t('copy'),
  newAgent: t('newAgent'),
  newPrompt: t('newPrompt'),
})
export function Preview() {
  const enabled = useStore(store, (s) => s.enabled),
    classicView = useUiStore((s) => s.activeView),
    [theme, setTheme] = useState<'elite-indigo' | 'cream-rose'>('elite-indigo')
  const navigate = (show: boolean) => {
    const hash = show ? '#alice-v2' : '#home'
    if (window.location.hash !== hash) window.history.pushState(null, '', hash)
    useUiStore.getState().setActiveView('home')
    if (show) {
      store.getState().setView('editor')
      store.getState().enter()
    } else store.getState().leave()
  }
  useEffect(() => {
    window.history.replaceState(null, '', '#home')
    const pop = () => {
      useUiStore.getState().setActiveView('home')
      if (window.location.hash === '#alice-v2') store.getState().enter()
      else store.getState().leave()
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])
  useEffect(() => {
    if (enabled && classicView !== 'home') {
      store.getState().leave()
      window.history.replaceState(null, '', '#workspace')
    }
  }, [classicView, enabled])
  const change = (next: 'elite-indigo' | 'cream-rose') => {
    document.documentElement.dataset.theme = next
    setTheme(next)
  }
  return (
    <LocaleContext.Provider value="pt-BR">
      <App
        onClassicNavigation={() => navigate(false)}
        sidebarNavigation={{
          label: t('plug'),
          icon: <Plug size={14} />,
          replaceViewId: 'alice-accounts',
          selected: enabled,
          onSelect: () => navigate(true),
        }}
        mainOverride={
          enabled ? (
            <AliceV2Workspace
              embedded
              store={store}
              onTheme={change}
              theme={theme}
              onLeave={() => navigate(false)}
            />
          ) : undefined
        }
      />
      <PreviewNotice />
    </LocaleContext.Provider>
  )
}
createRoot(document.getElementById('root')!).render(<Preview />)
