/**
 * AnalyticsRouter — picks the correct role-specific analytics page
 * based on the authenticated user's role. Falls back to the generic
 * DeptAnalytics component for roles that don't have a dedicated page.
 */
import React, { lazy, Suspense } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';
import DeptAnalytics from '../DeptAnalytics';

const ITAnalytics       = lazy(() => import('./ITAnalytics'));
const HRAnalytics       = lazy(() => import('./HRAnalytics'));
const AdmissionAnalytics = lazy(() => import('./AdmissionAnalytics'));
const TransportAnalytics = lazy(() => import('./TransportAnalytics'));
const PropertyAnalytics  = lazy(() => import('./PropertyAnalytics'));

const Spinner = () => (
  <div className="flex h-64 items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
  </div>
);

const AnalyticsRouter: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);

  const Page = (() => {
    switch (user?.role) {
      case 'IT':        return ITAnalytics;
      case 'HR':        return HRAnalytics;
      case 'ADMISSION': return AdmissionAnalytics;
      case 'TRANSPORT': return TransportAnalytics;
      case 'PROPERTY':  return PropertyAnalytics;
      default:          return null;
    }
  })();

  if (Page === null) {
    // FINANCE, ADMIN, PRINCIPAL, PURCHASE — use generic analytics
    return <DeptAnalytics />;
  }

  return (
    <Suspense fallback={<Spinner />}>
      <Page />
    </Suspense>
  );
};

export default AnalyticsRouter;
