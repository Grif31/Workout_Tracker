---
name: new-model
description: Add a new SQLAlchemy model to models.py with to_dict method and proper relationships
disable-model-invocation: true
argument-hint: [model-name]
allowed-tools: Read, Edit
---

Add a new SQLAlchemy model named "$ARGUMENTS" to `src/models.py` in this Workout Tracker project.

1. Read `src/models.py` to understand existing models and patterns
2. Add the new model class following the same conventions:
   - `__tablename__` in snake_case plural
   - Integer primary key `id`
   - Appropriate foreign key to `user` if user-owned
   - A `to_dict()` method that serializes all fields
   - Relationships with `cascade="all, delete-orphan"` where appropriate
3. If the model relates to an existing model, add the corresponding `db.relationship` on both sides
4. Do not create any routes or migrations — just the model class

Follow the exact same style as the existing models in the file.
