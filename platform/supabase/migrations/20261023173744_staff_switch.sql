-- Staff workspace switcher: the hub's dropdown reads and moves the caller's own data.staff row.
--
-- Both functions go by auth.uid() (a staff token may point at any workspace) and never insert, so no
-- authenticated path can create a staff user. A caller with no staff row sees [] and cannot switch.
-- Excluded from the list and refused as targets: the reviewer tenants and pjg (a real owner's data).
-- The literal appears in both functions; keep them in step.

create function api.staff_workspaces() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'current', c.id = s.client_id)
                            order by c.name, c.slug), '[]'::jsonb)
    from data.staff s
    join data.clients c on c.status = 'active' and c.slug <> all (array['shopify-review', 'meta-review', 'pjg'])
   where s.user_id = auth.uid() $$;
revoke all on function api.staff_workspaces() from public, anon, service_role;
grant execute on function api.staff_workspaces() to authenticated;

create function api.staff_switch_client(p_slug text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_client uuid;
begin
  if not exists (select 1 from data.staff where user_id = auth.uid()) then
    raise exception using errcode = 'BCNS2', message = 'forbidden_role';
  end if;
  select c.id into v_client from data.clients c
   where c.slug = p_slug and c.status = 'active' and c.slug <> all (array['shopify-review', 'meta-review', 'pjg']);
  if v_client is null then
    raise exception using errcode = 'BCNS4', message = 'not_found', detail = 'slug';
  end if;
  update data.staff set client_id = v_client where user_id = auth.uid();
end $$;
revoke all on function api.staff_switch_client(text) from public, anon, service_role;
grant execute on function api.staff_switch_client(text) to authenticated;
