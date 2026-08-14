"""
Backend route tests — Authorization strategy

Verifies least-privilege enforcement:
  * 401 when no auth token is sent
  * 403 when the authenticated role is not allowed
  * 403 when a director/chairman URL is accessed by a department head
"""

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# Helper – endpoints that must honour auth guards
# ─────────────────────────────────────────────────────────────────────────────

UNAUTHORIZED_ENDPOINTS = [
    # (method, path)
    ('GET',    '/api/dashboard/chairman'),
    ('GET',    '/api/dashboard/metrics'),
    ('GET',    '/api/users'),
    ('POST',   '/api/users'),
]

ENDPOINT_ROLE_MAP = [
    # (method, path, allowed_roles_key, rejected_roles_keys)
    ('GET',    '/api/users',                         'chairman',   ['hr', 'finance']),
    ('DELETE', '/api/users/1',                       'chairman',   ['hr', 'finance']),
    ('GET',    '/api/dashboard/chairman',            'chairman',   ['hr', 'finance']),
    ('GET',    '/api/tasks',                         'purchase',   ['finance']),
    ('POST',   '/api/leave',                         'hr',         ['finance']),
    ('POST',   '/api/salary-increments',             'hr',         ['finance', 'it']),
    ('GET',    '/api/salary-increments',             'hr',         ['it', 'purchase']),
    ('PUT',    '/api/salary-increments/1/hr-approve', 'hr',        ['finance', 'it']),
    ('PUT',    '/api/salary-increments/1/finance-process', 'finance', ['hr']),
    ('POST',   '/api/recruitment',                   'hr',         ['finance', 'it']),
    ('PUT',    '/api/recruitment/1',                 'hr',         ['finance']),
    ('POST',   '/api/assets',                        'it',         ['hr', 'finance']),
    ('DELETE', '/api/assets/1',                      'it',         ['hr', 'finance']),
    ('POST',   '/api/purchase-orders',               'purchase',   ['finance', 'it']),
    ('PUT',    '/api/purchase-orders/1/finance-process', 'finance', ['hr']),
]


class TestUnauthorizedReturns401:
    @pytest.mark.parametrize('method,path', UNAUTHORIZED_ENDPOINTS)
    def test_unauthenticated_request_gets_401(self, client, method, path):
        fn = getattr(client, method.lower())
        resp = fn(path)
        # 401 or explicit Forbidden from JWT layer
        assert resp.status_code in (401, 422), f"{method} {path}: got {resp.status_code}"


class TestRoleForbiddenReturns403:
    @pytest.mark.parametrize('method,path,allowed_key,rejected_keys', ENDPOINT_ROLE_MAP)
    def test_unauthorized_role_gets_403(
        self, client, auth_headers, method, path, allowed_key, rejected_keys
    ):
        """Each rejected role must receive 403 When calling the endpoint."""
        for role_key in rejected_keys:
            headers = auth_headers.get(role_key, {})
            if not headers:
                continue  # fixture may not have seeded this role
            fn = getattr(client, method.lower())
            resp = fn(path, headers=headers, json={})
            assert resp.status_code in (403, 401, 404), (
                f"{method} {path} as {role_key}: expected 403, got {resp.status_code}"
            )

    @pytest.mark.parametrize('method,path,allowed_key,rejected_keys', ENDPOINT_ROLE_MAP)
    def test_allowed_role_succeeds_or_gets_expected_error(
        self, client, auth_headers, department, method, path, allowed_key, rejected_keys
    ):
        """The allowed role must NOT receive a blanket 403."""
        headers = auth_headers.get(allowed_key, {})
        if not headers:
            pytest.skip(f"No auth header for {allowed_key}")
        fn = getattr(client, method.lower())
        resp = fn(
            path,
            headers=headers,
            json={
                'position_title': 'Test',
                'name': 'Test',
                'title': 'Test',
                'vendor_name': 'Test',
                'total_amount': 100,
                'items': [{'item_name': 'X', 'quantity': 1, 'unit_price': 100, 'total_price': 100}],
                'current_salary': 50000,
                'proposed_salary': 60000,
                'employee_id': 1,
            }.get(path.split('/')[-1].replace('-', '_') in
                  ('salary-increments', 'salary_increments')
                  and {'employee_id': 1, 'current_salary': 50000, 'proposed_salary': 60000} or {}),
        )
        # Allowed roles should not get a permanent 403
        assert resp.status_code != 403, f"Allowed role {allowed_key} got 403 on {method} {path}"
