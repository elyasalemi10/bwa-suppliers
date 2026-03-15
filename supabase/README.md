# Supabase Setup

## How to run the migration

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Paste the contents of `migrations/001_initial_schema.sql`
4. Click **Run**

This creates all 4 tables with their indexes and constraints.

## Tables

| Table | Purpose |
|-------|---------|
| `suppliers` | Supplier configurations including column mapping, GST settings, discount, and markup rules |
| `gst_exemption_keywords` | Keywords that mark specific products as GST-exempt when found in a mapped column |
| `processing_history` | Log of every file processing run, with links to original and processed files in R2 |
| `product_index` | Searchable index of every product from every processing run, enabling cross-supplier search and price history |

## Environment variables

Add these to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
USERNAME=bwa
PASSWORD=bwa123
AUTH_SECRET=<64-char hex string>
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 access key>
R2_SECRET_ACCESS_KEY=<r2 secret key>
R2_BUCKET_NAME=bwa-price-sheets
R2_PUBLIC_URL=<r2 public bucket url>
```

You can find your Supabase URL and anon key in **Project Settings > API** in the Supabase dashboard.
