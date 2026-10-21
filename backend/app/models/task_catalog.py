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

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'subtasks': [subtask.to_dict() for subtask in self.subtasks],
        }


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
