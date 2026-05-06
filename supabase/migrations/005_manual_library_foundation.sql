create table if not exists public.manual_documents (
  id bigserial primary key,
  title text not null,
  code text,
  aircraft text default 'B737',
  manual_type text not null default 'manual',
  revision text,
  effective_date date,
  storage_bucket text,
  storage_path text,
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manual_documents_status_check
    check (status in ('draft', 'active', 'archived')),
  constraint manual_documents_manual_type_check
    check (manual_type in ('FCOM', 'FCTM', 'QRH', 'OM-A', 'OM-B', 'CBT', 'Training', 'T73', 'Other', 'manual'))
);

create table if not exists public.question_manual_links (
  id bigserial primary key,
  question_id bigint references public.questions(id) on delete cascade,
  source_document text,
  source_revision text,
  source_id integer,
  manual_document_id bigint references public.manual_documents(id) on delete set null,
  manual_code text,
  chapter text,
  section text,
  page integer,
  reference_note text,
  confidence text not null default 'manual',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_manual_links_confidence_check
    check (confidence in ('manual', 'imported', 'ai_suggested', 'verified')),
  constraint question_manual_links_status_check
    check (status in ('draft', 'active', 'to_verify', 'obsolete'))
);

create index if not exists manual_documents_status_idx
  on public.manual_documents (status);

create index if not exists manual_documents_manual_type_idx
  on public.manual_documents (manual_type);

create index if not exists question_manual_links_question_id_idx
  on public.question_manual_links (question_id);

create index if not exists question_manual_links_source_lookup_idx
  on public.question_manual_links (source_document, source_revision, source_id);

create index if not exists question_manual_links_manual_code_idx
  on public.question_manual_links (manual_code);

create index if not exists question_manual_links_status_idx
  on public.question_manual_links (status);

alter table public.manual_documents enable row level security;
alter table public.question_manual_links enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'manual_documents'
      and policyname = 'Active manual documents are readable'
  ) then
    create policy "Active manual documents are readable"
      on public.manual_documents
      for select
      using (status = 'active');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'question_manual_links'
      and policyname = 'Active question manual links are readable'
  ) then
    create policy "Active question manual links are readable"
      on public.question_manual_links
      for select
      using (status = 'active');
  end if;
end $$;
