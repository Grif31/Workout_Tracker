from statistics import mean

BIG_6 = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Pull-up']

EXERCISE_ALIASES: dict[str, list[str]] = {
    'Squat':               ['back squat', 'barbell squat', 'low bar squat', 'high bar squat', 'squat'],
    'Bench Press':         ['barbell bench', 'flat bench press', 'bench press'],
    'Deadlift':            ['conventional deadlift', 'barbell deadlift', 'deadlift'],
    'Overhead Press':      ['overhead press', 'ohp', 'military press', 'standing press', 'barbell press'],
    'Barbell Row':         ['barbell row', 'bent over row', 'pendlay row', 'bent-over row'],
    'Front Squat':         ['front squat'],
    'Sumo Deadlift':       ['sumo deadlift'],
    'Romanian Deadlift':   ['romanian deadlift', 'rdl'],
    'Incline Bench Press': ['incline bench', 'incline barbell'],
    'Close Grip Bench':    ['close grip bench', 'close-grip bench', 'cgbp'],
    'Power Clean':         ['power clean'],
    'Hip Thrust':          ['hip thrust'],
    'Good Morning':        ['good morning'],
    'Hack Squat':          ['hack squat'],
    'T-Bar Row':           ['t-bar row', 't bar row', 'tbar row'],
    'Barbell Curl':        ['barbell curl', 'ez bar curl', 'ez-bar curl'],
    'Skull Crushers':      ['skull crusher', 'lying tricep', 'ez bar extension'],
    'Bulgarian Split Squat': ['bulgarian split squat', 'split squat'],
    'Dumbbell Bench Press':    ['dumbbell bench', 'db bench'],
    'Dumbbell Row':            ['dumbbell row', 'db row', 'one arm row', 'single arm row'],
    'Dumbbell Shoulder Press': ['dumbbell shoulder press', 'db shoulder press', 'seated dumbbell press'],
    'Dumbbell Curl':           ['dumbbell curl', 'db curl'],
    'Incline Dumbbell Press':  ['incline dumbbell', 'incline db'],
    'Dumbbell Lateral Raise':  ['lateral raise', 'dumbbell lateral', 'db lateral'],
    'Dumbbell Fly':            ['dumbbell fly', 'db fly', 'chest fly dumbbell'],
    'Hammer Curl':             ['hammer curl'],
    'Dumbbell Tricep Extension': ['dumbbell tricep extension', 'db tricep', 'overhead tricep'],
    'Pull-up':             ['pull-up', 'pullup', 'pull up', 'chin-up', 'chinup', 'chin up', 'weighted pull'],
    'Dips':                ['dip'],
    'Push-up':             ['push-up', 'pushup', 'push up'],
    'Leg Press':           ['leg press'],
    'Lat Pulldown':        ['lat pulldown', 'lat pull-down', 'cable pulldown'],
    'Cable Row':           ['cable row', 'seated cable row', 'seated row'],
    'Leg Extension':       ['leg extension'],
    'Leg Curl':            ['leg curl', 'hamstring curl'],
    'Chest Press Machine': ['chest press machine', 'machine press'],
    'Shoulder Press Machine': ['shoulder press machine', 'machine shoulder press'],
    'Cable Fly':           ['cable fly', 'cable crossover', 'cable chest fly'],
    'Tricep Pushdown':     ['tricep pushdown', 'cable pushdown', 'tricep pulldown'],
    'Cable Curl':          ['cable curl'],
    'Calf Raise':          ['standing calf raise', 'calf raise machine', 'calf raise'],
    'Seated Calf Raise':   ['seated calf raise'],
    'Chest Fly Machine':   ['chest fly machine', 'pec deck', 'pec fly'],
    'Hack Squat Machine':  ['hack squat machine', 'machine hack squat'],
    'Smith Machine Squat': ['smith machine squat', 'smith squat'],
}

