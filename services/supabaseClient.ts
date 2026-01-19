import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zttmfpcaewnxnxlucoaz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0dG1mcGNhZXdueG54bHVjb2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MzcwMDksImV4cCI6MjA4NDQxMzAwOX0.4psLFFhGEg5zYvdRyi3-7DO9klgfqI7UNqp-eb6evsg';

export const supabase = createClient(supabaseUrl, supabaseKey);