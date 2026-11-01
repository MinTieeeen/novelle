package com.novelle.config;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code app.cors.*}: origins of the React SPA allowed to call the API with the session cookie. */
@ConfigurationProperties(prefix = "app.cors")
public record CorsProperties(List<String> allowedOrigins) {
}
