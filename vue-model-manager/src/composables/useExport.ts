import { useToast } from './useToast';

export function useExport() {
  const { success: toastSuccess, error: toastError } = useToast();

  function exportJSON(data: unknown, filename: string) {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess(`Exported ${filename}.json`);
    } catch {
      toastError('Export failed');
    }
  }

  function exportCSV(headers: string[], rows: string[][], filename: string) {
    try {
      const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess(`Exported ${filename}.csv`);
    } catch {
      toastError('Export failed');
    }
  }

  return { exportJSON, exportCSV };
}
