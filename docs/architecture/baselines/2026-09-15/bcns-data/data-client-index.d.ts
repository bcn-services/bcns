import { PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';
export type { Database } from './database.types.js';
export interface CreateDataClientOptions {
    supabaseUrl: string;
    anonKey: string;
    /** Bearer token for the signed-in dashboard user (e.g. from supabase-js auth elsewhere in the
     *  template). Required for anything beyond an anonymous read. Not in DESIGN.md §8's literal
     *  signature — NOTES: taken as the way an already-authenticated session reaches this package,
     *  since §8 says the returned object exposes "nothing else" (no `.auth`).
     *  A function form is passed straight through as supabase-js's `accessToken` client option
     *  (2.116+): a fresh, per-request token with no `.auth` on the underlying client — see `signIn`. */
    accessToken?: string | (() => Promise<string>);
}
export type DataClientErrorCode = 'no_tenant' | 'budget_reached' | 'forbidden_role' | 'validation' | 'not_found' | 'too_large' | 'unknown';
export declare class DataClientError extends Error {
    readonly code: DataClientErrorCode;
    readonly sqlstate: string;
    readonly details: string;
    readonly hint: string;
    constructor(pgError: PostgrestError);
}
type Api = Database['api'];
type ViewName = keyof Api['Views'];
declare const VIEW_NAMES: readonly ["client_v1", "money_v1", "daily_metrics_v1", "daily_summary_v1", "campaign_daily_v1", "creative_daily_v1", "products_v1", "customers_v1", "jobs_v1", "messages_v1", "records_v1", "media_v1", "media_sets_v1", "media_set_items_v1", "activity_v1", "connector_health_v1", "egress_status_v1", "memberships_v1"];
declare function viewBuilder<K extends ViewName>(client: SupabaseClient<Database, 'api'>, name: K): (columns?: string) => import("@supabase/supabase-js").PostgrestFilterBuilder<{
    PostgrestVersion: "12";
}, {
    Tables: { [_ in never]: never; };
    Views: {
        activity_v1: {
            Row: {
                client_id: string | null;
                detail: string | null;
                kind: string | null;
                occurred_at: string | null;
                ref_id: string | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                title: string | null;
                updated_at: string | null;
                url: string | null;
            };
            Relationships: [];
        };
        campaign_daily_v1: {
            Row: {
                campaign_id: string | null;
                campaign_name: string | null;
                campaign_status: string | null;
                clicks: number | null;
                client_id: string | null;
                cpc_minor: number | null;
                cpp_minor: number | null;
                ctr: number | null;
                currency: string | null;
                day: string | null;
                impressions: number | null;
                objective: string | null;
                purchase_value_minor: number | null;
                purchases: number | null;
                reach: number | null;
                roas: number | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                spend_minor: number | null;
                updated_at: string | null;
            };
            Relationships: [{
                foreignKeyName: "daily_metrics_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "daily_metrics_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
        client_v1: {
            Row: {
                client_id: string | null;
                egress_quota_bytes: number | null;
                name: string | null;
                slug: string | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                status: "active" | "paused" | "churned" | null;
                timezone: string | null;
                updated_at: string | null;
            };
            Insert: {
                client_id?: string | null;
                egress_quota_bytes?: number | null;
                name?: string | null;
                slug?: string | null;
                source?: never;
                status?: "active" | "paused" | "churned" | null;
                timezone?: string | null;
                updated_at?: string | null;
            };
            Update: {
                client_id?: string | null;
                egress_quota_bytes?: number | null;
                name?: string | null;
                slug?: string | null;
                source?: never;
                status?: "active" | "paused" | "churned" | null;
                timezone?: string | null;
                updated_at?: string | null;
            };
            Relationships: [];
        };
        connector_health_v1: {
            Row: {
                client_id: string | null;
                computed_at: string | null;
                last_error: string | null;
                last_run_at: string | null;
                last_success_at: string | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
                status_since: string | null;
                updated_at: string | null;
            };
            Insert: {
                client_id?: string | null;
                computed_at?: string | null;
                last_error?: string | null;
                last_run_at?: string | null;
                last_success_at?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
                status_since?: string | null;
                updated_at?: string | null;
            };
            Update: {
                client_id?: string | null;
                computed_at?: string | null;
                last_error?: string | null;
                last_run_at?: string | null;
                last_success_at?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
                status_since?: string | null;
                updated_at?: string | null;
            };
            Relationships: [{
                foreignKeyName: "connector_health_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "connector_health_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
        creative_daily_v1: {
            Row: {
                ad_id: string | null;
                ad_name: string | null;
                adset_id: string | null;
                campaign_id: string | null;
                clicks: number | null;
                client_id: string | null;
                cpc_minor: number | null;
                cpp_minor: number | null;
                ctr: number | null;
                currency: string | null;
                day: string | null;
                image_hash: string | null;
                impressions: number | null;
                media_id: string | null;
                purchase_value_minor: number | null;
                purchases: number | null;
                reach: number | null;
                roas: number | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                spend_minor: number | null;
                storage_path: string | null;
                thumb_path: string | null;
                updated_at: string | null;
            };
            Relationships: [{
                foreignKeyName: "daily_metrics_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "daily_metrics_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
        customers_v1: {
            Row: {
                attributes: import("./database.types.js").Json | null;
                client_id: string | null;
                created_at: string | null;
                currency: string | null;
                email: string | null;
                external_id: string | null;
                first_order_at: string | null;
                id: string | null;
                name: string | null;
                orders_count: number | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                source_updated_at: string | null;
                total_spent_minor: number | null;
                updated_at: string | null;
            };
            Insert: {
                attributes?: import("./database.types.js").Json | null;
                client_id?: string | null;
                created_at?: string | null;
                currency?: string | null;
                email?: string | null;
                external_id?: string | null;
                first_order_at?: string | null;
                id?: string | null;
                name?: string | null;
                orders_count?: number | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                source_updated_at?: string | null;
                total_spent_minor?: number | null;
                updated_at?: string | null;
            };
            Update: {
                attributes?: import("./database.types.js").Json | null;
                client_id?: string | null;
                created_at?: string | null;
                currency?: string | null;
                email?: string | null;
                external_id?: string | null;
                first_order_at?: string | null;
                id?: string | null;
                name?: string | null;
                orders_count?: number | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                source_updated_at?: string | null;
                total_spent_minor?: number | null;
                updated_at?: string | null;
            };
            Relationships: [{
                foreignKeyName: "customers_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "customers_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
        daily_metrics_v1: {
            Row: {
                client_id: string | null;
                currency: string | null;
                day: string | null;
                entity_id: string | null;
                entity_kind: string | null;
                metric: string | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                updated_at: string | null;
                value: number | null;
            };
            Insert: {
                client_id?: string | null;
                currency?: string | null;
                day?: string | null;
                entity_id?: string | null;
                entity_kind?: string | null;
                metric?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                updated_at?: string | null;
                value?: number | null;
            };
            Update: {
                client_id?: string | null;
                currency?: string | null;
                day?: string | null;
                entity_id?: string | null;
                entity_kind?: string | null;
                metric?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                updated_at?: string | null;
                value?: number | null;
            };
            Relationships: [{
                foreignKeyName: "daily_metrics_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "daily_metrics_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
        daily_summary_v1: {
            Row: {
                ad_clicks: number | null;
                ad_currency: string | null;
                ad_impressions: number | null;
                ad_purchase_value_minor: number | null;
                ad_purchases: number | null;
                ad_spend_minor: number | null;
                aov_minor: number | null;
                client_id: string | null;
                conversion_rate: number | null;
                currency: string | null;
                day: string | null;
                inventory_units: number | null;
                orders: number | null;
                payouts_minor: number | null;
                refunds_minor: number | null;
                revenue_minor: number | null;
                roas: number | null;
                sessions: number | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                updated_at: string | null;
            };
            Relationships: [];
        };
        egress_status_v1: {
            Row: {
                bytes_used: number | null;
                client_id: string | null;
                exceeded: boolean | null;
                month: string | null;
                quota_bytes: number | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                updated_at: string | null;
            };
            Relationships: [];
        };
        jobs_v1: {
            Row: {
                client_id: string | null;
                deleted_at: string | null;
                due_on: string | null;
                external_id: string | null;
                group_name: string | null;
                id: string | null;
                is_done: boolean | null;
                kind: string | null;
                owner: string | null;
                priority: string | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                source_updated_at: string | null;
                status: string | null;
                title: string | null;
                updated_at: string | null;
                url: string | null;
            };
            Insert: {
                client_id?: string | null;
                deleted_at?: string | null;
                due_on?: string | null;
                external_id?: string | null;
                group_name?: string | null;
                id?: string | null;
                is_done?: boolean | null;
                kind?: string | null;
                owner?: string | null;
                priority?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                source_updated_at?: string | null;
                status?: string | null;
                title?: string | null;
                updated_at?: string | null;
                url?: string | null;
            };
            Update: {
                client_id?: string | null;
                deleted_at?: string | null;
                due_on?: string | null;
                external_id?: string | null;
                group_name?: string | null;
                id?: string | null;
                is_done?: boolean | null;
                kind?: string | null;
                owner?: string | null;
                priority?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                source_updated_at?: string | null;
                status?: string | null;
                title?: string | null;
                updated_at?: string | null;
                url?: string | null;
            };
            Relationships: [{
                foreignKeyName: "jobs_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "jobs_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
        media_set_items_v1: {
            Row: {
                added_at: string | null;
                client_id: string | null;
                media_id: string | null;
                position: number | null;
                set_id: string | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                updated_at: string | null;
            };
            Insert: {
                added_at?: string | null;
                client_id?: string | null;
                media_id?: string | null;
                position?: number | null;
                set_id?: string | null;
                source?: never;
                updated_at?: string | null;
            };
            Update: {
                added_at?: string | null;
                client_id?: string | null;
                media_id?: string | null;
                position?: number | null;
                set_id?: string | null;
                source?: never;
                updated_at?: string | null;
            };
            Relationships: [{
                foreignKeyName: "media_set_items_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "media_set_items_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "media_set_items_media_id_fkey";
                columns: ["media_id"];
                isOneToOne: false;
                referencedRelation: "creative_daily_v1";
                referencedColumns: ["media_id"];
            }, {
                foreignKeyName: "media_set_items_media_id_fkey";
                columns: ["media_id"];
                isOneToOne: false;
                referencedRelation: "media_v1";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "media_set_items_set_id_fkey";
                columns: ["set_id"];
                isOneToOne: false;
                referencedRelation: "media_sets_v1";
                referencedColumns: ["id"];
            }];
        };
        media_sets_v1: {
            Row: {
                client_id: string | null;
                cover_thumb_path: string | null;
                created_at: string | null;
                description: string | null;
                file_count: number | null;
                id: string | null;
                name: string | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                updated_at: string | null;
            };
            Insert: {
                client_id?: string | null;
                cover_thumb_path?: never;
                created_at?: string | null;
                description?: string | null;
                file_count?: never;
                id?: string | null;
                name?: string | null;
                source?: never;
                updated_at?: string | null;
            };
            Update: {
                client_id?: string | null;
                cover_thumb_path?: never;
                created_at?: string | null;
                description?: string | null;
                file_count?: never;
                id?: string | null;
                name?: string | null;
                source?: never;
                updated_at?: string | null;
            };
            Relationships: [{
                foreignKeyName: "media_sets_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "media_sets_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
        media_v1: {
            Row: {
                bytes: number | null;
                client_id: string | null;
                created_at: string | null;
                deleted_at: string | null;
                external_id: string | null;
                filename: string | null;
                height: number | null;
                id: string | null;
                kind: string | null;
                mime: string | null;
                purge_after: string | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                storage_path: string | null;
                tags: string[] | null;
                thumb_path: string | null;
                title: string | null;
                updated_at: string | null;
                uploaded_by: string | null;
                width: number | null;
            };
            Insert: {
                bytes?: number | null;
                client_id?: string | null;
                created_at?: string | null;
                deleted_at?: string | null;
                external_id?: string | null;
                filename?: string | null;
                height?: number | null;
                id?: string | null;
                kind?: string | null;
                mime?: string | null;
                purge_after?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                storage_path?: string | null;
                tags?: string[] | null;
                thumb_path?: string | null;
                title?: string | null;
                updated_at?: string | null;
                uploaded_by?: string | null;
                width?: number | null;
            };
            Update: {
                bytes?: number | null;
                client_id?: string | null;
                created_at?: string | null;
                deleted_at?: string | null;
                external_id?: string | null;
                filename?: string | null;
                height?: number | null;
                id?: string | null;
                kind?: string | null;
                mime?: string | null;
                purge_after?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                storage_path?: string | null;
                tags?: string[] | null;
                thumb_path?: string | null;
                title?: string | null;
                updated_at?: string | null;
                uploaded_by?: string | null;
                width?: number | null;
            };
            Relationships: [{
                foreignKeyName: "media_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "media_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
        memberships_v1: {
            Row: {
                client_id: string | null;
                created_at: string | null;
                is_smoke: boolean | null;
                role: "member" | "owner" | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                updated_at: string | null;
                user_id: string | null;
            };
            Insert: {
                client_id?: string | null;
                created_at?: string | null;
                is_smoke?: boolean | null;
                role?: "member" | "owner" | null;
                source?: never;
                updated_at?: string | null;
                user_id?: string | null;
            };
            Update: {
                client_id?: string | null;
                created_at?: string | null;
                is_smoke?: boolean | null;
                role?: "member" | "owner" | null;
                source?: never;
                updated_at?: string | null;
                user_id?: string | null;
            };
            Relationships: [{
                foreignKeyName: "memberships_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "memberships_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
        messages_v1: {
            Row: {
                attributes: import("./database.types.js").Json | null;
                body: string | null;
                client_id: string | null;
                external_id: string | null;
                id: string | null;
                kind: string | null;
                occurred_at: string | null;
                participants: string[] | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                title: string | null;
                updated_at: string | null;
                url: string | null;
            };
            Insert: {
                attributes?: import("./database.types.js").Json | null;
                body?: string | null;
                client_id?: string | null;
                external_id?: string | null;
                id?: string | null;
                kind?: string | null;
                occurred_at?: string | null;
                participants?: string[] | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                title?: string | null;
                updated_at?: string | null;
                url?: string | null;
            };
            Update: {
                attributes?: import("./database.types.js").Json | null;
                body?: string | null;
                client_id?: string | null;
                external_id?: string | null;
                id?: string | null;
                kind?: string | null;
                occurred_at?: string | null;
                participants?: string[] | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                title?: string | null;
                updated_at?: string | null;
                url?: string | null;
            };
            Relationships: [{
                foreignKeyName: "messages_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "messages_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
        money_v1: {
            Row: {
                amount_minor: number | null;
                attributes: import("./database.types.js").Json | null;
                client_id: string | null;
                currency: string | null;
                customer_external_id: string | null;
                day: string | null;
                external_id: string | null;
                id: string | null;
                items_count: number | null;
                kind: string | null;
                occurred_at: string | null;
                order_number: string | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                source_updated_at: string | null;
                status: string | null;
                updated_at: string | null;
                url: string | null;
            };
            Insert: {
                amount_minor?: number | null;
                attributes?: import("./database.types.js").Json | null;
                client_id?: string | null;
                currency?: string | null;
                customer_external_id?: string | null;
                day?: string | null;
                external_id?: string | null;
                id?: string | null;
                items_count?: number | null;
                kind?: string | null;
                occurred_at?: string | null;
                order_number?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                source_updated_at?: string | null;
                status?: string | null;
                updated_at?: string | null;
                url?: string | null;
            };
            Update: {
                amount_minor?: number | null;
                attributes?: import("./database.types.js").Json | null;
                client_id?: string | null;
                currency?: string | null;
                customer_external_id?: string | null;
                day?: string | null;
                external_id?: string | null;
                id?: string | null;
                items_count?: number | null;
                kind?: string | null;
                occurred_at?: string | null;
                order_number?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                source_updated_at?: string | null;
                status?: string | null;
                updated_at?: string | null;
                url?: string | null;
            };
            Relationships: [{
                foreignKeyName: "money_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "money_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
        products_v1: {
            Row: {
                attributes: import("./database.types.js").Json | null;
                client_id: string | null;
                currency: string | null;
                external_id: string | null;
                handle: string | null;
                id: string | null;
                image_url: string | null;
                inventory_quantity: number | null;
                price_minor: number | null;
                product_type: string | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                status: string | null;
                title: string | null;
                updated_at: string | null;
                url: string | null;
                variants_count: number | null;
                vendor: string | null;
            };
            Insert: {
                attributes?: import("./database.types.js").Json | null;
                client_id?: string | null;
                currency?: string | null;
                external_id?: string | null;
                handle?: string | null;
                id?: string | null;
                image_url?: string | null;
                inventory_quantity?: number | null;
                price_minor?: number | null;
                product_type?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                status?: string | null;
                title?: string | null;
                updated_at?: string | null;
                url?: string | null;
                variants_count?: number | null;
                vendor?: string | null;
            };
            Update: {
                attributes?: import("./database.types.js").Json | null;
                client_id?: string | null;
                currency?: string | null;
                external_id?: string | null;
                handle?: string | null;
                id?: string | null;
                image_url?: string | null;
                inventory_quantity?: number | null;
                price_minor?: number | null;
                product_type?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                status?: string | null;
                title?: string | null;
                updated_at?: string | null;
                url?: string | null;
                variants_count?: number | null;
                vendor?: string | null;
            };
            Relationships: [{
                foreignKeyName: "products_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "products_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
        records_v1: {
            Row: {
                attributes: import("./database.types.js").Json | null;
                body: string | null;
                client_id: string | null;
                external_id: string | null;
                id: string | null;
                kind: string | null;
                occurred_at: string | null;
                source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                title: string | null;
                updated_at: string | null;
            };
            Insert: {
                attributes?: import("./database.types.js").Json | null;
                body?: string | null;
                client_id?: string | null;
                external_id?: string | null;
                id?: string | null;
                kind?: string | null;
                occurred_at?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                title?: string | null;
                updated_at?: string | null;
            };
            Update: {
                attributes?: import("./database.types.js").Json | null;
                body?: string | null;
                client_id?: string | null;
                external_id?: string | null;
                id?: string | null;
                kind?: string | null;
                occurred_at?: string | null;
                source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                title?: string | null;
                updated_at?: string | null;
            };
            Relationships: [{
                foreignKeyName: "records_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "client_v1";
                referencedColumns: ["client_id"];
            }, {
                foreignKeyName: "records_client_id_fkey";
                columns: ["client_id"];
                isOneToOne: false;
                referencedRelation: "egress_status_v1";
                referencedColumns: ["client_id"];
            }];
        };
    };
    Functions: {
        bulk_tag: {
            Args: {
                add?: string[];
                media_ids: string[];
                remove?: string[];
            };
            Returns: number;
        };
        create_media_set: {
            Args: {
                description?: string;
                name: string;
            };
            Returns: string;
        };
        delete_media: {
            Args: {
                media_ids: string[];
            };
            Returns: number;
        };
        delete_media_set: {
            Args: {
                set_id: string;
            };
            Returns: undefined;
        };
        delete_record: {
            Args: {
                record_id: string;
            };
            Returns: undefined;
        };
        download_url: {
            Args: {
                media_id: string;
            };
            Returns: import("./database.types.js").Json;
        };
        register_upload: {
            Args: {
                path: string;
                tags?: string[];
                title?: string;
            };
            Returns: string;
        };
        remove_member: {
            Args: {
                target_user_id: string;
            };
            Returns: undefined;
        };
        reorder_media_set_items: {
            Args: {
                media_ids: string[];
                set_id: string;
            };
            Returns: undefined;
        };
        report_dashboard_version: {
            Args: {
                api_version: string;
                app_version: string;
            };
            Returns: undefined;
        };
        restore_media: {
            Args: {
                media_ids: string[];
            };
            Returns: number;
        };
        save_record: {
            Args: {
                attributes: import("./database.types.js").Json;
                body?: string;
                external_id?: string;
                kind: string;
                occurred_at?: string;
                title?: string;
            };
            Returns: string;
        };
        set_media_set_items: {
            Args: {
                action: string;
                media_ids: string[];
                set_id: string;
            };
            Returns: number;
        };
        update_media: {
            Args: {
                media_id: string;
                tags?: string[];
                title?: string;
            };
            Returns: undefined;
        };
        update_media_set: {
            Args: {
                description?: string;
                name?: string;
                set_id: string;
            };
            Returns: undefined;
        };
    };
    Enums: { [_ in never]: never; };
    CompositeTypes: { [_ in never]: never; };
}, {
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
}[K]["Row"], (({
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
}[K] extends infer T ? T extends {
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
}[K] ? T extends {
    Relationships: infer R;
} ? R : unknown : never : never) extends infer T_1 ? T_1 extends ({
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
}[K] extends infer T_4 ? T_4 extends {
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
}[K] ? T_4 extends {
    Relationships: infer R;
} ? R : unknown : never : never) ? T_1 extends null ? {
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
}[K]["Row"] extends infer FieldResult ? FieldResult extends Record<string, unknown> ? {} & FieldResult extends infer T_2 ? { [K_1 in keyof T_2]: T_2[K_1]; } : never : FieldResult extends {
    error: true;
} & infer E extends string ? {
    error: true;
} & E : {
    error: true;
} & "Could not retrieve a valid record or error value" : {
    error: true;
} & "Processing node failed." : K extends string ? T_1 extends {
    foreignKeyName: string;
    columns: string[];
    isOneToOne?: boolean;
    referencedRelation: string;
    referencedColumns: string[];
}[] ? ({ [K_2 in keyof ({} & {
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
})[K]["Row"]]: K_2 extends "bulk_tag" | "create_media_set" | "delete_media" | "delete_media_set" | "delete_record" | "download_url" | "register_upload" | "remove_member" | "reorder_media_set_items" | "report_dashboard_version" | "restore_media" | "save_record" | "set_media_set_items" | "update_media" | "update_media_set" ? [{
    bulk_tag: {
        Args: {
            add?: string[];
            media_ids: string[];
            remove?: string[];
        };
        Returns: number;
    };
    create_media_set: {
        Args: {
            description?: string;
            name: string;
        };
        Returns: string;
    };
    delete_media: {
        Args: {
            media_ids: string[];
        };
        Returns: number;
    };
    delete_media_set: {
        Args: {
            set_id: string;
        };
        Returns: undefined;
    };
    delete_record: {
        Args: {
            record_id: string;
        };
        Returns: undefined;
    };
    download_url: {
        Args: {
            media_id: string;
        };
        Returns: import("./database.types.js").Json;
    };
    register_upload: {
        Args: {
            path: string;
            tags?: string[];
            title?: string;
        };
        Returns: string;
    };
    remove_member: {
        Args: {
            target_user_id: string;
        };
        Returns: undefined;
    };
    reorder_media_set_items: {
        Args: {
            media_ids: string[];
            set_id: string;
        };
        Returns: undefined;
    };
    report_dashboard_version: {
        Args: {
            api_version: string;
            app_version: string;
        };
        Returns: undefined;
    };
    restore_media: {
        Args: {
            media_ids: string[];
        };
        Returns: number;
    };
    save_record: {
        Args: {
            attributes: import("./database.types.js").Json;
            body?: string;
            external_id?: string;
            kind: string;
            occurred_at?: string;
            title?: string;
        };
        Returns: string;
    };
    set_media_set_items: {
        Args: {
            action: string;
            media_ids: string[];
            set_id: string;
        };
        Returns: number;
    };
    update_media: {
        Args: {
            media_id: string;
            tags?: string[];
            title?: string;
        };
        Returns: undefined;
    };
    update_media_set: {
        Args: {
            description?: string;
            name?: string;
            set_id: string;
        };
        Returns: undefined;
    };
}[K_2]["Args"]] extends [never] ? never : {
    bulk_tag: {
        Args: {
            add?: string[];
            media_ids: string[];
            remove?: string[];
        };
        Returns: number;
    };
    create_media_set: {
        Args: {
            description?: string;
            name: string;
        };
        Returns: string;
    };
    delete_media: {
        Args: {
            media_ids: string[];
        };
        Returns: number;
    };
    delete_media_set: {
        Args: {
            set_id: string;
        };
        Returns: undefined;
    };
    delete_record: {
        Args: {
            record_id: string;
        };
        Returns: undefined;
    };
    download_url: {
        Args: {
            media_id: string;
        };
        Returns: import("./database.types.js").Json;
    };
    register_upload: {
        Args: {
            path: string;
            tags?: string[];
            title?: string;
        };
        Returns: string;
    };
    remove_member: {
        Args: {
            target_user_id: string;
        };
        Returns: undefined;
    };
    reorder_media_set_items: {
        Args: {
            media_ids: string[];
            set_id: string;
        };
        Returns: undefined;
    };
    report_dashboard_version: {
        Args: {
            api_version: string;
            app_version: string;
        };
        Returns: undefined;
    };
    restore_media: {
        Args: {
            media_ids: string[];
        };
        Returns: number;
    };
    save_record: {
        Args: {
            attributes: import("./database.types.js").Json;
            body?: string;
            external_id?: string;
            kind: string;
            occurred_at?: string;
            title?: string;
        };
        Returns: string;
    };
    set_media_set_items: {
        Args: {
            action: string;
            media_ids: string[];
            set_id: string;
        };
        Returns: number;
    };
    update_media: {
        Args: {
            media_id: string;
            tags?: string[];
            title?: string;
        };
        Returns: undefined;
    };
    update_media_set: {
        Args: {
            description?: string;
            name?: string;
            set_id: string;
        };
        Returns: undefined;
    };
}[K_2] extends {
    Args: {
        '': ({} & {
            activity_v1: {
                Row: {
                    client_id: string | null;
                    detail: string | null;
                    kind: string | null;
                    occurred_at: string | null;
                    ref_id: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title: string | null;
                    updated_at: string | null;
                    url: string | null;
                };
                Relationships: [];
            };
            campaign_daily_v1: {
                Row: {
                    campaign_id: string | null;
                    campaign_name: string | null;
                    campaign_status: string | null;
                    clicks: number | null;
                    client_id: string | null;
                    cpc_minor: number | null;
                    cpp_minor: number | null;
                    ctr: number | null;
                    currency: string | null;
                    day: string | null;
                    impressions: number | null;
                    objective: string | null;
                    purchase_value_minor: number | null;
                    purchases: number | null;
                    reach: number | null;
                    roas: number | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    spend_minor: number | null;
                    updated_at: string | null;
                };
                Relationships: [{
                    foreignKeyName: "daily_metrics_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "daily_metrics_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            client_v1: {
                Row: {
                    client_id: string | null;
                    egress_quota_bytes: number | null;
                    name: string | null;
                    slug: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status: "active" | "paused" | "churned" | null;
                    timezone: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    client_id?: string | null;
                    egress_quota_bytes?: number | null;
                    name?: string | null;
                    slug?: string | null;
                    source?: never;
                    status?: "active" | "paused" | "churned" | null;
                    timezone?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    client_id?: string | null;
                    egress_quota_bytes?: number | null;
                    name?: string | null;
                    slug?: string | null;
                    source?: never;
                    status?: "active" | "paused" | "churned" | null;
                    timezone?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [];
            };
            connector_health_v1: {
                Row: {
                    client_id: string | null;
                    computed_at: string | null;
                    last_error: string | null;
                    last_run_at: string | null;
                    last_success_at: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
                    status_since: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    client_id?: string | null;
                    computed_at?: string | null;
                    last_error?: string | null;
                    last_run_at?: string | null;
                    last_success_at?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
                    status_since?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    client_id?: string | null;
                    computed_at?: string | null;
                    last_error?: string | null;
                    last_run_at?: string | null;
                    last_success_at?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
                    status_since?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "connector_health_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "connector_health_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            creative_daily_v1: {
                Row: {
                    ad_id: string | null;
                    ad_name: string | null;
                    adset_id: string | null;
                    campaign_id: string | null;
                    clicks: number | null;
                    client_id: string | null;
                    cpc_minor: number | null;
                    cpp_minor: number | null;
                    ctr: number | null;
                    currency: string | null;
                    day: string | null;
                    image_hash: string | null;
                    impressions: number | null;
                    media_id: string | null;
                    purchase_value_minor: number | null;
                    purchases: number | null;
                    reach: number | null;
                    roas: number | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    spend_minor: number | null;
                    storage_path: string | null;
                    thumb_path: string | null;
                    updated_at: string | null;
                };
                Relationships: [{
                    foreignKeyName: "daily_metrics_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "daily_metrics_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            customers_v1: {
                Row: {
                    attributes: import("./database.types.js").Json | null;
                    client_id: string | null;
                    created_at: string | null;
                    currency: string | null;
                    email: string | null;
                    external_id: string | null;
                    first_order_at: string | null;
                    id: string | null;
                    name: string | null;
                    orders_count: number | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at: string | null;
                    total_spent_minor: number | null;
                    updated_at: string | null;
                };
                Insert: {
                    attributes?: import("./database.types.js").Json | null;
                    client_id?: string | null;
                    created_at?: string | null;
                    currency?: string | null;
                    email?: string | null;
                    external_id?: string | null;
                    first_order_at?: string | null;
                    id?: string | null;
                    name?: string | null;
                    orders_count?: number | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at?: string | null;
                    total_spent_minor?: number | null;
                    updated_at?: string | null;
                };
                Update: {
                    attributes?: import("./database.types.js").Json | null;
                    client_id?: string | null;
                    created_at?: string | null;
                    currency?: string | null;
                    email?: string | null;
                    external_id?: string | null;
                    first_order_at?: string | null;
                    id?: string | null;
                    name?: string | null;
                    orders_count?: number | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at?: string | null;
                    total_spent_minor?: number | null;
                    updated_at?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "customers_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "customers_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            daily_metrics_v1: {
                Row: {
                    client_id: string | null;
                    currency: string | null;
                    day: string | null;
                    entity_id: string | null;
                    entity_kind: string | null;
                    metric: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at: string | null;
                    value: number | null;
                };
                Insert: {
                    client_id?: string | null;
                    currency?: string | null;
                    day?: string | null;
                    entity_id?: string | null;
                    entity_kind?: string | null;
                    metric?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at?: string | null;
                    value?: number | null;
                };
                Update: {
                    client_id?: string | null;
                    currency?: string | null;
                    day?: string | null;
                    entity_id?: string | null;
                    entity_kind?: string | null;
                    metric?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at?: string | null;
                    value?: number | null;
                };
                Relationships: [{
                    foreignKeyName: "daily_metrics_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "daily_metrics_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            daily_summary_v1: {
                Row: {
                    ad_clicks: number | null;
                    ad_currency: string | null;
                    ad_impressions: number | null;
                    ad_purchase_value_minor: number | null;
                    ad_purchases: number | null;
                    ad_spend_minor: number | null;
                    aov_minor: number | null;
                    client_id: string | null;
                    conversion_rate: number | null;
                    currency: string | null;
                    day: string | null;
                    inventory_units: number | null;
                    orders: number | null;
                    payouts_minor: number | null;
                    refunds_minor: number | null;
                    revenue_minor: number | null;
                    roas: number | null;
                    sessions: number | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at: string | null;
                };
                Relationships: [];
            };
            egress_status_v1: {
                Row: {
                    bytes_used: number | null;
                    client_id: string | null;
                    exceeded: boolean | null;
                    month: string | null;
                    quota_bytes: number | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at: string | null;
                };
                Relationships: [];
            };
            jobs_v1: {
                Row: {
                    client_id: string | null;
                    deleted_at: string | null;
                    due_on: string | null;
                    external_id: string | null;
                    group_name: string | null;
                    id: string | null;
                    is_done: boolean | null;
                    kind: string | null;
                    owner: string | null;
                    priority: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at: string | null;
                    status: string | null;
                    title: string | null;
                    updated_at: string | null;
                    url: string | null;
                };
                Insert: {
                    client_id?: string | null;
                    deleted_at?: string | null;
                    due_on?: string | null;
                    external_id?: string | null;
                    group_name?: string | null;
                    id?: string | null;
                    is_done?: boolean | null;
                    kind?: string | null;
                    owner?: string | null;
                    priority?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at?: string | null;
                    status?: string | null;
                    title?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                };
                Update: {
                    client_id?: string | null;
                    deleted_at?: string | null;
                    due_on?: string | null;
                    external_id?: string | null;
                    group_name?: string | null;
                    id?: string | null;
                    is_done?: boolean | null;
                    kind?: string | null;
                    owner?: string | null;
                    priority?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at?: string | null;
                    status?: string | null;
                    title?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "jobs_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "jobs_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            media_set_items_v1: {
                Row: {
                    added_at: string | null;
                    client_id: string | null;
                    media_id: string | null;
                    position: number | null;
                    set_id: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at: string | null;
                };
                Insert: {
                    added_at?: string | null;
                    client_id?: string | null;
                    media_id?: string | null;
                    position?: number | null;
                    set_id?: string | null;
                    source?: never;
                    updated_at?: string | null;
                };
                Update: {
                    added_at?: string | null;
                    client_id?: string | null;
                    media_id?: string | null;
                    position?: number | null;
                    set_id?: string | null;
                    source?: never;
                    updated_at?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "media_set_items_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "media_set_items_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "media_set_items_media_id_fkey";
                    columns: ["media_id"];
                    isOneToOne: false;
                    referencedRelation: "creative_daily_v1";
                    referencedColumns: ["media_id"];
                }, {
                    foreignKeyName: "media_set_items_media_id_fkey";
                    columns: ["media_id"];
                    isOneToOne: false;
                    referencedRelation: "media_v1";
                    referencedColumns: ["id"];
                }, {
                    foreignKeyName: "media_set_items_set_id_fkey";
                    columns: ["set_id"];
                    isOneToOne: false;
                    referencedRelation: "media_sets_v1";
                    referencedColumns: ["id"];
                }];
            };
            media_sets_v1: {
                Row: {
                    client_id: string | null;
                    cover_thumb_path: string | null;
                    created_at: string | null;
                    description: string | null;
                    file_count: number | null;
                    id: string | null;
                    name: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at: string | null;
                };
                Insert: {
                    client_id?: string | null;
                    cover_thumb_path?: never;
                    created_at?: string | null;
                    description?: string | null;
                    file_count?: never;
                    id?: string | null;
                    name?: string | null;
                    source?: never;
                    updated_at?: string | null;
                };
                Update: {
                    client_id?: string | null;
                    cover_thumb_path?: never;
                    created_at?: string | null;
                    description?: string | null;
                    file_count?: never;
                    id?: string | null;
                    name?: string | null;
                    source?: never;
                    updated_at?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "media_sets_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "media_sets_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            media_v1: {
                Row: {
                    bytes: number | null;
                    client_id: string | null;
                    created_at: string | null;
                    deleted_at: string | null;
                    external_id: string | null;
                    filename: string | null;
                    height: number | null;
                    id: string | null;
                    kind: string | null;
                    mime: string | null;
                    purge_after: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    storage_path: string | null;
                    tags: string[] | null;
                    thumb_path: string | null;
                    title: string | null;
                    updated_at: string | null;
                    uploaded_by: string | null;
                    width: number | null;
                };
                Insert: {
                    bytes?: number | null;
                    client_id?: string | null;
                    created_at?: string | null;
                    deleted_at?: string | null;
                    external_id?: string | null;
                    filename?: string | null;
                    height?: number | null;
                    id?: string | null;
                    kind?: string | null;
                    mime?: string | null;
                    purge_after?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    storage_path?: string | null;
                    tags?: string[] | null;
                    thumb_path?: string | null;
                    title?: string | null;
                    updated_at?: string | null;
                    uploaded_by?: string | null;
                    width?: number | null;
                };
                Update: {
                    bytes?: number | null;
                    client_id?: string | null;
                    created_at?: string | null;
                    deleted_at?: string | null;
                    external_id?: string | null;
                    filename?: string | null;
                    height?: number | null;
                    id?: string | null;
                    kind?: string | null;
                    mime?: string | null;
                    purge_after?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    storage_path?: string | null;
                    tags?: string[] | null;
                    thumb_path?: string | null;
                    title?: string | null;
                    updated_at?: string | null;
                    uploaded_by?: string | null;
                    width?: number | null;
                };
                Relationships: [{
                    foreignKeyName: "media_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "media_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            memberships_v1: {
                Row: {
                    client_id: string | null;
                    created_at: string | null;
                    is_smoke: boolean | null;
                    role: "member" | "owner" | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at: string | null;
                    user_id: string | null;
                };
                Insert: {
                    client_id?: string | null;
                    created_at?: string | null;
                    is_smoke?: boolean | null;
                    role?: "member" | "owner" | null;
                    source?: never;
                    updated_at?: string | null;
                    user_id?: string | null;
                };
                Update: {
                    client_id?: string | null;
                    created_at?: string | null;
                    is_smoke?: boolean | null;
                    role?: "member" | "owner" | null;
                    source?: never;
                    updated_at?: string | null;
                    user_id?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "memberships_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "memberships_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            messages_v1: {
                Row: {
                    attributes: import("./database.types.js").Json | null;
                    body: string | null;
                    client_id: string | null;
                    external_id: string | null;
                    id: string | null;
                    kind: string | null;
                    occurred_at: string | null;
                    participants: string[] | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title: string | null;
                    updated_at: string | null;
                    url: string | null;
                };
                Insert: {
                    attributes?: import("./database.types.js").Json | null;
                    body?: string | null;
                    client_id?: string | null;
                    external_id?: string | null;
                    id?: string | null;
                    kind?: string | null;
                    occurred_at?: string | null;
                    participants?: string[] | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                };
                Update: {
                    attributes?: import("./database.types.js").Json | null;
                    body?: string | null;
                    client_id?: string | null;
                    external_id?: string | null;
                    id?: string | null;
                    kind?: string | null;
                    occurred_at?: string | null;
                    participants?: string[] | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "messages_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "messages_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            money_v1: {
                Row: {
                    amount_minor: number | null;
                    attributes: import("./database.types.js").Json | null;
                    client_id: string | null;
                    currency: string | null;
                    customer_external_id: string | null;
                    day: string | null;
                    external_id: string | null;
                    id: string | null;
                    items_count: number | null;
                    kind: string | null;
                    occurred_at: string | null;
                    order_number: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at: string | null;
                    status: string | null;
                    updated_at: string | null;
                    url: string | null;
                };
                Insert: {
                    amount_minor?: number | null;
                    attributes?: import("./database.types.js").Json | null;
                    client_id?: string | null;
                    currency?: string | null;
                    customer_external_id?: string | null;
                    day?: string | null;
                    external_id?: string | null;
                    id?: string | null;
                    items_count?: number | null;
                    kind?: string | null;
                    occurred_at?: string | null;
                    order_number?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at?: string | null;
                    status?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                };
                Update: {
                    amount_minor?: number | null;
                    attributes?: import("./database.types.js").Json | null;
                    client_id?: string | null;
                    currency?: string | null;
                    customer_external_id?: string | null;
                    day?: string | null;
                    external_id?: string | null;
                    id?: string | null;
                    items_count?: number | null;
                    kind?: string | null;
                    occurred_at?: string | null;
                    order_number?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at?: string | null;
                    status?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "money_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "money_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            products_v1: {
                Row: {
                    attributes: import("./database.types.js").Json | null;
                    client_id: string | null;
                    currency: string | null;
                    external_id: string | null;
                    handle: string | null;
                    id: string | null;
                    image_url: string | null;
                    inventory_quantity: number | null;
                    price_minor: number | null;
                    product_type: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status: string | null;
                    title: string | null;
                    updated_at: string | null;
                    url: string | null;
                    variants_count: number | null;
                    vendor: string | null;
                };
                Insert: {
                    attributes?: import("./database.types.js").Json | null;
                    client_id?: string | null;
                    currency?: string | null;
                    external_id?: string | null;
                    handle?: string | null;
                    id?: string | null;
                    image_url?: string | null;
                    inventory_quantity?: number | null;
                    price_minor?: number | null;
                    product_type?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status?: string | null;
                    title?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                    variants_count?: number | null;
                    vendor?: string | null;
                };
                Update: {
                    attributes?: import("./database.types.js").Json | null;
                    client_id?: string | null;
                    currency?: string | null;
                    external_id?: string | null;
                    handle?: string | null;
                    id?: string | null;
                    image_url?: string | null;
                    inventory_quantity?: number | null;
                    price_minor?: number | null;
                    product_type?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status?: string | null;
                    title?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                    variants_count?: number | null;
                    vendor?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "products_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "products_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            records_v1: {
                Row: {
                    attributes: import("./database.types.js").Json | null;
                    body: string | null;
                    client_id: string | null;
                    external_id: string | null;
                    id: string | null;
                    kind: string | null;
                    occurred_at: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    attributes?: import("./database.types.js").Json | null;
                    body?: string | null;
                    client_id?: string | null;
                    external_id?: string | null;
                    id?: string | null;
                    kind?: string | null;
                    occurred_at?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    attributes?: import("./database.types.js").Json | null;
                    body?: string | null;
                    client_id?: string | null;
                    external_id?: string | null;
                    id?: string | null;
                    kind?: string | null;
                    occurred_at?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "records_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "records_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
        })[K]["Row"];
    };
    Returns: any;
} ? K_2 : never : never; }[keyof ({} & {
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
})[K]["Row"]] extends never ? {
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
}[K]["Row"] : Omit<{
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
}[K]["Row"], { [K_2 in keyof ({} & {
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
})[K]["Row"]]: K_2 extends "bulk_tag" | "create_media_set" | "delete_media" | "delete_media_set" | "delete_record" | "download_url" | "register_upload" | "remove_member" | "reorder_media_set_items" | "report_dashboard_version" | "restore_media" | "save_record" | "set_media_set_items" | "update_media" | "update_media_set" ? [{
    bulk_tag: {
        Args: {
            add?: string[];
            media_ids: string[];
            remove?: string[];
        };
        Returns: number;
    };
    create_media_set: {
        Args: {
            description?: string;
            name: string;
        };
        Returns: string;
    };
    delete_media: {
        Args: {
            media_ids: string[];
        };
        Returns: number;
    };
    delete_media_set: {
        Args: {
            set_id: string;
        };
        Returns: undefined;
    };
    delete_record: {
        Args: {
            record_id: string;
        };
        Returns: undefined;
    };
    download_url: {
        Args: {
            media_id: string;
        };
        Returns: import("./database.types.js").Json;
    };
    register_upload: {
        Args: {
            path: string;
            tags?: string[];
            title?: string;
        };
        Returns: string;
    };
    remove_member: {
        Args: {
            target_user_id: string;
        };
        Returns: undefined;
    };
    reorder_media_set_items: {
        Args: {
            media_ids: string[];
            set_id: string;
        };
        Returns: undefined;
    };
    report_dashboard_version: {
        Args: {
            api_version: string;
            app_version: string;
        };
        Returns: undefined;
    };
    restore_media: {
        Args: {
            media_ids: string[];
        };
        Returns: number;
    };
    save_record: {
        Args: {
            attributes: import("./database.types.js").Json;
            body?: string;
            external_id?: string;
            kind: string;
            occurred_at?: string;
            title?: string;
        };
        Returns: string;
    };
    set_media_set_items: {
        Args: {
            action: string;
            media_ids: string[];
            set_id: string;
        };
        Returns: number;
    };
    update_media: {
        Args: {
            media_id: string;
            tags?: string[];
            title?: string;
        };
        Returns: undefined;
    };
    update_media_set: {
        Args: {
            description?: string;
            name?: string;
            set_id: string;
        };
        Returns: undefined;
    };
}[K_2]["Args"]] extends [never] ? never : {
    bulk_tag: {
        Args: {
            add?: string[];
            media_ids: string[];
            remove?: string[];
        };
        Returns: number;
    };
    create_media_set: {
        Args: {
            description?: string;
            name: string;
        };
        Returns: string;
    };
    delete_media: {
        Args: {
            media_ids: string[];
        };
        Returns: number;
    };
    delete_media_set: {
        Args: {
            set_id: string;
        };
        Returns: undefined;
    };
    delete_record: {
        Args: {
            record_id: string;
        };
        Returns: undefined;
    };
    download_url: {
        Args: {
            media_id: string;
        };
        Returns: import("./database.types.js").Json;
    };
    register_upload: {
        Args: {
            path: string;
            tags?: string[];
            title?: string;
        };
        Returns: string;
    };
    remove_member: {
        Args: {
            target_user_id: string;
        };
        Returns: undefined;
    };
    reorder_media_set_items: {
        Args: {
            media_ids: string[];
            set_id: string;
        };
        Returns: undefined;
    };
    report_dashboard_version: {
        Args: {
            api_version: string;
            app_version: string;
        };
        Returns: undefined;
    };
    restore_media: {
        Args: {
            media_ids: string[];
        };
        Returns: number;
    };
    save_record: {
        Args: {
            attributes: import("./database.types.js").Json;
            body?: string;
            external_id?: string;
            kind: string;
            occurred_at?: string;
            title?: string;
        };
        Returns: string;
    };
    set_media_set_items: {
        Args: {
            action: string;
            media_ids: string[];
            set_id: string;
        };
        Returns: number;
    };
    update_media: {
        Args: {
            media_id: string;
            tags?: string[];
            title?: string;
        };
        Returns: undefined;
    };
    update_media_set: {
        Args: {
            description?: string;
            name?: string;
            set_id: string;
        };
        Returns: undefined;
    };
}[K_2] extends {
    Args: {
        '': ({} & {
            activity_v1: {
                Row: {
                    client_id: string | null;
                    detail: string | null;
                    kind: string | null;
                    occurred_at: string | null;
                    ref_id: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title: string | null;
                    updated_at: string | null;
                    url: string | null;
                };
                Relationships: [];
            };
            campaign_daily_v1: {
                Row: {
                    campaign_id: string | null;
                    campaign_name: string | null;
                    campaign_status: string | null;
                    clicks: number | null;
                    client_id: string | null;
                    cpc_minor: number | null;
                    cpp_minor: number | null;
                    ctr: number | null;
                    currency: string | null;
                    day: string | null;
                    impressions: number | null;
                    objective: string | null;
                    purchase_value_minor: number | null;
                    purchases: number | null;
                    reach: number | null;
                    roas: number | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    spend_minor: number | null;
                    updated_at: string | null;
                };
                Relationships: [{
                    foreignKeyName: "daily_metrics_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "daily_metrics_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            client_v1: {
                Row: {
                    client_id: string | null;
                    egress_quota_bytes: number | null;
                    name: string | null;
                    slug: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status: "active" | "paused" | "churned" | null;
                    timezone: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    client_id?: string | null;
                    egress_quota_bytes?: number | null;
                    name?: string | null;
                    slug?: string | null;
                    source?: never;
                    status?: "active" | "paused" | "churned" | null;
                    timezone?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    client_id?: string | null;
                    egress_quota_bytes?: number | null;
                    name?: string | null;
                    slug?: string | null;
                    source?: never;
                    status?: "active" | "paused" | "churned" | null;
                    timezone?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [];
            };
            connector_health_v1: {
                Row: {
                    client_id: string | null;
                    computed_at: string | null;
                    last_error: string | null;
                    last_run_at: string | null;
                    last_success_at: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
                    status_since: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    client_id?: string | null;
                    computed_at?: string | null;
                    last_error?: string | null;
                    last_run_at?: string | null;
                    last_success_at?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
                    status_since?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    client_id?: string | null;
                    computed_at?: string | null;
                    last_error?: string | null;
                    last_run_at?: string | null;
                    last_success_at?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
                    status_since?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "connector_health_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "connector_health_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            creative_daily_v1: {
                Row: {
                    ad_id: string | null;
                    ad_name: string | null;
                    adset_id: string | null;
                    campaign_id: string | null;
                    clicks: number | null;
                    client_id: string | null;
                    cpc_minor: number | null;
                    cpp_minor: number | null;
                    ctr: number | null;
                    currency: string | null;
                    day: string | null;
                    image_hash: string | null;
                    impressions: number | null;
                    media_id: string | null;
                    purchase_value_minor: number | null;
                    purchases: number | null;
                    reach: number | null;
                    roas: number | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    spend_minor: number | null;
                    storage_path: string | null;
                    thumb_path: string | null;
                    updated_at: string | null;
                };
                Relationships: [{
                    foreignKeyName: "daily_metrics_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "daily_metrics_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            customers_v1: {
                Row: {
                    attributes: import("./database.types.js").Json | null;
                    client_id: string | null;
                    created_at: string | null;
                    currency: string | null;
                    email: string | null;
                    external_id: string | null;
                    first_order_at: string | null;
                    id: string | null;
                    name: string | null;
                    orders_count: number | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at: string | null;
                    total_spent_minor: number | null;
                    updated_at: string | null;
                };
                Insert: {
                    attributes?: import("./database.types.js").Json | null;
                    client_id?: string | null;
                    created_at?: string | null;
                    currency?: string | null;
                    email?: string | null;
                    external_id?: string | null;
                    first_order_at?: string | null;
                    id?: string | null;
                    name?: string | null;
                    orders_count?: number | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at?: string | null;
                    total_spent_minor?: number | null;
                    updated_at?: string | null;
                };
                Update: {
                    attributes?: import("./database.types.js").Json | null;
                    client_id?: string | null;
                    created_at?: string | null;
                    currency?: string | null;
                    email?: string | null;
                    external_id?: string | null;
                    first_order_at?: string | null;
                    id?: string | null;
                    name?: string | null;
                    orders_count?: number | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at?: string | null;
                    total_spent_minor?: number | null;
                    updated_at?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "customers_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "customers_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            daily_metrics_v1: {
                Row: {
                    client_id: string | null;
                    currency: string | null;
                    day: string | null;
                    entity_id: string | null;
                    entity_kind: string | null;
                    metric: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at: string | null;
                    value: number | null;
                };
                Insert: {
                    client_id?: string | null;
                    currency?: string | null;
                    day?: string | null;
                    entity_id?: string | null;
                    entity_kind?: string | null;
                    metric?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at?: string | null;
                    value?: number | null;
                };
                Update: {
                    client_id?: string | null;
                    currency?: string | null;
                    day?: string | null;
                    entity_id?: string | null;
                    entity_kind?: string | null;
                    metric?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at?: string | null;
                    value?: number | null;
                };
                Relationships: [{
                    foreignKeyName: "daily_metrics_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "daily_metrics_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            daily_summary_v1: {
                Row: {
                    ad_clicks: number | null;
                    ad_currency: string | null;
                    ad_impressions: number | null;
                    ad_purchase_value_minor: number | null;
                    ad_purchases: number | null;
                    ad_spend_minor: number | null;
                    aov_minor: number | null;
                    client_id: string | null;
                    conversion_rate: number | null;
                    currency: string | null;
                    day: string | null;
                    inventory_units: number | null;
                    orders: number | null;
                    payouts_minor: number | null;
                    refunds_minor: number | null;
                    revenue_minor: number | null;
                    roas: number | null;
                    sessions: number | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at: string | null;
                };
                Relationships: [];
            };
            egress_status_v1: {
                Row: {
                    bytes_used: number | null;
                    client_id: string | null;
                    exceeded: boolean | null;
                    month: string | null;
                    quota_bytes: number | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at: string | null;
                };
                Relationships: [];
            };
            jobs_v1: {
                Row: {
                    client_id: string | null;
                    deleted_at: string | null;
                    due_on: string | null;
                    external_id: string | null;
                    group_name: string | null;
                    id: string | null;
                    is_done: boolean | null;
                    kind: string | null;
                    owner: string | null;
                    priority: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at: string | null;
                    status: string | null;
                    title: string | null;
                    updated_at: string | null;
                    url: string | null;
                };
                Insert: {
                    client_id?: string | null;
                    deleted_at?: string | null;
                    due_on?: string | null;
                    external_id?: string | null;
                    group_name?: string | null;
                    id?: string | null;
                    is_done?: boolean | null;
                    kind?: string | null;
                    owner?: string | null;
                    priority?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at?: string | null;
                    status?: string | null;
                    title?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                };
                Update: {
                    client_id?: string | null;
                    deleted_at?: string | null;
                    due_on?: string | null;
                    external_id?: string | null;
                    group_name?: string | null;
                    id?: string | null;
                    is_done?: boolean | null;
                    kind?: string | null;
                    owner?: string | null;
                    priority?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at?: string | null;
                    status?: string | null;
                    title?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "jobs_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "jobs_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            media_set_items_v1: {
                Row: {
                    added_at: string | null;
                    client_id: string | null;
                    media_id: string | null;
                    position: number | null;
                    set_id: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at: string | null;
                };
                Insert: {
                    added_at?: string | null;
                    client_id?: string | null;
                    media_id?: string | null;
                    position?: number | null;
                    set_id?: string | null;
                    source?: never;
                    updated_at?: string | null;
                };
                Update: {
                    added_at?: string | null;
                    client_id?: string | null;
                    media_id?: string | null;
                    position?: number | null;
                    set_id?: string | null;
                    source?: never;
                    updated_at?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "media_set_items_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "media_set_items_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "media_set_items_media_id_fkey";
                    columns: ["media_id"];
                    isOneToOne: false;
                    referencedRelation: "creative_daily_v1";
                    referencedColumns: ["media_id"];
                }, {
                    foreignKeyName: "media_set_items_media_id_fkey";
                    columns: ["media_id"];
                    isOneToOne: false;
                    referencedRelation: "media_v1";
                    referencedColumns: ["id"];
                }, {
                    foreignKeyName: "media_set_items_set_id_fkey";
                    columns: ["set_id"];
                    isOneToOne: false;
                    referencedRelation: "media_sets_v1";
                    referencedColumns: ["id"];
                }];
            };
            media_sets_v1: {
                Row: {
                    client_id: string | null;
                    cover_thumb_path: string | null;
                    created_at: string | null;
                    description: string | null;
                    file_count: number | null;
                    id: string | null;
                    name: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at: string | null;
                };
                Insert: {
                    client_id?: string | null;
                    cover_thumb_path?: never;
                    created_at?: string | null;
                    description?: string | null;
                    file_count?: never;
                    id?: string | null;
                    name?: string | null;
                    source?: never;
                    updated_at?: string | null;
                };
                Update: {
                    client_id?: string | null;
                    cover_thumb_path?: never;
                    created_at?: string | null;
                    description?: string | null;
                    file_count?: never;
                    id?: string | null;
                    name?: string | null;
                    source?: never;
                    updated_at?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "media_sets_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "media_sets_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            media_v1: {
                Row: {
                    bytes: number | null;
                    client_id: string | null;
                    created_at: string | null;
                    deleted_at: string | null;
                    external_id: string | null;
                    filename: string | null;
                    height: number | null;
                    id: string | null;
                    kind: string | null;
                    mime: string | null;
                    purge_after: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    storage_path: string | null;
                    tags: string[] | null;
                    thumb_path: string | null;
                    title: string | null;
                    updated_at: string | null;
                    uploaded_by: string | null;
                    width: number | null;
                };
                Insert: {
                    bytes?: number | null;
                    client_id?: string | null;
                    created_at?: string | null;
                    deleted_at?: string | null;
                    external_id?: string | null;
                    filename?: string | null;
                    height?: number | null;
                    id?: string | null;
                    kind?: string | null;
                    mime?: string | null;
                    purge_after?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    storage_path?: string | null;
                    tags?: string[] | null;
                    thumb_path?: string | null;
                    title?: string | null;
                    updated_at?: string | null;
                    uploaded_by?: string | null;
                    width?: number | null;
                };
                Update: {
                    bytes?: number | null;
                    client_id?: string | null;
                    created_at?: string | null;
                    deleted_at?: string | null;
                    external_id?: string | null;
                    filename?: string | null;
                    height?: number | null;
                    id?: string | null;
                    kind?: string | null;
                    mime?: string | null;
                    purge_after?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    storage_path?: string | null;
                    tags?: string[] | null;
                    thumb_path?: string | null;
                    title?: string | null;
                    updated_at?: string | null;
                    uploaded_by?: string | null;
                    width?: number | null;
                };
                Relationships: [{
                    foreignKeyName: "media_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "media_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            memberships_v1: {
                Row: {
                    client_id: string | null;
                    created_at: string | null;
                    is_smoke: boolean | null;
                    role: "member" | "owner" | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    updated_at: string | null;
                    user_id: string | null;
                };
                Insert: {
                    client_id?: string | null;
                    created_at?: string | null;
                    is_smoke?: boolean | null;
                    role?: "member" | "owner" | null;
                    source?: never;
                    updated_at?: string | null;
                    user_id?: string | null;
                };
                Update: {
                    client_id?: string | null;
                    created_at?: string | null;
                    is_smoke?: boolean | null;
                    role?: "member" | "owner" | null;
                    source?: never;
                    updated_at?: string | null;
                    user_id?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "memberships_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "memberships_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            messages_v1: {
                Row: {
                    attributes: import("./database.types.js").Json | null;
                    body: string | null;
                    client_id: string | null;
                    external_id: string | null;
                    id: string | null;
                    kind: string | null;
                    occurred_at: string | null;
                    participants: string[] | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title: string | null;
                    updated_at: string | null;
                    url: string | null;
                };
                Insert: {
                    attributes?: import("./database.types.js").Json | null;
                    body?: string | null;
                    client_id?: string | null;
                    external_id?: string | null;
                    id?: string | null;
                    kind?: string | null;
                    occurred_at?: string | null;
                    participants?: string[] | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                };
                Update: {
                    attributes?: import("./database.types.js").Json | null;
                    body?: string | null;
                    client_id?: string | null;
                    external_id?: string | null;
                    id?: string | null;
                    kind?: string | null;
                    occurred_at?: string | null;
                    participants?: string[] | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "messages_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "messages_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            money_v1: {
                Row: {
                    amount_minor: number | null;
                    attributes: import("./database.types.js").Json | null;
                    client_id: string | null;
                    currency: string | null;
                    customer_external_id: string | null;
                    day: string | null;
                    external_id: string | null;
                    id: string | null;
                    items_count: number | null;
                    kind: string | null;
                    occurred_at: string | null;
                    order_number: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at: string | null;
                    status: string | null;
                    updated_at: string | null;
                    url: string | null;
                };
                Insert: {
                    amount_minor?: number | null;
                    attributes?: import("./database.types.js").Json | null;
                    client_id?: string | null;
                    currency?: string | null;
                    customer_external_id?: string | null;
                    day?: string | null;
                    external_id?: string | null;
                    id?: string | null;
                    items_count?: number | null;
                    kind?: string | null;
                    occurred_at?: string | null;
                    order_number?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at?: string | null;
                    status?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                };
                Update: {
                    amount_minor?: number | null;
                    attributes?: import("./database.types.js").Json | null;
                    client_id?: string | null;
                    currency?: string | null;
                    customer_external_id?: string | null;
                    day?: string | null;
                    external_id?: string | null;
                    id?: string | null;
                    items_count?: number | null;
                    kind?: string | null;
                    occurred_at?: string | null;
                    order_number?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    source_updated_at?: string | null;
                    status?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "money_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "money_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            products_v1: {
                Row: {
                    attributes: import("./database.types.js").Json | null;
                    client_id: string | null;
                    currency: string | null;
                    external_id: string | null;
                    handle: string | null;
                    id: string | null;
                    image_url: string | null;
                    inventory_quantity: number | null;
                    price_minor: number | null;
                    product_type: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status: string | null;
                    title: string | null;
                    updated_at: string | null;
                    url: string | null;
                    variants_count: number | null;
                    vendor: string | null;
                };
                Insert: {
                    attributes?: import("./database.types.js").Json | null;
                    client_id?: string | null;
                    currency?: string | null;
                    external_id?: string | null;
                    handle?: string | null;
                    id?: string | null;
                    image_url?: string | null;
                    inventory_quantity?: number | null;
                    price_minor?: number | null;
                    product_type?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status?: string | null;
                    title?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                    variants_count?: number | null;
                    vendor?: string | null;
                };
                Update: {
                    attributes?: import("./database.types.js").Json | null;
                    client_id?: string | null;
                    currency?: string | null;
                    external_id?: string | null;
                    handle?: string | null;
                    id?: string | null;
                    image_url?: string | null;
                    inventory_quantity?: number | null;
                    price_minor?: number | null;
                    product_type?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    status?: string | null;
                    title?: string | null;
                    updated_at?: string | null;
                    url?: string | null;
                    variants_count?: number | null;
                    vendor?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "products_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "products_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
            records_v1: {
                Row: {
                    attributes: import("./database.types.js").Json | null;
                    body: string | null;
                    client_id: string | null;
                    external_id: string | null;
                    id: string | null;
                    kind: string | null;
                    occurred_at: string | null;
                    source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    attributes?: import("./database.types.js").Json | null;
                    body?: string | null;
                    client_id?: string | null;
                    external_id?: string | null;
                    id?: string | null;
                    kind?: string | null;
                    occurred_at?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    attributes?: import("./database.types.js").Json | null;
                    body?: string | null;
                    client_id?: string | null;
                    external_id?: string | null;
                    id?: string | null;
                    kind?: string | null;
                    occurred_at?: string | null;
                    source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
                    title?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [{
                    foreignKeyName: "records_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "client_v1";
                    referencedColumns: ["client_id"];
                }, {
                    foreignKeyName: "records_client_id_fkey";
                    columns: ["client_id"];
                    isOneToOne: false;
                    referencedRelation: "egress_status_v1";
                    referencedColumns: ["client_id"];
                }];
            };
        })[K]["Row"];
    };
    Returns: any;
} ? K_2 : never : never; }[keyof ({} & {
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
})[K]["Row"]]>) extends infer FieldResult_1 ? FieldResult_1 extends Record<string, unknown> ? {} & FieldResult_1 extends infer T_3 ? { [K_3 in keyof T_3]: T_3[K_3]; } : never : FieldResult_1 extends {
    error: true;
} & infer E_1 extends string ? {
    error: true;
} & E_1 : {
    error: true;
} & "Could not retrieve a valid record or error value" : {
    error: true;
} & "Processing node failed." : {
    error: true;
} & "Invalid Relationships cannot infer result type" : {
    error: true;
} & "Invalid RelationName cannot infer result type" : never : never)[], K, {
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
}[K] extends infer T_5 ? T_5 extends {
    activity_v1: {
        Row: {
            client_id: string | null;
            detail: string | null;
            kind: string | null;
            occurred_at: string | null;
            ref_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Relationships: [];
    };
    campaign_daily_v1: {
        Row: {
            campaign_id: string | null;
            campaign_name: string | null;
            campaign_status: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            impressions: number | null;
            objective: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    client_v1: {
        Row: {
            client_id: string | null;
            egress_quota_bytes: number | null;
            name: string | null;
            slug: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "active" | "paused" | "churned" | null;
            timezone: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            egress_quota_bytes?: number | null;
            name?: string | null;
            slug?: string | null;
            source?: never;
            status?: "active" | "paused" | "churned" | null;
            timezone?: string | null;
            updated_at?: string | null;
        };
        Relationships: [];
    };
    connector_health_v1: {
        Row: {
            client_id: string | null;
            computed_at: string | null;
            last_error: string | null;
            last_run_at: string | null;
            last_success_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since: string | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            computed_at?: string | null;
            last_error?: string | null;
            last_run_at?: string | null;
            last_success_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: "ok" | "stale" | "auth_failed" | "error" | "never_ran" | null;
            status_since?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "connector_health_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    creative_daily_v1: {
        Row: {
            ad_id: string | null;
            ad_name: string | null;
            adset_id: string | null;
            campaign_id: string | null;
            clicks: number | null;
            client_id: string | null;
            cpc_minor: number | null;
            cpp_minor: number | null;
            ctr: number | null;
            currency: string | null;
            day: string | null;
            image_hash: string | null;
            impressions: number | null;
            media_id: string | null;
            purchase_value_minor: number | null;
            purchases: number | null;
            reach: number | null;
            roas: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            spend_minor: number | null;
            storage_path: string | null;
            thumb_path: string | null;
            updated_at: string | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    customers_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            created_at: string | null;
            currency: string | null;
            email: string | null;
            external_id: string | null;
            first_order_at: string | null;
            id: string | null;
            name: string | null;
            orders_count: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            total_spent_minor: number | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            created_at?: string | null;
            currency?: string | null;
            email?: string | null;
            external_id?: string | null;
            first_order_at?: string | null;
            id?: string | null;
            name?: string | null;
            orders_count?: number | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            total_spent_minor?: number | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "customers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_metrics_v1: {
        Row: {
            client_id: string | null;
            currency: string | null;
            day: string | null;
            entity_id: string | null;
            entity_kind: string | null;
            metric: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            value: number | null;
        };
        Insert: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Update: {
            client_id?: string | null;
            currency?: string | null;
            day?: string | null;
            entity_id?: string | null;
            entity_kind?: string | null;
            metric?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at?: string | null;
            value?: number | null;
        };
        Relationships: [{
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "daily_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    daily_summary_v1: {
        Row: {
            ad_clicks: number | null;
            ad_currency: string | null;
            ad_impressions: number | null;
            ad_purchase_value_minor: number | null;
            ad_purchases: number | null;
            ad_spend_minor: number | null;
            aov_minor: number | null;
            client_id: string | null;
            conversion_rate: number | null;
            currency: string | null;
            day: string | null;
            inventory_units: number | null;
            orders: number | null;
            payouts_minor: number | null;
            refunds_minor: number | null;
            revenue_minor: number | null;
            roas: number | null;
            sessions: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    egress_status_v1: {
        Row: {
            bytes_used: number | null;
            client_id: string | null;
            exceeded: boolean | null;
            month: string | null;
            quota_bytes: number | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Relationships: [];
    };
    jobs_v1: {
        Row: {
            client_id: string | null;
            deleted_at: string | null;
            due_on: string | null;
            external_id: string | null;
            group_name: string | null;
            id: string | null;
            is_done: boolean | null;
            kind: string | null;
            owner: string | null;
            priority: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            client_id?: string | null;
            deleted_at?: string | null;
            due_on?: string | null;
            external_id?: string | null;
            group_name?: string | null;
            id?: string | null;
            is_done?: boolean | null;
            kind?: string | null;
            owner?: string | null;
            priority?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_set_items_v1: {
        Row: {
            added_at: string | null;
            client_id: string | null;
            media_id: string | null;
            position: number | null;
            set_id: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            added_at?: string | null;
            client_id?: string | null;
            media_id?: string | null;
            position?: number | null;
            set_id?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "creative_daily_v1";
            referencedColumns: ["media_id"];
        }, {
            foreignKeyName: "media_set_items_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_v1";
            referencedColumns: ["id"];
        }, {
            foreignKeyName: "media_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "media_sets_v1";
            referencedColumns: ["id"];
        }];
    };
    media_sets_v1: {
        Row: {
            client_id: string | null;
            cover_thumb_path: string | null;
            created_at: string | null;
            description: string | null;
            file_count: number | null;
            id: string | null;
            name: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
        };
        Insert: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Update: {
            client_id?: string | null;
            cover_thumb_path?: never;
            created_at?: string | null;
            description?: string | null;
            file_count?: never;
            id?: string | null;
            name?: string | null;
            source?: never;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    media_v1: {
        Row: {
            bytes: number | null;
            client_id: string | null;
            created_at: string | null;
            deleted_at: string | null;
            external_id: string | null;
            filename: string | null;
            height: number | null;
            id: string | null;
            kind: string | null;
            mime: string | null;
            purge_after: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path: string | null;
            tags: string[] | null;
            thumb_path: string | null;
            title: string | null;
            updated_at: string | null;
            uploaded_by: string | null;
            width: number | null;
        };
        Insert: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Update: {
            bytes?: number | null;
            client_id?: string | null;
            created_at?: string | null;
            deleted_at?: string | null;
            external_id?: string | null;
            filename?: string | null;
            height?: number | null;
            id?: string | null;
            kind?: string | null;
            mime?: string | null;
            purge_after?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            storage_path?: string | null;
            tags?: string[] | null;
            thumb_path?: string | null;
            title?: string | null;
            updated_at?: string | null;
            uploaded_by?: string | null;
            width?: number | null;
        };
        Relationships: [{
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "media_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    memberships_v1: {
        Row: {
            client_id: string | null;
            created_at: string | null;
            is_smoke: boolean | null;
            role: "member" | "owner" | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            updated_at: string | null;
            user_id: string | null;
        };
        Insert: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Update: {
            client_id?: string | null;
            created_at?: string | null;
            is_smoke?: boolean | null;
            role?: "member" | "owner" | null;
            source?: never;
            updated_at?: string | null;
            user_id?: string | null;
        };
        Relationships: [{
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "memberships_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    messages_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            participants: string[] | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            participants?: string[] | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    money_v1: {
        Row: {
            amount_minor: number | null;
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            customer_external_id: string | null;
            day: string | null;
            external_id: string | null;
            id: string | null;
            items_count: number | null;
            kind: string | null;
            occurred_at: string | null;
            order_number: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at: string | null;
            status: string | null;
            updated_at: string | null;
            url: string | null;
        };
        Insert: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Update: {
            amount_minor?: number | null;
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            customer_external_id?: string | null;
            day?: string | null;
            external_id?: string | null;
            id?: string | null;
            items_count?: number | null;
            kind?: string | null;
            occurred_at?: string | null;
            order_number?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            source_updated_at?: string | null;
            status?: string | null;
            updated_at?: string | null;
            url?: string | null;
        };
        Relationships: [{
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "money_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    products_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            client_id: string | null;
            currency: string | null;
            external_id: string | null;
            handle: string | null;
            id: string | null;
            image_url: string | null;
            inventory_quantity: number | null;
            price_minor: number | null;
            product_type: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status: string | null;
            title: string | null;
            updated_at: string | null;
            url: string | null;
            variants_count: number | null;
            vendor: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            client_id?: string | null;
            currency?: string | null;
            external_id?: string | null;
            handle?: string | null;
            id?: string | null;
            image_url?: string | null;
            inventory_quantity?: number | null;
            price_minor?: number | null;
            product_type?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            status?: string | null;
            title?: string | null;
            updated_at?: string | null;
            url?: string | null;
            variants_count?: number | null;
            vendor?: string | null;
        };
        Relationships: [{
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
    records_v1: {
        Row: {
            attributes: import("./database.types.js").Json | null;
            body: string | null;
            client_id: string | null;
            external_id: string | null;
            id: string | null;
            kind: string | null;
            occurred_at: string | null;
            source: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title: string | null;
            updated_at: string | null;
        };
        Insert: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Update: {
            attributes?: import("./database.types.js").Json | null;
            body?: string | null;
            client_id?: string | null;
            external_id?: string | null;
            id?: string | null;
            kind?: string | null;
            occurred_at?: string | null;
            source?: "shopify" | "meta" | "monday" | "meet" | "upload" | "dashboard" | "platform" | "drive" | null;
            title?: string | null;
            updated_at?: string | null;
        };
        Relationships: [{
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_v1";
            referencedColumns: ["client_id"];
        }, {
            foreignKeyName: "records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "egress_status_v1";
            referencedColumns: ["client_id"];
        }];
    };
}[K] ? T_5 extends {
    Relationships: infer R;
} ? R : unknown : never : never, "GET", false>;
type ViewsNamespace = {
    [K in (typeof VIEW_NAMES)[number]]: ReturnType<typeof viewBuilder<K>>;
};
type Functions = Api['Functions'];
declare const RPC_NAMES: readonly ["save_record", "delete_record", "register_upload", "update_media", "bulk_tag", "delete_media", "restore_media", "create_media_set", "update_media_set", "delete_media_set", "set_media_set_items", "reorder_media_set_items", "download_url", "report_dashboard_version", "remove_member"];
type RpcNamespace = {
    [K in (typeof RPC_NAMES)[number]]: (args: Functions[K]['Args']) => Promise<Functions[K]['Returns']>;
};
export interface MediaUploadOptions {
    title?: string;
    tags?: string[];
}
declare function buildMedia(client: SupabaseClient<Database, 'api'>, rpc: RpcNamespace, getToken: () => Promise<string | undefined>): {
    /** Storage upload to `<client_id>/orig/<uuid>.<ext>`, then `register_upload`. Returns the media id. */
    upload(file: File | Blob, opts?: MediaUploadOptions): Promise<string>;
    /** `download_url` (mints a 5-min egress ticket) then `createSignedUrl(path, 300)`. */
    downloadUrl(mediaId: string): Promise<string>;
    /** Thumbnails: no ticket, `createSignedUrls` in batches of 100. Returns path -> signed URL
     *  (null on a per-path error). NOTES: DESIGN.md doesn't state a thumbnail URL lifetime —
     *  reused the 300s (5 min) already used for `download_url`'s ticket. */
    thumbUrls(paths: string[]): Promise<Record<string, string | null>>;
};
export interface DataClient {
    views: ViewsNamespace;
    rpc: RpcNamespace;
    media: ReturnType<typeof buildMedia>;
    health: () => Promise<Api['Views']['client_v1']['Row']>;
}
/** Typed supabase-js client scoped to schema `api` only, wrapped per DESIGN.md §8. Nothing else. */
export declare function createDataClient(opts: CreateDataClientOptions): DataClient;
export interface SignInOptions {
    supabaseUrl: string;
    anonKey: string;
    email: string;
    password: string;
}
export interface SignedInDataClient extends DataClient {
    /** Current access token; refreshes when within 60s of expiry. */
    accessToken(): Promise<string>;
}
/** One private auth client, one password sign-in. Reused for `createDataClient`'s per-request
 *  token getter — see DESIGN.md §8's Agent-tools addition. */
export declare function signIn(opts: SignInOptions): Promise<SignedInDataClient>;
export type AgentViewName = ViewName;
export type AgentRpcName = 'save_record' | 'update_media' | 'bulk_tag';
export interface AgentToolsOptions {
    views?: AgentViewName[];
    rpcs?: AgentRpcName[];
}
export type JSONSchemaObject = {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
};
export interface AgentTool {
    name: string;
    description: string;
    input_schema: JSONSchemaObject;
}
export declare class ToolInputError extends Error {
}
/** Tool defs for the given options — always `read_view`, plus one tool per opted-in RPC (default
 *  none: a read-only agent). Destructive/egress/admin RPCs are never exposed. */
export declare function agentTools(opts?: AgentToolsOptions): AgentTool[];
/** Runs one agent tool call. `opts` must match what produced `name` via `agentTools` — an
 *  unexposed view/RPC for these opts is rejected the same as an unknown one. Model output is
 *  untrusted: every input is validated at this boundary before it reaches the database. */
export declare function runTool(client: DataClient, name: string, input: unknown, opts?: AgentToolsOptions): Promise<unknown>;
