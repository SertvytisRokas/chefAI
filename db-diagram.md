# Database Semantic Model

```mermaid
erDiagram
    USERS {
        UUID id PK
        TEXT email
    }
    PROFILES {
        UUID user_id PK
        INT diet_type_id FK
        TIMESTAMP created_at
    }
    DIET_TYPES {
        INT id PK
        VARCHAR name
    }
    MEAL_TYPES {
        INT id PK
        VARCHAR name
    }
    MEASUREMENT_TYPES {
        INT id PK
        VARCHAR name
    }
    FRIDGE_ITEMS {
        UUID id PK
        UUID user_id FK
        TEXT name
        NUMERIC quantity
        INT measurement_type_id FK
        DATE expiration_date
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }
    USER_ALLERGENS {
        UUID user_id PK FK
        TEXT name PK
    }
    USER_PREFERENCES {
        UUID user_id PK FK
        TEXT name PK
        VARCHAR preference_type
    }
    RECIPE_TEMPLATES {
        INT id PK
        TEXT title
        TEXT content
        VECTOR embedding
    }
    RECIPES {
        UUID id PK
        UUID user_id FK
        TEXT title
        INT meal_type_id FK
        JSONB ingredients
        JSONB steps
        TIMESTAMP created_at
    }

    USERS ||--o{ PROFILES : "has"
    USERS ||--o{ FRIDGE_ITEMS : "stores"
    USERS ||--o{ USER_ALLERGENS : "avoids"
    USERS ||--o{ USER_PREFERENCES : "prefers"
    USERS ||--o{ RECIPES : "creates"
    DIET_TYPES ||--o{ PROFILES : "selected by"
    MEAL_TYPES ||--o{ RECIPES : "categorized as"
    MEASUREMENT_TYPES ||--o{ FRIDGE_ITEMS : "measured with"
    -- User_allergens and user_preferences do not reference global tables
    -- Recipe templates are used for retrieval-augmented generation

```

This entity–relationship diagram illustrates the key tables in the Meal Genius
database and their relationships. Users authenticate via Supabase Auth (not
shown). Each user has a profile (diet type), multiple fridge items, free‑form
lists of allergens and preferences (likes/dislikes), and may create multiple
recipes. Lookup tables for diets, meal types and measurement units allow you to
add or modify available options without changing application code. Recipe
templates live in their own table and are used for retrieval‑augmented
generation (RAG) to ground the model’s responses.