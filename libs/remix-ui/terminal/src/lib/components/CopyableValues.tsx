import React from 'react'
import { CopyToClipboard } from '@remix-ui/clipboard'

export interface CopyableValueRow {
  label: string
  value: string
  labelColor?: string
  copyable?: boolean
}

export interface CopyableValuesData {
  rows: CopyableValueRow[]
}

export const showCopyableValues = (data: CopyableValuesData) => {
  return (
    <div className="mt-2 mb-3" style={{ fontFamily: 'monospace' }}>
      <table className="table table-sm" style={{ marginBottom: 0 }}>
        <tbody>
          {data.rows.map((row, index) => (
            <tr className="remix_ui_terminal_tr" key={index}>
              <td
                className="remix_ui_terminal_td"
                style={{
                  fontWeight: 'bold',
                  color: row.labelColor || 'var(--text-primary)',
                  width: '180px',
                  verticalAlign: 'top',
                  paddingTop: '0.5rem'
                }}
              >
                {row.label}
              </td>
              <td className="remix_ui_terminal_td" style={{ wordBreak: 'break-all' }}>
                {row.value}
                {(row.copyable !== false) && <CopyToClipboard content={row.value} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
