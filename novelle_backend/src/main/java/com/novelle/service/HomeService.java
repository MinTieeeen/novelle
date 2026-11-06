package com.novelle.service;

import java.util.List;

import com.novelle.config.CatalogProperties;
import com.novelle.dto.HomeResponse;
import com.novelle.dto.StoryCardResponse;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.cache.CacheTtlProperties;
import com.novelle.mapper.CatalogMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Home page (F1): five blocks loaded together and cached as one entry for a short time. */
@Service
public class HomeService {

    private final CatalogMapper catalogMapper;
    private final CacheService cache;
    private final CacheTtlProperties ttl;
    private final CatalogProperties props;

    public HomeService(CatalogMapper catalogMapper, CacheService cache, CacheTtlProperties ttl,
            CatalogProperties props) {
        this.catalogMapper = catalogMapper;
        this.cache = cache;
        this.ttl = ttl;
        this.props = props;
    }

    @Transactional(readOnly = true)
    public HomeResponse getHome() {
        return cache.getOrLoad(CacheKeys.HOME, ttl.home(), HomeResponse.class, this::loadHome);
    }

    private HomeResponse loadHome() {
        return new HomeResponse(
                block(StorySort.UPDATED, false, null),
                block(StorySort.NEWEST, false, null),
                block(StorySort.RATING, false, props.topRatedMinRatings()),
                block(StorySort.VIEWS, false, null),
                block(StorySort.UPDATED, true, null));
    }

    private List<StoryCardResponse> block(StorySort sort, boolean completedOnly, Integer minRatings) {
        return catalogMapper.findHomeBlock(sort.orderBy(), completedOnly, minRatings, props.homeSize())
                .stream().map(StoryCardResponse::from).toList();
    }
}
