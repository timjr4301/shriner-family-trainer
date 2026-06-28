import os
import json
import time
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from models import db, ProgressEntry, DrillCompletion, CoachPlan, MemberPhoto

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}


def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-change-me')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
        'DATABASE_URL', 'sqlite:///sft.db'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB upload limit
    CORS(app)
    db.init_app(app)

    with app.app_context():
        db.create_all()

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    # ── PAGES ──────────────────────────────────────────────────────────────

    @app.route('/')
    def index():
        return render_template('index.html')

    # ── METRICS ────────────────────────────────────────────────────────────

    @app.route('/api/metrics/<member_name>', methods=['GET'])
    def get_metrics(member_name):
        rows = (
            ProgressEntry.query
            .filter_by(member_name=member_name)
            .order_by(ProgressEntry.recorded_at.desc())
            .all()
        )
        # Return latest value per metric + best-ever value (PR)
        latest = {}
        best = {}
        for row in rows:
            if row.metric_name not in latest:
                latest[row.metric_name] = row.value
            # PR logic: for time metrics (lower = better), we track min; otherwise max
            is_time = 'sec' in row.metric_name.lower() or 'sprint' in row.metric_name.lower()
            if row.metric_name not in best:
                best[row.metric_name] = row.value
            else:
                if is_time:
                    best[row.metric_name] = min(best[row.metric_name], row.value)
                else:
                    best[row.metric_name] = max(best[row.metric_name], row.value)
        return jsonify({'latest': latest, 'best': best})

    @app.route('/api/metrics/<member_name>', methods=['POST'])
    def save_metrics(member_name):
        data = request.get_json()
        metrics = data.get('metrics', {})
        saved = []
        for metric_name, value in metrics.items():
            try:
                fval = float(value)
            except (TypeError, ValueError):
                continue
            entry = ProgressEntry(
                member_name=member_name,
                metric_name=metric_name,
                value=fval,
                recorded_at=datetime.utcnow(),
            )
            db.session.add(entry)
            saved.append(metric_name)
        db.session.commit()
        return jsonify({'saved': saved})

    @app.route('/api/metrics/<member_name>/history', methods=['GET'])
    def get_metrics_history(member_name):
        rows = (
            ProgressEntry.query
            .filter_by(member_name=member_name)
            .order_by(ProgressEntry.recorded_at.asc())
            .all()
        )
        history = []
        for row in rows:
            history.append({
                'metric_name': row.metric_name,
                'value': row.value,
                'recorded_at': row.recorded_at.isoformat(),
            })
        return jsonify({'history': history})

    # ── DRILL COMPLETIONS ──────────────────────────────────────────────────

    @app.route('/api/drills/<member_name>', methods=['GET'])
    def get_drills(member_name):
        rows = DrillCompletion.query.filter_by(member_name=member_name).all()
        completions = [
            {'week_num': r.week_num, 'day_name': r.day_name, 'drill_name': r.drill_name}
            for r in rows
        ]
        return jsonify({'completions': completions})

    @app.route('/api/drills/<member_name>', methods=['POST'])
    def toggle_drill(member_name):
        data = request.get_json()
        week_num = int(data.get('week_num', 0))
        day_name = data.get('day_name', '')
        drill_name = data.get('drill_name', '')
        completed = data.get('completed', True)

        existing = DrillCompletion.query.filter_by(
            member_name=member_name,
            week_num=week_num,
            day_name=day_name,
            drill_name=drill_name,
        ).first()

        if completed and not existing:
            row = DrillCompletion(
                member_name=member_name,
                week_num=week_num,
                day_name=day_name,
                drill_name=drill_name,
            )
            db.session.add(row)
            db.session.commit()
        elif not completed and existing:
            db.session.delete(existing)
            db.session.commit()

        return jsonify({'ok': True, 'completed': completed})

    @app.route('/api/drills/<member_name>/progress', methods=['GET'])
    def get_drill_progress(member_name):
        rows = DrillCompletion.query.filter_by(member_name=member_name).all()
        counts = {}
        for r in rows:
            counts[r.week_num] = counts.get(r.week_num, 0) + 1
        return jsonify({'counts': counts})

    # ── MEMBER PHOTOS ──────────────────────────────────────────────────────

    @app.route('/api/members/<member_name>/photo', methods=['POST'])
    def upload_photo(member_name):
        if 'photo' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        f = request.files['photo']
        ext = (f.filename.rsplit('.', 1)[-1] if '.' in f.filename else 'jpg').lower()
        if ext not in ALLOWED_EXTENSIONS:
            return jsonify({'error': 'Invalid file type'}), 400

        filename = f'profile_{member_name.lower()}_{int(time.time())}.{ext}'
        save_path = os.path.join(UPLOAD_FOLDER, filename)

        try:
            from PIL import Image
            import io
            img = Image.open(f)
            img = img.convert('RGB')
            img.thumbnail((600, 600))
            img.save(save_path, 'JPEG', quality=85)
            filename = filename.rsplit('.', 1)[0] + '.jpg'
            save_path = os.path.join(UPLOAD_FOLDER, filename)
            img.save(save_path, 'JPEG', quality=85)
        except Exception:
            f.seek(0)
            f.save(save_path)

        existing = MemberPhoto.query.filter_by(member_name=member_name).first()
        if existing:
            old = os.path.join(UPLOAD_FOLDER, existing.photo_filename)
            if os.path.exists(old):
                try:
                    os.remove(old)
                except OSError:
                    pass
            existing.photo_filename = filename
            existing.updated_at = datetime.utcnow()
        else:
            db.session.add(MemberPhoto(member_name=member_name, photo_filename=filename))
        db.session.commit()

        return jsonify({'filename': filename, 'url': f'/static/uploads/{filename}'})

    @app.route('/api/members/photos', methods=['GET'])
    def get_photos():
        rows = MemberPhoto.query.all()
        photos = {r.member_name: f'/static/uploads/{r.photo_filename}' for r in rows}
        return jsonify({'photos': photos})

    # ── AI COACH ───────────────────────────────────────────────────────────

    @app.route('/api/coach', methods=['POST'])
    def coach_analyze():
        data = request.get_json()
        member_name = data.get('member_name', 'Member')
        goal = data.get('goal', '')
        is_soccer = data.get('is_soccer', False)
        photo_b64 = data.get('photo_b64')
        photo_mime = data.get('photo_mime', 'image/jpeg')

        api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        if not api_key:
            return jsonify({'error': 'AI coach not configured'}), 503

        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)

            is_mason = member_name == 'Mason'
            is_adult_goal = any(w in goal.lower() for w in ['stamina', 'last longer', 'testosterone', 'libido'])

            prompt = f"""You are the Shriner Family Personal Trainer — personal coach for {member_name}. Goal: {goal}.
{f"Mason is a young athlete — age-appropriate content only, focused on athletic development." if is_mason else ""}
{f"Adult wellness goal — clinical, helpful, encouraging. No explicit content." if is_adult_goal else ""}
{f"This is a soccer skill goal. Provide a numbered 5-6 step skill breakdown. Each step needs a short title and a specific coaching cue." if is_soccer else ""}
{f"A body photo is included — use it for visual assessment." if photo_b64 else "No photo — coach from the goal alone."}
For muscles, identify 3-5 primary muscles and 2-3 secondary muscles.
Return ONLY valid JSON, no markdown:
{{"assessment":"2-3 paragraphs. {f"Visual body assessment tied to goal." if photo_b64 else f"Goal-based assessment and starting point."} Personal and specific to {member_name}.","primary_muscles":["list of muscle names"],"secondary_muscles":["list"],"visual_steps":{f'[{{"title":"step title","cue":"coaching cue"}}, x5-6]' if is_soccer else 'null'},"workout_title":"{f"Training Drills & Practice Plan" if is_soccer else "Weekly Workout Plan"}","workout":"Detailed plan with specific exercises, sets, reps, days. Line breaks for readability. Tailored to: {goal}","nutrition":"Practical nutrition for this goal. Key foods, macros, timing, 2-3 meal ideas.","milestones":[{{"week":"Week 2","goal":"short milestone"}},{{"week":"Week 4","goal":"milestone"}},{{"week":"Week 8","goal":"milestone"}},{{"week":"Week 12","goal":"milestone"}}],"coach_note":"1-2 sentence personal motivating note to {member_name}."}}"""

            if photo_b64:
                content = [
                    {'type': 'image', 'source': {'type': 'base64', 'media_type': photo_mime, 'data': photo_b64}},
                    {'type': 'text', 'text': prompt},
                ]
            else:
                content = [{'type': 'text', 'text': prompt}]

            response = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=4096,
                messages=[{'role': 'user', 'content': content}],
            )

            raw = ''.join(block.text for block in response.content if hasattr(block, 'text'))
            raw = raw.replace('```json', '').replace('```', '').strip()

            try:
                plan = json.loads(raw)
            except json.JSONDecodeError:
                plan = {
                    'assessment': raw or 'Try again.',
                    'primary_muscles': [],
                    'secondary_muscles': [],
                    'visual_steps': None,
                    'workout_title': 'Plan',
                    'workout': '—',
                    'nutrition': '—',
                    'milestones': [],
                    'coach_note': '',
                }

            db.session.add(CoachPlan(
                member_name=member_name,
                goal=goal,
                plan_json=json.dumps(plan),
            ))
            db.session.commit()

            return jsonify(plan)

        except Exception as e:
            return jsonify({'error': str(e)}), 500

    return app


app = create_app()

if __name__ == '__main__':
    app.run(debug=True)
