import type { ReactNode } from 'react';
import { colors } from '../tokens';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}

/** Shared DataTable — per V1 dev notes: apps pass their own column config; sort/hover/pagination logic lives here. Pagination/sort to be added when a real dataset needs it. */
export function DataTable<T>({ columns, data, rowKey, onRowClick }: DataTableProps<T>) {
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
            {columns.map((c) => (
              <th
                key={c.key}
                className="font-mono-label"
                style={{
                  textAlign: c.align ?? 'left',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  color: colors.textMuted,
                  padding: '12px 18px',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              className="dt-row"
              onClick={() => onRowClick?.(row)}
              style={{ cursor: onRowClick ? 'pointer' : 'default' }}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{
                    textAlign: c.align ?? 'left',
                    fontSize: 13,
                    color: colors.textSecondary,
                    padding: '14px 18px',
                    borderBottom: '1px solid rgba(255,255,255,0.045)',
                  }}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
