"""The ONE school time zone used for every register/task date decision.

Timestamps (completed_at / checked_at) are stored in UTC, but "which day was
this checked on?" is a school-calendar question. A check at 00:30 IST on the
6th is stored as 19:00 UTC on the 5th; comparing UTC dates would call it a
check on the 5th and show a late check as on time. Everything converts to the
school zone before comparing dates, through the helpers below.

Configure with the SCHOOL_TIMEZONE environment variable (default Asia/Kolkata).
"""
import os
from datetime import date, datetime, timedelta, timezone

try:  # zoneinfo needs the tz database (tzdata package on Windows)
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

DEFAULT_SCHOOL_TIMEZONE = 'Asia/Kolkata'
_FALLBACK_IST = timezone(timedelta(hours=5, minutes=30), 'IST')


def school_tz():
    name = os.environ.get('SCHOOL_TIMEZONE', DEFAULT_SCHOOL_TIMEZONE)
    if ZoneInfo is not None:
        try:
            return ZoneInfo(name)
        except Exception:  # unknown zone / no tzdata
            pass
    return _FALLBACK_IST if name == DEFAULT_SCHOOL_TIMEZONE else timezone.utc


def school_now():
    return datetime.now(timezone.utc).astimezone(school_tz())


def school_today():
    """Today's calendar date at the school."""
    return school_now().date()


def to_school_datetime(value):
    """Aware datetime in the school zone. Naive datetimes are UTC (that is how
    the database stores them)."""
    if value is None:
        return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(school_tz())


def to_school_date(value):
    """Calendar date at the school for a datetime (converted) or a plain date
    (returned unchanged: a date has no time zone)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return to_school_datetime(value).date()
    if isinstance(value, date):
        return value
    return None
