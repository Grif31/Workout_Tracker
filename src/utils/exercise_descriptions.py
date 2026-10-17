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
    'Chin Up':
        'From a dead hang with an underhand, shoulder-width grip, pull your chin above the bar by driving your elbows down toward your hips. '
        'The underhand grip brings the biceps in more than a standard pull-up. Lower back to a full hang under control rather than dropping.',
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
    'Assault Bike':
        'Push and pull the handles while you pedal, so your arms and legs share the work. '
        'The fan resistance rises with effort, so it suits both steady sessions and all-out intervals.',
    'Ski Erg':
        'Reach tall, then drive the handles down by hinging at the hips and bending the knees, finishing with hands by your thighs. '
        'Power comes from the hip hinge and lats, not just the arms.',
    'Trail Running':
        'Shorten your stride on climbs and rough ground, and look a few steps ahead to pick your footing. '
        'Judge effort by feel rather than pace, since terrain slows every split.',
    'Sprints':
        'Warm up thoroughly, then run short, near-maximal efforts with full recovery between them. '
        'Drive your knees and arms hard and stay tall rather than leaning back.',
    'Rucking':
        'Walk briskly with a weighted pack sitting high and snug on your back. '
        'Keep your posture tall and build the load and distance gradually.',
    'Burpees':
        'Drop your hands to the floor, jump your feet back to a plank, lower your chest, then jump your feet in and leap up. '
        'Keep a steady rhythm you can sustain rather than racing the first few.',
    'Battle Ropes':
        'Stand in a half squat with a braced core and make waves by moving your arms fast from the shoulders. '
        'Keep the waves reaching all the way to the anchor.',
    'Sled Push':
        'Lean into the sled with straight arms and drive it forward with short, powerful steps. '
        'Keep your back flat and your hips low throughout.',
    'Boxing':
        'Stay light on your feet, keep your hands up, and turn your hips into each punch. '
        'Breathe out on every strike and work in rounds with short rests.',
    'Basketball':
        'Log the time on court. Games mix sprints, jumps and quick changes of direction, so warm up your ankles and knees first.',
    'Soccer':
        'Log the time played. Expect repeated sprints and changes of direction, and warm up your hamstrings and groin first.',
    'Tennis':
        'Log the time on court. Stay on the balls of your feet and recover to the center of the baseline after each shot.',
    'Pickleball':
        'Log the time played. Keep your knees soft and your paddle up, and take short steps to get set before each shot.',
    'Yoga':
        'Move through the poses with steady breathing, easing into each stretch rather than forcing it. '
        'Log the session length.',
    'Pilates':
        'Work slowly and with control, keeping your core engaged and your breath steady through each movement. '
        'Log the session length.',
    'HIIT':
        'Alternate short, hard work intervals with rest. '
        'Push hard enough in each work interval that you need the rest that follows.',
    'Dance':
        'Log the session length. Keep moving at an effort that raises your breathing, and warm up before fast or jumping routines.',
    'Rock Climbing':
        'Climb with your legs pushing you up and your arms mostly holding you to the wall. '
        'Keep your hips close to the wall and rest your grip between routes.',
    'Skiing':
        'Log the time on the slopes, or the distance for cross-country. Keep your weight centered over your boots and your knees soft.',
    'Snowboarding':
        'Log the time on the slopes. Keep your knees bent and your weight centered over the board.',
    'Kayaking':
        'Rotate your torso with each stroke so your core does the work, not just your arms. '
        'Keep the blade fully in the water through the pull.',

    # Chest (added)
    'Pec Deck':
        'Sit tall with your back against the pad and elbows slightly bent. '
        'Bring the handles together in front of your chest, squeeze, then let them open slowly until you feel a stretch.',
    'Chest Press':
        'Set the seat so the handles line up with your mid-chest. '
        'Press forward until your arms are extended, then return slowly without letting the weight stack touch.',
    'Incline Chest Press':
        'Set the seat so the handles line up with your upper chest. '
        'Press up and forward until your arms are extended, then lower with control.',
    'Incline Chest Fly':
        'On an incline bench, open your arms wide with a slight bend in the elbows until you feel a stretch in the upper chest. '
        'Bring your hands back together over your upper chest.',
    'Low to High Cable Fly':
        'Set the pulleys low and sweep your hands up and together to about chin height, keeping a slight elbow bend. '
        'This angle biases the upper chest.',
    'Floor Press':
        'Lie on the floor and lower the weight until your upper arms touch the ground, pausing briefly. '
        'Press back up. The floor limits the range, which takes stress off the shoulders.',
    'Incline Push Up':
        'Place your hands on a bench or box and keep your body in a straight line. '
        'Lower your chest to the edge and press back up. The higher the surface, the easier it gets.',
    'Decline Push Up':
        'Put your feet on a bench and hands on the floor, keeping your body straight. '
        'Lower your chest toward the floor and press up. Raising the feet shifts work to the upper chest and shoulders.',
    'Diamond Push Up':
        'Place your hands close together under your chest with thumbs and index fingers forming a diamond. '
        'Lower your chest to your hands, keeping elbows tucked, then press up.',
    'Pullover':
        'Lie across or along a bench holding one dumbbell over your chest with both hands. '
        'Lower it back behind your head with slightly bent arms until you feel a stretch, then pull it back over your chest.',

    # Back (added)
    'Neutral Grip Pull Up':
        'Hang from parallel handles with palms facing each other. '
        'Pull until your chin clears the handles, then lower all the way down. The grip is easier on the elbows and shoulders.',
    'Inverted Row':
        'Lie under a bar set at hip height, grip it, and keep your body straight from heels to head. '
        'Pull your chest to the bar, then lower with control. Walk your feet forward to make it easier.',
    'Chest Supported Row':
        'Lie face down on an incline bench or machine pad and let the weight hang. '
        'Row your elbows back and squeeze your shoulder blades. The pad removes lower back strain and momentum.',
    'Pendlay Row':
        'Hinge until your torso is roughly parallel to the floor with the bar resting on the ground. '
        'Row it explosively to your lower chest, then return it to the floor each rep.',
    'Meadows Row':
        'Stand side-on to a landmine and grip the end of the bar with one hand. '
        'Row it up toward your hip with your elbow flaring slightly, then lower under control.',
    'Seal Row':
        'Lie face down on a high bench and row the bar from a dead hang up to the underside of the bench. '
        'Your legs cannot help, so every rep is strict.',
    'Straight Arm Pulldown':
        'Facing a high cable, keep your arms nearly straight and sweep the bar or rope down to your thighs. '
        'Focus on pulling with your lats, not bending your elbows.',
    'Single Arm Lat Pulldown':
        'Pull one handle down toward your shoulder, driving the elbow down and in. '
        'Working one side at a time lets you get a deeper stretch and fix imbalances.',
    'Trap Bar Deadlift':
        'Stand inside the hex bar, grip the handles, and keep your chest up and back flat. '
        'Push the floor away until you stand tall. The centered load makes it more knee-friendly and less taxing on the lower back.',
    'Rack Pull':
        'Set the bar on pins or blocks around knee height. '
        'Pull it to lockout with a flat back, then lower it to the pins. It overloads the top half of the deadlift.',
    'Deficit Deadlift':
        'Stand on a plate or low platform so the bar starts lower than usual. '
        'Pull with the same form as a regular deadlift. The extra range builds strength off the floor.',
    'Back Extension':
        'Set the pad just below your hips and lower your torso toward the floor with a flat back. '
        'Raise up until your body forms a straight line, squeezing your glutes, without arching past it.',
    'Shrug':
        'Hold the weight at your sides or in front of your thighs with straight arms. '
        'Lift your shoulders straight up toward your ears, pause, then lower. Avoid rolling them.',

    # Shoulders (added)
    'Upright Row':
        'Hold the weight in front of your thighs and pull it up along your body, leading with your elbows. '
        'Stop around chest height to keep it comfortable on the shoulders.',
    'Push Press':
        'Start with the bar on your front shoulders, dip slightly at the knees, then drive up through your legs. '
        'Use that momentum to press the bar overhead to lockout.',
    'Z Press':
        'Sit on the floor with legs straight out in front and press the bar overhead. '
        'With no back support or leg drive, your core has to keep you upright.',
    'Landmine Press':
        'Hold the end of a landmine bar at shoulder height and press it up and forward until your arm is extended. '
        'The arcing path is easier on the shoulders than a straight overhead press.',
    'Pike Push Up':
        'Start in a push-up with your hips raised high so your body forms an upside-down V. '
        'Bend your elbows to lower the top of your head toward the floor, then press back up.',
    'Handstand Push Up':
        'Kick up into a handstand against a wall. '
        'Lower your head toward the floor under control, then press back up to straight arms.',
    'Y Raise':
        'Lean forward or lie face down on an incline bench with light weights. '
        'Raise your arms up and out in a Y shape with thumbs up, leading with the lower traps rather than shrugging.',

    # Biceps (added)
    'Spider Curl':
        'Lie chest down on an incline bench with your arms hanging straight down. '
        'Curl the weight up and squeeze. The position stops your shoulders from helping.',
    'Bayesian Curl':
        'Face away from a low cable with the handle behind you and your arm slightly behind your body. '
        'Curl forward and up. Starting from behind gives the biceps a strong stretch.',
    'Drag Curl':
        'Curl the bar up while dragging it along your torso, letting your elbows travel back. '
        'Keep the bar in contact with your body the whole way.',
    'Cross Body Hammer Curl':
        'With a neutral grip, curl one dumbbell up and across your body toward the opposite shoulder. '
        'Lower it under control and alternate sides.',
    'Zottman Curl':
        'Curl up with palms facing up, rotate your palms to face down at the top, then lower slowly. '
        'Rotate back at the bottom. It works the biceps up and the forearms down.',

    # Triceps (added)
    'JM Press':
        'Lying on a bench with a close grip, lower the bar toward your upper chest and chin by bending your elbows forward. '
        'Press back up. It sits between a close grip bench and a skull crusher.',
    'Tate Press':
        'Lie holding dumbbells over your chest with palms facing your feet. '
        'Bend your elbows out to the sides to bring the dumbbells down to your chest, then press back up.',
    'Bench Dip':
        'Place your hands on the edge of a bench behind you with your legs out in front. '
        'Lower your hips by bending your elbows to about 90 degrees, then press back up.',

    # Quads (added)
    'Front Squat':
        'Rest the bar on your front shoulders with elbows high and chest up. '
        'Squat down keeping your torso upright, then drive back up. The front load shifts more work onto the quads.',
    'Goblet Squat':
        'Hold a dumbbell or kettlebell against your chest. '
        'Squat down between your knees with your chest up and elbows inside your knees, then stand.',
    'Box Squat':
        'Squat back onto a box set around knee height, pause briefly while staying tight, then drive up. '
        'Sit back rather than down to load the hips.',
    'Pause Squat':
        'Squat to your normal depth and hold the bottom position for two to three seconds while staying braced. '
        'Then drive up. The pause removes the bounce and builds strength from the hole.',
    'Pendulum Squat':
        'Set your back against the pad and shoulders under the pads, feet on the platform. '
        'Lower as deep as you can control, then press back up. The swinging arc keeps tension on the quads.',
    'Belt Squat':
        'Attach the belt around your hips and stand on the platform. '
        'Squat down and drive up. The load hangs from your hips, so your spine stays unloaded.',
    'Single Leg Press':
        'Press the platform with one foot placed in the center, keeping the other foot off the platform. '
        'Lower until your knee is near your chest without your lower back lifting off the pad.',
    'Walking Lunge':
        'Step forward into a lunge, lowering your back knee toward the floor. '
        'Push through the front foot to bring the back leg through into the next step.',
    'Reverse Lunge':
        'Step one foot back and lower your back knee toward the floor, keeping your torso upright. '
        'Push through the front heel to return. Stepping back is easier on the knees than stepping forward.',
    'Lateral Lunge':
        'Take a wide step to the side and sit your hips back over that foot, keeping the other leg straight. '
        'Push back to standing.',
    'Split Squat':
        'Stand in a staggered stance with both feet on the floor. '
        'Lower your back knee straight down toward the floor, then drive up through your front foot. Finish one side, then switch.',
    'Pistol Squat':
        'Stand on one leg with the other held out straight in front. '
        'Squat all the way down on the standing leg, then stand back up without touching down.',
    'Jump Squat':
        'Squat to about parallel, then jump as high as you can. '
        'Land softly with bent knees and go straight into the next rep.',
    'Box Jump':
        'Swing your arms and jump onto a box, landing softly with both feet in a half squat. '
        'Stand up fully, then step down rather than jumping back.',
    'Wall Sit':
        'Slide your back down a wall until your knees and hips are at about 90 degrees. '
        'Hold the position with your weight in your heels for the set time.',

    # Hamstrings (added)
    'Seated Leg Curl':
        'Sit with the pad on the back of your lower legs and the thigh pad locked down. '
        'Curl your heels down and back, pause, then return slowly. Sitting puts the hamstrings in a longer stretch.',
    'Lying Leg Curl':
        'Lie face down with the pad just above your heels. '
        'Curl your heels toward your glutes, keeping your hips pressed into the bench, then lower slowly.',
    'Nordic Curl':
        'Kneel with your ankles anchored and your body upright. '
        'Lower your torso toward the floor as slowly as you can, catch yourself with your hands, then pull back up.',
    'Stiff Leg Deadlift':
        'Hold the bar with your knees almost straight and hinge at the hips, lowering it toward the floor. '
        'Keep your back flat and stand back up by driving your hips forward.',
    'Glute Ham Raise':
        'Lock your feet in a glute ham developer with your knees on the pad. '
        'Lower your torso until it is level with the floor, then curl your body back up with your hamstrings.',

    # Glutes (added)
    'Adductor Machine':
        'Sit with your legs open against the pads. '
        'Squeeze your legs together, pause, then let them open slowly. It works the inner thighs.',
    'Copenhagen Plank':
        'Lie on your side with your top foot or knee on a bench and your bottom leg underneath. '
        'Lift your hips into a side plank and hold, working the inner thigh of the top leg.',
    'Cable Pull Through':
        'Face away from a low cable with the rope between your legs. '
        'Hinge back at the hips, then drive them forward to stand tall, squeezing your glutes at the top.',
    'Kettlebell Swing':
        'Hike the kettlebell back between your legs, then snap your hips forward to swing it to chest height. '
        'The power comes from the hips, not the arms.',
    'Frog Pump':
        'Lie on your back with the soles of your feet together and knees falling out. '
        'Drive your hips up, squeeze your glutes hard at the top, then lower.',
    'Single Leg Hip Thrust':
        'Rest your upper back on a bench with one foot planted and the other leg raised. '
        'Drive your hips up until your body is straight from shoulders to knee, then lower.',
    'Reverse Hyperextension':
        'Lie face down on the machine with your hips at the edge of the pad and legs hanging. '
        'Swing your legs up behind you until they are in line with your body, then lower with control.',

    # Calves (added)
    'Single Leg Calf Raise':
        'Stand on one foot on the edge of a step, holding a dumbbell on the same side. '
        'Lower your heel below the step, then rise up as high as you can.',
    'Tibialis Raise':
        'Lean your back against a wall with your feet out in front. '
        'Lift your toes toward your shins as high as you can, then lower. It strengthens the front of the shin.',

    # Core (added)
    'Side Plank':
        'Lie on your side and prop yourself on one forearm, stacking your feet. '
        'Lift your hips so your body forms a straight line and hold.',
    'Hollow Hold':
        'Lie on your back with arms overhead and press your lower back into the floor. '
        'Lift your shoulders and legs a few inches off the ground and hold.',
    'L-Sit':
        'Support yourself on parallel bars, the floor or parallettes with straight arms. '
        'Lift your legs straight out in front to hip height and hold.',
    'Hanging Knee Raise':
        'Hang from a bar and pull your knees up toward your chest, curling your hips. '
        'Lower slowly without swinging.',
    'Toes to Bar':
        'Hang from a bar and raise your feet all the way up to touch it. '
        'Lower under control and avoid swinging into the next rep.',
    "Captain's Chair Leg Raise":
        'Rest your forearms on the pads with your back against the backrest. '
        'Raise your knees or straight legs toward your chest, then lower slowly.',
    'Lying Leg Raise':
        'Lie on your back with your lower back pressed into the floor. '
        'Raise your straight legs toward the ceiling, then lower them slowly without letting your back arch.',
    'Bicycle Crunch':
        'Lie on your back with hands by your head and legs raised. '
        'Bring one elbow toward the opposite knee while extending the other leg, then switch sides.',
    'Sit Up':
        'Lie on your back with knees bent and feet flat. '
        'Curl all the way up until your chest is near your knees, then lower back down with control.',
    'Dead Bug':
        'Lie on your back with arms reaching up and knees bent over your hips. '
        'Lower the opposite arm and leg toward the floor while keeping your lower back flat, then switch.',
    'Bird Dog':
        'On hands and knees, extend one arm forward and the opposite leg back until both are level with your body. '
        'Hold briefly without rotating your hips, then switch.',
    'Mountain Climber':
        'From a high plank, drive one knee toward your chest, then switch legs quickly. '
        'Keep your hips level with your shoulders.',
    'Pallof Press':
        'Stand side-on to a cable at chest height and hold the handle at your chest. '
        'Press it straight out and hold, resisting the pull to rotate, then bring it back.',
    'Woodchopper':
        'Stand side-on to a cable and pull the handle diagonally across your body, rotating through your torso. '
        'Pivot your back foot and control the return.',
    'Suitcase Carry':
        'Hold a heavy dumbbell in one hand and walk with your shoulders level. '
        'Resist leaning toward the weight. Switch hands each set.',
    'Turkish Get Up':
        'Lie holding a kettlebell straight up over your shoulder. '
        'Stand up step by step while keeping the bell locked out overhead, then reverse the steps back to the floor.',

    # Forearms (added)
    'Behind the Back Wrist Curl':
        'Stand holding a barbell behind you with palms facing back. '
        'Let the bar roll down to your fingers, then curl it back up with your wrists.',
}