# Bodyweight ratios at each percentile breakpoint.
# Dumbbell values are per-hand. Machine/cable values are higher (no stabilizer demand).
STANDARDS: dict[str, dict[str, dict[int, float]]] = {
    'male': {
        'Squat':               {10: 0.50, 25: 0.75, 50: 1.15, 75: 1.50, 90: 1.85, 95: 2.10, 99: 2.60},
        'Bench Press':         {10: 0.35, 25: 0.55, 50: 0.85, 75: 1.15, 90: 1.45, 95: 1.65, 99: 2.05},
        'Deadlift':            {10: 0.65, 25: 0.95, 50: 1.35, 75: 1.75, 90: 2.10, 95: 2.35, 99: 2.85},
        'Overhead Press':      {10: 0.20, 25: 0.35, 50: 0.55, 75: 0.75, 90: 0.95, 95: 1.10, 99: 1.35},
        'Barbell Row':         {10: 0.35, 25: 0.55, 50: 0.80, 75: 1.05, 90: 1.30, 95: 1.50, 99: 1.80},
        'Front Squat':         {10: 0.35, 25: 0.55, 50: 0.85, 75: 1.10, 90: 1.40, 95: 1.60, 99: 2.00},
        'Sumo Deadlift':       {10: 0.65, 25: 0.95, 50: 1.35, 75: 1.75, 90: 2.10, 95: 2.35, 99: 2.85},
        'Romanian Deadlift':   {10: 0.50, 25: 0.75, 50: 1.05, 75: 1.35, 90: 1.65, 95: 1.85, 99: 2.30},
        'Incline Bench Press': {10: 0.30, 25: 0.45, 50: 0.70, 75: 0.95, 90: 1.20, 95: 1.40, 99: 1.75},
        'Close Grip Bench':    {10: 0.30, 25: 0.45, 50: 0.70, 75: 0.95, 90: 1.20, 95: 1.40, 99: 1.75},
        'Power Clean':         {10: 0.40, 25: 0.60, 50: 0.85, 75: 1.10, 90: 1.35, 95: 1.55, 99: 1.90},
        'Hip Thrust':          {10: 0.65, 25: 1.00, 50: 1.40, 75: 1.80, 90: 2.20, 95: 2.50, 99: 3.00},
        'Good Morning':        {10: 0.25, 25: 0.40, 50: 0.60, 75: 0.80, 90: 1.00, 95: 1.15, 99: 1.40},
        'Hack Squat':          {10: 0.55, 25: 0.85, 50: 1.25, 75: 1.65, 90: 2.00, 95: 2.30, 99: 2.80},
        'T-Bar Row':           {10: 0.35, 25: 0.55, 50: 0.80, 75: 1.05, 90: 1.30, 95: 1.50, 99: 1.80},
        'Barbell Curl':        {10: 0.15, 25: 0.25, 50: 0.38, 75: 0.52, 90: 0.65, 95: 0.75, 99: 0.95},
        'Skull Crushers':      {10: 0.15, 25: 0.25, 50: 0.38, 75: 0.52, 90: 0.65, 95: 0.75, 99: 0.92},
        'Bulgarian Split Squat': {10: 0.25, 25: 0.40, 50: 0.60, 75: 0.80, 90: 1.00, 95: 1.15, 99: 1.45},
        'Dumbbell Bench Press':    {10: 0.15, 25: 0.25, 50: 0.40, 75: 0.55, 90: 0.70, 95: 0.80, 99: 1.00},
        'Dumbbell Row':            {10: 0.20, 25: 0.30, 50: 0.45, 75: 0.60, 90: 0.75, 95: 0.85, 99: 1.05},
        'Dumbbell Shoulder Press': {10: 0.10, 25: 0.18, 50: 0.28, 75: 0.38, 90: 0.50, 95: 0.58, 99: 0.72},
        'Dumbbell Curl':           {10: 0.08, 25: 0.13, 50: 0.20, 75: 0.28, 90: 0.36, 95: 0.42, 99: 0.52},
        'Incline Dumbbell Press':  {10: 0.13, 25: 0.20, 50: 0.33, 75: 0.45, 90: 0.58, 95: 0.68, 99: 0.85},
        'Dumbbell Lateral Raise':  {10: 0.04, 25: 0.07, 50: 0.11, 75: 0.15, 90: 0.20, 95: 0.24, 99: 0.30},
        'Dumbbell Fly':            {10: 0.10, 25: 0.15, 50: 0.23, 75: 0.32, 90: 0.40, 95: 0.47, 99: 0.58},
        'Hammer Curl':             {10: 0.08, 25: 0.13, 50: 0.20, 75: 0.28, 90: 0.36, 95: 0.42, 99: 0.52},
        'Dumbbell Tricep Extension': {10: 0.07, 25: 0.11, 50: 0.17, 75: 0.24, 90: 0.30, 95: 0.35, 99: 0.44},
        'Pull-up':             {10: 0.00, 25: 0.10, 50: 0.30, 75: 0.55, 90: 0.80, 95: 1.00, 99: 1.35},
        'Dips':                {10: 0.00, 25: 0.15, 50: 0.40, 75: 0.65, 90: 0.90, 95: 1.10, 99: 1.45},
        'Push-up':             {10: 0.05, 25: 0.12, 50: 0.22, 75: 0.35, 90: 0.50, 95: 0.62, 99: 0.80},
        'Leg Press':           {10: 1.20, 25: 1.80, 50: 2.50, 75: 3.20, 90: 3.90, 95: 4.40, 99: 5.50},
        'Lat Pulldown':        {10: 0.30, 25: 0.48, 50: 0.68, 75: 0.88, 90: 1.08, 95: 1.22, 99: 1.50},
        'Cable Row':           {10: 0.30, 25: 0.48, 50: 0.68, 75: 0.88, 90: 1.08, 95: 1.22, 99: 1.50},
        'Leg Extension':       {10: 0.30, 25: 0.45, 50: 0.65, 75: 0.85, 90: 1.05, 95: 1.20, 99: 1.50},
        'Leg Curl':            {10: 0.20, 25: 0.32, 50: 0.48, 75: 0.62, 90: 0.78, 95: 0.90, 99: 1.10},
        'Chest Press Machine': {10: 0.40, 25: 0.60, 50: 0.90, 75: 1.20, 90: 1.50, 95: 1.70, 99: 2.10},
        'Shoulder Press Machine': {10: 0.25, 25: 0.38, 50: 0.58, 75: 0.78, 90: 0.98, 95: 1.12, 99: 1.38},
        'Cable Fly':           {10: 0.10, 25: 0.17, 50: 0.27, 75: 0.37, 90: 0.47, 95: 0.55, 99: 0.68},
        'Tricep Pushdown':     {10: 0.15, 25: 0.23, 50: 0.35, 75: 0.47, 90: 0.60, 95: 0.70, 99: 0.87},
        'Cable Curl':          {10: 0.10, 25: 0.16, 50: 0.24, 75: 0.33, 90: 0.42, 95: 0.49, 99: 0.61},
        'Calf Raise':          {10: 0.60, 25: 0.95, 50: 1.40, 75: 1.85, 90: 2.30, 95: 2.65, 99: 3.30},
        'Seated Calf Raise':   {10: 0.30, 25: 0.48, 50: 0.70, 75: 0.93, 90: 1.15, 95: 1.32, 99: 1.65},
        'Chest Fly Machine':   {10: 0.25, 25: 0.38, 50: 0.57, 75: 0.77, 90: 0.97, 95: 1.11, 99: 1.38},
        'Hack Squat Machine':  {10: 1.00, 25: 1.50, 50: 2.10, 75: 2.70, 90: 3.30, 95: 3.75, 99: 4.70},
        'Smith Machine Squat': {10: 0.55, 25: 0.85, 50: 1.25, 75: 1.65, 90: 2.00, 95: 2.30, 99: 2.80},
    },
    'female': {
        'Squat':               {10: 0.30, 25: 0.50, 50: 0.75, 75: 1.00, 90: 1.25, 95: 1.40, 99: 1.75},
        'Bench Press':         {10: 0.20, 25: 0.30, 50: 0.50, 75: 0.70, 90: 0.90, 95: 1.05, 99: 1.30},
        'Deadlift':            {10: 0.40, 25: 0.60, 50: 0.90, 75: 1.20, 90: 1.50, 95: 1.70, 99: 2.10},
        'Overhead Press':      {10: 0.10, 25: 0.20, 50: 0.32, 75: 0.45, 90: 0.58, 95: 0.67, 99: 0.84},
        'Barbell Row':         {10: 0.20, 25: 0.32, 50: 0.50, 75: 0.68, 90: 0.85, 95: 0.98, 99: 1.18},
        'Front Squat':         {10: 0.20, 25: 0.32, 50: 0.52, 75: 0.70, 90: 0.88, 95: 1.00, 99: 1.28},
        'Sumo Deadlift':       {10: 0.40, 25: 0.60, 50: 0.90, 75: 1.20, 90: 1.50, 95: 1.70, 99: 2.10},
        'Romanian Deadlift':   {10: 0.30, 25: 0.47, 50: 0.68, 75: 0.90, 90: 1.12, 95: 1.27, 99: 1.57},
        'Incline Bench Press': {10: 0.17, 25: 0.27, 50: 0.42, 75: 0.57, 90: 0.72, 95: 0.84, 99: 1.05},
        'Close Grip Bench':    {10: 0.17, 25: 0.27, 50: 0.42, 75: 0.57, 90: 0.72, 95: 0.84, 99: 1.05},
        'Power Clean':         {10: 0.25, 25: 0.38, 50: 0.55, 75: 0.72, 90: 0.90, 95: 1.02, 99: 1.28},
        'Hip Thrust':          {10: 0.45, 25: 0.70, 50: 1.00, 75: 1.30, 90: 1.60, 95: 1.82, 99: 2.20},
        'Good Morning':        {10: 0.15, 25: 0.24, 50: 0.38, 75: 0.52, 90: 0.66, 95: 0.76, 99: 0.94},
        'Hack Squat':          {10: 0.32, 25: 0.52, 50: 0.78, 75: 1.03, 90: 1.28, 95: 1.47, 99: 1.83},
        'T-Bar Row':           {10: 0.20, 25: 0.32, 50: 0.50, 75: 0.68, 90: 0.85, 95: 0.98, 99: 1.18},
        'Barbell Curl':        {10: 0.09, 25: 0.15, 50: 0.23, 75: 0.32, 90: 0.40, 95: 0.47, 99: 0.58},
        'Skull Crushers':      {10: 0.09, 25: 0.15, 50: 0.23, 75: 0.32, 90: 0.40, 95: 0.47, 99: 0.58},
        'Bulgarian Split Squat': {10: 0.15, 25: 0.25, 50: 0.38, 75: 0.52, 90: 0.65, 95: 0.75, 99: 0.95},
        'Dumbbell Bench Press':    {10: 0.08, 25: 0.14, 50: 0.22, 75: 0.32, 90: 0.42, 95: 0.50, 99: 0.62},
        'Dumbbell Row':            {10: 0.12, 25: 0.19, 50: 0.29, 75: 0.40, 90: 0.51, 95: 0.59, 99: 0.73},
        'Dumbbell Shoulder Press': {10: 0.06, 25: 0.10, 50: 0.16, 75: 0.22, 90: 0.30, 95: 0.36, 99: 0.46},
        'Dumbbell Curl':           {10: 0.04, 25: 0.07, 50: 0.11, 75: 0.16, 90: 0.21, 95: 0.25, 99: 0.32},
        'Incline Dumbbell Press':  {10: 0.07, 25: 0.12, 50: 0.19, 75: 0.27, 90: 0.35, 95: 0.42, 99: 0.52},
        'Dumbbell Lateral Raise':  {10: 0.02, 25: 0.04, 50: 0.07, 75: 0.10, 90: 0.13, 95: 0.16, 99: 0.20},
        'Dumbbell Fly':            {10: 0.06, 25: 0.09, 50: 0.14, 75: 0.20, 90: 0.26, 95: 0.30, 99: 0.38},
        'Hammer Curl':             {10: 0.04, 25: 0.07, 50: 0.11, 75: 0.16, 90: 0.21, 95: 0.25, 99: 0.32},
        'Dumbbell Tricep Extension': {10: 0.04, 25: 0.07, 50: 0.10, 75: 0.15, 90: 0.19, 95: 0.22, 99: 0.28},
        'Pull-up':             {10: 0.00, 25: 0.00, 50: 0.10, 75: 0.25, 90: 0.45, 95: 0.60, 99: 0.85},
        'Dips':                {10: 0.00, 25: 0.00, 50: 0.15, 75: 0.35, 90: 0.55, 95: 0.70, 99: 0.95},
        'Push-up':             {10: 0.02, 25: 0.06, 50: 0.13, 75: 0.22, 90: 0.33, 95: 0.42, 99: 0.55},
        'Leg Press':           {10: 0.80, 25: 1.20, 50: 1.70, 75: 2.20, 90: 2.70, 95: 3.05, 99: 3.80},
        'Lat Pulldown':        {10: 0.22, 25: 0.35, 50: 0.50, 75: 0.65, 90: 0.80, 95: 0.91, 99: 1.12},
        'Cable Row':           {10: 0.22, 25: 0.35, 50: 0.50, 75: 0.65, 90: 0.80, 95: 0.91, 99: 1.12},
        'Leg Extension':       {10: 0.20, 25: 0.30, 50: 0.44, 75: 0.58, 90: 0.72, 95: 0.83, 99: 1.02},
        'Leg Curl':            {10: 0.13, 25: 0.21, 50: 0.31, 75: 0.41, 90: 0.51, 95: 0.59, 99: 0.73},
        'Chest Press Machine': {10: 0.25, 25: 0.38, 50: 0.57, 75: 0.77, 90: 0.97, 95: 1.11, 99: 1.38},
        'Shoulder Press Machine': {10: 0.15, 25: 0.24, 50: 0.36, 75: 0.49, 90: 0.62, 95: 0.72, 99: 0.89},
        'Cable Fly':           {10: 0.06, 25: 0.10, 50: 0.16, 75: 0.22, 90: 0.29, 95: 0.34, 99: 0.42},
        'Tricep Pushdown':     {10: 0.09, 25: 0.14, 50: 0.22, 75: 0.30, 90: 0.38, 95: 0.44, 99: 0.55},
        'Cable Curl':          {10: 0.06, 25: 0.10, 50: 0.15, 75: 0.21, 90: 0.27, 95: 0.31, 99: 0.39},
        'Calf Raise':          {10: 0.40, 25: 0.62, 50: 0.90, 75: 1.20, 90: 1.50, 95: 1.72, 99: 2.15},
        'Seated Calf Raise':   {10: 0.20, 25: 0.31, 50: 0.46, 75: 0.61, 90: 0.76, 95: 0.87, 99: 1.09},
        'Chest Fly Machine':   {10: 0.15, 25: 0.24, 50: 0.36, 75: 0.49, 90: 0.62, 95: 0.72, 99: 0.89},
        'Hack Squat Machine':  {10: 0.65, 25: 1.00, 50: 1.42, 75: 1.83, 90: 2.24, 95: 2.55, 99: 3.19},
        'Smith Machine Squat': {10: 0.33, 25: 0.53, 50: 0.80, 75: 1.07, 90: 1.33, 95: 1.53, 99: 1.90},
    },
}

