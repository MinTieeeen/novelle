package com.novelle.infrastructure.cache;

/** The only place that builds {@code lock:*} key names (data-dictionary section 8). */
public final class LockKeys {

    /** Prefix shared by every lock (used by tests to clean up). */
    public static final String PREFIX = "lock:";

    private LockKeys() {
    }

    /** Held while one administrator approves or rejects the request. */
    public static String authorRequest(int requestId) {
        return PREFIX + "author-request:" + requestId;
    }
}
