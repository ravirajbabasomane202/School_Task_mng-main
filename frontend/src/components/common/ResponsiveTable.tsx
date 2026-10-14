import type { ReactNode } from 'react';

interface ResponsiveTableProps {
  children: ReactNode;
  className?: string;
  /** Minimum table width in px so columns never collapse; the wrapper scrolls sideways below it. */
  minWidth?: number;
}

/**
 * Wraps a <table> so it scrolls horizontally inside its own container
 * instead of widening the page.
 *   <ResponsiveTable minWidth={720}><table>…</table></ResponsiveTable>
 */
function ResponsiveTable({ children, className = '', minWidth = 640 }: ResponsiveTableProps) {
  return (
    <div
      className={['w-full max-w-full overflow-x-auto rounded-[inherit] [-webkit-overflow-scrolling:touch]', className].join(' ')}
      data-testid="responsive-table"
    >
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

export default ResponsiveTable;
