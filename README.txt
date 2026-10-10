Performance totals fix + Delayed column removed from registers.
Copy these files over the same paths in your project, rebuild the frontend and restart the backend.

Totals: the per-role Register Performance table is now summed from the same data as the cards/Activity table/export.
Delayed: removed from every register table, card and export. Unchecked periods whose window has ended are counted in
"Not Checked", so On Time Checked + Checked After Due Date + Not Checked = Total Required Due.
Task "Delayed" is NOT changed.
