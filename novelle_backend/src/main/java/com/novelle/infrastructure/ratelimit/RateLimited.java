package com.novelle.infrastructure.ratelimit;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Limits how often a controller method (or every method of a controller) may be called.
 * The limit itself is configured under {@code app.rate-limit.limits.<value>}; the Redis counter is
 * {@code rl:<value>:<ip or userId>} (data-dictionary section 8), for example {@code rl:login:203.0.113.7}.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RateLimited {

    /** Name of the limit in {@code app.rate-limit.limits}, also the middle part of the Redis key. */
    String value();

    /** Who the counter belongs to. */
    Scope scope() default Scope.IP;

    enum Scope {
        /** One counter per client IP (login, register: the caller is anonymous). */
        IP,
        /** One counter per logged-in user; falls back to the IP for anonymous requests. */
        USER
    }
}
