-- bcns-data: Storage bucket + policies (DESIGN.md §2.5)
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = 104857600;

create policy media_read_orig on storage.objects for select to authenticated using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = (select data.active_client_id())::text
  and (storage.foldername(name))[2] = 'orig'
  and (select data.has_download_ticket(name))
);
create policy media_read_thumb on storage.objects for select to authenticated using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = (select data.active_client_id())::text
  and (storage.foldername(name))[2] = 'thumb'
);
create policy media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = (select data.active_client_id())::text
  and (storage.foldername(name))[2] = 'orig'
  and (select data.active_client_role()) in ('member','owner')
);
