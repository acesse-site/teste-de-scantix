# Scantix — Setup Guide

## 1. Criar projeto no Supabase

Acesse https://supabase.com → New Project → crie seu projeto gratuito.

## 2. Preencher credenciais

Abra `js/config.js` e preencha:
- `SUPABASE_URL` — encontre em: Project Settings → API → Project URL
- `SUPABASE_ANON_KEY` — encontre em: Project Settings → API → anon public

## 3. Criar as tabelas no Supabase

Vá em **SQL Editor** e execute o SQL abaixo:

```sql
-- PRODUCTS
create table products (
  id uuid default gen_random_uuid() primary key,
  ean text not null,
  name text not null,
  brand text,
  image_url text,
  price numeric,
  source text default 'manual',
  user_id uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- PURCHASES
create table purchases (
  id uuid default gen_random_uuid() primary key,
  product_id uuid,
  product_ean text not null,
  product_name text not null,
  product_brand text,
  product_image_url text,
  price_paid numeric not null,
  quantity integer default 1,
  purchase_date date not null,
  store_name text,
  session_id text,
  last_price numeric,
  user_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- STOCK
create table stock (
  id uuid default gen_random_uuid() primary key,
  product_ean text not null,
  product_name text not null,
  product_brand text,
  product_image_url text,
  quantity integer default 0,
  last_exit_date date,
  last_exit_quantity integer,
  user_id uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS (Row Level Security) — cada usuário vê só seus dados
alter table products enable row level security;
alter table purchases enable row level security;
alter table stock enable row level security;

create policy "Users see own products" on products for all using (auth.uid() = user_id);
create policy "Users see own purchases" on purchases for all using (auth.uid() = user_id);
create policy "Users see own stock" on stock for all using (auth.uid() = user_id);
```

## 4. Ativar Google OAuth (opcional)

Vá em **Authentication → Providers → Google** e ative.
Você precisará de credenciais no Google Cloud Console.

## 5. Hospedar

O projeto é 100% estático — pode hospedar em:
- **Vercel**: arraste a pasta ou conecte ao GitHub
- **Netlify**: arrastar pasta no dashboard
- **GitHub Pages**: push no repositório
- **Servidor próprio**: qualquer servidor web nginx/apache

## 6. Estrutura do projeto

```
scantix/
├── index.html
├── css/
│   └── style.css
└── js/
    ├── config.js      ← suas credenciais
    ├── supabase.js
    ├── cart.js
    ├── lookup.js
    ├── auth.js
    ├── scanner.js
    ├── cart-page.js
    ├── stock.js
    ├── purchases.js
    ├── analysis.js
    ├── products.js
    └── app.js
```
