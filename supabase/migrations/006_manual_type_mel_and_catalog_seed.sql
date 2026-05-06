alter table public.manual_documents
  drop constraint if exists manual_documents_manual_type_check;

alter table public.manual_documents
  add constraint manual_documents_manual_type_check
  check (manual_type in ('FCOM', 'FCTM', 'QRH', 'OM-A', 'OM-B', 'CBT', 'Training', 'T73', 'Other', 'MEL', 'manual'));

create unique index if not exists manual_documents_storage_bucket_path_uidx
  on public.manual_documents (storage_bucket, storage_path)
  where storage_path is not null;

alter table public.manual_documents enable row level security;
