package com.novelle.config;

import java.util.List;

import com.novelle.exception.ApiErrorWriter;
import com.novelle.infrastructure.security.JsonAccessDeniedHandler;
import com.novelle.infrastructure.security.JsonAuthEntryPoint;
import com.novelle.infrastructure.security.SessionAuthenticator;
import com.novelle.infrastructure.security.UserStatusFilter;
import com.novelle.mapper.AuthMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.DelegatingSecurityContextRepository;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

/**
 * Session-cookie security for the SPA: the session lives in Redis (Spring Session), CSRF uses the
 * XSRF-TOKEN cookie + X-XSRF-TOKEN header. There is no login filter: AuthService checks the password and
 * stores the authentication through {@link #securityContextRepository()}. Errors are ApiError JSON.
 * UserStatusFilter runs right after CorsFilter (the context is already loaded), so bans and role changes apply
 * on the next request and its 403 still has CORS headers.
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityContextRepository securityContextRepository,
            JsonAuthEntryPoint authEntryPoint, JsonAccessDeniedHandler accessDeniedHandler,
            AuthMapper authMapper, SessionAuthenticator sessionAuthenticator, ApiErrorWriter errorWriter)
            throws Exception {
        http
            // after CorsFilter (which runs after SecurityContextHolderFilter), so the 403 ACCOUNT_BANNED of a
            // cross-origin request still carries the CORS headers; still before CsrfFilter and the URL rules
            .addFilterAfter(new UserStatusFilter(authMapper, sessionAuthenticator, errorWriter),
                    CorsFilter.class)
            .cors(cors -> {})
            .csrf(csrf -> csrf
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
            .securityContext(context -> context.securityContextRepository(securityContextRepository))
            .formLogin(form -> form.disable())
            .httpBasic(basic -> basic.disable())
            .logout(logout -> logout
                .logoutUrl("/api/auth/logout")                       // POST + CSRF header
                .invalidateHttpSession(true)
                .deleteCookies("SESSION")
                .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(authEntryPoint)
                .accessDeniedHandler(accessDeniedHandler))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/error").permitAll()
                .requestMatchers("/actuator/health", "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/studio/**").hasRole("AUTHOR")
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                // personal state under otherwise public GET paths (M4): must come before the permitAll below
                .requestMatchers(HttpMethod.GET, "/api/stories/*/ratings/me", "/api/stories/*/follow",
                        "/api/authors/*/follow").authenticated()
                // /api/reading-lists/* is public: the service shows public lists to anyone, private ones to the owner
                .requestMatchers(HttpMethod.GET, "/api/home", "/api/stories/**", "/api/authors/**",
                        "/api/chapters/**", "/api/genres/**", "/api/tags/**", "/api/users/**",
                        "/api/reading-lists/*").permitAll()
                .anyRequest().authenticated());
        return http.build();
    }

    /** Where the SecurityContext lives between requests: the HTTP session (Redis), plus the request for this one. */
    @Bean
    SecurityContextRepository securityContextRepository() {
        return new DelegatingSecurityContextRepository(
                new RequestAttributeSecurityContextRepository(),
                new HttpSessionSecurityContextRepository());
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(CorsProperties props) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(props.allowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("Retry-After"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
