package com.novelle.infrastructure.ratelimit;

import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Applies {@link RateLimited} before the controller method runs. Over the limit it sets
 * {@code Retry-After} and throws {@link ApiException} RATE_LIMITED, which GlobalExceptionHandler turns
 * into a 429.
 */
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final RateLimitService rateLimitService;
    private final RateLimitProperties properties;
    private final CurrentUser currentUser;

    public RateLimitInterceptor(RateLimitService rateLimitService, RateLimitProperties properties,
            CurrentUser currentUser) {
        this.rateLimitService = rateLimitService;
        this.properties = properties;
        this.currentUser = currentUser;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!properties.enabled() || !(handler instanceof HandlerMethod method)) {
            return true;
        }
        RateLimited annotation = findAnnotation(method);
        if (annotation == null) {
            return true;
        }
        RateLimitProperties.Limit limit = properties.limits().get(annotation.value());
        if (limit == null) {
            throw new IllegalStateException("No app.rate-limit.limits." + annotation.value() + " configured");
        }

        String key = "rl:" + annotation.value() + ":" + subject(annotation.scope(), request);
        RateLimitService.Decision decision = rateLimitService.hit(key, limit);
        if (!decision.allowed()) {
            long seconds = Math.max(1, (decision.retryAfter().toMillis() + 999) / 1000);
            response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(seconds));
            throw new ApiException(ErrorCode.RATE_LIMITED, ErrorCode.RATE_LIMITED.defaultMessage(),
                    new RetryInfo(seconds));
        }
        return true;
    }

    private static RateLimited findAnnotation(HandlerMethod method) {
        RateLimited onMethod = AnnotatedElementUtils.findMergedAnnotation(method.getMethod(), RateLimited.class);
        return onMethod != null
                ? onMethod
                : AnnotatedElementUtils.findMergedAnnotation(method.getBeanType(), RateLimited.class);
    }

    /*
     * The IP is the socket address. X-Forwarded-For is ignored on purpose: the API is not behind a proxy,
     * and trusting a client-supplied header would let anyone pick a fresh counter on every request.
     */
    private String subject(RateLimited.Scope scope, HttpServletRequest request) {
        if (scope == RateLimited.Scope.USER) {
            return currentUser.find()
                    .map(user -> "u" + user.userId())
                    .orElseGet(request::getRemoteAddr);
        }
        return request.getRemoteAddr();
    }

    /** {@code details} of a 429 response. */
    public record RetryInfo(long retryAfterSeconds) {
    }
}
