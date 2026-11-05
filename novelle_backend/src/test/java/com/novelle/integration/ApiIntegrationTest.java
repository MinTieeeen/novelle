package com.novelle.integration;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;

/**
 * End-to-end tests through the full filter chain (Spring Session, CSRF, UserStatusFilter, rate limit)
 * against the real SQL Server (RDS) and Redis from novelle/.env.
 *
 * Every test runs in a transaction that is rolled back, and MockMvc runs the request on the test thread,
 * so all SQL writes (registrations, profile edits, fixture updates) disappear afterwards: the shared RDS
 * database is left unchanged (only IDENTITY values are consumed). Redis keys created by a test (sessions,
 * rate-limit counters of its private client IP) are deleted after it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
abstract class ApiIntegrationTest {

    /** Password given to fixture users inside the test transaction. */
    protected static final String PASSWORD = "It-Passw0rd!";

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";

    @Autowired protected MockMvc mvc;
    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected PasswordEncoder passwordEncoder;
    @Autowired protected StringRedisTemplate redis;
    @Autowired protected ObjectMapper objectMapper;
    @Autowired private SqlSessionTemplate sqlSession;

    private final List<Client> clients = new ArrayList<>();
    private String fixtureHash;

    @AfterEach
    void cleanRedis() {
        for (Client c : clients) {
            Set<String> keys = redis.keys("rl:*:" + c.ip);
            if (keys != null && !keys.isEmpty()) {
                redis.delete(keys);
            }
            c.sessionIds.forEach(id -> redis.delete(sessionKey(id)));
        }
    }

    /* ---------- fixtures (SQL in the test transaction, rolled back) ---------- */

    protected static String uniqueUsername() {
        StringBuilder sb = new StringBuilder("it_");
        for (int i = 0; i < 12; i++) {
            sb.append(ALNUM.charAt(RANDOM.nextInt(ALNUM.length())));
        }
        return sb.toString();
    }

    protected static Map<String, Object> registration(String username) {
        return Map.of("username", username, "email", username + "@it.novelle.test",
                "password", PASSWORD, "displayName", "IT " + username);
    }

    /** Registers a new READER through the API; the client is logged in afterwards. */
    protected String registerReader(Client client) throws Exception {
        String username = uniqueUsername();
        client.csrf().post("/api/auth/register", registration(username)).andExpect(status().isCreated());
        return username;
    }

    /**
     * Runs a fixture UPDATE in the test transaction. The whole test shares one MyBatis SqlSession, whose local
     * cache would otherwise keep returning rows read before the change (each real request has its own session).
     */
    protected int sql(String statement, Object... args) {
        int rows = jdbc.update(statement, args);
        sqlSession.clearCache();
        return rows;
    }

    /** Sets the password of an existing (seeded) user to {@link #PASSWORD}. */
    protected String withKnownPassword(String username) {
        if (fixtureHash == null) {
            fixtureHash = passwordEncoder.encode(PASSWORD);
        }
        sql("UPDATE dbo.[User] SET PasswordHash = ? WHERE Username = ?", fixtureHash, username);
        return username;
    }

    protected String seededActiveAuthor() {
        return jdbc.queryForObject("""
                SELECT TOP (1) u.Username FROM dbo.[User] u JOIN dbo.Author a ON a.UserId = u.UserId
                WHERE u.Status = 'ACTIVE' ORDER BY u.UserId""", String.class);
    }

    protected String seededBannedUser() {
        return jdbc.queryForObject("""
                SELECT TOP (1) Username FROM dbo.[User]
                WHERE Status = 'BANNED' AND BanReason IS NOT NULL ORDER BY UserId""", String.class);
    }

    protected Client newClient() {
        Client c = new Client("198.18." + RANDOM.nextInt(256) + "." + (1 + RANDOM.nextInt(254)));
        clients.add(c);
        return c;
    }

    protected JsonNode json(ResultActions actions) throws Exception {
        return objectMapper.readTree(actions.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    protected static String sessionKey(String sessionId) {
        return "spring:session:sessions:" + sessionId;
    }

    /** A browser: keeps the SESSION and XSRF-TOKEN cookies and sends the CSRF header on writes. */
    protected final class Client {

        final String ip;
        String session;
        String xsrf;
        final Set<String> sessionIds = new LinkedHashSet<>();

        Client(String ip) {
            this.ip = ip;
        }

        Client csrf() throws Exception {
            get("/api/auth/csrf").andExpect(status().isOk());
            return this;
        }

        ResultActions get(String url) throws Exception {
            return send(MockMvcRequestBuilders.get(url), true);
        }

        ResultActions post(String url, Object body) throws Exception {
            return send(withBody(MockMvcRequestBuilders.post(url), body), true);
        }

        ResultActions postWithoutCsrf(String url, Object body) throws Exception {
            return send(withBody(MockMvcRequestBuilders.post(url), body), false);
        }

        ResultActions patch(String url, Object body) throws Exception {
            return send(withBody(MockMvcRequestBuilders.patch(url), body), true);
        }

        ResultActions patchWithoutCsrf(String url, Object body) throws Exception {
            return send(withBody(MockMvcRequestBuilders.patch(url), body), false);
        }

        ResultActions put(String url, Object body) throws Exception {
            return send(withBody(MockMvcRequestBuilders.put(url), body), true);
        }

        /** Any request built by the test (extra headers, query params) with this client's cookies, IP and CSRF header. */
        ResultActions perform(MockHttpServletRequestBuilder builder) throws Exception {
            return send(builder, true);
        }

        /** The Spring Session id behind the SESSION cookie (the cookie value is Base64). */
        String sessionId() {
            return session == null ? null : new String(Base64.getDecoder().decode(session), StandardCharsets.UTF_8);
        }

        private MockHttpServletRequestBuilder withBody(MockHttpServletRequestBuilder builder, Object body)
                throws Exception {
            if (body == null) {
                return builder;
            }
            String content = body instanceof String s ? s : objectMapper.writeValueAsString(body);
            return builder.contentType(MediaType.APPLICATION_JSON).content(content);
        }

        private ResultActions send(MockHttpServletRequestBuilder builder, boolean csrfHeader) throws Exception {
            builder.with(request -> {
                request.setRemoteAddr(ip);
                return request;
            });
            List<Cookie> cookies = new ArrayList<>();
            if (session != null) {
                cookies.add(new Cookie("SESSION", session));
            }
            if (xsrf != null) {
                cookies.add(new Cookie("XSRF-TOKEN", xsrf));
                if (csrfHeader) {
                    builder.header("X-XSRF-TOKEN", xsrf);
                }
            }
            if (!cookies.isEmpty()) {
                builder.cookie(cookies.toArray(Cookie[]::new));
            }

            ResultActions actions = mvc.perform(builder);
            MvcResult result = actions.andReturn();
            MockHttpServletResponse response = result.getResponse();
            for (Cookie cookie : response.getCookies()) {
                boolean cleared = cookie.getMaxAge() == 0 || cookie.getValue() == null || cookie.getValue().isEmpty();
                if ("SESSION".equals(cookie.getName())) {
                    session = cleared ? null : cookie.getValue();
                    if (session != null) {
                        sessionIds.add(sessionId());
                    }
                } else if ("XSRF-TOKEN".equals(cookie.getName())) {
                    xsrf = cleared ? null : cookie.getValue();
                }
            }
            return actions;
        }
    }
}
