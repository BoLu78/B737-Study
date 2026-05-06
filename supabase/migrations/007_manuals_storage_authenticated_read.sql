update storage.buckets
set public = false
where id = 'manuals';

drop policy if exists "Authenticated users can read manuals"
  on storage.objects;

create policy "Authenticated users can read manuals"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'manuals');
