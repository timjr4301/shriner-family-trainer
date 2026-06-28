from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class ProgressEntry(db.Model):
    __tablename__ = 'progress_entries'
    id = db.Column(db.Integer, primary_key=True)
    member_name = db.Column(db.String(50), nullable=False, index=True)
    metric_name = db.Column(db.String(100), nullable=False)
    value = db.Column(db.Float, nullable=False)
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)


class DrillCompletion(db.Model):
    __tablename__ = 'drill_completions'
    id = db.Column(db.Integer, primary_key=True)
    member_name = db.Column(db.String(50), nullable=False, index=True)
    week_num = db.Column(db.Integer, nullable=False)
    day_name = db.Column(db.String(50), nullable=False)
    drill_name = db.Column(db.String(200), nullable=False)
    completed_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (
        db.UniqueConstraint('member_name', 'week_num', 'day_name', 'drill_name', name='uq_drill'),
    )


class CoachPlan(db.Model):
    __tablename__ = 'coach_plans'
    id = db.Column(db.Integer, primary_key=True)
    member_name = db.Column(db.String(50), nullable=False, index=True)
    goal = db.Column(db.Text, nullable=False)
    plan_json = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class MemberPhoto(db.Model):
    __tablename__ = 'member_photos'
    id = db.Column(db.Integer, primary_key=True)
    member_name = db.Column(db.String(50), nullable=False, unique=True)
    photo_filename = db.Column(db.String(200), nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)
