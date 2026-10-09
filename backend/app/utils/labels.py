"""One shared constant per Performance label, so the summary cards, table
headers and exports can never drift apart (the frontend mirrors these in
frontend/src/constants/performanceLabels.ts).

Tasks are COMPLETED, registers are CHECKED, so the two have separate label
sets. Every label is Title Case."""

# Task labels
LABEL_ON_TIME_COMPLETE = 'On Time Complete'
LABEL_COMPLETED_AFTER_DUE = 'Completed After Due Date'
LABEL_NOT_COMPLETED = 'Not Completed'

# Register labels
LABEL_ON_TIME_CHECKED = 'On Time Checked'
LABEL_CHECKED_AFTER_DUE = 'Checked After Due Date'
LABEL_NOT_CHECKED = 'Not Checked'
LABEL_TOTAL_REQUIRED_DUE = 'Total Required Due'

# Shared by tasks and registers
LABEL_DELAYED = 'Delayed'
LABEL_PENDING = 'Pending'
LABEL_IN_PROGRESS = 'In Progress'
LABEL_ESCALATED = 'Escalated'
