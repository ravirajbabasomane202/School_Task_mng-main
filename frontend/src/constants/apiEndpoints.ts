export const API_ENDPOINTS = {
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    me: '/auth/me',
    changePassword: '/auth/change-password'
  },
  users: {
    list: '/users',
    detail: (id: number | string) => `/users/${id}`,
    create: '/users',
    update: (id: number | string) => `/users/${id}`,
    deactivate: (id: number | string) => `/users/${id}/deactivate`
  },
  tasks: {
    list: '/tasks',
    myTasks: '/tasks/my-tasks',
    detail: (id: number | string) => `/tasks/${id}`,
    create: '/tasks',
    update: (id: number | string) => `/tasks/${id}`,
    status: (id: number | string) => `/tasks/${id}/status`,
    history: (id: number | string) => `/tasks/${id}/history`,
    upload: (id: number | string) => `/tasks/${id}/attachment`,
    byDept: (deptId: number | string) => `/tasks/dept/${deptId}`
  },
  reports: {
    daily: '/reports/daily',
    weekly: '/reports/weekly',
    monthly: '/reports/monthly',
    export: '/reports/export',
    performanceExport: '/reports/performance-export',
    history: '/reports/history',
    download: (id: number, format: 'pdf' | 'excel') => `/reports/download/${id}/${format}`
  },
  notifications: {
    list: '/notifications',
    markRead: (id: number | string) => `/notifications/${id}/read`,
    markAllRead: '/notifications/read-all'
  },
  approvals: {
    list: '/approvals',
    detail: (id: number | string) => `/approvals/${id}`,
    create: '/approvals',
    approve: (id: number | string) => `/approvals/${id}/approve`,
    reject: (id: number | string) => `/approvals/${id}/reject`,
    process: (id: number | string) => `/approvals/${id}/process`
  },
  announcements: {
    list: '/announcements',
    create: '/announcements',
    detail: (id: number | string) => `/announcements/${id}`
  },
  dashboard: {
    chairman: '/dashboard/chairman',
    director: '/dashboard/director',
    department: '/dashboard/department',
    metrics: '/dashboard/metrics',
    performance: '/dashboard/performance',
    monthlyComparison: '/dashboard/monthly-comparison'
  }
} as const;

export const SALARY_ENDPOINTS = {
  list: '/salary-increments',
  detail: (id: number | string) => `/salary-increments/${id}`,
  create: '/salary-increments',
  hrApprove: (id: number | string) => `/salary-increments/${id}/hr-approve`,
  financeProcess: (id: number | string) => `/salary-increments/${id}/finance-process`,
} as const;

export const RECRUITMENT_ENDPOINTS = {
  list: '/recruitment',
  detail: (id: number | string) => `/recruitment/${id}`,
  create: '/recruitment',
  applications: (id: number | string) => `/recruitment/${id}/applications`,
} as const;

export const ASSET_ENDPOINTS = {
  list: '/assets',
  stats: '/assets/stats',
  create: '/assets',
  detail: (id: number | string) => `/assets/${id}`,
  delete: (id: number | string) => `/assets/${id}`,
} as const;

export const REGISTER_ENDPOINTS = {
  list: '/registers',
  calendar: '/registers/calendar',
  calendarFor: (id: number | string) => `/registers/${id}/calendar`,
  heads: '/registers/heads',
  create: '/registers',
  detail: (id: number | string) => `/registers/${id}`,
  update: (id: number | string) => `/registers/${id}`,
  delete: (id: number | string) => `/registers/${id}`,
  updateStatus: (id: number | string) => `/registers/${id}/status`,
  /** Edit ONE occurrence only — never affects any other date's occurrence. */
  updateOccurrenceStatus: (id: number | string, occurrenceDate: string) =>
    `/registers/${id}/occurrences/${occurrenceDate}/status`,
} as const;

export const PO_ENDPOINTS = {
  list: '/purchase-orders',
  stats: '/purchase-orders/stats',
  create: '/purchase-orders',
  detail: (id: number | string) => `/purchase-orders/${id}`,
  submit: (id: number | string) => `/purchase-orders/${id}/submit`,
  financeProcess: (id: number | string) => `/purchase-orders/${id}/finance-process`,
  markOrdered: (id: number | string) => `/purchase-orders/${id}/mark-ordered`,
} as const;
