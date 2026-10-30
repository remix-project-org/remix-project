import React, { useState } from 'react'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { TraceCrossChainCall, TraceLeg, TraceLegRole, TransactionTraceResult } from '../types'

const TRACE_LEG_LABELS: Record<TraceLegRole, string> = {
  origin: 'Transaction',
  'batch-post': 'L1 batch post',
  delivery: 'L2 delivery',
  'table-load': 'L2 execution table load',
  'l1-execution': 'L1 execution (batch post)'
}

const STATUS_COLORS = { ok: 'var(--bs-success)', failed: 'var(--bs-danger)', unknown: 'var(--bs-secondary)' }

export function shorten(address: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function statusColor(success: boolean | null) {
  return success === null ? STATUS_COLORS.unknown : success ? STATUS_COLORS.ok : STATUS_COLORS.failed
}

function describeCallExecution(call: TraceCrossChainCall) {
  if (call.status === 'delivered') return 'Delivered'
  if (call.status === 'prepared') return call.executionTxHash ? 'Ran from the execution table' : 'Result from the execution table; execution not observed'
  return 'Not visible in receipts; it needs a call trace'
}

function Hash({ value }: { value: string }) {
  return (
    <span className="d-inline-flex align-items-center" style={{ fontFamily: 'Monaco, monospace' }}>
      {shorten(value)}
      <CopyToClipboard tip="Copy" icon="fa-copy" direction="top" getContent={() => value}>
        <i className="fa-solid fa-copy ms-1" style={{ fontSize: '10px', cursor: 'pointer', color: 'var(--text-tertiary, #a2a3bd)' }}></i>
      </CopyToClipboard>
    </span>
  )
}

function Metric({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <span className="d-inline-flex align-items-center" title={title}>
      <i className={`fas ${icon} me-1`} style={{ fontSize: '9px' }}></i>{children}
    </span>
  )
}

function NetworkChip({ label }: { label: string }) {
  return <span className="badge text-info" style={{ backgroundColor: '#64C4FF14', fontSize: '10px', fontWeight: 600 }}>{label}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="text-secondary">{label}</div>
      <div className="text-break" style={{ minWidth: 0 }}>{children}</div>
    </>
  )
}

function Section({ title, count, summary, defaultOpen, dataId, children }: { title: string; count?: number; summary?: React.ReactNode; defaultOpen: boolean; dataId: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-2 rounded" data-id={dataId} style={{ backgroundColor: 'var(--custom-onsurface-layer-4)' }}>
      <div className="d-flex align-items-center p-2" role="button" onClick={() => setOpen(!open)} style={{ cursor: 'pointer', fontSize: '12px' }}>
        <i className={`fas fa-chevron-${open ? 'down' : 'right'} me-2`} style={{ fontSize: '9px', width: '9px' }}></i>
        <span style={{ fontWeight: 700 }}>{title}</span>
        {count !== undefined && <span className="badge bg-secondary ms-2" style={{ fontSize: '9px' }}>{count}</span>}
        {summary && <span className="ms-auto" style={{ fontSize: '10px' }}>{summary}</span>}
      </div>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  )
}

function CallCard({ call, index, pending }: { call: TraceCrossChainCall; index: number; pending: boolean }) {
  const [open, setOpen] = useState(false)
  const chevron = <i className={`fas fa-chevron-${open ? 'up' : 'down'} ms-2 text-secondary`} style={{ fontSize: '9px' }}></i>
  return (
    <div
      className="mt-1 rounded"
      data-id={`eezTraceCall-${index}`}
      style={{ marginLeft: `${call.depth * 10}px`, borderLeft: `3px solid ${statusColor(call.success)}`, backgroundColor: 'var(--custom-onsurface-layer-2)', fontSize: '11px' }}
    >
      <div className="p-2" role="button" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        {call.functionLabel && (
          <div className="d-flex align-items-center mb-1">
            {call.depth > 0 && <span className="text-secondary me-1">↳</span>}
            <span className="text-truncate flex-grow-1" style={{ fontFamily: 'Monaco, monospace', fontWeight: 600 }} title={call.functionLabel}>{call.functionLabel}</span>
            {chevron}
          </div>
        )}
        <div className="d-flex align-items-center flex-wrap" style={{ gap: '4px' }}>
          {!call.functionLabel && call.depth > 0 && <span className="text-secondary">↳</span>}
          <NetworkChip label={call.sourceNetworkLabel} />
          <span className="text-secondary">→</span>
          <NetworkChip label={call.targetNetworkLabel} />
          {call.depth > 0 && <span className="text-secondary">callback</span>}
          {call.isStatic && <span className="text-secondary">read</span>}
          <span className="ms-auto" style={{ color: statusColor(call.success), fontWeight: 600 }}>
            {call.success === null ? (pending ? 'pending' : 'unknown') : call.success ? 'succeeded' : 'failed'}
          </span>
          {!call.functionLabel && chevron}
        </div>
      </div>
      {open && (
        <div className="px-2 pb-2" style={{ display: 'grid', gridTemplateColumns: '58px minmax(0, 1fr)', rowGap: '3px', columnGap: '6px' }}>
          {call.functionLabel && <Field label="Call"><span style={{ fontFamily: 'Monaco, monospace' }}>{call.functionLabel}</span></Field>}
          <Field label="From"><Hash value={call.sourceAddress} /></Field>
          <Field label="To">{call.targetAddress ? <Hash value={call.targetAddress} /> : 'unknown'}</Field>
          {call.proxyAddress && <Field label="Proxy"><Hash value={call.proxyAddress} /></Field>}
          {call.value !== '0' && <Field label="Value">{call.value} wei</Field>}
          {call.resultLabel && <Field label="Result"><span style={{ fontFamily: 'Monaco, monospace' }}>{call.resultLabel}</span></Field>}
          <Field label="Execution">{describeCallExecution(call)}</Field>
          {call.executionTxHash && <Field label="Run in"><Hash value={call.executionTxHash} /></Field>}
          <Field label="Call hash"><Hash value={call.hash} /></Field>
        </div>
      )}
    </div>
  )
}

