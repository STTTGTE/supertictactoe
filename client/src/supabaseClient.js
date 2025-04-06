import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://ldlbzfywavspddjpecfa.supabase.co';
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkbGJ6Znl3YXZzcGRkanBlY2ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NTY2NTAsImV4cCI6MjA1OTQzMjY1MH0.HIxZPwrzR-IfzZjMj26FZB1HLwwG5WSmqT3qKTmzqAo';

export const supabase = createClient(supabaseUrl, supabaseKey); 