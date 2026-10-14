import type { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/** Standard page padding + max width so every screen breathes the same on every device. */
function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className={['mx-auto w-full max-w-[1600px] min-w-0 p-3 xs:p-4 md:p-5 lg:p-6', className].join(' ')}>
      {children}
    </div>
  );
}

export default PageContainer;
