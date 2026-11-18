-- I5: full-text index on the topic's own copy, in the catalog the web uses (03_fulltext.sql).
-- {lcid} = 1066 (Vietnamese word breaker) when the instance has it, else 0 (neutral: split on spaces and
-- punctuation). CHANGE_TRACKING AUTO: the initial population and later changes are applied in the
-- background, not inside the writing statement. Cannot run inside a transaction.
CREATE FULLTEXT INDEX ON {table} (Title LANGUAGE {lcid}, Description LANGUAGE {lcid})
    KEY INDEX {key_index} ON ftc_Novelle
    WITH CHANGE_TRACKING AUTO;
