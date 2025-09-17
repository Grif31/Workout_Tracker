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
  exercises: Exercise[]
};


export type Exercise = {
  id: number
  name: string
  sets: Set[]
};
export type Set = {
  reps: string
  weight: string
}