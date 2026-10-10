import { useProjectsStore } from '../stores/projectsStore'
import { useUiStore } from '../stores/uiStore'
/** Hide only the visible pane. Native handles and logical-agent metadata remain available. */
export function closeAlicePane(projectId: string, paneId: string): void {
  const projects = useProjectsStore.getState()
  if (
    !projects.projects.some((p) => p.id === projectId && p.terminals.some((t) => t.id === paneId))
  )
    return
  projects.closePane(projectId, paneId, { preserveSession: true })
  const ui = useUiStore.getState()
  if (ui.focusedTerminalId === paneId) ui.setFocusedTerminal(null)
  if (!useProjectsStore.getState().workspace.containers.some((c) => c.paneIds.length))
    ui.setActiveView('home')
}
