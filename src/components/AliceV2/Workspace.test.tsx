import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { activeTeam, createAliceV2UiStore } from '../../stores/aliceV2UiStore'
import { LocaleContext } from './messages'
import { AliceV2Workspace } from './Workspace'

beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  ),
)
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const setup = () => {
  const store = createAliceV2UiStore()
  render(
    <LocaleContext.Provider value="pt-BR">
      <AliceV2Workspace store={store} />
    </LocaleContext.Provider>,
  )
  return store
}
describe('M2 accessible visual workspace', () => {
  it('renders one GG conversation with explicit simulation and memory boundaries', () => {
    setup()
    expect(screen.getByRole('region', { name: 'Gerente Geral' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('n8n não conectado')
    expect(screen.getByText(/Recarregar encerra esta sessão/)).toBeInTheDocument()
  })
  it('creates a local request and waits for deliberate fake approval', () => {
    const store = setup()
    fireEvent.change(
      screen.getByRole('textbox', { name: 'O que você quer que sua equipe faça?' }),
      { target: { value: 'Synthetic request' } },
    )
    fireEvent.click(screen.getByRole('button', { name: /Preparar simulação/ }))
    expect(activeTeam(store.getState()).run!.result.status).toBe('waiting-approval')
    fireEvent.click(screen.getByRole('button', { name: 'Recusar simulação' }))
    expect(activeTeam(store.getState()).run!.result.checkpoint.receipts).toHaveLength(0)
  })
  it('supports keyboard node movement and editable inspector labels', () => {
    const store = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Editor de nós', exact: true }))
    const handle = screen.getByRole('button', { name: 'Mover agente: Dev' }),
      before = activeTeam(store.getState()).layout.Dev.x
    fireEvent.click(handle)
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(activeTeam(store.getState()).layout.Dev.x).toBe(before + 20)
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome de exibição' }), {
      target: { value: 'Builder' },
    })
    expect(activeTeam(store.getState()).labels.Dev.label).toBe('Builder')
    expect(screen.getByRole('combobox', { name: 'Provedor' })).toHaveValue('fake')
    expect(screen.getByRole('combobox', { name: 'Método de conexão' })).toHaveValue('simulated')
  })
  it('renders an inline cycle error without editing the valid graph', () => {
    const store = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Editor de nós', exact: true }))
    act(() => store.getState().connect('Auditor', 'GG', 'new'))
    expect(screen.getByRole('alert')).toHaveTextContent('cria um ciclo')
  })
  it('keeps the activity view tied to captured M1 events', () => {
    const store = setup()
    act(() => {
      store.getState().prepare()
      store.getState().approve('approved')
      store.getState().setView('monitor')
    })
    expect(screen.getByRole('region', { name: 'Execução simulada' })).toBeInTheDocument()
    expect(screen.getAllByText('Reprodução das etapas simuladas').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Concluir reprodução' }))
    expect(activeTeam(store.getState()).run!.playhead).toBe(
      activeTeam(store.getState()).run!.result.checkpoint.events.length,
    )
  })
})
