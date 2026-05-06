-- Manual catalog seed. Execute manually in Supabase SQL Editor after verifying storage paths.

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
on conflict (storage_bucket, storage_path) where storage_path is not null
do update set
  title = excluded.title,
  code = excluded.code,
  aircraft = excluded.aircraft,
  manual_type = excluded.manual_type,
  revision = excluded.revision,
  status = excluded.status,
  updated_at = now();
