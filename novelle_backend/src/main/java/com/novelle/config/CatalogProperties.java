package com.novelle.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code app.catalog.*}: settings of the public catalog (F1).
 *
 * @param homeSize           stories per block on the home page (env {@code CATALOG_HOME_SIZE})
 * @param topRatedMinRatings ratings a story needs to enter the "top rated" block, so one 5-star vote is not
 *                           enough (env {@code CATALOG_TOP_RATED_MIN_RATINGS})
 */
@ConfigurationProperties(prefix = "app.catalog")
public record CatalogProperties(int homeSize, int topRatedMinRatings) {
}
