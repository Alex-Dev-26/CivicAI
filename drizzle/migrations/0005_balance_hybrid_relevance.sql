CREATE OR REPLACE FUNCTION public.hybrid_search_documents(query text, query_embedding extensions.vector(768) DEFAULT NULL, match_count integer DEFAULT 6)
RETURNS TABLE(id uuid,title text,category text,source_name text,source_url text,content text,rank double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,extensions AS $$
WITH words AS (SELECT DISTINCT left(w,5) w FROM regexp_split_to_table(lower(query),'[^а-яѓќѕљњџјa-z0-9]+') w WHERE length(w)>=3 AND w NOT IN ('како','што','треба','можам','дали','имам','сакам','каде','кои','кој','добијам','извадам','документ','документи','потребни')),
q AS (SELECT to_tsquery('simple',string_agg(w || ':*',' | ')) tsq FROM words),
lexical AS (SELECT d.id,row_number() OVER (ORDER BY ts_rank(d.search_vector,q.tsq) DESC,d.id) pos FROM public.documents d CROSS JOIN q WHERE d.is_active AND q.tsq IS NOT NULL AND d.search_vector @@ q.tsq ORDER BY ts_rank(d.search_vector,q.tsq) DESC,d.id LIMIT 20),
semantic AS (SELECT d.id,row_number() OVER (ORDER BY d.embedding <=> query_embedding,d.id) pos FROM public.documents d WHERE d.is_active AND query_embedding IS NOT NULL AND d.embedding IS NOT NULL AND d.embedding_model='google/gemini-embedding-2' AND 1-(d.embedding <=> query_embedding)>=0.45 ORDER BY d.embedding <=> query_embedding,d.id LIMIT 20),
fused AS (SELECT COALESCE(l.id,s.id) id,COALESCE(0.2/(10+l.pos),0)+COALESCE(0.8/(10+s.pos),0) score FROM lexical l FULL OUTER JOIN semantic s ON l.id=s.id)
SELECT d.id,d.title,d.category,d.source_name,d.source_url,d.content,f.score::double precision FROM fused f JOIN public.documents d ON d.id=f.id ORDER BY f.score DESC,d.id LIMIT LEAST(GREATEST(match_count,1),10);
$$;