function TimelineStep({ dot, last, children, dataId }: { dot: React.ReactNode; last: boolean; children: React.ReactNode; dataId?: string }) {
  return (
    <div className="d-flex" data-id={dataId} style={{ fontSize: '11px' }}>
      <div className="d-flex flex-column align-items-center me-2" style={{ width: '12px' }}>
        <div className="d-flex align-items-center justify-content-center" style={{ height: '16px' }}>{dot}</div>
        {!last && <div className="flex-grow-1" style={{ width: '2px', backgroundColor: 'var(--bs-border-color)' }}></div>}
      </div>
      <div className="flex-grow-1 pb-2" style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
}

function Dot({ color }: { color: string }) {
  return <span className="rounded-circle d-inline-block" style={{ width: '10px', height: '10px', backgroundColor: color }}></span>
}

function LegStep({ leg, last }: { leg: TraceLeg; last: boolean }) {
  return (
    <TimelineStep dot={<Dot color={statusColor(leg.success)} />} last={last} dataId={`eezTraceLeg-${leg.role}`}>
      <div className="d-flex align-items-center" style={{ gap: '4px', minHeight: '16px' }}>
        <span className="text-truncate" style={{ fontWeight: 600 }}>{TRACE_LEG_LABELS[leg.role]}</span>
        <span className="ms-auto"><NetworkChip label={leg.networkLabel} /></span>
      </div>
      <div className="d-flex flex-wrap text-secondary" style={{ columnGap: '8px' }}>
        <Hash value={leg.txHash} />
        {leg.blockNumber !== null && <Metric icon="fa-cube" title="Block">{leg.blockNumber}</Metric>}
        {leg.gasUsed !== null && <Metric icon="fa-gas-pump" title="Gas used">{Number(leg.gasUsed).toLocaleString()}</Metric>}
      </div>
      {(leg.decodedError || leg.error) && <div className="text-danger text-break">{leg.decodedError || leg.error}</div>}
    </TimelineStep>
  )
}

function linkStatus(result: TransactionTraceResult): { icon: React.ReactNode; text: string } {
  if (result.linked) return { icon: <i className="fas fa-link text-success"></i>, text: 'Linked by the composer' }
  if (result.pendingRoles.length > 0) {
    return result.pendingTimedOut
      ? { icon: <i className="fas fa-clock text-warning"></i>, text: 'Not linked yet. Stopped waiting; trace again to check' }
      : { icon: <i className="fas fa-spinner fa-spin"></i>, text: 'Waiting for the composer to link related transactions' }
  }
  if (result.composer) return { icon: <i className="fas fa-unlink text-secondary"></i>, text: 'The composer did not link related transactions' }
  return { icon: <i className="fas fa-info-circle text-secondary"></i>, text: 'No cross-chain record. Deliveries, table loads and batch posts have none; trace the transaction that started the flow' }
}

export function EezTraceResult({ result, themeQuality }: { result: TransactionTraceResult; themeQuality: string }) {
  const color = themeQuality === 'dark' ? 'white' : 'black'
  const origin = result.legs.find((leg) => leg.role === 'origin')
  const chains = [...new Set(result.legs.map((leg) => leg.networkLabel))]
  const link = linkStatus(result)
  const steps = result.legs.length + result.pendingRoles.length

  return (
    <div className="mt-2" data-id="eezTraceResult" style={{ color }}>
      <div className="mb-2 p-2 rounded" data-id="eezTraceSummary" style={{ backgroundColor: 'var(--custom-onsurface-layer-4)', borderLeft: `3px solid ${result.success ? STATUS_COLORS.ok : STATUS_COLORS.failed}`, fontSize: '11px' }}>
        <div className="d-flex align-items-center" style={{ gap: '6px' }}>
          <span style={{ fontWeight: 700, fontSize: '12px', color: result.success ? STATUS_COLORS.ok : STATUS_COLORS.failed }}>
            {result.success ? '✓ Succeeded' : '✗ Reverted'}
          </span>
          <span className="ms-auto d-flex flex-wrap justify-content-end" style={{ gap: '4px' }}>
            {chains.map((chain) => <NetworkChip key={chain} label={chain} />)}
          </span>
        </div>
        {!result.success && (result.decodedError || result.error) && <div className="text-danger text-break mt-1">{result.decodedError || result.error}</div>}
        <div className="mt-1 text-secondary d-flex flex-wrap" style={{ columnGap: '8px' }}>
          <Hash value={result.txHash} />
          {origin?.blockNumber != null && <Metric icon="fa-cube" title="Block">{origin.blockNumber}</Metric>}
        </div>
        <div className="mt-1 d-flex align-items-start" style={{ gap: '6px' }}>
          <span style={{ width: '12px' }}>{link.icon}</span>
          <span className="text-secondary">{link.text}</span>
        </div>
        {result.correlationError ? (
          <div className="mt-1 text-danger text-break">Settlement lookup failed: {result.correlationError}</div>
        ) : result.isL2Origin && result.linked && (
          <div className="mt-1 d-flex align-items-start" style={{ gap: '6px' }}>
            <span style={{ width: '12px' }}><i className={`fas fa-flag-checkered ${result.settlement ? 'text-success' : 'text-secondary'}`}></i></span>
            <span className="text-secondary">
              {result.settlement
                ? `Settled on L1 in block #${result.settlement.l1BlockNumber}${result.settlement.l2Finalized ? ' (finalized)' : ''}`
                : 'Not settled on L1 yet; trace again later'}
            </span>
          </div>
        )}
      </div>

      {result.calls.length > 0 && (
        <Section title="Cross-chain calls" count={result.calls.length} defaultOpen dataId="eezTraceCalls">
          {result.calls.map((call, i) => <CallCard key={`${call.hash}-${i}`} call={call} index={i} pending={result.pendingRoles.length > 0 && !result.pendingTimedOut} />)}
        </Section>
      )}

      <Section title="Transactions" count={result.legs.length} defaultOpen dataId="eezTraceLegs">
        {result.legs.map((leg, i) => <LegStep key={`${leg.networkLabel}:${leg.txHash}`} leg={leg} last={i === steps - 1} />)}
        {result.pendingRoles.map((role, i) => (
          <TimelineStep
            key={role}
            dataId={`eezTracePendingLeg-${role}`}
            last={result.legs.length + i === steps - 1}
            dot={result.pendingTimedOut ? <i className="fas fa-clock text-secondary" style={{ fontSize: '10px' }}></i> : <i className="fas fa-spinner fa-spin text-secondary" style={{ fontSize: '10px' }}></i>}
          >
            <div className="text-secondary" style={{ minHeight: '16px' }}>
              <span style={{ fontWeight: 600 }}>{TRACE_LEG_LABELS[role]}{role === 'delivery' ? 's' : ''}</span> · pending
            </div>
          </TimelineStep>
        ))}
      </Section>

      {result.tokenTransfers.length > 0 && (
        <Section title="Token transfers" count={result.tokenTransfers.length} defaultOpen={false} dataId="eezTraceTokenTransfers">
          <div className="text-secondary mb-1" style={{ fontSize: '10px' }}>Amounts from ERC20 Transfer events, not net balance changes.</div>
          {result.tokenTransfers.map((t, i) => (
            <div key={`${t.txHash}-${i}`} className="mt-1 p-2 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', fontSize: '11px' }}>
              <div className="d-flex align-items-center" style={{ gap: '4px' }}>
                <span style={{ fontWeight: 600 }}>{t.kind === 'mint' ? 'Mint' : t.kind === 'burn' ? 'Burn' : 'Transfer'}</span>
                <span className="text-truncate">{t.amount} {t.symbol || shorten(t.token)}</span>
                <span className="ms-auto"><NetworkChip label={t.networkLabel} /></span>
              </div>
              <div className="text-secondary d-flex flex-wrap" style={{ columnGap: '4px' }}>
                {t.kind !== 'mint' && <Hash value={t.from} />}
                {t.kind === 'transfer' && <span>→</span>}
                {t.kind !== 'burn' && <Hash value={t.to} />}
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}
