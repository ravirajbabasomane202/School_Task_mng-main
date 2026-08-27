"""
Seed the `registers` table from the "Department Wise Registers List" sheet.

WHY THIS SCRIPT (instead of a raw SQL INSERT):
- register_no has a UNIQUE constraint, but the source sheet reuses numbers
  across departments (e.g. 66, 70, 77, 51 each appear more than once).
  This script prefixes each register_no with a short department code
  (e.g. "PRN-66", "TRP-66") so every row stays unique while the original
  number is still visible.
- Checking Cycle values (D/W/M/Q/HY/"15 days") are mapped to the app's
  actual enum: DAILY/WEEKLY/MONTHLY/QUARTERLY/HALF_YEARLY/15_DAYS.
- Priority text ("High"/"Medium"/"Low"/"NA") is mapped to HIGH/MEDIUM/LOW.
- Row 45 ("Cumulative Attendance Register - OLD - 2024-25 - NA") isn't a
  recurring register, it's a historical/archived entry -- it's skipped.
- Row 107 ("Accession Register 1/2/3/4") lists 4 register numbers in one
  cell -- it's expanded into 4 separate register rows.
- head_name is required by the schema but the sheet has no per-row person
  name, only a department heading -- the department name is used as
  head_name, and head_id is left NULL (link it to a real user later if
  needed).
- start_date is set to today; next_due_date is computed from that using
  the same cycle logic the app already uses.
- SAFE TO RE-RUN: it skips any register_no that already exists, so running
  it twice won't create duplicates.

USAGE (on the EC2 box, inside the backend folder with venv active):
    cd ~/School_Task_mng-main/backend
    source venv/bin/activate
    python seed_registers.py
"""

from datetime import date

from app import create_app
from app.extensions import db
from app.models.register import Register, calculate_next_due_date

# Department -> short code used to keep register_no unique across departments
DEPT_CODE = {
    "Principal": "PRN",
    "Admin Head": "ADH",
    "Admin Assistant": "ADA",
    "Accounts": "ACC",
    "Junior Accountant": "JAC",
    "Marketing Executive": "MKT",
    "Transport & Purchase": "TRP",
    "Front Desk / Jr. Clerk": "FDK",
    "Librarian": "LIB",
    "IT Executive": "ITX",
    "Housekeeping & Infirmary": "HKI",
}

CYCLE_MAP = {
    "D": "DAILY",
    "W": "WEEKLY",
    "M": "MONTHLY",
    "Q": "QUARTERLY",
    "HY": "HALF_YEARLY",
    "15 DAYS": "15_DAYS",
    "15 DAY'S": "15_DAYS",
}

PRIORITY_MAP = {
    "HIGH": "HIGH",
    "MEDIUM": "MEDIUM",
    "LOW": "LOW",
}