MUSCLE_GROUP_MAP: dict[str, list[str]] = {
    'Chest':      ['Bench Press', 'Incline Bench Press', 'Close Grip Bench',
                   'Dumbbell Bench Press', 'Incline Dumbbell Press', 'Dumbbell Fly',
                   'Chest Press Machine', 'Cable Fly', 'Chest Fly Machine', 'Push-up'],
    'Back':       ['Pull-up', 'Barbell Row', 'Dumbbell Row', 'T-Bar Row',
                   'Lat Pulldown', 'Cable Row'],
    'Lower Back': ['Deadlift', 'Sumo Deadlift', 'Romanian Deadlift', 'Good Morning'],
    'Quadriceps': ['Squat', 'Front Squat', 'Hack Squat', 'Leg Press',
                   'Leg Extension', 'Bulgarian Split Squat', 'Smith Machine Squat',
                   'Hack Squat Machine'],
    'Hamstrings': ['Romanian Deadlift', 'Sumo Deadlift', 'Leg Curl'],
    'Glutes':     ['Hip Thrust', 'Sumo Deadlift', 'Romanian Deadlift', 'Bulgarian Split Squat'],
    'Shoulders':  ['Overhead Press', 'Dumbbell Shoulder Press', 'Shoulder Press Machine',
                   'Dumbbell Lateral Raise'],
    'Triceps':    ['Close Grip Bench', 'Dips', 'Skull Crushers',
                   'Tricep Pushdown', 'Dumbbell Tricep Extension'],
    'Biceps':     ['Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Cable Curl', 'Pull-up'],
    'Calves':     ['Calf Raise', 'Seated Calf Raise'],
}

