
-- Dead schema cleanup: confirmed via repeated repo-wide grep (across
-- src/**, supabase/functions/**, and this migrations directory) that these
-- three tables have zero code references anywhere — nothing ever reads or
-- writes them. Dropping rather than leaving them to accumulate confusion.
DROP TABLE IF EXISTS public.abuse_checklist_progress;
DROP TABLE IF EXISTS public.device_links;
DROP TABLE IF EXISTS public.vpn_downtime_events;