# (department, sr_no, name, cycle_raw, register_no_raw, priority_raw)
RAW_ROWS = [
    ("Principal", 1, "Principal Personal Register (HOD Register)", "15 days", "66", "High"),
    ("Principal", 2, "ECPTA", "Q", "42", "Medium"),
    ("Principal", 3, "SMC", "HY", "46", "Medium"),
    ("Principal", 4, "POSH", "HY", "45", "Medium"),
    ("Principal", 5, "POCSO", "HY", "41", "Medium"),
    ("Principal", 6, "Discipline Committee", "M", "40", "Medium"),
    ("Principal", 7, "Grievance Redressal Committee", "M", "44", "Medium"),
    ("Principal", 8, "Transport Committee", "HY", "43", "Medium"),
    ("Principal", 9, "Safety Security Committee", "M", "78", "Medium"),
    ("Principal", 10, "Month End Meeting Register", "M", "72", "Medium"),
    ("Principal", 11, "Staff MOM", "M", "73", "Medium"),
    ("Principal", 12, "Cumulative Attendance Register", "D", "51", "High"),
    ("Principal", 13, "Internal Circular", "W", "50", "High"),
    ("Principal", 14, "Shere Book", "M", "79", "Medium"),
    ("Principal", 15, "Grievance Parents Register", "W", "77", "Medium"),
    ("Principal", 16, "Substitution Book", "W", "81", "Medium"),
    ("Principal", 17, "Primary Coordinator", "W", "67", "Medium"),
    ("Principal", 18, "Secondary Coordinator", "W", "68", "Medium"),
    ("Principal", 19, "Primary Coordinator MOM", "W", "71", "Medium"),
    ("Principal", 20, "Secondary Coordinator MOM", "W", "70", "Medium"),
    ("Principal", 21, "Examination (Nursery-II)", "M", "102", "Medium"),
    ("Principal", 22, "Examination (Class III-X)", "M", "103", "Medium"),
    ("Principal", 23, "Remedial Record (Primary)", "M", "108", "Medium"),
    ("Principal", 24, "Remedial Record (Secondary)", "M", "109", "Medium"),
    ("Principal", 25, "Teacher Weekly Planner", "W", "113", "Medium"),
    ("Principal", 26, "Student Attendance Register", "M", "114", "Medium"),
    ("Principal", 27, "Notebook Correction Record", "W", "115", "Medium"),
    ("Principal", 28, "Grade Log Book", "W", "116", "Medium"),
    ("Principal", 29, "External Examination", "15 days", "117", "High"),
    ("Principal", 30, "Event Register", "M", "101", "Medium"),
    ("Principal", 31, "Physics Lab Register", "M", "120", "Medium"),
    ("Principal", 32, "Chemistry Lab Register", "M", "121", "Medium"),
    ("Principal", 33, "Mathematics Lab Register", "M", "122", "Medium"),
    ("Principal", 34, "Biology Lab Register", "M", "123", "Medium"),
    ("Principal", 35, "Composite Science Lab Register", "M", "124", "Medium"),
    ("Principal", 36, "Computer Lab Register", "M", "125", "Medium"),

    ("Admin Head", 37, "HR Register", "15 days", "76", "Medium"),
    ("Admin Head", 38, "Central Register", "W", "0", "Medium"),
    ("Admin Head", 39, "ID Card Register", "W", "19", "Medium"),
    ("Admin Head", 40, "Uniform Register", "M", "32", "Medium"),
    ("Admin Head", 41, "Campus Visit Review Register", "W", "49", "Medium"),
    ("Admin Head", 42, "Visitor Book", "M", "3", "Medium"),
    ("Admin Head", 43, "MOM Register (Admin Staff Weekly Meeting)", "W", "69", "High"),
    ("Admin Head", 44, "Letter Head Issue Register", "W", "9", "Medium"),
    # Row 45 (Cumulative Attendance Register / OLD / 2024-25 / NA) skipped: historical, not recurring.
    ("Admin Head", 46, "Housekeeping & Security Staff Training Register", "M", "48", "Medium"),
    ("Admin Head", 47, "Notice Register Admin Group D", "M", None, "Medium"),
    ("Admin Head", 48, "HOD Register", "15 days", "93", "High"),

    ("Admin Assistant", 49, "GR - PP", "W", "2", "Medium"),
    ("Admin Assistant", 50, "GR - Main", "W", "1", "Medium"),
    ("Admin Assistant", 51, "Outward Register", "W", "4", "Medium"),
    ("Admin Assistant", 52, "HOD Register", "15 days", "99", "High"),
    ("Admin Assistant", 53, "Withdrawal Register", "W", "7", "Medium"),
    ("Admin Assistant", 54, "Staff Appointment Register", "M", "6", "Medium"),
    ("Admin Assistant", 55, "Resignation Register", "M", "5", "Medium"),
    ("Admin Assistant", 56, "Original Document Register (Staff)", "M", "8", "Medium"),
    ("Admin Assistant", 57, "Original Document Return Register (Student)", "M", "14", "Medium"),
    ("Admin Assistant", 58, "HR Outward Register", "M", "112", "Medium"),
    ("Admin Assistant", 59, "Staff Muster", "M", "47", "Medium"),

    ("Accounts", 60, "Salary Details", "M", "24", "High"),
    ("Accounts", 61, "Salary Increment (Teacher)", "HY", "27", "Medium"),
    ("Accounts", 62, "Salary Increment (Admin)", "HY", "28", "Medium"),
    ("Accounts", 63, "Salary Increment (Group-D)", "HY", "29", "Medium"),
    ("Accounts", 64, "Employee Salary Deposit Register", "M", "25", "Medium"),
    ("Accounts", 65, "Salary Slip Issue Register", "M", "23", "Medium"),
    ("Accounts", 66, "Salary Alteration Register", "M", "110", "Medium"),
    ("Accounts", 67, "HOD Register", "15 days", "98", "High"),

    ("Junior Accountant", 68, "Daily Fee Collection Register", "15 days", "32", "Medium"),
    ("Junior Accountant", 69, "Transport Fee Collection Register", "15 days", "111", "Medium"),
    ("Junior Accountant", 70, "Cheque Deposit Register", "15 days", "31", "Medium"),
    ("Junior Accountant", 71, "Petty Cash Register", "M", "22", "Medium"),
    ("Junior Accountant", 72, "Stock Issue Register", "M", "39", "Medium"),
    ("Junior Accountant", 73, "Fee Refund Register", "M", "26", "Medium"),
    ("Junior Accountant", 74, "Petrol Allowance Register", "M", "21", "Medium"),
    ("Junior Accountant", 75, "Leave Application Issue & Collection Register", "M", "30", "Medium"),
    ("Junior Accountant", 76, "HOD Register", "15 day's", "96", "High"),

    ("Marketing Executive", 77, "Admission Enquiry Register (Call Follow-up)", "W", "85", "Medium"),
    ("Marketing Executive", 78, "New Admission Register", "W", "20", "Medium"),
    ("Marketing Executive", 79, "Admission Monthly Index", "M", "74", "Medium"),
    ("Marketing Executive", 80, "Google Ad Register", "M", "55", "Medium"),
    ("Marketing Executive", 81, "HOD Register", "15 Days", "100", "High"),
    ("Marketing Executive", 82, "New Candidate Register", "15 days", "12", "High"),

    ("Transport & Purchase", 83, "Daily Transport Summary", "M", "90", "Medium"),
    ("Transport & Purchase", 84, "Transport Weekly Checklist", "M", "91", "Medium"),
    ("Transport & Purchase", 85, "Transport Compliance Monthly Record", "M", "92", "Medium"),
    ("Transport & Purchase", 86, "Individual Vehicle Record", "M", None, "Medium"),
    ("Transport & Purchase", 87, "Transport Register", "M", "104", "High"),
    ("Transport & Purchase", 88, "Inventory Stock Register", "M", "66", "Medium"),
    ("Transport & Purchase", 89, "Purchase Order Register", "M", "70", "Medium"),
    ("Transport & Purchase", 90, "Requisition Register", "M", "71", "Medium"),
    ("Transport & Purchase", 91, "Asset Equipment Repair & Maintenance Register", "M", "69", "Medium"),
    ("Transport & Purchase", 92, "Dead Stock Register", "M", "80", "Medium"),
    ("Transport & Purchase", 93, "Printing Material Register", "M", "105", "Medium"),
    ("Transport & Purchase", 94, "HOD Register", "15 days", "97", "High"),

    ("Front Desk / Jr. Clerk", 95, "Admission Enquiry Register No. 2", "M", "18", "Medium"),
    ("Front Desk / Jr. Clerk", 96, "Student Half Day Register No. 2", "M", "17", "Medium"),
    ("Front Desk / Jr. Clerk", 97, "Parent/Visitor/Vendor Register", "M", "15", "Medium"),
    ("Front Desk / Jr. Clerk", 98, "Grievance Parents Register", "M", "77", "Medium"),
    ("Front Desk / Jr. Clerk", 99, "Bonafide Register", "M", "13", "Medium"),
    ("Front Desk / Jr. Clerk", 100, "Inward Register", "M", "11", "Medium"),
    ("Front Desk / Jr. Clerk", 101, "Absentee Register", "M", "16", "Medium"),
    ("Front Desk / Jr. Clerk", 102, "Cumulative Attendance Register", "W", "51", "Medium"),
    ("Front Desk / Jr. Clerk", 103, "Staff Movement Register", "M", "10", "Medium"),
    ("Front Desk / Jr. Clerk", 104, "Visitor Report Register", "M", "75", "Medium"),
    ("Front Desk / Jr. Clerk", 105, "Repair & Maintenance Register", "M", "36", "Medium"),
    ("Front Desk / Jr. Clerk", 106, "HOD Register", "15 Days", "94", "High"),

    # Row 107 expanded: original cell listed 4 register numbers (56, 57, 58, 59) for one entry.
    ("Librarian", 107, "Accession Register 1", "M", "56", "Medium"),
    ("Librarian", 107, "Accession Register 2", "M", "57", "Medium"),
    ("Librarian", 107, "Accession Register 3", "M", "58", "Medium"),
    ("Librarian", 107, "Accession Register 4", "M", "59", "Medium"),
    ("Librarian", 108, "Donated Book Register", "M", "60", "Medium"),
    ("Librarian", 109, "Newspaper Register", "M", "61", "Medium"),
    ("Librarian", 110, "Magazine Register", "M", "62", "Medium"),
    ("Librarian", 111, "Staff Issue Register", "M", "63", "Medium"),
    ("Librarian", 112, "Staff Reference Book Issue Register", "M", "64", "Medium"),
    ("Librarian", 113, "Student Issue Register", "M", "65", "Medium"),
    ("Librarian", 114, "HOD Register", "15 days", "126", "High"),

    ("IT Executive", 115, "MCB Register", "M", "52", "Medium"),
    ("IT Executive", 116, "MCB Personal Work & Training Record", "M", "83", "Medium"),
    ("IT Executive", 117, "GoDaddy & Firewall Register", "M", "54", "Medium"),
    ("IT Executive", 118, "CCTV & Network Vendor Register", "M", "84", "Medium"),
    ("IT Executive", 119, "Gadgets Issue Register", "M", "77", "Medium"),
    ("IT Executive", 120, "Gadget Stock Register", "M", "53", "Medium"),
    ("IT Executive", 121, "HOD Register", "15 days", "95", "High"),

    ("Housekeeping & Infirmary", 122, "Housekeeping Material Issue Register", "M", "33", "Medium"),
    ("Housekeeping & Infirmary", 123, "Housekeeping Duty Register", "15 days", "52", "Medium"),
    ("Housekeeping & Infirmary", 124, "Daily OPD Register", "M", "86", "Medium"),
    ("Housekeeping & Infirmary", 125, "Student Movement Register", "M", "87", "Medium"),
    ("Housekeeping & Infirmary", 126, "Infirmary Stock/Equipment Register", "M", "88", "Medium"),
    ("Housekeeping & Infirmary", 127, "Monthly Summary Report of Treatment", "M", "89", "Medium"),
    ("Housekeeping & Infirmary", 128, "HK Substitution Duty Register", "M", "107", "Medium"),
    ("Housekeeping & Infirmary", 129, "HOD Register", "15 days", "106", "High"),
]