# Strength rank tiers: (low_pct, high_pct, label, sub_ranges)
STRENGTH_RANK_TIERS = [
    (0,  10,  'Noobie',       [(0, 3.3), (3.3, 6.7), (6.7, 10)]),
    (10, 30,  'Beginner',     [(10, 16.7), (16.7, 23.3), (23.3, 30)]),
    (30, 60,  'Intermediate', [(30, 40), (40, 50), (50, 60)]),
    (60, 80,  'Advanced',     [(60, 66.7), (66.7, 73.3), (73.3, 80)]),
    (80, 95,  'Elite',        [(80, 85), (85, 90), (90, 95)]),
    (95, 100, 'Legend',       [(95, 97), (97, 99), (99, 100)]),
]

# Greek app rank thresholds (composite score 0–100)
GREEK_RANK_THRESHOLDS = [
    (0,  12,  'Neophyte'),
    (12, 28,  'Athlete'),
    (28, 48,  'Hero'),
    (48, 65,  'Demigod'),
    (65, 80,  'Olympian'),
    (80, 92,  'Titan'),
    (92, 100, 'Aretē'),
]


def percentile_to_strength_rank(percentile: float) -> dict:
    for low, high, label, subs in STRENGTH_RANK_TIERS:
        if percentile < high:
            for i, (s_low, s_high) in enumerate(subs, start=1):
                if percentile < s_high:
                    return {'label': label, 'tier': i, 'display': f'{label} {i}'}
    return {'label': 'Legend', 'tier': 3, 'display': 'Legend 3'}


