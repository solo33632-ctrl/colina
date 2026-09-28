import type { ReactNode } from 'react';

// One table description per list: which column to render, what its header
// says, and how the cell is laid out. The row shape is opaque to the table, so
// every content type shares the same markup and only passes its own columns.
export type AdminTableColumn<Row> = {
  key: string;
  header: string;
  /** Applied to both the header cell and the body cells. */
  className?: string;
  render: (row: Row) => ReactNode;
};

export type AdminTableProps<Row> = {
  /** Accessible name for the table; the page passes its own heading. */
  label: string;
  columns: AdminTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
};

// Table-style list used by every content list in the admin. Narrow screens
// keep the first and last columns and drop the secondary one, so the list
// stays readable at 390px without a horizontal scrollbar.
export function AdminTable<Row>({
  label,
  columns,
  rows,
  rowKey,
}: AdminTableProps<Row>) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
      <table aria-label={label} className="w-full text-start text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={['px-4 py-3 font-semibold', column.className ?? '']
                  .filter(Boolean)
                  .join(' ')}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={['px-4 py-2 align-middle', column.className ?? '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
