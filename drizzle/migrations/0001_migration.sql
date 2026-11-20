create policy "staff read documents" on storage.objects for select to authenticated
using (bucket_id = 'documents' and public.has_role(auth.uid(),'staff'));