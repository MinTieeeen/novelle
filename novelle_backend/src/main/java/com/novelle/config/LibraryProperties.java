package com.novelle.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code app.library.*}: limits of the personal library (F5, docs/module-library.md D6).
 *
 * @param maxLists reading lists one user may own (env {@code READING_LIST_MAX_LISTS})
 * @param maxItems stories one reading list may hold (env {@code READING_LIST_MAX_ITEMS})
 */
@ConfigurationProperties(prefix = "app.library")
public record LibraryProperties(int maxLists, int maxItems) {
}
