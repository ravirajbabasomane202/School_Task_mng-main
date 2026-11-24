"""Single source of truth for the school-wide administrative role groups.

Before this module every route file carried its own copy of
``('CHAIRMAN', 'DIRECTOR')``-style tuples. PRINCIPAL now holds the same
administrative authority as CHAIRMAN, so those tuples are built from the groups
below instead of repeating role names.

Two groups, deliberately different:

``CHAIRMAN_LEVEL_ROLES``
    Roles with full Chairman authority: create/assign tasks, manage users,
    roles, departments, registers, approvals, the task catalog, ...
    (previously ``'CHAIRMAN'`` alone).

``ELEVATED_ROLES``
    Chairman-level roles plus DIRECTOR - the roles with school-wide
    *visibility* (previously ``('CHAIRMAN', 'DIRECTOR')``).

Adding another Chairman-level role later means changing ``CHAIRMAN_LEVEL_ROLES``
and nothing else.
"""

CHAIRMAN_LEVEL_ROLES = ('CHAIRMAN', 'PRINCIPAL')
ELEVATED_ROLES = (*CHAIRMAN_LEVEL_ROLES, 'DIRECTOR')

# Chairman-level roles that are ALSO task assignees (the Chairman assigns work to
# the Principal). On a task assigned to them these roles act as a plain assignee:
# they may work on it (status, comments, proof) but not edit, reassign or delete
# it. The Chairman is the origin of assignments and is never restricted.
ASSIGNEE_ONLY_ROLES = tuple(r for r in CHAIRMAN_LEVEL_ROLES if r != 'CHAIRMAN')


def is_chairman_level(user):
    """True for an (active-or-not) user whose role carries Chairman authority."""
    return bool(user and user.role in CHAIRMAN_LEVEL_ROLES)


def is_elevated(user):
    """True for a user whose role has school-wide visibility."""
    return bool(user and user.role in ELEVATED_ROLES)
