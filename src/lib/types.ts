/**
 * Supabase type definitions for our database. This interface
 * describes the shape of each table and view exposed via the
 * Supabase API. Keeping this in sync with your database schema
 * helps catch errors at compile time.
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          diet_type_id: number | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          diet_type_id?: number | null;
          created_at?: string;
        };
        Update: {
          diet_type_id?: number | null;
        };
      };
      diet_types: {
        Row: {
          id: number;
          name: string;
        };
        Insert: {
          id?: number;
          name: string;
        };
        Update: {
          name?: string;
        };
      };
      measurement_types: {
        Row: {
          id: number;
          name: string;
        };
        Insert: {
          id?: number;
          name: string;
        };
        Update: {
          name?: string;
        };
      };
      meal_types: {
        Row: {
          id: number;
          name: string;
        };
        Insert: {
          id?: number;
          name: string;
        };
        Update: {
          name?: string;
        };
      };
      fridge_items: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          quantity: number;
          measurement_type_id: number;
          expiration_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          quantity: number;
          measurement_type_id: number;
          expiration_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          quantity?: number;
          measurement_type_id?: number;
          expiration_date?: string | null;
          updated_at?: string;
        };
      };
      user_allergens: {
        Row: {
          user_id: string;
          name: string;
        };
        Insert: {
          user_id: string;
          name: string;
        };
        Update: {
          name?: string;
        };
      };
      user_preferences: {
        Row: {
          user_id: string;
          name: string;
          preference_type: 'like' | 'dislike';
        };
        Insert: {
          user_id: string;
          name: string;
          preference_type: 'like' | 'dislike';
        };
        Update: {
          name?: string;
          preference_type?: 'like' | 'dislike';
        };
      };
      recipe_templates: {
        Row: {
          id: number;
          title: string;
          content: string;
          embedding: unknown;
        };
        Insert: {
          id?: number;
          title: string;
          content: string;
          embedding: unknown;
        };
        Update: {
          title?: string;
          content?: string;
          embedding?: unknown;
        };
      };
      recipes: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          meal_type_id: number | null;
          ingredients: any;
          steps: any;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          meal_type_id?: number | null;
          ingredients?: any;
          steps?: any;
          created_at?: string;
        };
        Update: {
          title?: string;
          meal_type_id?: number | null;
          ingredients?: any;
          steps?: any;
        };
      };
      blog_genres: {
        Row: {
          id: number;
          name: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          id?: number;
          name: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          name?: string;
          slug?: string;
          sort_order?: number;
        };
      };
      blog_articles: {
        Row: {
          id: number;
          title: string;
          excerpt: string | null;
          external_url: string;
          image_url: string | null;
          source_name: string | null;
          verified: boolean;
          is_published: boolean;
          featured: boolean;
          sort_order: number;
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          title: string;
          excerpt?: string | null;
          external_url: string;
          image_url?: string | null;
          source_name?: string | null;
          verified?: boolean;
          is_published?: boolean;
          featured?: boolean;
          sort_order?: number;
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          title?: string;
          excerpt?: string | null;
          external_url?: string;
          image_url?: string | null;
          source_name?: string | null;
          verified?: boolean;
          is_published?: boolean;
          featured?: boolean;
          sort_order?: number;
          published_at?: string | null;
        };
      };
      blog_article_genres: {
        Row: {
          article_id: number;
          genre_id: number;
        };
        Insert: {
          article_id: number;
          genre_id: number;
        };
        Update: {
          article_id?: number;
          genre_id?: number;
        };
      };
    };
  };
}