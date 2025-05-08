// src/environments/environment.prod.ts
declare const process: any; // Add this to avoid TypeScript errors

export const environment = {
  production: true,
  // Use process.env variables for production
  supabaseUrl: process.env['SUPABASE_DATABASE_URL'],
  supabaseKey: process.env['SUPABASE_ANON_KEY'],
  supabaseServiceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'],
  supabaseJwtSecret: process.env['SUPABASE_JWT_SECRET']
};
