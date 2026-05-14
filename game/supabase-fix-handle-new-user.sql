CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NEW.raw_user_meta_data ->> 'username' IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.profiles (user_id, username)
    VALUES (NEW.id, NEW.raw_user_meta_data ->> 'username');

    RETURN NEW;
END;
$$;
