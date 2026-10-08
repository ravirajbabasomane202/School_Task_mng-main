"""One shared constant per Performance label, so the summary cards, table
headers and exports can never drift apart (the frontend mirrors these in
frontend/src/constants/performanceLabels.ts)."""
LABEL_ON_TIME_CHECKED = 'On Time Checked'
LABEL_CHECKED_AFTER_DUE = 'Checked After Due Date'
LABEL_NOT_CHECKED = 'Not Checked'
LABEL_DELAYED = 'Delayed'
LABEL_PENDING = 'Pending'
LABEL_IN_PROGRESS = 'In Progress'
LABEL_ESCALATED = 'Escalated'
