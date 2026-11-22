package com.novelle;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/** Starts the full context against the database and Redis configured in novelle/.env (jobs off, see TestProperties). */
@SpringBootTest(properties = {TestProperties.JOBS_OFF, TestProperties.VIEWS_PREFIX})
class NovelleApplicationTests {

    @Test
    void contextLoads() {
    }
}
