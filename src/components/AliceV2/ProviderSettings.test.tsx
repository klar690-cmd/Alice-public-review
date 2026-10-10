import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  defaultProviderSelection,
  exportProviderSettings,
} from '../../lib/aliceV2/providerUiOptions'
import { activeTeam, createAliceV2UiStore } from '../../stores/aliceV2UiStore'
import { LocaleContext, type M2Locale, m2Translate } from './messages'
import { ProviderSettings } from './ProviderSettings'
import { AliceV2Workspace } from './Workspace'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
describe('R267 read-only execution requirements', () => {
  it('renders truthful requirements in the actual inspector without any launch control', () => {
    const store = setup(),
      before = store.getState()
    const block = screen.getByRole('region', { name: 'Requisitos de execução' })
    expect(block).toHaveAttribute('data-run-intent-executable', 'false')
    expect(block).toHaveAttribute('data-run-intent-gate', 'SIMULATION_ONLY')
    expect(within(block).getByText('Não conectado · somente preparação')).toBeVisible()
    expect(within(block).getByText(/não verifica a revisão do grafo nem replay/)).toBeVisible()
    expect(within(block).queryByRole('button')).not.toBeInTheDocument()
    expect(within(block).queryByRole('textbox')).not.toBeInTheDocument()
    expect(store.getState()).toBe(before)
    expect(screen.queryByRole('button', { name: /^(Conectar|Executar)$/ })).not.toBeInTheDocument()
  })
  it('reclassifies per-node facts for GG and worker while the fake simulation remains unchanged', () => {
    const store = setup(),
      graph = activeTeam(store.getState()).graph
    act(() => store.getState().updateProvider('GG', { providerId: 'codex', method: 'local-cli' }))
    expect(screen.getByRole('region', { name: 'Requisitos de execução' })).toHaveAttribute(
      'data-run-intent-gate',
      'BLOCKED_NATIVE_QA',
    )
    expect(screen.getByText('Exige teste nativo, autorização e integração.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Mover agente: Dev' }))
    act(() => store.getState().updateProvider('Dev', { providerId: 'claude', method: 'api-key' }))
    expect(screen.getByRole('region', { name: 'Requisitos de execução' })).toHaveAttribute(
      'data-run-intent-gate',
      'NOT_CONNECTED',
    )
    expect(activeTeam(store.getState()).graph).toBe(graph)
    act(() => store.getState().prepare())
    expect(activeTeam(store.getState()).run!.result.realAccess).toBe(false)
    expect(activeTeam(store.getState()).run!.result.snapshot.plan.executable).toBe(false)
  })
  it.each(['en', 'pt-BR', 'zh-CN'] as M2Locale[])(
    'uses the existing %s translation table',
    (locale) => {
      const scope = {
        ownerId: 'ownerA',
        profileId: 'profileA',
        projectId: 'projectA',
        configId: 'teamA',
        nodeId: 'GG',
      }
      const onChange = vi.fn(),
        onAccounts = vi.fn()
      render(
        <LocaleContext.Provider value={locale}>
          <ProviderSettings
            selection={{
              ...defaultProviderSelection(scope),
              providerId: 'codex',
              method: 'api-key',
            }}
            onChange={onChange}
            onAccounts={onAccounts}
          />
        </LocaleContext.Provider>,
      )
      const block = screen.getByRole('region', { name: m2Translate(locale, 'intentRequirements') })
      expect(within(block).getByText(m2Translate(locale, 'intentNativeApproval'))).toBeVisible()
      expect(block).toHaveAttribute('data-run-intent-executable', 'false')
      expect(onChange).not.toHaveBeenCalled()
      expect(onAccounts).not.toHaveBeenCalled()
    },
  )
})
describe('R271 actual inspector account/API choices', () => {
  it('chooses OpenAI/API for GG and Anthropic/account for a worker without login or graph conversion', () => {
    const store = setup(),
      graph = activeTeam(store.getState()).graph,
      fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(screen.getByText('Qual IA será este agente?')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Entrar com conta' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Provedor' }), {
      target: { value: 'codex' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Usar API' }))
    expect(screen.getByRole('button', { name: 'Usar API' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Mover agente: Dev' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Provedor' }), {
      target: { value: 'claude' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com conta' }))
    expect(screen.getByRole('button', { name: 'Entrar com conta' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('Conexão por conta ainda não disponível aqui.')).toBeVisible()
    expect(activeTeam(store.getState()).providerSettings.Dev).toMatchObject({
      providerId: 'claude',
      method: 'account-login',
      connected: false,
      executable: false,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mover agente: GG' }))
    expect(screen.getByRole('combobox', { name: 'Provedor' })).toHaveValue('codex')
    expect(screen.getByRole('button', { name: 'Usar API' })).toHaveAttribute('aria-pressed', 'true')
    expect(activeTeam(store.getState()).graph).toBe(graph)
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: /chave|token|password/i })).not.toBeInTheDocument()
  })
  it('new agent has independent choices; provider switch clears the previous method', () => {
    const store = setup()
    fireEvent.change(screen.getByRole('combobox', { name: 'Provedor' }), {
      target: { value: 'codex' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Usar API' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar agente' }))
    expect(screen.getByRole('combobox', { name: 'Provedor' })).toHaveValue('fake')
    fireEvent.change(screen.getByRole('combobox', { name: 'Provedor' }), {
      target: { value: 'antigravity' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Usar API' }))
    expect(activeTeam(store.getState()).providerSettings.GG.providerId).toBe('codex')
    fireEvent.change(screen.getByRole('combobox', { name: 'Provedor' }), {
      target: { value: 'claude' },
    })
    expect(screen.getByRole('combobox', { name: 'Método de conexão' })).toHaveValue('simulated')
    expect(screen.getByRole('button', { name: 'Usar API' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
  it('save/load and duplicate preserve a blocked preference, never authority', () => {
    const store = setup()
    act(() => {
      store.getState().updateProvider('GG', { providerId: 'claude', method: 'account-login' })
      store.getState().save()
      store.getState().updateProvider('GG', { method: 'api-key' })
      store.getState().load()
      store.getState().duplicateNode()
    })
    const selected = activeTeam(store.getState()).providerSettings[store.getState().selectedNode!]
    expect(selected).toMatchObject({ method: 'account-login', connected: false, executable: false })
    expect(
      JSON.parse(exportProviderSettings(activeTeam(store.getState()).providerSettings)).executable,
    ).toBe(false)
    expect(screen.getByText('Conexão por conta ainda não disponível aqui.')).toBeInTheDocument()
  })
})
function setup() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const store = createAliceV2UiStore('profileA', undefined, 'projectA')
  store.getState().setView('editor')
  render(
    <LocaleContext.Provider value="pt-BR">
      <AliceV2Workspace store={store} />
    </LocaleContext.Provider>,
  )
  return store
}
describe('R264 inspector integration', () => {
  it('configures GG and each worker independently without changing the fake graph', () => {
    const store = setup(),
      before = activeTeam(store.getState()).graph
    fireEvent.change(screen.getByRole('combobox', { name: 'Provedor' }), {
      target: { value: 'codex' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Método de conexão' }), {
      target: { value: 'local-cli' },
    })
    expect(screen.getByText('Validação nativa pendente')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mover agente: Dev' }))
    expect(screen.getByRole('combobox', { name: 'Provedor' })).toHaveValue('fake')
    fireEvent.change(screen.getByRole('combobox', { name: 'Provedor' }), {
      target: { value: 'claude' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Método de conexão' }), {
      target: { value: 'api-key' },
    })
    expect(screen.getByText('Requer integração')).toBeInTheDocument()
    expect(screen.getByText(/CLI estruturado do Claude está bloqueado/)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /CLI oficial local/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Mover agente: GG' }))
    expect(screen.getByRole('combobox', { name: 'Provedor' })).toHaveValue('codex')
    expect(activeTeam(store.getState()).graph).toBe(before)
    expect(before.nodes.every((n) => n.provider === 'fake')).toBe(true)
    expect(screen.queryByLabelText(/API key|Chave de API/)).not.toBeInTheDocument()
  })
  it('save/load, duplication and team clones preserve only local preferences', () => {
    const store = setup()
    act(() => {
      store.getState().updateProvider('GG', { providerId: 'codex' })
      store.getState().save()
      store.getState().updateProvider('GG', { providerId: 'cursor' })
      store.getState().load()
    })
    expect(activeTeam(store.getState()).providerSettings.GG.providerId).toBe('codex')
    act(() => {
      store.getState().selectNode('GG')
      store.getState().duplicateNode()
    })
    const duplicate = store.getState().selectedNode!
    expect(activeTeam(store.getState()).providerSettings[duplicate].providerId).toBe('codex')
    expect(activeTeam(store.getState()).providerSettings[duplicate].scope.nodeId).toBe(duplicate)
    act(() => store.getState().cloneTeam())
    const cloned = activeTeam(store.getState())
    expect(cloned.providerSettings.GG.scope.configId).toBe(cloned.id)
    expect(JSON.parse(exportProviderSettings(cloned.providerSettings)).executable).toBe(false)
  })
  it('isolates teams, projects and profiles and rejects unknown node updates', () => {
    const store = setup()
    act(() => {
      store.getState().updateProvider('GG', { providerId: 'codex' })
      store.getState().selectTeam('team_plan')
    })
    expect(activeTeam(store.getState()).providerSettings.GG.providerId).toBe('fake')
    const projectB = createAliceV2UiStore('profileA', undefined, 'projectB'),
      profileB = createAliceV2UiStore('profileB', undefined, 'projectA')
    expect(activeTeam(projectB.getState()).providerSettings.GG.providerId).toBe('fake')
    expect(activeTeam(profileB.getState()).providerSettings.GG.scope.profileId).toBe('profileB')
    act(() => store.getState().updateProvider('missing', { providerId: 'codex' }))
    expect(store.getState().error).toBe('UNKNOWN_NODE')
  })
  it('unavailable selections and key-bearing patches leave settings unchanged', () => {
    const store = setup()
    act(() => store.getState().updateProvider('GG', { providerId: 'claude' }))
    const before = activeTeam(store.getState()).providerSettings
    act(() => store.getState().updateProvider('GG', { method: 'local-cli' }))
    expect(store.getState().error).toBe('UNAVAILABLE_PROVIDER_METHOD')
    act(() => store.getState().updateProvider('GG', { apiKey: 'dummy' }))
    expect(store.getState().error).toBe('SECRET_MATERIAL')
    expect(activeTeam(store.getState()).providerSettings).toBe(before)
  })
  it('keeps the original account view reachable from the inspector', () => {
    const store = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Ver contas existentes' }))
    expect(store.getState().view).toBe('accounts')
    expect(screen.getByRole('region', { name: 'Contas e provedores' })).toBeInTheDocument()
  })
  it('provider changes never trigger login/network/native calls', () => {
    const fetch = vi.fn(),
      store = setup()
    vi.stubGlobal('fetch', fetch)
    act(() => {
      store.getState().updateProvider('GG', { providerId: 'codex', method: 'managed-cloud' })
      store.getState().prepare()
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(activeTeam(store.getState()).run!.result.snapshot.plan.executable).toBe(false)
    expect(activeTeam(store.getState()).run!.result.realAccess).toBe(false)
  })
})
