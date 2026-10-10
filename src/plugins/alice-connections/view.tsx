import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ExternalLink, GripVertical, Plug, Plus, Users, X } from 'lucide-react'
import { useState } from 'react'

import controls from '../../components/modals/controls.module.css'
import { Modal } from '../../components/modals/Modal'
import { SubTabsLane } from '../../components/SubTabsLane'
import paneChrome from '../../components/TerminalPane/TerminalPane.module.css'
import { agentLabel, agentProviderContributions } from '../../lib/agentProviders'
import { aliceCapabilities, cliBindingSupported } from '../../lib/aliceBinding'
import { isAlicePreview } from '../../lib/aliceEnvironment'
import { ALICE_CANONICAL_IDENTITIES, ALICE_PROVIDER_OPTIONS } from '../../lib/aliceModel'
import { closeAlicePane } from '../../lib/alicePaneLifecycle'
import { type MessageKey, useT } from '../../lib/i18n'
import type { PaneProps } from '../../lib/plugins'
import { useContributions } from '../../lib/plugins/registry'
import { copyAliceHandoff, openAliceOriginal } from '../../lib/tauri/aliceOriginal'
import type { AliceAgent } from '../../lib/types'
import { useAliceStore } from '../../stores/aliceStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import styles from './view.module.css'

