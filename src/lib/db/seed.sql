-- gen connect ... seed data on the shared LUNARI substrate
-- ~30 companies + 1000 contacts for the demo user, front-loaded into cold.
-- this is data, not schema ... run it through the supabase execute_sql tool
-- against the gen connect tables on fpposmirumtbocqtxued.
--
-- prerequisite: the demo user must already exist in auth.users. sign in once
-- through the magic link, then run this file. re-running is safe ... it
-- clears the prior seed first.

do $$
declare
  -- the login email this seed belongs to. change it if you sign in as
  -- someone else.
  demo_email    text := 'xnuonux@gmail.com';
  demo_user     uuid;

  first_names   text[] := array[
    'marisol','ari','luca','yuki','sam','dom','priya','theo','nadia','marcus',
    'elena','kai','sofia','ravi','mira','julian','hana','omar','lena','felix',
    'anika','diego','nora','simon','tara'
  ];
  last_names    text[] := array[
    'chen','okafor','rinaldi','tanaka','delacroix','vance','kapoor','mensah',
    'ellison','ortega','novak','bauer','costa','iyer','holt','reyes','falk',
    'nakamura','abboud','lindqvist','serrano','dubois','walsh','petrov','mcbride'
  ];
  titles        text[] := array[
    'head of growth','founder','ceo','head of marketing','vp sales',
    'content lead','partnerships','gtm lead','head of product',
    'operations lead','brand director','demand gen','revenue lead',
    'community lead','head of bd'
  ];
  company_names text[] := array[
    'fieldnotes','harbor & co','northbound studio','small forge','rivermouth',
    'lantern labs','quietband','cedar','tideway','brightseed','paper kite',
    'mossy','overstory','ninefold','saltbox','driftwood','keel','emberline',
    'halfmoon','truss','wayfarer','lowtide','anchorpoint','graydon','brassroot',
    'clearfield','dovetail forge','nightshift','opencircuit','wildcard'
  ];
  domains       text[] := array[
    'fieldnotes.io','harborand.co','northbound.studio','smallforge.dev',
    'rivermouth.xyz','lanternlabs.io','quietband.fm','cedar.so','tideway.app',
    'brightseed.co','paperkite.studio','mossy.io','overstory.app','ninefold.dev',
    'saltbox.co','driftwood.studio','keel.so','emberline.io','halfmoon.app',
    'truss.build','wayfarer.co','lowtide.xyz','anchorpoint.io','graydon.co',
    'brassroot.dev','clearfield.app','dovetailforge.com','nightshift.studio',
    'opencircuit.io','wildcard.so'
  ];
  industries    text[] := array[
    'fintech','creator tools','dev tools','b2b saas','e-commerce','media',
    'healthtech','climate','marketplaces','agency'
  ];
  sizes         text[] := array['1-10','11-50','51-200','201-500'];

  company_ids   uuid[] := array[]::uuid[];
  new_company   uuid;
  n_companies   int;
  i             int;
  roll          numeric;
  picked_stage  text;
begin
  select id into demo_user
  from auth.users
  where lower(email) = lower(demo_email)
  limit 1;

  if demo_user is null then
    raise exception
      'seed: no auth user for % yet ... sign in once via the magic link, then re-run this seed.',
      demo_email;
  end if;

  -- clear any prior seed so a re-run stays clean
  delete from public.gc_contacts
  where user_id = demo_user and source = 'seed';

  delete from public.gc_companies c
  where c.user_id = demo_user
    and not exists (
      select 1 from public.gc_contacts ct where ct.company_id = c.id
    );

  -- companies
  for i in 1 .. array_length(company_names, 1) loop
    insert into public.gc_companies (user_id, name, domain, industry, size_range)
    values (
      demo_user,
      company_names[i],
      domains[i],
      industries[1 + (i % array_length(industries, 1))],
      sizes[1 + (i % array_length(sizes, 1))]
    )
    returning id into new_company;
    company_ids := company_ids || new_company;
  end loop;

  n_companies := array_length(company_ids, 1);

  -- contacts ... 1000, weighted toward cold
  for i in 1 .. 1000 loop
    roll := random();
    picked_stage := case
      when roll < 0.62  then 'cold'
      when roll < 0.80  then 'enriched'
      when roll < 0.90  then 'drafted'
      when roll < 0.955 then 'sequenced'
      when roll < 0.985 then 'replied'
      when roll < 0.997 then 'booked'
      else                   'closed'
    end;

    insert into public.gc_contacts (
      user_id, company_id, name, email, title, stage,
      ai_score, warmth_score, source, last_action_at, created_at
    )
    values (
      demo_user,
      company_ids[1 + (i % n_companies)],
      first_names[1 + (i % array_length(first_names, 1))]
        || ' '
        || last_names[1 + ((i * 7) % array_length(last_names, 1))],
      'lead' || i || '@' || domains[1 + (i % array_length(domains, 1))],
      titles[1 + (i % array_length(titles, 1))],
      picked_stage,
      round((random() * 10)::numeric, 1),
      round((random() * 10)::numeric, 1),
      'seed',
      case
        when picked_stage = 'cold' then null
        else now() - ((floor(random() * 30))::int || ' days')::interval
      end,
      now() - ((floor(random() * 60))::int || ' days')::interval
    );
  end loop;

  raise notice 'seed: % gc_companies + 1000 gc_contacts for %', n_companies, demo_email;
end $$;
