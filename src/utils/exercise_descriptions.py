"""Hand-written "how to perform" text for every exercise in the seeded library
(`seed.py`'s EXERCISES / CARDIO_EXERCISES), keyed by exercise name — shared
across equipment variants of the same lift (e.g. one 'Bench Press' entry
covers Barbell/Dumbbell/Smith Machine/Cable) since the movement pattern and
cues are essentially the same regardless of equipment.

Used to backfill `ExerciseTemplate.description` (see the `backfill-descriptions`
Flask CLI command in app.py) and to seed new rows going forward. Custom
(user-created) exercises have no entry here — the frontend falls back to a
generic per-muscle-group blurb for those.
"""

EXERCISE_DESCRIPTIONS: dict[str, str] = {
    # Chest
    'Bench Press':
        'Lie flat on the bench with your feet planted and shoulder blades pulled together. '
        'Lower the bar or dumbbells to your mid-chest with control, then press up and slightly back until your arms are extended.',
    'Incline Bench Press':
        'On an inclined bench, lower the weight to your upper chest, keeping elbows at roughly a 45-degree angle from your torso. '
        'Press up and back toward your eyeline to keep tension on the upper chest.',
    'Decline Bench Press':
        'On a declined bench with your feet secured, lower the weight to your lower chest. '
        'Press straight up — the decline angle naturally shifts more load to the lower pecs.',
    'Push Up':
        'Hands slightly wider than shoulder-width, body in a straight line from head to heels. '
        'Lower your chest to just above the floor, then press back up without letting your hips sag.',
    'Chest Fly':
        'With a slight bend in the elbows, open your arms out to the sides in a wide arc until you feel a stretch across the chest. '
        'Bring your hands back together over your chest, squeezing at the top rather than pressing.',
    'Cable Crossover':
        'Standing between two cable towers, pull the handles down and across your body in an arcing motion until your hands meet in front of your hips. '
        'Keep a slight forward lean and control the return to keep constant tension on the chest.',

    # Back
    'Pull Up':
        'From a dead hang with an overhand grip, pull your chin above the bar by driving your elbows down toward your hips. '
        'Lower back to a full hang under control rather than dropping.',
    'Lat Pulldown':
        'Grip the bar wider than shoulder-width and pull it down to your upper chest, driving your elbows down and back. '
        'Let the bar rise back up under control without leaning back excessively.',
    'Bent Over Row':
        'Hinge at the hips with a flat back until your torso is near-parallel to the floor. '
        'Row the weight to your lower ribs, squeezing your shoulder blades together at the top.',
    'Seated Cable Row':
        'Sit with knees slightly bent, back upright. Pull the handle to your torso by driving your elbows straight back and squeezing your shoulder blades together, then let your arms extend fully before the next rep.',
    'Deadlift':
        'Stand with the bar over your mid-foot, grip just outside your legs, and set a flat back with your hips down. '
        'Drive through your heels to stand tall, keeping the bar close to your body throughout.',
    'T-Bar Row':
        'Straddle the bar with a hinged torso and flat back, gripping the handles underneath you. '
        'Row the weight up toward your chest, squeezing your shoulder blades before lowering with control.',
    'Single Arm Row':
        'With one knee and hand supported on a bench, let the dumbbell hang straight down, then row it up to your hip while keeping your torso still. '
        'Avoid rotating your shoulders as you lift.',

    # Shoulders
    'Overhead Press':
        'Start with the bar or dumbbells at shoulder height, core braced. '
        'Press straight overhead until your arms are fully extended, then lower back to shoulder height with control.',
    'Lateral Raise':
        'With a slight bend in the elbows, raise the weights out to your sides until they reach shoulder height. '
        'Lead with your elbows, not your hands, and avoid using momentum to swing the weight up.',
    'Front Raise':
        'Raise the weight straight out in front of you to shoulder height, keeping a slight bend in the elbow. '
        'Lower with control rather than letting it drop.',
    'Face Pull':
        'Pull the rope toward your face, driving your elbows out wide and back so your hands finish beside your ears. '
        'Focus on squeezing your rear delts and upper back at the end of the movement.',
    'Arnold Press':
        'Start with dumbbells at shoulder height, palms facing you. '
        'As you press overhead, rotate your palms outward so they finish facing forward at the top, then reverse the rotation on the way down.',
    'Rear Delt Fly':
        'Hinge forward with a flat back and let the weights hang below your shoulders. '
        'Raise them out to the sides in a wide arc, squeezing your shoulder blades together at the top.',

    # Biceps
    'Bicep Curl':
        'Keep your elbows pinned to your sides and curl the weight up toward your shoulders. '
        'Lower it back down slowly, resisting the negative rather than letting it drop.',
    'Hammer Curl':
        'Holding the dumbbells with palms facing each other, curl them up while keeping your elbows fixed at your sides. '
        'This neutral grip emphasizes the brachialis and forearms alongside the biceps.',
    'Preacher Curl':
        'With your upper arms braced against the preacher pad, curl the weight up while keeping your elbows locked in place. '
        'Lower under control until your arms are nearly fully extended.',
    'Concentration Curl':
        'Seated, brace your elbow against the inside of your thigh and let the dumbbell hang straight down. '
        'Curl it up toward your shoulder with a strict, isolated motion.',
    'Incline Curl':
        'Lying back on an incline bench with your arms hanging straight down, curl the dumbbells up toward your shoulders. '
        'The incline keeps your upper arms behind your torso, maximizing the stretch on the biceps.',

    # Forearms
    'Wrist Curl':
        'Rest your forearms on a bench or your thighs with your wrists hanging just off the edge, palms up. '
        'Curl the weight up using only your wrists, then lower with control.',
    'Reverse Wrist Curl':
        'Same setup as a wrist curl but palms facing down — raise your knuckles up toward the ceiling using only wrist movement. '
        'Keep your forearms still throughout.',
    'Reverse Curl':
        'Curl the weight up with an overhand (palms-down) grip, keeping your elbows at your sides. '
        'This grip shifts emphasis onto the forearms and brachialis over the biceps.',
    'Farmer Walk':
        'Pick up a heavy weight in each hand and walk for distance or time with your shoulders back and core braced. '
        'Keep your grip tight and your steps controlled rather than rushed.',
    'Dead Hang':
        'Hang from a pull-up bar with arms fully extended and shoulders relaxed but engaged. '
        'Hold for time, focusing on grip endurance and a passive stretch through the lats.',
    'Wrist Roller':
        'With arms extended in front of you, roll the weight up by alternately twisting your wrists, then reverse to lower it back down. '
        'Keep your arms as still as possible so the work stays in your forearms.',
    'Plate Pinch':
        'Pinch two weight plates together (smooth sides out) between your fingers and thumb, and hold for time. '
        'Keep your arm relaxed at your side — the entire challenge is grip strength.',

    # Triceps
    'Tricep Pushdown':
        'With elbows pinned to your sides, push the bar or rope down until your arms are fully extended. '
        'Let it rise back up under control without letting your elbows drift forward.',
    'Skull Crusher':
        'Lying on a bench with the weight extended over your forehead, lower it by bending only at the elbows until it nears your forehead. '
        'Extend back up, keeping your upper arms vertical throughout.',
    'Overhead Tricep Extension':
        'With the weight held overhead, lower it behind your head by bending at the elbows, keeping your upper arms close to your ears. '
        'Extend back to the starting position, focusing on the triceps stretch at the bottom.',
    'Close Grip Bench Press':
        'Grip the bar just inside shoulder-width and lower it to your lower chest, keeping your elbows tucked close to your body. '
        'Press back up, which emphasizes the triceps more than a standard-width bench press.',
    'Dips':
        'Support yourself on parallel bars with arms extended, then lower your body by bending your elbows until your shoulders dip below them. '
        'Press back up to full extension; a more upright torso biases triceps over chest.',
    'Tricep Kickback':
        'Hinge forward with your upper arm parallel to the floor and elbow bent. '
        'Extend your forearm straight back until your arm is fully straight, then return under control.',

    # Quads
    'Squat':
        'With the bar on your upper back (or weight held at your chest/sides), sit your hips back and down while keeping your chest up and knees tracking over your toes. '
        'Descend until your thighs are at least parallel to the floor, then drive back up.',
    'Sissy Squat':
        'Rise onto your toes and lean back from the knees while keeping your hips extended, lowering your torso toward the floor. '
        'Use your quads to pull yourself back up to standing — this isolates the quads intensely.',
    'Leg Press':
        'Feet shoulder-width on the platform, lower it by bending your knees until they reach about 90 degrees. '
        'Press back up without locking your knees out hard at the top.',
    'Leg Extension':
        'Seated with your shins behind the pad, extend your legs until straight, squeezing your quads at the top. '
        'Lower back down under control rather than letting the weight drop.',
    'Hack Squat':
        'With your back against the pad and feet on the platform, lower yourself by bending your knees until your thighs are parallel to the platform. '
        'Drive back up through your heels and mid-foot.',
    'Lunges':
        'Step forward (or stay in place) and lower your back knee toward the floor while keeping your front shin roughly vertical. '
        'Push through your front heel to return to standing.',
    'Bulgarian Split Squat':
        'With your rear foot elevated behind you on a bench, lower your body by bending your front knee until your rear knee nearly touches the floor. '
        'Drive through your front foot to stand back up.',

    # Hamstrings
    'Romanian Deadlift':
        'With a slight bend in the knees, hinge at the hips and lower the weight down the front of your legs while keeping your back flat. '
        'Feel a stretch in your hamstrings, then drive your hips forward to stand back up.',
    'Leg Curl':
        'Lying or seated with the pad against your lower legs, curl your heels toward your glutes by bending your knees. '
        'Lower back down under control rather than letting the weight snap back.',
    'Sumo Deadlift':
        'With a wide stance and toes pointed out, grip the bar inside your legs and drive through your heels to stand up, keeping your torso more upright than a conventional deadlift. '
        'Keep your knees tracking in line with your toes throughout.',
    'Good Morning':
        'With the bar on your upper back, hinge forward at the hips with a soft knee bend and flat back until your torso is near-parallel to the floor. '
        'Drive your hips forward to return to standing.',

    # Calves
    'Calf Raise':
        'Rise up onto the balls of your feet as high as possible, pausing briefly at the top. '
        'Lower your heels back down slowly, allowing a full stretch before the next rep.',
    'Seated Calf Raise':
        'Seated with the pad resting on your knees, raise your heels by pressing through the balls of your feet. '
        'Lower slowly to get a full stretch — the seated position emphasizes the soleus more than standing raises.',
    'Donkey Calf Raise':
        'Bent forward at the hips with the weight loaded on your hips, raise your heels as high as possible. '
        'Lower with control to get a deep stretch at the bottom.',

    # Glutes
    'Hip Thrust':
        'With your upper back braced on a bench and the weight over your hips, drive your hips up until your torso is parallel to the floor, squeezing your glutes hard at the top. '
        'Lower back down under control.',
    'Glute Bridge':
        'Lying on your back with knees bent and feet flat, drive your hips up by squeezing your glutes until your body forms a straight line from knees to shoulders. '
        'Lower back down with control.',
    'Cable Kickback':
        'With the cable attached at your ankle, kick your leg straight back and up while keeping your torso stable. '
        'Squeeze your glute at the top before returning under control.',
    'Donkey Kick':
        'On all fours, kick one leg up and back while keeping your knee bent at roughly 90 degrees. '
        'Squeeze your glute at the top of the movement, then lower without letting your knee touch down hard.',
    'Abductor Machine':
        'Seated with your legs against the pads, push your legs outward against the resistance. '
        'Return under control rather than letting the weight snap your legs back together.',
    'Step Up':
        'Step fully onto an elevated platform, driving through your lead heel until standing tall on top. '
        'Step back down with control and repeat, alternating legs as needed.',
    'Lateral Band Walk':
        'With a resistance band around your ankles or thighs and knees slightly bent, step sideways while keeping tension on the band throughout. '
        'Keep your feet forward-facing and your hips level.',
    'Clamshell':
        'Lying on your side with knees bent and stacked, keep your feet together and raise your top knee like a clamshell opening. '
        'Keep your hips still and avoid rolling your torso back.',
    'Fire Hydrant':
        'On all fours, keeping your knee bent at 90 degrees, raise one leg out to the side like a dog at a fire hydrant. '
        'Keep your hips square to the floor rather than rotating.',
    'Single Leg Deadlift':
        'Balancing on one leg with a slight knee bend, hinge forward while your other leg extends straight back for balance. '
        'Keep your hips square and return to standing with control.',

    # Core
    'Plank':
        'Support your body on your forearms and toes with your body in a straight line from head to heels. '
        'Brace your core and glutes to keep your hips from sagging or piking, and hold for time.',
    'Crunch':
        'Lying on your back with knees bent, curl your shoulders up off the floor by contracting your abs. '
        'Keep the movement controlled and avoid pulling on your neck with your hands.',
    'Hanging Leg Raise':
        'Hanging from a bar, raise your legs (straight or bent at the knees) up toward your chest by curling your pelvis. '
        'Lower with control rather than swinging for momentum.',
    'Russian Twist':
        'Seated with your torso leaned back and feet off the floor (or planted for an easier version), rotate the weight side to side, touching it near the floor on each side. '
        'Keep your core braced rather than just swinging your arms.',
    'Ab Wheel Rollout':
        'Starting on your knees with the wheel in front of you, roll forward as far as you can control while keeping your core braced and back flat. '
        'Pull back to the start using your abs, not your hips.',
    'Cable Crunch':
        'Kneeling in front of a cable with the rope behind your head, crunch down by curling your torso toward your hips. '
        'Keep your hips still — the movement should come from your spine, not your arms.',
    'Machine Crunch':
        'Seated in the machine with the pad against your upper chest, crunch forward by contracting your abs against the resistance. '
        'Control the return rather than letting the weight stack pull you back quickly.',
    'Decline Crunch':
        'On a decline bench with your feet secured, curl your torso up toward your knees using your abs. '
        'Lower back down under control without using momentum.',

    # Cardio
    'Running':
        'Maintain a steady, sustainable pace with a tall posture and relaxed shoulders. '
        'Aim for a consistent cadence rather than overstriding, and warm up with an easy jog before pushing pace.',
    'Cycling':
        'Keep a steady cadence and a slight bend in your knee at the bottom of each pedal stroke. '
        'Adjust resistance/incline to control intensity rather than just pedaling faster.',
    'Rowing':
        'Drive with your legs first, then lean back and pull the handle to your chest, finishing with your arms. '
        'Reverse the sequence on the way back — arms, then torso, then legs — to keep the stroke efficient.',
    'Swimming':
        'Focus on a long, controlled stroke and steady breathing rhythm rather than rushing your arm turnover. '
        'Keep your body as horizontal as possible in the water to reduce drag.',
    'Elliptical':
        'Keep a smooth, controlled stride without leaning heavily on the handles. '
        'Adjust resistance and incline to change intensity rather than just increasing your stride speed.',
    'Stair Climber':
        'Stand tall and take full steps rather than short, rapid ones, letting your legs (not your arms on the rails) do the work. '
        'Keep a pace you can sustain for the full session.',
    'Jump Rope':
        'Keep your jumps low and quick, turning the rope mainly with your wrists rather than your whole arms. '
        'Land softly on the balls of your feet to reduce impact.',
    'Walking':
        'Keep an upright posture and a natural arm swing at a brisk, sustainable pace. '
        'Increasing incline or pace are both effective ways to add intensity.',
    'Hiking':
        'Pace yourself for the full distance and elevation, using a shorter stride on steep uphills. '
        'Trekking poles can help on descents by reducing the load on your knees.',
}
