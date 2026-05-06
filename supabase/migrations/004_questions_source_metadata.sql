alter table public.questions
  add column if not exists source_id integer;

alter table public.questions
  add column if not exists source_revision text;

alter table public.questions
  add column if not exists source_page integer;

alter table public.questions
  add column if not exists import_batch text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_source_document_revision_id_key'
      and conrelid = 'public.questions'::regclass
  ) then
    alter table public.questions
      add constraint questions_source_document_revision_id_key
      unique (source_document, source_revision, source_id);
  end if;
end $$;
