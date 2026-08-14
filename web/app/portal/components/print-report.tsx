"use client";

/**
 * "Download PDF" for reports that are composed in the browser.
 *
 * The financial reports each have a server endpoint that renders a PDF, and
 * that is the better route when one exists: it produces the same file whoever
 * asks. But some reports -- project progress, for one -- are assembled client
 * side from half a dozen datasets with no single endpoint behind them.
 * Reimplementing that aggregation on the server to print it would be a second
 * copy of the logic, free to disagree with the screen.
 *
 * So those print. The browser's own "Save as PDF" produces a real PDF, and the
 * print stylesheet in globals.css strips the portal chrome so the output is the
 * report rather than a screenshot of the app.
 */

export function PrintReportButton({
  label = 'Download PDF',
  documentTitle,
}: {
  label?: string;
  /**
   * Becomes the suggested filename, since browsers use document.title for it.
   * Restored afterwards so the tab is not left renamed.
   */
  documentTitle?: string;
}) {
  function onPrint() {
    const previousTitle = document.title;
    if (documentTitle) document.title = documentTitle;

    // Restore on the next tick rather than immediately: print() blocks in some
    // browsers and returns instantly in others, and the dialog reads the title
    // when it opens.
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);

    window.print();
    // Fallback for browsers that never fire afterprint.
    window.setTimeout(restore, 1000);
  }

  return (
    <button type="button" className="portal-inline-btn no-print" onClick={onPrint}>
      {label}
    </button>
  );
}
