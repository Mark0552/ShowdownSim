import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jdvgjiklswargnqrqiet.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdmdqaWtsc3dhcmducXJxaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzY4MTUsImV4cCI6MjA4OTk1MjgxNX0.KuJ0fxtzVaVrApur6r7D5ZW313Qdq1I8XJv70mpHhqw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
