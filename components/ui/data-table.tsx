import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export interface DataTableSelection<T> {
  isSelected: (row: T) => boolean;
  onToggle: (row: T) => void;
  isAllSelected: boolean;
  onToggleAll: () => void;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  renderActions?: (row: T) => ReactNode;
  emptyMessage: string;
  selection?: DataTableSelection<T>;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  renderActions,
  emptyMessage,
  selection,
}: DataTableProps<T>) {
  const columnCount = columns.length + (selection ? 1 : 0) + (renderActions ? 1 : 0);

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {selection && (
                <th className="px-6 py-3 font-medium">
                  <input
                    type="checkbox"
                    checked={selection.isAllSelected}
                    onChange={selection.onToggleAll}
                    aria-label="Select all"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th key={column.key} className="px-6 py-3 font-medium">
                  {column.header}
                </th>
              ))}
              {renderActions && <th className="px-6 py-3 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="border-b last:border-0">
                {selection && (
                  <td className="px-6 py-3">
                    <input
                      type="checkbox"
                      checked={selection.isSelected(row)}
                      onChange={() => selection.onToggle(row)}
                      aria-label={`Select ${getRowKey(row)}`}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.key} className="px-6 py-3">
                    {column.render(row)}
                  </td>
                ))}
                {renderActions && <td className="px-6 py-3">{renderActions(row)}</td>}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-6 py-6 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-4 md:hidden">
        {rows.map((row) => (
          <Card key={getRowKey(row)} className="p-4">
            {selection && (
              <div className="flex items-center pb-2">
                <input
                  type="checkbox"
                  checked={selection.isSelected(row)}
                  onChange={() => selection.onToggle(row)}
                  aria-label={`Select ${getRowKey(row)}`}
                />
              </div>
            )}
            {columns.map((column) => (
              <div key={column.key} className="flex justify-between text-sm py-1">
                <span className="text-muted-foreground">{column.header}</span>
                <span>{column.render(row)}</span>
              </div>
            ))}
            {renderActions && (
              <div className="flex flex-col gap-2 pt-3 mt-2 border-t">{renderActions(row)}</div>
            )}
          </Card>
        ))}
        {rows.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">{emptyMessage}</Card>
        )}
      </div>
    </>
  );
}
