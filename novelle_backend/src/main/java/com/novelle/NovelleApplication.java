package com.novelle;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/** Scheduling is enabled by {@link com.novelle.config.SchedulingConfig} only when {@code app.jobs.enabled}. */
@SpringBootApplication
@ConfigurationPropertiesScan
public class NovelleApplication {

    public static void main(String[] args) {
        SpringApplication.run(NovelleApplication.class, args);
    }
}