function N8nConnection() {
  const t = useT(),
    n8n = useAliceStore((s) => s.n8n),
    setUrl = useAliceStore((s) => s.setN8nUrl),
    test = useAliceStore((s) => s.testN8n)
  const [url, setDraft] = useState(n8n.baseUrl),
    [path, setPath] = useState(n8n.webhookPath ?? 'webhook/alice'),
    [error, setError] = useState('')
  const save = () => {
    try {
      setUrl(url, path)
      setError('')
    } catch {
      setError(t('alice.invalidUrl'))
    }
  }
  return (
    <section className={styles.section}>
      <h3>
        <Plug size={14} />
        {t('alice.n8n')}
      </h3>
      {isAlicePreview && <p className={styles.notice}>{t('alice.localFixture')}</p>}
      <span className={styles.badge}>{t(('alice.health.' + n8n.health) as MessageKey)}</span>
      <p className={styles.muted}>{t('alice.httpHint')}</p>
      <label className={controls.field}>
        <span className={controls.label}>{t('alice.n8nUrl')}</span>
        <input
          className={controls.input}
          value={url}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="http://127.0.0.1:5678"
        />
      </label>
      <label className={controls.field}>
        <span className={controls.label}>{t('alice.webhookPath')}</span>
        <input
          className={controls.input}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="webhook/alice"
        />
      </label>
      <div className={styles.actions}>
        <button className={controls.btn} onClick={save}>
          {t('alice.save')}
        </button>
        <button
          className={controls.btn}
          disabled={n8n.health === 'checking' || !n8n.baseUrl}
          onClick={() => void test()}
        >
          {t('alice.testConnection')}
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {n8n.lastResult && (
        <p className={styles.muted}>
          {n8n.lastResult.status ?? t(('alice.http.' + n8n.lastResult.error) as MessageKey)} ·{' '}
          {t('alice.attempts', { count: n8n.lastResult.attempts })} ·{' '}
          {t('alice.eventCount', { count: n8n.eventCount })}
        </p>
      )}
    </section>
  )
}
function CanonicalProject() {
  const t = useT(),
    snapshot = useAliceStore((s) => s.canonical),
    error = useAliceStore((s) => s.canonicalError),
    refresh = useAliceStore((s) => s.refreshCanonical)
  const [busy, setBusy] = useState(false)
  return (
    <section className={styles.section}>
      <h3>{t('alice.canonicalProject')}</h3>
      <button
        className={controls.btn}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await refresh()
          setBusy(false)
        }}
      >
        {t('alice.refreshCanonical')}
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {t(error as MessageKey)}
        </p>
      )}
      {snapshot ? (
        <>
          <span className={styles.badge}>
            {t(snapshot.fixture ? 'alice.fixture' : 'alice.authenticatedRead')}
          </span>
          <dl className={styles.details}>
            <dt>{t('alice.identity')}</dt>
            <dd>
              {snapshot.identity} · {snapshot.taskState}
            </dd>
            <dt>{t('alice.canonical')}</dt>
            <dd>
              {snapshot.taskId} · r{snapshot.taskRevision}
            </dd>
            <dt>{t('alice.generation')}</dt>
            <dd>
              {snapshot.generation} · {snapshot.sessionId}
            </dd>
            <dt>{t('alice.branch')}</dt>
            <dd>{snapshot.branch}</dd>
            <dt>{t('alice.candidate')}</dt>
            <dd>{snapshot.candidate}</dd>
            <dt>{t('alice.result')}</dt>
            <dd>{snapshot.resultPointer ?? snapshot.resultPath}</dd>
          </dl>
        </>
      ) : (
        <p className={styles.muted}>{t('alice.canonicalEmpty')}</p>
      )}
    </section>
  )
}
function AgentIdentityControls({ agent, linked }: { agent: AliceAgent; linked: boolean }) {
  const t = useT(),
    [rename, setRename] = useState(false),
    [remove, setRemove] = useState(false),
    [manualOpen, setManualOpen] = useState(false),
    [name, setName] = useState(agent.displayName),
    [error, setError] = useState('')
  return (
    <>
      <p className={styles.muted}>
        {t('alice.stableId')}: {agent.agentId.slice(-8)} · {t('alice.fixedRole')}:{' '}
        {agent.canonicalIdentity ?? t('alice.notConfigured')}
      </p>
      <div className={styles.actions}>
        {linked &&
          useAliceStore.getState().accounts.find((a) => a.accountId === agent.accountId)
            ?.providerClass === 'external-desktop-surface' && (
            <button className={controls.btn} onClick={() => setManualOpen(true)}>
              {t('alice.manualOpenOriginal')}
            </button>
          )}
        <button
          className={controls.btn}
          onClick={() => {
            setName(agent.displayName)
            setError('')
            setRename(true)
          }}
        >
          {t('alice.renameAgent')}
        </button>
        {linked && (
          <button
            className={controls.btn}
            onClick={() => useAliceStore.getState().openLinkedAgent(agent.agentId)}
          >
            {t('alice.openAgentPane')}
          </button>
        )}
        {linked && (
          <button className={controls.btn} onClick={() => setRemove(true)}>
            {t('alice.removeLinkedAgent')}
          </button>
        )}
      </div>
      <Modal
        open={rename}
        onClose={() => setRename(false)}
        title={t('alice.renameAgent')}
        width={440}
        footer={
          <button className={controls.btn} onClick={() => setRename(false)}>
            {t('common.close')}
          </button>
        }
      >
        <label className={controls.field}>
          <span className={controls.label}>{t('alice.alias')}</span>
          <input
            className={controls.input}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className={styles.muted}>{t('alice.renameHint')}</p>
        <button
          className={controls.btn}
          disabled={!name.trim()}
          onClick={() => {
            try {
              useAliceStore.getState().renameAgent(agent.agentId, name)
              setRename(false)
            } catch {
              setError(t('alice.invalidName'))
            }
          }}
        >
          {t('alice.save')}
        </button>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </Modal>
      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title={t('alice.manualOpenOriginal')}
        width={440}
        footer={
          <button className={controls.btn} onClick={() => setManualOpen(false)}>
            {t('common.close')}
          </button>
        }
      >
        <p className={styles.muted}>{t('alice.externalManualHint')}</p>
      </Modal>
      <Modal
        open={remove}
        onClose={() => setRemove(false)}
        title={t('alice.removeLinkedAgent')}
        width={440}
        footer={
          <button className={controls.btn} onClick={() => setRemove(false)}>
            {t('common.close')}
          </button>
        }
      >
        <p className={styles.muted}>{t('alice.removeHint')}</p>
        <button
          className={controls.btn}
          onClick={() => useAliceStore.getState().removeLinkedAgent(agent.agentId)}
        >
          {t('alice.removeLinkedAgent')}
        </button>
      </Modal>
    </>
  )
}
function AgentDetail({ agent }: { agent: AliceAgent }) {
  const t = useT(),
    accounts = useAliceStore((s) => s.accounts),
    sessions = useAliceStore((s) => s.sessions),
    projects = useProjectsStore((s) => s.projects)
  const snapshot = useAliceStore((s) => s.canonical),
    lastEvent = useAliceStore((s) => s.lastEvent),
    handoff = useAliceStore((s) => s.lastHandoff),
    store = useAliceStore.getState
  const [projectId, setProject] = useState(agent.projectId ?? projects[0]?.id ?? ''),
    [tabChoice, setTabChoice] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const account = accounts.find((a) => a.accountId === agent.accountId)
  const session = sessions.find(
    (s) => s.sessionId === agent.currentSessionId && s.agentId === agent.agentId,
  )
  if (!account) return null
  const linked = ['web-conversation', 'external-desktop-surface'].includes(account.providerClass)
  const caps = aliceCapabilities(account, !isAlicePreview, session)
  const project = projects.find((p) => p.id === projectId)
  const choices =
    project?.terminals
      .filter((p) => !p.kind)
      .flatMap((p) =>
        p.tabs
          .filter((tab) => tab.type === account.providerId)
          .map((tab) => ({ pane: p.id, tab: tab.id, label: p.name + ' · ' + tab.name })),
      ) ?? []
  const run = async (action: () => void | Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      const key = String((e as Error).message)
      setError(t(key.startsWith('alice.') ? (key as MessageKey) : 'alice.invalidBinding'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={styles.agentDetail}>
      <AgentIdentityControls agent={agent} linked={linked} />
      <p className={styles.muted}>
        {account.providerId} ·{' '}
        {session?.providerHandle ?? session?.sessionId ?? t('alice.noBinding')} ·{' '}
        {linked
          ? t('alice.linkedOnly')
          : t(('alice.binding.' + (session?.health ?? 'disconnected')) as MessageKey)}
      </p>
      {session?.workspace && <p className={styles.muted}>{session.workspace}</p>}
      <div className={styles.actions}>
        {Object.entries(caps).map(([key, available]) => (
          <span className={styles.badge} key={key}>
            {t(('alice.cap.' + key) as MessageKey)}:{' '}
            {t(available ? 'alice.available' : 'alice.unavailable')}
          </span>
        ))}
      </div>
      {cliBindingSupported(account) && (
        <>
          {isAlicePreview && <p className={styles.notice}>{t('alice.browserBinding')}</p>}
          <label className={controls.field}>
            <span className={controls.label}>{t('alice.project')}</span>
            <select
              className={controls.input}
              value={projectId}
              onChange={(e) => {
                setProject(e.target.value)
                setTabChoice('')
              }}
            >
              <option value="">{t('alice.chooseProject')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={controls.field}>
            <span className={controls.label}>{t('alice.existingSession')}</span>
            <select
              className={controls.input}
              value={tabChoice}
              onChange={(e) => setTabChoice(e.target.value)}
            >
              <option value="">{t('alice.chooseSession')}</option>
              {choices.map((c, i) => (
                <option key={c.tab} value={i}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.actions}>
            <button
              className={controls.btn}
              disabled={busy || !project || tabChoice === ''}
              onClick={() =>
                void run(() => {
                  const c = choices[Number(tabChoice)]
                  store().bindTab(agent.agentId, projectId, c.pane, c.tab)
                })
              }
            >
              {t('alice.bindSession')}
            </button>
            <button
              className={controls.btn}
              disabled={busy || !caps.createSession || !project}
              onClick={() => void run(() => store().createSession(agent.agentId, projectId))}
            >
              {t('alice.createSession')}
            </button>
            <button
              className={controls.btn}
              disabled={busy}
              onClick={() => void run(() => store().refreshBinding(agent.agentId))}
            >
              {t('alice.refreshBinding')}
            </button>
          </div>
          {sessions
            .filter((s) => s.agentId === agent.agentId && s.kind === 'pty')
            .map((s) => (
              <div className={styles.agentRow} key={s.sessionId}>
                <span>
                  {s.label} · {s.providerHandle ?? s.sessionId}
                </span>
                <button
                  className={controls.btn}
                  disabled={busy || isAlicePreview || s.health === 'disconnected'}
                  onClick={() => void run(() => store().resumeSession(agent.agentId, s.sessionId))}
                >
                  {t('alice.resumeSession')}
                </button>
              </div>
            ))}
        </>
      )}
      {(session?.surfaceUrl || account.originalUrl) && (
        <button
          className={controls.btn}
          onClick={() =>
            void run(() => openAliceOriginal(session?.surfaceUrl ?? account.originalUrl!))
          }
        >
          {t('alice.openOriginal')} <ExternalLink size={12} />
        </button>
      )}
      {account.providerClass === 'web-conversation' && (
        <p className={styles.notice}>{t('alice.privateLinkHint')}</p>
      )}
      {account.providerClass === 'external-desktop-surface' && (
        <p className={styles.notice}>{t('alice.externalManualHint')}</p>
      )}
      <div className={styles.actions}>
        <button
          className={controls.btn}
          disabled={busy || !projectId}
          onClick={() => void run(() => store().sendTestEvent(agent.agentId, projectId))}
        >
          {t('alice.sendTestEvent')}
        </button>
        <button
          className={controls.btn}
          disabled={
            busy ||
            !snapshot ||
            snapshot.fixture ||
            agent.canonicalIdentity !== snapshot.identity ||
            !projectId
          }
          onClick={() =>
            void run(() => store().dispatchCanonical(agent.agentId, projectId, snapshot!))
          }
        >
          {t('alice.dispatchCanonical')}
        </button>
      </div>
      {linked && (
        <div className={styles.actions}>
          <button
            className={controls.btn}
            disabled={
              busy || !snapshot || snapshot.fixture || !agent.canonicalIdentity || !agent.projectId
            }
            onClick={() =>
              void run(() =>
                store().prepareManualHandoff(agent.agentId, agent.projectId!, snapshot!),
              )
            }
          >
            {t('alice.prepareManualHandoff')}
          </button>
        </div>
      )}
      {linked && <p className={styles.muted}>{t('alice.manualRelayHint')}</p>}
      {handoff?.source.agent_id === agent.agentId && (
        <>
          <pre className={styles.event}>{JSON.stringify(handoff, null, 2)}</pre>
          <button
            className={controls.btn}
            onClick={() => void run(() => copyAliceHandoff(handoff))}
          >
            {t('alice.copyReviewedHandoff')}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {lastEvent?.agent_id === agent.agentId &&
        lastEvent.action === 'canonical.dispatch.requested' && (
          <p className={styles.notice}>{t('alice.commandPrepared')}</p>
        )}
      {lastEvent?.agent_id === agent.agentId && (
        <pre className={styles.event}>{JSON.stringify(lastEvent, null, 2)}</pre>
      )}
    </div>
  )
}
export function AlicePanePicker() {
  const t = useT(),
    open = useUiStore((s) => s.openModal === 'alice.panels'),
    close = useUiStore((s) => s.closeModal),
    openModal = useUiStore((s) => s.openModal_),
    agents = useAliceStore((s) => s.agents),
    accounts = useAliceStore((s) => s.accounts),
    sessions = useAliceStore((s) => s.sessions),
    projects = useProjectsStore((s) => s.projects),
    containers = useProjectsStore((s) => s.workspace.containers),
    [error, setError] = useState('')
  return (
    <Modal
      open={open}
      onClose={close}
      title={t('alice.newPane')}
      width={520}
      footer={
        <button className={controls.btn} onClick={close}>
          {t('common.close')}
        </button>
      }
    >
      <p className={styles.muted}>{t('alice.panePickerHint')}</p>
      {agents.map((agent) => {
        const account = accounts.find((a) => a.accountId === agent.accountId),
          session = sessions.find(
            (s) => s.sessionId === agent.currentSessionId && s.agentId === agent.agentId,
          ),
          project = projects.find((p) => p.id === (session?.projectId ?? agent.projectId)),
          available = Boolean(
            session &&
            project &&
            (session.kind !== 'pty' || project.terminals.some((p) => p.id === session.paneId)),
          )
        const visible = Boolean(
          session?.paneId &&
          containers.some(
            (c) => c.projectId === project?.id && c.paneIds.includes(session.paneId!),
          ),
        )
        return (
          <div className={styles.agentRow} key={agent.agentId}>
            <button
              className={controls.btn}
              disabled={!available}
              onClick={() => {
                try {
                  useAliceStore.getState().openLinkedAgent(agent.agentId)
                  setError('')
                  close()
                } catch {
                  setError(t('alice.invalidBinding'))
                }
              }}
            >
              <Users size={14} />
              {agent.displayName}
            </button>
            <small>
              {account?.providerId} · {t(visible ? 'alice.paneVisible' : 'alice.paneClosed')} ·{' '}
              {agent.agentId.slice(-8)}
              {!available ? ' · ' + t('alice.noBinding') : ''}
            </small>
          </div>
        )
      })}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button className={controls.btn} onClick={() => openModal('alice.connections.settings')}>
        {t('alice.connectAgent')}
      </button>
    </Modal>
  )
}
export function AliceConnectionsView() {
  const t = useT(),
    accounts = useAliceStore((s) => s.accounts),
    agents = useAliceStore((s) => s.agents),
    selected = useAliceStore((s) => s.selectedAccountId)
  const profileId = useAliceStore((s) => s.profileId),
    persisted = useAliceStore((s) => s.persistenceOk),
    select = useAliceStore((s) => s.selectAccount),
    openModal = useUiStore((s) => s.openModal_)
  return (
    <div className={styles.view}>
      {isAlicePreview && <p className={styles.banner}>{t('alice.demoAccount')}</p>}
      <p className={styles.muted}>{t('alice.profileScope', { id: profileId ?? '' })}</p>
      {!persisted && <p className={styles.error}>{t('alice.persistenceUnavailable')}</p>}
      <div className={styles.actions}>
        <button className={controls.btn} onClick={() => openModal('alice.panels')}>
          <Plus size={14} />
          {t('alice.newPane')}
        </button>

        <button className={controls.btn} onClick={() => openModal('alice.connections.settings')}>
          {t('alice.manage')}
        </button>
        <button className={controls.btn} onClick={() => openModal('profiles')}>
          {t('alice.profiles')}
        </button>
      </div>
      {accounts.length === 0 && <p className={styles.muted}>{t('alice.noAccounts')}</p>}
      {accounts.map((account) => (
        <section
          className={styles.account + ' ' + (selected === account.accountId ? styles.selected : '')}
          key={account.accountId}
        >
          <button className={styles.accountTitle} onClick={() => select(account.accountId)}>
            <Users size={16} />
            <strong>{account.label}</strong>
          </button>
          <p className={styles.muted}>
            {account.providerId} · {t(('alice.class.' + account.providerClass) as MessageKey)} ·{' '}
            {t(
              ['web-conversation', 'external-desktop-surface'].includes(account.providerClass)
                ? 'alice.linkedOnly'
                : 'alice.metadataOnly',
            )}
          </p>
          {agents
            .filter((a) => a.accountId === account.accountId)
            .map((agent) => (
              <div key={agent.agentId}>
                <details>
                  <summary className={styles.agentRow}>
                    <span>{agent.displayName}</span>
                    <small>
                      {account.providerId} · {agent.agentId.slice(-8)}
                    </small>
                  </summary>
                  <AgentDetail agent={agent} />
                </details>
                <button
                  className={controls.btn}
                  onClick={() => useAliceStore.getState().openLinkedAgent(agent.agentId)}
                  disabled={!agent.currentSessionId}
                >
                  <Plus size={12} />
                  {t('alice.openAgentPane')}
                </button>
              </div>
            ))}
        </section>
      ))}
      <N8nConnection key={profileId} />
      <CanonicalProject />
      <a
        className={styles.link}
        href="https://github.com/klar690-cmd/Alice"
        target="_blank"
        rel="noreferrer"
      >
        {t('alice.source')}
        <ExternalLink size={12} />
      </a>
    </div>
  )
}
export function AliceConnectionsModal() {
  const t = useT(),
    open = useUiStore((s) => s.openModal === 'alice.connections.settings'),
    close = useUiStore((s) => s.closeModal),
    accounts = useAliceStore((s) => s.accounts),
    projects = useProjectsStore((s) => s.projects),
    registered = useContributions(agentProviderContributions)
  const providerOptions = [
    ...ALICE_PROVIDER_OPTIONS.filter((p) =>
      ['cli-pty', 'native-surface', 'web-conversation', 'external-desktop-surface'].includes(
        p.kind,
      ),
    ),
    ...registered
      .filter((p) => !ALICE_PROVIDER_OPTIONS.some((o) => o.id === p.id))
      .map((p) => ({ id: p.id, label: agentLabel(p.id), kind: 'cli-pty' as const })),
  ]
  const [provider, setProvider] = useState('chatgpt-web'),
    [accountId, setAccount] = useState(''),
    [label, setLabel] = useState(''),
    [name, setName] = useState(''),
    [role, setRole] = useState(''),
    [identity, setIdentity] = useState(''),
    [canonicalTaskUrl, setCanonicalTaskUrl] = useState(''),
    [url, setUrl] = useState(''),
    [projectId, setProject] = useState(projects[0]?.id ?? ''),
    [error, setError] = useState('')
  const option = providerOptions.find((p) => p.id === provider)!,
    linked = ['web-conversation', 'external-desktop-surface'].includes(option.kind)
  const save = () => {
    try {
      useAliceStore.getState().connectAgent({
        accountId: accountId || undefined,
        accountLabel: label,
        providerId: provider,
        providerClass: option.kind,
        displayName: name,
        role,
        projectId,
        conversationUrl: url,
        canonicalIdentity: identity || undefined,
        canonicalTaskUrl: canonicalTaskUrl || undefined,
      })
      setName('')
      setUrl('')
      setError('')
    } catch (e) {
      setError(t(String((e as Error).message) as MessageKey))
    }
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title={t('alice.connectAgent')}
      width={820}
      footer={
        <button className={controls.btn} onClick={close}>
          {t('common.close')}
        </button>
      }
    >
      <p className={styles.muted}>{t('alice.noCredentials')}</p>
      <div className={styles.columns}>
        <div>
          <label className={controls.field}>
            <span className={controls.label}>{t('alice.provider')}</span>
            <select
              className={controls.input}
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value)
                setAccount('')
                setUrl('')
              }}
            >
              {providerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {t(('alice.class.' + p.kind) as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label className={controls.field}>
            <span className={controls.label}>{t('alice.account')}</span>
            <select
              className={controls.input}
              value={accountId}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">{t('alice.newAccount')}</option>
              {accounts
                .filter((a) => a.providerId === provider && a.providerClass === option.kind)
                .map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.label} · {a.accountId.slice(-8)}
                  </option>
                ))}
            </select>
          </label>
          {!accountId && (
            <label className={controls.field}>
              <span className={controls.label}>{t('alice.accountLabel')}</span>
              <input
                className={controls.input}
                value={label}
                maxLength={80}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
          )}
          <label className={controls.field}>
            <span className={controls.label}>{t('alice.alias')}</span>
            <input
              className={controls.input}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className={controls.field}>
            <span className={controls.label}>{t('alice.role')}</span>
            <input
              className={controls.input}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </label>
          <label className={controls.field}>
            <span className={controls.label}>{t('alice.fixedRole')}</span>
            <select
              className={controls.input}
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
            >
              <option value="">{t('alice.notConfigured')}</option>
              {ALICE_CANONICAL_IDENTITIES.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className={controls.field}>
            <span className={controls.label}>{t('alice.canonicalTaskReference')}</span>
            <input
              className={controls.input}
              value={canonicalTaskUrl}
              onChange={(e) => setCanonicalTaskUrl(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className={controls.field}>
            <span className={controls.label}>{t('alice.project')}</span>
            <select
              className={controls.input}
              value={projectId}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">{t('alice.chooseProject')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {option.kind === 'web-conversation' && (
            <label className={controls.field}>
              <span className={controls.label}>{t('alice.conversationUrl')}</span>
              <input
                className={controls.input}
                value={url}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
          )}
          {linked && (
            <p className={styles.notice}>
              {t(
                option.kind === 'web-conversation'
                  ? 'alice.privateLinkHint'
                  : 'alice.externalManualHint',
              )}
            </p>
          )}
          <button
            className={controls.btn + ' ' + controls.btnPrimary}
            disabled={
              !name.trim() ||
              (!accountId && !label.trim()) ||
              (linked && !projectId) ||
              (option.kind === 'web-conversation' && !url.trim())
            }
            onClick={save}
          >
            {t('alice.connectAgent')}
          </button>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </div>
        <AliceConnectionsView />
      </div>
    </Modal>
  )
}

export function AliceSessionPane({ projectId, terminal, paneDragEnabled = true }: PaneProps) {
  const t = useT(),
    sessions = useAliceStore((s) => s.sessions),
    agents = useAliceStore((s) => s.agents),
    setActive = useProjectsStore((s) => s.setActiveTab),
    openModal = useUiStore((s) => s.openModal_)
  const draggable = useDraggable({ id: 'pane:' + terminal.id, disabled: !paneDragEnabled }),
    droppable = useDroppable({ id: 'pane:' + terminal.id, disabled: !paneDragEnabled })
  const session =
      sessions.find((s) => s.sessionId === terminal.activeTabId) ??
      sessions.find((s) => s.paneId === terminal.id),
    agent = agents.find((a) => a.agentId === session?.agentId)
  return (
    <section
      aria-label={t('alice.agentPane', { name: agent?.displayName ?? terminal.name })}
      className={paneChrome.pane}
      ref={(node) => {
        draggable.setNodeRef(node)
        droppable.setNodeRef(node)
      }}
    >
      <header className={paneChrome.header + ' ' + paneChrome.headerPinned}>
        <div className={paneChrome.headLeft}>
          {paneDragEnabled && (
            <button
              className={paneChrome.action + ' ' + paneChrome.gripBtn}
              {...draggable.attributes}
              {...draggable.listeners}
              title={t('ui.terminal.dragToReorder')}
              aria-label={t('ui.terminal.dragToReorder')}
            >
              <GripVertical size={14} />
            </button>
          )}
          <Users size={14} />
          <strong className={styles.paneTitle} title={agent?.displayName ?? terminal.name}>
            {agent?.displayName ?? terminal.name}
          </strong>
          <span className={styles.badge + ' ' + styles.paneHeaderMeta}>
            {t('alice.metadataOnly')}
          </span>
        </div>
        <div className={paneChrome.headRight}>
          <button
            type="button"
            className={paneChrome.closePaneButton}
            aria-label={t('alice.newPane')}
            title={t('alice.newPane')}
            onClick={() => openModal('alice.panels')}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            className={paneChrome.closePaneButton}
            aria-label={t('alice.closePane')}
            title={t('alice.closePaneHint')}
            onClick={() => closeAlicePane(projectId, terminal.id)}
          >
            <X size={16} />
          </button>
        </div>
      </header>
      <div className={paneChrome.body}>
        <SubTabsLane
          tabs={terminal.tabs}
          activeTabId={terminal.activeTabId}
          onActivate={(id) => {
            setActive(projectId, terminal.id, id)
            const selected = sessions.find(
              (s) => (s.sessionId === id || s.tabId === id) && s.agentId === agent?.agentId,
            )
            if (selected)
              useAliceStore.setState({
                agents: agents.map((a) =>
                  a.agentId === selected.agentId
                    ? { ...a, currentSessionId: selected.sessionId }
                    : a,
                ),
              })
          }}
          onClose={() => closeAlicePane(projectId, terminal.id)}
          onAdd={() => openModal('alice.panels')}
        />
        <div className={styles.sessionBody}>
          {agent ? (
            <>
              <h2>{agent.displayName}</h2>
              <p className={styles.muted}>{agent.role}</p>
              <AgentDetail agent={agent} />
            </>
          ) : (
            <p>{t('alice.emptySession')}</p>
          )}
        </div>
      </div>
    </section>
  )
}