def greek_rank_from_score(score: float) -> str:
    for low, high, name in GREEK_RANK_THRESHOLDS:
        if score < high:
            return name
    return 'Aretē'


def compute_percentile(exercise: str, gender: str, bw_ratio: float) -> float | None:
    standards = STANDARDS.get(gender, {}).get(exercise)
    if not standards:
        return None
    points = sorted(standards.items())
    pcts   = [p for p, _ in points]
    ratios = [r for _, r in points]
    if bw_ratio <= ratios[0]:
        return max(0.0, bw_ratio / ratios[0] * pcts[0]) if ratios[0] > 0 else 0.0
    if bw_ratio >= ratios[-1]:
        return min(99.9, float(pcts[-1]))
    for i in range(len(ratios) - 1):
        if ratios[i] <= bw_ratio <= ratios[i + 1]:
            t = (bw_ratio - ratios[i]) / (ratios[i + 1] - ratios[i])
            return pcts[i] + t * (pcts[i + 1] - pcts[i])
    return 0.0


def compute_weight_at_percentile(exercise: str, gender: str, bodyweight_lbs: float, target_pct: float) -> float | None:
    """Given a target percentile, return the 1RM (in lbs) needed to reach it."""
    standards = STANDARDS.get(gender, {}).get(exercise)
    if not standards or bodyweight_lbs <= 0:
        return None
    points = sorted(standards.items())
    pcts   = [p for p, _ in points]
    ratios = [r for _, r in points]
    if target_pct <= pcts[0]:
        ratio = ratios[0]
    elif target_pct >= pcts[-1]:
        ratio = ratios[-1]
    else:
        ratio = ratios[0]
        for i in range(len(pcts) - 1):
            if pcts[i] <= target_pct <= pcts[i + 1]:
                t = (target_pct - pcts[i]) / (pcts[i + 1] - pcts[i])
                ratio = ratios[i] + t * (ratios[i + 1] - ratios[i])
                break
    return round(bodyweight_lbs * ratio, 1)


