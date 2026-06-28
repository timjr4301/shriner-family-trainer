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

        filename = f'profile_{member_name.lower()}_{int(time.time())}.jpg'
        save_path = os.path.join(UPLOAD_FOLDER, filename)

        try:
            from PIL import Image
            img = Image.open(f)
            img = img.convert('RGB')
            img.thumbnail((600, 600))
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

    # ── PLAN BUILDER ───────────────────────────────────────────────────────

    @app.route('/api/plan/photo-guide', methods=['POST'])
    def plan_photo_guide():
        data = request.get_json()
        member_name = data.get('member_name', 'Member')
        goal = data.get('goal', '')
        is_youth = member_name in ('Lily', 'Mason')

        api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        if not api_key:
            return jsonify({'error': 'AI coach not configured'}), 503

        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)

            prompt = f"""You are a personal trainer. {member_name}'s goal: {goal}.
{"Age note: youth athlete — keep photo requests age-appropriate, sportswear only." if is_youth else ""}

What specific photos should {member_name} take so you can assess their starting point and build the most accurate plan? Give at least 4 shots, up to 6 if the goal warrants it. Be exact — angle, clothing, what to flex or not flex, lighting.

Return ONLY valid JSON:
{{"intro":"1-2 sentence explanation of why these photos matter for their specific goal","shots":[{{"label":"Short name (2-4 words)","instruction":"Exact instruction — be specific and simple"}}]}}

Minimum 4 shots. Add extra shots only if genuinely useful for this specific goal."""

            response = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=800,
                messages=[{'role': 'user', 'content': prompt}],
            )
            raw = ''.join(block.text for block in response.content if hasattr(block, 'text'))
            raw = raw.replace('```json', '').replace('```', '').strip()
            guide = json.loads(raw)
            return jsonify(guide)

        except Exception as e:
            # Fallback to generic shots if AI fails
            return jsonify({
                'intro': 'These photos give the AI everything it needs to assess your starting point and build a plan specific to your body.',
                'shots': [
                    {'label': 'Front Relaxed', 'instruction': 'Stand facing camera, feet shoulder-width, arms at sides. Full body, natural posture.'},
                    {'label': 'Front Flexed', 'instruction': 'Same position — flex abs, arms slightly out. Shows current muscle definition.'},
                    {'label': 'Back View', 'instruction': 'Turn completely away, same relaxed stance. Shows back, glutes, and leg development.'},
                    {'label': 'Side View', 'instruction': 'Turn 90° to camera, arms at sides. Shows posture, belly profile, and spine alignment.'},
                ]
            })

    @app.route('/api/plan/generate', methods=['POST'])
    def generate_plan():
        data = request.get_json()
        member_name = data.get('member_name', 'Member')
        goal = data.get('goal', '')
        timeframe_weeks = int(data.get('timeframe_weeks', 8))
        target_results = data.get('target_results', '')
        photos = data.get('photos', [])
        is_youth = member_name in ('Lily', 'Mason')

        api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        if not api_key:
            return jsonify({'error': 'AI coach not configured'}), 503

        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)

            prompt = f"""You are an elite personal trainer and nutritionist. Create a COMPLETE {timeframe_weeks}-week program for {member_name}.

Goal: {goal}
Target: {target_results}
{"IMPORTANT: Youth athlete — age-appropriate exercises only, no adult content, focus on athletic development and fun." if is_youth else ""}
{"Body photos provided — use them to assess starting point and tailor every detail." if photos else "No photos — build entirely from the goal description."}

This plan must be so clear and specific that anyone could follow it without asking a single question. Every exercise has a set/rep count and a simple coaching cue. Every meal has exact foods and portions.

Return ONLY valid JSON, no markdown fences:
{{"overview":"2-3 sentences — what this plan will do for {member_name} and why it works","weekly_structure":"1 sentence describing the weekly pattern","daily_calories":{{"number":2000}},"daily_protein_g":{{"number":150}},"weeks":[{{"num":1,"theme":"Week theme","adjustment":"What changes or focus for this week","days":[{{"day":"Monday","type":"workout","workout_name":"Upper Body Push","duration_min":45,"exercises":[{{"name":"Push-Up","sets":"3","reps":"10-12","rest":"60s","how":"chest touches floor, full lockout at top"}}],"meals":[{{"name":"Breakfast","time":"7:00am","foods":["2 scrambled eggs","1 slice whole wheat toast","1 banana","black coffee or water"],"calories":450,"protein_g":28}},{{"name":"Lunch","time":"12:00pm","foods":["5oz grilled chicken breast","1 cup brown rice","1 cup broccoli with olive oil"],"calories":580,"protein_g":45}},{{"name":"Dinner","time":"6:30pm","foods":["6oz salmon fillet","1 medium sweet potato","side salad with olive oil"],"calories":620,"protein_g":42}},{{"name":"Snack","time":"3:00pm","foods":["1 cup Greek yogurt","1 handful mixed nuts"],"calories":280,"protein_g":18}}]}},{{"day":"Tuesday","type":"rest","workout_name":"Rest & Recovery","exercises":[],"meals":[same 4 meals with same structure]}}]}}]}}

Rules:
- Include ALL {timeframe_weeks} weeks, every day of the week (Mon-Sun)
- For rest days: type="rest", empty exercises array, still include 4 meals
- For workout days: 4-8 exercises with exact sets/reps/rest/cue
- All meals: exact portions in plain English, never vague ("chicken" → "5oz grilled chicken breast")
- Calories and protein must add up to the daily total
- Progressive overload: each week gets harder (more reps, weight, or shorter rest)
- daily_calories and daily_protein_g: return as plain numbers, not objects"""

            content_blocks = []
            for photo in photos[:8]:
                if photo.get('b64'):
                    content_blocks.append({
                        'type': 'image',
                        'source': {'type': 'base64', 'media_type': photo.get('mime', 'image/jpeg'), 'data': photo['b64']}
                    })
            content_blocks.append({'type': 'text', 'text': prompt})

            response = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=16000,
                messages=[{'role': 'user', 'content': content_blocks}],
            )

            raw = ''.join(block.text for block in response.content if hasattr(block, 'text'))
            raw = raw.replace('```json', '').replace('```', '').strip()

            try:
                plan = json.loads(raw)
            except json.JSONDecodeError:
                import re
                m = re.search(r'\{.*\}', raw, re.DOTALL)
                if m:
                    plan = json.loads(m.group())
                else:
                    return jsonify({'error': 'Could not parse plan — try again.'}), 500

            # Normalize calorie/protein fields
            for field in ('daily_calories', 'daily_protein_g'):
                v = plan.get(field)
                if isinstance(v, dict):
                    plan[field] = v.get('number') or next(iter(v.values()), None)

            db.session.add(CoachPlan(
                member_name=member_name,
                goal=f"Full {timeframe_weeks}wk Plan: {goal[:80]}",
                plan_json=json.dumps(plan),
            ))
            db.session.commit()

            return jsonify(plan)

        except Exception as e:
            return jsonify({'error': str(e)}), 500

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
