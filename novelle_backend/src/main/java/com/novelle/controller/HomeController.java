package com.novelle.controller;

import com.novelle.dto.HomeResponse;
import com.novelle.service.HomeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Home page (public). */
@Tag(name = "Catalog")
@RestController
public class HomeController {

    private final HomeService homeService;

    public HomeController(HomeService homeService) {
        this.homeService = homeService;
    }

    @Operation(summary = "Home page blocks: latest updated, newest, top rated, most viewed, completed (cached 2m)")
    @GetMapping("/api/home")
    public HomeResponse home() {
        return homeService.getHome();
    }
}
