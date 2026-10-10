import type { PluginModule } from '../../lib/plugins'
import { createR219DemoConnections } from '../../preview/data'
import { startAliceProfileSync } from '../../stores/aliceStore'
import {
  AliceConnectionsModal,
  AliceConnectionsView,
  AlicePanePicker,
  AliceSessionPane,
} from './view'
const plugin: PluginModule = {
  activate(context) {
    context.subscriptions.push({ dispose: startAliceProfileSync(createR219DemoConnections) })
    context.registerView('alice-accounts', AliceConnectionsView)
    context.contributes.pane({ id: 'alice-agent-session', component: AliceSessionPane })
    context.contributes.modal({
      id: 'alice.connections.settings',
      component: AliceConnectionsModal,
    })
    context.contributes.modal({ id: 'alice.panels', component: AlicePanePicker })
    context.registerCommand('alice.accounts', () =>
      context.ui.openModal('alice.connections.settings'),
    )
  },
}
export default plugin
