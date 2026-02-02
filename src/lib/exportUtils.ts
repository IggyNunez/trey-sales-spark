/**
 * Utility functions for exporting table data to CSV
 */

/**
 * Convert data to CSV format and trigger download
 */
export function exportToCSV<T extends object>(
  data: T[],
  columns: { key: keyof T | string; label: string; format?: (value: unknown, row: T) => string }[],
  filename: string
): void {
  if (data.length === 0) {
    return;
  }

  // Build header row
  const headers = columns.map(col => `"${col.label}"`).join(',');

  // Build data rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value: unknown;
      
      // Handle nested keys like "source.name"
      const keyStr = String(col.key);
      if (keyStr.includes('.')) {
        const parts = keyStr.split('.');
        value = parts.reduce((obj: unknown, key) => {
          return obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;
        }, row);
      } else {
        value = row[col.key as keyof T];
      }

      // Apply custom formatter if provided
      if (col.format) {
        value = col.format(value, row);
      }

      // Handle different types
      if (value === null || value === undefined) {
        return '""';
      }
      if (typeof value === 'string') {
        // Escape double quotes and wrap in quotes
        return `"${value.replace(/"/g, '""')}"`;
      }
      if (typeof value === 'number') {
        return String(value);
      }
      if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
      }
      if (value instanceof Date) {
        return `"${value.toISOString()}"`;
      }
      // For objects/arrays, stringify
      return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
    }).join(',');
  });

  // Combine header and rows
  const csv = [headers, ...rows].join('\n');

  // Create blob and download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format a date string for CSV export
 */
export function formatDateForExport(dateString: string | null | undefined): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/New_York',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format currency for CSV export
 */
export function formatCurrencyForExport(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value.toFixed(2);
}

/**
 * Format percentage for CSV export
 */
export function formatPercentForExport(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return `${value.toFixed(1)}%`;
}