def compute_muscle_group_scores(
    exercise_percentiles: dict[str, float]
) -> list[dict]:
    results = []
    for group, exercises in MUSCLE_GROUP_MAP.items():
        scores = [exercise_percentiles[e] for e in exercises if e in exercise_percentiles]
        if scores:
            score = round(mean(scores))
            results.append({
                'name': group,
                'score': score,
                'rank': percentile_to_strength_rank(score),
            })
    results.sort(key=lambda x: x['score'], reverse=True)
    return results


def _compute_streak_weeks(workouts: list) -> int:
    if not workouts:
        return 0
    week_set = {w.date.isocalendar()[:2] for w in workouts}
    from datetime import date, timedelta
    today = date.today()
    streak = 0
    check = today.isocalendar()[:2]
    while check in week_set:
        streak += 1
        # move back one week
        d = date.fromisocalendar(check[0], check[1], 1) - timedelta(weeks=1)
        check = d.isocalendar()[:2]
    return streak


def compute_consistency_score(workouts_12wk: list) -> float:
    if not workouts_12wk:
        return 0.0
    active_weeks = len({w.date.isocalendar()[:2] for w in workouts_12wk})
    streak = _compute_streak_weeks(workouts_12wk)
    raw = (active_weeks / 12) * 80 + min(streak / 12, 1.0) * 20
    return min(100.0, raw)


