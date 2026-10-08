"""The ONE school time zone.

`checked_at` is stored in UTC, but a register's due date is a calendar day in
the school's own time zone (India, IST = UTC+5:30 by default). Comparing the
UTC calendar day with the due date misfiles any check made between 00:00 and
05:30 IST (and "today" would be wrong for the same hours), so every date
decision about registers goes through the helpers below.

Configure with the SCHOOL_TIMEZONE setting / environment variable
(an IANA name such as "Asia/Kolkata").
"""
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_SCHOOL_TIMEZONE = 'Asia/Kolkata'


def school_timezone_name():
    try:
        from flask import current_app, has_app_context
        if has_app_context():
            name = current_app.config.get('SCHOOL_TIMEZONE')
            if name:
                return name
    except Exception:  # pragma: no cover - flask always importable here
        pass
    return os.environ.get('SCHOOL_TIMEZONE') or DEFAULT_SCHOOL_TIMEZONE


def school_tz():
    name = school_timezone_name()
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(DEFAULT_SCHOOL_TIMEZONE)


def as_aware_utc(value):
    """A datetime as timezone-aware UTC. Naive values (SQLite returns them)
    were stored as UTC, so they are tagged rather than shifted."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def to_school_datetime(value):
    """A stored datetime expressed in school local time."""
    value = as_aware_utc(value)
    return value.astimezone(school_tz()) if value is not None else None


def to_school_date(value):
    """The school-local calendar day of a stored datetime. A plain `date` is
    already a calendar day and is returned unchanged."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return to_school_datetime(value).date()
    return value


def school_now():
    return datetime.now(timezone.utc)


def school_today(now=None):
    """Today's date in the school time zone (`now` is injectable for tests)."""
    return to_school_date(now or school_now())


def iso_utc(value):
    """ISO-8601 string of a stored datetime, always with an explicit UTC offset
    (naive SQLite values would otherwise be read by browsers as local time)."""
    value = as_aware_utc(value)
    return value.isoformat() if value is not None else None
