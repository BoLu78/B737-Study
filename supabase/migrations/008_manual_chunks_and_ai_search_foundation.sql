create table if not exists public.manual_chunks (
  id bigserial primary key,
  manual_document_id bigint references public.manual_documents(id) on delete cascade,
  manual_code text,
  aircraft text,
  manual_type text,
  title text,
  storage_bucket text,
  storage_path text,
  page_number integer,
  chunk_index integer not null default 0,
  chunk_text text not null,
  token_estimate integer,
  source_hash text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manual_chunks_status_check
    check (status in ('active', 'draft', 'obsolete')),
  constraint manual_chunks_document_page_chunk_key
    unique (manual_document_id, page_number, chunk_index)
);

create index if not exists manual_chunks_manual_document_id_idx
  on public.manual_chunks (manual_document_id);

create index if not exists manual_chunks_manual_code_idx
  on public.manual_chunks (manual_code);

create index if not exists manual_chunks_manual_type_idx
  on public.manual_chunks (manual_type);

create index if not exists manual_chunks_aircraft_idx
  on public.manual_chunks (aircraft);

create index if not exists manual_chunks_page_number_idx
  on public.manual_chunks (page_number);

create index if not exists manual_chunks_status_idx
  on public.manual_chunks (status);

create index if not exists manual_chunks_chunk_text_fts_idx
  on public.manual_chunks
  using gin (to_tsvector('english', chunk_text));

alter table public.manual_chunks enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'manual_chunks'
      and policyname = 'Active manual chunks are readable'
  ) then
    create policy "Active manual chunks are readable"
      on public.manual_chunks
      for select
      using (status = 'active');
  end if;
end $$;

create table if not exists public.manual_ai_queries (
  id bigserial primary key,
  question_id bigint references public.questions(id) on delete set null,
  user_query text not null,
  topic text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

alter table public.manual_ai_queries enable row level security;
