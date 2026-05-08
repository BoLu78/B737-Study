-- Manual pipeline foundation v3.9.
-- Creates the private manuals bucket and upserts verified catalog rows.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'manuals',
  'manuals',
  false,
  104857600,
  array['application/pdf']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

drop policy if exists "Authenticated users can read manuals"
  on storage.objects;

create policy "Authenticated users can read manuals"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'manuals');

with seed_manual_documents (
  title,
  code,
  aircraft,
  manual_type,
  revision,
  storage_bucket,
  storage_path,
  status
) as (
  values
    (
      'B737 MAX FCOM Volume 1',
      'B737-MAX-FCOM-V1',
      'B737 MAX',
      'FCOM',
      null,
      'manuals',
      'B737/B737 MAX/B737_MAX_FCOM_V1.pdf',
      'active'
    ),
    (
      'B737 MAX FCOM Volume 2',
      'B737-MAX-FCOM-V2',
      'B737 MAX',
      'FCOM',
      null,
      'manuals',
      'B737/B737 MAX/B737_MAX_FCOM_V2.pdf',
      'active'
    ),
    (
      'B737 MAX QRH',
      'B737-MAX-QRH',
      'B737 MAX',
      'QRH',
      null,
      'manuals',
      'B737/B737 MAX/B737_MAX_QRH.pdf',
      'active'
    ),
    (
      'B737 MAX MEL',
      'B737-MAX-MEL',
      'B737 MAX',
      'MEL',
      'NTP23 R06B/R06B',
      'manuals',
      'B737/B737 MAX/B737_MAX_MEL_NTP23_R06B_R06B.pdf',
      'active'
    ),
    (
      'B737 NG FCOM Volume 1',
      'B737-NG-FCOM-V1',
      'B737 NG',
      'FCOM',
      null,
      'manuals',
      'B737/B737 NG/B737_NG_FCOM_V1.pdf',
      'active'
    ),
    (
      'B737 NG FCOM Volume 2',
      'B737-NG-FCOM-V2',
      'B737 NG',
      'FCOM',
      null,
      'manuals',
      'B737/B737 NG/B737_NG_FCOM_V2.pdf',
      'active'
    ),
    (
      'B737 NG QRH',
      'B737-NG-QRH',
      'B737 NG',
      'QRH',
      null,
      'manuals',
      'B737/B737 NG/B737_NG_QRH.pdf',
      'active'
    ),
    (
      'B737 NG MEL',
      'B737-NG-MEL',
      'B737 NG',
      'MEL',
      'R52',
      'manuals',
      'B737/B737 NG/B737_NG_MEL_R52.pdf',
      'active'
    ),
    (
      'B737 NG/MAX FCTM',
      'B737-NG-MAX-FCTM',
      'B737 NG/MAX',
      'FCTM',
      null,
      'manuals',
      'B737/FCTM/B737_NG_MAX_FCTM.pdf',
      'active'
    )
),
updated_manual_documents as (
  update public.manual_documents
  set
    title = seed_manual_documents.title,
    aircraft = seed_manual_documents.aircraft,
    manual_type = seed_manual_documents.manual_type,
    revision = seed_manual_documents.revision,
    storage_bucket = seed_manual_documents.storage_bucket,
    storage_path = seed_manual_documents.storage_path,
    status = seed_manual_documents.status,
    updated_at = now()
  from seed_manual_documents
  where public.manual_documents.code = seed_manual_documents.code
  returning public.manual_documents.code
)
insert into public.manual_documents (
  title,
  code,
  aircraft,
  manual_type,
  revision,
  storage_bucket,
  storage_path,
  status
)
select
  seed_manual_documents.title,
  seed_manual_documents.code,
  seed_manual_documents.aircraft,
  seed_manual_documents.manual_type,
  seed_manual_documents.revision,
  seed_manual_documents.storage_bucket,
  seed_manual_documents.storage_path,
  seed_manual_documents.status
from seed_manual_documents
where not exists (
  select 1
  from updated_manual_documents
  where updated_manual_documents.code = seed_manual_documents.code
)
and not exists (
  select 1
  from public.manual_documents
  where public.manual_documents.code = seed_manual_documents.code
);
