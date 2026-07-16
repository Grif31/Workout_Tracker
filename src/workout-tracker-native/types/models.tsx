export type User = {
    id: number
    username: string
    email: string
};
export type Workout = {
  id?: number
  name: string
  notes?: string
  date: string
  duration?: number
  volume?: number
  exercises: Exercise[]
};


export type Exercise = {
  id: number
  name: string
  exercise_template_id?: number
  exercise_type?: 'strength' | 'cardio' | 'duration'
  route_polyline?: string
  equipment?: string
  muscle_group?: string
  notes?: string
  sets: Set[]
};
export type Set = {
  id?: number;
  reps?: string;
  weight?: string;
  set_type?: string;
  done?: boolean;
  pr_types?: string[];
  rpe?: number;
  cardio_duration?: string;
  distance?: string;
  distance_unit?: string;
  intensity?: string;
}
