import { type PointerEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'

import { runProjection } from '../../lib/aliceV2/uiAdapter'
import { activeTeam, type M2Store } from '../../stores/aliceV2UiStore'
import { useM2T } from './messages'
import styles from './Workspace.module.css'

export function Canvas({ store }: { store: M2Store }) {
  const s = useStore(store),
    team = activeTeam(s),
    t = useM2T(),
    projection = runProjection(team.run)
  const dragging = useRef<null | {
    id: string | null
    x: number
    y: number
    px: number
    py: number
  }>(null)
  const container = useRef<HTMLElement>(null),
    picked = s.linkFrom
  type Wire = { source: string; x: number; y: number; moved: boolean; target: string | null }
  const [wire, setWire] = useState<Wire | null>(null)
  const wireRef = useRef<Wire | null>(null)
  const setConnection = (next: Wire | null) => {
    wireRef.current = next
    setWire(next)
  }
  const resetConnection = () => {
    setConnection(null)
    store.getState().setLinkFrom(null)
  }
  useEffect(() => {
    wireRef.current = null
    setWire(null)
  }, [team.id])
  const fit = useCallback(() => {
    const rect = container.current?.getBoundingClientRect(),
      current = store.getState(),
      active = activeTeam(current)
    if (!rect || !active.graph.nodes.length) return
    const pos = active.graph.nodes.map((n) => active.layout[n.id]),
      minX = Math.min(...pos.map((p) => p.x)),
      minY = Math.min(...pos.map((p) => p.y)),
      width = Math.max(...pos.map((p) => p.x)) + 230 - minX,
      height = Math.max(...pos.map((p) => p.y)) + 170 - minY
    const zoom = Math.max(
      0.35,
      Math.min(1, (rect.width - 70) / width, (rect.height - 100) / height),
    )
    current.setViewport(zoom, {
      x: (rect.width - width * zoom) / 2 - minX * zoom,
      y: (rect.height - height * zoom) / 2 - minY * zoom,
    })
  }, [store])
  useEffect(() => {
    fit()
    const observer = new ResizeObserver(fit)
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [fit, store, team.id, team.graph.nodes.length])
  const start = (e: PointerEvent, id: string | null) => {
    if (e.button !== 0) return
    if (id) {
      s.selectNode(id)
      const pos = team.layout[id]
      dragging.current = { id, x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
    } else {
      dragging.current = { id: null, x: e.clientX, y: e.clientY, px: s.pan.x, py: s.pan.y }
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    if (wireRef.current) {
      const rect = container.current!.getBoundingClientRect(),
        current = store.getState(),
        x = (e.clientX - rect.left - current.pan.x) / current.zoom,
        y = (e.clientY - rect.top - current.pan.y) / current.zoom,
        previous = wireRef.current,
        hit = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>('[data-input-node]')
      setConnection({
        ...previous,
        x,
        y,
        moved: previous.moved || Math.hypot(x - previous.x, y - previous.y) > 3,
        target:
          hit && container.current!.contains(hit)
            ? hit.dataset.inputNode! + ':' + hit.dataset.inputPort!
            : null,
      })
      return
    }
    const d = dragging.current
    if (!d) return
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y
    if (d.id) s.moveNode(d.id, d.px + dx / s.zoom, d.py + dy / s.zoom)
    else s.setViewport(s.zoom, { x: d.px + dx, y: d.py + dy })
  }
  const end = (e: PointerEvent) => {
    const connection = wireRef.current
    if (connection) {
      const hit = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>('[data-input-node]')
      if (connection.moved) {
        if (hit && container.current!.contains(hit))
          store
            .getState()
            .connect(connection.source, hit.dataset.inputNode!, hit.dataset.inputPort!)
        resetConnection()
      } else {
        setConnection(null)
        store.getState().setLinkFrom(connection.source)
      }
    }
    dragging.current = null
  }
  const inputY = (id: string, port: string) => {
    const n = team.graph.nodes.find((n) => n.id === id)!
    const ix = n.ports.filter((p) => p.direction === 'input').findIndex((p) => p.id === port)
    return team.layout[id].y + 85 + Math.max(0, ix) * 22
  }
  return (
    <section
      ref={container}
      className={styles.canvas}
      aria-label={t('canvas')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => {
        dragging.current = null
        resetConnection()
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') {
          dragging.current = null
          resetConnection()
        }
      }}
    >
      <svg className={styles.grid} width="100%" height="100%" aria-hidden="true">
        <defs>
          <pattern id="m2-dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="var(--border-strong)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#m2-dots)" />
      </svg>
      <button
        type="button"
        className={styles.panSurface}
        aria-label={t('pan')}
        onPointerDown={(e) => start(e, null)}
        onKeyDown={(e) => {
          const delta = (
            {
              ArrowLeft: [30, 0],
              ArrowRight: [-30, 0],
              ArrowUp: [0, 30],
              ArrowDown: [0, -30],
            } as Record<string, number[]>
          )[e.key]
          if (delta) {
            e.preventDefault()
            s.setViewport(s.zoom, { x: s.pan.x + delta[0], y: s.pan.y + delta[1] })
          }
        }}
      />
      <div
        className={styles.world}
        style={{ transform: `translate(${s.pan.x}px,${s.pan.y}px) scale(${s.zoom})` }}
      >
        <svg className={styles.edges} width="2200" height="1300" aria-hidden="true">
          {team.graph.dataEdges.map((edge) => {
            const from = team.layout[edge.from.nodeId],
              to = team.layout[edge.to.nodeId]
            if (!from || !to) return null
            const x = from.x + 230,
              y = from.y + 85,
              ty = inputY(edge.to.nodeId, edge.to.portId)
            return (
              <g key={edge.id}>
                <path
                  className={styles.edge}
                  d={`M${x} ${y} C${x + 70} ${y},${to.x - 70} ${ty},${to.x} ${ty}`}
                />
                <circle cx={to.x - 5} cy={ty} r="3" fill="var(--accent)" />
              </g>
            )
          })}
        </svg>
        {team.graph.nodes.map((node) => {
          const label = team.labels[node.id],
            pos = team.layout[node.id],
            status = team.run?.result.snapshot.plan.graph.nodes.some((n) => n.id === node.id)
              ? (projection.nodes[node.id] ?? 'queued')
              : null
          return (
            <article
              key={node.id}
              className={`${styles.node} ${s.selectedNode === node.id ? styles.nodeSelected : ''}`}
              style={{ left: pos.x, top: pos.y }}
              aria-label={`${t('selected')}: ${label.label}`}
              data-node-id={node.id}
            >
              <button
                type="button"
                className={styles.nodeHead}
                aria-label={`${t('move')}: ${label.label}`}
                onPointerDown={(e) => start(e, node.id)}
                onClick={() => s.selectNode(node.id)}
                onKeyDown={(e) => {
                  const delta = (
                    {
                      ArrowLeft: [-20, 0],
                      ArrowRight: [20, 0],
                      ArrowUp: [0, -20],
                      ArrowDown: [0, 20],
                    } as Record<string, number[]>
                  )[e.key]
                  if (delta) {
                    e.preventDefault()
                    s.moveNode(node.id, pos.x + delta[0], pos.y + delta[1])
                  }
                }}
              >
                <span
                  className={`${styles.nodeIcon} ${label.kind === 'manager' ? styles.manager : label.kind === 'worker' ? styles.worker : styles.reviewer}`}
                >
                  {label.kind === 'manager' ? 'G' : label.kind === 'worker' ? 'D' : '✓'}
                </span>
                <span>
                  <strong>{label.label}</strong>
                  <small>{node.role}</small>
                </span>
                <span className={styles.grip}>⋮⋮</span>
              </button>
              <div className={styles.nodeContent}>
                <span className={styles.muted}>{t('fake')}</span>
                <span className={styles.nodeStatus} data-status={status ?? 'draft'}>
                  {status ? t(status === 'waiting-approval' ? 'await' : status) : t('draft')}
                </span>
              </div>
              <footer className={styles.nodeFoot}>{t('capability')}</footer>
              {node.ports
                .filter((p) => p.direction === 'input')
                .map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`${styles.port} ${styles.portIn}`}
                    style={{ top: 75 + i * 22 }}
                    aria-label={`${t('input')}: ${label.label} ${p.id}`}
                    title={`${t('input')}: ${p.id}`}
                    data-input-node={node.id}
                    data-input-port={p.id}
                    data-drop-target={wire?.target === node.id + ':' + p.id}
                    onClick={() => {
                      if (picked) {
                        s.connect(picked, node.id, p.id)
                        s.setLinkFrom(null)
                      } else s.selectNode(node.id)
                    }}
                  />
                ))}
              <button
                type="button"
                className={`${styles.port} ${styles.portOut} ${picked === node.id ? styles.portPicked : ''}`}
                aria-label={`${t('output')}: ${label.label}`}
                title={t('connectionHint')}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  event.stopPropagation()
                  event.currentTarget.focus()
                  dragging.current = null
                  s.setLinkFrom(node.id)
                  setConnection({
                    source: node.id,
                    x: pos.x + 230,
                    y: pos.y + 85,
                    moved: false,
                    target: null,
                  })
                  container.current?.setPointerCapture(event.pointerId)
                }}
                onClick={() => s.setLinkFrom(node.id)}
              />
            </article>
          )
        })}
        {wire && team.layout[wire.source] && (
          <svg className={styles.draftOverlay} width="2200" height="1300" aria-hidden="true">
            <path
              data-testid="connection-draft"
              className={styles.draftEdge}
              d={`M${team.layout[wire.source].x + 230} ${team.layout[wire.source].y + 85} C${team.layout[wire.source].x + 300} ${team.layout[wire.source].y + 85},${wire.x - 70} ${wire.y},${wire.x} ${wire.y}`}
            />
          </svg>
        )}
      </div>
      <div className={styles.canvasHelp}>{t('connectionHint')}</div>
      <div className={styles.zoomControls}>
        <button
          type="button"
          aria-label={t('zoomOut')}
          onClick={() => s.setViewport(s.zoom - 0.1, s.pan)}
        >
          −
        </button>
        <span>{Math.round(s.zoom * 100)}%</span>
        <button
          type="button"
          aria-label={t('zoomIn')}
          onClick={() => s.setViewport(s.zoom + 0.1, s.pan)}
        >
          +
        </button>
        <button type="button" onClick={fit}>
          {t('fit')}
        </button>
      </div>
    </section>
  )
}
