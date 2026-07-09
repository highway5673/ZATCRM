export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type CustomerType = '潜在伙伴' | '客户' | '伙伴'
export type TrackingMethod = 'visit' | 'phone' | 'wechat' | 'email' | 'other'
export type TaskStatus = 'pending' | 'done' | 'postponed'
export type FollowUpMethod = 'phone' | 'wechat' | 'email' | 'other'
export type OpportunityStage =
  | 'initial_contact'
  | 'interested'
  | 'quoting'
  | 'negotiating'
  | 'won'
  | 'lost'

export type Customer = {
  id: string
  user_id: string
  name: string
  company: string | null
  phone: string | null
  wechat: string | null
  email: string | null
  tags: string[]
  notes: string | null
  customer_type: CustomerType
  created_at: string
  updated_at: string
}

export type CustomerLocation = {
  id: string
  customer_id: string
  latitude: number
  longitude: number
  address: string | null
  created_at: string
}

export type TrackingRecord = {
  id: string
  customer_id: string
  user_id: string
  method: TrackingMethod
  content: string
  location_id: string | null
  tracked_at: string
  created_at: string
}

export type TrackingGift = {
  id: string
  tracking_record_id: string
  name: string
  quantity: number
  unit: string | null
  created_at: string
}

export type SalesRecord = {
  id: string
  customer_id: string
  user_id: string
  product_name: string
  quantity: number
  unit: string | null
  unit_price: number | null
  amount: number | null
  sale_date: string
  notes: string | null
  created_at: string
}

export type Visit = {
  id: string
  customer_id: string
  user_id: string
  visited_at: string
  notes: string | null
  location_id: string | null
  created_at: string
}

export type Gift = {
  id: string
  visit_id: string
  name: string
  quantity: number
  notes: string | null
  created_at: string
}

export type FollowUp = {
  id: string
  customer_id: string
  user_id: string
  method: FollowUpMethod
  content: string
  followed_at: string
  created_at: string
}

export type Opportunity = {
  id: string
  customer_id: string
  user_id: string
  title: string
  product: string | null
  estimated_amount: number | null
  stage: OpportunityStage
  expected_close_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type Task = {
  id: string
  customer_id: string | null
  user_id: string
  title: string
  notes: string | null
  remind_at: string | null
  status: TaskStatus
  created_at: string
}

// Explicit Insert types with all optional/nullable fields as optional
type CustomerInsert = {
  user_id: string
  name: string
  company?: string | null
  phone?: string | null
  wechat?: string | null
  email?: string | null
  tags?: string[]
  notes?: string | null
  customer_type?: CustomerType
}

type TrackingInsert = {
  user_id: string
  customer_id: string
  method: TrackingMethod
  content: string
  location_id?: string | null
  tracked_at?: string
}

type TrackingGiftInsert = {
  tracking_record_id: string
  name: string
  quantity?: number
  unit?: string | null
}

type SalesInsert = {
  user_id: string
  customer_id: string
  product_name: string
  quantity?: number
  unit?: string | null
  unit_price?: number | null
  amount?: number | null
  sale_date?: string
  notes?: string | null
}

type VisitInsert = {
  user_id: string
  customer_id: string
  visited_at?: string
  notes?: string | null
  location_id?: string | null
}

type FollowUpInsert = {
  user_id: string
  customer_id: string
  method: FollowUpMethod
  content: string
  followed_at?: string
}

type OpportunityInsert = {
  user_id: string
  customer_id: string
  title: string
  product?: string | null
  estimated_amount?: number | null
  stage: OpportunityStage
  expected_close_date?: string | null
  notes?: string | null
}

type TaskInsert = {
  user_id: string
  title: string
  notes?: string | null
  customer_id?: string | null
  remind_at?: string | null
  status?: TaskStatus
}

type LocationInsert = {
  customer_id: string
  latitude: number
  longitude: number
  address?: string | null
}

type GRelationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: Customer
        Insert: CustomerInsert
        Update: Partial<CustomerInsert>
        Relationships: GRelationship[]
      }
      customer_locations: {
        Row: CustomerLocation
        Insert: LocationInsert
        Update: Partial<LocationInsert>
        Relationships: GRelationship[]
      }
      tracking_records: {
        Row: TrackingRecord
        Insert: TrackingInsert
        Update: Partial<TrackingInsert>
        Relationships: GRelationship[]
      }
      tracking_gifts: {
        Row: TrackingGift
        Insert: TrackingGiftInsert
        Update: Partial<TrackingGiftInsert>
        Relationships: GRelationship[]
      }
      sales_records: {
        Row: SalesRecord
        Insert: SalesInsert
        Update: Partial<SalesInsert>
        Relationships: GRelationship[]
      }
      visits: {
        Row: Visit
        Insert: VisitInsert
        Update: Partial<VisitInsert>
        Relationships: GRelationship[]
      }
      gifts: {
        Row: Gift
        Insert: { visit_id: string; name: string; quantity?: number; notes?: string | null }
        Update: { name?: string; quantity?: number; notes?: string | null }
        Relationships: GRelationship[]
      }
      follow_ups: {
        Row: FollowUp
        Insert: FollowUpInsert
        Update: Partial<FollowUpInsert>
        Relationships: GRelationship[]
      }
      opportunities: {
        Row: Opportunity
        Insert: OpportunityInsert
        Update: Partial<OpportunityInsert>
        Relationships: GRelationship[]
      }
      tasks: {
        Row: Task
        Insert: TaskInsert
        Update: Partial<TaskInsert>
        Relationships: GRelationship[]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
