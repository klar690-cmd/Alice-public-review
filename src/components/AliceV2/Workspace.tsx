import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'

import avatar from '../../assets/alice/original-girl-cat-moon-profile.png'
import { compileGraph } from '../../lib/aliceV2/compile'
import { DomainError, type Status } from '../../lib/aliceV2/contracts'
import { runProjection } from '../../lib/aliceV2/uiAdapter'
import { validateGraph } from '../../lib/aliceV2/validate'
import { activeTeam, type M2Store, type View } from '../../stores/aliceV2UiStore'
import { AccountsPanel } from './AccountsPanel'
import { Canvas } from './Canvas'
import { useM2T } from './messages'
import { ProviderSettings } from './ProviderSettings'
import styles from './Workspace.module.css'

export function AliceV2Workspace({
  store,
  onTheme,
  theme,
  embedded = false,
  onLeave,
}: {
  store: M2Store
  onTheme?: (theme: 'elite-indigo' | 'cream-rose') => void
  theme?: string
  embedded?: boolean
  onLeave?: () => void
}) {
  const s = useStore(store),
    team = activeTeam(s),
    t = useM2T(),
    projection = runProjection(team.run)
  const [compose, setCompose] = useState(''),
    [teamsCollapsed, setTeamsCollapsed] = useState(false),
    [from, setFrom] = useState('GG'),
    [to, setTo] = useState('Auditor')
  const inspectorRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (inspectorRef.current) inspectorRef.current.scrollTop = 0
  }, [store, s.selectedNode, s.activeId])
  const node = team.graph.nodes.find((n) => n.id === s.selectedNode)
  const teamName = (id: string, name: string) =>
    name === 'Build & review' && id === 'team_build'
      ? t('teamBuild')
      : name === 'Plan an idea' && id === 'team_plan'
        ? t('teamPlan')
        : name
  const nodeStatus = (status?: Status) =>
    t(status === 'waiting-approval' ? 'await' : (status ?? 'draft'))
  const ordered = (graph: typeof team.graph) => {
    try {
      return compileGraph(graph).steps.map((step) => graph.nodes.find((n) => n.id === step.nodeId)!)
    } catch {
      return graph.nodes
    }
  }
  let invalid = ''
  try {
    validateGraph(team.graph)
  } catch (error) {
    invalid = error instanceof DomainError ? error.code : 'MALFORMED'
  }
  const issue = s.error || invalid
  const issueText =
    issue === 'CYCLE'
      ? t('cycle')
      : issue === 'MISSING_INPUT' || issue === 'IMPOSSIBLE_JOIN'
        ? t('missing')
        : t('generic')
  const finished = !!team.run && team.run.playhead >= team.run.result.checkpoint.events.length
  const runControls = (
    <div className={styles.runControls}>
      {!team.run ? (
        <>
          <p>{t('emptyRun')}</p>
          <button type="button" className={styles.primary} disabled={!!invalid} onClick={s.prepare}>
            {t('prepare')}
          </button>
        </>
      ) : team.run.result.status === 'waiting-approval' ? (
        <>
          <span className={styles.waiting}>{t('await')}</span>
          <p className={styles.muted}>{t('approveHint')}</p>
          <button type="button" className={styles.primary} onClick={() => s.approve('approved')}>
            {t('approve')}
          </button>
          <button type="button" onClick={() => s.approve('denied')}>
            {t('deny')}
          </button>
        </>
      ) : (
        <>
          <span className={styles.badge}>{t('replay')}</span>
          <strong>
            {t(projection.status === 'waiting-approval' ? 'await' : projection.status)}
          </strong>
          <div className={styles.actions}>
            <button type="button" disabled={finished} onClick={s.advance}>
              {t('advance')}
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={finished}
              onClick={() => s.finish(t('complete'))}
            >
              {t('finish')}
            </button>
          </div>
          <p className={styles.muted}>
            {t('frozen')}{' '}
            {team.run.result.snapshot.plan.graph.revision !== team.graph.revision
              ? t('dirtyRun')
              : ''}
          </p>
        </>
      )}
    </div>
  )
  return (
    <div className={`${styles.shell} ${embedded ? styles.embedded : ''}`}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img src={avatar} alt="" />
          <strong>{t('studio')}</strong>
          <span className={styles.badge}>V2 · {t('demo')}</span>
        </div>
        <div className={styles.actions}>
          {s.view !== 'accounts' && (
            <button
              type="button"
              aria-expanded={!teamsCollapsed}
              onClick={() => setTeamsCollapsed(!teamsCollapsed)}
            >
              {t(teamsCollapsed ? 'showTeams' : 'collapseTeams')}
            </button>
          )}
          {onTheme && (
            <>
              <button
                type="button"
                aria-pressed={theme === 'elite-indigo'}
                onClick={() => onTheme('elite-indigo')}
              >
                {t('original')}
              </button>
              <button
                type="button"
                aria-pressed={theme === 'cream-rose'}
                onClick={() => onTheme('cream-rose')}
              >
                {t('cream')}
              </button>
            </>
          )}
          <button type="button" onClick={onLeave ?? s.leave}>
            {t('back')}
          </button>
        </div>
      </header>
      <div className={styles.notice} role="note">
        <span className={styles.dot} />
        {t('notice')}
      </div>
      <div className={styles.body} data-teams-collapsed={teamsCollapsed || s.view === 'accounts'}>
        <aside className={styles.teamSidebar} aria-label={t('savedTeams')}>
          <span className={styles.eyebrow}>{t('savedTeams')}</span>
          {s.teams.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`${styles.teamButton} ${p.id === s.activeId ? styles.teamActive : ''}`}
              onClick={() => s.selectTeam(p.id)}
              aria-pressed={p.id === s.activeId}
            >
              <span className={styles.teamMark}>◇</span>
              <span>
                <strong>{teamName(p.id, p.graph.name)}</strong>
                <small>
                  {p.graph.nodes.length} {t('agents')}
                </small>
              </span>
            </button>
          ))}
          <button type="button" className={styles.sidebarClone} onClick={s.cloneTeam}>
            + {t('clone')}
          </button>
          <p className={styles.sessionNotice}>{t('session')}</p>
          <footer>{t('noServices')}</footer>
        </aside>
        <main className={styles.main}>
          <div className={styles.viewHeader}>
            <div>
              <span className={styles.eyebrow}>{t('memory')}</span>
              <h1>{teamName(team.id, team.graph.name)}</h1>
              <p className={styles.muted}>
                {t('revision')} {team.graph.revision} {team.dirty ? `· ${t('unsaved')}` : ''}
              </p>
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={s.load}>
                {t('load')}
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={!!invalid}
                onClick={s.save}
              >
                {t('save')}
              </button>
            </div>
          </div>
          <nav className={styles.tabs} aria-label={t('preview')}>
            {(['editor', 'chat', 'teams', 'monitor', 'accounts'] as View[]).map((view) => (
              <button
                type="button"
                key={view}
                aria-pressed={s.view === view}
                className={s.view === view ? styles.tabActive : ''}
                onClick={() => s.setView(view)}
              >
                {t(view)}
              </button>
            ))}
          </nav>
          {issue && (
            <div className={styles.error} role="alert">
              <strong>{t('error')}</strong> · {issueText}
            </div>
          )}
          {s.notice && (
            <div className={styles.success} role="status">
              {t(s.notice)}
            </div>
          )}
          {s.view === 'accounts' && <AccountsPanel />}
          {s.view === 'chat' && (
            <div className={styles.chatLayout}>
              <section className={styles.chat} aria-label={t('gg')}>
                <div className={styles.chatHeader}>
                  <span className={styles.managerIcon}>G</span>
                  <div>
                    <h2>{t('gg')}</h2>
                    <small>{t('local')}</small>
                  </div>
                  <span className={styles.badge}>{t('fake')}</span>
                </div>
                <div className={styles.messages} aria-live="polite">
                  {team.messages.length === 0 ? (
                    <article className={styles.message}>
                      <span className={styles.eyebrow}>{t('gg')}</span>
                      <p>{t('welcome')}</p>
                      <div className={styles.suggestions}>
                        {[t('teamBuild'), t('teamPlan')].map((text) => (
                          <button type="button" key={text} onClick={() => setCompose(text)}>
                            {text} ↗
                          </button>
                        ))}
                      </div>
                    </article>
                  ) : (
                    team.messages.map((m) => (
                      <article
                        key={m.id}
                        className={`${styles.message} ${m.kind === 'user' ? styles.userMessage : ''}`}
                      >
                        <span className={styles.eyebrow}>
                          {m.kind === 'user' ? t('you') : t('gg')}
                        </span>
                        <p>{m.text}</p>
                        {m.kind === 'gg' && <small>{t('local')}</small>}
                      </article>
                    ))
                  )}
                </div>
                <form
                  className={styles.composer}
                  onSubmit={(e) => {
                    e.preventDefault()
                    s.send(compose, t('localReply'))
                    setCompose('')
                  }}
                >
                  <textarea
                    aria-label={t('placeholder')}
                    placeholder={t('placeholder')}
                    value={compose}
                    maxLength={1200}
                    onChange={(e) => setCompose(e.target.value)}
                  />
                  <div>
                    <small>{t('metadata')}</small>
                    <button type="submit" className={styles.primary} disabled={!compose.trim()}>
                      {t('send')} ↗
                    </button>
                  </div>
                </form>
              </section>
              <aside className={styles.overview}>
                <h2>{t('summary')}</h2>
                <div className={styles.routeList}>
                  {ordered(team.graph).map((n, i) => (
                    <div className={styles.routeCard} key={n.id}>
                      <span className={styles.routeNumber}>{i + 1}</span>
                      <div>
                        <strong>{team.labels[n.id].label}</strong>
                        <small>{n.role}</small>
                      </div>
                      <span
                        className={styles.nodeStatus}
                        data-status={projection.nodes[n.id] ?? 'queued'}
                      >
                        {nodeStatus(projection.nodes[n.id])}
                      </span>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => s.setView('editor')}>
                  {t('editTeam')} ↗
                </button>
                {runControls}
              </aside>
            </div>
          )}
          {s.view === 'editor' && (
            <div className={styles.editorLayout}>
              <section className={styles.canvasColumn}>
                <div className={styles.toolbar}>
                  <span>{t('editor')}</span>
                  <button type="button" onClick={s.addNode}>
                    + {t('add')}
                  </button>
                  <button type="button" disabled={!!invalid} onClick={s.prepare}>
                    {t('prepare')} ▷
                  </button>
                </div>
                <Canvas store={store} />
              </section>
              <aside ref={inspectorRef} className={styles.inspector} aria-label={t('settings')}>
                <span className={styles.eyebrow}>{t('settings')}</span>
                {node ? (
                  <>
                    <h2>{team.labels[node.id].label}</h2>
                    <ProviderSettings
                      selection={team.providerSettings[node.id]}
                      onChange={(patch) => s.updateProvider(node.id, patch)}
                      onAccounts={() => s.setView('accounts')}
                    />
                    <label>
                      {t('label')}
                      <input
                        value={team.labels[node.id].label}
                        maxLength={60}
                        onChange={(e) => s.updateNode(node.id, { label: e.target.value })}
                      />
                    </label>
                    <label>
                      {t('role')}
                      <input
                        value={node.role}
                        maxLength={80}
                        onChange={(e) => s.updateNode(node.id, { role: e.target.value })}
                      />
                    </label>
                    <small className={styles.muted}>{t('capability')}</small>
                    <label>
                      {t('behavior')}
                      <select
                        value={node.behavior}
                        onChange={(e) =>
                          s.updateNode(node.id, {
                            behavior: e.target.value as 'produce' | 'review',
                          })
                        }
                      >
                        <option value="produce">{t('produce')}</option>
                        <option value="review">{t('review')}</option>
                      </select>
                    </label>
                    <label>
                      {t('prompt')}
                      <textarea
                        value={node.prompt}
                        maxLength={1200}
                        onChange={(e) => s.updateNode(node.id, { prompt: e.target.value })}
                      />
                    </label>
                    <span className={styles.badge}>{t('join')}</span>
                    <div className={styles.actions}>
                      <button type="button" onClick={s.duplicateNode}>
                        {t('duplicate')}
                      </button>
                      <button type="button" className={styles.danger} onClick={s.deleteNode}>
                        {t('remove')}
                      </button>
                    </div>
                  </>
                ) : (
                  <p>{t('none')}</p>
                )}
                <div className={styles.connectionForm}>
                  <h3>{t('connections')}</h3>
                  <label>
                    {t('from')}
                    <select value={from} onChange={(e) => setFrom(e.target.value)}>
                      {team.graph.nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {team.labels[n.id].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('to')}
                    <select value={to} onChange={(e) => setTo(e.target.value)}>
                      {team.graph.nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {team.labels[n.id].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => s.connect(from, to, 'new')}>
                    {t('connect')}
                  </button>
                  {team.graph.dataEdges.map((e) => (
                    <div className={styles.connectionRow} key={e.id}>
                      <span>
                        {team.labels[e.from.nodeId]?.label} → {team.labels[e.to.nodeId]?.label}
                      </span>
                      <button
                        type="button"
                        aria-label={`${t('unlink')} ${e.id}`}
                        onClick={() => s.deleteEdge(e.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          )}
          {s.view === 'teams' && (
            <section className={styles.presetView} aria-label={t('teams')}>
              <header>
                <h2>{t('savedTeams')}</h2>
                <p>{t('session')}</p>
              </header>
              <div className={styles.presetGrid}>
                {s.teams.map((p) => (
                  <article className={styles.presetCard} key={p.id}>
                    <span className={styles.eyebrow}>{t('sample')}</span>
                    <h2>{teamName(p.id, p.graph.name)}</h2>
                    <div className={styles.miniRoute}>
                      {ordered(p.graph).map((n) => (
                        <span key={n.id}>{p.labels[n.id].label}</span>
                      ))}
                    </div>
                    <p className={styles.muted}>
                      {t('revision')} {p.savedGraph.revision} · {p.graph.nodes.length} {t('agents')}
                    </p>
                    <button
                      type="button"
                      className={p.id === s.activeId ? styles.primary : ''}
                      onClick={() => s.selectTeam(p.id)}
                    >
                      {t('load')}
                    </button>
                  </article>
                ))}
              </div>
              <div className={styles.teamSettings}>
                <label>
                  {t('renameTeam')}
                  <input
                    value={team.graph.name}
                    maxLength={120}
                    onChange={(e) => s.renameTeam(e.target.value)}
                  />
                </label>
                <div className={styles.actions}>
                  <button type="button" onClick={s.cloneTeam}>
                    {t('clone')}
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={!!invalid}
                    onClick={s.save}
                  >
                    {t('save')}
                  </button>
                </div>
              </div>
            </section>
          )}
          {s.view === 'monitor' && (
            <section className={styles.monitor} aria-label={t('execution')}>
              <div className={styles.monitorTop}>
                <div>
                  <span className={styles.eyebrow}>{t('replay')}</span>
                  <h2>{t('execution')}</h2>
                </div>
                {runControls}
              </div>
              <div className={styles.agentProgress}>
                {ordered(team.run?.result.snapshot.plan.graph ?? team.graph).map((n) => (
                  <article key={n.id}>
                    <span className={styles.managerIcon}>{n.id.slice(0, 1)}</span>
                    <strong>{team.labels[n.id]?.label ?? n.id}</strong>
                    <span
                      className={styles.nodeStatus}
                      data-status={projection.nodes[n.id] ?? 'queued'}
                    >
                      {nodeStatus(projection.nodes[n.id])}
                    </span>
                  </article>
                ))}
              </div>
              <div className={styles.monitorColumns}>
                <div>
                  <h3>{t('trace')}</h3>
                  <ol className={styles.timeline}>
                    {team.run?.result.checkpoint.events.slice(0, team.run.playhead).map((e) => (
                      <li key={e.eventId}>
                        <span>{e.sequence}</span>
                        <div>
                          <strong>
                            {e.nodeId ? (team.labels[e.nodeId]?.label ?? e.nodeId) : t('gg')}
                          </strong>
                          <small>{t(e.status === 'waiting-approval' ? 'await' : e.status)}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h3>{t('outputs')}</h3>
                  {projection.visibleOutputs.map((text, i) => (
                    <pre className={styles.output} key={i}>
                      {text}
                    </pre>
                  ))}
                  <p className={styles.muted}>{t('noTerminal')}</p>
                  {team.run && (
                    <details>
                      <summary>{t('diagnostics')}</summary>
                      <pre className={styles.output}>
                        {JSON.stringify(
                          {
                            mode: team.run.result.mode,
                            executable: team.run.result.snapshot.plan.executable,
                            steps: team.run.result.snapshot.plan.steps.map((s) => ({
                              node: s.nodeId,
                              dependsOn: s.dependsOn,
                            })),
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
      <footer className={styles.footer}>
        <span>{t('source')}</span>
        <span>{t('limits')}</span>
      </footer>
    </div>
  )
}