def build_register_no(dept, raw_no, sr_no, seen_counter):
    code = DEPT_CODE.get(dept, "GEN")
    if raw_no:
        base = f"{code}-{raw_no}"
    else:
        base = f"{code}-SR{sr_no}"
    # guard against any remaining accidental collisions within the sheet itself
    count = seen_counter.get(base, 0)
    seen_counter[base] = count + 1
    if count:
        return f"{base}-{count+1}"
    return base


def main():
    app = create_app()
    with app.app_context():
        today = date.today()
        seen_counter = {}
        created, skipped_existing, errors = 0, 0, []

        for dept, sr_no, name, cycle_raw, raw_no, priority_raw in RAW_ROWS:
            cycle = CYCLE_MAP.get(cycle_raw.strip().upper()) if cycle_raw else None
            priority = PRIORITY_MAP.get((priority_raw or "").strip().upper(), "MEDIUM")

            if not cycle:
                errors.append(f"Row {sr_no} ({name}): unrecognized cycle '{cycle_raw}', skipped.")
                continue

            register_no = build_register_no(dept, raw_no, sr_no, seen_counter)

            existing = Register.query.filter_by(register_no=register_no).first()
            if existing:
                skipped_existing += 1
                continue

            next_due = calculate_next_due_date(today, cycle)

            reg = Register(
                name=name,
                register_no=register_no,
                head_id=None,
                head_name=dept,
                cycle=cycle,
                priority=priority,
                status="IDLE",
                start_date=today,
                next_due_date=next_due,
            )
            db.session.add(reg)
            created += 1

        db.session.commit()

        print(f"Created: {created}")
        print(f"Skipped (already existed): {skipped_existing}")
        if errors:
            print(f"Warnings ({len(errors)}):")
            for e in errors:
                print(f"  - {e}")


if __name__ == "__main__":
    main()
