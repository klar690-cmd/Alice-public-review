import type { ReactNode } from 'react'

export type SidebarNavigationEntry = {
  label: string
  icon: ReactNode
  selected: boolean
  onSelect: () => void
  replaceViewId?: string
}
