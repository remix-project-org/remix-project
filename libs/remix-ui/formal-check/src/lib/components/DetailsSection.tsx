'use strict'
import React, { useState } from 'react'
import type { CheckResult } from '@remix-project/remix-formal-check'

interface DetailsSectionProps {
  result: CheckResult | null
  currentFile: string
}

export function DetailsSection({ result, currentFile }: DetailsSectionProps) {
  const [open, setOpen] = useState(false)

  if (!result) return null

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="mt-3 border rounded p-2 small">
      <summary className="text-muted" style={{ cursor: 'pointer' }}>
        Details
      </summary>
      <table className="table table-sm table-borderless mt-2 mb-0">
        <tbody>
          <tr>
            <th scope="row" className="ps-0 text-muted" style={{ width: 140 }}>Engine</th>
            <td>{result.engineUsed.toUpperCase()}</td>
          </tr>
          <tr>
            <th scope="row" className="ps-0 text-muted">Bounded</th>
            <td>{result.bounded ? 'Yes — not an unbounded proof' : 'No (CHC)'}</td>
          </tr>
          <tr>
            <th scope="row" className="ps-0 text-muted">Target function</th>
            <td><code>{result.targetFunction}</code></td>
          </tr>
          <tr>
            <th scope="row" className="ps-0 text-muted">Assertion</th>
            <td><code style={{ wordBreak: 'break-all' }}>{result.assertion}</code></td>
          </tr>
          <tr>
            <th scope="row" className="ps-0 text-muted">File</th>
            <td>{currentFile}</td>
          </tr>
          {result.unsupportedFeatureWarnings.length > 0 && (
            <tr>
              <th scope="row" className="ps-0 text-muted align-top">Unsupported</th>
              <td>
                <ul className="mb-0 ps-3">
                  {result.unsupportedFeatureWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </details>
  )
}
