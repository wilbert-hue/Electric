'use client'

import { useEffect, useState } from 'react'

type FrameworkData = Record<string, (string | number)[][]>

let frameworkCache: Promise<FrameworkData> | null = null

function loadFrameworkData(): Promise<FrameworkData> {
  if (!frameworkCache) {
    frameworkCache = fetch('/data/customer-intelligence-framework.json').then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load framework (${res.status})`)
      return res.json() as Promise<FrameworkData>
    })
  }
  return frameworkCache
}

const TITLE_ROW = 0
const GROUP_HEADER_ROW = 4
const COLUMN_HEADER_ROW = 5
const DATA_START_ROW = 6

function normalizeCell(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number') return String(v)
  return String(v).trim()
}

/** Build merged header cells: non-empty cell absorbs following blanks (Excel merge). */
function buildMergedGroupHeaders(cells: (string | number)[]): { text: string; colspan: number }[] {
  const strs = cells.map((c) => normalizeCell(c))
  const out: { text: string; colspan: number }[] = []
  let i = 0
  while (i < strs.length) {
    if (!strs[i]) {
      i++
      continue
    }
    let span = 1
    for (let j = i + 1; j < strs.length && !strs[j]; j++) {
      span++
    }
    out.push({ text: strs[i], colspan: span })
    i += span
  }
  return out
}

function padRow(row: (string | number)[], len: number): string[] {
  const r = row.map((c) => normalizeCell(c))
  while (r.length < len) r.push('')
  return r.slice(0, len)
}

interface CustomerPropositionTableProps {
  sheetKey: string
  /** Short label for the card heading */
  label: string
}

export function CustomerPropositionTable({ sheetKey, label }: CustomerPropositionTableProps) {
  const [framework, setFramework] = useState<FrameworkData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const json = await loadFrameworkData()
        if (!cancelled) setFramework(json)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load customer intelligence data')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
      </div>
    )
  }

  if (!framework) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
        Loading {label}…
      </div>
    )
  }

  const rows = framework[sheetKey]
  if (!rows || rows.length < DATA_START_ROW) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        No table data for {label}.
      </div>
    )
  }

  const title = normalizeCell(rows[TITLE_ROW]?.[0] || label)
  const groupRow = rows[GROUP_HEADER_ROW] || []
  const headerRow = rows[COLUMN_HEADER_ROW] || []
  const colCount = Math.max(
    groupRow.length,
    headerRow.length,
    ...rows.slice(DATA_START_ROW).map((r) => r.length)
  )
  const merged = buildMergedGroupHeaders(groupRow)
  const headers = padRow(headerRow, colCount)
  const bodyRows = rows.slice(DATA_START_ROW).map((r) => padRow(r, colCount))

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-200 bg-slate-50 px-4 py-2">
        <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs text-black">
          <caption className="border-b border-gray-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800">
            {title}
          </caption>
          <thead>
            <tr className="bg-[#2d6a4f] text-white">
              {merged.map((cell, idx) => (
                <th
                  key={`g-${idx}`}
                  colSpan={cell.colspan}
                  className="border border-white/30 px-2 py-2 font-semibold text-center align-middle"
                >
                  {cell.text}
                </th>
              ))}
            </tr>
            <tr className="bg-[#40916c] text-white">
              {headers.map((h, idx) => (
                <th
                  key={`h-${idx}`}
                  className="border border-white/30 px-2 py-2 font-medium align-top"
                  style={{ minWidth: h.length > 40 ? '12rem' : '7rem' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, ri) => (
              <tr
                key={ri}
                className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="border border-gray-200 px-2 py-1.5 align-top text-black"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