def compute_dedication_score(total_workouts: int) -> float:
    milestones = [(0, 0), (10, 20), (25, 40), (50, 60), (100, 75),
                  (200, 88), (365, 95), (500, 98), (1000, 100)]
    for i in range(len(milestones) - 1):
        lo_cnt, lo_pts = milestones[i]
        hi_cnt, hi_pts = milestones[i + 1]
        if total_workouts <= hi_cnt:
            t = (total_workouts - lo_cnt) / (hi_cnt - lo_cnt)
            return lo_pts + t * (hi_pts - lo_pts)
    return 100.0


def compute_volume_score(workouts_8wk: int) -> float:
    avg_per_week = workouts_8wk / 8
    milestones = [(0, 0), (1, 20), (2, 40), (3, 65), (4, 80), (5, 90), (6, 100)]
    for i in range(len(milestones) - 1):
        lo_cnt, lo_pts = milestones[i]
        hi_cnt, hi_pts = milestones[i + 1]
        if avg_per_week <= hi_cnt:
            t = (avg_per_week - lo_cnt) / (hi_cnt - lo_cnt)
            return lo_pts + t * (hi_pts - lo_pts)
    return 100.0


def compute_greek_score(consistency: float, strength: float,
                        dedication: float, volume: float) -> float:
    return consistency * 0.40 + strength * 0.30 + dedication * 0.20 + volume * 0.10
