-- Supabase SQL Schema for WhatsApp Automation

-- 1. Create a table for Leads
CREATE TABLE public.leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    phone_number TEXT UNIQUE NOT NULL,
    name TEXT,
    industry TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create a table for Messages
CREATE TABLE public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    content TEXT,
    media_url TEXT,
    message_type TEXT DEFAULT 'text', -- 'text', 'image', 'document', 'audio'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Set up Row Level Security (RLS) so your dashboard can read it securely
-- (For simplicity in this MVP, we will enable read/write for authenticated users, 
-- or you can disable RLS if your API key is kept secure on the backend).

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Create policy for full access (assuming backend uses service_role key 
-- and frontend uses anon key with authenticated user)
CREATE POLICY "Enable all access for authenticated users" ON public.leads
    FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Enable all access for authenticated users" ON public.messages
    FOR ALL
    TO authenticated
    USING (true);

-- 4. Create a Storage Bucket for Portfolio Media
-- Go to Supabase Dashboard -> Storage -> Create bucket named "portfolio"
-- Make sure it is set to "Public".
