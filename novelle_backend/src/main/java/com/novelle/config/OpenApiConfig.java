package com.novelle.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI novelleOpenApi() {
        return new OpenAPI().info(new Info()
                .title("Novelle API")
                .version("v1")
                .description("Reading and writing serialized stories (SQL Server + Redis)"));
    }
}
