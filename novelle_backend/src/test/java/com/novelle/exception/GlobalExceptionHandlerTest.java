package com.novelle.exception;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.SQLException;
import java.time.Duration;
import java.util.Map;

import com.novelle.infrastructure.mybatis.RowVersion;
import com.novelle.infrastructure.ratelimit.RateLimitInterceptor;
import com.novelle.infrastructure.ratelimit.RateLimitProperties;
import com.novelle.infrastructure.ratelimit.RateLimitService;
import com.novelle.infrastructure.ratelimit.RateLimited;
import com.novelle.infrastructure.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** ApiError shape for business, validation, database and MVC errors, and the 429 of the rate limiter. */
class GlobalExceptionHandlerTest {

    private RateLimitService rateLimitService;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        rateLimitService = Mockito.mock(RateLimitService.class);
        RateLimitProperties props = new RateLimitProperties(true,
                Map.of("demo", new RateLimitProperties.Limit(2, Duration.ofSeconds(60))));
        mvc = MockMvcBuilders.standaloneSetup(new DemoController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .addInterceptors(new RateLimitInterceptor(rateLimitService, props, new CurrentUser()))
                .build();
    }

    @Test
    void apiExceptionKeepsCodeAndStatus() throws Exception {
        mvc.perform(get("/demo/stale"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.code").value("STALE_DATA"));
    }

    @Test
    void invalidBodyListsFields() throws Exception {
        mvc.perform(post("/demo/body").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("name"));
    }

    @Test
    void unreadableBodyAndBadRowVersionAre400() throws Exception {
        mvc.perform(post("/demo/body").contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        mvc.perform(post("/demo/body").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"a\",\"rowVersion\":\"short\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void wrongMethodUsesApiErrorShape() throws Exception {
        mvc.perform(post("/demo/stale"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
    }

    @Test
    void storedProcedureErrorNumbersAreMapped() throws Exception {
        mvc.perform(get("/demo/sp-already-processed"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PROCESSED"))
                .andExpect(jsonPath("$.message").value("Author request was already processed."));
        mvc.perform(get("/demo/sql-other"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
        mvc.perform(get("/demo/duplicate"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
    }

    @Test
    void rateLimitedEndpointReturns429WithRetryAfter() throws Exception {
        Mockito.when(rateLimitService.hit(Mockito.eq("rl:demo:127.0.0.1"), Mockito.any()))
                .thenReturn(new RateLimitService.Decision(true, 1, Duration.ofSeconds(60)))
                .thenReturn(new RateLimitService.Decision(false, 3, Duration.ofMillis(41_200)));

        mvc.perform(get("/demo/limited")).andExpect(status().isOk());
        mvc.perform(get("/demo/limited"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "42"))
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(jsonPath("$.details.retryAfterSeconds").value(42));
    }

    @Test
    void endpointsWithoutAnnotationSkipTheLimiter() throws Exception {
        mvc.perform(get("/demo/stale"));
        Mockito.verifyNoInteractions(rateLimitService);
    }

    record DemoBody(@NotBlank @Size(max = 10) String name, RowVersion rowVersion) {
    }

    @RestController
    static class DemoController {

        @GetMapping("/demo/stale")
        void stale() {
            throw new ApiException(ErrorCode.STALE_DATA);
        }

        @PostMapping("/demo/body")
        String body(@Valid @RequestBody DemoBody body) {
            return body.name();
        }

        @GetMapping("/demo/sp-already-processed")
        void spAlreadyProcessed() {
            throw new UncategorizedSQLException("sp", "{call dbo.sp_ApproveAuthorRequest(?, ?)}",
                    new SQLException("Author request was already processed.", "S0001", 50001));
        }

        @GetMapping("/demo/sql-other")
        void sqlOther() {
            throw new UncategorizedSQLException("select", "SELECT 1", new SQLException("boom", "S0001", 208));
        }

        @GetMapping("/demo/duplicate")
        void duplicate() {
            throw new DuplicateKeyException("UQ_User_Email");
        }

        @RateLimited("demo")
        @GetMapping("/demo/limited")
        String limited() {
            return "ok";
        }
    }
}
