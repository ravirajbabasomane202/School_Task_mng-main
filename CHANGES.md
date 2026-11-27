# Change summary

Run after deploying: `cd backend && flask db upgrade` (3 new migrations, single head `y9z0a1b2c3d4`).
The first migration also fills each existing user's Key Responsibilities from the KRA/JD document by role.
Re-run any time with `flask seed-key-responsibilities` (never overwrites; `--overwrite` to reset).

Backend: models (key_responsibility, academic_event(+history), important_document(+folders, audience)),
routes (key_responsibilities, users, academic_events, important_documents), services/academic_event_alerts.py,
key_responsibility_templates.py, commands.py, 3 migrations, 3 new test files (56 tests).
Frontend: UserTable, UserManagement, keyResponsibilities/*, dashboards (Chairman/Dept/Director),
academicCalendar/* (+PrintableCalendar), AcademicCalendarPage, importantDocuments/*, ImportantDocumentsPage,
index.css (print rules), services/types/endpoints, 5 new test files (33 tests).
