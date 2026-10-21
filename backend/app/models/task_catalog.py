from app.extensions import db


class TaskHeadline(db.Model):
    __tablename__ = 'task_headlines'
    __table_args__ = (
        db.UniqueConstraint('name', name='uq_task_headlines_name'),
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)

    subtasks = db.relationship(
        'TaskSubTask',
        back_populates='headline',
        cascade='all, delete-orphan',
        order_by='TaskSubTask.id',
    )
    # Scope: the user roles this headline is meant for. No rows = global
    # (visible for every assignee).
    role_scopes = db.relationship(
        'TaskHeadlineRole',
        back_populates='headline',
        cascade='all, delete-orphan',
        order_by='TaskHeadlineRole.role',
    )

    @property
    def roles(self):
        return [scope.role for scope in self.role_scopes]

    @property
    def is_global(self):
        return not self.role_scopes

    def set_roles(self, roles):
        """Replace the scope. An empty list makes the headline global."""
        wanted = set(roles)
        for scope in list(self.role_scopes):
            if scope.role not in wanted:
                self.role_scopes.remove(scope)
        existing = {scope.role for scope in self.role_scopes}
        for role in sorted(wanted - existing):
            self.role_scopes.append(TaskHeadlineRole(role=role))

    def is_visible_to_role(self, role):
        return self.is_global or role in self.roles

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'roles': self.roles,
            'is_global': self.is_global,
            'subtasks': [subtask.to_dict() for subtask in self.subtasks],
        }


class TaskHeadlineRole(db.Model):
    __tablename__ = 'task_headline_roles'

    headline_id = db.Column(
        db.Integer,
        db.ForeignKey('task_headlines.id', ondelete='CASCADE'),
        primary_key=True,
    )
    role = db.Column(db.String(30), primary_key=True)

    headline = db.relationship('TaskHeadline', back_populates='role_scopes')


class TaskSubTask(db.Model):
    __tablename__ = 'task_subtasks'
    __table_args__ = (
        db.UniqueConstraint('headline_id', 'name', name='uq_task_subtasks_headline_name'),
    )

    id = db.Column(db.Integer, primary_key=True)
    headline_id = db.Column(
        db.Integer,
        db.ForeignKey('task_headlines.id', ondelete='CASCADE'),
        nullable=False,
    )
    name = db.Column(db.String(255), nullable=False)

    headline = db.relationship('TaskHeadline', back_populates='subtasks')

    def to_dict(self):
        return {'id': self.id, 'name': self.name}
