import type { PluginManifest } from '../../lib/tauri'
export const ALICE_CONNECTIONS_MANIFEST: PluginManifest = {
  id: 'alice.connections',
  name: 'Alice Connections',
  version: '0.1.0',
  kind: 'ui',
  apiVersion: 1,
  description:
    'Separate provider-account, logical-agent and session metadata with explicit supported access.',
  capabilities: ['ui.sidebarTab', 'ui.command', 'ui.modal', 'ui.pane'],
  activation: ['onStartupFinished'],
  contributes: {
    views: [
      {
        id: 'alice-accounts',
        container: 'leftSidebar',
        title: 'Accounts',
        titleKey: 'alice.title',
        panelTitleKey: 'alice.title',
        icon: 'plug',
        order: 5,
      },
    ],
    commands: [
      {
        id: 'alice.accounts',
        title: 'Accounts & connections',
        titleKey: 'alice.title',
        icon: 'plug',
        keywords: 'alice account agent connection n8n',
      },
    ],
  },
  spec: {},
}
