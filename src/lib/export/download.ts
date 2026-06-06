/**
 * lib/export/download.ts
 * Browser download helpers for CSV, XLSX, and PDF (print-to-PDF).
 */

/** Trigger a browser file download with the given content. */
export function downloadBlob(data: ArrayBuffer | string, filename: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the download starts before cleanup
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Download a CSV string as a .csv file (UTF-8 with BOM for Excel compatibility). */
export function downloadCSV(csv: string, filename: string): void {  // eslint-disable-line
  // UTF-8 BOM ensures Excel opens the file with correct encoding on Windows
  const bom = "\uFEFF";
  downloadBlob(bom + csv, filename, "text/csv;charset=utf-8");
}

/** Download a Uint8Array as an .xlsx file. */
export function downloadXLSX(data: Uint8Array, filename: string): void {
  downloadBlob(data.buffer as ArrayBuffer, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

/**
 * Open the HTML körjournal in a new window and trigger the browser print dialog.
 * The user can then use "Save as PDF" from the print dialog.
 */
export function printHTML(html: string): void {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    // Popup blocked — fall back to blob download
    downloadBlob(html, "korjournal.html", "text/html;charset=utf-8");
    return;
  }
  win.document.write(html);
  win.document.close();
  // print() is called by the inline <script> at the bottom of the HTML
}
