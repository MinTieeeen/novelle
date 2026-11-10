package com.novelle.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** S4: new users per Vietnam month (first day) and role; every month and role present, 0 when none. */
public record UserGrowthResponse(List<Month> months) {

    public record Month(LocalDate month, Map<String, Long> byRole, long total) {
    }
}
