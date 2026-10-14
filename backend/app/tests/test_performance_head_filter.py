"""
Performance screen — the Head filter, end to end.

The screen offers one Head dropdown whose values are either a user id ("42") or,
for a register whose head isn't linked to a user, "name:<head name on the register>".
The JSON endpoint and the Excel/CSV export must both understand both forms.
There is no role filter on the register endpoints any more (the screen removed it).
"""

import uuid
from datetime import date

import pytest

from app.extensions import db
from app.models.register import Register, calculate_next_due_date
from app.models.user import User
from app.routes.reports import _head_matches


@pytest.fixture(autouse=True)
def _fresh_session(app):
    db.session.rollback()
    db.session.expire_all()
    yield
    db.session.rollback()
    db.session.expire_all()


def _register(head_id=None, head_name='Head', start=date(2026, 9, 1)):
    reg = Register(name=f'Reg {uuid.uuid4().hex[:5]}', register_no=f'HF-{uuid.uuid4().hex[:8]}',
                   head_id=head_id, head_name=head_name, cycle='WEEKLY', priority='HIGH',
                   status='IDLE', start_date=start,
                   next_due_date=calculate_next_due_date(start, 'WEEKLY'))
    db.session.add(reg)
    db.session.commit()
    return reg.id


def _user(role='HR'):
    user = User(name=f'Head {uuid.uuid4().hex[:5]}', email=f'{uuid.uuid4().hex[:8]}@school.test',
                role=role, is_active=True)
    user.set_password('x' * 12)
    db.session.add(user)
    db.session.commit()
    return user.id


class TestHeadMatches:
    def test_user_id_matches_that_user_only(self):
        assert _head_matches('42', 42, 'Anyone')
        assert not _head_matches('42', 43, 'Anyone')
        assert not _head_matches('42', None, 'Anyone')

    def test_name_prefix_matches_the_stored_name(self):
        assert _head_matches('name:Jane Doe', None, 'Jane Doe')
        assert not _head_matches('name:Jane Doe', None, 'John Doe')

    def test_a_bare_name_is_never_a_key(self):
        assert not _head_matches('Jane Doe', 42, 'Jane Doe')


class TestHeadFilterEndToEnd:
    def _ids(self, client, headers, **params):
        params.setdefault('date_from', '2026-09-01')
        params.setdefault('date_to', '2026-10-09')
        body = client.get('/api/reports/performance/registers', headers=headers, query_string=params).get_json()
        return {item['register_id'] for item in body['data']['summaries']}

    def test_filter_by_linked_head_and_by_unlinked_head_name(self, client, auth_headers):
        h = auth_headers['chairman']
        linked_user = _user()
        linked = _register(head_id=linked_user, head_name='Linked Head')
        unlinked_name = f'Unlinked {uuid.uuid4().hex[:4]}'
        unlinked = _register(head_id=None, head_name=unlinked_name)

        everything = self._ids(client, h)
        assert {linked, unlinked} <= everything

        assert self._ids(client, h, head=str(linked_user)) == {linked}
        assert self._ids(client, h, head=f'name:{unlinked_name}') == {unlinked}
        assert self._ids(client, h, head='ALL') == everything
        assert self._ids(client, h, head='999999') == set()

    def test_export_applies_the_same_head_filter(self, client, auth_headers):
        h = auth_headers['chairman']
        name = f'Export Head {uuid.uuid4().hex[:4]}'
        _register(head_id=None, head_name=name)
        _register(head_id=None, head_name='Somebody Else')

        resp = client.get('/api/reports/performance/export', headers=h, query_string={
            'date_from': '2026-09-01', 'date_to': '2026-10-09', 'head': f'name:{name}', 'format': 'csv'})
        assert resp.status_code == 200
        text = resp.get_data(as_text=True)
        assert name in text
        assert 'Somebody Else' not in text

    def test_role_param_is_not_a_filter_any_more(self, client, auth_headers):
        h = auth_headers['chairman']
        _register(head_id=None, head_name='Role Check')
        with_role = self._ids(client, h, role='NO_SUCH_ROLE')
        assert with_role == self._ids(client, h)
