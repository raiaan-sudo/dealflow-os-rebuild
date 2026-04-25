export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericRow = any;

type GenericTable = {
  Row: GenericRow;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships?: Array<{
    foreignKeyName: string;
    columns: string[];
    referencedRelation: string;
    referencedColumns: string[];
    isOneToOne?: boolean;
  }>;
};

export type Database = {
  public: {
    Tables: Record<string, GenericTable>;
    Views: Record<string, unknown>;
    Functions: Record<string, unknown>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, unknown>;
  };
};
